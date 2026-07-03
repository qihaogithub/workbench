"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsButton } from "@/components/settings/settings-button";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HeaderProps {
  breadcrumbs?: BreadcrumbItem[];
}

export function Header({ breadcrumbs = [] }: HeaderProps) {
  const pathname = usePathname();

  const defaultBreadcrumbs: BreadcrumbItem[] = [{ label: "首页", href: "/" }];

  const allBreadcrumbs =
    breadcrumbs.length > 0 ? breadcrumbs : defaultBreadcrumbs;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center px-4">
        <Link
          href="/"
          className="mr-6 flex items-center space-x-2 text-lg font-medium tracking-tight"
        >
          <span className="text-foreground">OneFlow</span>
        </Link>

        <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
          {allBreadcrumbs.map((item, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="mx-1 h-4 w-4 opacity-50" />
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className={cn(
                    "hover:text-foreground transition-colors duration-200",
                    index === allBreadcrumbs.length - 1 &&
                      "text-foreground font-medium",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    index === allBreadcrumbs.length - 1 &&
                      "text-foreground font-medium",
                  )}
                >
                  {item.label}
                </span>
              )}
            </div>
          ))}
        </nav>

        <SettingsButton />
      </div>
    </header>
  );
}
