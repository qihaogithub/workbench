"use client";

import { useState, useEffect, useCallback } from "react";
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
import { KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";

interface User {
  id: string;
  username: string;
  createdAt: number;
  role: "admin" | "editor";
}

function formatDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const handleRoleChange = async (user: User, role: User["role"]) => {
    setUpdatingRole(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "角色更新失败");
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
      toast({ title: "角色已更新", description: `${user.username} 已设为${role === "admin" ? "管理员" : "编辑者"}` });
    } catch (error) {
      toast({ title: "角色更新失败", description: error instanceof Error ? error.message : "请求失败", variant: "destructive" });
    } finally {
      setUpdatingRole(null);
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.users);
      } else {
        toast({
          title: "加载失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "网络错误",
        description: "无法获取用户列表",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleResetPassword = async () => {
    if (!resetTarget) return;
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

    setResetting(true);
    try {
      const res = await fetch(
        `/api/admin/users/${resetTarget.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword }),
        },
      );
      const data = await res.json();
      if (data.success) {
        toast({
          title: "重置成功",
          description: `已为用户 ${resetTarget.username} 重置密码`,
        });
        setResetTarget(null);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({
          title: "重置失败",
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
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 text-neutral-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-50">用户管理</h2>
          <p className="mt-1 text-sm text-neutral-400">
            查看系统用户列表，重置用户密码或删除用户
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 shadow-2xl shadow-black/20">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950/70">
            <tr>
              <th className="px-5 py-4 text-left font-medium text-neutral-400">
                用户名
              </th>
              <th className="px-5 py-4 text-left font-medium text-neutral-400">
                注册时间
              </th>
              <th className="px-5 py-4 text-left font-medium text-neutral-400">角色</th>
              <th className="px-5 py-4 text-right font-medium text-neutral-400">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-neutral-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-neutral-500">
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-neutral-800/80 last:border-0 hover:bg-neutral-800/50"
                >
                  <td className="px-5 py-4 font-medium text-neutral-100">
                    {user.username}
                  </td>
                  <td className="px-5 py-4 text-neutral-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <select
                      aria-label={`${user.username} 角色`}
                      value={user.role}
                      disabled={updatingRole === user.id}
                      onChange={(event) => handleRoleChange(user, event.target.value as User["role"])}
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      <option value="admin">管理员</option>
                      <option value="editor">编辑者</option>
                    </select>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetTarget(user)}
                        className="flex items-center gap-1.5 border-neutral-700 bg-neutral-950 text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        重置密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                        className="flex items-center gap-1.5 border-red-500/40 bg-red-500/5 text-red-300 hover:bg-red-500/15 hover:text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* 重置密码对话框 */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent className="border-neutral-800 bg-neutral-900 text-neutral-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-neutral-50">重置密码</DialogTitle>
            <DialogDescription>
              将为用户 <strong className="text-neutral-200">{resetTarget?.username}</strong> 设置新密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-neutral-300">新密码</Label>
              <Input
                type="password"
                placeholder="至少 6 个字符"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={resetting}
                className="border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">确认密码</Label>
              <Input
                type="password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={resetting}
                className="border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-600"
              />
              {newPassword &&
                confirmPassword &&
                newPassword !== confirmPassword && (
                  <p className="text-xs text-red-300">两次密码不一致</p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={() => {
                setResetTarget(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={resetting}
            >
              取消
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={
                resetting || !newPassword || newPassword !== confirmPassword
              }
            >
              {resetting ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除用户确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="border-neutral-800 bg-neutral-900 text-neutral-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-neutral-50">确认删除用户</DialogTitle>
            <DialogDescription>
              即将删除用户{" "}
              <strong className="text-red-300">{deleteTarget?.username}</strong>
              ，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-medium mb-1">删除后将会：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>该用户将无法登录系统</li>
                <li>该用户的密码重置日志也将被清除</li>
                <li>此操作无法撤销</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  const res = await fetch(
                    `/api/admin/users/${deleteTarget.id}`,
                    {
                      method: "DELETE",
                    },
                  );
                  const data = await res.json();
                  if (data.success) {
                    toast({
                      title: "删除成功",
                      description: `用户 ${deleteTarget.username} 已被删除`,
                    });
                    setDeleteTarget(null);
                    fetchUsers();
                  } else {
                    toast({
                      title: "删除失败",
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
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
