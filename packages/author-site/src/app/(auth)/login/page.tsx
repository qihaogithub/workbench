"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Building2 } from "lucide-react";

interface DingtalkLoginConfig {
  enabled: boolean;
  corpId?: string;
  authUrl?: string;
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dingtalkLoading, setDingtalkLoading] = useState(false);
  const [dingtalkConfig, setDingtalkConfig] =
    useState<DingtalkLoginConfig | null>(null);
  const redirect = searchParams.get("redirect") || "/";

  const finishDingtalkLogin = async (authCode: string) => {
    setDingtalkLoading(true);
    try {
      const res = await fetch("/api/auth/dingtalk/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authCode }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "钉钉登录失败");
      }

      toast({
        title: "钉钉登录成功",
        description: `欢迎回来，${data.data.user.username}`,
      });
      router.push(redirect);
      router.refresh();
    } catch (error) {
      toast({
        title: "钉钉登录失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setDingtalkLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/dingtalk/config")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) {
          setDingtalkConfig(data.data);
        }
      })
      .catch(() => {
        if (!cancelled) setDingtalkConfig({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const authCode =
      searchParams.get("dingtalkCode") || searchParams.get("authCode");
    if (authCode) {
      void finishDingtalkLogin(authCode);
    }
    // Run once for an auth-code callback URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    try {
      const normalizedUsername = username.trim();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizedUsername, password }),
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

  const handleDingtalkLogin = async () => {
    if (!dingtalkConfig?.enabled) {
      toast({
        title: "钉钉登录未启用",
        description: dingtalkConfig?.message || "请先配置钉钉企业内部应用",
        variant: "destructive",
      });
      return;
    }

    const dingtalkWindow = window as typeof window & {
      dd?: {
        runtime?: {
          permission?: {
            requestAuthCode?: (input: {
              corpId: string;
              onSuccess: (result: { code?: string; authCode?: string }) => void;
              onFail: (error: unknown) => void;
            }) => void;
          };
        };
      };
    };
    const requestAuthCode =
      dingtalkWindow.dd?.runtime?.permission?.requestAuthCode;
    if (requestAuthCode && dingtalkConfig.corpId) {
      setDingtalkLoading(true);
      requestAuthCode({
        corpId: dingtalkConfig.corpId,
        onSuccess: (result) => {
          const authCode = result.code || result.authCode;
          if (authCode) {
            void finishDingtalkLogin(authCode);
          } else {
            setDingtalkLoading(false);
          }
        },
        onFail: (error) => {
          setDingtalkLoading(false);
          toast({
            title: "钉钉授权失败",
            description: error instanceof Error ? error.message : "无法获取免登码",
            variant: "destructive",
          });
        },
      });
      return;
    }

    if (dingtalkConfig.authUrl) {
      window.location.href = dingtalkConfig.authUrl;
      return;
    }

    toast({
      title: "无法拉起钉钉登录",
      description: "请在钉钉工作台内打开，或配置 DINGTALK_LOGIN_AUTH_URL",
      variant: "destructive",
    });
  };

  return (
    <div className="space-y-4">
      <LoginForm onSubmit={handleLogin} loading={loading} />
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>企业账号</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={dingtalkLoading}
          onClick={handleDingtalkLogin}
        >
          <Building2 className="mr-2 h-4 w-4" />
          {dingtalkLoading ? "钉钉登录中..." : "使用钉钉企业账号登录"}
        </Button>
      </div>
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
