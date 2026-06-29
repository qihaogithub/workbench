import { ArrowLeft, Share2, Info, Search, Trophy, MessageCircle, CheckCircle } from "lucide-react";

interface DemoProps {}

const teams = [
  "中国", "日本", "韩国", "伊朗", "沙特阿拉伯", "澳大利亚",
  "巴西", "阿根廷", "乌拉圭", "哥伦比亚", "智利", "秘鲁",
  "法国", "德国", "意大利", "西班牙", "英格兰", "葡萄牙",
  "荷兰", "比利时", "克罗地亚", "塞尔维亚", "瑞士", "波兰",
  "丹麦", "瑞典", "挪威", "土耳其", "乌克兰", "捷克",
  "墨西哥", "美国", "加拿大", "哥斯达黎加", "牙买加", "巴拿马",
  "喀麦隆", "尼日利亚", "塞内加尔", "摩洛哥", "加纳", "突尼斯",
  "埃及", "科特迪瓦", "埃塞俄比亚", "南非", "阿尔及利亚", "赞比亚",
];

const colors = [
  "bg-red-500", "bg-blue-600", "bg-emerald-600", "bg-green-600", "bg-yellow-500", "bg-yellow-400",
  "bg-yellow-300", "bg-sky-400", "bg-blue-500", "bg-red-600", "bg-red-500", "bg-blue-700",
  "bg-indigo-700", "bg-gray-800", "bg-amber-500", "bg-red-700", "bg-blue-600", "bg-green-600",
  "bg-orange-500", "bg-red-800", "bg-blue-500", "bg-red-700", "bg-red-600", "bg-blue-600",
  "bg-blue-600", "bg-yellow-300", "bg-blue-700", "bg-red-600", "bg-blue-700", "bg-red-600",
  "bg-green-700", "bg-blue-600", "bg-red-700", "bg-blue-500", "bg-black", "bg-blue-600",
  "bg-green-600", "bg-green-600", "bg-green-700", "bg-red-600", "bg-red-700", "bg-green-600",
  "bg-red-800", "bg-orange-500", "bg-green-600", "bg-blue-600", "bg-green-700", "bg-green-600",
];

export default function Demo(_props: DemoProps) {
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button className="p-1 text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-800">世界杯助威盛典</h1>
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-gray-600" />
          <Info className="w-5 h-5 text-gray-600" />
        </div>
      </div>

      {/* 头图区域 */}
      <div className="bg-gradient-to-br from-green-500 to-green-700 px-6 py-8 text-white">
        <h2 className="text-2xl font-bold mb-2">⚽ 世界杯助威盛典</h2>
        <span className="inline-block bg-orange-500 text-white px-3 py-0.5 rounded-full text-sm font-medium">
          🔥 助威进行中
        </span>
      </div>

      {/* 用户任务卡片 */}
      <div className="mx-4 -mt-4 mb-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-gray-500 text-sm font-medium">足</div>
          <div>
            <div className="font-semibold text-gray-800">足球小将</div>
            <div className="text-xs text-gray-400">今日已助威：0 次</div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
          <div className="bg-green-500 h-2 rounded-full" style={{ width: "33%" }} />
        </div>

        {/* 任务项 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">浏览活动页</span>
            </div>
            <span className="text-green-500 text-xs">已完成</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-orange-400" />
              <span className="text-gray-700">分享活动</span>
            </div>
            <button className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full">去分享</button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-blue-500" />
              <span className="text-gray-700">助威球队</span>
            </div>
            <button className="text-xs bg-green-500 text-white px-3 py-1 rounded-full">去投票</button>
          </div>
        </div>
      </div>

      {/* 球队投票区 */}
      <div className="px-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">🏆 为你支持的球队助威</h3>

        {/* 搜索框 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索球队名称"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {/* 球队网格 */}
        <div className="grid grid-cols-3 gap-2">
          {teams.map((team, i) => (
            <div key={team} className="bg-white rounded-lg border border-gray-100 p-3 flex flex-col items-center gap-1.5">
              <div className={`w-10 h-7 ${colors[i]} rounded shadow-sm`} />
              <span className="text-xs text-gray-700 font-medium leading-tight text-center">{team}</span>
              <button className="w-full py-1 bg-green-500 text-white text-xs rounded-full mt-1 hover:bg-green-600 transition-colors">
                助威
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 奖品展示区 - 横向滚动 */}
      <div className="px-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">🎁 奖品展示</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {["冠军签名球衣", "限量版足球", "VIP观赛券", "学习大礼包", "品牌周边", "现金红包"].map((name) => (
            <div key={name} className="flex-shrink-0 w-28 bg-white rounded-xl p-3 border border-gray-200">
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-gray-300" />
              </div>
              <span className="text-xs text-gray-600 block text-center">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部固定栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 max-w-md mx-auto z-10">
        <button className="flex-1 py-3 bg-green-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" />
          分享
        </button>
        <button className="flex-1 py-3 border border-green-500 text-green-600 rounded-xl font-medium text-sm flex items-center justify-center gap-2">
          <MessageCircle className="w-4 h-4" />
          留言反馈
        </button>
      </div>
    </div>
  );
}