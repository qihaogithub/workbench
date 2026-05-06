import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingCart,
  DollarSign,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface DashboardProps {
  title?: string;
  period?: "今日" | "本周" | "本月";
  showRevenue?: boolean;
  showUsers?: boolean;
  showOrders?: boolean;
  showGrowth?: boolean;
  chartStyle?: "bar" | "line" | "area";
}

// 模拟数据生成
function generateMockData(period: string) {
  const multiplier = period === "今日" ? 1 : period === "本周" ? 7 : 30;
  return {
    revenue: Math.floor(128000 * multiplier * (0.9 + Math.random() * 0.2)),
    users: Math.floor(3840 * multiplier * (0.9 + Math.random() * 0.2)),
    orders: Math.floor(856 * multiplier * (0.9 + Math.random() * 0.2)),
    growth: +(Math.random() * 30 + 5).toFixed(1),
  };
}

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }
  return `¥${value.toLocaleString()}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  color: string;
}) {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            trendUp
              ? "bg-green-500/20 text-green-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          {trendUp ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
          {trend}
        </div>
      </div>
      <p className="text-white/60 text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function MiniChart({ type, height }: { type: string; height: number }) {
  const bars = Array.from({ length: 12 }, () => Math.random() * height);
  const max = Math.max(...bars);

  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {bars.map((h, i) => {
        const barHeight = (h / max) * (height - 10) + 4;
        const isHighlight = i === bars.length - 1;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300"
            style={{
              height: barHeight,
              background:
                type === "area"
                  ? `linear-gradient(to top, ${
                      isHighlight ? "#a78bfa" : "#6366f1"
                    }44, ${isHighlight ? "#a78bfa" : "#6366f1"}22)`
                  : isHighlight
                  ? "#a78bfa"
                  : "#6366f1",
              opacity: type === "line" ? 0.3 + (i / bars.length) * 0.7 : 0.6 + (i / bars.length) * 0.4,
              borderLeft: type === "line" ? "1px solid rgba(167,139,250,0.3)" : "none",
              minWidth: 4,
            }}
          />
        );
      })}
    </div>
  );
}

export default function DashboardPage(props: Record<string, unknown>) {
  const {
    title = "📊 数据仪表盘",
    period = "今日",
    showRevenue = true,
    showUsers = true,
    showOrders = true,
    showGrowth = true,
    chartStyle = "bar",
  } = props as DashboardProps;

  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const data = generateMockData(selectedPeriod);

  const periods = ["今日", "本周", "本月"];

  const statCards = [
    {
      key: "revenue",
      show: showRevenue,
      icon: DollarSign,
      label: "总收入",
      value: formatCurrency(data.revenue),
      trend: `+${(data.growth * 0.8).toFixed(1)}%`,
      trendUp: true,
      color: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
    {
      key: "users",
      show: showUsers,
      icon: Users,
      label: "活跃用户",
      value: `${data.users.toLocaleString()}`,
      trend: `+${(data.growth * 1.2).toFixed(1)}%`,
      trendUp: true,
      color: "bg-gradient-to-br from-blue-500 to-indigo-600",
    },
    {
      key: "orders",
      show: showOrders,
      icon: ShoppingCart,
      label: "订单数",
      value: data.orders.toLocaleString(),
      trend: `-${(data.growth * 0.3).toFixed(1)}%`,
      trendUp: false,
      color: "bg-gradient-to-br from-orange-500 to-amber-600",
    },
    {
      key: "growth",
      show: showGrowth,
      icon: TrendingUp,
      label: "增长率",
      value: `+${data.growth}%`,
      trend: `+${(data.growth * 0.5).toFixed(1)}%`,
      trendUp: true,
      color: "bg-gradient-to-br from-purple-500 to-pink-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6">
      {/* 页面头部 */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">{title}</h1>
            <p className="text-white/50 text-sm mt-1">
              实时数据概览，掌握业务动态
            </p>
          </div>

          {/* 时间段切换 */}
          <div className="flex gap-2 bg-white/5 backdrop-blur-sm rounded-xl p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  selectedPeriod === p
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                    : "text-white/60 hover:text-white/90 hover:bg-white/10"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards
            .filter((card) => card.show)
            .map((card) => (
              <StatCard key={card.key} {...card} />
            ))}
        </div>

        {/* 图表区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 趋势图 */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-white font-semibold">收入趋势</h3>
              </div>
              <span className="text-xs text-white/40">
                最近 12 期
              </span>
            </div>
            <MiniChart type={chartStyle} height={160} />
          </div>

          {/* 活跃度 */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h3 className="text-white font-semibold">用户活跃度</h3>
              </div>
              <span className="text-xs text-white/40">
                最近 12 期
              </span>
            </div>
            <MiniChart type="area" height={160} />
          </div>

          {/* 最近活动列表 */}
          <div className="lg:col-span-2 bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-semibold">最近活动</h3>
            </div>
            <div className="space-y-3">
              {[
                { action: "新用户注册", detail: "用户 王小明 注册了账号", time: "2 分钟前", color: "bg-green-500" },
                { action: "新订单", detail: "订单 #20240506 已完成支付", time: "15 分钟前", color: "bg-blue-500" },
                { action: "提现申请", detail: "商户 张三 申请提现 ¥12,800", time: "1 小时前", color: "bg-orange-500" },
                { action: "系统通知", detail: "系统备份已完成", time: "2 小时前", color: "bg-purple-500" },
                { action: "异常告警", detail: "服务器 CPU 使用率超过 80%", time: "3 小时前", color: "bg-red-500" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{item.action}</p>
                    <p className="text-xs text-white/50 truncate">{item.detail}</p>
                  </div>
                  <span className="text-xs text-white/40 flex-shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}