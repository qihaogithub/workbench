import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Sketch SDK Playground",
  description: "Independent sketch SDK development playground",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
