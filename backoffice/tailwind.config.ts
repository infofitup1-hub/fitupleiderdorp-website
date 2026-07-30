import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // FIT UP premium dark theme
        ink: {
          DEFAULT: "#0a0a0a", // black
          800: "#121212",
          700: "#1a1a1a", // charcoal
          600: "#232323",
          500: "#2e2e2e",
        },
        lime: {
          DEFAULT: "#bef264",
          400: "#c6f75f",
          500: "#a3e635",
          600: "#84cc16",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
