'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  breadcrumbs?: BreadcrumbItem[]
}

export function Header({ breadcrumbs = [] }: HeaderProps) {
  const pathname = usePathname()

  const defaultBreadcrumbs: BreadcrumbItem[] = [
    { label: '首页', href: '/' },
  ]

  const allBreadcrumbs =
    breadcrumbs.length > 0 ? breadcrumbs : defaultBreadcrumbs

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4">
        <Link
          href="/"
          className="mr-6 flex items-center space-x-2 text-lg font-semibold"
        >
          <span className="text-primary">UI Demo</span>
          <span className="text-muted-foreground">工作台</span>
        </Link>

        <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
          {allBreadcrumbs.map((item, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="mx-1 h-4 w-4" />
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className={cn(
                    'hover:text-foreground transition-colors',
                    index === allBreadcrumbs.length - 1 && 'text-foreground font-medium'
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    index === allBreadcrumbs.length - 1 && 'text-foreground font-medium'
                  )}
                >
                  {item.label}
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center space-x-4">
          <Link href="/">
            <Home className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          </Link>
        </div>
      </div>
    </header>
  )
}
