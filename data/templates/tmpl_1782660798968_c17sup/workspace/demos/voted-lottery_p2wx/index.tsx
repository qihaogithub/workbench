interface DemoProps {}

export default function Demo(_props: DemoProps) {
  const hasDrawn = false;

  const ArrowLeftIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );

  const CheckCircleIcon = () => (
    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const PartyPopperIcon = () => (
    <svg className="w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.8 11.3 2 22l10.7-3.79" /><path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 2 11 13" /><path d="M10 5 2 13" />
    </svg>
  );

  const GiftIcon = () => (
    <svg className="w-10 h-10 text-yellow-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" /><rect width="20" height="5" x="2" y="7" /><line x1="12" x2="12" y1="22" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7" />
    </svg>
  );

  const SparklesIcon = () => (
    <svg className="w-5 h-5 text-yellow-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );

  const MedalIcon = () => (
    <svg className="w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20v-6" /><path d="M6.5 14H7a2 2 0 0 1 2 2v6" /><path d="M14.5 14H17a2 2 0 0 1 2 2v6" /><circle cx="12" cy="7" r="4" /><path d="M6.5 17H5a2 2 0 0 0-2 2v3" /><path d="M18.5 17H19a2 2 0 0 1 2 2v3" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button className="p-1 text-gray-700">
          <ArrowLeftIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-800">世界杯助威盛典</h1>
      </div>

      {/* 状态横幅 */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-8 text-white text-center">
        <div className="text-3xl mb-1">🎉</div>
        <h2 className="text-2xl font-bold mb-1">助威成功！</h2>
        <p className="text-green-100 text-sm">你已为 巴西 球队加油助威</p>
      </div>

      {/* 任务卡片更新版 */}
      <div className="mx-4 -mt-4 mb-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-3">任务进度</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircleIcon />
              <span className="text-gray-600">浏览活动页</span>
            </div>
            <span className="text-green-500 text-xs bg-green-50 px-2 py-0.5 rounded">已完成</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircleIcon />
              <span className="text-gray-600">分享活动</span>
            </div>
            <span className="text-green-500 text-xs bg-green-50 px-2 py-0.5 rounded">已完成</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircleIcon />
              <span className="text-gray-600">助威球队</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 bg-green-700 rounded shadow-sm" />
              <span className="text-green-600 text-xs font-medium">巴西</span>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm">
          <PartyPopperIcon />
          <span className="text-yellow-600 font-medium">恭喜获得 1 次抽奖机会</span>
        </div>
      </div>

      {/* 抽奖入口 - 扭蛋抽奖 */}
      <div className="mx-4 mb-4">
        <div className="relative bg-gradient-to-br from-purple-600 to-pink-500 rounded-2xl p-6 text-white text-center overflow-hidden">
          {/* 闪烁边框动画 */}
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent" style={{
            background: "linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24, #f59e0b)",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
            animation: "pulse 2s ease-in-out infinite",
          }} />

          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
          `}</style>

          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-4">🎰 扭蛋抽奖</h3>

            {/* 抽奖机图形 */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <GiftIcon />
                </div>
                <SparklesIcon />
              </div>
            </div>

            {/* 大按钮 */}
            {!hasDrawn ? (
              <button className="w-full py-3.5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-yellow-600/30 hover:shadow-yellow-600/50 transition-shadow">
                立即抽奖
              </button>
            ) : null}

            <div className="mt-2 text-sm text-white/80">
              剩余 <span className="text-yellow-300 font-bold text-lg">1</span> 次
            </div>
          </div>
        </div>
      </div>

      {/* 我的奖品入口 */}
      <div className="mx-4 mb-4">
        <button className="w-full py-3 bg-white rounded-xl border border-gray-200 text-gray-700 font-medium text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
          <MedalIcon />
          查看我的奖品 →
        </button>
      </div>

      {/* 底部 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 max-w-md mx-auto z-10">
        <button className="w-full py-3 bg-green-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2">
          分享活动
        </button>
      </div>
    </div>
  );
}