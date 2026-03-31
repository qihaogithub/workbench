'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bot, User } from 'lucide-react'

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatBubbleProps {
  message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8 shrink-0">
        {isUser ? (
          <>
            <AvatarImage src="" />
            <AvatarFallback className="bg-primary text-primary-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarImage src="" />
            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </>
        )}
      </Avatar>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-muted-foreground rounded-tl-sm'
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
