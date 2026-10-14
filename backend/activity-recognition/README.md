# Context-Aware Activity Recognition — backend

Owner: Kavindya Chathuri · Port: **5050**

```
server.py          Flask API + HiveMQ MQTT subscriber (loads the Random Forest)
fall_engine.py     physics-based fall confirmation, risk score, explanations
fall_rf_model.pkl  scaler.pkl  label_encoder.pkl     trained model files
FallDetection/     train.py + the recorded dataset (CSV) + training plots
firmware/          FallDetection.ino  (ESP8266 + BMI160)
tools/             DataCollector.html (record data)  ·  Analyzer.standalone.html (old single-file viewer)
```

## Run
```bash
pip install -r requirements.txt
python server.py
```

## API used by the website
| Endpoint | Purpose |
|---|---|
| `GET /health` | status + class list |
| `GET /latest` | newest IMU sample received over MQTT (`{}` until the device sends one) |
| `POST /predict` | body `{window: [20 samples]}` → label, confidence, probabilities, context (fall-engine result), human_message |
| `POST /reset` | clears the fall engine (used by the "Reset alert" button) |

MQTT broker settings are at the top of `server.py` (override with the env vars
`MQTT_BROKER`, `MQTT_USERNAME`, `MQTT_PASSWORD`).

> The device (`firmware/FallDetection.ino`) and `server.py` must use the **same** broker.
> The `.ino` in this folder points to EMQX, `server.py` to HiveMQ — make sure the
> version you flashed matches.
