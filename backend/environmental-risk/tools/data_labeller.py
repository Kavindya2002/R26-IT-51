import os
import ssl
import csv
import json
import time
import copy
import threading
from datetime import datetime

import pandas as pd
import streamlit as st
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(
    page_title="ElderCare - Data Labelling & Collection",
    page_icon="🏷️",
    layout="wide",
)

# ============================================================
# CONFIGURATION
# ============================================================

MQTT_HOST = os.getenv("MQTT_HOST", "your-hivemq-host")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "your-username")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "your-password")
MQTT_ROOT_TOPIC = "eldercare/#"

DATASET_FILE = "eldercare_dataset.csv"

CSV_HEADERS = [
    "timestamp",
    "device_id",
    "zone_id",
    "temperature",
    "light",
    "moisture",
    "motion",
    "distance",
    "tof_timeout",
    "accX",
    "accY",
    "accZ",
    "gyroX",
    "gyroY",
    "gyroZ",
    "buzzer",
    "label",
]

# ============================================================
# CSV INITIALIZATION
# ============================================================

def init_csv():
    if not os.path.exists(DATASET_FILE):
        with open(DATASET_FILE, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writeheader()

init_csv()

# ============================================================
# APPLICATION STATE & MQTT
# ============================================================

@st.cache_resource
def _get_collector_state():
    return {
        "devices": {},
        "mqtt_connected": False,
        "mqtt_client": None,
        "lock": threading.RLock(),
    }

COLLECTOR_STATE = _get_collector_state()

def save_sample(device_id: str, label: str):
    with COLLECTOR_STATE["lock"]:
        data = COLLECTOR_STATE["devices"].get(device_id)

    if not data:
        return False

    sensors = data.get("sensors", {})
    row = {
        "timestamp": datetime.now().isoformat(),
        "device_id": device_id,
        "zone_id": data.get("zone_id", ""),
        "temperature": sensors.get("temperature", ""),
        "light": sensors.get("light", ""),
        "moisture": sensors.get("moisture", ""),
        "motion": 1 if sensors.get("motion") else 0,
        "distance": sensors.get("distance", ""),
        "tof_timeout": sensors.get("tof_timeout", ""),
        "accX": sensors.get("accX", ""),
        "accY": sensors.get("accY", ""),
        "accZ": sensors.get("accZ", ""),
        "gyroX": sensors.get("gyroX", ""),
        "gyroY": sensors.get("gyroY", ""),
        "gyroZ": sensors.get("gyroZ", ""),
        "buzzer": 1 if sensors.get("buzzer") else 0,
        "label": label.upper(),
    }

    with open(DATASET_FILE, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writerow(row)
    return True

def mqtt_on_connect(client, userdata, flags, reason_code, properties=None):
    success = (reason_code == 0 or str(reason_code).strip().lower() == "success")
    with COLLECTOR_STATE["lock"]:
        COLLECTOR_STATE["mqtt_connected"] = success
    if success:
        client.subscribe(MQTT_ROOT_TOPIC, qos=0)

def mqtt_on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    with COLLECTOR_STATE["lock"]:
        COLLECTOR_STATE["mqtt_connected"] = False

def mqtt_on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8", errors="ignore"))
    except Exception:
        return

    if msg.topic.endswith("/telemetry"):
        device_id = payload.get("device_id")
        if not device_id:
            return

        with COLLECTOR_STATE["lock"]:
            COLLECTOR_STATE["devices"][device_id] = {
                "device_id": device_id,
                "zone_id": payload.get("zone_id", "-"),
                "last_seen": datetime.now(),
                "sensors": {
                    "temperature": payload.get("temperature"),
                    "light": payload.get("light"),
                    "moisture": payload.get("moisture"),
                    "motion": payload.get("motion"),
                    "distance": payload.get("distance"),
                    "tof_timeout": payload.get("tof_timeout"),
                    "accX": payload.get("accX"),
                    "accY": payload.get("accY"),
                    "accZ": payload.get("accZ"),
                    "gyroX": payload.get("gyroX"),
                    "gyroY": payload.get("gyroY"),
                    "gyroZ": payload.get("gyroZ"),
                    "buzzer": payload.get("buzzer"),
                },
            }

def start_mqtt():
    with COLLECTOR_STATE["lock"]:
        if COLLECTOR_STATE["mqtt_client"] is not None:
            return

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="eldercare-labeller-dashboard",
        protocol=mqtt.MQTTv311,
    )
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)

    client.on_connect = mqtt_on_connect
    client.on_disconnect = mqtt_on_disconnect
    client.on_message = mqtt_on_message

    with COLLECTOR_STATE["lock"]:
        COLLECTOR_STATE["mqtt_client"] = client

    client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

# ============================================================
# UI COMPONENTS
# ============================================================

def render_sidebar():
    st.sidebar.title("🏷️ Data Collector")
    with COLLECTOR_STATE["lock"]:
        connected = COLLECTOR_STATE["mqtt_connected"]
    
    if connected:
        st.sidebar.success("🟢 Broker Connected")
    else:
        st.sidebar.error("🔴 Broker Disconnected")

    st.sidebar.markdown(f"**Target CSV:** `{DATASET_FILE}`")
    st.sidebar.markdown(f"**Topic:** `{MQTT_ROOT_TOPIC}`")
    
    if os.path.exists(DATASET_FILE):
        try:
            df = pd.read_csv(DATASET_FILE)
            st.sidebar.divider()
            st.sidebar.metric("Total Collected Samples", len(df))
            if not df.empty and "label" in df.columns:
                st.sidebar.write("**Label Distribution:**")
                st.sidebar.dataframe(df["label"].value_counts(), use_container_width=True)
        except Exception:
            pass

@st.fragment(run_every="1s")
def live_node_monitor(selected_device):
    with COLLECTOR_STATE["lock"]:
        device_data = copy.deepcopy(COLLECTOR_STATE["devices"].get(selected_device))

    if not device_data:
        st.info("No telemetry received yet for this node.")
        return

    sensors = device_data.get("sensors", {})
    
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Light (lx)", f"{sensors.get('light', '-')}")
    c2.metric("Distance (mm)", f"{sensors.get('distance', '-')}")
    c3.metric("Moisture", f"{sensors.get('moisture', '-')}")
    c4.metric("Motion", "YES" if sensors.get("motion") else "NO")
    c5.metric("Temp (°C)", f"{sensors.get('temperature', '-')}")
    c6.metric("Buzzer", "ON" if sensors.get("buzzer") else "OFF")

    with st.expander("6-Axis IMU (MPU6050)", expanded=False):
        i1, i2, i3, i4, i5, i6 = st.columns(6)
        i1.metric("accX", f"{sensors.get('accX', '-')}")
        i2.metric("accY", f"{sensors.get('accY', '-')}")
        i3.metric("accZ", f"{sensors.get('accZ', '-')}")
        i4.metric("gyroX", f"{sensors.get('gyroX', '-')}")
        i5.metric("gyroY", f"{sensors.get('gyroY', '-')}")
        i6.metric("gyroZ", f"{sensors.get('gyroZ', '-')}")

def main():
    start_mqtt()
    render_sidebar()

    st.title("ElderCare Risk Data Labeling Studio")
    st.caption("Capture live environmental readings and build labeled datasets for ML model training.")

    with COLLECTOR_STATE["lock"]:
        devices = list(COLLECTOR_STATE["devices"].keys())

    if not devices:
        st.warning("⚠️ No active ESP32 sensor nodes discovered on MQTT yet. Waiting for incoming telemetry...")
        return

    selected_node = st.selectbox("Select Target Sensor Node", devices)
    
    st.markdown("### Live Node Telemetry")
    live_node_monitor(selected_node)

    st.divider()

    col_single, col_batch = st.columns(2)

    # 1. Manual Single-Snapshot Labelling
    with col_single:
        st.subheader("Manual Snapshot Labeling")
        st.caption("Click to log the immediate current sensor reading.")
        
        btn_low, btn_med, btn_high = st.columns(3)
        with btn_low:
            if st.button("🟢 Label as LOW", use_container_width=True):
                if save_sample(selected_node, "LOW"):
                    st.toast("Saved 1 LOW risk sample", icon="🟢")
        with btn_med:
            if st.button("🟡 Label as MEDIUM", use_container_width=True):
                if save_sample(selected_node, "MEDIUM"):
                    st.toast("Saved 1 MEDIUM risk sample", icon="🟡")
        with btn_high:
            if st.button("🔴 Label as HIGH", use_container_width=True):
                if save_sample(selected_node, "HIGH"):
                    st.toast("Saved 1 HIGH risk sample", icon="🔴")

    # 2. Continuous Timed Scenario Recording
    with col_batch:
        st.subheader("Batch Continuous Recording")
        st.caption("Record periodic samples while simulating a scenario.")
        
        with st.form("batch_form"):
            batch_label = st.selectbox("Risk Level", ["LOW", "MEDIUM", "HIGH"])
            sample_count = st.number_input("Number of Samples", min_value=1, max_value=200, value=20)
            sample_interval = st.slider("Sampling Interval (seconds)", 0.2, 5.0, 1.0, 0.1)
            start_batch = st.form_submit_button("Start Recording Batch")

            if start_batch:
                progress_bar = st.progress(0)
                status_text = st.empty()
                
                for i in range(sample_count):
                    save_sample(selected_node, batch_label)
                    progress = (i + 1) / sample_count
                    progress_bar.progress(progress)
                    status_text.text(f"Recorded sample {i + 1} of {sample_count} as {batch_label}...")
                    time.sleep(sample_interval)
                
                st.success(f"Batch recording finished: {sample_count} samples logged as {batch_label}.")

    st.divider()

    # Dataset Inspector & Export
    st.subheader("Dataset Preview")
    if os.path.exists(DATASET_FILE):
        try:
            df = pd.read_csv(DATASET_FILE)
            if not df.empty:
                st.dataframe(df.tail(10), use_container_width=True)
                
                with open(DATASET_FILE, "rb") as file:
                    st.download_button(
                        label="📥 Download CSV Dataset",
                        data=file,
                        file_name="eldercare_training_dataset.csv",
                        mime="text/csv",
                    )
            else:
                st.info("Dataset is currently empty.")
        except Exception as e:
            st.error(f"Error reading CSV: {e}")

if __name__ == "__main__":
    main()