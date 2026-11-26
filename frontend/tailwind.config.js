/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: "#F6F0E4", 50: "#FFFCF6", 100: "#FBF6EC", 200: "#F1E8D6", 300: "#E9DFC9", 400: "#DDD0B5", 500: "#C9B894" },
        navy: { 50: "#E8EEF6", 100: "#D0DCEB", 200: "#A6BBD5", 300: "#6F8EB5", 400: "#3F6491", 500: "#2A4C77", 600: "#1F3A5F", 700: "#182E4B", 800: "#122338", 900: "#0C1826" },
        ink: { DEFAULT: "#1C2733", soft: "#4A4F57", muted: "#7A7263" },
        gold: { DEFAULT: "#B8862F", soft: "#F3E6C7" },
        ok: { DEFAULT: "#2F7D5B", soft: "#DDEFE5" },
        warn: { DEFAULT: "#A8701A", soft: "#F7E9CF" },
        bad: { DEFAULT: "#B4443A", soft: "#F6DEDA" },
      },
      fontFamily: { sans: ["Vazirmatn", "Tahoma", "sans-serif"] },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: { card: "0 1px 0 rgba(31,58,95,0.04), 0 2px 10px -4px rgba(31,58,95,0.10)" },
    },
  },
  plugins: [],
};
