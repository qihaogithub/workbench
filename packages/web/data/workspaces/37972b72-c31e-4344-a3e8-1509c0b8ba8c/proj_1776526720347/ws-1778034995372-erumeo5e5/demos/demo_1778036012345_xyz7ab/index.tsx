import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Stars, MousePointer2, Activity } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

interface StarFieldProps {
  particleCount?: number;
  particleSpeed?: number;
  connectionDistance?: number;
  primaryColor?: string;
  glowIntensity?: number;
}

const StarField: React.FC<StarFieldProps> = ({
  particleCount = 160,
  particleSpeed = 0.3,
  connectionDistance = 130,
  primaryColor = '#8B5CF6',
  glowIntensity = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const [stats, setStats] = useState({ connections: 0, stars: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const initParticles = useCallback((w: number, h: number) => {
    const count = Math.min(particleCount, 300);
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * particleSpeed,
        vy: (Math.random() - 0.5) * particleSpeed,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        hue: Math.random() * 60 + 220,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
      });
    }
    particlesRef.current = particles;
    setStats(prev => ({ ...prev, stars: particles.length }));
  }, [particleCount, particleSpeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (particlesRef.current.length === 0) {
        initParticles(canvas.clientWidth, canvas.clientHeight);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setIsHovering(true);
    };
    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
      setIsHovering(false);
    };
    canvas.addEventListener('mousemove', handleMouse);
    canvas.addEventListener('mouseleave', handleLeave);

    const animate = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Clear with trail effect
      ctx.fillStyle = 'rgba(5, 2, 20, 0.15)';
      ctx.fillRect(0, 0, w, h);

      let connectionCount = 0;

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150 * 0.5;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Draw star
        const pulseOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse));
        const glowRadius = p.size * (2 + glowIntensity * 1.5);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${pulseOpacity})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 80%, 50%, ${pulseOpacity * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 80%, 50%, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw center dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${pulseOpacity})`;
        ctx.fill();

        // Connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx2 = p.x - p2.x;
          const dy2 = p.y - p2.y;
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

          if (dist2 < connectionDistance) {
            connectionCount++;
            const alpha = (1 - dist2 / connectionDistance) * 0.4;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(${(p.hue + p2.hue) / 2}, 70%, 60%, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      setStats(prev => ({ ...prev, connections: connectionCount }));

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouse);
      canvas.removeEventListener('mouseleave', handleLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles, connectionDistance, glowIntensity]);

  // Re-init on prop change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && canvas.clientWidth > 0) {
      initParticles(canvas.clientWidth, canvas.clientHeight);
    }
  }, [particleCount, particleSpeed, initParticles]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl">
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #050214 0%, #0a0a2e 30%, #1a0a3e 60%, #0d0d2b 100%)',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {/* Top-left decorative gradient orb */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${primaryColor}88 0%, transparent 70%)` }}
      />

      {/* Bottom-right decorative gradient orb */}
      <div
        className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f188 0%, transparent 70%)' }}
      />

      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center select-none">
          <h1
            className="text-5xl md:text-7xl font-bold tracking-tight mb-3"
            style={{
              background: 'linear-gradient(135deg, #c4b5fd, #818cf8, #a78bfa, #e879f9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 80px rgba(139, 92, 246, 0.3)',
            }}
          >
            星 河 漫 步
          </h1>
          <p className="text-white/40 text-sm md:text-base tracking-[0.3em] uppercase">
            移动鼠标 · 扰动星辰
          </p>
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-6 pointer-events-none">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
          <Sparkles className="w-3.5 h-3.5 text-violet-300" />
          <span className="text-xs text-white/60">
            <span className="text-violet-200 font-medium">{stats.stars}</span> 颗星辰
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
          <Activity className="w-3.5 h-3.5 text-indigo-300" />
          <span className="text-xs text-white/60">
            <span className="text-indigo-200 font-medium">{stats.connections}</span> 条星轨
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
          <MousePointer2 className={`w-3.5 h-3.5 ${isHovering ? 'text-amber-300' : 'text-white/30'}`} />
          <span className="text-xs text-white/60">
            {isHovering ? '扰动中...' : '悬停交互'}
          </span>
        </div>
      </div>

      {/* Top-left brand */}
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Stars className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-white/40 tracking-wider">PARTICLE UNIVERSE</span>
      </div>
    </div>
  );
};

export default StarField;
