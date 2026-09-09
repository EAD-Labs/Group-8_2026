/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // small, deliberate palette — tweak here as the client's brand firms up
        teacher: "#2563eb",
        basic: "#16a34a",
        advanced: "#9333ea",
        learner: "#ea580c",
      },
    },
  },
  plugins: [],
}
