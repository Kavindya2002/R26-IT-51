# =========================================================
#  Heart Rate & Blood Pressure Monitoring - backend
#  Owner: Hirushi Divyanjalie            Port: 5052
#
#  FastAPI server (from "research-backendv2-main/main.py").
#    ESP32 + MAX30102  --MQTT (HiveMQ, topic patient/vitals)-->  this server
#    this server: band-pass filter -> peak detection -> heart rate / pulse interval
#                 -> Random-Forest BP model -> WebSocket /ws/client (live)
#                 -> Supabase table "vital_logs" (5 s averages)
#
#  Endpoints
#    GET  /health                        -> {"status":"ok", ...}   (used by the website)
#    WS   /ws/client                     -> live vitals stream for the dashboard
#    GET  /api/vital-logs/recent         -> last 20 records
#    GET  /api/vital-logs/filtered       -> ?timeframe=last20|daily|monthly|lifetime
#    GET  /api/patient-activity-analytics?selected_date=YYYY-MM-DD
#    POST /api/patient-events            -> add an annotation (medication, exercise ...)
#
#  Settings live in backend/cardiovascular/.env (see .env.example).
# =========================================================
import asyncio
import json
import os
import time
import warnings
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

import joblib
import numpy as np
import paho.mqtt.client as mqtt
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from scipy.signal import butter, filtfilt, find_peaks

try:
    from supabase import Client, create_client
except Exception:  # pragma: no cover
    Client = None
    create_client = None

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

warnings.filterwarnings("ignore", category=UserWarning)

# ============================================================
# CONFIGURATION  (.env)
# ============================================================
PORT = int(os.getenv("PORT", "5052"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

MQTT_HOST = os.getenv("MQTT_HOST", "")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "patient/vitals")

MODEL_PATH = BASE_DIR / os.getenv("BP_MODEL_FILE", "bp_model.joblib")

FINGER_IR_THRESHOLD = 70000  # IR below this = no finger on the sensor

# ============================================================
# SUPABASE
# ============================================================
supabase = None
if create_client is not None and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as exc:
        print("Supabase init failed:", exc)
else:
    print("Supabase is not configured (SUPABASE_URL / SUPABASE_KEY) - history & annotations are disabled.")

# ============================================================
# BP MODEL
# ============================================================
bp_model = None
bp_model_error = None

if MODEL_PATH.exists():
    try:
        bp_model = joblib.load(MODEL_PATH)
        print(f"ML model ({MODEL_PATH.name}) loaded successfully!")
    except Exception as exc:
        bp_model_error = (
            f"Could not load {MODEL_PATH.name}: {exc}. If this file came from Git it may be a tiny "
            "Git-LFS pointer - copy the real file or run:  python train_model.py"
        )
        print("WARNING:", bp_model_error)
else:
    bp_model_error = f"'{MODEL_PATH.name}' not found. Run:  python train_model.py"
    print("WARNING:", bp_model_error)
if bp_model is None:
    print("          Blood pressure will show the default 120/80 until a model is available.")


# ============================================================
# WEBSOCKET CONNECTION MANAGER
# ============================================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):  # real-time broadcasting
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()

# ============================================================
# DATA BUFFERS
# ============================================================
ir_buffer = []
timestamps = []

# Moving-average smoothing buffers (real-time streaming)
hr_smooth_buffer = deque(maxlen=10)
sys_smooth_buffer = deque(maxlen=10)
dia_smooth_buffer = deque(maxlen=10)
pti_smooth_buffer = deque(maxlen=10)

# Supabase 5-second averaging buffers & timer
last_db_insert_time = time.time()
db_hr_list = []
db_sys_list = []
db_dia_list = []
db_pti_list = []

# Status tracking across frames
last_calculated_status = "Normal"

mqtt_connected = False
last_sample_time = None


# ============================================================
# SIGNAL FILTER (band-pass)
# ============================================================
def bandpass_filter(data, lowcut=0.5, highcut=5.0, fs=50.0):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(1, [low, high], btype="band")
    return filtfilt(b, a, data)


# ============================================================
# MQTT (HiveMQ)
# ============================================================
main_loop = None
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)


def on_connect(client, userdata, flags, reason_code, properties=None):
    global mqtt_connected
    ok = reason_code == 0 or str(reason_code).strip().lower() == "success"
    mqtt_connected = ok
    print("HiveMQ connected:", reason_code)
    if ok:
        client.subscribe(MQTT_TOPIC)


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    global mqtt_connected
    mqtt_connected = False
    print("HiveMQ disconnected:", reason_code)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        asyncio.run_coroutine_threadsafe(process_sample(payload), main_loop)
    except Exception as exc:
        print("MQTT message error:", exc)


def start_mqtt():
    if not MQTT_HOST:
        print("MQTT_HOST is not set - live sensor data is disabled.")
        return
    try:
        mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
        mqtt_client.tls_set()  # TLS for port 8883
        mqtt_client.on_connect = on_connect
        mqtt_client.on_disconnect = on_disconnect
        mqtt_client.on_message = on_message
        mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)
        # connect_async: the server still starts (and retries) if the broker is unreachable
        mqtt_client.connect_async(MQTT_HOST, MQTT_PORT)
        mqtt_client.loop_start()
    except Exception as exc:
        print("MQTT startup failed:", exc)


@asynccontextmanager
async def lifespan(_app):
    global main_loop
    main_loop = asyncio.get_running_loop()
    start_mqtt()
    yield
    try:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan)

# CORS (frontend <-> backend connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# SUPABASE: save the 5 s average + work out the 1-minute status (runs in a worker thread)
# ============================================================
def save_and_classify(data_to_insert):
    """Returns the new patient status ("Normal" / "Risky" / "Critical") or None on error."""
    if supabase is None:
        return None
    try:
        supabase.table("vital_logs").insert(data_to_insert).execute()

        one_min_ago = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
        recent_data = (
            supabase.table("vital_logs")
            .select("heart_rate, systolic_bp")
            .gte("created_at", one_min_ago)
            .execute()
        )

        if recent_data.data and len(recent_data.data) > 0:
            avg_1m_hr = np.mean([r["heart_rate"] for r in recent_data.data])
            avg_1m_sys = np.mean([r["systolic_bp"] for r in recent_data.data])

            if avg_1m_hr > 120 or avg_1m_hr < 45 or avg_1m_sys > 140 or avg_1m_sys < 90:
                return "Critical"
            if avg_1m_hr > 100 or avg_1m_hr < 50 or avg_1m_sys > 130 or avg_1m_sys < 100:
                return "Risky"
            return "Normal"
        return "Normal"
    except Exception as db_err:
        print(f"Supabase Error: {db_err}")
        return None


# ============================================================
# SAMPLE PROCESSING (one MQTT message from the ESP32)
# ============================================================
async def process_sample(payload):
    global last_db_insert_time, last_calculated_status, last_sample_time

    ir_val = payload.get("ir", 0)
    red_val = payload.get("red", 0)
    ts = payload.get("timestamp", 0)
    battery_level = payload.get("battery", 100)  # 0-100
    is_charging = payload.get("charging", False)
    last_sample_time = time.time()

    # ---------------- NO FINGER ----------------
    if ir_val < FINGER_IR_THRESHOLD:
        ir_buffer.clear()
        timestamps.clear()
        hr_smooth_buffer.clear()
        sys_smooth_buffer.clear()
        dia_smooth_buffer.clear()
        pti_smooth_buffer.clear()

        db_hr_list.clear()
        db_sys_list.clear()
        db_dia_list.clear()
        db_pti_list.clear()
        last_db_insert_time = time.time()
        last_calculated_status = "Normal"

        await manager.broadcast(
            {
                "timestamp": ts,
                "red": red_val,
                "ir": ir_val,
                "inst_hr": 0,
                "avg_hr": 0,
                "pulse_interval": 0,
                "bp_sys": 0,
                "bp_dia": 0,
                "status": "No Finger Detected",
                "db_avg_status": "Normal",
                "battery_level": battery_level,
                "is_charging": is_charging,
            }
        )
        return

    # ---------------- FINGER DETECTED ----------------
    ir_buffer.append(ir_val)
    timestamps.append(ts)

    if len(ir_buffer) > 250:
        ir_buffer.pop(0)
        timestamps.pop(0)

    inst_hr, avg_hr, pti, bp_sys, bp_dia = 0, 0, 0, 120, 80

    if len(ir_buffer) >= 80:
        time_diffs = np.diff(timestamps)
        mean_diff_ms = np.mean(time_diffs)
        fs = 1000.0 / mean_diff_ms if mean_diff_ms > 0 else 50.0

        raw_signal = np.array(ir_buffer)
        detrended = raw_signal - np.mean(raw_signal)

        try:
            lowcut = 0.7
            highcut = min(3.0, (fs / 2.0) - 0.1)
            if highcut > lowcut:
                filtered_ir = bandpass_filter(detrended, lowcut=lowcut, highcut=highcut, fs=fs)
            else:
                filtered_ir = detrended
        except Exception:
            filtered_ir = detrended

        min_dist = max(int(fs / 3.0), 5)
        std_val = np.std(filtered_ir)
        prom_val = max(std_val * 0.3, 2.0)

        peaks, _ = find_peaks(-filtered_ir, distance=min_dist, prominence=prom_val)
        if len(peaks) < 2:
            peaks, _ = find_peaks(filtered_ir, distance=min_dist, prominence=prom_val)

        if len(peaks) >= 2:
            peak_times = [timestamps[p] / 1000.0 for p in peaks]
            intervals = np.diff(peak_times)

            if len(intervals) > 0:
                raw_pti = float(intervals[-1] * 1000)
                raw_inst_hr = float(60.0 / intervals[-1])
                raw_avg_hr = float(60.0 / np.mean(intervals))

                if 50 <= raw_avg_hr <= 180:
                    if bp_model is not None:
                        try:
                            features = np.array([[red_val, ir_val, raw_avg_hr, raw_pti]])
                            predicted_bp = bp_model.predict(features)
                            sys_smooth_buffer.append(float(predicted_bp[0][0]))
                            dia_smooth_buffer.append(float(predicted_bp[0][1]))
                        except Exception as err:
                            print(f"Prediction Error: {err}")

                    hr_smooth_buffer.append(raw_avg_hr)
                    pti_smooth_buffer.append(raw_pti)

                    avg_hr = sum(hr_smooth_buffer) / len(hr_smooth_buffer)
                    pti = sum(pti_smooth_buffer) / len(pti_smooth_buffer)
                    inst_hr = raw_inst_hr

                    if len(sys_smooth_buffer) > 0:
                        bp_sys = int(sum(sys_smooth_buffer) / len(sys_smooth_buffer))
                        bp_dia = int(sum(dia_smooth_buffer) / len(dia_smooth_buffer))

    # ---------------- SUPABASE 5 s AVERAGE ----------------
    if ir_val >= FINGER_IR_THRESHOLD and avg_hr > 0:
        db_hr_list.append(avg_hr)
        db_sys_list.append(bp_sys)
        db_dia_list.append(bp_dia)
        db_pti_list.append(pti)
        current_time = time.time()

        if current_time - last_db_insert_time >= 5.0:
            if len(db_hr_list) > 0:
                final_hr = float(round(sum(db_hr_list) / len(db_hr_list), 1))
                final_sys = int(sum(db_sys_list) / len(db_sys_list))
                final_dia = int(sum(db_dia_list) / len(db_dia_list))
                final_pti = float(round(sum(db_pti_list) / len(db_pti_list), 1))

                is_hr_normal = 50 <= final_hr <= 100
                is_bp_normal = (90 <= final_sys <= 120) and (60 <= final_dia <= 80)
                data_to_insert = {
                    "heart_rate": final_hr,
                    "systolic_bp": final_sys,
                    "diastolic_bp": final_dia,
                    "pulse_interval": final_pti,
                    "patient_status": "Normal" if (is_hr_normal and is_bp_normal) else "Risky",
                }

                # blocking network call -> worker thread so the live stream never stalls
                new_status = await asyncio.to_thread(save_and_classify, data_to_insert)
                if new_status:
                    last_calculated_status = new_status

            db_hr_list.clear()
            db_sys_list.clear()
            db_dia_list.clear()
            db_pti_list.clear()
            last_db_insert_time = current_time

    await manager.broadcast(
        {
            "timestamp": ts,
            "red": red_val,
            "ir": ir_val,
            "inst_hr": round(inst_hr, 1),
            "avg_hr": round(avg_hr, 1),
            "pulse_interval": round(pti, 1),
            "bp_sys": bp_sys,
            "bp_dia": bp_dia,
            "status": "Measuring",
            "db_avg_status": last_calculated_status,
            "battery_level": battery_level,
            "is_charging": is_charging,
        }
    )


# ============================================================
# ROUTES
# ============================================================
@app.get("/health")
def health():
    return {
        "status": "ok",
        "module": "cardiovascular",
        "mqtt_connected": mqtt_connected,
        "bp_model_loaded": bp_model is not None,
        "bp_model_error": bp_model_error,
        "database_configured": supabase is not None,
        "live_clients": len(manager.active_connections),
        "seconds_since_last_sample": (
            round(time.time() - last_sample_time, 1) if last_sample_time else None
        ),
    }


# React UI WebSocket endpoint
@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    await manager.connect(websocket)
    print("React client connected")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("React client disconnected")


# NOTE: the routes below are plain `def` (not async) on purpose - FastAPI runs them in a
# thread pool, so the blocking Supabase calls don't freeze the live WebSocket stream.

@app.get("/api/vital-logs/recent")
def get_recent_vital_logs():
    """Last 20 records."""
    if supabase is None:
        return []
    try:
        response = (
            supabase.table("vital_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        return response.data
    except Exception as exc:
        print(f"Error fetching recent logs: {exc}")
        return []


@app.get("/api/vital-logs/filtered")
def get_filtered_vital_logs(timeframe: str = Query("daily")):
    """Records for the selected timeframe: last20 | daily (24 h) | monthly (30 d) | anything else = all."""
    if supabase is None:
        return []
    try:
        query = supabase.table("vital_logs").select("*").order("created_at", desc=True)
        now = datetime.now(timezone.utc)

        if timeframe == "last20":
            query = query.limit(20)
        elif timeframe == "daily":
            query = query.gte("created_at", (now - timedelta(days=1)).isoformat())
        elif timeframe == "monthly":
            query = query.gte("created_at", (now - timedelta(days=30)).isoformat())

        response = query.execute()
        return response.data if response.data else []
    except Exception as exc:
        print(f"Error fetching filtered logs: {exc}")
        return []


@app.get("/api/patient-activity-analytics")
def get_patient_activity_analytics(selected_date: str = Query(...)):
    """selected_date format: 'YYYY-MM-DD'"""
    if supabase is None:
        return {"vitals": [], "events": [], "error": "database not configured"}
    try:
        start_time = f"{selected_date}T00:00:00Z"
        end_time = f"{selected_date}T23:59:59Z"

        vitals_res = (
            supabase.table("vital_logs")
            .select("created_at, heart_rate, systolic_bp, diastolic_bp")
            .gte("created_at", start_time)
            .lte("created_at", end_time)
            .order("created_at", desc=False)
            .execute()
        )
        events_res = (
            supabase.table("patient_events")
            .select("id, event_time, activity_type, notes")
            .gte("event_time", start_time)
            .lte("event_time", end_time)
            .order("event_time", desc=False)
            .execute()
        )
        return {
            "vitals": vitals_res.data if vitals_res.data else [],
            "events": events_res.data if events_res.data else [],
        }
    except Exception as exc:
        print(f"Error fetching analytics data: {exc}")
        return {"vitals": [], "events": [], "error": str(exc)}


@app.post("/api/patient-events")
def create_patient_event(event: dict):
    if supabase is None:
        return {"status": "error", "message": "database not configured"}
    try:
        res = supabase.table("patient_events").insert(event).execute()
        return {"status": "success", "data": res.data}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
