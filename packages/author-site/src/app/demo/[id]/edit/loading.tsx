import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="h-8 w-8" />
      </div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载编辑页面…
        </div>
      </div>
    </div>
  );
}
