/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./pages/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FAFAFA",
        line: "#E5E7EB",
        textMuted: "#6B7280",
      },
      borderRadius: { "2xl": "1rem" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 14px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/line-clamp"),
  ],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        black: "#0A0A0A",
        offwhite: "#FAFAFA",
        border: "#E5E7EB",
        gray: {
          900: "#111827",
          500: "#6B7280",
        },
      },
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          md: "1.5rem",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/line-clamp")],
};


