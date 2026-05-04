import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenCode 组件预览",
  description: "浏览和预览 OpenCode 生成的组件",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
