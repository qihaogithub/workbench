"use client";

import Link from "next/link";
import { MoreVertical, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DemoMeta } from "@opencode-workbench/shared";

interface DemoCardProps {
  demo: DemoMeta;
  onDelete: (id: string) => void;
}

/**
 * 格式化日期为 ISO 格式字符串（locale-independent）
 * 避免 toLocaleDateString 在 Node.js 与浏览器间产生不同输出导致 Hydration 不匹配
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

export function DemoCard({ demo, onDelete }: DemoCardProps) {
  return (
    <Link href={`/demo/${demo.id}/edit`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:border-border/80 cursor-pointer bg-card border border-border/50">
        <div className="relative aspect-video bg-gradient-to-br from-muted/80 to-muted overflow-hidden">
          {demo.thumbnail ? (
            <img
              src={demo.thumbnail}
              alt={demo.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-muted-foreground/60"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-base truncate text-foreground">
                {demo.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                更新于 {formatDate(demo.updatedAt)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.preventDefault()}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors duration-200 shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(demo.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
