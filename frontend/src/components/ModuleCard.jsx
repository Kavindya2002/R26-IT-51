import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export default function ModuleCard({ index, icon: Icon, title, owner, description, status, path }) {
  const navigate = useNavigate();
  const isLive = status === "live";

  return (
    <motion.button
      onClick={() => navigate(path)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="card-surface text-left p-7 flex flex-col gap-5 group relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs text-slate-light tracking-widest">
          {String(index).padStart(2, "0")}
        </span>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            isLive
              ? "bg-signal/15 text-signal-soft bg-signal/10 text-signal"
              : "bg-slate-light/15 text-slate"
          }`}
        >
          {isLive ? "● Live" : "Coming soon"}
        </span>
      </div>

      <div className="w-12 h-12 rounded-xl bg-azure/10 text-azure flex items-center justify-center">
        <Icon size={22} />
      </div>

      <div>
        <h3 className="font-display font-semibold text-lg text-ink leading-snug">
          {title}
        </h3>
        <p className="text-sm text-slate mt-1.5 leading-relaxed">{description}</p>
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-light/20">
        <span className="text-xs text-slate-light">{owner}</span>
        <ArrowUpRight
          size={16}
          className="text-slate-light group-hover:text-azure group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
        />
      </div>
    </motion.button>
  );
}
