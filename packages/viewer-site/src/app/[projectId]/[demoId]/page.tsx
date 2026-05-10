"use client";

import { useParams } from "next/navigation";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3200";

export default function DemoPreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const demoId = params.demoId as string;
  const viewerUrl = `${WEB_URL}/viewer/${projectId}/${demoId}?config=true&background=%230a0a0a&pageList=true`;

  return (
    <iframe
      src={viewerUrl}
      className="w-full h-full border-none"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
