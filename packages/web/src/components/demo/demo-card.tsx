'use client'

import Link from 'next/link'
import { MoreVertical, Play, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DemoMeta } from '@opencode-workbench/shared'

interface DemoCardProps {
  demo: DemoMeta
  onDelete: (id: string) => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DemoCard({ demo, onDelete }: DemoCardProps) {
  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg">
      <div className="relative aspect-video bg-muted">
        {demo.thumbnail ? (
          <img
            src={demo.thumbnail}
            alt={demo.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Play className="h-12 w-12 opacity-50" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </div>

      <CardContent className="p-4">
        <h3 className="font-semibold text-lg truncate">{demo.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          更新于 {formatDate(demo.updatedAt)}
        </p>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex justify-between items-center">
        <div className="flex gap-2">
          <Link href={`/demo/${demo.id}`}>
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-1" />
              使用
            </Button>
          </Link>
          <Link href={`/demo/${demo.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </Button>
          </Link>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/demo/${demo.id}`}>
                <Play className="h-4 w-4 mr-2" />
                使用 Demo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/demo/${demo.id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                编辑 Demo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(demo.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  )
}
