"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { useToast } from "@/components/ui/toast-provider";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const redirect = searchParams.get("redirect") || "/";

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "登录失败");

      toast({
        title: "登录成功",
        description: `欢迎回来，${data.data.user.username}`,
      });
      router.push(redirect);
      router.refresh();
    } catch (error) {
      toast({
        title: "登录失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <LoginForm onSubmit={handleLogin} loading={loading} />
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          还没有账号？{" "}
          <Link href="/register" className="text-primary hover:underline">
            立即注册
          </Link>
        </p>
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-primary hover:underline"
        >
          忘记密码？
        </Link>
      </div>
    </div>
  );
}
