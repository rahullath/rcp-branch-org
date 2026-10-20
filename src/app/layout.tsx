import type { Metadata, Viewport } from "next";
import { Archivo, Be_Vietnam_Pro, Oswald } from "next/font/google";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";
import "./v2.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// RCS design system body face — used by the social graphics (src/components/rcs-graphic.tsx).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: "Revolutionary Communist International | Branch Organizer",
  description: "Organise a communist branch's week: events, readings, invites, paper sales, materials and follow-ups.",
  openGraph: {
    title: "Revolutionary Communist International | Branch Organizer",
    description:
      "Branch organizer tool for the Communist Party: contacts, mobilizations, finance, education and shared materials.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RCI Branch",
  },
};

export const viewport: Viewport = {
  themeColor: "#e31b23",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${beVietnam.variable} ${oswald.variable} ${archivo.variable} bg-background`}>
      <body className="min-h-screen bg-background text-on-background antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
