import { type ReactNode } from 'react'
import { Plus } from 'lucide-react'

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <section className="rounded-2xl bg-surface border border-subtle p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-primary">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            className="flex items-center justify-center rounded-xl bg-accent-weak text-accent min-h-[44px] min-w-[44px]"
          >
            <Plus aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
