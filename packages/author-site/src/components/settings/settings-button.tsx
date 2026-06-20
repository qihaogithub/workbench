"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { Settings, KeyRound, ArrowLeft, LogOut, User, Bot } from "lucide-react";

interface UserInfo {
  id: string;
  username: string;
}

type View = "main" | "change-password" | "model-config";

export function SettingsButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [providerId, setProviderId] = useState("custom");
  const [providerName, setProviderName] = useState("自定义模型");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [modelsText, setModelsText] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [loadingModelConfig, setLoadingModelConfig] = useState(false);

  // 获取当前登录用户信息
  const fetchUser = async (): Promise<UserInfo | null> => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        return data.data as UserInfo;
      }
      return null;
    } catch {
      return null;
    }
  };

  // 点击设置按钮：检查登录状态
  const handleClick = async () => {
    setChecking(true);
    const userInfo = await fetchUser();
    setChecking(false);
    if (!userInfo) {
      // 未登录，跳转登录页
      router.push("/login");
      return;
    }
    setUser(userInfo);
    setOpen(true);
  };

  // 弹窗关闭时重置状态
  const handleClose = () => {
    setOpen(false);
    setView("main");
    setNewPassword("");
    setConfirmPassword("");
    setApiKey("");
  };

  const loadModelConfig = async () => {
    setLoadingModelConfig(true);
    try {
      const res = await fetch("/api/user/model-config");
      const data = await res.json();
      if (data.success && data.data?.provider) {
        const provider = data.data.provider;
        setProviderId(provider.id || "custom");
        setProviderName(provider.name || "自定义模型");
        setBaseURL(provider.baseURL || "");
        setHasApiKey(Boolean(provider.hasApiKey));
        setModelsText(Array.isArray(provider.models) ? provider.models.join("\n") : "");
        setDefaultModel(provider.defaultModel || "");
      }
    } catch {
      toast({
        title: "读取失败",
        description: "无法读取 AI 模型配置",
        variant: "destructive",
      });
    } finally {
      setLoadingModelConfig(false);
    }
  };

  const handleOpenModelConfig = async () => {
    setView("model-config");
    await loadModelConfig();
  };

  const handleSaveModelConfig = async () => {
    const models = modelsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!baseURL.trim() || models.length === 0) {
      toast({
        title: "配置不完整",
        description: "请填写 baseURL 和至少一个模型",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/user/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: providerId,
          name: providerName,
          baseURL,
          apiKey,
          keepExistingApiKey: !apiKey,
          models,
          defaultModel: defaultModel || undefined,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKey("");
        setHasApiKey(Boolean(data.data?.provider?.hasApiKey));
        toast({
          title: "AI 模型配置已保存",
          description: "刷新或新打开编辑页后生效",
        });
        setView("main");
      } else {
        toast({
          title: "保存失败",
          description: data.error?.message || "请检查配置",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "网络错误",
        description: "保存 AI 模型配置失败",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearModelConfig = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearConfig: true }),
      });
      const data = await res.json();
      if (data.success) {
        setProviderId("custom");
        setProviderName("自定义模型");
        setBaseURL("");
        setApiKey("");
        setHasApiKey(false);
        setModelsText("");
        setDefaultModel("");
        toast({ title: "AI 模型配置已清空" });
        setView("main");
      } else {
        toast({
          title: "清空失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 登出：通过服务端 API 清除 httpOnly Cookie
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 即使请求失败也继续跳转
    }
    toast({ title: "已登出" });
    handleClose();
    router.push("/login");
    router.refresh();
  };

  // 修改密码
  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({
        title: "密码太短",
        description: "密码至少 6 个字符",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "密码不一致",
        description: "两次输入的密码不同",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "修改成功", description: "密码已修改，请重新登录" });
        handleClose();
        router.push("/login");
        router.refresh();
      } else {
        toast({
          title: "修改失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "网络错误",
        description: "请求失败",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={checking}
        className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent disabled:opacity-50"
        title="设置"
      >
        <Settings className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose();
        }}
      >
        <DialogContent>
          {view === "main" ? (
            <>
              <DialogHeader>
                <DialogTitle>设置</DialogTitle>
                <DialogDescription>管理您的账号设置</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {/* 用户信息 */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent/50 border border-border">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      当前登录账号
                    </p>
                  </div>
                </div>

                {/* 修改密码入口 */}
                <button
                  onClick={() => setView("change-password")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                >
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">修改密码</p>
                    <p className="text-xs text-muted-foreground">
                      设置新的登录密码
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleOpenModelConfig}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                >
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">AI 模型配置</p>
                    <p className="text-xs text-muted-foreground">
                      配置 OpenAI 兼容 API
                    </p>
                  </div>
                </button>

                {/* 登出 */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-red-50 hover:border-red-200 transition-colors text-left"
                >
                  <LogOut className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-600">退出登录</p>
                    <p className="text-xs text-muted-foreground">
                      退出当前账号
                    </p>
                  </div>
                </button>
              </div>
            </>
          ) : view === "model-config" ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setView("main");
                      setApiKey("");
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <DialogTitle>AI 模型配置</DialogTitle>
                </div>
                <DialogDescription>
                  保存 OpenAI 兼容 API 配置，刷新或新打开编辑页后生效。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>供应商 ID</Label>
                    <Input
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      placeholder="custom"
                      disabled={submitting || loadingModelConfig}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>供应商名称</Label>
                    <Input
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      placeholder="自定义模型"
                      disabled={submitting || loadingModelConfig}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>baseURL</Label>
                  <Input
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    disabled={submitting || loadingModelConfig}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasApiKey ? "已保存，留空则保持不变" : "sk-..."}
                    disabled={submitting || loadingModelConfig}
                  />
                </div>
                <div className="space-y-2">
                  <Label>模型列表（每行一个）</Label>
                  <textarea
                    value={modelsText}
                    onChange={(e) => setModelsText(e.target.value)}
                    placeholder={"gpt-4o\ngpt-4o-mini"}
                    disabled={submitting || loadingModelConfig}
                    className="min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>默认模型</Label>
                  <Input
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    placeholder="留空则使用列表第一项"
                    disabled={submitting || loadingModelConfig}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={handleClearModelConfig}
                  disabled={submitting || loadingModelConfig}
                >
                  清空配置
                </Button>
                <Button
                  onClick={handleSaveModelConfig}
                  disabled={submitting || loadingModelConfig}
                >
                  {submitting ? "保存中..." : "保存配置"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setView("main");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <DialogTitle>修改密码</DialogTitle>
                </div>
                <DialogDescription>
                  设置新的登录密码（无需输入原密码）
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>新密码</Label>
                  <Input
                    type="password"
                    placeholder="至少 6 个字符"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label>确认密码</Label>
                  <Input
                    type="password"
                    placeholder="再次输入新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                  {newPassword &&
                    confirmPassword &&
                    newPassword !== confirmPassword && (
                      <p className="text-xs text-red-500">两次密码不一致</p>
                    )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    submitting ||
                    !newPassword ||
                    newPassword !== confirmPassword
                  }
                >
                  {submitting ? "提交中..." : "确认修改"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
