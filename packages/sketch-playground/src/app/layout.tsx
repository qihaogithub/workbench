import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Whiteboard Studio",
  description: "Independent whiteboard development studio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
