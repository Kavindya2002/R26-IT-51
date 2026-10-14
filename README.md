# AegisCare — Multimodal Intelligent Fall Monitoring System (R26_IT_051)

One folder, frontend + backend for all four modules.

```
AegisCare/
├── frontend/                     React + Vite website (landing, login, dashboard, module pages)
│   └── src/pages/
│       ├── analyzer/             ✅ Context-Aware Activity Recognition (live)
│       ├── environmental/        ✅ Environmental Risk Mapping (live)
│       ├── cardiovascular/       ✅ Heart Rate & BP Monitoring (live)
│       └── alerts/               placeholder  → Smart Alert System
└── backend/
    ├── activity-recognition/     ✅ Flask + ML model + fall engine + firmware   (port 5050)
    ├── environmental-risk/       ✅ Flask + MQTT + risk engine + YOLO cameras      (port 5051)
    ├── cardiovascular/           ✅ FastAPI + MQTT + PPG/BP model + Supabase       (port 5052)
    └── alerts/                   placeholder server.py                          (port 5053)
```

## Run (two terminals)

**1. Backend** (Python 3.11+)
```bash
cd backend/activity-recognition
pip install -r requirements.txt
python server.py            # http://127.0.0.1:5050
```

**2. Website** (Node 18+)
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
Windows shortcut: double-click `start-backend.bat` and `start-frontend.bat`.

Login: `admin` / `AegisCare@2026` → Enter Dashboard → click **Context-Aware Activity
Recognition** → type the wearer's name → live dashboard.

`frontend/.env` already holds your API / Supabase settings (see `frontend/.env.example`).

## Run the Environmental Risk Mapping module (third terminal)
```bash
cd backend/environmental-risk
pip install -r requirements.txt
python server.py            # http://127.0.0.1:5051   (or start-environmental.bat / .sh)
```
Dashboard → click **Environmental Risk Mapping** → `/dashboard/environmental-risk`.
Details: `backend/environmental-risk/README.md`.

## Run the Heart Rate & BP Monitoring module (fourth terminal)
```bash
cd backend/cardiovascular
pip install -r requirements.txt
python train_model.py       # first time only - creates bp_model.joblib
python server.py            # http://127.0.0.1:5052   (or start-cardiovascular.bat / .sh)
```
Dashboard → click **Heart Rate And BP Monitoring** → `/dashboard/cardiovascular`.
Run `npm install` in `frontend/` once (the page uses `recharts`). Details: `backend/cardiovascular/README.md`.

## What the Activity Recognition dashboard does

| Layer | Where | Role |
|---|---|---|
| Random Forest | `backend/.../server.py` | classifies the last 2 s (20 samples) of IMU data |
| Fall engine | `backend/.../fall_engine.py` | tilt + stillness confirmation, fall-risk score 0–100, explanations |
| Posture decision | `frontend/src/lib/postureEngine.js` | instant tilt-angle rules + AI gate → colour/level on the page |

Posture levels (angle from upright; sliders on the page change the two limits):

| Tilt | Level | Fall? |
|---|---|---|
| < 15° | Upright (green) | no |
| 15°–30° | Slight tilt, e.g. "LEFT TILT" (blue) | no |
| 30°–40° | Losing balance (amber) — early warning | not yet |
| ≥ 40° (0.2 s) **or** AI "…_fall" ≥ 60 % while tilt ≥ 30° | **FALL** (red) | yes |

## Adding a teammate's module
1. Copy their server code into `backend/<module>/` (keep `GET /health`).
2. Build their UI in the matching `frontend/src/pages/<module>/` file (replace `<ModuleShell />`).
3. Their backend URL is read from `frontend/.env` (`VITE_ENV_RISK_API_URL`, `VITE_CARDIO_API_URL`, `VITE_ALERTS_API_URL`).

## Notes
- Device firmware and `server.py` must publish/subscribe on the **same** MQTT broker
  (`firmware/FallDetection.ino` currently points to EMQX, `server.py` to HiveMQ).
- Login is hard-coded for the demo (`frontend/src/context/AuthContext.jsx`).
- Don't publish `frontend/.env` or the MQTT passwords to a public repo.
