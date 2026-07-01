interface DemoProps {
  title?: string;
}

export default function DetailPage(_props: DemoProps) {
  const accent = "slate";
  const accentMap: Record<string, { bg: string; ink: string; pill: string; soft: string }> = {
    rose: { bg: "from-[#ffe2e8] via-[#fff5f1] to-[#ffd074]", ink: "#7f1d1d", pill: "#ef4444", soft: "#fff1f2" },
    slate: { bg: "from-[#eef2ff] via-[#f8fafc] to-[#e2e8f0]", ink: "#0f172a", pill: "#475569", soft: "#f1f5f9" },
  };
  const theme = accentMap[accent];

  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme.bg}`}>
      {/* StatusBar */}
      <div className="flex h-9 items-center justify-between px-5 text-[11px] font-semibold text-black/70">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-[2px] border border-black/50" />
          <span className="h-2 w-3 rounded-[2px] bg-black/60" />
          <span className="h-2 w-5 rounded-[3px] border border-black/50">
            <span className="block h-full w-4 rounded-[2px] bg-black/60" />
          </span>
        </div>
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3">
        <button className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm">‹</button>
        <div className="text-center">
          <p className="text-[11px] font-medium text-black/45">活动详情与课程入口</p>
          <h2 className="text-sm font-bold" style={{ color: theme.ink }}>叫叫小剧场</h2>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm">···</button>
      </header>

      {/* Content */}
      <div className="space-y-4 px-5 pb-20">
        {/* Activity Video Card */}
        <section className="rounded-[22px] bg-white/88 p-4 shadow-sm ring-1 ring-black/5">
          <h3 className="text-sm font-bold" style={{ color: theme.ink }}>活动视频</h3>
          <div className="mt-3 grid h-40 place-items-center rounded-[18px] bg-[#d1d5db] text-sm font-bold text-[#6b7280]">
            2.5 关卡视频
          </div>
        </section>

        {/* Grid Items */}
        <div className="grid grid-cols-2 gap-3">
          {["4.8版本icon", "2.页面背景色", "页面弹窗", "活动入口"].map((item) => (
            <div key={item} className="h-24 rounded-[16px] bg-white/90 p-3 text-xs font-semibold shadow-sm ring-1 ring-black/5">
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Tabs */}
      <nav className="absolute bottom-0 left-0 right-0 grid grid-cols-4 border-t border-black/5 bg-white/95 px-4 py-2 text-center text-[10px] text-[#6b7280]">
        {["首页", "任务", "作品", "我的"].map((item, index) => (
          <div key={item} className={index === 1 ? "font-bold" : ""} style={{ color: index === 1 ? theme.pill : undefined }}>
            <span className="mx-auto mb-1 block h-5 w-5 rounded-md bg-black/10" />
            {item}
          </div>
        ))}
      </nav>
    </div>
  );
}