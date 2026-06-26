import { Icon } from "@preview/sdk";

interface DemoProps {}

/**
 * 站外引导页 - 叫叫 App 之外的引导落地页
 * 默认展示浏览器环境引导版；通过修改 isWechat 变量可切换为微信环境
 */
export default function Demo(_props: DemoProps) {
  // 模拟环境检测：通过 userAgent 判断
  // 在实际项目中可改为从 props 或 UA 真实获取
  const isWechat = false; // 设为 true 模拟微信环境

  const prizes = [
    { name: "冠军签名球衣", emoji: "👕", color: "bg-green-100" },
    { name: "限量版足球", emoji: "⚽", color: "bg-emerald-100" },
    { name: "VIP 观赛券", emoji: "🎫", color: "bg-lime-100" },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部品牌区域 */}
      <div className="bg-gradient-to-b from-green-600 to-green-500 px-6 pt-8 pb-12 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
              <path d="M18 4.5A2.5 2.5 0 0 1 20.5 7c-1 1.5-2.5 2-2.5 2" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2v6.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V2" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-green-100">官方活动</p>
            <h1 className="text-lg font-bold">⚽ 世界杯助威盛典</h1>
          </div>
        </div>
        <p className="text-green-100 text-sm">
          参与活动赢取丰厚好礼，为世界杯喝彩！
        </p>
      </div>

      {/* 奖品预览 */}
      <div className="px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            🎁 奖品预览
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {prizes.map((prize) => (
              <div
                key={prize.name}
                className={`${prize.color} rounded-xl p-3 text-center`}
              >
                <div className="text-2xl mb-1">{prize.emoji}</div>
                <p className="text-xs font-medium text-gray-700 leading-tight">
                  {prize.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 主操作区域 */}
      <div className="px-6 mt-6">
        {!isWechat ? (
          <>
            {/* 浏览器环境 */}
            <button className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
              在 App 中打开
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-400 mb-3 flex items-center justify-center gap-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 7v10" />
                  <path d="M7 12h10" />
                </svg>
                扫描二维码打开
              </p>
              {/* 二维码占位灰色方块 */}
              <div className="w-36 h-36 bg-gray-200 rounded-xl mx-auto flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 7v10" />
                  <path d="M7 12h10" />
                </svg>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 微信环境 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <Icon name="browser" className="w-6 h-6 text-yellow-600" />
                <p className="text-sm text-yellow-800 font-medium">
                  点击右上角 <span className="font-bold">···</span> → 在浏览器中打开
                </p>
              </div>
            </div>

            <button className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              下载 App
            </button>
          </>
        )}
      </div>

      {/* App 下载入口 */}
      <div className="px-6 mt-8 mb-10">
        <p className="text-xs text-gray-400 text-center mb-3">
          还没下载叫叫 App？
        </p>
        <div className="flex gap-3">
          <button className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
              <path d="M12 18h.01" />
            </svg>
            iOS 下载
          </button>
          <button className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
              <path d="M12 18h.01" />
            </svg>
            Android 下载
          </button>
        </div>
      </div>

      {/* 底部版权 */}
      <div className="px-6 pb-6 text-center">
        <p className="text-xs text-gray-300">© 2024 叫叫 保留所有权利</p>
      </div>
    </div>
  );
}
