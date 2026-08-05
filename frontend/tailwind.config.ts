import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Each maps to a CSS variable defined in src/index.css. The `.dark`
        // class on <html> swaps every variable, so no `dark:` variants are
        // needed on individual elements. Accent is a single green token.
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        subtle: 'var(--border)', // usable as border-subtle
        primary: 'var(--text)', // usable as text-primary
        muted: 'var(--muted)', // usable as text-muted
        accent: 'var(--accent)',
        'accent-weak': 'var(--accent-weak)',
        danger: 'var(--danger)',
        'danger-weak': 'var(--danger-weak)',
        warn: 'var(--warn)',
        'warn-weak': 'var(--warn-weak)',
      },
    },
  },
  plugins: [],
} satisfies Config
