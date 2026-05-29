import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          <CardTitle>找回密码</CardTitle>
        </div>
        <CardDescription>
          本系统暂不支持自助找回密码，请联系系统管理员重置密码。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">如何找回？</p>
          <p>
            请联系管理后台的管理员，提供您的用户名，管理员可以为您重置密码。
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
