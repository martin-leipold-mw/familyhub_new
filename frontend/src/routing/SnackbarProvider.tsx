import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface SnackbarAction {
  label: string
  onClick: () => void
}

export interface SnackbarItem {
  id: string
  message: string
  action?: SnackbarAction
}

interface SnackbarContextValue {
  snackbars: SnackbarItem[]
  show: (item: SnackbarItem) => void
  dismiss: (id: string) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([])

  const show = useCallback((item: SnackbarItem) => {
    setSnackbars((prev) => (prev.some((s) => s.id === item.id) ? prev : [...prev, item]))
  }, [])

  const dismiss = useCallback((id: string) => {
    setSnackbars((prev) => (prev.some((s) => s.id === id) ? prev.filter((s) => s.id !== id) : prev))
  }, [])

  return (
    <SnackbarContext.Provider value={{ snackbars, show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4">
        {snackbars.map((snackbar) => (
          <div
            key={snackbar.id}
            role="alert"
            className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl bg-slate-800 px-4 py-3 text-lg text-white shadow-lg"
          >
            <span className="flex-1">{snackbar.message}</span>
            {snackbar.action && (
              <button
                type="button"
                onClick={snackbar.action.onClick}
                className="min-h-[44px] rounded-xl bg-amber-500 px-4 py-2 font-semibold text-slate-900"
              >
                {snackbar.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => dismiss(snackbar.id)}
              className="min-h-[44px] min-w-[44px] rounded-xl px-3 py-2 text-2xl text-slate-300"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) throw new Error('useSnackbar must be used within a SnackbarProvider')
  return ctx
}
