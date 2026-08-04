# Google Reconnect Snackbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global always-on revoked-connection banner with a per-account snackbar that pops up when a Google connection's token has expired, names the affected account, and opens an in-app dialog to re-authorize it.

**Architecture:** A house-made `SnackbarProvider` (React Context + queue, no new dependency, styled like `PinSessionProvider`) is mounted in `AppShell` and renders stacked snackbars at the bottom. A `RevokedConnectionSnackbars` component watches the polled connection list and, for every connection with `status === "revoked"`, enqueues one deduped snackbar whose action opens a `ReconnectDialog`. The dialog reuses the existing full-page OAuth redirect. `useCalendarSync` is the detector: after each sync run it invalidates the connections query so a freshly-revoked status surfaces immediately.

**Tech Stack:** React 18 / TypeScript / Vite, TanStack Query, Tailwind, vitest + @testing-library/react. No backend or OpenAPI change.

## Global Constraints

- **No new dependency.** The snackbar infrastructure is hand-rolled (React Context + state). Do not add a toast library.
- **No backend / contract change.** `api/openapi.yml`, the 409 `GOOGLE_CONNECTION_REVOKED` mapping, and the `status` fields already exist and suffice. `GoogleAccountsSettings` stays unchanged.
- **Run all commands from `frontend/`** (Node ≥ 20). Test command: `npm run test:run -- <path>`. Full gate: `npm run check`.
- **Coverage thresholds are enforced by `npm run check`:** lines 90, **branches 100**, functions 90, statements 90. Every branch you write must be exercised by a test — this is the strictest constraint in the plan.
- **German UI strings, verbatim.** Snackbar text is exactly `{Name} ({E-Mail}): Google-Verbindung abgelaufen. Bitte neu verbinden.`
- **Touch targets ≥ 44 × 44 px**, high contrast, large text (wall display). Buttons use `min-h-[44px]`.
- **Match existing code style:** named exports, function components **without** explicit return-type annotations (see `ConnectionRevokedBanner.tsx`), Tailwind classes only.
- **eslint runs with `--max-warnings 0`** — no unused vars, no `any` beyond the `as never` cast pattern already used in tests.

---

## File Structure

- `frontend/src/routing/SnackbarProvider.tsx` — **new.** Generic context + queue + bottom-stacked UI. One responsibility: hold and render the snackbar list. Lives in `routing/` because `AppShell` mounts it (like the app frame it belongs to).
- `frontend/src/features/google/ReconnectDialog.tsx` — **new.** Presentational modal for one account: shows name + email, "Bei Google anmelden" (full-page OAuth redirect), "Abbrechen".
- `frontend/src/features/google/RevokedConnectionSnackbars.tsx` — **new.** Wiring: watches `useGoogleConnections`, derives one snackbar per revoked account via `useSnackbar`, owns the reconnect-dialog target state, renders `ReconnectDialog`.
- `frontend/src/features/calendar/useCalendarSync.ts` — **modify.** After sync, also invalidate the connections query.
- `frontend/src/routing/AppShell.tsx` — **modify.** Remove banner; wrap in `SnackbarProvider`; mount `RevokedConnectionSnackbars`.
- `frontend/src/features/google/ConnectionRevokedBanner.tsx` + `.test.tsx` — **delete.**
- `frontend/src/routing/AppShell.test.tsx`, `frontend/src/App.test.tsx`, `frontend/src/features/calendar/useCalendarSync.test.tsx` — **modify** to match the new structure.

No depcruiser layering rule forbids `features/` importing `routing/` (only `no-circular`, `no-orphans`, `not-to-test`, `not-to-dev-dep`, `no-phantom-deps` exist), so `RevokedConnectionSnackbars` may import `SnackbarProvider`.

---

## Task 1: SnackbarProvider (context + queue + UI)

**Files:**
- Create: `frontend/src/routing/SnackbarProvider.tsx`
- Test: `frontend/src/routing/SnackbarProvider.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks; React only.
- Produces:
  - `interface SnackbarAction { label: string; onClick: () => void }`
  - `interface SnackbarItem { id: string; message: string; action?: SnackbarAction }`
  - `function SnackbarProvider({ children }: { children: ReactNode })` — renders `children`, then a fixed bottom stack of snackbars.
  - `function useSnackbar(): { snackbars: SnackbarItem[]; show: (item: SnackbarItem) => void; dismiss: (id: string) => void }` — throws if used outside the provider. `show` is a no-op when an item with the same `id` already exists (dedupe). `dismiss` is a no-op when the id is absent (keeps the same array reference, so it is safe to call every render).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routing/SnackbarProvider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen, fireEvent, act } from '@testing-library/react'
import { SnackbarProvider, useSnackbar } from './SnackbarProvider'

// Captures the context API so tests can drive show()/dismiss() imperatively.
let api: ReturnType<typeof useSnackbar>
function Capture() {
  api = useSnackbar()
  return null
}

function renderProvider() {
  return render(
    <SnackbarProvider>
      <Capture />
    </SnackbarProvider>,
  )
}

describe('SnackbarProvider', () => {
  it('throws when useSnackbar is used outside a provider', () => {
    expect(() => renderHook(() => useSnackbar())).toThrow(
      'useSnackbar must be used within a SnackbarProvider',
    )
  })

  it('shows a snackbar with message and action button', () => {
    renderProvider()
    const onClick = vi.fn()
    act(() => api.show({ id: 'a', message: 'Hallo', action: { label: 'Tun', onClick } }))
    expect(screen.getByText('Hallo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tun' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows a snackbar without an action button', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Nur Text' }))
    expect(screen.getByText('Nur Text')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tun' })).not.toBeInTheDocument()
    // The close button is always present.
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument()
  })

  it('dedupes by id: showing the same id twice keeps one snackbar', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Eins' }))
    act(() => api.show({ id: 'a', message: 'Zwei' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Eins')).toBeInTheDocument()
    expect(screen.queryByText('Zwei')).not.toBeInTheDocument()
  })

  it('stacks distinct snackbars', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'A' }))
    act(() => api.show({ id: 'b', message: 'B' }))
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('closing a snackbar via the X removes it', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Weg damit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByText('Weg damit')).not.toBeInTheDocument()
  })

  it('dismissing an unknown id is a no-op', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Bleibt' }))
    act(() => api.dismiss('does-not-exist'))
    expect(screen.getByText('Bleibt')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/routing/SnackbarProvider.test.tsx`
Expected: FAIL — `Failed to resolve import "./SnackbarProvider"` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/routing/SnackbarProvider.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/routing/SnackbarProvider.test.tsx`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routing/SnackbarProvider.tsx frontend/src/routing/SnackbarProvider.test.tsx
git commit -m "feat(google): add house-made SnackbarProvider context and stacked UI"
```

---

## Task 2: ReconnectDialog

**Files:**
- Create: `frontend/src/features/google/ReconnectDialog.tsx`
- Test: `frontend/src/features/google/ReconnectDialog.test.tsx`

**Interfaces:**
- Consumes: `useStartGoogleAuth` from `@/features/google/useCalendars` (existing) — returns `{ mutateAsync: (params?: { returnUrl: string }) => Promise<string>; isPending: boolean }`. `mutateAsync` resolves to the Google auth URL.
- Produces: `function ReconnectDialog({ name, email, onClose }: { name: string; email: string; onClose: () => void })` — a `role="dialog"` modal. "Bei Google anmelden" calls `mutateAsync({ returnUrl: window.location.pathname })` then sets `window.location.href` to the returned URL. "Abbrechen" calls `onClose`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/google/ReconnectDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { ReconnectDialog } from './ReconnectDialog'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'

describe('ReconnectDialog', () => {
  const mutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStartGoogleAuth).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    mutateAsync.mockResolvedValue(AUTH_URL)
    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/kalender' },
      writable: true,
    })
  })

  it('shows the affected account name and email', () => {
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Verbindung abgelaufen' })).toBeInTheDocument()
    expect(screen.getByText('Papa')).toBeInTheDocument()
    expect(screen.getByText('papa@gmail.com')).toBeInTheDocument()
  })

  it('"Bei Google anmelden" authorizes with the current path and redirects', async () => {
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bei Google anmelden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(mutateAsync).toHaveBeenCalledWith({ returnUrl: '/kalender' })
  })

  it('"Abbrechen" closes the dialog without starting auth', () => {
    const onClose = vi.fn()
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('disables the sign-in button while the auth request is pending', () => {
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync, isPending: true } as never)
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Bei Google anmelden' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/google/ReconnectDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./ReconnectDialog"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/google/ReconnectDialog.tsx`:

```tsx
import { useStartGoogleAuth } from '@/features/google/useCalendars'

/**
 * In-app dialog for re-authorizing one expired Google connection. Reuses the
 * existing full-page OAuth redirect (same flow as Settings); no PIN gate — the
 * Google consent screen is the safeguard.
 */
export function ReconnectDialog({
  name,
  email,
  onClose,
}: {
  name: string
  email: string
  onClose: () => void
}) {
  const startAuth = useStartGoogleAuth()

  async function handleSignIn() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: window.location.pathname })
    window.location.href = authUrl
  }

  return (
    <div
      role="dialog"
      aria-label="Verbindung abgelaufen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-slate-800 p-6 text-white">
        <h2 className="text-xl font-semibold">Verbindung abgelaufen</h2>
        <div>
          <p className="text-lg font-medium">{name}</p>
          <p className="text-slate-300">{email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={startAuth.isPending}
          className="min-h-[44px] rounded-xl bg-amber-500 px-5 py-2 font-semibold text-slate-900 disabled:opacity-50"
        >
          Bei Google anmelden
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-xl bg-slate-700 px-5 py-2 font-semibold text-white"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/google/ReconnectDialog.test.tsx`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/ReconnectDialog.tsx frontend/src/features/google/ReconnectDialog.test.tsx
git commit -m "feat(google): add in-app reconnect dialog for expired connection"
```

---

## Task 3: RevokedConnectionSnackbars (derive snackbars from connection list)

**Files:**
- Create: `frontend/src/features/google/RevokedConnectionSnackbars.tsx`
- Test: `frontend/src/features/google/RevokedConnectionSnackbars.test.tsx`

**Interfaces:**
- Consumes:
  - `useGoogleConnections` from `@/features/google/useGoogleConnections` — returns `{ connections: ConnectionResponse[]; isLoading: boolean; isError: boolean }`. `ConnectionResponse` has `{ connectionId: string; memberId: string; email: string; name: string; status: string; ... }`.
  - `useSnackbar` from `@/routing/SnackbarProvider` (Task 1) — `{ show, dismiss }`.
  - `ReconnectDialog` from `@/features/google/ReconnectDialog` (Task 2).
- Produces: `function RevokedConnectionSnackbars()` — renders `null` (plus the dialog when a target is set). Side effect: for each connection, if `status.toLowerCase() === 'revoked'` it enqueues a snackbar `revoked-${connectionId}` whose action opens the reconnect dialog for that account; otherwise it dismisses `revoked-${connectionId}`. Must be rendered inside a `SnackbarProvider`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/google/RevokedConnectionSnackbars.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))

// Stub the dialog so this test focuses on the derivation, not the OAuth flow.
vi.mock('@/features/google/ReconnectDialog', () => ({
  ReconnectDialog: ({
    name,
    email,
    onClose,
  }: {
    name: string
    email: string
    onClose: () => void
  }) => (
    <div data-testid="reconnect-dialog">
      <span>{name}</span>
      <span>{email}</span>
      <button type="button" onClick={onClose}>
        close-dialog
      </button>
    </div>
  ),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from './RevokedConnectionSnackbars'

const active = {
  connectionId: 'conn-1',
  memberId: 'mem-1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: '2024-01-15T10:00:00Z',
  scopes: ['calendar'],
}

const revoked = {
  connectionId: 'conn-2',
  memberId: 'mem-2',
  email: 'papa@gmail.com',
  name: 'Papa',
  status: 'REVOKED',
  lastSyncedAt: null,
  scopes: [],
}

const REVOKED_TEXT = 'Papa (papa@gmail.com): Google-Verbindung abgelaufen. Bitte neu verbinden.'

function mockConnections(connections: unknown[]) {
  vi.mocked(useGoogleConnections).mockReturnValue({
    connections,
    isLoading: false,
    isError: false,
  } as never)
}

function renderShell() {
  return render(
    <SnackbarProvider>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RevokedConnectionSnackbars', () => {
  it('shows one snackbar for a revoked account and none for active accounts', () => {
    mockConnections([active, revoked])
    renderShell()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('clicking "Neu verbinden" opens the reconnect dialog with the account details', () => {
    mockConnections([revoked])
    renderShell()
    expect(screen.queryByTestId('reconnect-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    const dialog = screen.getByTestId('reconnect-dialog')
    expect(dialog).toHaveTextContent('Papa')
    expect(dialog).toHaveTextContent('papa@gmail.com')
  })

  it('closing the dialog removes it but keeps the snackbar', () => {
    mockConnections([revoked])
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: 'close-dialog' }))
    expect(screen.queryByTestId('reconnect-dialog')).not.toBeInTheDocument()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()
  })

  it('removes the snackbar when the account becomes active again', () => {
    mockConnections([revoked])
    const { rerender } = renderShell()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()

    // Same connectionId, now active — simulates a successful reconnect.
    mockConnections([{ ...revoked, status: 'ACTIVE' }])
    rerender(
      <SnackbarProvider>
        <RevokedConnectionSnackbars />
      </SnackbarProvider>,
    )
    expect(screen.queryByText(REVOKED_TEXT)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/google/RevokedConnectionSnackbars.test.tsx`
Expected: FAIL — `Failed to resolve import "./RevokedConnectionSnackbars"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/google/RevokedConnectionSnackbars.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ConnectionResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useSnackbar } from '@/routing/SnackbarProvider'
import { ReconnectDialog } from '@/features/google/ReconnectDialog'

/**
 * Watches the polled connection list and shows one deduped snackbar per
 * connection whose token has been revoked. The sync (useCalendarSync) is the
 * detector that flips a dead token to "revoked" server-side and invalidates
 * the connections query; this component only mirrors the resulting list.
 */
export function RevokedConnectionSnackbars() {
  const { connections } = useGoogleConnections()
  const { show, dismiss } = useSnackbar()
  const [target, setTarget] = useState<ConnectionResponse | null>(null)

  useEffect(() => {
    for (const connection of connections) {
      const id = `revoked-${connection.connectionId}`
      if (connection.status.toLowerCase() === 'revoked') {
        show({
          id,
          message: `${connection.name} (${connection.email}): Google-Verbindung abgelaufen. Bitte neu verbinden.`,
          action: { label: 'Neu verbinden', onClick: () => setTarget(connection) },
        })
      } else {
        dismiss(id)
      }
    }
  }, [connections, show, dismiss])

  if (!target) return null
  return <ReconnectDialog name={target.name} email={target.email} onClose={() => setTarget(null)} />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/google/RevokedConnectionSnackbars.test.tsx`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/RevokedConnectionSnackbars.tsx frontend/src/features/google/RevokedConnectionSnackbars.test.tsx
git commit -m "feat(google): derive per-account reconnect snackbars from connection list"
```

---

## Task 4: Invalidate the connections query after every sync

**Files:**
- Modify: `frontend/src/features/calendar/useCalendarSync.ts`
- Test: `frontend/src/features/calendar/useCalendarSync.test.tsx`

**Interfaces:**
- Consumes: `getListConnectionsQueryKey` from `@/api/generated/endpoints/familyHubAPI` (already used elsewhere; returns the connections query key array).
- Produces: no signature change. `sync()` now invalidates both the events query and the connections query after each run, so a freshly-`revoked` status surfaces in the polled list immediately.

- [ ] **Step 1: Write the failing test**

First update the module mock at the top of `frontend/src/features/calendar/useCalendarSync.test.tsx` to expose the connections query key. Replace the existing mock block:

```tsx
const syncCalendars = vi.fn()
const getListEventsQueryKey = vi.fn(() => ['/api/v1/events'])
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  syncCalendars: (params: { memberId: string }) => syncCalendars(params),
  getListEventsQueryKey: () => getListEventsQueryKey(),
}))
```

with:

```tsx
const syncCalendars = vi.fn()
const getListEventsQueryKey = vi.fn(() => ['/api/v1/events'])
const getListConnectionsQueryKey = vi.fn(() => ['/api/v1/connections'])
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  syncCalendars: (params: { memberId: string }) => syncCalendars(params),
  getListEventsQueryKey: () => getListEventsQueryKey(),
  getListConnectionsQueryKey: () => getListConnectionsQueryKey(),
}))
```

Then update the `beforeEach` to reset the new mock — replace:

```tsx
beforeEach(() => {
  syncCalendars.mockReset().mockResolvedValue({ status: 200, data: {} })
  getListEventsQueryKey.mockReset().mockReturnValue(['/api/v1/events'])
})
```

with:

```tsx
beforeEach(() => {
  syncCalendars.mockReset().mockResolvedValue({ status: 200, data: {} })
  getListEventsQueryKey.mockReset().mockReturnValue(['/api/v1/events'])
  getListConnectionsQueryKey.mockReset().mockReturnValue(['/api/v1/connections'])
})
```

Now add this test inside the `describe('useCalendarSync', ...)` block (it needs `QueryClient` and `QueryClientProvider`, already imported at the top of the file):

```tsx
it('invalidates the connections query after syncing so revoked status surfaces', async () => {
  connectionsRef.current = [{ memberId: 'm1', status: 'connected' }]
  const client = createTestQueryClient()
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  function spyWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  const { result } = renderHook(() => useCalendarSync(), { wrapper: spyWrapper })
  await act(async () => {
    await result.current.sync()
  })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/connections'] })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/calendar/useCalendarSync.test.tsx`
Expected: FAIL — the new test fails: `invalidateSpy` was never called with `{ queryKey: ['/api/v1/connections'] }` (the hook only invalidates the events key today).

- [ ] **Step 3: Write the implementation**

Edit `frontend/src/features/calendar/useCalendarSync.ts`. Add `getListConnectionsQueryKey` to the import:

```tsx
import {
  syncCalendars,
  getListEventsQueryKey,
  getListConnectionsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
```

Then, immediately after the existing events invalidation inside the `try` block, add the connections invalidation. Change:

```tsx
      if (results.some((r) => r.status === 'rejected')) setIsError(true)
      await queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() })
```

to:

```tsx
      if (results.some((r) => r.status === 'rejected')) setIsError(true)
      await queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() })
      await queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/calendar/useCalendarSync.test.tsx`
Expected: PASS — all tests pass, including the new invalidation test. The existing "sets isError when invalidating the query cache throws" test still passes (it throws in `getListEventsQueryKey`, before the connections invalidation runs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/useCalendarSync.ts frontend/src/features/calendar/useCalendarSync.test.tsx
git commit -m "feat(calendar): invalidate connections query after sync to surface revoked status"
```

---

## Task 5: Wire into AppShell and remove the old banner

**Files:**
- Modify: `frontend/src/routing/AppShell.tsx`
- Modify: `frontend/src/routing/AppShell.test.tsx`
- Modify: `frontend/src/App.test.tsx`
- Delete: `frontend/src/features/google/ConnectionRevokedBanner.tsx`
- Delete: `frontend/src/features/google/ConnectionRevokedBanner.test.tsx`

**Interfaces:**
- Consumes: `SnackbarProvider` (Task 1), `RevokedConnectionSnackbars` (Task 3).
- Produces: `AppShell` now wraps content in `SnackbarProvider` and mounts `RevokedConnectionSnackbars`. The `ConnectionRevokedBanner` no longer exists.

- [ ] **Step 1: Update the AppShell test to the new structure**

Replace the entire contents of `frontend/src/routing/AppShell.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Stub the snackbars component so the shell test needs no QueryClient.
vi.mock('@/features/google/RevokedConnectionSnackbars', () => ({
  RevokedConnectionSnackbars: () => <div data-testid="revoked-snackbars" />,
}))

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })

  it('mounts the revoked-connection snackbars', () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByTestId('revoked-snackbars')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the AppShell test to verify it fails**

Run: `npm run test:run -- src/routing/AppShell.test.tsx`
Expected: FAIL — `AppShell` still imports/renders `ConnectionRevokedBanner`, and `getByTestId('revoked-snackbars')` is not found (the mock target isn't rendered by `AppShell` yet).

- [ ] **Step 3: Rewrite AppShell**

Replace the entire contents of `frontend/src/routing/AppShell.tsx` with:

```tsx
import { type ReactNode } from 'react'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from '@/features/google/RevokedConnectionSnackbars'

/**
 * Minimal application frame. Wraps the page in a SnackbarProvider and mounts
 * the revoked-connection watcher, which pops a per-account reconnect snackbar
 * when a Google connection's token has expired. Prepared for a future section
 * navigation (Aufgaben/Haushalt/Fotos).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider>
      <div className="min-h-screen bg-slate-900">{children}</div>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>
  )
}
```

- [ ] **Step 4: Run the AppShell test to verify it passes**

Run: `npm run test:run -- src/routing/AppShell.test.tsx`
Expected: PASS — both tests pass.

- [ ] **Step 5: Update the App routing test**

In `frontend/src/App.test.tsx`, replace the `ConnectionRevokedBanner` mock:

```tsx
vi.mock('@/features/google/ConnectionRevokedBanner', () => ({
  ConnectionRevokedBanner: () => <div data-testid="revoked-banner" />,
}))
```

with a mock for the new component (still needed so `render(<AppRoutes />)` does not require a `QueryClientProvider`):

```tsx
vi.mock('@/features/google/RevokedConnectionSnackbars', () => ({
  RevokedConnectionSnackbars: () => <div data-testid="revoked-snackbars" />,
}))
```

- [ ] **Step 6: Delete the old banner and its test**

```bash
git rm frontend/src/features/google/ConnectionRevokedBanner.tsx frontend/src/features/google/ConnectionRevokedBanner.test.tsx
```

- [ ] **Step 7: Run both touched test files to verify they pass**

Run: `npm run test:run -- src/App.test.tsx src/routing/AppShell.test.tsx`
Expected: PASS — no remaining reference to `ConnectionRevokedBanner`; both files green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routing/AppShell.tsx frontend/src/routing/AppShell.test.tsx frontend/src/App.test.tsx
git commit -m "feat(google): mount reconnect snackbars in AppShell, remove revoked banner"
```

---

## Task 6: Full frontend gate

**Files:** none (verification only).

- [ ] **Step 1: Confirm no dangling references to the old banner**

Run: `grep -rn "ConnectionRevokedBanner\|revoked-banner" frontend/src`
Expected: no output (empty). If anything prints, remove it before continuing.

- [ ] **Step 2: Run the full gate**

Run: `cd frontend && npm run check`
Expected: PASS — `tsc --noEmit` clean, eslint clean (`--max-warnings 0`), dependency-cruiser clean, and `test:coverage` green with **branches at 100%**. If coverage fails on branches, add the missing-branch test (each `if`/`else`, `action?` present-and-absent, `!target` true-and-false must be exercised — Tasks 1 and 3 already cover these; a red branch means a test was dropped).

- [ ] **Step 3: Commit only if the gate produced changes**

`npm run check` should not modify files. If it did (e.g. a formatter), review and commit:

```bash
git add -A
git commit -m "chore(frontend): satisfy full check gate for reconnect snackbar"
```

Otherwise, no commit is needed — the feature is complete.

---

## Self-Review

**Spec coverage:**
- Snackbar appears on failed sync of an expired account → Task 4 (sync invalidates connections query) + Task 3 (revoked connection → snackbar). ✅
- Names the affected account (name + email) → Task 3 message text + Task 2 dialog. ✅
- Reconnect via dialog → Task 2 `ReconnectDialog` with existing full-page redirect. ✅
- Replaces the global banner → Task 5 removes `ConnectionRevokedBanner` and its wiring. ✅
- House-made `SnackbarProvider` (no dependency), stacked at bottom, dedupe per account, no auto-timeout, manual close, `role="alert"`, ≥44px targets, German text → Task 1. ✅
- Reappears after reload while still revoked → sync runs on app start (existing `CalendarView` behavior) → invalidates connections (Task 4) → snackbar re-derived (Task 3). ✅
- Snackbar removed after reconnect (status → active) → Task 3 `else` branch dismisses; test covers the revoked→active transition. ✅
- Backend / contract / `GoogleAccountsSettings` unchanged → nothing in the plan touches them. ✅
- `login_hint` explicitly out of scope → not implemented. ✅
- Tests: SnackbarProvider (enqueue, stack, manual close, dedupe), dialog (name/email, auth start with returnUrl, cancel), derivation (list → snackbars, active removes), sync-invalidation → Tasks 1–4. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step shows complete code. ✅

**Type consistency:** `SnackbarItem`/`SnackbarAction`/`useSnackbar`/`show`/`dismiss` (Task 1) are used with the same names and shapes in Task 3. `ReconnectDialog({ name, email, onClose })` (Task 2) is called with exactly those props in Task 3. `getListConnectionsQueryKey` (Task 4) matches the name already exported by the generated API and used in `useGoogleConnections.ts`. ✅
