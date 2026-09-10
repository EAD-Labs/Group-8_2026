/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F0DF",
        ink: "#163A36",
        cobalt: { DEFAULT: "#2D7469", dark: "#1D514A", light: "#E0F0EA" },
        amber: { DEFAULT: "#D99E25", light: "#FFF0C9" },
        teacher: "#2D7469",
        basic: "#3A9A78",
        advanced: "#7655B6",
        learner: "#B85B45",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
