# =========================================================
#  Environmental Risk Mapping & Smart Safety Zones - backend
#  Owner: Sashini Diwyangii            Port: 5051
#
#  This is the Flask version of the original Streamlit "WebServer/main.py".
#  Same logic (MQTT discovery/status/telemetry, risk engine, auto buzzer,
#  YOLO camera workers) - but instead of drawing the UI itself it exposes a
#  JSON / MJPEG API that the React page
#  (frontend/src/pages/environmental/EnvironmentalRisk.jsx) consumes.
#
#  Endpoints
#    GET  /health                       -> {"status":"ok", ...}
#    GET  /api/state                    -> everything the dashboard needs (poll ~1 s)
#    POST /api/buzzer/<device_id>       -> {"state": true|false}
#    POST /api/calibrate/<device_id>    -> set the "dry floor" moisture baseline
#    GET  /camera/<device_id>/stream    -> MJPEG stream (YOLO-annotated)
#    GET  /camera/<device_id>/snapshot  -> latest annotated JPEG
# =========================================================
import copy
import json
import os
import ssl
import threading
import time
from datetime import datetime
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# OpenCV / YOLO are optional: the dashboard still works (sensors, zones, map,
# buzzer) without them - only the camera tiles need them.
try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None

load_dotenv(Path(__file__).with_name(".env"))

# ============================================================
# CONFIGURATION
# ============================================================
MQTT_HOST = os.getenv("MQTT_HOST", "your-hivemq-host")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "your-username")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "your-password")
MQTT_ROOT_TOPIC = "eldercare/#"
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))
# NOTE: must differ from the id used by the old Streamlit app, otherwise the two
# clients keep kicking each other off the broker.
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "aegiscare-env-risk")

DEVICE_OFFLINE_TIMEOUT = float(os.getenv("DEVICE_OFFLINE_TIMEOUT", "15"))

YOLO_MODEL_PATH = os.getenv("YOLO_MODEL", "yolov8n.pt")
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.35"))
YOLO_IOU = float(os.getenv("YOLO_IOU", "0.45"))
YOLO_IMAGE_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
YOLO_DEVICE = os.getenv("YOLO_DEVICE", "").strip() or None

CAMERA_RECONNECT_SECONDS = float(os.getenv("CAMERA_RECONNECT_SECONDS", "3"))
CAMERA_TARGET_FPS = float(os.getenv("CAMERA_TARGET_FPS", "10"))

AUTO_BUZZER_ON_PCT = 30   # wetness >= 30 %  -> buzzer ON
AUTO_BUZZER_OFF_PCT = 20  # wetness <= 20 %  -> buzzer OFF

MOTION_HOLD_SECONDS = 4     # "motion" stays YES this long after the last "true"
MOTION_STALE_SECONDS = 10   # ignore a "true" that is older than this

PORT = int(os.getenv("PORT", "5051"))

# ============================================================
# APPLICATION STATE
# ============================================================
STATE_LOCK = threading.RLock()
APP_STATE = {
    "devices": {},
    "zones": {},
    "mqtt_connected": False,
    "mqtt_client": None,
    "mqtt_started": False,
    "mqtt_last_change": None,
    "mqtt_last_error": None,
    "last_message": None,
    "message_count": 0,
    "yolo_model": None,
    "yolo_loading": False,
    "yolo_error": None,
}

CAMERA_WORKERS = {}
CAMERA_WORKERS_LOCK = threading.RLock()


def iso(dt):
    return dt.isoformat(timespec="seconds") if isinstance(dt, datetime) else None


# ============================================================
# YOLO MODEL
# ============================================================
def get_yolo_model():
    if YOLO is None:
        with STATE_LOCK:
            APP_STATE["yolo_error"] = (
                "Ultralytics is not installed. Install it with: pip install ultralytics"
            )
        return None

    with STATE_LOCK:
        if APP_STATE["yolo_model"] is not None:
            return APP_STATE["yolo_model"]
        if APP_STATE["yolo_loading"]:
            return None
        APP_STATE["yolo_loading"] = True

    try:
        print(f"Loading YOLO model: {YOLO_MODEL_PATH}")
        model = YOLO(YOLO_MODEL_PATH)
        with STATE_LOCK:
            APP_STATE["yolo_model"] = model
            APP_STATE["yolo_error"] = None
            APP_STATE["yolo_loading"] = False
        print("YOLO model loaded.")
        return model
    except Exception as exc:
        with STATE_LOCK:
            APP_STATE["yolo_loading"] = False
            APP_STATE["yolo_error"] = str(exc)
        print("YOLO model loading failed:", exc)
        return None


# ============================================================
# CAMERA WORKERS  (ESP32-CAM MJPEG -> OpenCV -> YOLO -> JPEG)
# ============================================================
class CameraWorker:
    def __init__(self, device_id, stream_url):
        self.device_id = device_id
        self.stream_url = stream_url
        self.stop_event = threading.Event()
        self.reopen_event = threading.Event()
        self.thread = None
        self.lock = threading.RLock()

        self.latest_jpeg = None
        self.latest_frame_time = None
        self.latest_fps = 0.0
        self.latest_detection_count = 0
        self.last_error = None

        self.frames_seen = 0
        self.last_fps_time = time.monotonic()

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(
            target=self.run, name=f"yolo-camera-{self.device_id}", daemon=True
        )
        self.thread.start()

    def stop(self):
        self.stop_event.set()

    def update_stream_url(self, stream_url):
        if stream_url and stream_url != self.stream_url:
            self.stream_url = stream_url
            self.reopen_event.set()  # reopen capture with the new URL

    def get_snapshot(self):
        with self.lock:
            return {
                "jpeg": self.latest_jpeg,
                "frame_time": self.latest_frame_time,
                "fps": self.latest_fps,
                "detections": self.latest_detection_count,
                "error": self.last_error,
            }

    def _open_capture(self):
        cap = cv2.VideoCapture(self.stream_url)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        if not cap.isOpened():
            cap.release()
            return None
        return cap

    def _annotate(self, frame):
        model = get_yolo_model()
        if model is None:
            return frame, 0
        try:
            kwargs = {
                "source": frame,
                "conf": YOLO_CONFIDENCE,
                "iou": YOLO_IOU,
                "imgsz": YOLO_IMAGE_SIZE,
                "verbose": False,
            }
            if YOLO_DEVICE:
                kwargs["device"] = YOLO_DEVICE
            results = model.predict(**kwargs)
            if not results:
                return frame, 0
            result = results[0]
            annotated = result.plot(conf=True, labels=True, boxes=True)
            count = len(result.boxes) if result.boxes is not None else 0
            return annotated, count
        except Exception as exc:
            with STATE_LOCK:
                APP_STATE["yolo_error"] = str(exc)
            return frame, 0

    def run(self):
        frame_delay = 1.0 / CAMERA_TARGET_FPS if CAMERA_TARGET_FPS > 0 else 0

        while not self.stop_event.is_set():
            self.reopen_event.clear()
            cap = self._open_capture()

            if cap is None:
                with self.lock:
                    self.last_error = f"Unable to open stream: {self.stream_url}"
                time.sleep(CAMERA_RECONNECT_SECONDS)
                continue

            with self.lock:
                self.last_error = None

            while not self.stop_event.is_set() and not self.reopen_event.is_set():
                loop_started = time.monotonic()
                ok, frame = cap.read()
                if not ok or frame is None:
                    with self.lock:
                        self.last_error = "Camera stream read failed."
                    break

                annotated, detection_count = self._annotate(frame)
                ok_jpeg, jpeg = cv2.imencode(
                    ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
                )
                if ok_jpeg:
                    with self.lock:
                        self.latest_jpeg = jpeg.tobytes()
                        self.latest_frame_time = datetime.now()
                        self.latest_detection_count = detection_count
                        self.last_error = None

                self.frames_seen += 1
                now_mono = time.monotonic()
                elapsed = now_mono - self.last_fps_time
                if elapsed >= 1.0:
                    with self.lock:
                        self.latest_fps = self.frames_seen / elapsed
                    self.frames_seen = 0
                    self.last_fps_time = now_mono

                processing_time = time.monotonic() - loop_started
                if frame_delay > processing_time:
                    time.sleep(frame_delay - processing_time)

            cap.release()
            if not self.stop_event.is_set() and not self.reopen_event.is_set():
                time.sleep(CAMERA_RECONNECT_SECONDS)


def ensure_camera_worker(device):
    if cv2 is None:
        return
    device_id = device.get("device_id")
    stream_url = device.get("stream_url")
    if not device_id or not stream_url:
        return

    with CAMERA_WORKERS_LOCK:
        worker = CAMERA_WORKERS.get(device_id)
        if worker is None:
            worker = CameraWorker(device_id, stream_url)
            CAMERA_WORKERS[device_id] = worker
            worker.start()
        elif worker.stream_url != stream_url:
            worker.update_stream_url(stream_url)
            worker.start()


def sync_camera_workers():
    for device in get_devices_snapshot().values():
        if device.get("device_type") == "camera" and device.get("stream_url"):
            ensure_camera_worker(device)


# ============================================================
# DEVICES / ZONES
# ============================================================
def create_device(device_id, device_type="unknown"):
    return {
        "device_id": device_id,
        "device_type": device_type,
        "zone_id": None,
        "ip": None,
        "mac": None,
        "rssi": None,
        "status": "OFFLINE",
        "last_seen": None,
        "sensors": {},
        "available_sensors": [],
        "actuators": [],
        "buzzer": False,
        "stream_url": None,
        "snapshot_url": None,
    }


def get_device(device_id, device_type="unknown"):
    with STATE_LOCK:
        devices = APP_STATE["devices"]
        if device_id not in devices:
            devices[device_id] = create_device(device_id, device_type)
        device = devices[device_id]
        if device.get("device_type") == "unknown" and device_type != "unknown":
            device["device_type"] = device_type
        return device


def get_devices_snapshot():
    with STATE_LOCK:
        return copy.deepcopy(APP_STATE["devices"])


def update_zone_from_device(device):
    zone_id = device.get("zone_id")
    if not zone_id:
        return
    zone_id = str(zone_id)
    with STATE_LOCK:
        zones = APP_STATE["zones"]
        if zone_id not in zones:
            zones[zone_id] = {
                "zone_id": zone_id,
                "devices": [],
                "first_seen": datetime.now(),
                "last_seen": datetime.now(),
            }
        zone = zones[zone_id]
        if device["device_id"] not in zone["devices"]:
            zone["devices"].append(device["device_id"])
        zone["last_seen"] = datetime.now()


# ============================================================
# MQTT HANDLERS
# ============================================================
def to_bool(value):
    """true/false, 1/0, "true"/"false" -> real bool."""
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def handle_discovery(payload):
    device_id = payload.get("device_id")
    if not device_id:
        print("Discovery message without device_id")
        return

    device_type = payload.get("device_type", "unknown")
    device = get_device(device_id, device_type)

    with STATE_LOCK:
        device["device_type"] = device_type
        for field in ("zone_id", "ip", "mac", "rssi"):
            if field in payload:
                device[field] = payload[field]

        device["available_sensors"] = payload.get(
            "sensors", device.get("available_sensors", [])
        )
        device["actuators"] = payload.get("actuators", device.get("actuators", []))

        if device_type == "camera":
            device["stream_url"] = payload.get("stream_url", device.get("stream_url"))
            device["snapshot_url"] = payload.get(
                "snapshot_url", device.get("snapshot_url")
            )

        device["status"] = "ONLINE"
        device["last_seen"] = datetime.now()

    update_zone_from_device(device)

    if device_type == "camera":
        ensure_camera_worker(device)

    print(
        f"DEVICE DISCOVERED | {device_id} | {device_type} | "
        f"zone={device.get('zone_id')} | ip={device.get('ip')}"
    )


def handle_status(payload):
    device_id = payload.get("device_id")
    if not device_id:
        return
    device = get_device(device_id)

    with STATE_LOCK:
        for field in ("zone_id", "ip", "rssi"):
            if field in payload:
                device[field] = payload[field]

        status = str(payload.get("status", "online")).lower()
        device["status"] = "ONLINE" if status == "online" else "OFFLINE"

        if "buzzer" in payload:
            device["buzzer"] = payload["buzzer"]
        device["last_seen"] = datetime.now()

    update_zone_from_device(device)


def handle_telemetry(payload):
    device_id = payload.get("device_id")
    if not device_id:
        print("Telemetry without device_id")
        return

    device = get_device(device_id, "sensor_node")

    with STATE_LOCK:
        device["device_type"] = "sensor_node"
        device["zone_id"] = payload.get("zone_id", device.get("zone_id"))
        device["ip"] = payload.get("ip", device.get("ip"))

        # Merge: only update keys present in this message
        sensors = device.setdefault("sensors", {})
        for key in (
            "temperature", "light", "moisture", "motion", "distance", "tof_timeout",
            "accX", "accY", "accZ", "gyroX", "gyroY", "gyroZ", "buzzer",
        ):
            if key in payload:
                sensors[key] = payload[key]

        if "motion" in payload:
            motion_value = to_bool(payload["motion"])
            sensors["motion"] = motion_value
            device["motion_updated"] = datetime.now()
            if motion_value:
                device["motion_last"] = datetime.now()

        moisture_now = payload.get("moisture")
        if isinstance(moisture_now, (int, float)):
            # Dry = highest reading seen so far (higher ADC = drier)
            device["moisture_dry"] = max(
                device.get("moisture_dry", moisture_now), moisture_now
            )

        if "buzzer" in payload:
            device["buzzer"] = payload["buzzer"]

        device["status"] = "ONLINE"
        device["last_seen"] = datetime.now()

    update_zone_from_device(device)

    # ---- Auto buzzer from moisture ----
    wetness = moisture_wetness_pct(device)
    if wetness is not None:
        if wetness >= AUTO_BUZZER_ON_PCT and not device.get("moisture_alarm"):
            with STATE_LOCK:
                device["moisture_alarm"] = True
            control_buzzer(device_id, True)
        elif wetness <= AUTO_BUZZER_OFF_PCT and device.get("moisture_alarm"):
            with STATE_LOCK:
                device["moisture_alarm"] = False
            control_buzzer(device_id, False)


def mqtt_message_handler(topic, payload):
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        print("Invalid JSON received:", payload)
        return

    with STATE_LOCK:
        APP_STATE["last_message"] = {"topic": topic, "payload": data, "time": datetime.now()}
        APP_STATE["message_count"] += 1

    if topic.endswith("/discovery"):
        handle_discovery(data)
    elif topic.endswith("/status"):
        handle_status(data)
    elif topic.endswith("/telemetry"):
        handle_telemetry(data)
    else:
        print("Unhandled MQTT topic:", topic)


# ============================================================
# MQTT CALLBACKS / CONNECTION
# ============================================================
def mqtt_on_connect(client, userdata, flags, reason_code, properties=None):
    connection_ok = reason_code == 0 or str(reason_code).strip().lower() == "success"
    print("MQTT connected callback:", reason_code, "| success:", connection_ok)

    with STATE_LOCK:
        APP_STATE["mqtt_connected"] = connection_ok
        APP_STATE["mqtt_last_change"] = datetime.now()
        APP_STATE["mqtt_last_error"] = (
            None if connection_ok else f"MQTT connection rejected: {reason_code}"
        )

    if not connection_ok:
        return
    try:
        result = client.subscribe(MQTT_ROOT_TOPIC, qos=0)
        print("Subscribed to", MQTT_ROOT_TOPIC, "result=", result)
    except Exception as exc:
        with STATE_LOCK:
            APP_STATE["mqtt_last_error"] = str(exc)
        print("MQTT subscribe failed:", exc)


def mqtt_on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    print("MQTT disconnected:", reason_code)
    with STATE_LOCK:
        APP_STATE["mqtt_connected"] = False
        APP_STATE["mqtt_last_change"] = datetime.now()
        if reason_code != mqtt.MQTT_ERR_SUCCESS:
            APP_STATE["mqtt_last_error"] = f"Disconnected: {reason_code}"


def mqtt_on_message(client, userdata, msg):
    mqtt_message_handler(msg.topic, msg.payload.decode("utf-8", errors="ignore"))


def refresh_mqtt_connection_state():
    with STATE_LOCK:
        client = APP_STATE["mqtt_client"]
    if client is None:
        with STATE_LOCK:
            APP_STATE["mqtt_connected"] = False
        return
    try:
        actual = bool(client.is_connected())
        with STATE_LOCK:
            if APP_STATE["mqtt_connected"] != actual:
                APP_STATE["mqtt_last_change"] = datetime.now()
            APP_STATE["mqtt_connected"] = actual
    except Exception as exc:
        with STATE_LOCK:
            APP_STATE["mqtt_connected"] = False
            APP_STATE["mqtt_last_error"] = str(exc)


def start_mqtt():
    with STATE_LOCK:
        if APP_STATE["mqtt_client"] is not None:
            return

    print("Starting MQTT client...")
    try:
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=MQTT_CLIENT_ID,
            protocol=mqtt.MQTTv311,
        )
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        # Development configuration matching the ESP32 code.
        client.tls_set(cert_reqs=ssl.CERT_NONE)
        client.tls_insecure_set(True)
        client.reconnect_delay_set(min_delay=1, max_delay=30)

        client.on_connect = mqtt_on_connect
        client.on_disconnect = mqtt_on_disconnect
        client.on_message = mqtt_on_message

        with STATE_LOCK:
            APP_STATE["mqtt_client"] = client
            APP_STATE["mqtt_started"] = True
            APP_STATE["mqtt_last_error"] = None

        client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=MQTT_KEEPALIVE)
        client.loop_start()
        print("MQTT background loop started.")
    except Exception as exc:
        print("MQTT startup failed:", exc)
        with STATE_LOCK:
            APP_STATE["mqtt_connected"] = False
            APP_STATE["mqtt_started"] = False
            APP_STATE["mqtt_last_error"] = str(exc)


def mqtt_publish(topic, payload):
    with STATE_LOCK:
        client = APP_STATE["mqtt_client"]
    if client is None:
        return False
    try:
        if not client.is_connected():
            refresh_mqtt_connection_state()
            return False
        result = client.publish(topic, payload, qos=0, retain=False)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            print("MQTT published:", topic, payload)
            return True
        print("MQTT publish failed:", result.rc)
        return False
    except Exception as exc:
        with STATE_LOCK:
            APP_STATE["mqtt_connected"] = False
            APP_STATE["mqtt_last_error"] = str(exc)
        print("MQTT publish exception:", exc)
        return False


def control_buzzer(device_id, state):
    topic = f"eldercare/sensors/{device_id}/command"
    # Compact JSON - the ESP32 command parser matches on exact strings.
    payload = json.dumps({"command": "buzzer", "state": bool(state)}, separators=(",", ":"))
    success = mqtt_publish(topic, payload)
    if success:
        # Optimistic update; ESP32 telemetry/status stays authoritative.
        with STATE_LOCK:
            if device_id in APP_STATE["devices"]:
                APP_STATE["devices"][device_id]["buzzer"] = bool(state)
    return success


# ============================================================
# RISK ENGINE
# ============================================================
def motion_active(device, hold_seconds=MOTION_HOLD_SECONDS):
    now = datetime.now()
    updated = device.get("motion_updated")
    if (
        device.get("sensors", {}).get("motion")
        and updated is not None
        and (now - updated).total_seconds() <= MOTION_STALE_SECONDS
    ):
        return True
    last = device.get("motion_last")
    if last is None:
        return False
    return (now - last).total_seconds() <= hold_seconds


def moisture_wetness_pct(device):
    """Wetness (0-100 %) relative to this device's own dry baseline."""
    value = device.get("sensors", {}).get("moisture")
    dry = device.get("moisture_dry")
    if not isinstance(value, (int, float)) or not dry:
        return None
    return max(0, min(100, round((dry - value) / dry * 100)))


def calculate_risk(device):
    sensors = device.get("sensors", {})
    risk = 0

    # 1. Ambient light (darker room = higher fall risk)
    light = sensors.get("light")
    if light is not None:
        if light < 20:
            risk += 30
        elif light < 50:
            risk += 20
        elif light < 100:
            risk += 10

    # 2. Distance / proximity (closer obstacle = higher risk)
    distance = sensors.get("distance")
    if distance is not None:
        if distance < 300:
            risk += 35
        elif distance < 600:
            risk += 20
        elif distance < 1000:
            risk += 5

    # 3. Moisture (relative to the dry baseline)
    wetness = moisture_wetness_pct(device)
    if wetness is not None:
        if wetness >= 75:
            risk += 30
        elif wetness >= 50:
            risk += 20
        elif wetness >= 25:
            risk += 10

    # 4. Motion
    if motion_active(device):
        risk += 5

    return min(risk, 100)


def risk_level(score):
    if score < 31:
        return "LOW"
    if score < 61:
        return "MEDIUM"
    return "HIGH"


def calculate_zone_risk(zone_id, devices=None):
    devices = devices if devices is not None else get_devices_snapshot()
    sensor_devices = [
        d for d in devices.values()
        if d.get("zone_id") == zone_id and d.get("device_type") == "sensor_node"
    ]
    if not sensor_devices:
        return 0
    return max(calculate_risk(d) for d in sensor_devices)


def refresh_device_status():
    now = datetime.now()
    with STATE_LOCK:
        for device in APP_STATE["devices"].values():
            last_seen = device.get("last_seen")
            if last_seen is None:
                device["status"] = "OFFLINE"
                continue
            elapsed = (now - last_seen).total_seconds()
            device["status"] = "OFFLINE" if elapsed > DEVICE_OFFLINE_TIMEOUT else "ONLINE"
            device["seconds_since_seen"] = max(0, int(elapsed))


# ============================================================
# SERIALISATION FOR THE WEBSITE
# ============================================================
def serialize_device(device):
    sensors = device.get("sensors", {})
    out = {
        "device_id": device["device_id"],
        "device_type": device.get("device_type", "unknown"),
        "zone_id": device.get("zone_id"),
        "ip": device.get("ip"),
        "mac": device.get("mac"),
        "rssi": device.get("rssi"),
        "status": device.get("status", "OFFLINE"),
        "last_seen": iso(device.get("last_seen")),
        "seconds_since_seen": device.get("seconds_since_seen"),
        "buzzer": bool(device.get("buzzer", False)),
        "stream_url": device.get("stream_url"),
    }

    if device.get("device_type") == "sensor_node":
        score = calculate_risk(device)
        out.update(
            {
                "sensors": sensors,
                "risk_score": score,
                "risk_level": risk_level(score),
                "wetness_pct": moisture_wetness_pct(device),
                "moisture_dry": device.get("moisture_dry"),
                "motion_active": motion_active(device),
            }
        )

    if device.get("device_type") == "camera":
        with CAMERA_WORKERS_LOCK:
            worker = CAMERA_WORKERS.get(device["device_id"])
        if worker is None:
            out["camera"] = {
                "has_frame": False,
                "fps": 0,
                "detections": 0,
                "frame_time": None,
                "error": "OpenCV is not installed" if cv2 is None else "Starting camera worker...",
            }
        else:
            snap = worker.get_snapshot()
            out["camera"] = {
                "has_frame": snap["jpeg"] is not None,
                "fps": round(snap["fps"], 1),
                "detections": snap["detections"],
                "frame_time": iso(snap["frame_time"]),
                "error": snap["error"],
            }
    return out


def build_state():
    refresh_mqtt_connection_state()
    refresh_device_status()
    sync_camera_workers()

    devices = get_devices_snapshot()
    with STATE_LOCK:
        zone_ids = sorted(set(APP_STATE["zones"].keys()) | {
            d["zone_id"] for d in devices.values() if d.get("zone_id")
        })
        connected = APP_STATE["mqtt_connected"]
        message_count = APP_STATE["message_count"]
        last_message = copy.deepcopy(APP_STATE["last_message"])
        mqtt_last_change = APP_STATE["mqtt_last_change"]
        mqtt_last_error = APP_STATE["mqtt_last_error"]
        yolo_loading = APP_STATE["yolo_loading"]
        yolo_error = APP_STATE["yolo_error"]

    zones = []
    for zone_id in zone_ids:
        score = calculate_zone_risk(zone_id, devices)
        zone_devices = [d for d in devices.values() if d.get("zone_id") == zone_id]
        zones.append(
            {
                "zone_id": zone_id,
                "risk_score": score,
                "risk_level": risk_level(score),
                "device_ids": [d["device_id"] for d in zone_devices],
                "devices_total": len(zone_devices),
                "devices_online": sum(1 for d in zone_devices if d.get("status") == "ONLINE"),
            }
        )

    device_list = [serialize_device(d) for d in devices.values()]
    online = sum(1 for d in device_list if d["status"] == "ONLINE")

    return {
        "server_time": iso(datetime.now()),
        "mqtt": {
            "connected": connected,
            "host": MQTT_HOST,
            "port": MQTT_PORT,
            "topic": MQTT_ROOT_TOPIC,
            "last_change": iso(mqtt_last_change),
            "last_error": mqtt_last_error,
            "message_count": message_count,
            "last_message": (
                {
                    "topic": last_message["topic"],
                    "payload": last_message["payload"],
                    "time": iso(last_message["time"]),
                }
                if last_message
                else None
            ),
        },
        "yolo": {
            "model": YOLO_MODEL_PATH,
            "available": YOLO is not None and cv2 is not None,
            "loading": yolo_loading,
            "error": yolo_error,
        },
        "summary": {
            "devices": len(device_list),
            "online": online,
            "offline": len(device_list) - online,
            "sensor_nodes": sum(1 for d in device_list if d["device_type"] == "sensor_node"),
            "cameras": sum(1 for d in device_list if d["device_type"] == "camera"),
            "zones": len(zones),
            "high_risk_zones": sum(1 for z in zones if z["risk_level"] == "HIGH"),
        },
        "offline_timeout": DEVICE_OFFLINE_TIMEOUT,
        "zones": zones,
        "devices": device_list,
    }


# ============================================================
# FLASK APP
# ============================================================
app = Flask(__name__)
CORS(app)  # lets the website (localhost:5173) call this server


@app.route("/health", methods=["GET"])
def health():
    refresh_mqtt_connection_state()
    with STATE_LOCK:
        connected = APP_STATE["mqtt_connected"]
    return jsonify({"status": "ok", "module": "environmental-risk", "mqtt_connected": connected})


@app.route("/api/state", methods=["GET"])
def api_state():
    return jsonify(build_state())


@app.route("/api/buzzer/<device_id>", methods=["POST"])
def api_buzzer(device_id):
    body = request.get_json(silent=True) or {}
    state = to_bool(body.get("state", False))
    with STATE_LOCK:
        known = device_id in APP_STATE["devices"]
    if not known:
        return jsonify({"ok": False, "error": "unknown device"}), 404
    ok = control_buzzer(device_id, state)
    if not ok:
        return jsonify({"ok": False, "error": "MQTT command failed (broker not connected?)"}), 503
    return jsonify({"ok": True, "device_id": device_id, "state": state})


@app.route("/api/calibrate/<device_id>", methods=["POST"])
def api_calibrate(device_id):
    """Use the current moisture reading as this node's 'dry floor' baseline."""
    with STATE_LOCK:
        device = APP_STATE["devices"].get(device_id)
        if device is None:
            return jsonify({"ok": False, "error": "unknown device"}), 404
        value = device.get("sensors", {}).get("moisture")
        if not isinstance(value, (int, float)):
            return jsonify({"ok": False, "error": "no moisture reading yet"}), 409
        device["moisture_dry"] = value
    return jsonify({"ok": True, "device_id": device_id, "moisture_dry": value})


def _get_worker(device_id):
    with CAMERA_WORKERS_LOCK:
        return CAMERA_WORKERS.get(device_id)


@app.route("/camera/<device_id>/snapshot", methods=["GET"])
def camera_snapshot(device_id):
    worker = _get_worker(device_id)
    jpeg = worker.get_snapshot()["jpeg"] if worker else None
    if not jpeg:
        return jsonify({"error": "no frame yet"}), 404
    return Response(jpeg, mimetype="image/jpeg", headers={"Cache-Control": "no-store"})


@app.route("/camera/<device_id>/stream", methods=["GET"])
def camera_stream(device_id):
    if _get_worker(device_id) is None:
        return jsonify({"error": "camera worker not running"}), 404

    def generate():
        last_time = None
        while True:
            worker = _get_worker(device_id)
            if worker is None:
                break
            snap = worker.get_snapshot()
            if snap["jpeg"] is not None and snap["frame_time"] != last_time:
                last_time = snap["frame_time"]
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + snap["jpeg"] + b"\r\n"
                )
            time.sleep(0.05)

    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


if __name__ == "__main__":
    start_mqtt()
    # threaded=True so the MJPEG streams don't block the JSON polling
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False, threaded=True)
