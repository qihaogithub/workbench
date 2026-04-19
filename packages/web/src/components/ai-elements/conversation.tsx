'use client'

import { cn } from '@/lib/utils'
import { ScrollArea as ScrollAreaPrimitive } from '@/components/ui/scroll-area'
import * as React from 'react'

const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col h-full', className)}
    {...props}
  />
))
Conversation.displayName = 'Conversation'

const ConversationContent = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive>,
  React.ComponentProps<typeof ScrollAreaPrimitive>
>(({ className, children, ...props }, ref) => (
  <div className="flex-1 min-h-0 overflow-hidden">
    <ScrollAreaPrimitive
      ref={ref}
      className={cn('h-full', className)}
      {...props}
    >
      <div className="flex flex-col gap-4 p-4 max-w-full min-w-0">{children}</div>
    </ScrollAreaPrimitive>
  </div>
))
ConversationContent.displayName = 'ConversationContent'

const ConversationScrollButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, ...props }, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    onClick?.(e)
  }

  return (
    <button
      ref={ref}
      className={cn(
        'fixed bottom-4 right-4 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </button>
  )
})
ConversationScrollButton.displayName = 'ConversationScrollButton'

export { Conversation, ConversationContent, ConversationScrollButton }
