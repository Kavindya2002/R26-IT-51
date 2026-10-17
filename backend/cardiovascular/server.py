from collections import deque
import json
import os
import time
from typing import List
import warnings
import asyncio
import paho.mqtt.client as mqtt

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import joblib
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks
from supabase import Client, create_client
from datetime import datetime, timedelta, timezone
from fastapi import Query

from fastapi.middleware.cors import CORSMiddleware

# Database & Warning Configurations
SUPABASE_URL = "https://ihvuvchctzwzgmjwvucm.supabase.co"   
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodnV2Y2hjdHp3emdtand2dWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MTM4MjMsImV4cCI6MjEwMjA4OTgyM30.ldIb52LRNAVbSQdSQSIw30mX1VoOLwpQebN6iH2tCKM"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

warnings.filterwarnings("ignore", category=UserWarning)

app = FastAPI()


#------------------------------------ CORS Middleware/ Configuration (Frontend-Backend Connection)  --------------------#
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,   #cookies or authentication request
    allow_methods=["*"],  #http
    allow_headers=["*"],
)


# Trained ML Model  Load 
MODEL_PATH = "bp_model.joblib"
bp_model = None

if os.path.exists(MODEL_PATH):
  try:
    bp_model = joblib.load(MODEL_PATH)
    print("ML Model (bp_model.joblib) loaded successfully!")
  except Exception as e:
    print(f"Error loading model: {e}")
else:
  print(f"Warning: '{MODEL_PATH}' not found. Please run train_model.py first.")


#------------------------------------------  WEBSOCKET CONNECTION MANAGER  ----------------------------------------------#
class ConnectionManager:

  def __init__(self):
    self.active_connections: List[WebSocket] = []

  async def connect(self, websocket: WebSocket):
    await websocket.accept()
    self.active_connections.append(websocket)

  def disconnect(self, websocket: WebSocket):
    if websocket in self.active_connections:
      self.active_connections.remove(websocket)

  async def broadcast(self, message: dict):     # real time broadcasting
    for connection in self.active_connections:
      try:
        await connection.send_json(message)
      except Exception:
        pass

manager = ConnectionManager()

# Data Buffers
ir_buffer = []
timestamps = []

# Moving Average Smoothing Buffers (Real-time Streaming)
hr_smooth_buffer = deque(maxlen=10)
sys_smooth_buffer = deque(maxlen=10)
dia_smooth_buffer = deque(maxlen=10)
pti_smooth_buffer = deque(maxlen=10)

# DB Buffer -  Supabase 5-Second Averaging Buffers & Timer
last_db_insert_time = time.time()
db_hr_list = []
db_sys_list = []
db_dia_list = []
db_pti_list = []

# Global Status tracking across WebSocket frames
last_calculated_status = "Normal"


#--------------------------------------------------------------------- Signal Filter (bandpass) ------------------------------#
def bandpass_filter(data, lowcut=0.5, highcut=5.0, fs=50.0):
  nyq = 0.5 * fs
  low = lowcut / nyq
  high = highcut / nyq
  b, a = butter(1, [low, high], btype="band")
  return filtfilt(b, a, data)






MQTT_HOST = "de21646cab9640a9bb82b08bf1a29887.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "Divya"
MQTT_PASS = "12345678"
MQTT_TOPIC = "patient/vitals"

main_loop = None
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

def on_connect(client, userdata, flags, reason_code, properties=None):
    print("HiveMQ connected:", reason_code)
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    print("MQTT msg received")
    try:
        payload = json.loads(msg.payload.decode())
        # asyncio.run_coroutine_threadsafe(process_sample(payload), main_loop)
        fut = asyncio.run_coroutine_threadsafe(process_sample(payload), main_loop)

        fut.add_done_callback(
           lambda f: f.exception() and print("process_sample error:", repr(f.exception()))
           )

    except Exception as e:
        print("MQTT message error:", e)

@app.on_event("startup")
async def start_mqtt():
    global main_loop
    main_loop = asyncio.get_running_loop()
    mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
    mqtt_client.tls_set()          # TLS for port 8883
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.connect(MQTT_HOST, MQTT_PORT)
    mqtt_client.loop_start()





#--------------------------------------------- ESP32 WebSocket Endpoint -------------------------------------------------------#
#--- @app.websocket("/ws/sensor")
#-- async def websocket_sensor(websocket: WebSocket):
  #-- global last_db_insert_time, last_calculated_status

  
async def process_sample(payload):
  global last_db_insert_time, last_calculated_status

  # seperate ppg senser data
  ir_val = payload.get("ir", 0)
  red_val = payload.get("red", 0)
  ts = payload.get("timestamp", 0)
  # (ESP32 -> battery level 0-100 & is_charging boolean )
  battery_level = payload.get("battery", 100)
  is_charging = payload.get("charging", False)

  # Finger Detection Threshold Check
  if ir_val < 70000:
    ir_buffer.clear()
    timestamps.clear()
    hr_smooth_buffer.clear()
    sys_smooth_buffer.clear()
    dia_smooth_buffer.clear()
    pti_smooth_buffer.clear()

    # DB Buffers reset
    db_hr_list.clear()
    db_sys_list.clear()
    db_dia_list.clear()
    db_pti_list.clear()
    last_db_insert_time = time.time()
    last_calculated_status = "Normal"

        # send to frontend (assign esp32 values into variables)
        #if finger not dtetct -0
        #data direct come from senser keep values
    output_data = {
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
    await manager.broadcast(output_data)
    return
      # ---------------------------------------------- FINGER DETECTED ir>70000 -----------------------------------------------------#
    

     
  # ---------------- FINGER DETECTED ----------------#
  ir_buffer.append(ir_val)
  timestamps.append(ts)

  if len(ir_buffer) > 250:
    ir_buffer.pop(0)
    timestamps.pop(0)

  inst_hr, avg_hr, pti, bp_sys, bp_dia = 0, 0, 0, 120, 80

  if len(ir_buffer) >= 80:
    time_diffs = np.diff(timestamps)
    mean_diff_ms = np.mean(time_diffs)

    if mean_diff_ms > 0:
      fs = 1000.0 / mean_diff_ms
    else:
      fs = 50.0

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






      # print(f"buf={len(ir_buffer)} fs={fs:.1f} peaks={len(peaks)}")





      if len(intervals) > 0:
        raw_pti = float(intervals[-1] * 1000)
        raw_inst_hr = float(60.0 / intervals[-1])
        raw_avg_hr = float(60.0 / np.mean(intervals))
       # print(f"raw_avg_hr={raw_avg_hr:.1f} raw_pti={raw_pti:.0f}")

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

  # ---------------- SUPABASE 5s AVERAGE ----------------#
  if ir_val >= 70000 and avg_hr > 0:
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

        try:
          is_hr_normal = 50 <= final_hr <= 100
          is_bp_normal = (90 <= final_sys <= 120) and (60 <= final_dia <= 80)
          data_to_insert = {
              "heart_rate": final_hr,
              "systolic_bp": final_sys,
              "diastolic_bp": final_dia,
              "pulse_interval": final_pti,
              "patient_status": "Normal" if (is_hr_normal and is_bp_normal) else "Risky",
          }
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
              last_calculated_status = "Critical"
            elif avg_1m_hr > 100 or avg_1m_hr < 50 or avg_1m_sys > 130 or avg_1m_sys < 100:
              last_calculated_status = "Risky"
            else:
              last_calculated_status = "Normal"
          else:
            last_calculated_status = "Normal"

        except Exception as db_err:
          print(f"Supabase Error: {db_err}")

        db_hr_list.clear()
        db_sys_list.clear()
        db_dia_list.clear()
        db_pti_list.clear()
        last_db_insert_time = current_time

  output_data = {
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
  await manager.broadcast(output_data)   # through manager send data all connected clientd

 # except WebSocketDisconnect:
 #   print("ESP32 Disconnected")

#research trends
#  React UI WebSocket Endpoint
@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
  await manager.connect(websocket)
  print("React Client Connected!")
  try:
    while True:
      await websocket.receive_text()
  except WebSocketDisconnect:
    manager.disconnect(websocket)
    print("React Client Disconnected")


# get last 20 records
@app.get("/api/vital-logs/recent")
async def get_recent_vital_logs():
    try:
        response = (
            supabase.table("vital_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"Error fetching recent logs: {e}")
        return []




# based on Selected Timeframe Data Records Route 
#trends
@app.get("/api/vital-logs/filtered")
async def get_filtered_vital_logs(timeframe: str = Query("daily")):
    try:
        query = supabase.table("vital_logs").select("*").order("created_at", desc=True)
        now = datetime.now(timezone.utc)

        # Last 20 Records
        if timeframe == "last20":
            query = query.limit(20)
            
        # Daily  24 h
        elif timeframe == "daily":
            start_time = (now - timedelta(days=1)).isoformat()
            query = query.gte("created_at", start_time)
            
        # Monthly h 30 day
        elif timeframe == "monthly":
            start_time = (now - timedelta(days=30)).isoformat()
            query = query.gte("created_at", start_time)
            
        # Lifetime -all  Records  (No Filter )

        response = query.execute()
        return response.data if response.data else []

    except Exception as e:
        print(f"Error fetching filtered logs: {e}")
        return []



#anootations
@app.get("/api/patient-activity-analytics")
async def get_patient_activity_analytics(selected_date: str = Query(...)):
    """
    selected_date format: 'YYYY-MM-DD'
    """
    try:
        start_time = f"{selected_date}T00:00:00Z"
        end_time = f"{selected_date}T23:59:59Z"

        # 1. Fetch BP Vitals for selected date
        vitals_res = (
            supabase.table("vital_logs")
            .select("created_at, heart_rate, systolic_bp, diastolic_bp")
            .gte("created_at", start_time)
            .lte("created_at", end_time)
            # .order("created_at", asc=True)
            .order("created_at", desc=False) # Ascending order
            .execute()
        )

        # 2. Fetch Events logged for selected date
        events_res = (
            supabase.table("patient_events")
            .select("id, event_time, activity_type, notes")
            .gte("event_time", start_time)
            .lte("event_time", end_time)
            # .order("event_time", asc=True)
            .order("event_time", desc=False) # Ascending order
            .execute()
        )

        return {
            "vitals": vitals_res.data if vitals_res.data else [],
            "events": events_res.data if events_res.data else []
        }

    except Exception as e:
        print(f"Error fetching analytics data: {e}")
        return {"vitals": [], "events": [], "error": str(e)}
    

# patient events add
@app.post("/api/patient-events")
async def create_patient_event(event: dict):
    try:
        res = supabase.table("patient_events").insert(event).execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5052)
