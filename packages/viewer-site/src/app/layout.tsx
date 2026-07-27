import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <body className="h-full overflow-hidden antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
