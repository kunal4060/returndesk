import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SimProvider } from "@/state/SimProvider";
import { AppShell } from "@/components/shell/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ledger & Thread — Returns & Refunds",
  description:
    "Item-level return and refund journey: refund waterfall, three-source reconciliation, idempotent refunds, disputes and a tamper-evident audit trail. All states simulated.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <SimProvider>
          <AppShell>{children}</AppShell>
        </SimProvider>
      </body>
    </html>
  );
}
