import { Gift, Package, Clock, Check, X } from "lucide-react";

interface DemoProps {}

interface PrizeRecord {
  id: number;
  name: string;
  date: string;
  status: "pending" | "claimed";
}

const prizeList: PrizeRecord[] = [
  { id: 1, name: "冠军签名球衣", date: "2024-01-15", status: "pending" },
  { id: 2, name: "限量版足球", date: "2024-01-14", status: "claimed" },
];

export default function Demo(_props: DemoProps) {
  const pendingCount = prizeList.filter((p) => p.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white px-4 py-3 flex items-center border-b border-gray-100 sticky top-0 z-10">
        <button className="mr-3 text-gray-600 hover:text-gray-900">
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">抽奖中心</h1>
      </header>

      <main className="flex-1 px-4 pb-24">
        {/* Status Section */}
        <div className="bg-white rounded-2xl p-6 mt-4 shadow-sm">
          {/* Chance dots */}
          <div className="flex items-center justify-center gap-3 mb-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center"
              >
                <X className="w-5 h-5 text-gray-400" />
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mb-1">
            今日抽奖机会：0/3
          </p>
          <p className="text-center text-base font-medium text-gray-700">
            今日抽奖机会已用完，明天再来吧！
          </p>
          <div className="mt-4 text-center">
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 px-4 py-1.5 rounded-full text-sm font-medium">
              🎉 已获得 {pendingCount} 件奖品
            </span>
          </div>
        </div>

        {/* My Prizes Section */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            📦 我的奖品
          </h2>
          <div className="space-y-3">
            {prizeList.map((prize) => (
              <div
                key={prize.id}
                className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <Gift className="w-6 h-6 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {prize.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{prize.date}</span>
                  </div>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-3 py-1 rounded-full ${
                    prize.status === "pending"
                      ? "bg-orange-50 text-orange-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {prize.status === "pending" ? "待领取" : "已领取"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* View All Button */}
        <div className="mt-6 text-center">
          <button className="inline-flex items-center gap-2 text-rose-500 font-medium hover:text-rose-600 transition-colors">
            查看全部奖品
            <span className="text-lg">→</span>
          </button>
        </div>
      </main>
    </div>
  );
}