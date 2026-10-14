# Heart Rate & BP Monitoring

Owner: Hirushi Divyanjalie · Port: **5052** · UI: `frontend/src/pages/cardiovascular/Cardiovascular.jsx`

FastAPI server. The ESP32 + MAX30102 publishes `{ir, red, timestamp, battery, charging}` to the HiveMQ
topic `patient/vitals`; this server filters the PPG signal, finds the pulse peaks (heart rate, pulse
interval), predicts blood pressure with a Random-Forest model, streams everything to the website over
`WebSocket /ws/client`, and saves 5-second averages to Supabase (`vital_logs`).

## First-time setup
```bash
cd backend/cardiovascular
pip install -r requirements.txt
python train_model.py       # creates bp_model.joblib from collected_data.csv  (see note below)
python server.py            # http://127.0.0.1:5052
```
or double-click `start-cardiovascular.bat` / run `./start-cardiovascular.sh` in the project root.

> **bp_model.joblib:** the file in the shared zip was only a Git-LFS pointer (134 bytes), not the real
> model. Either copy your real `bp_model.joblib` into this folder, or run `python train_model.py` once.
> Without a model the server still runs, but blood pressure stays at the default 120/80.

Settings: `.env` (Supabase + MQTT credentials) – see `.env.example`. **Don't commit `.env`.**

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, MQTT / model / database flags (used by the website) |
| WS | `/ws/client` | live vitals stream |
| GET | `/api/vital-logs/recent` | last 20 records |
| GET | `/api/vital-logs/filtered?timeframe=` | `last20`, `daily`, `monthly`, anything else = all |
| GET | `/api/patient-activity-analytics?selected_date=YYYY-MM-DD` | vitals + annotations for one day |
| POST | `/api/patient-events` | add an annotation (`event_time`, `activity_type`, `notes`) |
