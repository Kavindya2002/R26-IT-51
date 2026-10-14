import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Construction, Server, Wifi, WifiOff } from "lucide-react";

// Temporary page shell for a teammate's module.
// Pings the module's backend /health so you can see whether its server is
// running. When the real UI is ready, replace the shell inside the module's
// page file (e.g. src/pages/environmental/EnvironmentalRisk.jsx) with your own
// components - nothing else in the app needs to change.
export default function ModuleShell({
  title,
  owner,
  apiUrl,
  backendFolder,
  frontendFile,
  port
}) {
  const navigate = useNavigate();
  const [online, setOnline] = useState(null); // null = checking

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-mist bg-grid-glow pt-28 pb-16 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-sm font-semibold text-azure hover:text-azure-dark mb-6"
        >
          <ArrowLeft size={16} /> Back to dashboard
        </button>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card-surface p-8"
        >
          <div className="w-14 h-14 rounded-2xl bg-azure/10 text-azure flex items-center justify-center">
            <Construction size={24} />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">{title}</h1>
          <p className="text-sm text-slate mt-1">Owner: {owner}</p>

          <div className="mt-6 flex items-center justify-between rounded-xl bg-mist border border-slate-light/20 p-4">
            <div className="flex items-center gap-3">
              <Server size={18} className="text-azure" />
              <div>
                <p className="text-sm font-semibold text-ink">Module backend</p>
                <p className="text-xs text-slate font-mono">{apiUrl}</p>
              </div>
            </div>
            <span
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                online ? "bg-signal/15 text-signal-soft" : "bg-coral/15 text-coral"
              }`}
              style={online ? { color: "#00A862", background: "#00A86218" } : undefined}
            >
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online === null ? "Checking…" : online ? "Backend online" : "Backend offline"}
            </span>
          </div>

          <div className="mt-6 text-sm text-slate leading-relaxed space-y-2">
            <p>This module's frontend hasn't been added yet. To plug it in:</p>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>
                Copy the module's server code into{" "}
                <code className="font-mono text-xs bg-mist px-1.5 py-0.5 rounded">{backendFolder}</code>{" "}
                (it must expose <code className="font-mono text-xs">/health</code> on port {port}).
              </li>
              <li>
                Build the module's UI in{" "}
                <code className="font-mono text-xs bg-mist px-1.5 py-0.5 rounded">{frontendFile}</code>{" "}
                (replace the <code className="font-mono text-xs">&lt;ModuleShell … /&gt;</code> there).
              </li>
            </ol>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
