import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PinGate } from '@/features/pin/PinGate'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { MemberSection } from './MemberSection'
import { GoogleAccountsSettings } from '@/features/google/GoogleAccountsSettings'
import { CalendarSection } from '@/features/google/CalendarSection'
import { TaskListSection } from '@/features/google/TaskListSection'
import { ChoreSettingsLink } from '@/features/chores/ChoreSettingsLink'
import { ChangePinDialog } from './ChangePinDialog'

export function SettingsView() {
  const [changingPin, setChangingPin] = useState(false)

  return (
    <PinGate>
      <div className="min-h-screen bg-bg text-primary p-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-accent min-h-[44px] flex items-center">← Zum Kalender</Link>
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold text-primary">Einstellungen</h1>

          <MemberSection />
          <GoogleAccountsSettings />
          <CalendarSection />
          <TaskListSection />
          <ChoreSettingsLink />

          <button
            type="button"
            onClick={() => setChangingPin(true)}
            className="self-start text-muted min-h-[44px] flex items-center"
          >
            PIN ändern
          </button>
        </div>
      </div>

      {changingPin && <ChangePinDialog onClose={() => setChangingPin(false)} />}
    </PinGate>
  )
}
