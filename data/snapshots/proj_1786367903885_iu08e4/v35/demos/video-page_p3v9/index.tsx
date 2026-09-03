interface DemoProps {
  video?: { url: string; poster?: string };
}

export default function Demo({ video }: DemoProps) {
  const videoUrl = video?.url || "";
  const poster = video?.poster || "";

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          视频演示
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          这是一个可配置的视频页面，可在右侧配置面板调整视频地址。
        </p>

        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-xl">
          {videoUrl ? (
            <video
              className="h-full w-full object-cover"
              src={videoUrl}
              poster={poster}
              controls
              loop
              playsInline
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
              请在右侧配置面板上传视频
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
