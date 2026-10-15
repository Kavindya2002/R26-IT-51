import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Activity, MapPin, HeartPulse, ArrowUpRight, Radio, Hammer } from "lucide-react";

const MODULES = [
  {
    icon: Activity,
    title: "Context-Aware Activity Recognition",
    description:
      "Live IMU fall detection with a fall-risk score and a plain explanation for every alert.",
    owner: "Kavindya Chathuri",
    status: "live",
    path: "/dashboard/activity-recognition"
  },
  {
    icon: MapPin,
    title: "Environmental Risk Mapping",
    description: "Smart safety zones that detect high-risk  areas in the care facility.",
    owner: "Sashini Diwyangii",
    status: "live",
    streamLabel: "Zone sensors · MQTT",
    rate: "Realtime",
    path: "/dashboard/environmental-risk"
  },
  {
    icon: HeartPulse,
    title: "Heart Rate And BP Monitoring",
    description: "Continuous heart-rate and vitals tracking to catch early warning signs.",
    owner: "Hirushi Divyanjalie",
    status: "live",
    streamLabel: "PPG sensor · MQTT",
    rate: "Realtime",
    path: "/dashboard/cardiovascular"
  }
];

const ECG = "M0 40 H60 L72 40 L82 12 L94 66 L106 28 L114 40 H190 L202 40 L212 12 L224 66 L236 28 L244 40 H320";

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono tabular-nums">{now.toLocaleTimeString([], { hour12: false })}</span>;
}

function StatusChip({ live }) {
  return live ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
      Coming soon
    </span>
  );
}

/* bottom panel: same height on every card so all three stay equal */
function Panel({ live, reduce, label = "Sensor stream", rate = "50 Hz" }) {
  return (
    <div className="mt-6 flex h-36 flex-col justify-center rounded-2xl bg-slate-50 px-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="inline-flex items-center gap-2 font-medium">
          {live ? <Radio size={16} className="text-emerald-500" /> : <Hammer size={16} />}
          {live ? label : "In development"}
        </span>
        <span className="font-mono">{live ? rate : "Not connected"}</span>
      </div>
      <svg viewBox="0 0 320 80" className="mt-1 h-20 w-full" fill="none" aria-hidden="true">
        <path d={ECG} stroke="currentColor" strokeWidth="2" strokeDasharray={live ? undefined : "4 6"}
          className={live ? "text-sky-600/15" : "text-slate-300"} />
        {live && (
          <motion.path
            d={ECG}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sky-600"
            initial={{ pathLength: 0 }}
            animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: [0, 0.75, 1] }}
          />
        )}
      </svg>
    </div>
  );
}

const SPOT =
  "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 " +
  "[background:radial-gradient(360px_circle_at_var(--x,50%)_var(--y,50%),rgba(14,116,244,0.12),transparent_70%)]";

function ModuleCard({ m, reduce }) {
  const Icon = m.icon;
  const live = m.status === "live";

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
  };

  const base =
    "group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ";
  const look = live ? "shadow-lg ring-2 ring-sky-300" : "bg-white/80 ring-1 ring-slate-200";

  const body = (
    <>
      <span className={SPOT} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              live ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-600"
            }`}
          >
            <Icon size={28} />
          </span>
          <StatusChip live={live} />
        </div>

        <h3 className="mt-5 min-h-[4.5rem] font-display text-2xl font-semibold leading-snug text-ink">{m.title}</h3>
        <p className="mt-3 flex-1 text-base leading-relaxed text-slate-600">{m.description}</p>

        <Panel live={live} reduce={reduce} label={m.streamLabel} rate={m.rate} />

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-base text-slate-500">
          <span>
            Owner: <span className="font-medium text-slate-700">{m.owner}</span>
          </span>
          {live && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-sky-700 transition-transform group-hover:translate-x-1">
              Open <ArrowUpRight size={18} />
            </span>
          )}
        </div>
      </div>
    </>
  );

  return live ? (
    <Link
      to={m.path}
      onMouseMove={onMove}
      className={base + look + " focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-500"}
    >
      {body}
    </Link>
  ) : (
    <div onMouseMove={onMove} className={base + look}>
      {body}
    </div>
  );
}

// Builds a repeating signal-trace path for the drifting background waves
function wavePath(mid, amp, period, cycles, jitter = 0) {
  let d = `M0 ${mid}`;
  const steps = cycles * 24;
  for (let i = 1; i <= steps; i++) {
    const x = (i / 24) * period;
    const wobble = jitter ? Math.sin(i * 1.7) * jitter : 0;
    const y = mid + Math.sin((i / 24) * Math.PI * 2) * amp + wobble;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

// Soft, light, slightly technical page background
function DashboardBackground() {
  return (
    <div aria-hidden="true" className="dash-bg pointer-events-none absolute inset-0">
      <style>{`
        @keyframes db-drift-a { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-70px,45px); } }
        @keyframes db-drift-b { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px,-40px); } }
        @keyframes db-drift-c { 0%,100% { transform: translate(0,0); } 50% { transform: translate(35px,50px); } }
        @keyframes db-grid    { to { background-position: 0 44px, 44px 0; } }
        @keyframes db-wave    { to { transform: translateX(-600px); } }
        @media (prefers-reduced-motion: reduce) {
          .dash-bg, .dash-bg * { animation: none !important; }
        }
      `}</style>

      {/* base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, #EEF6FF 0%, #E2EFFC 45%, #E6F6F5 100%)"
        }}
      />

      {/* slow-moving grid, fades out toward the edges */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(23,105,224,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(23,105,224,0.07) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          animation: "db-grid 8s linear infinite",
          maskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 78%)"
        }}
      />

      {/* soft colour glows */}
      <div
        className="absolute -top-32 right-0 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{ background: "rgba(56,189,248,0.30)", animation: "db-drift-a 18s ease-in-out infinite" }}
      />
      <div
        className="absolute top-1/2 -left-32 h-[26rem] w-[26rem] rounded-full blur-3xl"
        style={{ background: "rgba(45,212,191,0.20)", animation: "db-drift-b 22s ease-in-out infinite" }}
      />
      <div
        className="absolute -bottom-40 right-1/4 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{ background: "rgba(99,102,241,0.14)", animation: "db-drift-c 20s ease-in-out infinite" }}
      />

      {/* faint sensor waveforms along the lower part of the page */}
      {[
        { bottom: "10%", amp: 16, jitter: 4, dur: 26, color: "#1769E0", op: 0.16 },
        { bottom: "20%", amp: 9, jitter: 6, dur: 34, color: "#12B5A6", op: 0.14 }
      ].map((w, i) => (
        <div key={i} className="absolute left-0 w-full overflow-hidden" style={{ bottom: w.bottom, height: 60 }}>
          <svg
            width="1800"
            height="60"
            viewBox="0 0 1800 60"
            fill="none"
            stroke={w.color}
            strokeOpacity={w.op}
            strokeWidth="1.8"
            style={{ animation: `db-wave ${w.dur}s linear infinite` }}
          >
            <path d={wavePath(30, w.amp, 300, 6, w.jitter)} />
          </svg>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const reduce = useReducedMotion();
  const liveCount = MODULES.filter((m) => m.status === "live").length;

  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.12 } } };
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } }
  };

  return (
    <div className="relative min-h-screen overflow-hidden pt-28 pb-24">
      <DashboardBackground />

      <motion.div className="container-xl relative" variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-base font-semibold text-sky-700">System overview</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-ink md:text-5xl">
              Select a monitoring module
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-white/80 px-5 py-3 text-base text-slate-600 ring-1 ring-slate-200 backdrop-blur">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {liveCount} live
            </span>
            <span>{MODULES.length - liveCount} in development</span>
            <Clock />
          </div>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <motion.div key={m.title} variants={item}>
              <ModuleCard m={m} reduce={reduce} />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
