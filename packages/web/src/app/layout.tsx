import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProviderWrapper } from '@/components/ui/toast-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

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
        <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
          <ToastProviderWrapper>{children}</ToastProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  )
}
