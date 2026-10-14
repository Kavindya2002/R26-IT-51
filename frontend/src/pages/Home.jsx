import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  PersonStanding,
  Map,
  HeartPulse,
  BellRing,
  Bell,
  Brain,
  Cloud,
  Heart,
  Mail,
  Phone,
  LogIn,
  PlayCircle,
  Wifi,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Watch,
  Cpu
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: "easeOut" }
  })
};

// ── The four modules (edit status / text here) ──────────────────────────
const MODULES = [
  {
    icon: PersonStanding,
    title: "Activity Recognition",
    full: "Context-Aware Activity Recognition",
    
    detail:
      "A chest-worn motion sensor and a model recognize walking, standing and fall-like movements, score the fall risk and explain every decision.",
    owner: "Kavindya Chathuri",
    tone: { bg: "#E1ECFF", fg: "#1769E0" },
    status: "live"
  },
  {
    icon: Map,
    title: "Environmental Risk Mapping",
    full: "Environmental Risk Mapping & Smart Safety Zones",
    
    detail:
      "Smart safety zones identify dangerous areas in the care facility, like slippery floors and cluttered paths, so risks are found before someone is hurt",
    owner: "Sashini Diwyangi",
    tone: { bg: "#DDF5E8", fg: "#0F8A55" },
    status: "soon"
  },
  {
    icon: HeartPulse,
    title: "Cardiovascular Monitoring",
    full: "Heart Rate And BP Monitoring",
    
    detail:
      "Continuous PPG-based monitoring tracks heart rate, blood pressure, and vital changes in real-time. Sudden abnormalities are recognized to predict dizziness or instability and detect potential falls before they happen.",
    owner: "Hirushi Divyanjalie",
    tone: { bg: "#FDE4EA", fg: "#D92D4A" },
    status: "soon"
  },
  {
    icon: BellRing,
    title: "Smart Alert System",
    full: "Smart Alert System",
    detail:
      "The moment a risk or a fall is detected, caregivers and families are told straight away.",
    owner: "Kavindu Kulathunga",
    tone: { bg: "#EAE5FD", fg: "#6444E0" },
    status: "soon"
  }
];

const STEPS = [
  {
    icon: Watch,
    title: "Collect Data",
    text: "Sensors capture data in real time."
  },
  {
    icon: Cloud,
    title: "Connect to the Cloud",
    text: "Sensor data is securely transmitted to the cloud."
  },
  {
    icon: Brain,
    title: "Analyze the Situation",
    text: "AI analyzes movement patterns and detects instability and fall risk."
  },
  {
    icon: ShieldCheck,
    title: "Alert Caregivers",
    text: "Caregivers receive risk levels, explanations, and instant alerts."
  }
];

function SectionLabel({ children, light = false }) {
  return (
    <span
      className={`text-base font-bold tracking-widest uppercase ${
        light ? "text-signal" : "text-azure-dark"
      }`}
    >
      {children}
    </span>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const dashboardLink = isAuthenticated ? "/dashboard" : "/login";

  return (
    <>
      {/* ───────────────────── HERO ───────────────────── */}
      <section id="home" className="relative pt-36 md:pt-44 pb-10 overflow-hidden bg-gradient-to-b from-white via-[#F1F8FD] to-[#EAF6F8]">
        <div className="absolute -left-40 bottom-0 w-[520px] h-[520px] rounded-full bg-[#DCEBFB] blur-3xl opacity-70 pointer-events-none" />
        <div className="absolute -right-32 top-24 w-[460px] h-[460px] rounded-full bg-[#CFF1EA] blur-3xl opacity-70 pointer-events-none" />

        <div className="container-xl relative grid lg:grid-cols-[1.02fr_1fr] gap-12 lg:gap-8 items-center">
          {/* ---- text ---- */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
           

            <h1 className="mt-7 font-display font-bold leading-[1.08] tracking-tight text-ink text-center">
  <span className="block whitespace-nowrap text-[2rem] sm:text-4xl lg:text-5xl">
    Smarter Fall Detection
  </span>

  <span className="block mt-2 text-[1.7rem] sm:text-3xl lg:text-4xl text-gradient">
    Safer Living
  </span>
</h1>

            <p className="mt-7 text-lg md:text-xl text-slate leading-relaxed max-w-xl">
              AegisCare is an Smart elderly care system that combines real-time fall risk monitoring, environmental risk detection and smart alerts to help prevent falls and improve the safety of older adults.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to={dashboardLink}
                className="btn-gradient inline-flex items-center gap-3 text-white font-semibold text-lg px-8 py-4 rounded-full transition-all"
              >
                <LogIn size={22} /> Enter Dashboard
              </Link>
              <a
                href="#about"
                className="inline-flex items-center gap-3 bg-white border-2 border-brand-blue text-brand-blue font-semibold text-lg px-8 py-4 rounded-full hover:bg-brand-blue hover:text-white transition-colors"
              >
                <PlayCircle size={24} /> Explore the System
              </a>
            </div>
          </motion.div>

          {/* ---- visual: photo + floating icons + live card ---- */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mx-auto w-full max-w-[640px] lg:max-w-none pb-6 lg:pb-0"
          >
            <div
              className="relative mr-auto w-[94%] sm:w-[84%] lg:w-[70%] h-[380px] sm:h-[460px] lg:h-[540px] overflow-hidden ring-[10px] ring-white shadow-2xl bg-white"
              style={{ borderRadius: "46% 54% 42% 58% / 44% 46% 54% 56%" }}
            >
              <img
                src="/images/hero-portrait.jpg"
                alt="Smiling elderly woman wearing the AegisCare pendant sensor"
                className="w-full h-full object-cover object-[40%_15%]"
              />
            </div>

            {/* floating icons */}
            <div className="absolute left-[24%] -top-3 animate-float">
              <span className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#5CB848] text-white ring-[6px] ring-white shadow-xl">
                <PersonStanding size={36} />
              </span>
            </div>
            <div className="absolute -left-2 sm:left-[-3%] top-[44%] animate-float [animation-delay:1.2s]">
              <span className="flex items-center justify-center w-16 h-16 sm:w-[84px] sm:h-[84px] rounded-full bg-[#2D8CFF] text-white ring-[6px] ring-white shadow-xl">
                <HeartPulse size={36} />
              </span>
            </div>
            <div className="absolute z-20 right-[2%] bottom-0 lg:-bottom-8 animate-float [animation-delay:2s]">
              <span className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#6C5CE7] text-white ring-[6px] ring-white shadow-xl">
                <Bell size={34} />
              </span>
            </div>

            {/* live monitoring card */}
            <div className="relative z-10 mx-auto -mt-16 w-[94%] sm:w-[78%] lg:mt-0 lg:absolute lg:-right-3 lg:top-[26%] lg:w-[54%] lg:-rotate-3">
              <div className="rounded-3xl p-4 sm:p-5 text-white shadow-2xl border border-white/10 bg-gradient-to-br from-[#16396B] to-[#0B2248]">
                <div className="flex items-center justify-between mb-5">
                  <span className="flex items-center gap-2.5 text-base sm:text-lg font-semibold">
                    <span className="w-3 h-3 rounded-full bg-[#2BE08A] animate-pulse" />
                    Live Monitoring
                  </span>
                  <span className="flex items-center gap-1.5 text-sm sm:text-base text-white/90">
                    <Wifi size={18} /> Connected
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white/10 rounded-2xl p-4">
                    <p className="text-sm text-white/85 font-medium whitespace-nowrap">Stability Score</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-3xl font-bold">94%</span>
                      <span className="text-sm font-semibold text-[#5CF0A6] flex items-center gap-0.5">
                        <TrendingUp size={14} /> +3%
                      </span>
                    </p>
                    <div className="w-full h-2 bg-white/15 rounded-full mt-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "94%" }}
                        transition={{ duration: 1.2, delay: 0.5 }}
                        className="h-full rounded-full bg-gradient-to-r from-[#2BE08A] to-[#9BEA5C]"
                      />
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-4">
                    <p className="text-sm text-white/85 font-medium">Movement Magnitude</p>
                    <p className="mt-1 font-display text-3xl font-bold">1.02</p>
                    <p className="text-sm sm:text-base text-white/85 mt-1">(normal)</p>
                  </div>
                </div>

                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-sm sm:text-base text-white/85 font-medium">Live Prediction</p>
                  <p className="font-display text-2xl font-bold mt-1">Standing Still</p>
                  <div className="w-full h-2 bg-white/15 rounded-full mt-3 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "72%" }}
                      transition={{ duration: 1.2, delay: 0.7 }}
                      className="h-full rounded-full bg-gradient-to-r from-[#2D8CFF] to-[#34D6E0]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ---- 4 feature cards ---- */}
        <div className="container-xl relative mt-14 lg:mt-16">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {MODULES.map((m, i) => (
              <motion.a
                key={m.title}
                href="#features"
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="group flex items-center gap-5 bg-white rounded-3xl p-6 border border-[#D6E3EF] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <span
                  className="shrink-0 flex items-center justify-center w-[72px] h-[72px] rounded-full"
                  style={{ background: m.tone.bg, color: m.tone.fg }}
                >
                  <m.icon size={34} />
                </span>
                <span>
                  <span className="block font-display text-xl font-bold text-ink leading-snug">
                    {m.title}
                  </span>
                  <span className="block text-base text-slate mt-1 leading-snug">{m.blurb}</span>
                </span>
              </motion.a>
            ))}
          </div>

          <p className="mt-10 flex items-center justify-center gap-4 text-lg md:text-xl font-semibold text-brand-blue">
            <span className="hidden sm:block w-12 h-0.5 bg-brand-blue/60" />
            Smarter Monitoring <span className="text-2xl leading-none">•</span> Safer Lives
            <span className="hidden sm:block w-12 h-0.5 bg-brand-blue/60" />
          </p>
        </div>
      </section>

      {/* ───────────────────── ABOUT ───────────────────── */}
      <section id="about" className="py-24 md:py-28 bg-white">
        <div className="container-xl grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
          >
            <SectionLabel>About the system</SectionLabel>
            <h2 className="mt-4 font-display text-4xl md:text-5xl font-bold text-ink leading-tight">
              Four subsystems. One protective signal.
            </h2>
            <p className="mt-6 text-lg md:text-xl text-slate leading-relaxed">
              Most fall-detection tools only react after a fall happens. AegisCare is built to
              understand risk <strong className="text-ink">before</strong> it occurs — combining
              wearable motion data, environmental hazards, cardiovascular signals and instant
              alerting into one coordinated system
            </p>

            <ol className="mt-10 space-y-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-5">
                  <span className="shrink-0 flex items-center justify-center w-14 h-14 rounded-2xl bg-[#E1ECFF] text-brand-blue">
                    <s.icon size={26} />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-bold text-ink">
                      {i + 1}. {s.title}
                    </h3>
                    <p className="text-lg text-slate mt-1 leading-relaxed">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={1}
            className="grid grid-cols-2 gap-5"
          >
            <figure className="col-span-1 row-span-2">
              <img
                src="/images/walking.jpg"
                alt="Elderly woman walking safely with a cane and the AegisCare pendant"
                className="w-full h-full min-h-[360px] object-cover rounded-3xl shadow-xl"
              />
            </figure>
            <figure className="col-span-1">
              <img
                src="/images/caregiver.jpg"
                alt="A caregiver comforting an elderly woman"
                className="w-full h-full object-cover rounded-3xl shadow-xl"
              />
            </figure>
            <div className="col-span-1 rounded-3xl bg-gradient-to-br from-[#16396B] to-[#0B2248] text-white p-6 flex flex-col justify-center shadow-xl">
              <p className="flex items-center gap-2 text-base font-semibold text-white/85">
                <ShieldCheck size={22} className="text-[#2BE08A]" /> Fall Risk
              </p>
              <p className="font-display text-4xl font-bold text-[#5CF0A6] mt-1">Low</p>
              <p className="text-base text-white/85 mt-1">Monitoring in progress…</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ───────────────────── FEATURES ───────────────────── */}
      <section id="features" className="py-24 md:py-28 bg-mist">
        <div className="container-xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="max-w-3xl"
          >
            <SectionLabel>Features</SectionLabel>
            <h2 className="mt-4 font-display text-4xl md:text-5xl font-bold text-ink leading-tight">
              Four Subsystems, One Platform.
            </h2>
           
          </motion.div>

          <div className="mt-14 grid md:grid-cols-2 gap-7">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                className="bg-white rounded-3xl p-8 border border-[#D6E3EF] shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className="flex items-center justify-center w-16 h-16 rounded-2xl"
                    style={{ background: m.tone.bg, color: m.tone.fg }}
                  >
                    <m.icon size={32} />
                  </span>
                  <span
                    className={`text-base font-semibold px-4 py-1.5 rounded-full ${
                      m.status === "live"
                        ? "bg-[#DDF5E8] text-[#0B7444]"
                        : "bg-[#EEF2F6] text-slate"
                    }`}
                  >
                    {m.status === "live" ? "● Live" : "Coming soon"}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-2xl font-bold text-ink">{m.full}</h3>
                <p className="mt-3 text-lg text-slate leading-relaxed">{m.detail}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base text-slate">
                    Built by <span className="font-semibold text-ink">{m.owner}</span>
                  </p>
                  {m.status === "live" && (
                    <Link
                      to={dashboardLink}
                      className="inline-flex items-center gap-2 text-lg font-semibold text-brand-blue hover:text-azure-dark"
                    >
                      Open dashboard <ArrowRight size={20} />
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── TEAM ───────────────────── */}
      <section id="team" className="py-24 md:py-28 bg-white">
        <div className="container-xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="max-w-3xl"
          >
            <SectionLabel>The team</SectionLabel>
           
          </motion.div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.owner}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                className="bg-mist rounded-3xl p-7 text-center border border-[#D6E3EF]"
              >
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto font-display text-2xl font-bold"
                  style={{ background: m.tone.bg, color: m.tone.fg }}
                >
                  {m.owner
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <h3 className="font-display text-xl font-bold text-ink mt-5">{m.owner}</h3>
                
                <p className="text-base text-slate mt-3 leading-relaxed">{m.full}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── CONTACT ───────────────────── */}
      <section id="contact" className="py-24 md:py-28 bg-ink text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-glow opacity-40 pointer-events-none" />
        <div className="container-xl relative grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
          >
            <SectionLabel light>Get in touch</SectionLabel>
            <h2 className="mt-4 font-display text-4xl md:text-5xl font-bold leading-tight">
              Interested for your care home or hospital?
            </h2>
            <p className="mt-5 text-lg md:text-xl text-white/80 leading-relaxed max-w-lg">
              We&apos;re building AegisCare for real deployment in elderly care facilities. Reach
              out for a walkthrough of the system.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={1}
            className="bg-white/10 border border-white/15 rounded-3xl p-8 space-y-6"
          >
            <a href="mailto:kavindyamallawa@gmail.com" className="flex items-center gap-5 group">
              <span className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-signal group-hover:bg-signal group-hover:text-ink transition-colors">
                <Mail size={24} />
              </span>
              <div>
                <p className="text-base text-white/75">Email</p>
                <p className="text-lg md:text-xl font-semibold break-all">aegiscaresl@gmail.com</p>
              </div>
            </a>
            <a href="tel:+94776032717" className="flex items-center gap-5 group">
              <span className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-signal group-hover:bg-signal group-hover:text-ink transition-colors">
                <Phone size={24} />
              </span>
              <div>
                <p className="text-base text-white/75">Phone</p>
                <p className="text-lg md:text-xl font-semibold">+94 77 603 2717</p>
              </div>
            </a>
          </motion.div>
        </div>
      </section>
    </>
  );
}
