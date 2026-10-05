import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono, Zilla_Slab } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "800"],
  variable: "--font-bricolage",
});
const zilla = Zilla_Slab({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-zilla" });
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
});
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Squadjar",
  description: "Ajo with your squad. Nobody holds the jar.",
  applicationName: "Squadjar",
  appleWebApp: { capable: true, title: "Squadjar", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eadb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1712" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${zilla.variable} ${instrument.variable} ${jetbrains.variable}`}
    >
      <body className="relative antialiased">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
