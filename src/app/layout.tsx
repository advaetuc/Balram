import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/app-shell/Header";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

export const metadata: Metadata = {
  title: { default: "Balram | Farm planning", template: "%s | Balram" },
  description: "Local-first farm planning for Maharashtra. Keep field, crop and irrigation inputs in your browser.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, themeColor: "#1E5631", colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a href="#main-content" className="sr-only z-50 items-center bg-forest px-5 py-3 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:flex">
          Skip to content
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-forest/15 px-4 py-6 text-sm sm:px-6">
          <p className="mx-auto max-w-7xl">Balram · Maharashtra farm planning. Saved data retains its original dates and sources.</p>
        </footer>
      </body>
    </html>
  );
}
