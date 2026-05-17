import React from 'react';

interface Props {
  title?: string;
  subtitle?: string;
  cardCount?: number;
  enableAnimation?: boolean;
  brandName?: string;
  primaryColor?: string;
  darkMode?: boolean;
}

const gradients = [
  'from-pink-500 via-purple-500 to-indigo-500',
  'from-cyan-500 via-blue-500 to-indigo-500',
  'from-green-400 via-cyan-500 to-blue-500',
  'from-orange-500 via-amber-500 to-yellow-500',
  'from-rose-500 via-pink-500 to-fuchsia-500',
  'from-violet-500 via-purple-500 to-pink-500',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-red-500 via-orange-500 to-amber-500',
  'from-lime-400 via-green-500 to-emerald-500',
  'from-fuchsia-500 via-pink-500 to-rose-500',
  'from-blue-500 via-indigo-500 to-purple-500',
  'from-amber-400 via-orange-500 to-red-500',
];

const icons = ['🎨', '🌈', '✨', '🎭', '🎪', '🎢', '🎡', '🎠', '💫', '🌟', '⭐', '🎆'];

const cardTitles = [
  '梦幻渐变', '极光之夜', '海洋之心', '日落黄昏',
  '玫瑰之恋', '紫罗兰梦', '翡翠森林', '火焰激情',
  '柠檬清新', '粉红泡泡', '深蓝星空', '琥珀时光'
];

const cardDescriptions = [
  '柔和的颜色过渡，如梦似幻',
  '北极光的绚丽色彩在夜空中舞动',
  '深邃的蓝色，如同大海的怀抱',
  '温暖的橙红色，像夕阳西下',
  '浪漫的粉色系，充满少女心',
  '神秘的紫色，优雅而高贵',
  '清新的绿色，带来自然的气息',
  '热烈的红色，点燃内心的激情',
  '明亮的黄色，充满生机与活力',
  '甜美的粉色，温柔而可爱',
  '深邃的蓝色，宁静而神秘',
  '温暖的琥珀色，复古而优雅'
];

const Card: React.FC<{
  gradient: string;
  icon: string;
  cardTitle: string;
  description: string;
  index: number;
  enableAnimation: boolean;
}> = ({ gradient, icon, cardTitle, description, index, enableAnimation }) => {
  return (
    <div
      className={`
        group relative overflow-hidden rounded-2xl p-6
        bg-gradient-to-br ${gradient}
        transform transition-all duration-500
        ${enableAnimation ? 'hover:scale-105 hover:rotate-1 hover:shadow-2xl' : ''}
        cursor-pointer
      `}
      style={{
        animationDelay: `${index * 100}ms`,
      }}
    >
      {/* 背景光效 */}
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* 图标 */}
      <div className="text-5xl mb-4 transform group-hover:scale-125 transition-transform duration-300">
        {icon}
      </div>
      
      {/* 标题 */}
      <h3 className="text-xl font-bold text-white mb-2 drop-shadow-md">
        {cardTitle}
      </h3>
      
      {/* 描述 */}
      <p className="text-white/90 text-sm leading-relaxed">
        {description}
      </p>
      
      {/* 装饰圆点 */}
      <div className="absolute top-4 right-4 w-16 h-16 rounded-full bg-white/20 blur-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-white/20 blur-lg" />
    </div>
  );
};

const GradientCardsPage: React.FC<Props> = ({
  title = '✨ 炫彩世界',
  subtitle = '探索色彩的无限可能',
  cardCount = 6,
  enableAnimation = true,
  brandName = 'OpenCode',
  primaryColor = '#8b5cf6',
  darkMode = true,
}) => {
  const displayCount = Math.min(Math.max(cardCount, 3), 12);
  
  return (
    <div className={`min-h-screen p-8 ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* 页面标题区域 */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent mb-4" style={{ backgroundImage: `linear-gradient(to right, ${primaryColor}, #ec4899, #f43f5e)` }}>
          {title}
        </h1>
        <p className={`text-xl max-w-2xl mx-auto ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {subtitle}
        </p>
        <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Powered by {brandName}
        </p>
      </div>
      
      {/* 卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {Array.from({ length: displayCount }, (_, i) => (
          <Card
            key={i}
            gradient={gradients[i]}
            icon={icons[i]}
            cardTitle={cardTitles[i]}
            description={cardDescriptions[i]}
            index={i}
            enableAnimation={enableAnimation}
          />
        ))}
      </div>
      
      {/* 底部装饰 */}
      <div className="mt-16 text-center">
        <div className="inline-flex gap-2">
          {gradients.slice(0, 6).map((grad, i) => (
            <div
              key={i}
              className={`w-8 h-2 rounded-full bg-gradient-to-r ${grad}`}
            />
          ))}
        </div>
        <p className={`text-sm mt-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
          悬停卡片查看动画效果 ✨
        </p>
      </div>
    </div>
  );
};

export default GradientCardsPage;
