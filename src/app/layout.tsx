import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/app-shell/Header";
import { Footer } from "@/components/app-shell/Footer";
import { SkipLink } from "@/components/app-shell/SkipLink";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

export const metadata: Metadata = {
  title: { default: "Balram | Farm planning", template: "%s | Balram" },
  description: "Local-first farm planning for Maharashtra. Keep field, crop and irrigation inputs in your browser.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Balram", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, themeColor: "#1E5631", colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <Header />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
