/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AI KYRO palette — warm parchment + forest-green base, terracotta
        // amber for earned achievement, and four distinct persona colors
        // (never rely on color alone to distinguish speakers — always paired
        // with an avatar initial + name label).
        paper: "#F7EFDC",
        cream: "#FFFDF7",
        line: "#E5D5B8",
        ink: "#173C32",
        cobalt: {
          DEFAULT: "#17483B",
          dark: "#12382F",
          light: "#DFEEE8",
        },
        amber: {
          DEFAULT: "#E4A52D",
          light: "#FFF0C1",
        },
        teacher: "#1F4A3D",
        basic: "#3D7A4A",
        advanced: "#7A4A8C",
        learner: "#B5502E",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
