import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EnvironmentalRisk from "./pages/environmental/EnvironmentalRisk.jsx";
import Cardiovascular from "./pages/cardiovascular/Cardiovascular.jsx";
import SmartAlerts from "./pages/alerts/SmartAlerts.jsx";
import Analyzer from "./pages/analyzer/Analyzer.jsx";

export default function App() {
  const location = useLocation();
  const hideChrome = location.pathname !== "/"; // nav+footer only on the landing page

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/activity-recognition"
            element={
              <ProtectedRoute>
                <Analyzer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/environmental-risk"
            element={
              <ProtectedRoute>
                <EnvironmentalRisk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/cardiovascular"
            element={
              <ProtectedRoute>
                <Cardiovascular />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/alerts"
            element={
              <ProtectedRoute>
                <SmartAlerts />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      {!hideChrome && <Footer />}
    </div>
  );
}
