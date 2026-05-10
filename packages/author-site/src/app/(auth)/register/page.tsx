"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { useToast } from "@/components/ui/toast-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleRegister = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "注册失败");

      toast({ title: "注册成功", description: `欢迎，${data.data.user.username}！` });
      router.push("/");
      router.refresh();
    } catch (error) {
      toast({
        title: "注册失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <LoginForm onSubmit={handleRegister} loading={loading} isRegister />
      <p className="text-center text-sm text-muted-foreground">
        已有账号？{" "}
        <Link href="/login" className="text-primary hover:underline">
          立即登录
        </Link>
      </p>
    </div>
  );
}
