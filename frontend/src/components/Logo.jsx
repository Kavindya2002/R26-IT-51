// AegisCare logo: gradient shield with a heartbeat line.
//   tagline  -> shows "Safer Today • Healthier Tomorrow" under the name
//   dark     -> light text for dark backgrounds (footer)
export default function Logo({ size = 40, withWordmark = true, dark = false, tagline = false }) {
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="aegisShieldGrad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0A4FC4" />
            <stop offset="0.55" stopColor="#1769E0" />
            <stop offset="1" stopColor="#12B5A6" />
          </linearGradient>
        </defs>
        <path
          d="M32 3 L57 13 V30 C57 46 46 56 32 61 C18 56 7 46 7 30 V13 Z"
          fill="url(#aegisShieldGrad)"
        />
        <path
          d="M32 3 L57 13 V30 C57 46 46 56 32 61 C18 56 7 46 7 30 V13 Z"
          fill="none"
          stroke={dark ? "#FFFFFF" : "#0B1F33"}
          strokeOpacity={dark ? 0.35 : 0.12}
          strokeWidth="1.5"
        />
        <path
          d="M13 33 H23 L28 21 L35 43 L39 33 H51"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {withWordmark && (
        <div className="leading-tight">
          <span
            className={`block font-display font-bold tracking-tight text-2xl md:text-[1.7rem] ${
              dark ? "text-white" : "text-ink"
            }`}
          >
            Aegis<span className={dark ? "text-signal" : "text-brand-blue"}>Care</span>
          </span>
          {tagline && (
            <span
              className={`hidden sm:block text-[0.8rem] font-medium mt-0.5 ${
                dark ? "text-white/75" : "text-slate"
              }`}
            >
              Safer Today&nbsp;&nbsp;•&nbsp;&nbsp;Healthier Tomorrow
            </span>
          )}
        </div>
      )}
    </div>
  );
}
