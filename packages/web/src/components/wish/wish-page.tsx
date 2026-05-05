'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Star {
  id: number
  x: number
  y: number
  size: number
  opacity: number
  twinkleSpeed: number
  color: string
}

interface ShootingStar {
  id: number
  startX: number
  startY: number
  endX: number
  endY: number
  duration: number
  delay: number
}

interface WishCard {
  id: number
  x: number
  y: number
  text: string
  createdAt: Date
  color: string
}

const STAR_COLORS = ['#FFFFFF', '#FEFEFE', '#FDE68A', '#BFDBFE', '#DDD6FE']
const CARD_COLORS = ['from-purple-500/20 to-pink-500/20', 'from-cyan-500/20 to-blue-500/20', 'from-amber-500/20 to-orange-500/20', 'from-emerald-500/20 to-teal-500/20']

export function WishPage() {
  const [stars, setStars] = useState<Star[]>([])
  const [shootingStars, setShootingStars] = useState<ShootingStar[]>([])
  const [wishCards, setWishCards] = useState<WishCard[]>([])
  const [showInput, setShowInput] = useState(false)
  const [wishText, setWishText] = useState('')
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // 初始化星星
  useEffect(() => {
    const initialStars: Star[] = Array.from({ length: 150 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 2 + 1,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }))
    setStars(initialStars)
  }, [])

  // 自动生成流星
  useEffect(() => {
    const interval = setInterval(() => {
      const newStar: ShootingStar = {
        id: Date.now(),
        startX: Math.random() * 80,
        startY: Math.random() * 50,
        endX: Math.random() * 100,
        endY: 100 + Math.random() * 20,
        duration: 1 + Math.random() * 2,
        delay: 0,
      }
      setShootingStars((prev) => [...prev.slice(-5), newStar])
    }, 3000 + Math.random() * 2000)

    return () => clearInterval(interval)
  }, [])

  // 清理过期流星
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShootingStars((prev) => prev.slice(-3))
    }, 5000)
    return () => clearTimeout(timeout)
  }, [shootingStars])

  // 鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }, [])

  // 点击创建流星
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (showInput) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100

      const shootingStar: ShootingStar = {
        id: Date.now(),
        startX: x,
        startY: y,
        endX: x + (Math.random() - 0.5) * 60,
        endY: y + 40 + Math.random() * 30,
        duration: 1.5,
        delay: 0,
      }
      setShootingStars((prev) => [...prev.slice(-5), shootingStar])
    },
    [showInput]
  )

  // 添加心愿
  const addWish = () => {
    if (!wishText.trim()) return

    const newWish: WishCard = {
      id: Date.now(),
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      text: wishText,
      createdAt: new Date(),
      color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
    }

    setWishCards((prev) => [...prev, newWish])
    setWishText('')
    setShowInput(false)
  }

  return (
    <div
      className="relative min-h-screen cursor-crosshair overflow-hidden bg-gradient-to-b from-slate-950 via-blue-950 to-slate-950"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {/* 鼠标跟随光效 */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background: `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, rgba(168, 85, 247, 0.12), transparent 40%)`,
        }}
      />

      {/* 星星背景 */}
      <div className="absolute inset-0">
        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              backgroundColor: star.color,
            }}
            animate={{
              opacity: [star.opacity, star.opacity * 0.3, star.opacity],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: star.twinkleSpeed,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* 流星 */}
      <AnimatePresence>
        {shootingStars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute h-0.5 w-24 rounded-full bg-gradient-to-r from-transparent via-white to-purple-400"
            style={{
              left: `${star.startX}%`,
              top: `${star.startY}%`,
            }}
            initial={{ opacity: 0, x: 0, y: 0, rotate: 45 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: `${star.endX - star.startX}vw`,
              y: `${star.endY - star.startY}vh`,
            }}
            transition={{
              duration: star.duration,
              delay: star.delay,
              ease: 'easeOut',
            }}
          />
        ))}
      </AnimatePresence>

      {/* 主内容区 */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-20">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-12 text-center"
        >
          <h1 className="bg-gradient-to-r from-red-400 via-rose-400 to-orange-400 bg-clip-text text-5xl font-bold text-transparent md:text-7xl">
            星空许愿
          </h1>
          <p className="mt-4 text-lg text-slate-400 md:text-xl">
            点击星空，让流星划过天际 ✨
          </p>
        </motion.div>

        {/* 添加心愿按钮 */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation()
            setShowInput(true)
          }}
          className="mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 px-8 py-3 text-lg font-medium text-purple-300 backdrop-blur-sm transition-all hover:border-purple-500/50 hover:bg-purple-500/20 hover:text-purple-200"
        >
          ✨ 许下心愿
        </motion.button>

        {/* 心愿输入框 */}
        <AnimatePresence>
          {showInput && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mx-auto mb-8 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-6 backdrop-blur-xl">
                <textarea
                  value={wishText}
                  onChange={(e) => setWishText(e.target.value)}
                  placeholder="写下你的心愿..."
                  className="h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
                  maxLength={100}
                />
                <div className="mt-3 flex justify-between text-sm text-slate-500">
                  <span>{wishText.length}/100</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowInput(false)}
                      className="rounded-lg px-4 py-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-300"
                    >
                      取消
                    </button>
                    <button
                      onClick={addWish}
                      disabled={!wishText.trim()}
                      className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-2 font-medium text-white transition-all disabled:opacity-50 hover:from-purple-600 hover:to-pink-600"
                    >
                      许愿
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 心愿卡片 */}
        <div className="relative min-h-[400px] w-full max-w-5xl">
          <AnimatePresence>
            {wishCards.map((wish) => (
              <motion.div
                key={wish.id}
                initial={{ opacity: 0, scale: 0.5, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.6, type: 'spring' }}
                className="absolute"
                style={{
                  left: `${wish.x}%`,
                  top: `${wish.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className={`max-w-[220px] cursor-pointer rounded-xl border border-slate-700/50 bg-gradient-to-br ${wish.color} p-4 backdrop-blur-sm`}
                >
                  <p className="text-sm text-white">{wish.text}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {wish.createdAt.toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 提示文字 */}
        {wishCards.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="mt-8 text-center text-slate-500"
          >
            <p className="text-sm">
              点击任意位置，让流星划过夜空 💫
            </p>
          </motion.div>
        )}
      </div>

      {/* 装饰性星云 */}
      <motion.div
        className="pointer-events-none absolute left-10 top-20 h-64 w-64 rounded-full bg-purple-500/5 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-20 right-20 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}
