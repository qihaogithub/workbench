interface DemoProps {
  richContent: string;
  gallery: string[];
  tags: string[];
  region: string[];
  modules: {
    type: string;
    content?: string;
    pic?: string;
    caption?: string;
    label?: string;
    color?: string;
  }[];
  decoText: string;
  decoPosition: { x: number; y: number };
}

const tagLabels: Record<string, string> = {
  tech: "技术",
  design: "设计",
  art: "艺术",
  music: "音乐",
};

const tagColors: Record<string, string> = {
  tech: "#6366f1",
  design: "#ec4899",
  art: "#f59e0b",
  music: "#10b981",
};

function findRegionLabel(value: string, options: any[]): string {
  for (const opt of options) {
    if (opt.value === value) return opt.label;
    if (opt.children) {
      const child = opt.children.find((c: any) => c.value === value);
      if (child) return child.label;
    }
  }
  return value;
}

const regionOptions = [
  {
    value: "zhejiang",
    label: "浙江",
    children: [
      { value: "hangzhou", label: "杭州" },
      { value: "ningbo", label: "宁波" },
    ],
  },
  {
    value: "jiangsu",
    label: "江苏",
    children: [
      { value: "nanjing", label: "南京" },
      { value: "suzhou", label: "苏州" },
    ],
  },
];

export default function ConfigHighFidelityDemo({
  richContent = "<h2>欢迎体验配置系统</h2><p>这是一段<strong>富文本</strong>内容。</p>",
  gallery = [],
  tags = ["tech", "design"],
  region = ["zhejiang", "hangzhou"],
  modules = [],
  decoText = "✨",
  decoPosition = { x: 280, y: 20 },
}: DemoProps) {
  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* 顶部装饰区 */}
      <div className="relative w-full h-48 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-white text-2xl font-bold tracking-wide">配置类型演示</h1>
        </div>
        <div
          data-pos-key="deco"
          className="absolute text-4xl select-none pointer-events-none"
          style={{ left: decoPosition.x, top: decoPosition.y }}
        >
          {decoText}
        </div>
      </div>

      <div className="px-4 py-5 max-w-md mx-auto space-y-6">
        {/* 富文本内容 */}
        <section className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            富文本内容 (richtext)
          </h2>
          <div
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: richContent }}
          />
        </section>

        {/* 标签多选 */}
        {tags.length > 0 && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              标签多选 (enum multi-select)
            </h2>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: tagColors[tag] || "#6366f1" }}
                >
                  {tagLabels[tag] || tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 级联选择 - 地区 */}
        {region.length > 0 && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              级联选择 (cascade)
            </h2>
            <p className="text-sm text-gray-600">
              已选地区：
              <span className="font-medium text-gray-800 ml-1">
                {region.map((r) => findRegionLabel(r, regionOptions)).join(" / ")}
              </span>
            </p>
          </section>
        )}

        {/* 图片集 */}
        {gallery.length > 0 && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              图片集 (imageList)
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`图片 ${i + 1}`}
                  className="w-24 h-24 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                />
              ))}
            </div>
          </section>
        )}

        {/* 模块列表 */}
        {modules.length > 0 && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              模块列表 (array + sortable)
            </h2>
            <div className="space-y-3">
              {modules.map((mod, i) => {
                if (mod.type === "text") {
                  return (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-xs text-indigo-400 font-medium mb-1 block">📝 文本模块</span>
                      <p className="text-sm text-gray-700">{mod.content}</p>
                    </div>
                  );
                }
                if (mod.type === "image") {
                  return (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-xs text-indigo-400 font-medium mb-1 block">🖼️ 图片模块</span>
                      {mod.pic ? (
                        <img src={mod.pic} alt={mod.caption} className="w-full h-32 rounded object-cover bg-gray-100" />
                      ) : (
                        <div className="w-full h-32 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
                          点击添加图片
                        </div>
                      )}
                      {mod.caption && <p className="text-xs text-gray-500 mt-1">{mod.caption}</p>}
                    </div>
                  );
                }
                if (mod.type === "colorBlock") {
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-gray-100 text-white"
                      style={{ backgroundColor: mod.color || "#6366f1" }}
                    >
                      <span className="text-xs opacity-80 font-medium mb-1 block">🎨 色块模块</span>
                      <p className="text-sm font-medium">{mod.label}</p>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}