import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProviderWrapper } from '@/components/ui/toast-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'UI Demo 可配置生成系统',
  description: '所见即所得的可配置 Demo 生成系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <TooltipProvider delayDuration={0}>
            <ToastProviderWrapper>{children}</ToastProviderWrapper>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
