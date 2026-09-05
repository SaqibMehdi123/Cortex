'use client'

// Lightweight canvas-free confetti burst (respects prefers-reduced-motion)

const COLORS = ['#6366F1', '#14B8A6', '#F59E0B', '#22C55E', '#F472B6', '#818CF8']

export function fireConfetti(count = 80) {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const pieces: HTMLDivElement[] = []
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.className = 'confetti-piece'
    const left = Math.random() * 100
    const dur = 1.8 + Math.random() * 1.6
    const delay = Math.random() * 0.25
    el.style.left = `${left}vw`
    el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
    el.style.setProperty('--cx', `${(Math.random() - 0.5) * 30}vw`)
    el.style.setProperty('--crot', `${(Math.random() - 0.5) * 1080}deg`)
    el.style.setProperty('--cdur', `${dur}s`)
    el.style.animationDelay = `${delay}s`
    el.style.opacity = '0.9'
    document.body.appendChild(el)
    pieces.push(el)
  }
  window.setTimeout(() => {
    for (const el of pieces) el.remove()
  }, 4000)
}
