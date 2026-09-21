'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [isDark, setIsDark] = useState(theme === 'dark')
  return (
    <button
      onClick={() => {
        const next = !isDark
        setIsDark(next)
        setTheme(next ? 'dark' : 'light')
      }}
      className="w-9 h-9 rounded-md border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
