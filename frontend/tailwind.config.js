/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B1F33",
          light: "#132A44",
          soft: "#1C3A57"
        },
        azure: {
          DEFAULT: "#0078D4",
          dark: "#005A9E",
          light: "#3B9CE8"
        },
        signal: {
          DEFAULT: "#00C2D1",
          soft: "#7FE6EC"
        },
        mist: "#F7FAFC",
        // darker greys = much better contrast on white (WCAG AA)
        slate: {
          DEFAULT: "#3F5164",
          light: "#66788A"
        },
        brand: {
          blue: "#1769E0",
          teal: "#12B5A6"
        },
        coral: {
          DEFAULT: "#FF5A5F",
          soft: "#FFB4B6"
        }
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      backgroundImage: {
        "grid-glow":
          "radial-gradient(circle at 20% 20%, rgba(0,120,212,0.18), transparent 45%), radial-gradient(circle at 80% 60%, rgba(0,194,209,0.14), transparent 40%)"
      },
      keyframes: {
        "pulse-line": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "pulse-line": "pulse-line 3.2s linear infinite",
        float: "float 5s ease-in-out infinite",
        "fade-up": "fade-up 0.6s ease-out forwards"
      }
    }
  },
  plugins: []
};
