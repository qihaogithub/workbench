interface DemoProps {
  title: string;
  subtitle?: string;
  accentColor: string;
  glowColor: string;
  showParticles: boolean;
}

export default function CyberpunkShowcase({
  title = "星核",
  subtitle = "超越边界的数字体验",
  accentColor = "#00F0FF",
  glowColor = "#FF00FF",
  showParticles = true,
}: DemoProps) {
  return (
    <div className="w-[375px] h-[812px] relative overflow-hidden bg-[#0a0a0f] select-none">
      {/* ===== 底层背景 ===== */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d1a] to-[#0a0a0f]" />

      {/* ===== 透视网格 ===== */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(${accentColor}22 1px, transparent 1px),
            linear-gradient(90deg, ${accentColor}22 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          transform: "perspective(300px) rotateX(8deg)",
          transformOrigin: "center bottom",
          maskImage: "linear-gradient(to top, transparent, black 30%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to top, transparent, black 30%, black 70%, transparent)",
        }}
      />

      {/* ===== 径向光晕1 ===== */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full -top-32 -left-24 blur-[120px] opacity-20"
        style={{ backgroundColor: accentColor }}
      />
      {/* 径向光晕2 */}
      <div
        className="absolute w-[350px] h-[350px] rounded-full bottom-20 -right-20 blur-[100px] opacity-15"
        style={{ backgroundColor: glowColor }}
      />

      {/* ===== 浮动粒子 ===== */}
      {showParticles && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${Math.random() * 3 + 1}px`,
                height: `${Math.random() * 3 + 1}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: i % 3 === 0 ? accentColor : i % 3 === 1 ? glowColor : "#ffffff",
                opacity: Math.random() * 0.6 + 0.2,
                animation: `particleFloat${i % 3} ${Math.random() * 6 + 4}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ===== 扫描线叠加 ===== */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* ===== 顶部状态栏 ===== */}
      <div className="absolute top-0 left-0 right-0 z-20 px-6 pt-[52px] flex justify-between items-center">
        <span className="text-white/40 text-xs font-mono tracking-widest">09:41</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-[2px]">
            <div className="w-[3px] h-3 rounded-sm" style={{ backgroundColor: accentColor }} />
            <div className="w-[3px] h-2.5 rounded-sm" style={{ backgroundColor: accentColor, opacity: 0.5 }} />
            <div className="w-[3px] h-2 rounded-sm" style={{ backgroundColor: accentColor, opacity: 0.3 }} />
          </div>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <rect x="0.5" y="0.5" width="17" height="11" rx="2" stroke={accentColor} strokeOpacity="0.4" strokeWidth="0.8" />
            <rect x="2" y="2" width="10" height="8" rx="1" fill={accentColor} fillOpacity="0.4" />
          </svg>
        </div>
      </div>

      {/* ===== 内容区域 ===== */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8">
        {/* 顶部小标签 */}
        <div
          className="mb-6 px-3 py-1 rounded-full border text-[10px] font-mono tracking-[0.2em] uppercase"
          style={{
            borderColor: `${accentColor}44`,
            color: accentColor,
            backgroundColor: `${accentColor}11`,
            textShadow: `0 0 8px ${accentColor}66`,
          }}
        >
          System Online
        </div>

        {/* 主标题 */}
        <h1
          className="text-[36px] font-bold tracking-[0.15em] text-center leading-none"
          style={{
            color: "#fff",
          }}
        >
          {title}
        </h1>

        {/* 装饰分割线 */}
        <div className="flex items-center gap-3 my-5">
          <div className="w-8 h-[1px]" style={{ backgroundColor: `${accentColor}66` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
          <div className="w-8 h-[1px]" style={{ backgroundColor: `${accentColor}66` }} />
        </div>

        {/* 副标题 */}
        {subtitle && (
          <p
            className="text-sm font-light tracking-[0.3em] text-center"
            style={{
              color: "#ffffffcc",
              textShadow: `0 0 12px ${accentColor}44`,
            }}
          >
            {subtitle}
          </p>
        )}

        {/* 毛玻璃卡片 */}
        <div
          className="mt-10 w-full max-w-[280px] p-5 rounded-xl backdrop-blur-xl border relative overflow-hidden group"
          style={{
            borderColor: `${accentColor}33`,
            backgroundColor: `${accentColor}08`,
          }}
        >
          {/* 卡片顶部发光条 */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px] opacity-60"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}, ${glowColor}, transparent)`,
            }}
          />

          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
            />
            <span
              className="text-[11px] font-mono tracking-widest uppercase"
              style={{ color: `${accentColor}cc` }}
            >
              Live Status
            </span>
          </div>

          {/* 数据条 1 */}
          <div className="mb-2.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/50 font-mono">SYNC</span>
              <span className="font-mono" style={{ color: accentColor }}>98.7%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: "98.7%",
                  backgroundColor: accentColor,
                  boxShadow: `0 0 8px ${accentColor}`,
                }}
              />
            </div>
          </div>

          {/* 数据条 2 */}
          <div className="mb-2.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/50 font-mono">SIGNAL</span>
              <span className="font-mono" style={{ color: glowColor }}>87.3%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: "87.3%",
                  backgroundColor: glowColor,
                  boxShadow: `0 0 8px ${glowColor}`,
                }}
              />
            </div>
          </div>

          {/* 数据条 3 */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/50 font-mono">POWER</span>
              <span className="text-white/60 font-mono">100%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: "100%",
                  background: `linear-gradient(90deg, ${accentColor}, ${glowColor})`,
                  boxShadow: `0 0 8px ${accentColor}88`,
                }}
              />
            </div>
          </div>
        </div>

        {/* 霓虹按钮 - 进入系统（增强版） */}
        <div className="mt-8 relative" style={{ animation: "btnContainerPulse 2s ease-in-out infinite" }}>
          {/* 按钮外发光 */}
          <div
            className="absolute inset-0 rounded-sm blur-xl opacity-70"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${glowColor})`,
              animation: "glowPulse 2s ease-in-out infinite",
            }}
          />
          {/* 按钮外边框光晕 */}
          <div
            className="absolute -inset-[2px] rounded-sm opacity-60"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${glowColor}, ${accentColor})`,
              backgroundSize: "200% 200%",
              animation: "borderRotate 3s linear infinite",
            }}
          />
          <button
            className="relative px-12 py-4 rounded-sm overflow-hidden group transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "15px",
              letterSpacing: "0.3em",
              background: `linear-gradient(135deg, ${accentColor}dd, ${glowColor}dd)`,
              textShadow: `0 0 12px ${accentColor}, 0 0 30px ${glowColor}66`,
              boxShadow: `0 0 30px ${accentColor}44, inset 0 0 20px rgba(255,255,255,0.15)`,
            }}
          >
            {/* 按钮背景扫光 */}
            <div
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
              }}
            />
            {/* 按钮闪烁高光 */}
            <div
              className="absolute top-0 left-[10%] right-[10%] h-[1px] opacity-60 group-hover:opacity-100 transition-opacity"
              style={{
                background: `linear-gradient(90deg, transparent, #fff, transparent)`,
              }}
            />
            <span className="relative z-10 font-mono tracking-[0.3em] uppercase">
              进入系统
            </span>
          </button>
        </div>
      </div>

      {/* ===== 底部装饰线 ===== */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${accentColor}11, transparent)`,
        }}
      >
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1"
        >
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full"
              style={{
                height: `${Math.sin(i * 0.6) * 8 + 10}px`,
                backgroundColor: i % 2 === 0 ? `${accentColor}55` : `${glowColor}44`,
                animation: `barPulse${i % 3} 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ===== 全局动画样式 ===== */}
      <style>{`
        ${showParticles
          ? [...Array(3)]
              .map(
                (_, j) => `
            @keyframes particleFloat${j} {
              0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.2; }
              25% { transform: translateY(-30px) translateX(10px); opacity: 0.8; }
              50% { transform: translateY(-60px) translateX(-5px); opacity: 0.4; }
              75% { transform: translateY(-30px) translateX(15px); opacity: 0.7; }
            }
          `
              )
              .join("")
          : ""}
        @keyframes barPulse0 {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        @keyframes barPulse1 {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.2; }
        }
        @keyframes barPulse2 {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes btnContainerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        @keyframes borderRotate {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}