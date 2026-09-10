"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, UserRound } from "lucide-react";

interface LoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  loading: boolean;
  isRegister?: boolean;
}

export function LoginForm({ onSubmit, loading, isRegister = false }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className="auth-password-form">
      <div className="auth-fields">
        <div className="auth-field">
          <Label htmlFor="username">用户名</Label>
          <div className="auth-input-wrap">
            <UserRound className="auth-input-icon h-4 w-4" aria-hidden="true" />
            <Input
              id="username"
              type="text"
              placeholder="请输入用户名"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
              className="auth-input pl-11"
            />
          </div>
        </div>
        <div className="auth-field">
          <Label htmlFor="password">密码</Label>
          <div className="auth-input-wrap">
            <KeyRound className="auth-input-icon h-4 w-4" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="auth-input pl-11"
            />
          </div>
        </div>
      </div>
      <Button type="submit" className="auth-submit-button w-full" disabled={loading}>
        {loading ? (isRegister ? "注册中..." : "登录中...") : isRegister ? "注册" : "登录"}
      </Button>
    </form>
  );
}
