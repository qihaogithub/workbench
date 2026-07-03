import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowSite - 来自 OneFlow 的项目站点",
  description: "来自 OneFlow 的项目站点",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
