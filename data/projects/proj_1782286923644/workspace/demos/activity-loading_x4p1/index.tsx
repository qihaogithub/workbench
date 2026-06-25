import { Circle } from "lucide-react";
import { useState, useEffect } from "react";

interface DemoProps {}

const loadingTips = [
  "正在准备精彩内容…",
  "加载球队数据…",
  "即将呈现…",
];

export default function Demo(_props: DemoProps) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    // 进度条动画：3秒内从 0 到 100
    const startTime = Date.now();
    const duration = 3000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(Math.round((elapsed / duration) * 100), 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 动态切换提示文字
    const tipTimer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % loadingTips.length);
    }, 1200);

    return () => clearInterval(tipTimer);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-emerald-900 flex flex-col items-center justify-center px-8">
      {/* 旋转足球动画 */}
      <div className="relative mb-12">
        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center animate-spin-slow">
          <Circle className="w-14 h-14 text-white/90" />
        </div>
        {/* 足球花纹装饰 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 bg-emerald-500/30 rounded-full" />
        </div>
      </div>

      {/* 加载进度条 */}
      <div className="w-64 max-w-full mb-4">
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-green-300 rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-emerald-200/70 text-xs text-right mt-1 font-mono">
          {progress}%
        </p>
      </div>

      {/* 动态提示文字 */}
      <p
        key={tipIndex}
        className="text-emerald-200/90 text-sm animate-fade-in"
      >
        {loadingTips[tipIndex]}
      </p>

      {/* 底部版本信息 */}
      <p className="absolute bottom-8 text-white/20 text-xs">
        v2.1.0 · 叫叫活动引擎
      </p>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 2s linear infinite;
        }

        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}