import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
