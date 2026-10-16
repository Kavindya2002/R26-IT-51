import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, MapPin, Wifi, WifiOff, Server, Radio, Cpu, Camera, ShieldAlert, ChevronDown
} from "lucide-react";
import { envRiskApi, ENV_API_URL, POLL_MS } from "../../lib/envRiskApi.js";
import RiskMap from "./RiskMap.jsx";
import SensorCard from "./SensorCard.jsx";
import CameraTile from "./CameraTile.jsx";
import { riskOf } from "./riskStyle.js";

// ─────────────────────────────────────────────────────────────
//  Environmental Risk Mapping & Smart Safety Zone System
//  Owner: Sashini Diwyangii
//  Backend: backend/environmental-risk/server.py   (port 5051)
//  Backend URL is read from .env → VITE_ENV_RISK_API_URL
// ─────────────────────────────────────────────────────────────
export const API_URL = ENV_API_URL;

function Stat({ label, value, tone = "text-ink" }) {
  return (
    <div className="rounded-2xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children, right }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold text-ink">
          <Icon size={22} className="text-sky-600" /> {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function EnvironmentalRisk() {
  const [data, setData] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null); // null = checking
  const [debugOpen, setDebugOpen] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await envRiskApi.state());
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  const devices = data?.devices || [];
  const zones = data?.zones || [];
  const sensors = devices.filter((d) => d.device_type === "sensor_node");
  const cameras = devices.filter((d) => d.device_type === "camera");
  const sum = data?.summary;
  const mqttOk = data?.mqtt?.connected;

  return (
    <div className="relative min-h-screen overflow-hidden pt-28 pb-24" style={{ background: "linear-gradient(160deg,#EEF6FF 0%,#E2EFFC 45%,#E6F6F5 100%)" }}>
      <div className="container-xl relative">
        <Link to="/dashboard" className="mb-5 inline-flex items-center gap-1.5 text-base font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft size={18} /> Back to dashboard
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-base font-semibold text-sky-700">Module 02 · Owner: Sashini Diwyangii</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-ink md:text-5xl">
              Environmental Risk Mapping
            </h1>
            <p className="mt-2 max-w-2xl text-lg text-slate-600">
              Smart safety zones that detect high-risk areas from light, obstacles, floor moisture and motion — with live camera.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${
              backendOnline ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {backendOnline ? <Server size={15} /> : <WifiOff size={15} />}
              {backendOnline === null ? "Checking backend…" : backendOnline ? "Backend online" : "Backend offline"}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${
              mqttOk ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
              {mqttOk ? <Wifi size={15} /> : <WifiOff size={15} />}
              {mqttOk ? "MQTT connected" : "MQTT disconnected"}
            </span>
          </div>
        </motion.div>

        {backendOnline === false && (
          <div className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-red-200">
            <p className="font-semibold text-red-700">Can't reach the Environmental Risk backend at {ENV_API_URL}</p>
            <p className="mt-2 text-slate-600">Start it in a new terminal:</p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100">{`cd backend/environmental-risk
pip install -r requirements.txt
python server.py`}</pre>
            <p className="mt-2 text-sm text-slate-500">(or double-click <code>start-environmental.bat</code> / run <code>./start-environmental.sh</code>)</p>
          </div>
        )}

        {backendOnline && sum && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Devices" value={sum.devices} />
              <Stat label="Connected" value={sum.online} tone="text-emerald-600" />
              <Stat label="Disconnected" value={sum.offline} tone={sum.offline ? "text-red-600" : "text-ink"} />
              <Stat label="Sensor nodes" value={sum.sensor_nodes} />
              <Stat label="Cameras" value={sum.cameras} />
              <Stat label="High-risk zones" value={sum.high_risk_zones} tone={sum.high_risk_zones ? "text-red-600" : "text-ink"} />
            </div>

            {/* ── Zone summary ── */}
            <Section icon={ShieldAlert} title="Zone risk summary">
              {zones.length === 0 ? (
                <p className="rounded-2xl bg-white/80 p-5 text-slate-600 ring-1 ring-slate-200">No zones detected from MQTT yet — waiting for device discovery.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {zones.map((z) => {
                    const r = riskOf(z.risk_level);
                    return (
                      <div key={z.zone_id} className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-200">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-lg font-semibold text-ink">{z.zone_id}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${r.chip}`}>{z.risk_level}</span>
                        </div>
                        <p className="mt-3 font-display text-4xl font-semibold" style={{ color: r.hex }}>{z.risk_score}</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${z.risk_score}%`, background: r.hex }} />
                        </div>
                        <p className="mt-3 text-sm text-slate-500">Devices: {z.devices_online}/{z.devices_total} connected</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ── 3D map ── */}
            <Section icon={MapPin} title="Dynamic 3D risk map">
              <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
                <RiskMap zones={zones} devices={devices} />
                <p className="px-2 pb-1 text-sm text-slate-500">
                  Zones and devices are generated from MQTT discovery. Box colour = zone risk (green low · amber medium · red high). Round marker = sensor node, diamond = camera; green/red = online/offline.
                </p>
              </div>
            </Section>

            {/* ── Live sensors ── */}
            <Section icon={Radio} title="Live sensor data">
              {sensors.length === 0 ? (
                <p className="rounded-2xl bg-white/80 p-5 text-slate-600 ring-1 ring-slate-200">No sensor nodes discovered.</p>
              ) : (
                <div className="grid gap-5">
                  {sensors.map((d) => <SensorCard key={d.device_id} device={d} onChanged={load} />)}
                </div>
              )}
            </Section>

            {/* ── Cameras ── */}
            <Section icon={Camera} title="Live cameras + YOLO">
              {cameras.length === 0 ? (
                <p className="rounded-2xl bg-white/80 p-5 text-slate-600 ring-1 ring-slate-200">
                  No cameras discovered yet. The ESP32-CAM discovery message is required.
                </p>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {cameras.map((d) => <CameraTile key={d.device_id} device={d} />)}
                </div>
              )}
              {data.yolo?.error && cameras.length > 0 && (
                <p className="mt-3 text-sm text-amber-700">YOLO: {data.yolo.error}</p>
              )}
            </Section>

            {/* ── Devices + debug ── */}
            <Section icon={Cpu} title="Devices">
              <div className="overflow-x-auto rounded-3xl bg-white shadow-md ring-1 ring-slate-200">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-100">
                      {["Device", "Type", "Zone", "IP", "RSSI", "Status", "Last seen"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {devices.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-slate-500">Waiting for device discovery…</td></tr>
                    )}
                    {devices.map((d) => (
                      <tr key={d.device_id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 font-semibold text-ink">{d.device_id}</td>
                        <td className="px-4 py-3">{d.device_type}</td>
                        <td className="px-4 py-3">{d.zone_id || "-"}</td>
                        <td className="px-4 py-3 font-mono">{d.ip || "-"}</td>
                        <td className="px-4 py-3">{d.rssi != null ? `${d.rssi} dBm` : "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${d.status === "ONLINE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{d.status}</span>
                        </td>
                        <td className="px-4 py-3">{d.last_seen ? `${d.seconds_since_seen ?? 0}s ago` : "never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Connected = message received within the last {data.offline_timeout}s. Disconnected devices stay listed for identification.
              </p>

              <button onClick={() => setDebugOpen((o) => !o)} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
                MQTT / YOLO debug <ChevronDown size={16} className={`transition-transform ${debugOpen ? "rotate-180" : ""}`} />
              </button>
              {debugOpen && (
                <div className="mt-3 rounded-2xl bg-white p-5 text-sm text-slate-700 ring-1 ring-slate-200">
                  <p>MQTT host: <span className="font-mono">{data.mqtt.host}:{data.mqtt.port}</span> · topic <span className="font-mono">{data.mqtt.topic}</span></p>
                  <p className="mt-1">Messages received: {data.mqtt.message_count} · last state change: {data.mqtt.last_change || "-"}</p>
                  <p className="mt-1">MQTT error: {data.mqtt.last_error || "-"}</p>
                  <p className="mt-1">YOLO model: <span className="font-mono">{data.yolo.model}</span> · available: {String(data.yolo.available)} · loading: {String(data.yolo.loading)} · error: {data.yolo.error || "-"}</p>
                  {data.mqtt.last_message && (
                    <>
                      <p className="mt-3 font-semibold">Last MQTT message</p>
                      <p className="font-mono text-xs">{data.mqtt.last_message.topic}</p>
                      <pre className="mt-1 max-h-60 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(data.mqtt.last_message.payload, null, 2)}</pre>
                    </>
                  )}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
