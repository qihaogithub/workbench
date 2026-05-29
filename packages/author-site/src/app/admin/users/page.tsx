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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">用户管理</h2>
          <p className="text-gray-600 mt-1">
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                用户名
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                注册时间
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.username}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetTarget(user)}
                        className="flex items-center gap-1.5"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        重置密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                        className="flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              将为用户 <strong>{resetTarget?.username}</strong> 设置新密码
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
                disabled={resetting}
              />
            </div>
            <div className="space-y-2">
              <Label>确认密码</Label>
              <Input
                type="password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={resetting}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除用户</DialogTitle>
            <DialogDescription>
              即将删除用户{" "}
              <strong className="text-red-600">{deleteTarget?.username}</strong>
              ，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
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
