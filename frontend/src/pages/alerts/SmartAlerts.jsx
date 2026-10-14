import ModuleShell from "../../components/ModuleShell.jsx";

// ─────────────────────────────────────────────────────────────
//  Smart Alert System
//  Owner: Kavindu Kulathunga
//
//  Replace <ModuleShell /> below with this module's real dashboard.
//  Backend lives in: backend/alerts/   (port 5053)
//  Backend URL is read from .env → VITE_ALERTS_API_URL
// ─────────────────────────────────────────────────────────────
export const API_URL = import.meta.env.VITE_ALERTS_API_URL || "http://127.0.0.1:5053";

export default function SmartAlerts() {
  return (
    <ModuleShell
      title="Smart Alert System"
      owner="Kavindu Kulathunga"
      apiUrl={API_URL}
      port={5053}
      backendFolder="backend/alerts/"
      frontendFile="frontend/src/pages/alerts/SmartAlerts.jsx"
    />
  );
}
