"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/api";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then((data) => {
        if (data?.project?.name) {
          setProjectName(data.project.name);
        }
      })
      .catch(() => {
        // 静默失败，项目名称留空
      });
  }, [projectId]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center h-14 px-4 border-b border-border shrink-0 gap-3">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
        {projectName && (
          <h1 className="text-sm font-semibold">{projectName}</h1>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}