import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        abyss: "#05070f",
        navy: {
          900: "#0a0f1e",
          800: "#0d1526",
          700: "#111c33",
          600: "#16233f",
        },
        line: "#1e293b",
        electric: {
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
        },
        violet: {
          400: "#a78bfa",
          500: "#8b5cf6",
        },
        mist: "#94a3b8",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
