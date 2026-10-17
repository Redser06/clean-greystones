/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b1c30",
        muted: "#3d4a42",
        line: "#d5ddd8",
        canvas: "#f3f6f4",
        primary: "#006948",
        "primary-container": "#00855d",
        "on-primary": "#ffffff",
        "surface": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f6f4",
        "surface-container": "#e8eeea",
        "surface-container-high": "#dce5df",
        "on-surface": "#0b1c30",
        "on-surface-variant": "#3d4a42",
        "outline": "#6d7a72",
        "outline-variant": "#d5ddd8",
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        "tertiary": "#8d4b00",
        "tertiary-container": "#b15f00",
        "secondary": "#565e74"
      },
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
