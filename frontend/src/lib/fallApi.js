// Wraps the Flask endpoints exposed by backend/activity-recognition/server.py:
//   GET  /health   -> { status, classes: [...], window_size }
//   GET  /latest   -> { ax, ay, az, gx, gy, gz, mag }   ({} until the device sends data)
//   POST /predict  -> { label, confidence, probabilities, context, human_message, fall_alert }
//   POST /reset    -> { status: "reset" }   (clears the server-side fall engine)
//
// Set VITE_API_BASE_URL in frontend/.env if server.py isn't on the default
// http://127.0.0.1:5050.

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5050";

async function getJSON(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

export const fallApi = {
  health: () => getJSON("/health"),
  latest: () => getJSON("/latest"),
  predict: (window) => postJSON("/predict", { window }),
  reset: () => postJSON("/reset")
};

export const WINDOW_SIZE = 20; // must match server.py / train.py
export const PRED_EVERY = 10; // run a new prediction every N samples
export const POLL_INTERVAL_MS = 100; // matches the 10Hz publish rate
