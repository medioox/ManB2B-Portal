import type { Metadata, Viewport } from "next";
import "vazirmatn/Vazirmatn-font-face.css";
import "./globals.css";
import ClientApp from "./ClientApp";

export const metadata: Metadata = {
  title: "پرتال فروش عمده‌ی مَن",
  description: "پرتال B2B مَن برای نماینده‌ها، فروشگاه‌ها، مشتریان سازمانی و آزمایشگاه‌ها",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "پرتال مَن", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1F3A5F", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ClientApp />
        {children}
      </body>
    </html>
  );
}
