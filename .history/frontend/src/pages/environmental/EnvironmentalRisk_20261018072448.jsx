import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, MapPin, Wifi, WifiOff, Server, Radio, Cpu, Camera, ShieldAlert, ChevronDown,
  Layers, CheckCircle2, XCircle, Gauge
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

const BORDER = "#B9D0EA"; // section + tile border colour

// Small summary tile (top row)
function Stat({ label, value, icon: Icon, accent = "#1769E0", valueColor, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      className="relative overflow-hidden rounded-2xl bg-white px-5 py-5 transition-transform duration-200 hover:-translate-y-1"
      style={{
        border: `2px solid ${BORDER}`,
        boxShadow: "0 14px 30px -18px rgba(23,105,224,0.45)"
      }}
    >
      <span className="absolute inset-y-0 left-0 w-2" style={{ background: accent }} />
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <Icon size={22} />
        </span>
        <p className="text-base font-semibold text-slate-600">{label}</p>
      </div>
      <p
        className="mt-3 font-display text-4xl font-bold"
        style={{ color: valueColor || "#0B1F33" }}
      >
        {value}
      </p>
    </motion.div>
  );
}

// Big section card: coloured top bar, icon chip, bold title, soft inner area
function Section({ icon: Icon, title, subtitle, children, right, accent = "#1769E0", delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative mt-10 overflow-hidden rounded-3xl bg-white/90 p-6 pt-8 md:p-8 md:pt-10"
      style={{
        border: `2px solid ${BORDER}`,
        boxShadow: "0 24px 60px -30px rgba(23,105,224,0.45), 0 4px 14px rgba(11,31,51,0.05)"
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-2"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}66)` }}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: `${accent}1F`, color: accent }}
          >
            <Icon size={26} />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">{title}</h2>
            {subtitle && <p className="mt-0.5 text-base text-slate-600">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
}

function StatusPill({ ok, warn, okIcon: OkIcon, badIcon: BadIcon, children }) {
  const tone = ok
    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
    : warn
    ? "bg-amber-50 text-amber-800 border-amber-300"
    : "bg-red-50 text-red-800 border-red-300";
  return (
    <span className={`inline-flex items-center gap-2.5 rounded-full border-2 px-5 py-2.5 text-base font-bold ${tone}`}>
      {ok ? <OkIcon size={18} /> : <BadIcon size={18} />}
      {children}
    </span>
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
    <div
      className="relative min-h-screen overflow-hidden pt-28 pb-24"
      style={{ background: "linear-gradient(160deg,#E6F1FF 0%,#D9EAFB 45%,#DDF3F1 100%)" }}
    >
      {/* soft background: faint grid + two glows */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(23,105,224,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(23,105,224,0.07) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(180deg, black 0%, transparent 70%)",
            WebkitMaskImage: "linear-gradient(180deg, black 0%, transparent 70%)"
          }}
        />
        <div className="absolute -top-32 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: "rgba(56,189,248,0.28)" }} />
        <div className="absolute top-1/2 -left-32 h-[26rem] w-[26rem] rounded-full blur-3xl" style={{ background: "rgba(45,212,191,0.18)" }} />
      </div>

      <div className="container-xl relative">
        <Link
          to="/dashboard"
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-base font-bold text-sky-800 transition-colors hover:bg-sky-50"
          style={{ border: `2px solid ${BORDER}` }}
        >
          <ArrowLeft size={18} /> Back to dashboard
        </Link>

        {/* ── Page header card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl p-7 md:p-9"
          style={{
            background: "linear-gradient(110deg, #0F3A68 0%, #14558F 55%, #1A74A8 100%)",
            boxShadow: "0 28px 60px -28px rgba(15,58,104,0.7)"
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "linear-gradient(90deg, transparent 20%, black 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 20%, black 100%)"
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-base font-semibold text-white">
                <span className="h-2.5 w-2.5 rounded-full bg-[#7CF2C0]" />
                Module 02 · Owner: Sashini Diwyangii
              </span>
              <h1 className="mt-4 font-display text-4xl font-bold text-white md:text-5xl">
                Environmental Risk Mapping
              </h1>
              <p className="mt-3 max-w-2xl text-lg leading-relaxed text-white/85">
                Smart safety zones that detect high-risk areas from light, obstacles, floor moisture and motion — with live camera.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-2.5 rounded-full border-2 px-5 py-2.5 text-base font-bold ${
                  backendOnline
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : backendOnline === null
                    ? "border-white/40 bg-white/15 text-white"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                {backendOnline ? <Server size={18} /> : <WifiOff size={18} />}
                {backendOnline === null ? "Checking backend…" : backendOnline ? "Backend online" : "Backend offline"}
              </span>
              <span
                className={`inline-flex items-center gap-2.5 rounded-full border-2 px-5 py-2.5 text-base font-bold ${
                  mqttOk
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {mqttOk ? <Wifi size={18} /> : <WifiOff size={18} />}
                {mqttOk ? "MQTT connected" : "MQTT disconnected"}
              </span>
            </div>
          </div>
        </motion.div>

        {backendOnline === false && (
          <div
            className="mt-8 rounded-3xl bg-white p-7"
            style={{ border: "2px solid #FDA29B", boxShadow: "0 20px 44px -26px rgba(240,68,56,0.5)" }}
          >
            <p className="text-xl font-bold text-red-700">Can't reach the Environmental Risk backend at {ENV_API_URL}</p>
            <p className="mt-2 text-lg text-slate-700">Start it in a new terminal:</p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-5 text-base text-slate-100">{`cd backend/environmental-risk
pip install -r requirements.txt
python server.py`}</pre>
            <p className="mt-3 text-base text-slate-600">(or double-click <code>start-environmental.bat</code> / run <code>./start-environmental.sh</code>)</p>
          </div>
        )}

        {backendOnline && sum && (
          <>
            {/* ── Overview tiles ── */}
            <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-5">
              <Stat index={0} label="Devices" value={sum.devices} icon={Cpu} accent="#1769E0" />
              <Stat index={1} label="Connected" value={sum.online} icon={CheckCircle2} accent="#12B76A" valueColor="#067647" />
              <Stat
                index={2}
                label="Disconnected"
                value={sum.offline}
                icon={XCircle}
                accent={sum.offline ? "#F04438" : "#93A3B0"}
                valueColor={sum.offline ? "#C81E1E" : "#0B1F33"}
              />
              <Stat index={3} label="Sensor nodes" value={sum.sensor_nodes} icon={Radio} accent="#0E9F8E" />
              <Stat
                index={4}
                label="High-risk zones"
                value={sum.high_risk_zones}
                icon={ShieldAlert}
                accent={sum.high_risk_zones ? "#F04438" : "#F97316"}
                valueColor={sum.high_risk_zones ? "#C81E1E" : "#0B1F33"}
              />
            </div>

            {/* ── Zone summary ── */}
            <Section
              icon={ShieldAlert}
              title="Zone risk summary"
              subtitle="Risk score and device status for each zone"
              accent="#F97316"
              delay={0.05}
            >
              {zones.length === 0 ? (
                <p
                  className="rounded-2xl bg-sky-50 p-6 text-lg text-slate-700"
                  style={{ border: `2px dashed ${BORDER}` }}
                >
                  No zones detected from MQTT yet — waiting for device discovery.
                </p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {zones.map((z) => {
                    const r = riskOf(z.risk_level);
                    return (
                      <div
                        key={z.zone_id}
                        className="relative overflow-hidden rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-1"
                        style={{
                          background: `linear-gradient(160deg, #FFFFFF 40%, ${r.hex}1A 100%)`,
                          border: `2px solid ${r.hex}66`,
                          boxShadow: `0 16px 34px -22px ${r.hex}`
                        }}
                      >
                        <span className="absolute inset-y-0 left-0 w-2" style={{ background: r.hex }} />
                        <div className="flex items-center justify-between gap-2 pl-1">
                          <h3 className="font-display text-xl font-bold text-ink">{z.zone_id}</h3>
                          <span className={`rounded-full px-3.5 py-1 text-sm font-bold ring-1 ${r.chip}`}>{z.risk_level}</span>
                        </div>
                        <div className="mt-3 flex items-end gap-2 pl-1">
                          <p className="font-display text-5xl font-bold leading-none" style={{ color: r.hex }}>{z.risk_score}</p>
                          <span className="pb-1 text-base font-semibold text-slate-500">/ 100</span>
                        </div>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${z.risk_score}%`, background: r.hex }}
                          />
                        </div>
                        <p className="mt-4 pl-1 text-base font-medium text-slate-700">
                          Devices: {z.devices_online}/{z.devices_total} connected
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ── 3D map ── */}
            <Section
              icon={MapPin}
              title="Dynamic 3D risk map"
              subtitle="Live view of every zone and device"
              accent="#1769E0"
              delay={0.1}
            >
              <div
                className="rounded-2xl bg-sky-50/70 p-3 md:p-4"
                style={{ border: `2px solid ${BORDER}` }}
              >
                <div className="overflow-hidden rounded-xl bg-white" style={{ border: `1px solid ${BORDER}` }}>
                  <RiskMap zones={zones} devices={devices} />
                </div>
              </div>

              {/* legend as small boxes */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { c: "#12B76A", t: "Green box", s: "Low-risk zone" },
                  { c: "#F59E0B", t: "Amber box", s: "Medium-risk zone" },
                  { c: "#F04438", t: "Red box", s: "High-risk zone" },
                  { c: "#1769E0", t: "Round / diamond", s: "Sensor node / camera" }
                ].map((l) => (
                  <div
                    key={l.t}
                    className="flex items-center gap-3 rounded-xl bg-white px-4 py-3"
                    style={{ border: `2px solid ${l.c}55` }}
                  >
                    <span className="h-5 w-5 shrink-0 rounded-md" style={{ background: l.c }} />
                    <span className="leading-tight">
                      <span className="block text-base font-bold text-ink">{l.t}</span>
                      <span className="block text-sm text-slate-600">{l.s}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-base text-slate-600">
                Zones and devices come from MQTT discovery. Green / red marker = online / offline.
              </p>
            </Section>

            {/* ── Live sensors ── */}
            <Section
              icon={Radio}
              title="Live sensor data"
              subtitle="Latest readings from each sensor node"
              accent="#0E9F8E"
              delay={0.15}
            >
              {sensors.length === 0 ? (
                <p
                  className="rounded-2xl bg-sky-50 p-6 text-lg text-slate-700"
                  style={{ border: `2px dashed ${BORDER}` }}
                >
                  No sensor nodes discovered.
                </p>
              ) : (
                <div className="grid gap-5">
                  {sensors.map((d) => <SensorCard key={d.device_id} device={d} onChanged={load} />)}
                </div>
              )}
            </Section>

            {/* ── Devices + debug ── */}
            <Section
              icon={Cpu}
              title="Devices"
              subtitle="Every device found on the network"
              accent="#7C3AED"
              delay={0.2}
            >
              <div
                className="overflow-x-auto rounded-2xl bg-white"
                style={{ border: `2px solid ${BORDER}` }}
              >
                <table className="w-full min-w-[44rem] text-left text-base">
                  <thead>
                    <tr style={{ background: "#E6F0FB" }}>
                      {["Device", "Type", "Zone", "IP", "RSSI", "Status", "Last seen"].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-4 text-base font-bold text-slate-700"
                          style={{ borderBottom: `2px solid ${BORDER}` }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {devices.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-8 text-lg text-slate-600">Waiting for device discovery…</td></tr>
                    )}
                    {devices.map((d, i) => (
                      <tr
                        key={d.device_id}
                        className="transition-colors hover:bg-sky-50"
                        style={{
                          background: i % 2 ? "#F6FAFE" : "#FFFFFF",
                          borderBottom: `1px solid #DCE8F4`
                        }}
                      >
                        <td className="px-5 py-4 font-bold text-ink">{d.device_id}</td>
                        <td className="px-5 py-4 text-slate-700">{d.device_type}</td>
                        <td className="px-5 py-4 text-slate-700">{d.zone_id || "-"}</td>
                        <td className="px-5 py-4 font-mono text-slate-700">{d.ip || "-"}</td>
                        <td className="px-5 py-4 text-slate-700">{d.rssi != null ? `${d.rssi} dBm` : "-"}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border-2 px-3.5 py-1 text-sm font-bold ${
                              d.status === "ONLINE"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-red-300 bg-red-50 text-red-800"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${d.status === "ONLINE" ? "bg-emerald-500" : "bg-red-500"}`} />
                            {d.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{d.last_seen ? `${d.seconds_since_seen ?? 0}s ago` : "never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-base text-slate-700" style={{ border: "1px solid #DDD0FA" }}>
                Connected = message received within the last {data.offline_timeout}s. Disconnected devices stay listed for identification.
              </p>

              {debugOpen && (
                <div
                  className="mt-4 rounded-2xl bg-white p-6 text-base text-slate-700"
                  style={{ border: `2px solid ${BORDER}` }}
                >
                  <p>MQTT host: <span className="font-mono">{data.mqtt.host}:{data.mqtt.port}</span> · topic <span className="font-mono">{data.mqtt.topic}</span></p>
                  <p className="mt-1">Messages received: {data.mqtt.message_count} · last state change: {data.mqtt.last_change || "-"}</p>
                  <p className="mt-1">MQTT error: {data.mqtt.last_error || "-"}</p>
                  <p className="mt-1">YOLO model: <span className="font-mono">{data.yolo.model}</span> · available: {String(data.yolo.available)} · loading: {String(data.yolo.loading)} · error: {data.yolo.error || "-"}</p>
                  {data.mqtt.last_message && (
                    <>
                      <p className="mt-3 font-semibold">Last MQTT message</p>
                      <p className="font-mono text-sm">{data.mqtt.last_message.topic}</p>
                      <pre className="mt-1 max-h-60 overflow-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100">{JSON.stringify(data.mqtt.last_message.payload, null, 2)}</pre>
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
