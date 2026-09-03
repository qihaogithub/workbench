interface DemoProps {
  themeColor: string;
  heroImage: string;
  gallery: string[];
  article: string;
}

const TYPE_BADGES = ["color", "image", "imageList", "richtext"];

export default function ConfigMedia({
  themeColor,
  heroImage,
  gallery,
  article,
}: DemoProps) {
  return (
    <div className="min-h-screen bg-slate-50 px-5 pb-12 pt-8 font-sans text-slate-800">
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-fuchsia-500">
          CONFIG TYPES DEMO
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">视觉与媒体类型</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TYPE_BADGES.map((t) => (
            <span
              key={t}
              className="rounded-full bg-fuchsia-100 px-2.5 py-0.5 text-[11px] font-semibold text-fuchsia-700"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          颜色、图片、多图与富文本的联动展示
        </p>
      </header>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">主题色</h2>
          <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            color
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="h-11 w-11 shrink-0 rounded-xl shadow-inner ring-1 ring-black/5"
            style={{ backgroundColor: themeColor }}
          />
          <div>
            <p className="text-sm font-bold" style={{ color: themeColor }}>
              主题色已应用到按钮与文字
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">
              {themeColor}
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <span
            className="rounded-full px-4 py-1.5 text-xs font-medium text-white shadow-sm"
            style={{ backgroundColor: themeColor }}
          >
            立即参与
          </span>
          <span
            className="rounded-full border px-4 py-1.5 text-xs font-medium"
            style={{ borderColor: themeColor, color: themeColor }}
          >
            了解更多
          </span>
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">主图</h2>
          <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            image
          </span>
        </div>
        {heroImage ? (
          <img
            src={heroImage}
            alt="活动主图"
            className="h-44 w-full rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
            未设置主图，请在配置面板中上传
          </div>
        )}
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">画廊</h2>
          <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            imageList
          </span>
        </div>
        {gallery.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
            暂无图片，请在配置面板中添加
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`画廊图片 ${i + 1}`}
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">富文本介绍</h2>
          <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            richtext
          </span>
        </div>
        <div
          className="text-sm leading-relaxed text-slate-600 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_em]:italic [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: article }}
        />
      </section>
    </div>
  );
}
