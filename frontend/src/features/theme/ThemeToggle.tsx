import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
      className="flex items-center justify-center rounded-xl bg-surface-2 text-primary min-h-[44px] min-w-[44px]"
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </button>
  )
}
