/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ktn: {
          primary: "#991B1B",
          primaryHover: "#7F1D1D",
          primaryLight: "#FEF2F2",
          primaryBorder: "#FECACA",
          gold: "#B45309",
          goldLight: "#FFFBEB",
          bg: "#FAF8F5",
          surface: "#FFFFFF",
          text: "#18181B",
          muted: "#52525B",
          subtle: "#E4E4E7",
          zaloBlue: "#0068FF",
          zaloBg: "#EEF2F7",
          zaloBubbleMe: "#E5EFFF"
        }
      },
      fontFamily: {
        sans: [
          '"Be Vietnam Pro"',
          '"Plus Jakarta Sans"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif'
        ]
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(24, 24, 27, 0.06), 0 1px 2px -1px rgba(24, 24, 27, 0.04)",
        float: "0 10px 25px -5px rgba(24, 24, 27, 0.08), 0 8px 10px -6px rgba(24, 24, 27, 0.04)"
      }
    }
  },
  plugins: []
};
