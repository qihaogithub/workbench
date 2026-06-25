import { useState } from "react";
import {
  Trophy,
  Award,
  BookOpen,
  Star,
  Sparkles,
  Medal,
  Share2,
  Home,
  Gift,
  Check,
} from "lucide-react";

interface DemoProps {}

export default function Demo(_props: DemoProps) {
  const [hasSkin, setHasSkin] = useState(true);

  const statCards = [
    { label: "活动总助威数", value: "1,284,567", icon: Star, color: "text-yellow-500" },
    { label: "我的助威次数", value: "12", icon: Medal, color: "text-blue-500" },
    { label: "我的中奖数", value: "2", icon: Award, color: "text-rose-500" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 via-white to-red-50 flex flex-col">
      {/* Confetti background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: ["#FFD700", "#FF6B6B", "#48DBFB", "#FF9FF3", "#FECA57"][
                i % 5
              ],
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${i * 0.15}s`,
              animationDuration: "1.5s",
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      {/* Champion Section */}
      <div className="relative mx-4 mt-6 rounded-3xl bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 p-8 text-center shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.3),transparent_60%)]" />
        <div className="relative z-10">
          <Trophy className="w-20 h-20 text-yellow-200 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="text-3xl font-bold text-white drop-shadow-md mb-1">
            🇦🇷 阿根廷
          </h1>
          <p className="text-yellow-100 text-sm font-medium">2024 世界杯冠军</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 mx-4 mt-5">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-50"
            >
              <Icon className={`w-5 h-5 ${stat.color} mx-auto mb-1`} />
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Achievement Section */}
      <div className="bg-white mx-4 mt-5 rounded-2xl p-5 shadow-sm border border-gray-50">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-500" />
          个人成就
        </h2>

        <div className="space-y-4">
          {/* Lessons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">完课节数</p>
                <p className="text-xs text-gray-400">足球知识课程</p>
              </div>
            </div>
            <span className="text-lg font-bold text-indigo-600">18 节</span>
          </div>

          {/* Title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Star className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">获得称号</p>
                <p className="text-xs text-gray-400">你的专属荣誉</p>
              </div>
            </div>
            <span className="text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              ⚡ 足球达人
            </span>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>完课达标进度</span>
              <span className="font-medium text-green-600">20/20 节</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Skin Result Section */}
      <div className="bg-white mx-4 mt-5 rounded-2xl p-5 shadow-sm border border-gray-50 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            冠军皮肤
          </h2>
          <button
            onClick={() => setHasSkin((prev) => !prev)}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            切换状态
          </button>
        </div>

        {hasSkin ? (
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-yellow-200 via-amber-300 to-orange-400 flex items-center justify-center animate-bounce">
              <Gift className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <p className="text-lg font-bold text-gray-900 mb-1">
              🎉 恭喜获得冠军限定皮肤！
            </p>
            <p className="text-xs text-gray-400">
              你已完成全部任务，限时皮肤已发放至背包
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-3 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Gift className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-lg font-bold text-gray-900 mb-1">
              😅 还差一点点…
            </p>
            <p className="text-xs text-gray-400">
              完课 24 节即可获得冠军皮肤（当前 18/24）
            </p>
          </div>
        )}
      </div>

      {/* Bottom Buttons */}
      <div className="px-4 pb-8 space-y-3">
        <button className="w-full py-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center justify-center gap-2">
          <Home className="w-5 h-5" />
          返回首页
        </button>
        <button className="w-full py-3 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
          <Share2 className="w-5 h-5" />
          分享海报
        </button>
      </div>
    </div>
  );
}