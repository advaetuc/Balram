import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans Devanagari", "Kohinoor Devanagari", "Nirmala UI", "Mangal", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        forest: "#1E5631",
        amber: "#FFBF00",
        sky: "#4A90E2",
        daylight: "#FAFAFA",
        ink: "#212121",
      },
    },
  },
  plugins: [],
} satisfies Config;
