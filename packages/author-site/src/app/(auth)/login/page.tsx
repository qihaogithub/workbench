"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

interface DingtalkLoginConfig {
  enabled: boolean;
  browserOAuthEnabled: boolean;
  corpId?: string;
  authUrl?: string;
  redirectUri?: string;
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [authMode, setAuthMode] = useState<"dingtalk" | "password">(
    "dingtalk",
  );
  const [loading, setLoading] = useState(false);
  const [dingtalkLoading, setDingtalkLoading] = useState(false);
  const [dingtalkConfig, setDingtalkConfig] =
    useState<DingtalkLoginConfig | null>(null);
  const redirect = getSafeRedirectPath(searchParams.get("redirect"));

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
        description: `欢迎回来，${data.data.dingtalk?.name || data.data.user.username}`,
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
        if (!cancelled) {
          setDingtalkConfig({ enabled: false, browserOAuthEnabled: false });
        }
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

  useEffect(() => {
    const dingtalkError = searchParams.get("dingtalkError");
    if (!dingtalkError) return;
    toast({
      title: "钉钉登录失败",
      description: dingtalkError,
      variant: "destructive",
    });
  }, [searchParams, toast]);

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

    if (dingtalkConfig.browserOAuthEnabled) {
      const startUrl = `/api/auth/dingtalk/start?redirect=${encodeURIComponent(redirect)}`;
      window.location.assign(startUrl);
      return;
    }

    if (dingtalkConfig.authUrl) {
      window.location.assign(dingtalkConfig.authUrl);
      return;
    }

    toast({
      title: "无法拉起钉钉登录",
      description:
        dingtalkConfig.message ||
        "请配置 DINGTALK_LOGIN_REDIRECT_URI，或在钉钉工作台内打开应用",
      variant: "destructive",
    });
  };

  return (
    <section className="auth-login-simple" aria-labelledby="login-card-title">
      <div className="auth-card">
        <div className="auth-card-topline">
          <span className="auth-card-label">
            <span className="auth-live-dot" aria-hidden="true" />
            工作区登录
          </span>
          <span className="auth-card-version">ONEFLOW 1.0</span>
        </div>

        <div className="auth-card-heading">
          <h2 id="login-card-title">
            {authMode === "dingtalk" ? "欢迎回来" : "登录 OneFlow"}
          </h2>
          <p>
            {authMode === "dingtalk"
              ? "使用企业钉钉账号，一键进入你的工作区"
              : "使用管理员分配的账号继续你的项目"}
          </p>
        </div>

        {authMode === "dingtalk" ? (
          <Button
            type="button"
            className="auth-dingtalk-button w-full bg-[#1677ff] text-white hover:bg-[#0f65d8]"
            disabled={dingtalkLoading}
            onClick={handleDingtalkLogin}
          >
            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {dingtalkLoading ? "钉钉登录中..." : "钉钉一键登录"}
            {!dingtalkLoading && (
              <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        ) : (
          <LoginForm onSubmit={handleLogin} loading={loading} />
        )}

        {authMode === "dingtalk" ? (
          <button
            type="button"
            className="auth-mode-switch"
            onClick={() => setAuthMode("password")}
          >
            账号密码登录
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <div className="auth-secondary-links">
            <button
              type="button"
              className="auth-secondary-link"
              onClick={() => setAuthMode("dingtalk")}
            >
              使用钉钉一键登录
            </button>
            <Link href="/forgot-password" className="auth-secondary-link">
              忘记密码？
            </Link>
          </div>
        )}

        <div className="auth-security-note">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>登录状态通过安全连接保护</span>
        </div>
      </div>
      <p className="auth-card-caption">仅限已获授权的团队成员访问</p>
    </section>
  );
}
