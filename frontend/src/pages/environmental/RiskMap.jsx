import { useMemo } from "react";
import { riskOf, shade } from "./riskStyle.js";

// Isometric "3D" risk map drawn in plain SVG (no extra libraries).
// Zones and devices come from MQTT discovery - nothing is hard-coded.
// Each zone is a box coloured by its risk level; devices float above it
// (green = online, red = offline, diamond = camera).

const W = 3.2; // box size (x)
const D = 2.7; // box size (y)
const H = 1.8; // box height
const SPACING = 4.4;
const K = 46; // pixels per unit
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

const project = (x, y, z) => ({
  x: (x - y) * COS * K,
  y: (x + y) * SIN * K - z * K
});
const pts = (arr) => arr.map(([x, y, z]) => {
  const p = project(x, y, z);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}).join(" ");

export default function RiskMap({ zones, devices }) {
  const layout = useMemo(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(zones.length)));
    return zones
      .map((z, i) => ({ zone: z, cx: (i % cols) * SPACING, cy: Math.floor(i / cols) * SPACING }))
      .sort((a, b) => a.cx + a.cy - (b.cx + b.cy)); // painter's order: far -> near
  }, [zones]);

  if (!zones.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200">
        Waiting for MQTT device discovery…
      </div>
    );
  }

  // viewBox that fits every box + labels
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  layout.forEach(({ cx, cy }) => {
    [[cx - W / 2, cy - D / 2, 0], [cx + W / 2, cy - D / 2, 0], [cx + W / 2, cy + D / 2, 0], [cx - W / 2, cy + D / 2, 0], [cx, cy, H + 1.9]].forEach(([x, y, z]) => {
      const p = project(x, y, z);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  });
  const pad = 40;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

  return (
    <svg viewBox={vb} className="h-[26rem] w-full" role="img" aria-label="3D risk map of all safety zones">
      {layout.map(({ zone, cx, cy }) => {
        const { hex } = riskOf(zone.risk_level);
        const x1 = cx - W / 2, x2 = cx + W / 2, y1 = cy - D / 2, y2 = cy + D / 2;
        const zoneDevices = devices.filter((d) => d.zone_id === zone.zone_id);
        const label = project(cx, cy, H + 0.45);

        return (
          <g key={zone.zone_id}>
            <title>{`${zone.zone_id} - risk ${zone.risk_score} (${zone.risk_level})`}</title>
            {/* floor shadow */}
            <polygon points={pts([[x1 - 0.2, y1 - 0.2, 0], [x2 + 0.2, y1 - 0.2, 0], [x2 + 0.2, y2 + 0.2, 0], [x1 - 0.2, y2 + 0.2, 0]])} fill="rgba(15,23,42,0.07)" />
            {/* left face (y2), right face (x2), top */}
            <polygon points={pts([[x1, y2, 0], [x2, y2, 0], [x2, y2, H], [x1, y2, H]])} fill={shade(hex, -0.18)} opacity="0.9" />
            <polygon points={pts([[x2, y1, 0], [x2, y2, 0], [x2, y2, H], [x2, y1, H]])} fill={shade(hex, -0.38)} opacity="0.9" />
            <polygon points={pts([[x1, y1, H], [x2, y1, H], [x2, y2, H], [x1, y2, H]])} fill={shade(hex, 0.12)} opacity="0.92" stroke="white" strokeWidth="1.5" />

            <text x={label.x} y={label.y} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0B1F33" style={{ paintOrder: "stroke" }} stroke="white" strokeWidth="3">
              {zone.zone_id}
            </text>
            <text x={label.x} y={label.y + 17} textAnchor="middle" fontSize="13" fill="#334155" style={{ paintOrder: "stroke" }} stroke="white" strokeWidth="3">
              Risk {zone.risk_score}
            </text>

            {/* devices */}
            {zoneDevices.map((d, i) => {
              const a = (2 * Math.PI * i) / Math.max(1, zoneDevices.length);
              const dx = cx + Math.cos(a) * 1.05;
              const dy = cy + Math.sin(a) * 1.05;
              const base = project(dx, dy, H);
              const top = project(dx, dy, H + 0.75);
              const online = d.status === "ONLINE";
              const color = online ? "#16A34A" : "#DC2626";
              return (
                <g key={d.device_id}>
                  <title>{`${d.device_id} (${d.device_type}) - ${online ? "online" : "offline"}`}</title>
                  <line x1={base.x} y1={base.y} x2={top.x} y2={top.y} stroke={color} strokeWidth="1.5" />
                  {d.device_type === "camera" ? (
                    <rect x={top.x - 6} y={top.y - 6} width="12" height="12" transform={`rotate(45 ${top.x} ${top.y})`} fill={color} stroke="white" strokeWidth="1.5" />
                  ) : (
                    <circle cx={top.x} cy={top.y} r="6.5" fill={color} stroke="white" strokeWidth="1.5" />
                  )}
                  <text x={top.x} y={top.y - 11} textAnchor="middle" fontSize="10.5" fill="#0B1F33" style={{ paintOrder: "stroke" }} stroke="white" strokeWidth="3">
                    {d.device_id}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
