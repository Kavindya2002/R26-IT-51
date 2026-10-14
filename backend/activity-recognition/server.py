# =========================================================
# CONTEXT-AWARE FALL DETECTION FLASK SERVER
# =========================================================

from flask import Flask, request, jsonify
from flask_cors import CORS

import pickle
import numpy as np
import pandas as pd
import json
import os
import ssl
import paho.mqtt.client as mqtt

from fall_engine import FallEngine, generate_human_message


# =========================================================
# CONFIG
# =========================================================

WINDOW_SIZE = 20

FEATURES = [
    "ax",
    "ay",
    "az",
    "gx",
    "gy",
    "gz",
    "mag"
]

CONFIDENCE_THRESHOLD = 0.60

# =========================================================
# LOAD MODEL
# =========================================================

with open("fall_rf_model.pkl", "rb") as f:
    rf = pickle.load(f)

with open("scaler.pkl", "rb") as f:
    scaler = pickle.load(f)

with open("label_encoder.pkl", "rb") as f:
    le = pickle.load(f)

CLASSES = list(le.classes_)

print("\n==============================")
print("MODEL LOADED")
print("==============================")
print("Classes:", CLASSES)
print("==============================\n")

# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)   #create a new Flask app instance
CORS(app)   #enable Cross-Origin Resource Sharing (CORS) for the Flask app

# =========================================================
# MQTT CONFIG (HiveMQ Cloud)
# =========================================================

MQTT_BROKER = os.getenv("MQTT_BROKER", "48d92cd1b9814701b2c4559d693e4ce3.s1.eu.hivemq.cloud")
MQTT_PORT = 8883

MQTT_USERNAME = os.getenv("MQTT_USERNAME", "elder")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "Elder123456")
MQTT_TOPIC = "elder/device01/imu"

latest_sensor = {}   #this variable to hold the latest sensor data received via MQTT

def on_connect(client, userdata, flags, rc):   #broker connection, subscribe to the topic
    print("MQTT connected with code", rc)
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):  #on receiving a message, decode the payload and store it in the global variable
    global latest_sensor
    try:
        latest_sensor = json.loads(msg.payload.decode())
        print("MQTT:", latest_sensor)
    except Exception as e:
        print("MQTT error:", e)

try:
    # paho-mqtt 2.x needs the callback API version; 1.x does not have it   
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)      #create a new MQTT client
except AttributeError:
    mqtt_client = mqtt.Client()
mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)     #login to the broker with username and password
mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)          #connect to the broker using TLS and check the server certificate
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)    #connect to the broker and start the loop to process incoming messages
mqtt_client.loop_start()

# =========================================================
# FEATURE EXTRACTION
# =========================================================

def extract_features_from_window(window_df):

    feats = []

    data = window_df[FEATURES].values

    for i in range(len(FEATURES)):

        col_data = data[:, i]

        # mean
        feats.append(np.mean(col_data))

        # std
        feats.append(np.std(col_data))

        # min
        feats.append(np.min(col_data))

        # max
        feats.append(np.max(col_data))

        # range
        feats.append(np.max(col_data) - np.min(col_data))

        # RMS
        feats.append(np.sqrt(np.mean(col_data ** 2)))

        # IQR
        feats.append(
            np.percentile(col_data, 75)
            - np.percentile(col_data, 25)
        )

    # correlations

    ax = data[:, 0]
    ay = data[:, 1]
    az = data[:, 2]

    feats.append(np.corrcoef(ax, ay)[0, 1])
    feats.append(np.corrcoef(ax, az)[0, 1])
    feats.append(np.corrcoef(ay, az)[0, 1])

    return np.array(feats, dtype=np.float32)

# =========================================================
# CONTEXT + FALL-CONFIRMATION ENGINE  (see fall_engine.py)
# =========================================================
#
# ISSUE-1 FIX: previously, `direction` and the "fall" verdict came ONLY
# from the ML model's class probabilities, so any window that merely
# resembled a recorded fall session (even a small lean) was reported as
# a fall. FallEngine adds a physics-based confirmation layer: an event is
# only escalated to "confirmed_fall" once (a) the ML model predicts a
# fall class, (b) the tilt angle and impact spike cross real thresholds,
# and (c) the body stays down/still afterwards. Small leans are reported
# as "leaning" or "normal", not a fall. See fall_engine.Thresholds to tune.
#
# One FallEngine instance = one monitored wearer/device. This demo uses a
# single global instance because there is one wearable in the system
# diagram; if you extend to multiple wearers, keep one engine per
# device_id in a dict instead (see README_GUIDE.md section 3).
# =========================================================

fall_engine = FallEngine()


def build_context(pred_label, confidence, probabilities, df_window):
    """
    Runs the physics confirmation + proactive risk scoring engine and
    turns the result into (context_dict, human_message) - kept as two
    return values so the existing /predict response shape below still
    works, just with richer content.
    """

    if confidence < CONFIDENCE_THRESHOLD:
        engine_result = {
            "event": "uncertain",
            "state": fall_engine.state,
            "direction": None,
            "risk_score": 0.0,
            "risk_level": "unknown",
            "risk_trend": "stable",
            "signals": {},
            "trigger_factors": [],
            "previous_activity": fall_engine._previous_activity(),
        }
        human_message = (
            "Movement detected but confidence is too low for reliable "
            "interpretation."
        )
        return engine_result, human_message

    engine_result = fall_engine.update(
        pred_label, confidence, probabilities, df_window
    )
    human_message = generate_human_message(engine_result, pred_label, confidence)

    return engine_result, human_message

# =========================================================
# HEALTH   - check it every 4 seconds
# =========================================================

@app.route("/health", methods=["GET"])
def health():

    return jsonify({
        "status": "ok",
        "classes": CLASSES,
        "window_size": WINDOW_SIZE
    })

    # =========================================================
# LATEST MQTT DATA -  every 100ms, the wearable sends the latest sensor data to the MQTT broker, and this endpoint returns the latest received data
# =========================================================

@app.route("/latest", methods=["GET"])
def latest():
    return jsonify(latest_sensor)

# =========================================================
# RESET FALL ENGINE - clear the memory (state,risk history)
# =========================================================
   
@app.route("/reset", methods=["POST"])
def reset_engine():
    global fall_engine
    fall_engine = FallEngine()
    return jsonify({"status": "reset"})

# =========================================================
# PREDICT
# =========================================================

@app.route("/predict", methods=["POST"])
def predict():

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "error": "No JSON received"
            }), 400

        window = data.get("window")    #get the "window" key from the JSON data

        if window is None:

            return jsonify({
                "error": "Missing 'window'"
            }), 400

        # =================================================
        # CONVERT TO NUMPY
        # =================================================

        rows = []

        for sample in window:

            rows.append([

                float(sample["ax"]),
                float(sample["ay"]),
                float(sample["az"]),

                float(sample["gx"]),
                float(sample["gy"]),
                float(sample["gz"]),

                float(sample["mag"])

            ])

        window = np.array(rows, dtype=np.float32)

        # =================================================
        # VALIDATE SHAPE
        # =================================================

        if window.shape != (WINDOW_SIZE, 7):

            return jsonify({
                "error":
                f"Expected shape ({WINDOW_SIZE}, 7), got {window.shape}"
            }), 400

        # =================================================
        # DATAFRAME
        # =================================================

        df_window = pd.DataFrame(
            window,
            columns=FEATURES
        )

        # =================================================
        # FEATURE EXTRACTION
        # =================================================

        feats = extract_features_from_window(
            df_window
        )

        # =================================================
        # SCALE
        # =================================================

        feats_scaled = scaler.transform([feats])

        # =================================================
        # PREDICT
        # =================================================

        pred_encoded = rf.predict(
            feats_scaled
        )[0]

        probs = rf.predict_proba(
            feats_scaled
        )[0]

        pred_label = le.inverse_transform(
            [pred_encoded]
        )[0]

        confidence = float(np.max(probs))

        # =================================================
        # PROBABILITY DICT
        # =================================================

        probabilities = {}

        for cls, prob in zip(CLASSES, probs):

            probabilities[cls] = float(prob)

        # =================================================
        # LOW CONFIDENCE FILTER
        # =================================================

        if confidence < CONFIDENCE_THRESHOLD:

            pred_label = "uncertain"

        # =================================================
        # CONTEXT ENGINE
        # =================================================

        context, human_message = build_context(
            pred_label,
            confidence,
            probabilities,
            df_window
        )

        # =================================================
        # RESPONSE
        # =================================================

        fall_alert = context.get("event") in (
            "possible_fall", "confirming", "confirmed_fall"
        )

        return jsonify({

            "label": pred_label,

            "confidence": confidence,

            "probabilities": probabilities,

            "context": context,

            "human_message": human_message,

            "fall_alert": fall_alert
        })

    except Exception as e:

        print("\n==============================")
        print("PREDICT ERROR")
        print("==============================")
        print(str(e))
        print("==============================\n")

        return jsonify({
            "error": str(e)
        }), 500

# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":      #run the Flask server 

    print("Starting Flask server on port 5050...\n")

    app.run(
        host="0.0.0.0",
        port=5050,
        debug=True,
        use_reloader=False   # the reloader would start a second MQTT client
    )