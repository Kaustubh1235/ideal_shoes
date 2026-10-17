/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        md: "2rem",
        lg: "4rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // IDEALX palette: tanned leather, warm sand, oxblood accent, ivory ground
        leather: {
          50: "#F7F2EE",
          100: "#EBE0D8",
          200: "#D5BFB2",
          300: "#B8957F",
          400: "#96674D",
          500: "#7A4A33",
          600: "#5E3526",
          700: "#46261B",
          800: "#2F1811",
          900: "#1A0C08",
        },
        sand: {
          50: "#FBF8F2",
          100: "#F3EBDD",
          200: "#E4D4BC",
          300: "#D1B995",
          400: "#BFA17A",
          500: "#A5845C",
          600: "#846844",
          700: "#5F4A30",
          800: "#3E301F",
          900: "#211910",
        },
        oxblood: {
          50: "#F8ECEE",
          100: "#EDCBD0",
          200: "#D99AA3",
          300: "#BF6672",
          400: "#9E3A48",
          500: "#7A1F2B",
          600: "#5F1722",
          700: "#45101A",
          800: "#2C0A10",
          900: "#160508",
        },
        cream: {
          DEFAULT: "#FBF9F6",
          50: "#FFFFFF",
          100: "#FBF9F6",
          200: "#F1ECE4",
        },
        ink: {
          DEFAULT: "#1E1714",
          50: "#6B5F58",
          100: "#55493F",
          200: "#3B302A",
          300: "#1E1714",
        },
        // shadcn semantic mapping (used by components)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "Georgia", "ui-serif", "serif"],
        body: ["var(--font-body)", "Source Sans 3", "ui-sans-serif", "system-ui"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
