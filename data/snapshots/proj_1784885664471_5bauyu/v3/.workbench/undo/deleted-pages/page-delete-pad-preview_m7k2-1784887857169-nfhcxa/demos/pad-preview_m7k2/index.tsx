interface DemoProps {}

const categories = [
  { key: "reading", label: "阅读", bgKey: "headerBgReading" },
  { key: "thinking", label: "思维", bgKey: "headerBgThinking" },
  { key: "aesthetic", label: "美育", bgKey: "headerBgAesthetic" },
  { key: "english", label: "英语", bgKey: "headerBgEnglish" },
  { key: "writer", label: "小作家", bgKey: "headerBgWriter" },
] as const;

export default function Demo(props: DemoProps) {
  const allProps = props as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-[#f5f7fa] font-sans">
      {/* 顶部标题栏 */}
      <header className="pt-8 pb-2 text-center">
        <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">
          头图背景预览
        </h1>
        <p className="mt-2 text-[15px] text-[#64748b]">
          平板端 · 分类头图背景配置预览
        </p>
      </header>

      {/* 分类标签栏 */}
      <nav className="flex justify-center gap-2.5 flex-wrap mb-8 px-4">
        {categories.map((cat) => (
          <span
            key={cat.key}
            className="px-7 py-2.5 rounded-full border border-[#e2e8f0] bg-white text-[#475569] text-[15px] font-medium"
          >
            {cat.label}
          </span>
        ))}
      </nav>

      {/* 预览卡片网格 */}
      <main className="max-w-[834px] mx-auto px-10 grid grid-cols-3 gap-6">
        {categories.map((cat) => {
          const bg = (allProps[cat.bgKey] as string) || "";
          return (
            <section
              key={cat.key}
              className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div
                className="w-full h-[140px] bg-cover bg-center bg-[#e2e8f0] relative flex items-center justify-center"
                style={
                  bg
                    ? { backgroundImage: `url(${bg})` }
                    : { background: "linear-gradient(135deg, #e2e8f0, #cbd5e1)" }
                }
              >
                <div className="bg-black/35 backdrop-blur-[2px] px-6 py-2.5 rounded-xl">
                  <span className="text-white text-lg font-semibold tracking-wider">
                    {cat.label}
                  </span>
                </div>
              </div>
              <div className="p-4 flex justify-center">
                <span className="inline-block px-5 py-2 border border-dashed border-[#cbd5e1] rounded-lg bg-[#f8fafc] text-[#64748b] text-[13px] font-medium">
                  上传头部背景
                </span>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}