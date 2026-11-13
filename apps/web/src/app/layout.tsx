import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

// Self-hosted so builds and pages never depend on fonts.googleapis.com (OFL, see fonts/LICENSE.txt).
const display = localFont({
  src: "./fonts/fraunces-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const body = localFont({
  src: "./fonts/source-sans-3-latin-wght.woff2",
  weight: "200 900",
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "IDEALX — Boots and Formal Shoes from Our Agra Factory",
    template: "%s · IDEALX",
  },
  description:
    "Service and army boots, formal shoes and jackets made in our own factory in Agra and sold direct. The factory that makes boots for service makes your formal shoes.",
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "IDEALX", locale: "en_IN", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} min-h-screen bg-background`}>
        {children}
        <Toaster
          position="top-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: "border border-leather-200 bg-cream text-ink",
              title: "font-medium",
            },
          }}
        />
      </body>
    </html>
  );
}
