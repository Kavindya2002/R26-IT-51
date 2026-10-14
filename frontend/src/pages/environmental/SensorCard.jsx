import { useState } from "react";
import { Volume2, VolumeX, Droplets, Sun, Ruler, Footprints, Thermometer, ChevronDown } from "lucide-react";
import { envRiskApi } from "../../lib/envRiskApi.js";
import { riskOf } from "./riskStyle.js";

const num = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : "-");

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" title={hint}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        <Icon size={15} /> {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export default function SensorCard({ device, onChanged }) {
  const [imuOpen, setImuOpen] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const s = device.sensors || {};
  const risk = riskOf(device.risk_level);
  const online = device.status === "ONLINE";

  async function run(fn, okText) {
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink">
            {device.device_id} <span className="font-normal text-slate-500">— {device.zone_id || "no zone"}</span>
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {online ? `Last seen ${device.seconds_since_seen ?? 0}s ago` : "Disconnected"}
            {device.ip ? ` • ${device.ip}` : ""}
            {device.rssi != null ? ` • ${device.rssi} dBm` : ""}
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${risk.chip}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${risk.dot}`} />
          Risk {device.risk_score} · {risk.label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Metric icon={Sun} label="Light" value={typeof s.light === "number" ? `${num(s.light)} lx` : "-"} />
        <Metric icon={Ruler} label="Distance" value={s.distance != null ? `${s.distance} mm` : "-"} />
        <Metric
          icon={Droplets}
          label="Moisture"
          value={device.wetness_pct != null ? `${device.wetness_pct} % wet` : "-"}
          hint={`Raw ADC: ${s.moisture ?? "-"} | dry baseline: ${device.moisture_dry ?? "-"}`}
        />
        <Metric icon={Footprints} label="Motion" value={device.motion_active ? "YES" : "NO"} />
        <Metric icon={Thermometer} label="Temperature" value={typeof s.temperature === "number" ? `${num(s.temperature)} °C` : "-"} />
      </div>

      <button
        onClick={() => setImuOpen((o) => !o)}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700"
      >
        MPU6050 / IMU data
        <ChevronDown size={16} className={`transition-transform ${imuOpen ? "rotate-180" : ""}`} />
      </button>
      {imuOpen && (
        <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
          {[["Acc X", "accX"], ["Acc Y", "accY"], ["Acc Z", "accZ"], ["Gyro X", "gyroX"], ["Gyro Y", "gyroY"], ["Gyro Z", "gyroZ"]].map(([label, key]) => (
            <div key={key} className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="font-mono text-base font-semibold text-ink">{num(s[key], 3)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
          {device.buzzer ? <Volume2 size={16} className="text-red-500" /> : <VolumeX size={16} />}
          Buzzer: <b>{device.buzzer ? "ON" : "OFF"}</b>
        </span>
        <button
          onClick={() => run(() => envRiskApi.setBuzzer(device.device_id, true), "Buzzer ON command sent.")}
          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40"
          disabled={!online}
        >
          Activate buzzer
        </button>
        <button
          onClick={() => run(() => envRiskApi.setBuzzer(device.device_id, false), "Buzzer OFF command sent.")}
          className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-40"
          disabled={!online}
        >
          Stop buzzer
        </button>
        <button
          onClick={() => run(() => envRiskApi.calibrateDry(device.device_id), "Dry baseline saved.")}
          className="rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
          title="Press while the floor is dry"
        >
          Set dry baseline
        </button>
        {msg && <span className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
