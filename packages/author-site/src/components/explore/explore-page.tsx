'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  color: string
}

interface FloatingCard {
  id: number
  title: string
  description: string
  icon: string
  gradient: string
  delay: number
}

const COLORS = ['#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#10B981']

const FLOATING_CARDS: FloatingCard[] = [
  {
    id: 1,
    title: '无限可能',
    description: '探索 AI 驱动的创意边界',
    icon: '✦',
    gradient: 'from-purple-500/20 to-cyan-500/20',
    delay: 0,
  },
  {
    id: 2,
    title: '实时协作',
    description: '与智能体无缝配合工作',
    icon: '◈',
    gradient: 'from-cyan-500/20 to-amber-500/20',
    delay: 0.2,
  },
  {
    id: 3,
    title: '即时反馈',
    description: '秒级响应，流畅体验',
    icon: '⬡',
    gradient: 'from-amber-500/20 to-pink-500/20',
    delay: 0.4,
  },
  {
    id: 4,
    title: '智能进化',
    description: '持续学习，不断成长',
    icon: '◉',
    gradient: 'from-pink-500/20 to-emerald-500/20',
    delay: 0.6,
  },
]

export function ExplorePage() {
  const [particles, setParticles] = useState<Particle[]>([])
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const initialParticles: Particle[] = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))
    setParticles(initialParticles)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: (p.x + p.speedX + 100) % 100,
          y: (p.y + p.speedY + 100) % 100,
        }))
      )
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FLOATING_CARDS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950"
      onMouseMove={handleMouseMove}
    >
      {/* 动态渐变背景 */}
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{
          background: [
            'radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 40% 80%, rgba(245, 158, 11, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)',
          ],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />

      {/* 鼠标跟随光效 */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(139, 92, 246, 0.15), transparent 40%)`,
        }}
      />

      {/* 粒子层 */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              opacity: particle.opacity,
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [particle.opacity, particle.opacity + 0.2, particle.opacity],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* 主内容区 */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-20">
        {/* 标题区 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-16 text-center"
        >
          <motion.h1
            className="bg-gradient-to-r from-purple-400 via-cyan-400 to-amber-400 bg-clip-text text-6xl font-bold tracking-tight text-transparent md:text-8xl"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            style={{ backgroundSize: '200% 200%' }}
          >
            探索未来
          </motion.h1>
          <motion.p
            className="mt-4 text-xl text-gray-400 md:text-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            体验 AI 驱动的无限可能
          </motion.p>
        </motion.div>

        {/* 互动卡片网格 */}
        <div className="grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {FLOATING_CARDS.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: card.delay, duration: 0.6 }}
              onHoverStart={() => setHoveredCard(card.id)}
              onHoverEnd={() => setHoveredCard(null)}
              className={`relative cursor-pointer overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br ${card.gradient} p-8 backdrop-blur-sm transition-all duration-300 hover:border-gray-600 hover:shadow-2xl`}
              style={{
                transform: hoveredCard === card.id ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <motion.div
                className="absolute inset-0 opacity-0 transition-opacity duration-300"
                animate={{
                  opacity: hoveredCard === card.id ? 0.1 : 0,
                  background: `radial-gradient(circle at 50% 50%, ${COLORS[index % COLORS.length]}, transparent 70%)`,
                }}
              />

              <div className="relative z-10">
                <motion.div
                  className="mb-4 text-5xl"
                  animate={{
                    rotate: hoveredCard === card.id ? [0, 10, -10, 0] : 0,
                    scale: hoveredCard === card.id ? 1.2 : 1,
                  }}
                  transition={{ duration: 0.5 }}
                >
                  {card.icon}
                </motion.div>
                <h3 className="mb-2 text-2xl font-semibold text-white">
                  {card.title}
                </h3>
                <p className="text-gray-400">{card.description}</p>

                <motion.div
                  className="mt-6 flex items-center gap-2 text-sm font-medium"
                  animate={{
                    x: hoveredCard === card.id ? [0, 5, 0] : 0,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="text-cyan-400">了解更多</span>
                  <motion.span
                    animate={{
                      x: hoveredCard === card.id ? [0, 5, 0] : 0,
                    }}
                    transition={{ duration: 0.5, repeat: hoveredCard === card.id ? Infinity : 0 }}
                  >
                    →
                  </motion.span>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 底部互动指示器 */}
        <motion.div
          className="mt-16 flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {FLOATING_CARDS.map((_, index) => (
            <motion.button
              key={index}
              className="h-2 w-2 rounded-full"
              animate={{
                backgroundColor: activeIndex === index ? '#8B5CF6' : '#374151',
                scale: activeIndex === index ? 1.5 : 1,
              }}
              onClick={() => setActiveIndex(index)}
              whileHover={{ scale: 1.3 }}
            />
          ))}
        </motion.div>

        {/* 滚动提示 */}
        <motion.div
          className="mt-12 text-gray-500"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <p className="text-sm">探索更多 ↓</p>
        </motion.div>
      </div>

      {/* 装饰性几何图形 */}
      <motion.div
        className="pointer-events-none absolute left-10 top-20 h-32 w-32 rounded-full border border-purple-500/20"
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-20 right-20 h-48 w-48 rounded-full border border-cyan-500/10"
        animate={{
          rotate: -360,
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}
