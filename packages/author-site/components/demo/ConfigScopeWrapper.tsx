import { Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type ConfigScope = "project" | "page";

interface ConfigScopeWrapperProps {
  scope: ConfigScope;
  pageName?: string;
  children: React.ReactNode;
  className?: string;
}

interface ScopeConfig {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  borderClass: string;
  titleClass: string;
}

const SCOPE_CONFIG: Record<ConfigScope, ScopeConfig> = {
  project: {
    icon: Globe,
    title: "项目配置",
    subtitle: "所有页面共享",
    borderClass: "border-l-3 border-blue-500",
    titleClass: "text-blue-400",
  },
  page: {
    icon: FileText,
    title: "当前页面配置",
    subtitle: "仅「{pageName}」",
    borderClass: "border-l-3 border-orange-500",
    titleClass: "text-orange-400",
  },
};

export function ConfigScopeWrapper({
  scope,
  pageName,
  children,
  className,
}: ConfigScopeWrapperProps) {
  const config = SCOPE_CONFIG[scope];
  const Icon = config.icon;
  const subtitle =
    scope === "page" && pageName
      ? config.subtitle.replace("{pageName}", pageName)
      : config.subtitle;

  return (
    <div className={cn("rounded-lg p-4", config.borderClass, className)}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("h-4 w-4", config.titleClass)} />
        <span className={cn("text-sm font-semibold", config.titleClass)}>
          {config.title}
        </span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}
