// Shared colours for risk levels (LOW / MEDIUM / HIGH)
export const RISK = {
  LOW: { label: "Low", hex: "#22C55E", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  MEDIUM: { label: "Medium", hex: "#F59E0B", chip: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  HIGH: { label: "High", hex: "#EF4444", chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" }
};

export const riskOf = (level) => RISK[level] || RISK.LOW;

// mix a hex colour with black (amt<0) or white (amt>0) - used to shade the 3D faces
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const c = (v) => Math.round((t - v) * p + v);
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}
