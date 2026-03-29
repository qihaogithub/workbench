import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProviderWrapper } from '@/components/ui/toast-provider'

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
    <html lang="zh-CN">
      <body className={inter.className}>
        <ToastProviderWrapper>{children}</ToastProviderWrapper>
      </body>
    </html>
  )
}
