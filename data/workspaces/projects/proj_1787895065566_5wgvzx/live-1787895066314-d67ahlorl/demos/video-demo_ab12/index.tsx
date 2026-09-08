interface DemoProps {
  heroVideo?: {
    url: string;
    poster?: string;
  };
  heroImage?: string;
}

export default function Demo({ heroVideo, heroImage }: DemoProps) {
  const videoUrl = heroVideo?.url || "";
  const imageUrl = heroImage || "";

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          视频展示页
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-blue-500">
          这是一个简单的示例页面，包含视频与图片两个配置项。你可以在右侧配置面板上传或填写视频地址、封面和图片。
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
          {videoUrl ? (
            <video
              className="aspect-video w-full bg-slate-900 object-cover"
              src={videoUrl}
              poster={heroVideo?.poster}
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

        <section className="mt-8" data-region-id="hero-image-section">
          <h2 className="text-base font-semibold text-slate-900">图片展示</h2>
          <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {imageUrl ? (
              <img
                className="aspect-[4/3] w-full object-cover"
                src={imageUrl}
                alt="配置图片"
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
                请在配置面板上传图片
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            图片为可选配置，建议 4:3 比例，未配置时显示占位提示。
          </p>
        </section>
      </div>
    </div>
  );
}
