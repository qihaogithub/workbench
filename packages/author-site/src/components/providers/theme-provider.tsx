'use client'

import * as React from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
}

const ThemeContext = React.createContext<{ theme: 'dark' }>({
  theme: 'dark',
})

export function ThemeProvider({ children }: ThemeProviderProps) {
  React.useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light')
    root.classList.add('dark')
  }, [])

  const value = React.useMemo(() => ({ theme: 'dark' as const }), [])

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = React.useContext(ThemeContext)

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
