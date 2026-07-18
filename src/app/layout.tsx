import type { Metadata, Viewport } from "next"
import { Literata } from "next/font/google"
import localFont from "next/font/local"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import "./globals.css"

const atkinson = localFont({
  src: "./fonts/AtkinsonHyperlegibleNext-Variable-Latin.woff2",
  display: "swap",
  variable: "--font-atkinson",
  weight: "200 800",
  style: "normal",
  fallback: ["Arial", "sans-serif"],
})

const literata = Literata({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-literata",
  axes: ["opsz"],
})

export const metadata: Metadata = {
  title: {
    default: "Threadline · continuity you can inspect",
    template: "%s · Threadline",
  },
  description:
    "A synthetic therapy-continuity demo that makes every remembered detail inspectable, reviewable, and reversible.",
  applicationName: "Threadline",
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "oklch(0.978 0.008 340)",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn("font-sans antialiased", atkinson.variable, literata.variable)}
    >
      <body>
        <TooltipProvider delayDuration={350} skipDelayDuration={100}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  )
}
