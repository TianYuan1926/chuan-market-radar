import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "川 | Frontend Reset",
  description: "Frontend reset placeholder. Backend radar services are preserved.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
