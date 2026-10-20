from collections import deque    #show chart smoothly
import json
import os
import time
from typing import List
import warnings
import asyncio
import paho.mqtt.client as mqtt   #mqtt cominication library
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
import joblib
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks, sosfilt, sosfilt_zi
from supabase import Client, create_client
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

from fastapi.middleware.cors import CORSMiddleware

#mqtt in backgrund thread
#filtering,ml prediction - main thread

def fetch_vitals_range(start_iso, end_iso):
    rows, offset, page = [], 0, 1000
    while True:
        batch = (
            supabase.table("vital_logs")
            .select("created_at, heart_rate, systolic_bp, diastolic_bp")
            .gte("created_at", start_iso)
            .lt("created_at", end_iso)
            .order("created_at", desc=False)
            .range(offset, offset + page - 1)
            .execute().data or []
        )
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


from zoneinfo import ZoneInfo
LOCAL_TZ = ZoneInfo("Asia/Colombo")

# Database & Warning Configurations
load_dotenv()
PORT = int(os.getenv("PORT", 5000))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

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

  async def broadcast(self, message: dict):
    conns = list(self.active_connections)
    if not conns:
      return
    results = await asyncio.gather(
        *(c.send_json(message) for c in conns), return_exceptions=True
    )
    for c, r in zip(conns, results):
      if isinstance(r, Exception):
        self.disconnect(c)    

manager = ConnectionManager()


# Data Buffers(python lists)
ir_buffer = []
timestamps = []

last_broadcast_time = 0.0

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
  low = lowcut / nyq         #get values 0-1 range
  high = highcut / nyq
  b, a = butter(1, [low, high], btype="band")
  return filtfilt(b, a, data)    # filtfilt filter twise forwrd and backwrd


#----- MQTT Configuration ----#
MQTT_HOST = os.getenv("MQTT_HOST")
MQTT_PORT = int(os.getenv("MQTT_PORT", 8883))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASS = os.getenv("MQTT_PASS")
MQTT_TOPIC = os.getenv("MQTT_TOPIC")
BP_MODEL_FILE = os.getenv("BP_MODEL_FILE")

main_loop = None
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

#---Create callback function(after successfully connect hivemq, subscribe topic) --#
def on_connect(client, userdata, flags, reason_code, properties=None):
    print("HiveMQ connected:", reason_code)
    client.subscribe(MQTT_TOPIC)

def save_and_evaluate(data_to_insert):
  """Runs in a worker thread so event loop never blocked."""
  supabase.table("vital_logs").insert(data_to_insert).execute()

  one_min_ago = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
  recent_data = (
      supabase.table("vital_logs")
      .select("heart_rate, systolic_bp")
      .gte("created_at", one_min_ago)
      .execute()
  )

  #-----------------------------------------------threshold for risk status 1min records-----------------------------------------------------------------------#
  if recent_data.data and len(recent_data.data) > 0:
    avg_1m_hr = np.mean([r["heart_rate"] for r in recent_data.data])
    avg_1m_sys = np.mean([r["systolic_bp"] for r in recent_data.data])

    if avg_1m_hr > 120 or avg_1m_hr < 45 or avg_1m_sys > 140 or avg_1m_sys < 90:
     return "Critical"
    elif avg_1m_hr > 100 or avg_1m_hr < 50 or avg_1m_sys > 130 or avg_1m_sys < 100:
      return "Risky"
    return "Normal"
  return "Normal"


#when recieve msg from mqtt ->send to asynchorns loop run in backgrund 
def on_message(client, userdata, msg):
   # print("MQTT msg received")
    try:
        payload = json.loads(msg.payload.decode())       #convert byte data(mqtt) into text string
        # asyncio.run_coroutine_threadsafe(process_sample(payload), main_loop)
        fut = asyncio.run_coroutine_threadsafe(process_sample(payload), main_loop)                #payload -> mainloop, then run in background process_sample(payload), fut track background process

        fut.add_done_callback(                    # when error occur in fut process
           lambda f: f.exception() and print("process_sample error:", repr(f.exception()))
           )

    except Exception as e:
        print("MQTT message error:", e)

        


#connection start with mqtt
@app.on_event("startup")
async def start_mqtt():
    global main_loop
    main_loop = asyncio.get_running_loop()       #catch fast api async loop ad run it globally(to recieve fata from mqtt)
    mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
    mqtt_client.tls_set()          # TLS for port 8883
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.connect(MQTT_HOST, MQTT_PORT)
    mqtt_client.loop_start()          #start new background thread, when run server simultaniously recieve data though mqtt



#--------------------------------------------- ESP32 WebSocket Endpoint -------------------------------------------------------#
#--- @app.websocket("/ws/sensor")
#-- async def websocket_sensor(websocket: WebSocket):
#-- global last_db_insert_time, last_calculated_status

#extract data points
async def process_sample(payload):
  global last_db_insert_time, last_calculated_status, last_broadcast_time

  # seperate ppg senser data
  ir_val = payload.get("ir", 0)
  red_val = payload.get("red", 0)
  ts = payload.get("timestamp", 0)

  # (ESP32 -> battery level 0-100 & is_charging boolean )
  battery_level = payload.get("battery", 100)
  is_charging = payload.get("charging", False)

  # Finger Detection Threshold Check - clean buffer because with old values, when put finger can show fals reading
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
    last_broadcast_time = 0

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
    # await manager.broadcast(output_data)

    current_broadcast = time.time()

    if current_broadcast - last_broadcast_time >= 0.2:
      await manager.broadcast(output_data)
      last_broadcast_time = current_broadcast

    return   #stop reading, bcz not finger detect

  
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
      fs = 1000.0 / mean_diff_ms      #sampling frquency 1sec=1000ms
    else:
      fs = 50.0

   #---------------------------Detrending/Baseline remove----------------------------------#
    raw_signal = np.array(ir_buffer)           #convert ir buffer into numpy array for mathemticl purpose
    detrended = raw_signal - np.mean(raw_signal)

    try:
      lowcut = 0.7               #42bpm
      highcut = min(3.0, (fs / 2.0) - 0.1)      #180bpm/use nyquist
      if highcut > lowcut:
        filtered_ir = bandpass_filter(detrended, lowcut=lowcut, highcut=highcut, fs=fs)
        #= float(filtered_ir[-1])
        #smoothed_wave_val = 0.0
        smoothed_wave_val = float(filtered_ir[-1])          #last value of filtered ir
      else:
        filtered_ir = detrended
        smoothed_wave_val = float(filtered_ir[-1])
    except Exception:
      filtered_ir = detrended
      smoothed_wave_val = float(filtered_ir[-1])               #stop server crash

     #---------------------peak detection-------------------------------------#
    min_dist = max(int(fs / 3.0), 5)           # min distace between 2 heartbbeat...normally 1min hr =180 =180/60= 3.0(time for 1 beat)
    std_val = np.std(filtered_ir)           #standard deviaton:how much go and down ir value
    prom_val = max(std_val * 0.3, 2.0)       # decide howmuch clear the peaks: get 30% from sd, if value large give large value, stop system give wrong outputs for wrong signals


     #--------------identify peaks--------------------------------------------#
    peaks, _ = find_peaks(-filtered_ir, distance=min_dist, prominence=prom_val)  # - under waves disply as up
    if len(peaks) < 2:
      peaks, _ = find_peaks(filtered_ir, distance=min_dist, prominence=prom_val)   

    if len(peaks) >= 2:
      peak_times = [timestamps[p] / 1000.0 for p in peaks]        #convert to second
      intervals = np.diff(peak_times)    # in second

      # print(f"buf={len(ir_buffer)} fs={fs:.1f} peaks={len(peaks)}")

      if len(intervals) > 0:
        raw_pti = float(intervals[-1] * 1000)    # latest time interval in ms in 2 peak
        raw_inst_hr = float(60.0 / intervals[-1])     #BPM - 2 peak- real time hr
        raw_avg_hr = float(60.0 / np.mean(intervals))    #lats all peaks
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

          #---------------------To realtime dashbord stremaing------------------------------#
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

        # clear BEFORE awaiting, so new samples are not lost
        db_hr_list.clear()
        db_sys_list.clear()
        db_dia_list.clear()
        db_pti_list.clear()
        last_db_insert_time = current_time

        #=----------------------------risk status measure insert to db------------------------------------------------------#
        is_hr_normal = 50 <= final_hr <= 100
        is_bp_normal = (90 <= final_sys <= 120) and (60 <= final_dia <= 80)
        data_to_insert = {
            "heart_rate": final_hr,
            "systolic_bp": final_sys,
            "diastolic_bp": final_dia,
            "pulse_interval": final_pti,
            "patient_status": "Normal" if (is_hr_normal and is_bp_normal) else "Risky",
        }
        try:
          last_calculated_status = await asyncio.to_thread(save_and_evaluate, data_to_insert)
        except Exception as db_err:
          print(f"Supabase Error: {db_err}")

  ts = int(time.time() * 1000)      #convert timestamp to local time
  output_data = {
     "timestamp": ts,
      "red": red_val,
      #"ir": smoothed_wave_val,
      "ir": smoothed_wave_val,
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
##async 
def get_recent_vital_logs():
    try:
        response = (
            supabase.table("vital_logs")
            .select("*")
            .order("created_at", desc=True)   #new data 1st
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
#async 
def get_filtered_vital_logs(timeframe: str = Query("daily")):
    try:
        query = supabase.table("vital_logs").select("*").order("created_at", desc=True)
        now = datetime.now(timezone.utc)
            
        # Daily  24 h
        if timeframe == "daily":
            start_time = (now - timedelta(days=1)).isoformat()
            query = query.gte("created_at", start_time)
            
        # Monthly h 30 day
        elif timeframe == "monthly":
            start_time = (now - timedelta(days=30)).isoformat()
            query = query.gte("created_at", start_time)

        elif timeframe == "monthly":
             start_time = (now - timedelta(days=30)).isoformat()
             query = query.gte("created_at", start_time)

        response = query.execute()
        return response.data or []
    except Exception as e:
        print(f"Error fetching filtered logs: {e}")
        return []
            
    






#anootations
#@app.get("/api/patient-activity-analytics")
#async 

"""
def get_patient_activity_analytics(selected_date: str = Query(...)):
    
    try:
        start_time = f"{selected_date}T00:00:00Z"
        end_time = f"{selected_date}T23:59:59Z"

        # Fetch BP Vitals for selected date
        vitals_res = (
            supabase.table("vital_logs")
            .select("created_at, heart_rate, systolic_bp, diastolic_bp")
            .gte("created_at", start_time)
            .lte("created_at", end_time)
            .order("created_at", desc=False) # Ascending order
            .execute()
        )

        # Fetch Events logged for selected date
        events_res = (
            supabase.table("patient_events")
            .select("id, event_time, activity_type, notes")
            .gte("event_time", start_time)
            .lte("event_time", end_time)
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
"""

@app.get("/api/patient-activity-analytics")
def get_patient_activity_analytics(selected_date: str = Query(...)):
    try:
        day = datetime.strptime(selected_date, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
        start_time = day.astimezone(timezone.utc).isoformat()
        end_time = (day + timedelta(days=1)).astimezone(timezone.utc).isoformat()

        vitals = fetch_vitals_range(start_time, end_time)

        events_res = (
            supabase.table("patient_events")
            .select("id, event_time, activity_type, notes")
            .gte("event_time", start_time)
            .lt("event_time", end_time)
            .order("event_time", desc=False)
            .execute()
        )
        return {"vitals": vitals, "events": events_res.data or []}
    except Exception as e:
        print(f"Error fetching analytics data: {e}")
        return {"vitals": [], "events": [], "error": str(e)}



@app.get("/api/patient-activity-analytics")
def get_patient_activity_analytics(selected_date: str = Query(...)):
    try:
        day = datetime.strptime(selected_date, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
        start_time = day.astimezone(timezone.utc).isoformat()
        end_time = (day + timedelta(days=1)).astimezone(timezone.utc).isoformat()
        
        vitals_res = supabase.table("vital_logs").select("*").gte("created_at", start_time).lt("created_at", end_time).execute()
        events_res = supabase.table("patient_events").select("*").gte("event_time", start_time).lt("event_time", end_time).execute()
        
        return {"vitals": vitals_res.data or [], "events": events_res.data or []}
    except Exception as e:
        return {"vitals": [], "events": [], "error": str(e)}

@app.get("/api/patient-activity-analytics")
def get_patient_activity_analytics(selected_date: str = Query(...)):
    try:
        day = datetime.strptime(selected_date, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
        start_time = day.astimezone(timezone.utc).isoformat()
        end_time = (day + timedelta(days=1)).astimezone(timezone.utc).isoformat()

        vitals = fetch_vitals_range(start_time, end_time)

        events_res = (
            supabase.table("patient_events")
            .select("id, event_time, activity_type, notes")
            .gte("event_time", start_time)
            .lt("event_time", end_time)
            .order("event_time", desc=False)
            .execute()
        )
        return {"vitals": vitals, "events": events_res.data or []}
    except Exception as e:
        print(f"Error fetching analytics data: {e}")
        return {"vitals": [], "events": [], "error": str(e)}

# patient events add
@app.post("/api/patient-events")
#async 
def create_patient_event(event: dict):
    try:
        res = supabase.table("patient_events").insert(event).execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}









if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=True)
