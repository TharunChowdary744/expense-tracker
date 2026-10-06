import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { useAppSelector } from '@/app/hooks'
import { dark, light, type Palette } from './colors'

interface Theme {
  colors: Palette
  dark: boolean
}

const ThemeContext = createContext<Theme>({ colors: light, dark: false })

/** Light, dark or follow the system, from the device preference (Settings › Appearance). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useAppSelector((s) => s.preferences.theme)
  const system = useColorScheme()
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark')
  const value = useMemo(() => ({ colors: isDark ? dark : light, dark: isDark }), [isDark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function useColors(): Palette {
  return useContext(ThemeContext).colors
}
