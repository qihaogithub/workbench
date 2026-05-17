import type { LucideIcon } from "lucide-react";
import { Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfigScope = "project" | "page";

interface ConfigScopeWrapperProps {
  scope: ConfigScope;
  pageName?: string;
  children: React.ReactNode;
  className?: string;
}

const SCOPE_CONFIG: Record<
  ConfigScope,
  {
    icon: LucideIcon;
    title: string;
    borderClass: string;
    bgClass: string;
    headerBorderClass: string;
    iconClass: string;
  }
> = {
  project: {
    icon: Globe,
    title: "全局配置",
    borderClass: "border border-blue-500/30",
    bgClass: "bg-blue-500/[0.04]",
    headerBorderClass: "border-b border-blue-500/30",
    iconClass: "text-blue-500",
  },
  page: {
    icon: FileText,
    title: "",
    borderClass: "border border-border",
    bgClass: "bg-white/[0.02]",
    headerBorderClass: "border-b border-border",
    iconClass: "text-neutral-300",
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
  const title = scope === "page" && pageName ? pageName : config.title;

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden",
        config.borderClass,
        config.bgClass,
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3.5 py-3 bg-black/20",
          config.headerBorderClass
        )}
      >
        <Icon className={cn("h-[15px] w-[15px]", config.iconClass)} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
