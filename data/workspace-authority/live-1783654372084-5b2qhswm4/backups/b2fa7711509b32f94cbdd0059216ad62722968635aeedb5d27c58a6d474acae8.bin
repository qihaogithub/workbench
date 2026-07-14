import { Icon } from "@preview/sdk";

interface DemoProps {}

export default function KidsEducation(_props: DemoProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F5] via-[#F0F4FF] to-[#F5FFF0] max-w-[480px] mx-auto relative pb-20 overflow-x-hidden">
      {/* 顶部状态栏 */}
      <div className="flex justify-between items-center px-5 pt-3 pb-2 text-xs text-gray-500">
        <span>9:41</span>
        <div className="flex gap-1 text-[11px]">
          <span>📶</span>
          <span>📡</span>
          <span>🔋</span>
        </div>
      </div>

      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-4 pb-3">
        <button className="text-2xl text-gray-600 bg-none border-none cursor-pointer" aria-label="菜单">
          ☰
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#7C4DFF] bg-clip-text text-transparent">
          🌟 宝贝学堂
        </h1>
        <button className="bg-none border-none cursor-pointer">
          <div className="w-9 h-9 bg-gradient-to-br from-[#FFE082] to-[#FFB74D] rounded-full flex items-center justify-center text-lg shadow-[0_2px_8px_rgba(255,183,77,0.3)]">
            🐼
          </div>
        </button>
      </header>

      {/* 搜索栏 */}
      <div className="flex items-center bg-white mx-4 mb-4 px-4 py-2.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.06)] gap-2">
        <span className="text-base">🔍</span>
        <input
          type="search"
          placeholder="搜索课程、故事、游戏..."
          className="flex-1 border-none outline-none text-sm text-gray-700 bg-transparent placeholder:text-gray-300"
        />
      </div>

      {/* Banner 轮播 */}
      <section className="mx-4 mb-5 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#6C63FF] to-[#FF6B9D] shadow-[0_4px_20px_rgba(108,99,255,0.25)]">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
              🎨
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-1">创意美术课</h2>
              <p className="text-white/85 text-sm">激发孩子的想象力</p>
            </div>
          </div>
          <div className="flex justify-center gap-1.5 mt-3.5">
            <span className="w-5 h-1.5 rounded-full bg-white" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* 快捷功能 */}
      <section className="flex justify-around px-3 mb-6">
        {[
          { icon: "📖", label: "绘本故事", gradient: "from-[#FFE0B2] to-[#FFCC80]" },
          { icon: "🔤", label: "学字母", gradient: "from-[#C8E6C9] to-[#A5D6A7]" },
          { icon: "🔢", label: "学数数", gradient: "from-[#BBDEFB] to-[#90CAF9]" },
          { icon: "🎵", label: "儿歌", gradient: "from-[#F8BBD0] to-[#F48FB1]" },
          { icon: "🧩", label: "小游戏", gradient: "from-[#E1BEE7] to-[#CE93D8]" },
        ].map((item) => (
          <button
            key={item.label}
            className="flex flex-col items-center gap-1.5 cursor-pointer transition-transform hover:-translate-y-0.5 bg-none border-none"
          >
            <div
              className={`w-13 h-13 bg-gradient-to-br ${item.gradient} rounded-2xl flex items-center justify-center text-2xl shadow-[0_2px_10px_rgba(0,0,0,0.06)]`}
            >
              {item.icon}
            </div>
            <span className="text-xs text-gray-500 font-medium">{item.label}</span>
          </button>
        ))}
      </section>

      {/* 今日推荐 */}
      <section className="mx-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-gray-800">📚 今日推荐</h3>
          <button className="text-sm text-gray-400 bg-none border-none cursor-pointer">更多 ›</button>
        </div>
        <div className="flex flex-col gap-3">
          {/* 推荐卡片 1 */}
          <div className="flex bg-white rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="w-[110px] min-h-[90px] flex-shrink-0 bg-gradient-to-br from-[#FF9A9E] to-[#FAD0C4] flex items-center justify-center text-4xl">
              🎯
            </div>
            <div className="p-3 flex-1">
              <h4 className="text-[15px] font-semibold text-gray-800 mb-1">趣味拼音</h4>
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">认识声母韵母，快乐学拼音</p>
              <div className="flex gap-2 items-center">
                <span className="inline-block px-2 py-0.5 rounded-[10px] text-[11px] bg-blue-50 text-[#5B7FFF] font-medium">
                  3-6岁
                </span>
                <span className="text-[11px] text-gray-300">12节</span>
              </div>
            </div>
          </div>
          {/* 推荐卡片 2 */}
          <div className="flex bg-white rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="w-[110px] min-h-[90px] flex-shrink-0 bg-gradient-to-br from-[#A18CD1] to-[#FBC2EB] flex items-center justify-center text-4xl">
              🧮
            </div>
            <div className="p-3 flex-1">
              <h4 className="text-[15px] font-semibold text-gray-800 mb-1">数学启蒙</h4>
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">1-100数字认知与简单加减</p>
              <div className="flex gap-2 items-center">
                <span className="inline-block px-2 py-0.5 rounded-[10px] text-[11px] bg-blue-50 text-[#5B7FFF] font-medium">
                  4-7岁
                </span>
                <span className="text-[11px] text-gray-300">15节</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 热门课程 */}
      <section className="mx-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-gray-800">🔥 热门课程</h3>
          <button className="text-sm text-gray-400 bg-none border-none cursor-pointer">全部 ›</button>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { emoji: "🌍", label: "探索世界" },
            { emoji: "🎨", label: "创意绘画" },
            { emoji: "🐯", label: "动物世界" },
            { emoji: "🚀", label: "太空探险" },
          ].map((item) => (
            <button
              key={item.label}
              className="flex flex-col items-center gap-1.5 bg-white rounded-2xl py-4 px-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)] cursor-pointer transition-transform hover:-translate-y-0.5 bg-none border-none"
            >
              <span className="text-[28px]">{item.emoji}</span>
              <span className="text-xs text-gray-600 font-medium text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] flex justify-around bg-white pt-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-50">
        {[
          { icon: "🏠", label: "首页", active: true },
          { icon: "📚", label: "课程", active: false },
          { icon: "🎬", label: "动画", active: false },
          { icon: "👤", label: "我的", active: false },
        ].map((item) => (
          <button
            key={item.label}
            className={`flex flex-col items-center gap-0.5 cursor-pointer bg-none border-none transition-opacity ${
              item.active ? "opacity-100" : "opacity-50"
            }`}
          >
            <span className="text-[22px]">{item.icon}</span>
            <span
              className={`text-[10px] ${
                item.active ? "text-[#6C63FF] font-semibold" : "text-gray-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}import { Icon } from "@preview/sdk";

interface DemoProps {}

export default function KidsEducation(_props: DemoProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F5] via-[#F0F4FF] to-[#F5FFF0] max-w-[480px] mx-auto relative pb-20 overflow-x-hidden">
      {/* 顶部状态栏 */}
      <div className="flex justify-between items-center px-5 pt-3 pb-2 text-xs text-gray-500">
        <span>9:41</span>
        <div className="flex gap-1 text-[11px]">
          <span>📶</span>
          <span>📡</span>
          <span>🔋</span>
        </div>
      </div>

      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-4 pb-3">
        <button className="text-2xl text-gray-600 bg-none border-none cursor-pointer" aria-label="菜单">
          ☰
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#7C4DFF] bg-clip-text text-transparent">
          🌟 宝贝学堂
        </h1>
        <button className="bg-none border-none cursor-pointer">
          <div className="w-9 h-9 bg-gradient-to-br from-[#FFE082] to-[#FFB74D] rounded-full flex items-center justify-center text-lg shadow-[0_2px_8px_rgba(255,183,77,0.3)]">
            🐼
          </div>
        </button>
      </header>

      {/* 搜索栏 */}
      <div className="flex items-center bg-white mx-4 mb-4 px-4 py-2.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.06)] gap-2">
        <span className="text-base">🔍</span>
        <input
          type="search"
          placeholder="搜索课程、故事、游戏..."
          className="flex-1 border-none outline-none text-sm text-gray-700 bg-transparent placeholder:text-gray-300"
        />
      </div>

      {/* Banner 轮播 */}
      <section className="mx-4 mb-5 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#6C63FF] to-[#FF6B9D] shadow-[0_4px_20px_rgba(108,99,255,0.25)]">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
              🎨
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-1">创意美术课</h2>
              <p className="text-white/85 text-sm">激发孩子的想象力</p>
            </div>
          </div>
          <div className="flex justify-center gap-1.5 mt-3.5">
            <span className="w-5 h-1.5 rounded-full bg-white" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* 快捷功能 */}
      <section className="flex justify-around px-3 mb-6">
        {[
          { icon: "📖", label: "绘本故事", gradient: "from-[#FFE0B2] to-[#FFCC80]" },
          { icon: "🔤", label: "学字母", gradient: "from-[#C8E6C9] to-[#A5D6A7]" },
          { icon: "🔢", label: "学数数", gradient: "from-[#BBDEFB] to-[#90CAF9]" },
          { icon: "🎵", label: "儿歌", gradient: "from-[#F8BBD0] to-[#F48FB1]" },
          { icon: "🧩", label: "小游戏", gradient: "from-[#E1BEE7] to-[#CE93D8]" },
        ].map((item) => (
          <button
            key={item.label}
            className="flex flex-col items-center gap-1.5 cursor-pointer transition-transform hover:-translate-y-0.5 bg-none border-none"
          >
            <div
              className={`w-13 h-13 bg-gradient-to-br ${item.gradient} rounded-2xl flex items-center justify-center text-2xl shadow-[0_2px_10px_rgba(0,0,0,0.06)]`}
            >
              {item.icon}
            </div>
            <span className="text-xs text-gray-500 font-medium">{item.label}</span>
          </button>
        ))}
      </section>

      {/* 今日推荐 */}
      <section className="mx-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-gray-800">📚 今日推荐</h3>
          <button className="text-sm text-gray-400 bg-none border-none cursor-pointer">更多 ›</button>
        </div>
        <div className="flex flex-col gap-3">
          {/* 推荐卡片 1 */}
          <div className="flex bg-white rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="w-[110px] min-h-[90px] flex-shrink-0 bg-gradient-to-br from-[#FF9A9E] to-[#FAD0C4] flex items-center justify-center text-4xl">
              🎯
            </div>
            <div className="p-3 flex-1">
              <h4 className="text-[15px] font-semibold text-gray-800 mb-1">趣味拼音</h4>
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">认识声母韵母，快乐学拼音</p>
              <div className="flex gap-2 items-center">
                <span className="inline-block px-2 py-0.5 rounded-[10px] text-[11px] bg-blue-50 text-[#5B7FFF] font-medium">
                  3-6岁
                </span>
                <span className="text-[11px] text-gray-300">12节</span>
              </div>
            </div>
          </div>
          {/* 推荐卡片 2 */}
          <div className="flex bg-white rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="w-[110px] min-h-[90px] flex-shrink-0 bg-gradient-to-br from-[#A18CD1] to-[#FBC2EB] flex items-center justify-center text-4xl">
              🧮
            </div>
            <div className="p-3 flex-1">
              <h4 className="text-[15px] font-semibold text-gray-800 mb-1">数学启蒙</h4>
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">1-100数字认知与简单加减</p>
              <div className="flex gap-2 items-center">
                <span className="inline-block px-2 py-0.5 rounded-[10px] text-[11px] bg-blue-50 text-[#5B7FFF] font-medium">
                  4-7岁
                </span>
                <span className="text-[11px] text-gray-300">15节</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 热门课程 */}
      <section className="mx-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-gray-800">🔥 热门课程</h3>
          <button className="text-sm text-gray-400 bg-none border-none cursor-pointer">全部 ›</button>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { emoji: "🌍", label: "探索世界" },
            { emoji: "🎨", label: "创意绘画" },
            { emoji: "🐯", label: "动物世界" },
            { emoji: "🚀", label: "太空探险" },
          ].map((item) => (
            <button
              key={item.label}
              className="flex flex-col items-center gap-1.5 bg-white rounded-2xl py-4 px-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)] cursor-pointer transition-transform hover:-translate-y-0.5 bg-none border-none"
            >
              <span className="text-[28px]">{item.emoji}</span>
              <span className="text-xs text-gray-600 font-medium text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] flex justify-around bg-white pt-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-50">
        {[
          { icon: "🏠", label: "首页", active: true },
          { icon: "📚", label: "课程", active: false },
          { icon: "🎬", label: "动画", active: false },
          { icon: "👤", label: "我的", active: false },
        ].map((item) => (
          <button
            key={item.label}
            className={`flex flex-col items-center gap-0.5 cursor-pointer bg-none border-none transition-opacity ${
              item.active ? "opacity-100" : "opacity-50"
            }`}
          >
            <span className="text-[22px]">{item.icon}</span>
            <span
              className={`text-[10px] ${
                item.active ? "text-[#6C63FF] font-semibold" : "text-gray-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}