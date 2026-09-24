/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // X-REACH electric-blue / crimson healthcare-technology theme,
        // matched to the brand pitch deck (electric blue -> crimson gradient
        // with a glowing cyan ECG trace).
        // Use these shades consistently instead of introducing unrelated dominant colors.
        neon: {
          50: "#eaf3ff",
          100: "#d3e6ff",
          200: "#a8cdff",
          300: "#7db3ff",
          400: "#5aa0ff", // blue-bright
          500: "#2f7bff", // primary electric blue
          600: "#1f63d6",
          700: "#1650ad",
          800: "#103a6e",
          900: "#0b2350",
          950: "#050d1b",
        },
        cyan: {
          400: "#3fe0ff", // signal / secondary accent
          500: "#22c7e8",
        },
        crimson: {
          400: "#ff5c78",
          500: "#ff3b5c", // cardiac accent — use sparingly
          600: "#e01f3f",
        },
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "neon-glow": "0 0 20px rgba(47, 123, 255, 0.35)",
        card: "0px 10px 25px rgba(5, 13, 27, 0.15)",
      },
      dropShadow: {
        "neon-glow": "0 0 10px rgba(47, 123, 255, 0.45)",
      },
      backgroundImage: {
        "neon-gradient": "linear-gradient(168deg, #081428 0%, #050d1b 100%)",
      },
      keyframes: {
        "loading-slide": {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(60%)" },
          "100%": { transform: "translateX(200%)" },
        },
      },
      animation: {
        "loading-slide": "loading-slide 1.3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
