import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const thai = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-thai" });

export const metadata: Metadata = {
  title: "ผังโต๊ะ อาท & โดม",
  description: "จัดที่นั่งโต๊ะจีน งานแต่งอาท & โดม 14 พ.ย.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#9c2f4f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="font-sans antialiased">
        <StoreProvider>{children}</StoreProvider>
        <Analytics />
      </body>
    </html>
  );
}
