/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Neon-purple healthcare-technology theme.
        // Use these shades consistently instead of introducing unrelated dominant colors.
        neon: {
          50: "#f6f0ff",
          100: "#ede1ff",
          200: "#d9c2ff",
          300: "#c095ff",
          400: "#a65cff",
          500: "#8c2bff", // primary neon purple
          600: "#7a1fe0",
          700: "#6416b8",
          800: "#4f1291",
          900: "#3a0d6b",
          950: "#1f0640",
        },
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "neon-glow": "0 0 20px rgba(140, 43, 255, 0.35)",
        card: "0px 10px 25px rgba(31, 6, 64, 0.15)",
      },
      dropShadow: {
        "neon-glow": "0 0 10px rgba(140, 43, 255, 0.45)",
      },
      backgroundImage: {
        "neon-gradient": "linear-gradient(135deg, #3a0d6b 0%, #8c2bff 50%, #c095ff 100%)",
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
