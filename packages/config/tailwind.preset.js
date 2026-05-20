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
        // Industrial-military palette
        olive: {
          50: "#F5F6EE",
          100: "#E5E8D2",
          200: "#C9CFA0",
          300: "#A8B36C",
          400: "#849147",
          500: "#5F6B30",
          600: "#3D4F27",
          700: "#2E3B1F",
          800: "#1F2814",
          900: "#11160C",
        },
        khaki: {
          50: "#FBF7EA",
          100: "#F5EBC5",
          200: "#E8D58E",
          300: "#D9BE5A",
          400: "#C4A962",
          500: "#A88C3F",
          600: "#866D2A",
          700: "#5F4D1D",
          800: "#3D310F",
          900: "#211A06",
        },
        umber: {
          50: "#F8EFE6",
          100: "#EAD2B7",
          200: "#D2A87B",
          300: "#B47F49",
          400: "#8B4513",
          500: "#73370E",
          600: "#5A2A0B",
          700: "#411E08",
          800: "#291305",
          900: "#130802",
        },
        cream: {
          DEFAULT: "#FAF8F5",
          50: "#FFFFFF",
          100: "#FAF8F5",
          200: "#EFEBE2",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          50: "#5E5E5E",
          100: "#4A4A4A",
          200: "#333333",
          300: "#1A1A1A",
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
        display: ["var(--font-display)", "Oswald", "ui-sans-serif", "system-ui"],
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
