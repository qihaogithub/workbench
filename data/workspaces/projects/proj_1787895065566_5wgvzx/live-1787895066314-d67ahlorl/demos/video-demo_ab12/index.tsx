interface DemoProps {
  heroVideo?: {
    url: string;
    poster?: string;
  };
}

export default function Demo({ heroVideo }: DemoProps) {
  const videoUrl = heroVideo?.url || "";
  const poster = heroVideo?.poster || undefined;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          视频展示页
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          这是一个简单的示例页面，包含一个视频配置项。你可以在右侧配置面板上传或填写视频地址与封面。
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
          {videoUrl ? (
            <video
              className="aspect-video w-full bg-slate-900 object-cover"
              src={videoUrl}
              poster={poster}
              controls
              preload="metadata"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
              请在配置面板添加视频地址
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          支持 MP4 / WebM 格式，封面为可选项。
        </p>
      </div>
    </div>
  );
}
