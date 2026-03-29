import { Header } from './header'

interface MainLayoutProps {
  children: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
}

export function MainLayout({ children, breadcrumbs }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header breadcrumbs={breadcrumbs} />
      <main className="container py-6 px-4">{children}</main>
    </div>
  )
}
