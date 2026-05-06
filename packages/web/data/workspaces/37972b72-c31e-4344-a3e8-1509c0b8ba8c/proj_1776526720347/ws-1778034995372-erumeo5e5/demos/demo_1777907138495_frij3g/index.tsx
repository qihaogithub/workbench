import React from 'react';

interface DemoProps {
  title: string;
  subtitle: string;
}

interface CardItem {
  emoji: string;
  title: string;
  desc: string;
  gradient: string;
  shadow: string;
}

const cards: CardItem[] = [
  {
    emoji: '✨',
    title: '灵感火花',
    desc: '每一个创意都从微小的火花开始',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    shadow: 'rgba(245, 87, 108, 0.3)',
  },
  {
    emoji: '🎨',
    title: '色彩世界',
    desc: '用色彩讲述属于你的故事',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    shadow: 'rgba(79, 172, 254, 0.3)',
  },
  {
    emoji: '🎵',
    title: '旋律流动',
    desc: '让节奏引领创作的脚步',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    shadow: 'rgba(250, 112, 154, 0.3)',
  },
  {
    emoji: '☁️',
    title: '云端漫步',
    desc: '在想象的天空中自由飞翔',
    gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    shadow: 'rgba(161, 140, 209, 0.3)',
  },
  {
    emoji: '⭐',
    title: '星辰大海',
    desc: '探索未知的无限可能',
    gradient: 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    shadow: 'rgba(213, 126, 235, 0.3)',
  },
  {
    emoji: '💖',
    title: '心动时刻',
    desc: '记录每一个值得铭记的瞬间',
    gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    shadow: 'rgba(252, 182, 159, 0.4)',
  },
  {
    emoji: '🪶',
    title: '轻盈如羽',
    desc: '放空思绪，感受当下的宁静',
    gradient: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
    shadow: 'rgba(102, 166, 255, 0.3)',
  },
  {
    emoji: '💎',
    title: '璀璨珍宝',
    desc: '发现生活中隐藏的美好',
    gradient: 'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)',
    shadow: 'rgba(196, 113, 245, 0.3)',
  },
  {
    emoji: '🧭',
    title: '探索之旅',
    desc: '每一步都是新的发现',
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    shadow: 'rgba(67, 233, 123, 0.3)',
  },
];

const floatingDots = [
  { x: '10%', y: '15%', color: 'bg-pink-300', delay: '0s', size: 3 },
  { x: '85%', y: '20%', color: 'bg-purple-300', delay: '1.5s', size: 2 },
  { x: '20%', y: '70%', color: 'bg-orange-300', delay: '0.8s', size: 4 },
  { x: '75%', y: '75%', color: 'bg-blue-300', delay: '2.2s', size: 2.5 },
  { x: '50%', y: '10%', color: 'bg-green-300', delay: '1s', size: 3.5 },
  { x: '90%', y: '50%', color: 'bg-yellow-300', delay: '0.3s', size: 2 },
  { x: '5%', y: '45%', color: 'bg-indigo-300', delay: '1.8s', size: 3 },
  { x: '45%', y: '88%', color: 'bg-rose-300', delay: '0.5s', size: 2.5 },
];

export default function Demo({ title, subtitle }: DemoProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-purple-50/50 to-pink-50">
      {/* 浮动装饰圆点 */}
      {floatingDots.map((dot, i) => (
        <div
          key={i}
          className={`absolute rounded-full ${dot.color} opacity-40`}
          style={{
            width: `${dot.size * 4}px`,
            height: `${dot.size * 4}px`,
            left: dot.x,
            top: dot.y,
            animation: `pulse 3s ${dot.delay} infinite`,
          }}
        />
      ))}

      {/* 内容区域 */}
      <div className="relative z-10 px-6 py-10 sm:px-8 sm:py-14">
        {/* 头部 */}
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-white/50 mb-5">
            <span className="text-purple-500 text-sm">✦</span>
            <span className="text-sm text-purple-600 font-medium tracking-wide">
              灵感画廊
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight">
            <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* 卡片网格 */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {cards.map((card, i) => (
            <div
              key={i}
              className="group relative rounded-2xl p-6 sm:p-7 cursor-pointer
                transition-all duration-300 ease-out
                hover:-translate-y-2 hover:shadow-2xl
                active:scale-[0.98]"
              style={{
                background: card.gradient,
                boxShadow: `0 8px 32px ${card.shadow}`,
              }}
            >
              {/* 装饰光晕 */}
              <div
                className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 blur-xl
                  transition-all duration-500 group-hover:scale-150 group-hover:opacity-80"
              />

              {/* Emoji 图标 */}
              <div
                className="relative w-12 h-12 rounded-xl bg-white/25 backdrop-blur-sm
                  flex items-center justify-center mb-4 text-2xl
                  transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              >
                {card.emoji}
              </div>

              {/* 标题 */}
              <h3 className="relative text-lg font-bold text-white mb-2">{card.title}</h3>

              {/* 描述 */}
              <p className="relative text-sm text-white/80 leading-relaxed">{card.desc}</p>

              {/* 底部装饰线 */}
              <div
                className="relative mt-4 h-0.5 rounded-full bg-white/30
                  transition-all duration-500 group-hover:w-full"
                style={{ width: 0 }}
              />
            </div>
          ))}
        </div>

        {/* 底部信息 */}
        <div className="text-center mt-12">
          <p className="text-sm text-gray-300 flex items-center justify-center gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-gray-300" />
            悬停卡片查看效果
            <span className="inline-block w-1 h-1 rounded-full bg-gray-300" />
          </p>
        </div>
      </div>

      {/* 行内动画样式 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
