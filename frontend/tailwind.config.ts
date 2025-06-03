import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
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
        // Brand colors
        teal: {
          50: "#E6EFED",
          100: "#C0D6D1",
          200: "#96BBB2",
          300: "#6C9F93",
          400: "#4D8A7B",
          500: "#2D7463",
          600: "#286C5B",
          700: "#225F51",
          800: "#1C5347",
          900: "#1A3C34", // Primary Deep Teal
        },
        gold: {
          50: "#FBF8E9",
          100: "#F5EEC8",
          200: "#EEE3A4",
          300: "#E7D87F",
          400: "#E1CF64",
          500: "#D4AF37", // Secondary Soft Gold
          600: "#C9A332",
          700: "#BC942B",
          800: "#B08625",
          900: "#9A6B1A",
        },
        neutral: {
          50: "#F5F5F5", // Background Off-White
          100: "#E5E7EB", // Accent Light Gray
          200: "#D1D5DB",
          300: "#9CA3AF",
          400: "#6B7280",
          500: "#4B5563",
          600: "#374151",
          700: "#1F2937",
          800: "#111827",
          900: "#0A0A0A",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        shimmer: {
          "100%": {
            transform: "translateX(100%)",
          },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
        "slide-in-right": "slideInRight 0.5s ease-out forwards",
      },
      fontFamily: {
        sans: ["var(--font-open-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
  safelist: [
    "bg-teal-900",
    "text-white",
    "hover:text-gold-300",
    "shadow-md",
    "shadow-sm",
    "!bg-teal-900",
    "!text-white",
    "hover:!text-gold-300",
  ],
} satisfies Config

export default config
