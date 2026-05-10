'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { User } from 'lucide-react';

const USERNAME_STORAGE_KEY = 'current_username';

interface UsernameSelectorProps {
  onUsernameChange: (username: string) => void;
}

/**
 * 获取当前用户名
 */
export function getCurrentUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USERNAME_STORAGE_KEY);
}

/**
 * 设置当前用户名
 */
export function setCurrentUsername(username: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERNAME_STORAGE_KEY, username);
}

/**
 * 清除当前用户名
 */
export function clearCurrentUsername(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USERNAME_STORAGE_KEY);
}

/**
 * 用户名选择器组件
 */
export function UsernameSelector({ onUsernameChange }: UsernameSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const saved = getCurrentUsername();
    if (saved) {
      setUsername(saved);
      onUsernameChange(saved);
    } else {
      setIsOpen(true);
    }
  }, [onUsernameChange]);

  const handleConfirm = () => {
    if (username.trim()) {
      setCurrentUsername(username.trim());
      onUsernameChange(username.trim());
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            设置用户名
          </DialogTitle>
          <DialogDescription>
            请输入您的用户名，用于标识项目编辑者。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入用户名"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleConfirm} disabled={!username.trim()}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 用户名显示组件
 */
interface UsernameDisplayProps {
  username: string;
  onChange?: () => void;
}

export function UsernameDisplay({ username, onChange }: UsernameDisplayProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <User className="h-4 w-4" />
      <span className="text-muted-foreground">当前用户：</span>
      <span className="font-medium">{username}</span>
      {onChange && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={onChange}
        >
          切换
        </Button>
      )}
    </div>
  );
}
