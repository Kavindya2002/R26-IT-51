import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Activity,
  Gauge,
  Compass,
  History,
  ShieldAlert,
  RotateCcw,
  ListChecks,
  Loader2,
  Database,
  TrendingUp,
  Cpu,
  Crosshair,
  AlertTriangle,
  Watch,
  Cloud,
  Server,
  AudioWaveform
} from "lucide-react";
import { fallApi, WINDOW_SIZE, PRED_EVERY, POLL_INTERVAL_MS } from "../../lib/fallApi.js";
import { supabase, isDatabaseConfigured } from "../../lib/supabaseClient.js";
import {
  DEFAULT_LOGIC,
  LEVELS,
  createPostureEngine,
  orientation
} from "../../lib/postureEngine.js";
import Avatar3D from "../../components/Avatar3D.jsx";

// Fall-logic limits are fixed inside postureEngine.js (DEFAULT_LOGIC).
// They are NOT shown to the user - change them in that file if needed.
const L = DEFAULT_LOGIC;

// ── Colours (all chosen to be easy to read on white cards) ─────────────
// Warning colours are violet / orange / red.  Yellow is NOT used for any
// posture state, so it can never be confused with "walking".
const CLASS_BAR = {
  forward_fall: "#FF5A5F",
  backward_fall: "#FF5A5F",
  left_fall: "#FF5A5F",
  right_fall: "#FF5A5F",
  near_fall_recovered: "#A66BFF",
  normal_walk: "#12B76A",
  standing_still: "#00B3C4",
  uncertain: "#93A3B0"
};
const CLASS_TEXT = {
  forward_fall: "#C81E1E",
  backward_fall: "#C81E1E",
  left_fall: "#C81E1E",
  right_fall: "#C81E1E",
  near_fall_recovered: "#6B2FD6",
  normal_walk: "#007A48",
  standing_still: "#0B6E7B",
  uncertain: "#4A5B6C"
};
// one text colour per posture level (0 upright … 5 fall confirmed)
const LEVEL_TEXT = ["#007A48", "#0F5FB0", "#6B2FD6", "#B34700", "#C81E1E", "#A30000"];

const EVENT_STYLE = {
  normal: { text: "Normal", color: "#007A48" },
  leaning: { text: "Leaning", color: "#0F5FB0" },
  possible_fall: { text: "Possible fall", color: "#B34700" },
  confirming: { text: "Confirming…", color: "#B34700" },
  confirmed_fall: { text: "Confirmed fall", color: "#C81E1E" },
  near_fall_recovered: { text: "Near-fall recovered", color: "#6B2FD6" },
  recovered_from_fall: { text: "Got up after fall", color: "#007A48" },
  uncertain: { text: "Low confidence", color: "#4A5B6C" }
};
const RISK_COLOR = { low: "#007A48", elevated: "#B34700", high: "#C81E1E", unknown: "#4A5B6C" };
const RISK_BAR = { low: "#12B76A", elevated: "#F97316", high: "#F04438", unknown: "#93A3B0" };

function labelText(label) {
  if (!label) return "—";
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ───────────────────────── NAME GATE ─────────────────────────
// ───────────────────────── NAME GATE ─────────────────────────
function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NameGate({ onStart }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();

  const trimmed = name.trim();
  const initials = getInitials(name);
  const canSubmit = trimmed.length > 0 && !saving;

  async function handleStart(e) {
    e.preventDefault();
    if (!trimmed) return;

    setSaving(true);
    // Log this monitoring session to the database (if configured).
    if (supabase) {
      try {
        await supabase.from("monitoring_sessions").insert({
          wearer_name: trimmed,
          started_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn("Could not log session to database:", err.message);
      }
    }
    setSaving(false);
    onStart(trimmed);
  }

  const BLUE = "#1769E0";
  const BLUE_DARK = "#0F52B8";
  const NAVY = "#0B1F33";

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-6 pt-28 pb-12 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #E3EFFC 0%, #F1F7FE 50%, #DDEEF8 100%)"
      }}
    >
      <style>{`
        @keyframes ng-pulse {
          0%   { transform: scale(1);   opacity: .7; }
          100% { transform: scale(1.9); opacity: 0;  }
        }
        @keyframes ng-grid { to { background-position: 0 56px, 56px 0; } }
        @keyframes ng-ecg-loop {
          0%   { stroke-dashoffset: 260; }
          55%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -260; }
        }
        @keyframes ng-blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes ng-sheen {
          0%   { transform: translateX(-120%) skewX(-12deg); }
          60%,100% { transform: translateX(120%) skewX(-12deg); }
        }
        @keyframes ng-float-a { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px,-30px); } }
        @keyframes ng-float-b { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px,35px); } }
        @media (prefers-reduced-motion: reduce) {
          .ng-anim, .ng-anim * { animation: none !important; }
        }
      `}</style>

      {/* Light technical background: visible grid + soft colour glows */}
      <div aria-hidden className="ng-anim pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(23,105,224,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(23,105,224,0.10) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            animation: "ng-grid 10s linear infinite",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)"
          }}
        />
        <div
          className="absolute -top-32 -left-24 w-[32rem] h-[32rem] rounded-full blur-3xl"
          style={{ background: "rgba(59,130,246,0.30)", animation: "ng-float-a 16s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-40 -right-24 w-[34rem] h-[34rem] rounded-full blur-3xl"
          style={{ background: "rgba(45,212,191,0.26)", animation: "ng-float-b 20s ease-in-out infinite" }}
        />
      </div>

      {/* ── Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-2xl rounded-[2rem] bg-white p-10 sm:p-14"
        style={{
          color: NAVY,
          border: "2px solid #B9D0EA",
          boxShadow: "0 40px 90px -30px rgba(23,105,224,0.45), 0 10px 30px rgba(11,31,51,0.10)"
        }}
      >
        {/* HUD corner brackets (solid blue = clearly visible on a projector) */}
        {[
          "top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl-xl",
          "top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr-xl",
          "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl-xl",
          "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br-xl"
        ].map((c) => (
          <span key={c} aria-hidden className={`absolute w-6 h-6 ${c}`} style={{ borderColor: BLUE }} />
        ))}

        {/* Avatar + status */}
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 shrink-0">
            {!reduceMotion && (
              <>
                <span
                  aria-hidden
                  className="ng-anim absolute inset-0 rounded-3xl border-[3px]"
                  style={{ borderColor: BLUE, animation: "ng-pulse 2.6s ease-out infinite" }}
                />
                <span
                  aria-hidden
                  className="ng-anim absolute inset-0 rounded-3xl border-[3px]"
                  style={{ borderColor: "#12B5A6", animation: "ng-pulse 2.6s ease-out 1.3s infinite" }}
                />
              </>
            )}
            <motion.div
              animate={{ scale: trimmed ? 1.06 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="relative w-24 h-24 rounded-3xl flex items-center justify-center text-white"
              style={{
                background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
                boxShadow: "0 14px 30px -8px rgba(23,105,224,0.6)"
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {initials ? (
                  <motion.span
                    key="initials"
                    initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.18 }}
                    className="font-display text-4xl font-bold tracking-wide"
                  >
                    {initials}
                  </motion.span>
                ) : (
                  <motion.span
                    key="icon"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.18 }}
                  >
                    <User size={44} strokeWidth={2.2} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-3 text-xl font-bold" style={{ color: "#0B6E7B" }}>
              <span
                className="ng-anim w-3.5 h-3.5 rounded-full"
                style={{ background: "#12B76A", animation: "ng-blink 1.6s ease-in-out infinite" }}
              />
              Sensor session ready
            </p>
            {/* looping heartbeat trace (thick + solid so it is visible from far away) */}
            <svg
              aria-hidden
              viewBox="0 0 200 40"
              className="mt-2 h-10 w-full max-w-[260px]"
              fill="none"
              stroke={BLUE}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                className="ng-anim"
                d="M0 22 H60 L70 6 L82 36 L92 12 L100 22 H200"
                style={{
                  strokeDasharray: 260,
                  strokeDashoffset: 260,
                  animation: "ng-ecg-loop 3.4s ease-in-out infinite"
                }}
              />
            </svg>
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
          className="mt-8 font-display text-4xl sm:text-5xl font-bold leading-tight"
          style={{ color: NAVY }}
        >
          Who's wearing the device?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="mt-4 text-xl sm:text-2xl leading-relaxed"
          style={{ color: "#1B2B3C" }}
        >
          Enter the name of the person currently wearing the fall-detection sensor. This links
          live readings to a session record and keeps history separated between different
          wearers.
        </motion.p>

        <motion.form
          onSubmit={handleStart}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45 }}
          className="mt-10 space-y-6"
        >
          <div className="relative">
            <div
              aria-hidden
              className={`absolute -inset-1.5 rounded-[1.6rem] blur-md transition-opacity duration-300 ${
                focused ? "opacity-100" : "opacity-0"
              }`}
              style={{ background: "rgba(23,105,224,0.35)" }}
            />
            <div className="relative">
              <User
                size={28}
                aria-hidden
                className="absolute left-6 top-1/2 -translate-y-1/2 transition-colors duration-200"
                style={{ color: focused || trimmed ? BLUE : "#5B7088" }}
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="e.g. Kavindya Chathuri"
                aria-label="Wearer's name"
                autoComplete="name"
                autoFocus
                disabled={saving}
                className="w-full bg-white rounded-2xl pl-16 pr-6 py-5 text-2xl font-medium outline-none transition-colors placeholder:text-[#6B7F95] disabled:opacity-70"
                style={{
                  color: NAVY,
                  border: `3px solid ${focused ? BLUE : "#7A9BC0"}`
                }}
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={!canSubmit}
            whileHover={canSubmit && !reduceMotion ? { y: -2 } : undefined}
            whileTap={canSubmit && !reduceMotion ? { scale: 0.98 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="group relative w-full overflow-hidden font-bold text-2xl py-5 rounded-2xl text-white disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4"
            style={{
              outlineColor: BLUE,
              background: `linear-gradient(90deg, ${BLUE} 0%, ${BLUE_DARK} 100%)`,
              boxShadow: canSubmit ? "0 18px 36px -12px rgba(23,105,224,0.7)" : "none"
            }}
          >
            {canSubmit && (
              <span
                aria-hidden
                className="ng-anim absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                style={{ animation: "ng-sheen 3s ease-in-out infinite" }}
              />
            )}
            <span className="relative flex items-center justify-center gap-3">
              {saving ? (
                <>
                  <Loader2 size={28} className="animate-spin" />
                  Starting session…
                </>
              ) : (
                <>
                  Start Live Monitoring
                  <ArrowRight
                    size={28}
                    className="transition-transform duration-200 group-hover:translate-x-1.5"
                  />
                </>
              )}
            </span>
          </motion.button>

          <AnimatePresence>
            {!trimmed && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-lg font-medium text-center overflow-hidden"
                style={{ color: "#33475B" }}
              >
                Type a name to enable the button
              </motion.p>
            )}
          </AnimatePresence>
        </motion.form>

        {!isDatabaseConfigured && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 flex items-start gap-4 rounded-2xl border-2 border-[#F2D58A] bg-[#FFF3D6] px-5 py-4"
          >
            <Database size={26} className="mt-0.5 shrink-0 text-[#B34700]" />
            <p className="text-lg leading-relaxed text-[#6B4300]">
              Database not connected — sessions won't be saved. See README to connect Supabase.
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// ───────────────────────── SMALL PIECES ─────────────────────────
// Card with a soft entrance animation. `pulse` (a colour) makes the border glow.
// Card with entrance animation, coloured accent bar, number badge and hover lift.
// `accent` = this section's colour, `num` = section number (1-8),
// `pulse` (a colour) makes the border glow (used for fall alerts).
function Panel({ title, icon: Icon, children, className = "", style, delay = 0, pulse, num, accent = "#1769E0" }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={
        pulse
          ? {
              opacity: 1,
              y: 0,
              boxShadow: [
                `0 0 0 0 ${pulse}00`,
                `0 0 0 10px ${pulse}33`,
                `0 0 0 0 ${pulse}00`
              ]
            }
          : { opacity: 1, y: 0, boxShadow: "0 10px 30px rgba(11,31,51,0.12)" }
      }
      whileHover={
        pulse
          ? undefined
          : {
              y: -4,
              boxShadow: "0 18px 44px rgba(11,31,51,0.20)",
              transition: { duration: 0.2, delay: 0 }
            }
      }
      transition={{
        opacity: { duration: 0.5, delay },
        y: { duration: 0.5, delay },
        boxShadow: pulse ? { duration: 1.4, repeat: Infinity } : { duration: 0.3 }
      }}
      className={`relative overflow-hidden flex flex-col bg-white rounded-3xl border-2 border-[#C3D3E4] p-6 md:p-7 pt-8 md:pt-9 ${className}`}
      style={style}
    >
      {/* coloured accent bar - sweeps in from the left */}
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, delay: delay + 0.15, ease: "easeOut" }}
        className="absolute inset-x-0 top-0 h-2"
        style={{ background: accent, transformOrigin: "left", transition: "background-color 0.3s" }}
      />

      <div className="flex items-center gap-3 mb-5">
        <span
          className="flex items-center justify-center w-11 h-11 rounded-xl"
          style={{ background: `${accent}22`, color: accent, transition: "background-color 0.3s, color 0.3s" }}
        >
          <Icon size={22} />
        </span>
        <h2 className="text-lg font-bold text-ink tracking-wide uppercase">{title}</h2>

        {num != null && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: delay + 0.3 }}
            className="ml-auto flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white"
            style={{ background: accent, transition: "background-color 0.3s" }}
          >
            {num}
          </motion.span>
        )}
      </div>
      {children}
    </motion.section>
  );
}
{/*design of badges*/}
function StatusChip({ color, children }) {
  return (
    <span className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-base font-semibold text-white">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function Tile({ label, value, mono = false }) {
  return (
    <div className="bg-mist rounded-2xl px-4 py-3.5 border border-[#E1EAF2]">
      <p className="text-sm font-semibold text-slate uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-bold text-ink ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// Small heading that groups the sections into 3 labelled rows.
function RowLabel({ children, sub }) {
  return (
    <div className="flex items-center gap-4">
      <h3 className="text-sm font-bold tracking-[3px] uppercase text-[#33475B]">{children}</h3>
      <span className="flex-1 h-px bg-[#B4C7DB]" />
      {sub && <span className="text-sm font-semibold text-slate">{sub}</span>}
    </div>
  );
}

// Live line chart. Newest sample is on the right; older samples scroll left.
const TRACE_LEN = 80; // 80 samples @ 10 Hz = 8 seconds
function Spark({ data, color, min, max, height = 44, baseline, area = false }) {
  const w = 200;
  const h = height;
  let lo = min ?? Math.min(...data, 0);
  let hi = max ?? Math.max(...data, 1);
  if (hi - lo < 1e-6) hi = lo + 1;
  const pts = data.map((v, i) => {
    const x = w - ((data.length - 1 - i) / (TRACE_LEN - 1)) * w;
    const y = h - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * h;
    return [x, y];
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const by = baseline != null ? h - ((baseline - lo) / (hi - lo)) * h : null;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full block"
      style={{ height }}
      aria-hidden="true"
    >
      {by != null && (
        <line x1="0" x2={w} y1={by} y2={by} stroke="#9FB1C3" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      )}
      {area && pts.length > 1 && (
        <polygon points={`${pts[0][0]},${h} ${line} ${pts[pts.length - 1][0]},${h}`} fill={color} opacity="0.14" />
      )}
      {pts.length > 1 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// Circular progress (used for model confidence)
function Ring({ value, color, size = 104 }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#DCE5EE" strokeWidth="10" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold text-ink">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// gauge
function TiltDial({ tilt, color }) {
  const cx = 150,
    cy = 150,
    r = 118;
  const ang = (t) => Math.PI - (Math.min(t, 90) / 90) * Math.PI;
  const pt = (t, rr = r) => [cx + rr * Math.cos(ang(t)), cy - rr * Math.sin(ang(t))];
  const arc = (a, b) => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(b);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const bands = [
    [0, L.slightTilt, "#12B76A"],
    [L.slightTilt, L.losingTilt, "#3B9BFF"],
    [L.losingTilt, L.fallTilt, "#A66BFF"],
    [L.fallTilt, 90, "#F04438"]
  ];
  const ticks = [0, L.slightTilt, L.losingTilt, L.fallTilt, 90];
  const deg = (Math.min(tilt, 90) / 90) * 180;
  return (
    <svg viewBox="0 0 300 214" className="w-full max-w-[420px] mx-auto block" role="img" aria-label={`Tilt ${tilt.toFixed(0)} degrees`}>
      {bands.map(([a, b, c]) => (
        <path key={a} d={arc(a, b)} fill="none" stroke={c} strokeWidth="20" />
      ))}
      {ticks.map((t) => {
        const [x, y] = pt(t, r + 22);
        return (
          <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="700" fill="#33475B">
            {t}°
          </text>
        );
      })}
      <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 0.25s cubic-bezier(.34,1.4,.64,1)" }}>
        <polygon points={`${cx - 96},${cy} ${cx},${cy - 6} ${cx},${cy + 6}`} fill="#0B1F33" />
      </g>
      <circle cx={cx} cy={cy} r="11" fill="#0B1F33" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <text x={cx} y="198" textAnchor="middle" fontSize="40" fontWeight="800" fill="#0B1F33" fontFamily="ui-monospace, monospace">
        {tilt.toFixed(0)}°
      </text>
    </svg>
  );
}

// Data path: sensor → cloud → API → model → engine → decision
function PipelineStrip({ steps }) {
  return (
    <div className="mt-7 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 overflow-x-auto">
      <div className="flex items-center min-w-[820px]">
        {steps.map((s, i) => (
          <Fragment key={s.name}>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center border-2 transition-colors"
                style={{
                  borderColor: s.on ? s.color : "rgba(255,255,255,0.28)",
                  color: s.on ? s.color : "rgba(255,255,255,0.6)",
                  background: s.on ? `${s.color}26` : "transparent"
                }}
              >
                <s.icon size={22} />
              </span>
              <span className="leading-tight">
                <span className="block text-base font-bold text-white">{s.name}</span>
                <span className="block text-sm text-white/75">{s.sub}</span>
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="relative flex-1 h-0.5 mx-4 bg-white/25 overflow-hidden rounded">
                {s.on && steps[i + 1].on && (
                  <span className="absolute top-0 h-full w-[30%] rounded bg-signal animate-flow" />
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── LIVE DASHBOARD ─────────────────────────
function LiveDashboard({ wearerName, onEndSession }) {
  const [serverStatus, setServerStatus] = useState("connecting"); // connecting | ok | offline
  const [deviceLive, setDeviceLive] = useState(false);  // true if /latest is returning new MQTT messages
  const [classes, setClasses] = useState([]);
  const [sensor, setSensor] = useState({ ax: 0, ay: 1, az: 0, gx: 0, gy: 0, gz: 0, mag: 1 });
  const [trace, setTrace] = useState([]); // last 8 s of samples (for the live charts)
  const [samples, setSamples] = useState(0);
  const [predTotal, setPredTotal] = useState(0);
  const [prediction, setPrediction] = useState(null);
  const [history, setHistory] = useState([]);
  const [decision, setDecision] = useState({
    level: 0,
    title: "UPRIGHT",
    why: "Waiting for sensor data…",
    note: "",
    hex: LEVELS[0].hex,
    tilt: 0,
    dir: "none",
    evidence: {
      tilt: 0,
      gyro: 0,
      tiltRate: 0,
      unstable: false,
      gyroMean: 0,
      stillSec: 0,
      confirmPct: 0,
      confirming: false
    }
  });
  const [eventLog, setEventLog] = useState([]);

  const bufferRef = useRef([]);
  const sampleCountRef = useRef(0);
  const engineRef = useRef(createPostureEngine());
  const predictionRef = useRef(null);
  const lastLevelRef = useRef(-1);
  const predInFlightRef = useRef(false);
  const lastSigRef = useRef("");
  const lastChangeRef = useRef(0);

  // /health every 4 s
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fallApi.health();
        if (!cancelled) {
          setServerStatus("ok");
          setClasses(res.classes || []);
        }
      } catch {
        if (!cancelled) setServerStatus("offline");
      }
    }
    check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const addEvent = useCallback((title, level, tilt) => {
    const time = new Date().toLocaleTimeString("en-GB");
    setEventLog((prev) => [{ time, title, level, tilt: tilt.toFixed(0) }, ...prev.slice(0, 19)]);
  }, []);

  async function runPrediction() {
    if (predInFlightRef.current || bufferRef.current.length < WINDOW_SIZE) return;
    predInFlightRef.current = true;
    try {
      const res = await fallApi.predict(bufferRef.current.slice(-WINDOW_SIZE));
      predictionRef.current = { ...res, receivedAt: Date.now() };
      setPrediction(res);
      setPredTotal((n) => n + 1);
      setHistory((prev) => [
        { ...res, time: new Date().toLocaleTimeString("en-GB") },
        ...prev.slice(0, 19)
      ]);
    } catch {
      // keep polling silently
    } finally {
      predInFlightRef.current = false;
    }
  }

  // /latest every 100 ms → posture decision + sliding window + /predict
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const data = await fallApi.latest();
        if (cancelled) return;

        if (!data || data.ax === undefined) {
          setDeviceLive(false);
          return;
        }

        // /latest repeats the last MQTT message forever → detect a silent device
        const sig = `${data.ax}|${data.ay}|${data.az}|${data.gx}|${data.gy}|${data.gz}`;
        const isNew = sig !== lastSigRef.current;
        if (isNew) {
          lastSigRef.current = sig;
          lastChangeRef.current = Date.now();
          setSamples((n) => n + 1);
          setTrace((prev) => {
            const next = [...prev, data];
            return next.length > TRACE_LEN ? next.slice(-TRACE_LEN) : next;
          });
        }
        setDeviceLive(Date.now() - lastChangeRef.current < 2500);
        setSensor(data);

        const d = engineRef.current.update(data, predictionRef.current, { now: Date.now(), isNew });
        setDecision(d);
        if (d.level !== lastLevelRef.current) {
          if (lastLevelRef.current !== -1 || d.level > 0) addEvent(d.title, d.level, d.tilt);
          lastLevelRef.current = d.level;
        }

        bufferRef.current.push({
          ax: data.ax,
          ay: data.ay,
          az: data.az,
          gx: data.gx,
          gy: data.gy,
          gz: data.gz,
          mag: data.mag
        });
        if (bufferRef.current.length > WINDOW_SIZE) bufferRef.current.shift();
        sampleCountRef.current += 1;

        if (bufferRef.current.length === WINDOW_SIZE && sampleCountRef.current % PRED_EVERY === 0) {
          runPrediction();
        }
      } catch {
        // network hiccup - keep polling silently
      }
    }

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEvent]);

  async function handleReset() {
    try {
      await fallApi.reset(); // clears the server-side fall engine
    } catch {
      /* server offline - still reset the page */
    }
    engineRef.current.reset();
    predictionRef.current = null;
    setPrediction(null);
    lastLevelRef.current = -1;
  }

  // ---- derived values ----
  const { pitchDeg, rollDeg } = orientation(sensor);
  const sway = Math.abs(sensor.gx || 0) + Math.abs(sensor.gy || 0);
  const stabilityScore = Math.max(0, Math.round(100 - Math.min(sway * 1.5, 100)));
  const isFall = decision.level === 5; // FALL CONFIRMED
  const isPotential = decision.level === 4; // POTENTIAL FALL
  const ev8 = decision.evidence;
  const levelText = LEVEL_TEXT[decision.level];
  const ctx = prediction?.context;
  const ev = EVENT_STYLE[ctx?.event] || null;
  const riskKey = ctx?.risk_level || "unknown";
  const serverOk = serverStatus === "ok";
{/*logic of badges */}
  const deviceDot = !serverOk ? "#F04438" : deviceLive ? "#2BE08A" : "#F5A623";
  const deviceText = !serverOk ? "Device: no server" : deviceLive ? "Device live" : "Device silent";
  const serverDot = serverOk ? "#2BE08A" : serverStatus === "offline" ? "#F04438" : "#F5A623";
  const serverText = serverOk
    ? `Server online · ${classes.length} classes`
    : serverStatus === "offline"
    ? "Server offline"
    : "Connecting…";

  const pipeline = [
    { name: "IMU Sensor", sub: "BMI160 · 10 Hz", icon: Watch, on: deviceLive, color: "#2BE08A" },
    { name: "MQTT Cloud", sub: "HiveMQ broker", icon: Cloud, on: deviceLive && serverOk, color: "#2BE08A" },
    { name: "Flask API", sub: "REST · port 5050", icon: Server, on: serverOk, color: "#2BE08A" },
    { name: "Random Forest", sub: `${WINDOW_SIZE}-sample window`, icon: Cpu, on: serverOk && !!prediction, color: "#2BE08A" },
    { name: "Fall Engine", sub: "risk + confirmation", icon: Activity, on: serverOk && !!ctx, color: "#2BE08A" },
    { name: "Posture Decision", sub: `level ${decision.level} of 5`, icon: ShieldAlert, on: deviceLive, color: decision.hex }
  ];

  const magData = trace.map((s) => s.mag ?? 1);

  return (
    <div className="min-h-screen bg-[#E4ECF5] pb-20">
      {/* Fall alert flash */}
      <AnimatePresence>
        {isFall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.25, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, repeat: 2 }}
            className="fixed inset-0 bg-coral pointer-events-none z-40"
          />
        )}
      </AnimatePresence>

           {/* ───────── Top bar: name + status chips  ───────── */}
      <div
        className="relative overflow-hidden text-white pt-24 md:pt-28 pb-6"
        style={{
          background:
            "linear-gradient(100deg, #0F3A68 0%, #14558F 50%, #1A74A8 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.18)"
        }}
      >
        <style>{`
          @keyframes tb-grid  { to { background-position: 0 32px, 32px 0; } }
          @keyframes tb-sweep { 0% { transform: translateX(-30%); } 100% { transform: translateX(430%); } }
          @keyframes tb-ecg   { 0% { stroke-dashoffset: 420; } 60%,100% { stroke-dashoffset: 0; } }
          @media (prefers-reduced-motion: reduce) {
            .tb-anim, .tb-anim * { animation: none !important; }
          }
        `}</style>

        {/* technical background: moving grid, faint ECG trace, bottom scan light */}
        <div aria-hidden="true" className="tb-anim pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              animation: "tb-grid 10s linear infinite",
              maskImage: "linear-gradient(90deg, transparent 0%, black 35%, black 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 35%, black 100%)"
            }}
          />
          <svg
            viewBox="0 0 400 60"
            preserveAspectRatio="none"
            className="absolute right-0 top-1/2 h-16 w-[45%] -translate-y-1/2"
            fill="none"
            stroke="#8CF0FF"
            strokeOpacity="0.28"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M0 32 H120 L134 32 L146 10 L160 52 L174 22 L184 32 H260 L274 32 L286 10 L300 52 L314 22 L324 32 H400"
              style={{ strokeDasharray: 420, animation: "tb-ecg 5s ease-in-out infinite" }}
            />
          </svg>
          <div
            className="absolute bottom-0 left-0 h-[2px] w-1/4"
            style={{
              background: "linear-gradient(90deg, transparent, #8CF0FF, transparent)",
              animation: "tb-sweep 6s linear infinite"
            }}
          />
        </div>

        <div className="container-xl relative">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              {/* ───────── end session button ───────── */}
              <button
                onClick={onEndSession}
                className="flex items-center gap-2 text-base font-medium text-white/85 hover:text-white mb-3 transition-colors"
              >
                <ArrowLeft size={18} /> End session
              </button>
              <h1 className="font-display text-3xl md:text-4xl font-bold">
                Monitoring <span style={{ color: "#8CF0FF" }}>{wearerName}</span>
              </h1>
              <p className="mt-1.5 text-base md:text-lg text-white/80">
                Live fall detection
              </p>
            </div>
            {/* ───────── badges ───────── */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip color={deviceDot}>{deviceText}</StatusChip>     
              <StatusChip color={serverDot}>{serverText}</StatusChip>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/50 text-base font-semibold text-white hover:bg-white/20 transition-colors"
              >
                <RotateCcw size={16} /> Reset alert
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server-offline */}
      {serverStatus === "offline" && (
        <div className="bg-[#FFF3D6] border-b border-[#F2D58A]">
          <div className="container-xl py-3 flex items-center gap-3 text-base font-medium text-[#6B4300]">
            <AlertTriangle size={20} className="shrink-0" />
            The prediction server isn't running. Start{" "}
            <code className="font-mono font-bold">backend/activity-recognition/server.py</code>.
          </div>
        </div>
      )}

      {/* Potential-fall banner (checking) + confirmed-fall banner (alert) */}
      <AnimatePresence>
        {isPotential && (
          <motion.div
            key="potential"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-[#B34700] text-white"
          >
            <div className="container-xl py-4">
              <p className="flex items-center gap-3 font-bold text-lg">
                <AlertTriangle size={24} className="shrink-0" /> {decision.title} — checking if the
                person gets back up…
              </p>
            </div>
          </motion.div>
        )}
        {isFall && (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-[#C81E1E] text-white"
          >
            <div className="container-xl py-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-3 font-bold text-lg">
                <ShieldAlert size={24} className="shrink-0" /> {decision.title} — {decision.why}
              </p>
              <button
                onClick={handleReset}
                className="text-base font-bold bg-white text-[#A30000] hover:bg-white/90 px-5 py-2 rounded-full"
              >
                Acknowledge &amp; reset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container-xl mt-8 space-y-10">
        {/* ───────── ROW 1 : posture decision | body orientation + movement ───────── */}
        <RowLabel sub="Sections 1 – 3">Live decision</RowLabel>
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Posture Decision */}
          <Panel
            title="Posture Decision"
            icon={ShieldAlert}
            num={1}
            className="lg:col-span-6 border-2 transition-colors"
            pulse={decision.level >= 3 ? decision.hex : undefined}
            style={{
              borderColor: decision.level > 0 ? decision.hex : "#D6E3EF",
              background: decision.level > 0 ? `${decision.hex}12` : "#FFFFFF"
            }}
          >
            {/*Title*/}
            <p
              className="font-display text-3xl md:text-4xl font-bold leading-tight text-center"
              style={{ color: levelText }}
            >
              {decision.title}
            </p>
            
{/*use TiltDial function to display the tilt angle*/}
            <TiltDial tilt={decision.tilt} color={decision.hex} />
{/*why message*/}
            <p className="mt-5 text-lg text-ink leading-relaxed bg-white rounded-2xl p-4 border border-[#D6E3EF]">
              {decision.why}
            </p>
            {decision.note && (
              <p className="text-base mt-3 leading-relaxed font-medium text-[#6B2FD6]">
                {decision.note}
              </p>
            )}

            {/* 4 tilesthe evidence behind the decision */}
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Tilt angle" value={`${ev8.tilt.toFixed(0)}°`} mono />
              <Tile label="Angular velocity" value={`${ev8.gyro.toFixed(0)} °/s`} mono />
              <Tile label="Tilt speed" value={`${ev8.tiltRate.toFixed(0)} °/s`} mono />
              <Tile label="Movement" value={ev8.unstable ? "Unstable" : "Steady"} />
            </div>

            {ev8.confirming && (
              <div className="mt-4">
                <div className="flex justify-between text-base font-semibold text-ink mb-1.5">
                  <span>Staying down and still…</span>
                  <span className="font-mono">
                    {ev8.stillSec.toFixed(1)} / {(L.confirmMs / 1000).toFixed(0)} s
                  </span>
                </div>
                <div className="w-full h-3 bg-[#DCE5EE] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-150"
                    style={{ width: `${ev8.confirmPct}%`, background: decision.hex }}
                  />
                </div>
              </div>
            )}

            {/* level guide: the active row is highlighted */}
            <div className="mt-5 grid sm:grid-cols-2 gap-3 flex-1 content-end">
              {[
                { range: `under ${L.slightTilt}°`, text: "Standing normally" },
                { range: `${L.slightTilt}°–${L.losingTilt}°`, text: "Normal movement — not a fall" },
                { range: `${L.losingTilt}°+`, text: "Unstable movement — balance is going" },
                { range: "any angle", text: "Fast tilting + high angular velocity" },
                { range: `${L.fallTilt}°+`, text: "Fast downward move + posture change" },
                { range: "after the fall", text: `Down and still for ${L.confirmMs / 1000} s` }
              ].map((row, i) => {
                const active = i === decision.level;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-2xl px-4 py-3 border-2 transition-colors"
                    style={{
                      borderColor: active ? LEVELS[i].hex : "#D6E3EF",
                      background: active ? `${LEVELS[i].hex}26` : "#FFFFFF"
                    }}
                  >
                    <span
                      className="mt-1.5 w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ background: LEVELS[i].hex }}
                    />
                    <span>
                      <span
                        className="block text-base font-bold"
                        style={{ color: active ? LEVEL_TEXT[i] : "#1B2B3C" }}
                      >
                        {LEVELS[i].name} · {row.range}
                      </span>
                      <span className="block text-base text-slate">{row.text}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* right column: big Body Orientation + Movement Magnitude */}
          <div className="lg:col-span-6 flex flex-col gap-8">
            <Panel title="Body Orientation" icon={Compass} num={2} delay={0.08} className="flex-1">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Tile label="Pitch" value={`${pitchDeg.toFixed(1)}°`} mono />
                <Tile label="Roll" value={`${rollDeg.toFixed(1)}°`} mono />
                <Tile label="Direction" value={decision.dir && decision.dir !== "none" ? labelText(decision.dir.replace("-", " ")) : "—"} />
              </div>

              <div
                className="relative rounded-2xl overflow-hidden bg-[#080c10] flex-1 min-h-[460px] lg:min-h-[540px] border-4 transition-colors"
                style={{ borderColor: isFall ? "#FF3B3B" : "#0B1F33" }}
              >
                <Avatar3D sensor={sensor} color={decision.hex} />

                {/* HUD overlays */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-0 right-0 top-0 h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent animate-scan" />
                  <span className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white/60" />
                  <span className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white/60" />
                  <span className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white/60" />
                  <span className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white/60" />
                  <div className="absolute top-5 left-0 right-0 text-center px-10">
                    <p
                      className="font-mono font-bold tracking-[3px] text-xl md:text-2xl uppercase"
                      style={{ color: decision.hex, textShadow: `0 0 18px ${decision.hex}` }}
                    >
                      {decision.title}
                    </p>
                    <p className="text-base text-white/85 mt-0.5 font-mono">
                      {decision.tilt.toFixed(0)}° from upright
                    </p>
                  </div>
                  <p className="absolute bottom-5 left-6 font-mono text-sm text-signal">
                    IMU · 3D MODEL
                  </p>
                  <p className="absolute bottom-5 right-6 font-mono text-sm text-signal flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-signal animate-pulse" /> LIVE
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Movement Magnitude" icon={Gauge} num={3} delay={0.16}>
              <div className="grid sm:grid-cols-[auto_1fr] gap-x-8 gap-y-5 items-center">
                <div>
                  <p className="font-mono text-5xl font-bold text-ink">{(sensor.mag || 0).toFixed(2)}</p>
                  <p className="text-base text-slate mt-1">acceleration (g) · dashed line = 1 g</p>
                </div>
                <div className="rounded-2xl bg-mist border border-[#E1EAF2] p-3">
                  <Spark data={magData} color="#1769E0" min={0} max={2} height={84} baseline={1} area />
                  <p className="mt-1 flex justify-between text-sm text-slate font-mono">
                    <span>← 8 s ago</span>
                    <span>now</span>
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[#E1EAF2]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate uppercase tracking-wide">
                      Stability score
                    </p>
                    <p className="text-base text-slate">Lower = more unstable movement</p>
                  </div>
                  <p className="font-mono text-4xl font-bold text-ink">{stabilityScore}%</p>
                </div>
                <div className="w-full h-3 bg-[#DCE5EE] rounded-full mt-3 overflow-hidden">
                  <motion.div
                    animate={{ width: `${stabilityScore}%` }}
                    transition={{ duration: 0.15 }}
                    className="h-full rounded-full bg-[#12B76A]"
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* ───────── ROW 2 : live prediction | context awareness ───────── */}
        <RowLabel sub="Sections 4 – 5">Analysis</RowLabel>
        <div className="grid lg:grid-cols-12 gap-8">
          <Panel title="Live Prediction" icon={Activity} num={4} className="lg:col-span-5" delay={0.05}>
            <div className="flex items-center gap-5">
              <Ring
                value={prediction ? prediction.confidence : 0}
                color={prediction ? CLASS_BAR[prediction.label] || "#1769E0" : "#93A3B0"}
              />
              <div className="min-w-0">
                <p
                  className="font-display text-3xl font-bold leading-tight"
                  style={{ color: prediction ? CLASS_TEXT[prediction.label] || "#4A5B6C" : "#4A5B6C" }}
                >
                  {prediction ? labelText(prediction.label) : "Waiting for data…"}
                </p>
                <p className="text-lg text-slate mt-1">Model confidence</p>
              </div>
            </div>

            <div className="mt-6 space-y-3.5">
              {classes.map((cls) => {
                const p = prediction?.probabilities?.[cls] || 0;
                return (
                  <div key={cls}>
                    <div className="flex justify-between text-base text-ink mb-1">
                      <span>{labelText(cls)}</span>
                      <span className="font-mono font-semibold">{Math.round(p * 100)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-[#DCE5EE] rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${p * 100}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full rounded-full"
                        style={{ background: CLASS_BAR[cls] || "#1769E0" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Context Awareness" icon={ListChecks} num={5} className="lg:col-span-7" delay={0.1}>
            {ctx ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-mist rounded-2xl px-4 py-3.5 border border-[#E1EAF2]">
                    <p className="text-sm font-semibold text-slate uppercase tracking-wide">
                      Server check
                    </p>
                    {ev ? (
                      <span
                        className="inline-block mt-1.5 text-lg font-bold px-3 py-0.5 rounded-full"
                        style={{ background: `${ev.color}1f`, color: ev.color }}
                      >
                        {ev.text}
                      </span>
                    ) : (
                      <p className="mt-1 text-xl font-bold text-ink">—</p>
                    )}
                  </div>
                  <Tile label="Previous activity" value={labelText(ctx.previous_activity)} />
                  <Tile label="Direction" value={ctx.direction ? labelText(ctx.direction) : "—"} />
                  <Tile label="State" value={labelText(ctx.state)} />
                </div>

                {/* risk score */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-base font-bold text-slate uppercase tracking-wide">
                      <TrendingUp size={20} /> Fall-risk score
                    </p>
                    <p className="font-mono text-xl font-bold text-ink">
                      {Math.round(ctx.risk_score ?? 0)}/100
                    </p>
                  </div>
                  <div className="w-full h-4 bg-[#DCE5EE] rounded-full mt-3 overflow-hidden">
                    <motion.div
                      animate={{ width: `${Math.min(ctx.risk_score ?? 0, 100)}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full rounded-full"
                      style={{ background: RISK_BAR[riskKey] }}
                    />
                  </div>
                  <p className="mt-3 text-lg font-bold" style={{ color: RISK_COLOR[riskKey] }}>
                    {labelText(ctx.risk_level)} risk
                    {ctx.risk_trend && ctx.risk_trend !== "stable" ? ` · ${ctx.risk_trend}` : ""}
                  </p>
                  <p className="text-base text-slate mt-1">
                    Rises before a fall: body sway + lean + AI doubt.
                  </p>
                </div>

                {/* interpretation */}
                <div>
                  <p className="flex items-center gap-2 text-base font-bold text-slate uppercase tracking-wide mb-3">
                    <Cpu size={20} /> Interpretation
                  </p>
                  <p className="text-lg text-ink leading-relaxed bg-mist rounded-2xl p-4 border border-[#E1EAF2]">
                    {prediction.human_message}
                  </p>
                  {ctx.trigger_factors?.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {ctx.trigger_factors.map((f, i) => (
                        <li key={i} className="text-base text-ink flex gap-2">
                          <span className="text-brand-blue font-bold">•</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-lg text-slate">Waiting for enough sensor data…</p>
            )}
          </Panel>
        </div>

        {/* ───────── LAST ROW : sensor data | prediction history | posture event log ───────── */}
        <RowLabel sub="Sections 6 – 8">Raw data &amp; logs</RowLabel>
        <div className="grid lg:grid-cols-3 gap-8">
          <Panel title="Sensor Data" icon={Crosshair} num={6} delay={0.05}>
            <div className="grid grid-cols-2 gap-3 flex-1">
              {[
                { k: "ax", color: "#1769E0", fixed: [-1.5, 1.5] },
                { k: "ay", color: "#12B5A6", fixed: [-1.5, 1.5] },
                { k: "az", color: "#6D4BEA", fixed: [-1.5, 1.5] },
                { k: "gx", color: "#E0364F", fixed: null },
                { k: "gy", color: "#F97316", fixed: null },
                { k: "gz", color: "#0F8A55", fixed: null }
              ].map(({ k, color, fixed }) => {
                const series = trace.map((s) => s[k] ?? 0);
                const m = Math.max(10, ...series.map((v) => Math.abs(v)));
                const lo = fixed ? fixed[0] : -m;
                const hi = fixed ? fixed[1] : m;
                return (
                  <div key={k} className="bg-mist rounded-2xl px-4 py-3 border border-[#E1EAF2]">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-bold text-slate uppercase">{k}</p>
                      <p className="text-xl font-mono font-bold text-ink">
                        {(sensor[k] ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="mt-2">
                      <Spark data={series} color={color} min={lo} max={hi} height={38} baseline={0} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-base text-slate">
              a = acceleration (g) · g = rotation speed (°/s) · last 8 s
            </p>
          </Panel>

          <Panel title="Prediction History" icon={History} num={7} delay={0.1}>
            <div className="max-h-[26rem] overflow-y-auto pr-1">
              {history.length === 0 && <p className="text-lg text-slate">No predictions yet.</p>}
              {history.map((h, i) => (
                <div key={i} className="py-3 border-b border-[#E1EAF2] last:border-0">
                  <div className="flex items-center justify-between font-mono text-base text-slate">
                    <span>{h.time}</span>
                    <span className="font-semibold text-ink">{Math.round(h.confidence * 100)}%</span>
                  </div>
                  <span
                    className="inline-block mt-1.5 text-base font-bold px-3 py-1 rounded-full"
                    style={{
                      color: CLASS_TEXT[h.label] || "#4A5B6C",
                      background: `${CLASS_BAR[h.label] || "#93A3B0"}26`
                    }}
                  >
                    {labelText(h.label)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Posture Event Log" icon={AudioWaveform} num={8} delay={0.15}>
            <div className="max-h-[26rem] overflow-y-auto pr-1">
              {eventLog.length === 0 && <p className="text-lg text-slate">No events yet.</p>}
              {eventLog.map((e, i) => (
                <div key={i} className="py-3 border-b border-[#E1EAF2] last:border-0">
                  <div className="flex items-center justify-between font-mono text-base text-slate">
                    <span>{e.time}</span>
                    <span className="font-semibold text-ink">{e.tilt}°</span>
                  </div>
                  <span
                    className="inline-block mt-1.5 text-base font-bold px-3 py-1 rounded-full"
                    style={{ color: LEVEL_TEXT[e.level], background: `${LEVELS[e.level].hex}30` }}
                  >
                    {e.title}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── PAGE ─────────────────────────
export default function Analyzer() {
  const [wearerName, setWearerName] = useState(null);

  const handleEndSession = useCallback(() => {
    setWearerName(null);
  }, []);

  if (!wearerName) {
    return <NameGate onStart={setWearerName} />;
  }

  return <LiveDashboard wearerName={wearerName} onEndSession={handleEndSession} />;
}
