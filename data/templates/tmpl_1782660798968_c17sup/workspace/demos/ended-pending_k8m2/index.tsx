import { useState } from "react";
import { Icon } from "@preview/sdk";

interface DemoProps {}

const teams = [
  { id: 1, name: "🇦🇷 阿根廷", votes: 284567 },
  { id: 2, name: "🇫🇷 法国", votes: 245891 },
  { id: 3, name: "🇧🇷 巴西", votes: 198234 },
];

const taskItems = [
  { id: 1, label: "每日签到", done: true },
  { id: 2, label: "分享活动", done: true },
  { id: 3, label: "竞猜比分", done: true },
];

export default function Demo(_props: DemoProps) {
  
  const [showLottery, setShowLottery] = useState(false);
  const [lotteryTimes] = useState(2);

  if (showLottery) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Icon name="gift" className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">抽奖</h2>
        <p className="text-gray-500 text-center mb-6">
          您还有 {lotteryTimes} 次抽奖机会
        </p>
        <button
          onClick={() => setShowLottery(false)}
          className="px-6 py-2.5 bg-gray-200 text-gray-600 rounded-lg font-medium"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      {/* Top Navigation */}
      <header className="bg-white px-4 py-3 flex items-center border-b border-gray-100 sticky top-0 z-10">
        <button className="mr-3 text-gray-600 hover:text-gray-900">
          <Icon name="chevron-left" className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">
          世界杯助威盛典
        </h1>
      </header>

      {/* Hero Image with Overlay */}
      <div className="relative h-48 bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-700 flex items-center justify-center overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 left-6 w-24 h-24 rounded-full bg-white" />
          <div className="absolute bottom-4 right-8 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
          <div className="text-center">
            <Icon name="clock" className="w-10 h-10 text-yellow-300 mx-auto mb-2" />
            <p className="text-xl font-bold text-white">⏳ 活动结算中...</p>
            <p className="text-sm text-gray-200 mt-1">结果即将揭晓</p>
          </div>
        </div>
      </div>

      {/* Disabled Voting Area */}
      <div className="bg-white mx-4 mt-4 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">🏆 竞猜投票</h2>
          <Icon name="lock" className="w-4 h-4 text-gray-400" />
        </div>

        {/* Disabled search */}
        <div className="relative mb-3 opacity-50">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            type="text"
            placeholder="搜索球队..."
            disabled
            className="w-full bg-gray-50 border border-gray-100 rounded-lg py-2 pl-10 pr-3 text-sm text-gray-400 cursor-not-allowed"
          />
        </div>

        {/* Disabled team cards */}
        <div className="space-y-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 opacity-60"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{team.name}</span>
              </div>
              <span className="text-xs text-gray-400 bg-gray-200 px-3 py-1 rounded-full">
                已截止
              </span>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-3">
          投票已截止，感谢您的参与！
        </p>
      </div>

      {/* Task Cards */}
      <div className="bg-white mx-4 mt-4 rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-3">📋 我的任务</h2>
        <div className="space-y-2">
          {taskItems.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm text-gray-600">{task.label}</span>
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <Icon name="check" className="w-3.5 h-3.5 text-green-600" />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">总助威次数</span>
            <span className="font-semibold text-gray-900">12</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">获得抽奖次数</span>
            <span className="font-semibold text-rose-500">{lotteryTimes}</span>
          </div>
        </div>
      </div>

      {/* Lottery Entry */}
      <div className="bg-white mx-4 mt-4 rounded-2xl p-4 shadow-sm">
        <button
          onClick={() => setShowLottery(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
              <Icon name="gift" className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">抽奖中心</p>
              <p className="text-xs text-gray-400">
                剩余 {lotteryTimes} 次机会
              </p>
            </div>
          </div>
          <Icon name="chevron-right" className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* My Prizes Entry */}
      <div className="bg-white mx-4 mt-4 rounded-2xl p-4 shadow-sm">
        <button className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <Icon name="shield" className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">我的奖品</p>
              <p className="text-xs text-gray-400">查看已获得的奖品</p>
            </div>
          </div>
          <Icon name="chevron-right" className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-200 py-3 px-4 text-center">
        <p className="text-sm text-gray-400 font-medium">
          <Icon name="timer" className="w-4 h-4 inline-block mr-1" />
          活动已结束
        </p>
      </div>
    </div>
  );
}