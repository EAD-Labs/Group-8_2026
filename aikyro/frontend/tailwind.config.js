/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AI KYRO palette — cool paper + ink base, cobalt for focus/brand,
        // amber for earned achievement, and four distinct persona colors
        // (never rely on color alone to distinguish speakers — always paired
        // with an avatar initial + name label).
        paper: "#F5F4F0",
        ink: "#1B2130",
        cobalt: {
          DEFAULT: "#2F3F8F",
          dark: "#232F70",
          light: "#EEF0FA",
        },
        amber: {
          DEFAULT: "#C98A2E",
          light: "#FBF1DF",
        },
        teacher: "#2F3F8F",
        basic: "#1E8A72",
        advanced: "#6B3FA0",
        learner: "#B54A34",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
