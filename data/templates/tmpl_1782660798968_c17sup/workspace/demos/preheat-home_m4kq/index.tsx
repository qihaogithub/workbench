interface DemoProps {}

export default function Demo(_props: DemoProps) {
  const days = 7;
  const hours = 12;
  const minutes = 30;
  const seconds = 45;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部头图 */}
      <div className="bg-gradient-to-br from-green-500 to-green-700 px-6 pt-12 pb-8 text-white">
        <div className="text-3xl font-bold mb-2">⚽ 世界杯助威盛典</div>
        <div className="text-green-100 text-lg">激情一夏，为热爱加冕</div>
      </div>

      {/* 阶段标签 */}
      <div className="flex justify-center -mt-4 mb-4">
        <span className="bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-medium shadow">
          🔥 预热阶段
        </span>
      </div>

      {/* 倒计时 */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-center text-gray-500 text-sm mb-3">距离活动开始</div>
          <div className="flex justify-center gap-3">
            {[
              { value: days, label: "天" },
              { value: hours, label: "时" },
              { value: minutes, label: "分" },
              { value: seconds, label: "秒" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-900 text-white rounded-lg flex items-center justify-center text-2xl font-bold">
                  {String(item.value).padStart(2, "0")}
                </div>
                <span className="text-xs text-gray-400 mt-1">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 每日任务 */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">每日任务</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm">✓</span>
                <span className="text-gray-700">浏览活动页</span>
              </div>
              <span className="text-green-500 text-xs bg-green-50 px-2 py-0.5 rounded">已完成</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-orange-500 text-sm">→</span>
                <span className="text-gray-700">分享活动</span>
              </div>
              <button className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full">去分享</button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 text-sm">🔒</span>
                <span className="text-gray-400">助威球队</span>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">活动未开始</span>
            </div>
          </div>
        </div>
      </div>

      {/* 奖品展示 */}
      <div className="px-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">🎁 丰厚奖品</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            "冠军签名球衣",
            "限量版足球",
            "VIP观赛券",
            "学习大礼包",
            "品牌周边",
            "现金红包",
          ].map((name) => (
            <div key={name} className="bg-gray-100 rounded-xl aspect-square flex flex-col items-center justify-center p-2">
              <div className="w-12 h-12 bg-gray-300 rounded-lg mb-2" />
              <span className="text-xs text-gray-600 text-center leading-tight">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 分享区 */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-2">邀请好友</h3>
          <p className="text-xs text-gray-400 mb-3">邀请好友一起参与，赢取更多好礼</p>
          <button className="w-full py-2.5 bg-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
            分享邀请链接
          </button>
        </div>
      </div>

      {/* 底部固定栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 max-w-md mx-auto">
        <button className="flex-1 py-3 bg-gray-200 text-gray-400 rounded-xl font-medium text-sm cursor-not-allowed">
          投票
        </button>
        <button className="flex-1 py-3 bg-gray-200 text-gray-400 rounded-xl font-medium text-sm cursor-not-allowed">
          抽奖
        </button>
      </div>

      {/* 底部占位 */}
      <div className="h-24" />
    </div>
  );
}