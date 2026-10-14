# Environmental Risk Mapping & Smart Safety Zones

Owner: Sashini Diwyangii · Port: **5051** · UI: `frontend/src/pages/environmental/`

Flask version of the original Streamlit app (`WebServer/main.py`). It subscribes to the
HiveMQ broker (`eldercare/#`), tracks devices and zones, scores risk, drives the buzzer and
runs YOLO on the ESP32-CAM streams. The React page polls it once a second.

## Run
```bash
cd backend/environmental-risk
pip install -r requirements.txt
python server.py          # http://127.0.0.1:5051
```
or double-click `start-environmental.bat` (Windows) / `./start-environmental.sh` in the project root.

Settings are in `backend/environmental-risk/.env` (MQTT_HOST / PORT / USERNAME / PASSWORD,
optional YOLO_MODEL, DEVICE_OFFLINE_TIMEOUT …). See `.env.example`. **Don't commit `.env`.**

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status:"ok", mqtt_connected}` – used by the website |
| GET | `/api/state` | devices, zones, risk scores, MQTT + YOLO status (poll every 1 s) |
| POST | `/api/buzzer/<device_id>` | body `{"state": true/false}` → MQTT command to the node |
| POST | `/api/calibrate/<device_id>` | save current moisture reading as the dry-floor baseline |
| GET | `/camera/<device_id>/stream` | YOLO-annotated MJPEG stream |
| GET | `/camera/<device_id>/snapshot` | latest annotated JPEG |

## Risk score (per sensor node, 0–100; a zone = its highest node)
Light (<20 lx +30, <50 +20, <100 +10) · Obstacle distance (<300 mm +35, <600 +20, <1000 +5) ·
Floor wetness vs dry baseline (≥75 % +30, ≥50 % +20, ≥25 % +10) · Motion +5.
LOW < 31 · MEDIUM < 61 · HIGH ≥ 61. Wetness ≥ 30 % switches the buzzer on automatically, ≤ 20 % off.

## Notes
- Don't run this server and the old Streamlit app together with the same MQTT client id
  (this server uses `aegiscare-env-risk`, the old app used `eldercare-streamlit`).
- `tools/` keeps the dataset-labelling tool (`data_labeller.py`, Streamlit) and `eldercare_dataset.csv`.
- OpenCV / ultralytics are optional – without them everything works except the camera tiles.
