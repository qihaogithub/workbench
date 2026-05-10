import React, { useState, useEffect, useRef } from "react";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Thermometer,
  Heart,
  Coffee,
} from "lucide-react";

interface WeatherMoodProps {
  city?: string;
  unit?: "celsius" | "fahrenheit";
  showMood?: boolean;
  animationSpeed?: "slow" | "medium" | "fast";
  defaultWeather?: "sunny" | "cloudy" | "rainy" | "snowy" | "stormy";
}

type WeatherType = "sunny" | "cloudy" | "rainy" | "snowy" | "stormy";

interface WeatherConfig {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  emoji: string;
  tempRange: [number, number];
  moodTip: string;
  activity: string;
}

const weatherMap: Record<WeatherType, WeatherConfig> = {
  sunny: {
    label: "☀️ 晴空万里",
    icon: <Sun className="w-16 h-16 text-yellow-300" />,
    gradient: "from-yellow-400 via-orange-300 to-rose-300",
    emoji: "😎",
    tempRange: [28, 38],
    moodTip: "阳光正好，出门走走心情会更好哦！",
    activity: "去公园散步 / 喝杯冰咖啡",
  },
  cloudy: {
    label: "☁️ 多云转阴",
    icon: <Cloud className="w-16 h-16 text-gray-300" />,
    gradient: "from-gray-400 via-slate-300 to-blue-200",
    emoji: "😊",
    tempRange: [18, 25],
    moodTip: "温柔的一天，适合窝在沙发里看书。",
    activity: "泡杯热茶 / 看一部电影",
  },
  rainy: {
    label: "🌧️ 细雨绵绵",
    icon: <CloudRain className="w-16 h-16 text-blue-300" />,
    gradient: "from-blue-500 via-indigo-400 to-purple-300",
    emoji: "🥺",
    tempRange: [12, 20],
    moodTip: "雨声是最好的白噪音，放松一下吧。",
    activity: "听雨声写日记 / 煮一碗热汤",
  },
  snowy: {
    label: "❄️ 雪花飘飘",
    icon: <CloudSnow className="w-16 h-16 text-white" />,
    gradient: "from-cyan-300 via-blue-200 to-white",
    emoji: "🥶",
    tempRange: [-5, 5],
    moodTip: "冬天的浪漫，是雪和热气腾腾的火锅！",
    activity: "吃火锅 / 堆雪人 ☃️",
  },
  stormy: {
    label: "⚡ 雷雨交加",
    icon: <CloudLightning className="w-16 h-16 text-yellow-200" />,
    gradient: "from-gray-700 via-purple-800 to-indigo-900",
    emoji: "😱",
    tempRange: [8, 15],
    moodTip: "宅在家里最安全，来点刺激的冒险吧！",
    activity: "玩恐怖游戏 / 看悬疑电影",
  },
};

const weatherList: WeatherType[] = ["sunny", "cloudy", "rainy", "snowy", "stormy"];

// Inject keyframes once
function useWeatherKeyframes() {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes particleFall {
        0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

function AnimatedParticles({ weather }: { weather: WeatherType }) {
  const count = weather === "stormy" ? 20 : weather === "rainy" ? 15 : weather === "snowy" ? 25 : 0;
  const isSnow = weather === "snowy";
  const isRain = weather === "rainy" || weather === "stormy";

  useWeatherKeyframes();

  if (count === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 20}%`,
            animation: `particleFall ${1.5 + Math.random() * 2}s linear infinite`,
            animationDelay: `${Math.random() * 2}s`,
            opacity: 0.6 + Math.random() * 0.4,
          }}
        >
          {isSnow ? (
            <div className="w-2 h-2 bg-white rounded-full" />
          ) : (
            <div
              className="w-0.5 h-4 rounded-full"
              style={{
                background: isRain
                  ? "linear-gradient(to bottom, transparent, #60a5fa)"
                  : "linear-gradient(to bottom, transparent, #fbbf24)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function WeatherMoodWidget(props: Record<string, unknown>) {
  const {
    city = "北京",
    unit = "celsius",
    showMood = true,
    animationSpeed = "medium",
    defaultWeather = "sunny",
  } = props as WeatherMoodProps;

  const [currentWeather, setCurrentWeather] = useState<WeatherType>(defaultWeather);
  const [temp, setTemp] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const speedMap = { slow: 4000, medium: 2500, fast: 1200 };

  useEffect(() => {
    const range = weatherMap[currentWeather].tempRange;
    const randomTemp = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    setTemp(randomTemp);
  }, [currentWeather]);

  const handleWeatherChange = (w: WeatherType) => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentWeather(w);
      setIsAnimating(false);
    }, 300);
  };

  const weather = weatherMap[currentWeather];
  const displayTemp = unit === "celsius" ? `${temp}°C` : `${Math.round(temp * 1.8 + 32)}°F`;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Main Card */}
      <div
        className={`relative w-full max-w-md rounded-3xl overflow-hidden bg-gradient-to-br ${weather.gradient} shadow-2xl transition-all duration-500 ${
          isAnimating ? "scale-95 opacity-80" : "scale-100 opacity-100"
        }`}
      >
        {/* Background Particles */}
        <AnimatedParticles weather={currentWeather} />

        {/* Content */}
        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white/90">{city}</h2>
              <p className="text-sm text-white/70">{weather.label}</p>
            </div>
            <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
              <Wind className="w-4 h-4 text-white" />
              <span className="text-xs text-white">
                {Math.floor(Math.random() * 20 + 5)} km/h
              </span>
            </div>
          </div>

          {/* Weather Icon & Temperature */}
          <div className="flex items-center justify-center gap-4 my-8">
            <div className="animate-bounce" style={{ animationDuration: `${speedMap[animationSpeed]}ms` }}>
              {weather.icon}
            </div>
            <div className="text-right">
              <div className="text-6xl font-bold text-white drop-shadow-lg">
                {displayTemp}
              </div>
              <div className="text-sm text-white/70 flex items-center gap-1 mt-1">
                <Thermometer className="w-3 h-3" />
                体感温度 {unit === "celsius" ? `${temp - 2}°C` : `${Math.round((temp - 2) * 1.8 + 32)}°F`}
              </div>
            </div>
          </div>

          {/* Mood Tip */}
          {showMood && (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="w-5 h-5 text-red-200" />
                <span className="text-sm font-medium text-white">今日心情小贴士</span>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">{weather.moodTip}</p>
              <div className="flex items-center gap-2 mt-3 text-xs text-white/70">
                <Coffee className="w-3 h-3" />
                <span>推荐活动：{weather.activity}</span>
              </div>
            </div>
          )}

          {/* Weather Selector */}
          <div>
            <p className="text-xs text-white/60 mb-3 font-medium uppercase tracking-wider">
              切换天气心情
            </p>
            <div className="grid grid-cols-5 gap-2">
              {weatherList.map((w) => {
                const isActive = w === currentWeather;
                const wConfig = weatherMap[w];
                return (
                  <button
                    key={w}
                    onClick={() => handleWeatherChange(w)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-white/30 shadow-lg scale-110"
                        : "bg-white/10 hover:bg-white/20 hover:scale-105"
                    }`}
                  >
                    <span className="text-lg">{wConfig.emoji}</span>
                    <span className={`text-[10px] ${isActive ? "text-white font-semibold" : "text-white/60"}`}>
                      {w === "sunny" ? "晴" : w === "cloudy" ? "云" : w === "rainy" ? "雨" : w === "snowy" ? "雪" : "雷"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom decorative strip */}
        <div className="relative z-10 h-2 bg-gradient-to-r from-white/20 via-white/40 to-white/20" />
      </div>

      {/* Floating decoration */}
      <div className="hidden md:block fixed bottom-8 right-8 text-white/20 text-xs">
        🌤️ 点击天气图标切换心情
      </div>
    </div>
  );
}