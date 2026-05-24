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
    iconClass: string;
  }
> = {
  project: {
    icon: Globe,
    title: "全局配置",
    iconClass: "text-blue-500",
  },
  page: {
    icon: FileText,
    title: "",
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
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-2 px-1 py-3">
        <Icon className={cn("h-[15px] w-[15px]", config.iconClass)} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
