import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Activity,
  Radio,
  ArrowLeft
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const ECG = "M0 40 H60 L72 40 L82 12 L94 66 L106 28 L114 40 H190 L202 40 L212 12 L224 66 L236 28 L244 40 H320";

const POINTS = [
  { icon: Activity, text: "Live fall detection from wearable sensors" },
  { icon: ShieldCheck, text: "Staff-only access to resident data" },
  { icon: Radio, text: "Instant alerts when a risk is detected" }
];

/* shared input look: big text, clear focus ring, no ugly browser autofill tint */
const FIELD =
  "group flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 transition-all " +
  "focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100";
const INPUT =
  "w-full bg-transparent text-lg text-ink outline-none placeholder:text-slate-400 " +
  "[&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_white_inset]";

function BrandPanel({ reduce }) {
  return (
    <div className="relative hidden overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      {/* technical grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(#7dd3fc 1px, transparent 1px), linear-gradient(90deg, #7dd3fc 1px, transparent 1px)",
          backgroundSize: "36px 36px"
        }}
      />
      {/* drifting glow */}
      {!reduce && (
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-sky-500/30 blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium ring-1 ring-white/20">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          System online
        </span>
        <h2 className="mt-6 font-display text-4xl font-semibold leading-tight">
          Safer today,
          <br />
          healthier tomorrow.
        </h2>
        <p className="mt-4 max-w-sm text-lg leading-relaxed text-slate-300">
          Sign in to watch over residents with real-time sensing and clear risk explanations.
        </p>
      </div>

      {/* animated vitals line */}
      <div className="relative my-8 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>Sensor stream</span>
          <span className="font-mono">50 Hz</span>
        </div>
        <svg viewBox="0 0 320 80" className="mt-2 h-24 w-full" fill="none" aria-hidden="true">
          <path d={ECG} stroke="#38bdf8" strokeOpacity="0.2" strokeWidth="2" />
          <motion.path
            d={ECG}
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: [0, 0.75, 1] }}
          />
        </svg>
      </div>

      <ul className="relative space-y-4">
        {POINTS.map(({ icon: Icon, text }, i) => (
          <motion.li
            key={text}
            className="flex items-center gap-4 text-lg text-slate-100"
            initial={{ opacity: 0, x: reduce ? 0 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.15, duration: 0.5 }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
              <Icon size={22} />
            </span>
            {text}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default function Login() {
  const reduce = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState(0); // re-triggers the shake
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await Promise.resolve(login(username.trim(), password));
    setLoading(false);
    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error);
      setErrorKey((k) => k + 1);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-mist bg-grid-glow px-4 pt-28 pb-16 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-5xl"
      >
        <div className="grid overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 lg:grid-cols-2">
          <BrandPanel reduce={reduce} />

          {/* form side */}
          <div className="p-8 sm:p-12">
            <h1 className="font-display text-4xl font-semibold text-ink">Staff login</h1>
            <p className="mt-3 text-lg text-slate-600">Access the AegisCare monitoring dashboard.</p>

            {/* key + x keyframes = shake on every new error */}
            <motion.form
              key={errorKey}
              onSubmit={handleSubmit}
              className="mt-8 space-y-6"
              animate={error && !reduce ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div>
                <label htmlFor="username" className="text-base font-semibold text-slate-700">
                  Username
                </label>
                <div className={`mt-2 ${FIELD}`}>
                  <User size={22} className="text-slate-400 transition-colors group-focus-within:text-sky-600" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className={INPUT}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="text-base font-semibold text-slate-700">
                  Password
                </label>
                <div className={`mt-2 ${FIELD}`}>
                  <Lock size={22} className="text-slate-400 transition-colors group-focus-within:text-sky-600" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsOn(e.getModifierState("CapsLock"))}
                    onBlur={() => setCapsOn(false)}
                    placeholder="Enter your password"
                    className={INPUT}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded-lg p-1 text-slate-400 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
                {capsOn && (
                  <p className="mt-2 flex items-center gap-2 text-base text-amber-700">
                    <AlertCircle size={18} /> Caps Lock is on
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3.5 text-base text-red-700 ring-1 ring-red-200"
                >
                  <AlertCircle size={22} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-sky-600 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-600/25 transition-all hover:bg-sky-700 hover:shadow-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Log in
                    <ArrowRight size={22} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </motion.form>

            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-2 text-base font-medium text-slate-500 transition-colors hover:text-sky-700"
            >
              <ArrowLeft size={18} /> Back to home
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
