import type { Metadata } from "next";
import { Oswald, Source_Sans_3 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const display = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BharatBoot — Built to Last. Made in India.",
    template: "%s · BharatBoot",
  },
  description:
    "Defense-grade army boots, classic Oxford shoes, and combat-tested jackets. Manufactured in India.",
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
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
              toast: "border border-olive-200 bg-cream text-ink",
              title: "font-medium",
            },
          }}
        />
      </body>
    </html>
  );
}
