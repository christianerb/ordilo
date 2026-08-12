import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ordilo",
  description:
    "Dein privater AI-Familienordner. Erfasse, verstehe und durchsuche Dokumente auf natürliche Weise.",
  applicationName: "Ordilo",
  appleWebApp: {
    capable: true,
    title: "Ordilo",
    statusBarStyle: "default",
  },
  icons: {
    // Next.js only auto-links the file-based src/app/icon.svg when NO
    // explicit `icons` config exists — setting `apple` here silently
    // dropped the favicon. So the SVG icon must be listed explicitly.
    // Order matters: Chromium uses the last matching icon (gets the
    // crisp SVG), Safari ignores SVG and falls back to the PNG.
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FCFCFC",
  viewportFit: "cover",
  // Without this, iOS Safari overlays the keyboard on top of the layout
  // viewport instead of shrinking it, then pans the whole page (fixed
  // elements included) to keep the focused input visible — which is what
  // pushed the composer overlay's close/history buttons off-screen. This
  // makes the visual viewport actually shrink, so `h-dvh` tracks it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
