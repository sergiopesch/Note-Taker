'use client'

import { useState, useEffect } from 'react'
import { Sun, Moon, Sparkles } from 'lucide-react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showSparkle, setShowSparkle] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = stored === 'dark' || (!stored && prefersDark)
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')

    // Trigger sparkle burst on toggle
    setShowSparkle(true)
    setTimeout(() => setShowSparkle(false), 600)
  }

  // Prevent hydration mismatch flash
  if (!mounted) {
    return (
      <button className="relative w-14 h-7 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden />
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn relative group w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-visible"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #1a1a2e, #16213e)'
          : 'linear-gradient(135deg, #87CEEB, #FFD700)',
      }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Track decorations - stars in dark mode, clouds in light mode */}
      {isDark ? (
        <>
          <span className="absolute top-1 left-2 w-1 h-1 bg-white rounded-full" style={{ animation: 'stars-twinkle 1.5s ease-in-out infinite' }} />
          <span className="absolute top-3 left-5 w-0.5 h-0.5 bg-white rounded-full" style={{ animation: 'stars-twinkle 2s ease-in-out infinite 0.3s' }} />
          <span className="absolute bottom-1.5 left-3 w-0.5 h-0.5 bg-white rounded-full" style={{ animation: 'stars-twinkle 1.8s ease-in-out infinite 0.7s' }} />
        </>
      ) : (
        <>
          <span className="absolute top-1 right-2 w-2 h-1.5 bg-white/40 rounded-full" />
          <span className="absolute bottom-1 right-4 w-1.5 h-1 bg-white/30 rounded-full" />
        </>
      )}

      {/* Sliding knob with icon */}
      <span
        className={`absolute top-0.5 flex items-center justify-center w-6 h-6 rounded-full shadow-md transition-all duration-300 ${
          isDark
            ? 'translate-x-7 bg-indigo-900'
            : 'translate-x-0.5 bg-yellow-300'
        }`}
      >
        {isDark ? (
          <Moon className="theme-toggle-icon w-3.5 h-3.5 text-yellow-200" />
        ) : (
          <Sun className="theme-toggle-icon w-3.5 h-3.5 text-orange-500" />
        )}
      </span>

      {/* Sparkle burst on toggle */}
      {showSparkle && (
        <span className="absolute -top-1 -right-1 pointer-events-none">
          <Sparkles className="w-4 h-4 text-yellow-400 animate-ping" />
        </span>
      )}
    </button>
  )
}
