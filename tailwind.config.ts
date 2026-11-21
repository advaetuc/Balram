import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)"],
        heading: ["var(--font-heading)"],
      },
      colors: {
        forest: "#1E5631",
        amber: "#FFBF00",
        sky: "#4A90E2",
        daylight: "#FAFAFA",
        ink: "#212121",
        "border-strong": "var(--color-border-strong)",
        "surface-bg": "var(--color-background)",
        "surface-muted": "var(--color-muted)",
        "muted-foreground": "var(--color-muted-foreground)",
        accent: "var(--color-accent)",
        info: "var(--color-info)",
        "info-subtle": "var(--color-info-subtle)",
        "on-info-subtle": "var(--color-on-info-subtle)",
        "success-subtle": "var(--color-success-subtle)",
        "on-success-subtle": "var(--color-on-success-subtle)",
        "warning-subtle": "var(--color-warning-subtle)",
        "on-warning-subtle": "var(--color-on-warning-subtle)",
        destructive: "var(--color-destructive)",
        "destructive-subtle": "var(--color-destructive-subtle)",
        "on-destructive-subtle": "var(--color-on-destructive-subtle)",
        scrim: "var(--color-scrim)",
      },
      lineHeight: {
        body: "var(--line-height-body)",
        heading: "var(--line-height-heading)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        sheet: "var(--shadow-sheet)",
        toast: "var(--shadow-toast)",
      },
      zIndex: {
        sticky: "20",
        "bottom-bar": "40",
        scrim: "1100",
        sheet: "1110",
        toast: "1200",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
        exit: "var(--duration-exit)",
      },
      transitionTimingFunction: {
        enter: "var(--ease-enter)",
        exit: "var(--ease-exit)",
        standard: "var(--ease-standard)",
      },
    },
  },
  plugins: [],
} satisfies Config;
