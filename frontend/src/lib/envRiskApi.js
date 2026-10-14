// Wraps the Flask API of backend/environmental-risk/server.py (port 5051):
//   GET  /health                     -> { status, mqtt_connected }
//   GET  /api/state                  -> { mqtt, yolo, summary, zones[], devices[] ... }
//   POST /api/buzzer/<device_id>     -> { ok }       body: { state: true|false }
//   POST /api/calibrate/<device_id>  -> { ok }       sets the "dry floor" baseline
//   GET  /camera/<device_id>/stream  -> MJPEG stream (YOLO-annotated)
//
// Change the URL with VITE_ENV_RISK_API_URL in frontend/.env.

export const ENV_API_URL = import.meta.env.VITE_ENV_RISK_API_URL || "http://127.0.0.1:5051";

async function request(path, options) {
  const res = await fetch(`${ENV_API_URL}${path}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new Error(data?.error || `${path} responded ${res.status}`);
  return data;
}

export const envRiskApi = {
  health: () => request("/health"),
  state: () => request("/api/state"),
  setBuzzer: (deviceId, state) =>
    request(`/api/buzzer/${encodeURIComponent(deviceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    }),
  calibrateDry: (deviceId) =>
    request(`/api/calibrate/${encodeURIComponent(deviceId)}`, { method: "POST" }),
  streamUrl: (deviceId) => `${ENV_API_URL}/camera/${encodeURIComponent(deviceId)}/stream`
};

export const POLL_MS = 1000;
