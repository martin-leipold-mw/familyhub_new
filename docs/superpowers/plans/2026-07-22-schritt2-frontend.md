# Schritt 2 — Frontend (Members, Settings, PIN, Setup Wizard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/TypeScript UI for Stufe 2: a setup wizard, family-member management with avatars, PIN unlock/change, and a client-side PIN session, all consuming the Stufe-2 backend.

**Architecture:** Feature folders under `src/features/`. The Orval-generated React Query client (regenerated from the extended OpenAPI spec) is wrapped by thin hooks. A module-level token store lets the non-React `customFetch` inject the `X-Pin-Session` header; a `PinSessionContext` owns the token lifecycle and a 15-minute inactivity timer. A `SetupGuard` redirects to `/setup` until setup completes. **Depends on** the sibling plan `2026-07-22-schritt2-backend.md` — build and run that first so `api/openapi.yml` contains the new endpoints.

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, TanStack Query v5, Tailwind CSS, Orval, Vitest + React Testing Library.

## Global Constraints

- **German UI throughout.** Quote every user-facing string exactly as written in this plan.
- **Touch-first:** every interactive element ≥ 44×44 px (`min-h-[44px] min-w-[44px]` or `w-11 h-11`), no hover-only interactions.
- **Path alias:** `@` → `src` (already configured in `vite.config.ts` and `tsconfig.json`).
- **customFetch return shape is `{ data, status, headers }`** — read query results as `query.data?.data` (matching the existing `HealthPage`).
- **Coverage gate (`vite.config.ts`):** 90% lines/functions/statements, **100% branches**, excluding `src/api/generated/`, `src/test/`, `src/main.tsx`, `src/components/ui/`. Write tests for every branch; do not lower thresholds.
- **Tests use `fireEvent`** from `@testing-library/react` (no `@testing-library/user-event` dependency is installed). Vitest globals (`describe`/`it`/`expect`) are enabled; import `vi` explicitly.
- **No new dependencies.** Build modals/keypads from plain elements + Tailwind (`lucide-react` icons are available).
- **API base path** is `/api/v1/...`; generated hooks already prefix `/api`. Manual `customFetch` calls must include the full path (e.g. `/api/v1/members/${id}/avatar`).
- **Color palette (HSL):** `blue 210 80% 70%`, `pink 340 75% 75%`, `green 140 60% 65%`, `purple 270 60% 70%`, `orange 30 85% 65%`, `teal 180 55% 60%`.

## File Structure (created across tasks)

```
src/
  api/
    sessionTokenStore.ts        — module-level token + activity pub/sub (Task 2)
    customFetch.ts              — inject X-Pin-Session (modified, Task 3)
  features/
    pin/
      PinSessionContext.tsx     — token lifecycle + 15-min timer (Task 4)
      PinInputDialog.tsx        — numeric keypad, masked (Task 9)
    members/
      colors.ts                 — color enum → HSL map (Task 1)
      useMembersQuery.ts        — query/mutation wrappers (Task 5)
      MemberCard.tsx            — single tile (Task 6)
      MemberGrid.tsx            — responsive grid (Task 6)
      compressImage.ts          — canvas compression + typed errors (Task 7)
      AvatarUpload.tsx          — file → compress → upload (Task 7)
      MemberForm.tsx            — shared add/edit form (Task 8)
      AddMemberDialog.tsx       — create (Task 8)
      EditMemberDialog.tsx      — edit + avatar (Task 8)
    setup/
      redirectHome.ts           — hard redirect helper (Task 11)
      SetupWizard.tsx           — step container + progress (Task 11)
      WelcomeStep.tsx           — step 1 (Task 11)
      MembersStep.tsx           — step 2 (Task 11)
      PinStep.tsx               — step 3 (Task 11)
    settings/
      SettingsView.tsx          — home; unlock + member management (Task 12)
      ChangePinDialog.tsx       — change PIN (Task 12)
  routing/
    SetupGuard.tsx              — redirect until setup complete (Task 10)
    NotFound.tsx                — 404 (Task 10)
  test/
    testUtils.tsx               — renderWithProviders (Task 5)
```

---

### Task 1: Regenerate the API client + color constants

**Files:**
- Regenerate: `frontend/src/api/generated/**` (via `npm run generate:api`)
- Create: `frontend/src/features/members/colors.ts`
- Test: `frontend/src/features/members/colors.test.ts`

**Interfaces:**
- Consumes: extended `api/openapi.yml` (from the backend plan, Task 3).
- Produces:
  - Regenerated hooks: `useListMembers`, `useCreateMember`, `useUpdateMember`, `useDeleteMember`, `useGetSetupStatus`, `useSetPin`, `useVerifyPin`, `useChangePin`, `useUpdateSetupStep`, plus query-key helpers `getListMembersQueryKey`, `getGetSetupStatusQueryKey`, and models `MemberResponse`, `MemberRequest`, `SetupStatusResponse`, etc.
  - `colors.ts` exporting: `type MemberColor`, `type MemberRole`, `MEMBER_COLORS: Record<MemberColor, string>`, `MEMBER_COLOR_KEYS: MemberColor[]`, `roleLabel(role): string`.

- [ ] **Step 1: Regenerate the client**

Run: `cd frontend && npm run generate:api`
Expected: files under `src/api/generated/endpoints/familyHubAPI.ts` and `src/api/generated/model/` now include member/settings hooks and models. (Requires the backend plan's `api/openapi.yml` changes to be present.)

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/members/colors.test.ts`:

```ts
import { MEMBER_COLORS, MEMBER_COLOR_KEYS, roleLabel } from './colors'

describe('colors', () => {
  it('maps every color to its HSL value', () => {
    expect(MEMBER_COLORS.blue).toBe('hsl(210 80% 70%)')
    expect(MEMBER_COLORS.pink).toBe('hsl(340 75% 75%)')
    expect(MEMBER_COLORS.green).toBe('hsl(140 60% 65%)')
    expect(MEMBER_COLORS.purple).toBe('hsl(270 60% 70%)')
    expect(MEMBER_COLORS.orange).toBe('hsl(30 85% 65%)')
    expect(MEMBER_COLORS.teal).toBe('hsl(180 55% 60%)')
  })

  it('exposes exactly six color keys', () => {
    expect(MEMBER_COLOR_KEYS).toHaveLength(6)
  })

  it('translates roles to German labels', () => {
    expect(roleLabel('parent')).toBe('Elternteil')
    expect(roleLabel('child')).toBe('Kind')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/colors.test.ts`
Expected: FAIL — cannot resolve `./colors`.

- [ ] **Step 4: Create the constants**

Create `frontend/src/features/members/colors.ts`:

```ts
export type MemberColor = 'blue' | 'pink' | 'green' | 'purple' | 'orange' | 'teal'
export type MemberRole = 'parent' | 'child'

export const MEMBER_COLORS: Record<MemberColor, string> = {
  blue: 'hsl(210 80% 70%)',
  pink: 'hsl(340 75% 75%)',
  green: 'hsl(140 60% 65%)',
  purple: 'hsl(270 60% 70%)',
  orange: 'hsl(30 85% 65%)',
  teal: 'hsl(180 55% 60%)',
}

export const MEMBER_COLOR_KEYS = Object.keys(MEMBER_COLORS) as MemberColor[]

export function roleLabel(role: string): string {
  return role === 'parent' ? 'Elternteil' : 'Kind'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/colors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/generated frontend/src/features/members/colors.ts \
        frontend/src/features/members/colors.test.ts
git commit -m "feat(frontend): regenerate API client and add color constants"
```

---

### Task 2: Session token store (module-level pub/sub)

**Files:**
- Create: `frontend/src/api/sessionTokenStore.ts`
- Test: `frontend/src/api/sessionTokenStore.test.ts`

**Interfaces:**
- Produces:
  - `getSessionToken(): string | null`
  - `setSessionToken(token: string | null): void` — notifies token listeners
  - `subscribeSessionToken(listener: () => void): () => void`
  - `notifyActivity(): void` — signals an outgoing request
  - `subscribeActivity(listener: () => void): () => void`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/sessionTokenStore.test.ts`:

```ts
import { vi } from 'vitest'
import {
  getSessionToken,
  setSessionToken,
  subscribeSessionToken,
  notifyActivity,
  subscribeActivity,
} from './sessionTokenStore'

describe('sessionTokenStore', () => {
  afterEach(() => setSessionToken(null))

  it('starts empty and stores a token', () => {
    expect(getSessionToken()).toBeNull()
    setSessionToken('abc')
    expect(getSessionToken()).toBe('abc')
  })

  it('notifies token subscribers and unsubscribes', () => {
    const listener = vi.fn()
    const unsub = subscribeSessionToken(listener)
    setSessionToken('x')
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    setSessionToken('y')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies activity subscribers and unsubscribes', () => {
    const listener = vi.fn()
    const unsub = subscribeActivity(listener)
    notifyActivity()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    notifyActivity()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/api/sessionTokenStore.test.ts`
Expected: FAIL — cannot resolve `./sessionTokenStore`.

- [ ] **Step 3: Create the store**

Create `frontend/src/api/sessionTokenStore.ts`:

```ts
let currentToken: string | null = null
const tokenListeners = new Set<() => void>()
const activityListeners = new Set<() => void>()

export function getSessionToken(): string | null {
  return currentToken
}

export function setSessionToken(token: string | null): void {
  currentToken = token
  tokenListeners.forEach((listener) => listener())
}

export function subscribeSessionToken(listener: () => void): () => void {
  tokenListeners.add(listener)
  return () => {
    tokenListeners.delete(listener)
  }
}

export function notifyActivity(): void {
  activityListeners.forEach((listener) => listener())
}

export function subscribeActivity(listener: () => void): () => void {
  activityListeners.add(listener)
  return () => {
    activityListeners.delete(listener)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/api/sessionTokenStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/sessionTokenStore.ts frontend/src/api/sessionTokenStore.test.ts
git commit -m "feat(frontend): add module-level PIN session token store"
```

---

### Task 3: Inject `X-Pin-Session` in customFetch

**Files:**
- Modify: `frontend/src/api/customFetch.ts`
- Test: `frontend/src/api/customFetch.test.ts`

**Interfaces:**
- Consumes: `getSessionToken`, `notifyActivity` from `sessionTokenStore`.
- Produces: `customFetch` now (a) calls `notifyActivity()` per request, (b) adds `X-Pin-Session` header when a token exists, (c) still lets `options.headers` override defaults. Return shape unchanged.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/customFetch.test.ts`:

```ts
import { vi } from 'vitest'
import { customFetch } from './customFetch'
import { setSessionToken } from './sessionTokenStore'

function mockFetch(status = 200, body: unknown = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('customFetch', () => {
  afterEach(() => {
    setSessionToken(null)
    vi.unstubAllGlobals()
  })

  it('omits X-Pin-Session when no token', async () => {
    const fetchMock = mockFetch()
    await customFetch('/api/v1/members')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['X-Pin-Session']).toBeUndefined()
  })

  it('adds X-Pin-Session when a token is set', async () => {
    const fetchMock = mockFetch()
    setSessionToken('tok-1')
    await customFetch('/api/v1/members')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['X-Pin-Session']).toBe('tok-1')
  })

  it('lets option headers override the default content-type', async () => {
    const fetchMock = mockFetch()
    await customFetch('/api/v1/members/1/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('image/jpeg')
  })

  it('throws with the server message on error', async () => {
    mockFetch(413, { message: 'Das Bild ist zu groß für den Server' })
    await expect(customFetch('/api/v1/members/1/avatar', { method: 'PUT' }))
      .rejects.toThrow('Das Bild ist zu groß für den Server')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/api/customFetch.test.ts`
Expected: FAIL — `X-Pin-Session` not added.

- [ ] **Step 3: Update customFetch**

Replace `frontend/src/api/customFetch.ts` with:

```ts
import { getSessionToken, notifyActivity } from './sessionTokenStore'

export async function customFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  notifyActivity()
  const sessionToken = getSessionToken()

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Pin-Session': sessionToken } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message ?? `HTTP ${response.status}`)
  }

  if (response.status === 204) return { data: undefined, status: 204, headers: response.headers } as T

  const data = await response.json()
  return { data, status: response.status, headers: response.headers } as T
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/api/customFetch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/customFetch.ts frontend/src/api/customFetch.test.ts
git commit -m "feat(frontend): inject X-Pin-Session header and signal activity"
```

---

### Task 4: PinSessionContext (token lifecycle + 15-min timer)

**Files:**
- Create: `frontend/src/features/pin/PinSessionContext.tsx`
- Modify: `frontend/src/main.tsx` (wrap app in `PinSessionProvider`)
- Test: `frontend/src/features/pin/PinSessionContext.test.tsx`

**Interfaces:**
- Consumes: `sessionTokenStore` (`setSessionToken`, `subscribeActivity`).
- Produces:
  - `PinSessionProvider` — persists token in `sessionStorage['familyhub.pinSession']`, mirrors it into the module store, arms a 15-minute inactivity timer that calls `clearSession`, re-arms on `notifyActivity`.
  - `usePinSession(): { sessionToken, hasPinSession, setSession, clearSession }` — throws if used outside the provider.
  - Exported constants `PIN_SESSION_STORAGE_KEY`, `PIN_SESSION_TIMEOUT_MS`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/pin/PinSessionContext.test.tsx`:

```tsx
import { vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { PinSessionProvider, usePinSession, PIN_SESSION_TIMEOUT_MS } from './PinSessionContext'
import { getSessionToken, notifyActivity, setSessionToken } from '@/api/sessionTokenStore'

function Probe() {
  const { sessionToken, hasPinSession, setSession, clearSession } = usePinSession()
  return (
    <div>
      <span data-testid="token">{sessionToken ?? 'none'}</span>
      <span data-testid="has">{String(hasPinSession)}</span>
      <button onClick={() => setSession('tok-42')}>set</button>
      <button onClick={clearSession}>clear</button>
    </div>
  )
}

describe('PinSessionContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    setSessionToken(null)
  })
  afterEach(() => vi.useRealTimers())

  it('throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PinSessionProvider/)
    spy.mockRestore()
  })

  it('sets and clears the session and mirrors it into the store', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    expect(screen.getByTestId('has').textContent).toBe('false')

    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('token').textContent).toBe('tok-42')
    expect(sessionStorage.getItem('familyhub.pinSession')).toBe('tok-42')
    expect(getSessionToken()).toBe('tok-42')

    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('has').textContent).toBe('false')
    expect(getSessionToken()).toBeNull()
  })

  it('clears the session after 15 minutes of inactivity', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS) })
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('activity re-arms the timer', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS - 1000) })
    act(() => { notifyActivity() })
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS - 1000) })
    expect(screen.getByTestId('token').textContent).toBe('tok-42')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('restores a token from sessionStorage on mount', () => {
    sessionStorage.setItem('familyhub.pinSession', 'persisted')
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    expect(screen.getByTestId('token').textContent).toBe('persisted')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/pin/PinSessionContext.test.tsx`
Expected: FAIL — cannot resolve `./PinSessionContext`.

- [ ] **Step 3: Create the context**

Create `frontend/src/features/pin/PinSessionContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { setSessionToken, subscribeActivity } from '@/api/sessionTokenStore'

export const PIN_SESSION_STORAGE_KEY = 'familyhub.pinSession'
export const PIN_SESSION_TIMEOUT_MS = 15 * 60 * 1000

interface PinSessionValue {
  sessionToken: string | null
  hasPinSession: boolean
  setSession: (token: string) => void
  clearSession: () => void
}

const PinSessionContext = createContext<PinSessionValue | null>(null)

export function PinSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(PIN_SESSION_STORAGE_KEY),
  )
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setSessionToken(token)
  }, [token])

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY)
    setToken(null)
  }, [])

  const setSession = useCallback((newToken: string) => {
    sessionStorage.setItem(PIN_SESSION_STORAGE_KEY, newToken)
    setToken(newToken)
  }, [])

  useEffect(() => {
    if (!token) return
    const arm = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(clearSession, PIN_SESSION_TIMEOUT_MS)
    }
    arm()
    const unsubscribe = subscribeActivity(arm)
    return () => {
      unsubscribe()
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [token, clearSession])

  return (
    <PinSessionContext.Provider
      value={{ sessionToken: token, hasPinSession: token !== null, setSession, clearSession }}
    >
      {children}
    </PinSessionContext.Provider>
  )
}

export function usePinSession(): PinSessionValue {
  const ctx = useContext(PinSessionContext)
  if (!ctx) throw new Error('usePinSession must be used within a PinSessionProvider')
  return ctx
}
```

- [ ] **Step 4: Wrap the app**

Update `frontend/src/main.tsx` — add the import and wrap `<App />`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { PinSessionProvider } from '@/features/pin/PinSessionContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PinSessionProvider>
        <App />
      </PinSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/pin/PinSessionContext.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/pin/PinSessionContext.tsx frontend/src/main.tsx \
        frontend/src/features/pin/PinSessionContext.test.tsx
git commit -m "feat(frontend): add PIN session context with inactivity timeout"
```

---

### Task 5: Member query/mutation hooks + test utils

**Files:**
- Create: `frontend/src/test/testUtils.tsx`
- Create: `frontend/src/features/members/useMembersQuery.ts`
- Test: `frontend/src/features/members/useMembersQuery.test.tsx`

**Interfaces:**
- Consumes: generated `useListMembers`, `useCreateMember`, `useUpdateMember`, `useDeleteMember`, `getListMembersQueryKey`, `customFetch`, TanStack `useQueryClient`/`useMutation`.
- Produces:
  - `renderWithProviders(ui, { route })` and `createTestQueryClient()` in `testUtils.tsx`.
  - `useMembers(): { members: MemberResponse[], isLoading, isError }`
  - `useCreateMemberMutation()`, `useUpdateMemberMutation()`, `useDeleteMemberMutation()` — generated mutations with list invalidation.
  - `useUploadAvatarMutation()` — `mutateAsync({ id, blob })` PUTs the JPEG blob and invalidates the list.

- [ ] **Step 1: Create the test utils** (support file, no test of its own)

Create `frontend/src/test/testUtils.tsx`:

```tsx
import { type ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PinSessionProvider } from '@/features/pin/PinSessionContext'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = createTestQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <PinSessionProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </PinSessionProvider>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/members/useMembersQuery.test.tsx`:

```tsx
import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListMembers: vi.fn(),
  useCreateMember: vi.fn(),
  useUpdateMember: vi.fn(),
  useDeleteMember: vi.fn(),
  getListMembersQueryKey: () => ['/api/v1/members'],
}))
vi.mock('@/api/customFetch', () => ({ customFetch: vi.fn() }))

import { useListMembers } from '@/api/generated/endpoints/familyHubAPI'
import { customFetch } from '@/api/customFetch'
import { useMembers, useUploadAvatarMutation } from './useMembersQuery'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMembersQuery', () => {
  it('returns members from the query data', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: { data: [{ id: '1', name: 'Anna' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper })
    expect(result.current.members).toHaveLength(1)
    expect(result.current.members[0].name).toBe('Anna')
  })

  it('defaults to an empty array when data is missing', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper })
    expect(result.current.members).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('uploads an avatar blob via customFetch', async () => {
    vi.mocked(customFetch).mockResolvedValue({ data: undefined, status: 204 } as never)
    const { result } = renderHook(() => useUploadAvatarMutation(), { wrapper })
    await result.current.mutateAsync({ id: 'm1', blob: new Blob(['x'], { type: 'image/jpeg' }) })
    await waitFor(() => expect(customFetch).toHaveBeenCalled())
    expect(vi.mocked(customFetch).mock.calls[0][0]).toBe('/api/v1/members/m1/avatar')
    expect(vi.mocked(customFetch).mock.calls[0][1]?.method).toBe('PUT')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/useMembersQuery.test.tsx`
Expected: FAIL — cannot resolve `./useMembersQuery`.

- [ ] **Step 4: Create the hooks**

Create `frontend/src/features/members/useMembersQuery.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useListMembers,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  getListMembersQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { MemberResponse } from '@/api/generated/model'
import { customFetch } from '@/api/customFetch'

export function useMembers() {
  const query = useListMembers()
  return {
    members: (query.data?.data ?? []) as MemberResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateMemberMutation() {
  const queryClient = useQueryClient()
  return useCreateMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useUpdateMemberMutation() {
  const queryClient = useQueryClient()
  return useUpdateMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useDeleteMemberMutation() {
  const queryClient = useQueryClient()
  return useDeleteMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useUploadAvatarMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, blob }: { id: string; blob: Blob }) =>
      customFetch(`/api/v1/members/${id}/avatar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
  })
}
```

> **Note:** verify the generated mutation hooks accept a `{ mutation: { onSuccess } }` options object (Orval's convention). If your Orval version names the option differently, match the generated signature.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/useMembersQuery.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/test/testUtils.tsx frontend/src/features/members/useMembersQuery.ts \
        frontend/src/features/members/useMembersQuery.test.tsx
git commit -m "feat(frontend): add member query/mutation hooks and test utils"
```

---

### Task 6: MemberCard + MemberGrid

**Files:**
- Create: `frontend/src/features/members/MemberCard.tsx`
- Create: `frontend/src/features/members/MemberGrid.tsx`
- Test: `frontend/src/features/members/MemberGrid.test.tsx`

**Interfaces:**
- Consumes: `MemberResponse`, `MEMBER_COLORS`, `MemberColor`, `roleLabel`.
- Produces:
  - `MemberCard({ member, onClick? })` — avatar (image or initial), colored ring, name, role label; a `<button>` with `aria-label={member.name}`.
  - `MemberGrid({ members, onSelect? })` — responsive grid; empty state „Noch keine Familienmitglieder angelegt.".

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/members/MemberGrid.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberGrid } from './MemberGrid'
import type { MemberResponse } from '@/api/generated/model'

const base: MemberResponse = {
  id: '1', name: 'Anna', role: 'parent', color: 'blue',
  isActive: true, createdAt: '2026-07-22T10:00:00Z', updatedAt: '2026-07-22T10:00:00Z',
} as MemberResponse

describe('MemberGrid', () => {
  it('shows the empty state without members', () => {
    render(<MemberGrid members={[]} />)
    expect(screen.getByText('Noch keine Familienmitglieder angelegt.')).toBeInTheDocument()
  })

  it('renders a tile with name and role label', () => {
    render(<MemberGrid members={[base]} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Elternteil')).toBeInTheDocument()
    // no avatar → initial letter shown
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders an avatar image when avatarUrl is present', () => {
    render(<MemberGrid members={[{ ...base, avatarUrl: '/api/v1/members/1/avatar' }]} />)
    const img = screen.getByRole('img', { name: 'Anna' })
    expect(img).toHaveAttribute('src', '/api/v1/members/1/avatar')
  })

  it('calls onSelect when a tile is clicked', () => {
    const onSelect = vi.fn()
    render(<MemberGrid members={[{ ...base, role: 'child' }]} onSelect={onSelect} />)
    expect(screen.getByText('Kind')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/MemberGrid.test.tsx`
Expected: FAIL — cannot resolve `./MemberGrid`.

- [ ] **Step 3: Create MemberCard**

Create `frontend/src/features/members/MemberCard.tsx`:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { MEMBER_COLORS, roleLabel, type MemberColor } from './colors'

export function MemberCard({
  member,
  onClick,
}: {
  member: MemberResponse
  onClick?: () => void
}) {
  const ring = MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={member.name}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-white"
    >
      <span
        className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-slate-700"
        style={{ boxShadow: `0 0 0 4px ${ring}` }}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-white">{member.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="text-lg font-semibold text-white">{member.name}</span>
      <span className="text-sm text-slate-400">{roleLabel(member.role)}</span>
    </button>
  )
}
```

- [ ] **Step 4: Create MemberGrid**

Create `frontend/src/features/members/MemberGrid.tsx`:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { MemberCard } from './MemberCard'

export function MemberGrid({
  members,
  onSelect,
}: {
  members: MemberResponse[]
  onSelect?: (member: MemberResponse) => void
}) {
  if (members.length === 0) {
    return (
      <p className="text-slate-400 text-center py-8">Noch keine Familienmitglieder angelegt.</p>
    )
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {members.map((member) => (
        <MemberCard key={member.id} member={member} onClick={() => onSelect?.(member)} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/MemberGrid.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/members/MemberCard.tsx frontend/src/features/members/MemberGrid.tsx \
        frontend/src/features/members/MemberGrid.test.tsx
git commit -m "feat(frontend): add MemberCard and MemberGrid"
```

---

### Task 7: Avatar compression + AvatarUpload

**Files:**
- Create: `frontend/src/features/members/compressImage.ts`
- Create: `frontend/src/features/members/AvatarUpload.tsx`
- Test: `frontend/src/features/members/compressImage.test.ts`
- Test: `frontend/src/features/members/AvatarUpload.test.tsx`

**Interfaces:**
- Consumes: browser `FileReader`/`Image`/`<canvas>`, `useUploadAvatarMutation`.
- Produces:
  - `class ImageValidationError extends Error`
  - `compressImage(file, maxEdge=512, quality=0.85): Promise<Blob>` — validates MIME and 20 MB cap, scales longest edge to ≤ `maxEdge`, exports `image/jpeg`, rejects results > 500 KB, throws `ImageValidationError` with the German texts below.
  - `AvatarUpload({ memberId, currentAvatarUrl?, onUploaded? })` — file input, preview, error display, upload.

Error texts (verbatim):
| Situation | Text |
|-----------|------|
| Kein Bild-MIME | „Bitte wähle eine Bilddatei aus." |
| > 20 MB | „Das Bild ist zu groß. Bitte wähle ein kleineres Bild." |
| > 500 KB nach Komprimierung | „Das Bild konnte nicht ausreichend komprimiert werden." |
| Canvas-Fehler | „Fehler beim Verarbeiten des Bildes." |
| HTTP 413 (Serverfehler) | „Das Bild ist zu groß für den Server." |

- [ ] **Step 1: Write the failing compression test**

Create `frontend/src/features/members/compressImage.test.ts`:

```ts
import { vi } from 'vitest'
import { compressImage, ImageValidationError } from './compressImage'

function makeFile(type: string, size: number): File {
  const file = new File(['x'], 'a.png', { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

// Mock FileReader → resolves a data URL immediately.
class FakeReader {
  onload: (() => void) | null = null
  result = 'data:image/png;base64,AAAA'
  readAsDataURL() { this.onload?.() }
}

// Mock Image → fires onload with configurable dimensions.
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 1024
  height = 512
  set src(_v: string) { this.onload?.() }
}

function stubCanvas(blob: Blob | null) {
  const ctx = { drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    blob === undefined ? null : (ctx as unknown as CanvasRenderingContext2D),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob))
}

describe('compressImage', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', FakeReader)
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects non-image files', async () => {
    await expect(compressImage(makeFile('text/plain', 100)))
      .rejects.toThrow('Bitte wähle eine Bilddatei aus.')
  })

  it('rejects files larger than 20 MB', async () => {
    await expect(compressImage(makeFile('image/png', 21 * 1024 * 1024)))
      .rejects.toThrow('Das Bild ist zu groß. Bitte wähle ein kleineres Bild.')
  })

  it('throws a canvas error when 2d context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('throws a canvas error when toBlob yields null', async () => {
    stubCanvas(null)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('rejects when the compressed blob is still too large', async () => {
    const big = new Blob(['x'])
    Object.defineProperty(big, 'size', { value: 600 * 1024 })
    stubCanvas(big)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Das Bild konnte nicht ausreichend komprimiert werden.')
  })

  it('returns the compressed blob on success', async () => {
    const ok = new Blob(['x'])
    Object.defineProperty(ok, 'size', { value: 100 * 1024 })
    stubCanvas(ok)
    const result = await compressImage(makeFile('image/png', 1000))
    expect(result).toBeInstanceOf(Blob)
    expect(result).toBeInstanceOf(Blob)
  })

  it('exposes ImageValidationError', () => {
    expect(new ImageValidationError('x')).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/compressImage.test.ts`
Expected: FAIL — cannot resolve `./compressImage`.

- [ ] **Step 3: Create compressImage**

Create `frontend/src/features/members/compressImage.ts`:

```ts
export class ImageValidationError extends Error {}

const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_BYTES = 500 * 1024

const ERR_NOT_IMAGE = 'Bitte wähle eine Bilddatei aus.'
const ERR_TOO_LARGE = 'Das Bild ist zu groß. Bitte wähle ein kleineres Bild.'
const ERR_COMPRESS = 'Das Bild konnte nicht ausreichend komprimiert werden.'
const ERR_CANVAS = 'Fehler beim Verarbeiten des Bildes.'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new ImageValidationError(ERR_CANVAS))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ImageValidationError(ERR_CANVAS))
    image.src = dataUrl
  })
}

export async function compressImage(file: File, maxEdge = 512, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageValidationError(ERR_NOT_IMAGE)
  if (file.size > MAX_INPUT_BYTES) throw new ImageValidationError(ERR_TOO_LARGE)

  const dataUrl = await fileToDataUrl(file)
  const image = await loadImage(dataUrl)

  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageValidationError(ERR_CANVAS)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new ImageValidationError(ERR_CANVAS)
  if (blob.size > MAX_OUTPUT_BYTES) throw new ImageValidationError(ERR_COMPRESS)
  return blob
}
```

- [ ] **Step 4: Run compression test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/compressImage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing AvatarUpload test**

Create `frontend/src/features/members/AvatarUpload.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./compressImage', async () => {
  const actual = await vi.importActual<typeof import('./compressImage')>('./compressImage')
  return { ...actual, compressImage: vi.fn() }
})
vi.mock('./useMembersQuery', () => ({ useUploadAvatarMutation: vi.fn() }))

import { compressImage, ImageValidationError } from './compressImage'
import { useUploadAvatarMutation } from './useMembersQuery'
import { AvatarUpload } from './AvatarUpload'

function selectFile() {
  const input = screen.getByLabelText('Avatar auswählen') as HTMLInputElement
  const file = new File(['x'], 'a.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('AvatarUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview' })
    vi.mocked(useUploadAvatarMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useUploadAvatarMutation>)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('shows a validation error when compression rejects', async () => {
    vi.mocked(compressImage).mockRejectedValue(new ImageValidationError('Bitte wähle eine Bilddatei aus.'))
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    expect(await screen.findByText('Bitte wähle eine Bilddatei aus.')).toBeInTheDocument()
  })

  it('shows the server message on upload failure', async () => {
    vi.mocked(compressImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    vi.mocked(useUploadAvatarMutation).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Das Bild ist zu groß für den Server.')),
    } as unknown as ReturnType<typeof useUploadAvatarMutation>)
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    expect(await screen.findByText('Das Bild ist zu groß für den Server.')).toBeInTheDocument()
  })

  it('uploads and calls onUploaded on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUploadAvatarMutation).mockReturnValue({ mutateAsync } as unknown as ReturnType<typeof useUploadAvatarMutation>)
    vi.mocked(compressImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    const onUploaded = vi.fn()
    render(<AvatarUpload memberId="m1" onUploaded={onUploaded} />)
    selectFile()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', blob: expect.any(Blob) }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
  })

  it('ignores an empty file selection', () => {
    render(<AvatarUpload memberId="m1" />)
    const input = screen.getByLabelText('Avatar auswählen') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(compressImage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the AvatarUpload test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/AvatarUpload.test.tsx`
Expected: FAIL — cannot resolve `./AvatarUpload`.

- [ ] **Step 7: Create AvatarUpload**

Create `frontend/src/features/members/AvatarUpload.tsx`:

```tsx
import { useState } from 'react'
import { compressImage, ImageValidationError } from './compressImage'
import { useUploadAvatarMutation } from './useMembersQuery'

export function AvatarUpload({
  memberId,
  currentAvatarUrl,
  onUploaded,
}: {
  memberId: string
  currentAvatarUrl?: string | null
  onUploaded?: () => void
}) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const upload = useUploadAvatarMutation()

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const blob = await compressImage(file)
      setPreview(URL.createObjectURL(blob))
      await upload.mutateAsync({ id: memberId, blob })
      onUploaded?.()
    } catch (err) {
      if (err instanceof ImageValidationError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
      else setError('Fehler beim Verarbeiten des Bildes.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Avatar-Vorschau" className="w-full h-full object-cover" />
        ) : (
          <span className="text-slate-400 text-sm">Kein Bild</span>
        )}
      </span>
      <label className="cursor-pointer rounded-xl bg-slate-700 px-4 py-3 text-white min-h-[44px] flex items-center">
        Bild auswählen
        <input
          type="file"
          accept="image/*"
          aria-label="Avatar auswählen"
          className="hidden"
          onChange={handleFile}
        />
      </label>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 8: Run the AvatarUpload test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/AvatarUpload.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/members/compressImage.ts frontend/src/features/members/AvatarUpload.tsx \
        frontend/src/features/members/compressImage.test.ts frontend/src/features/members/AvatarUpload.test.tsx
git commit -m "feat(frontend): add client-side avatar compression and upload"
```

---

### Task 8: MemberForm + Add/Edit dialogs

**Files:**
- Create: `frontend/src/features/members/MemberForm.tsx`
- Create: `frontend/src/features/members/AddMemberDialog.tsx`
- Create: `frontend/src/features/members/EditMemberDialog.tsx`
- Test: `frontend/src/features/members/MemberForm.test.tsx`
- Test: `frontend/src/features/members/MemberDialogs.test.tsx`

**Interfaces:**
- Consumes: `MEMBER_COLOR_KEYS`, `MemberColor`, `MemberRole`, `MemberResponse`, `MemberRequest`, `useCreateMemberMutation`, `useUpdateMemberMutation`, `useDeleteMemberMutation`, `AvatarUpload`.
- Produces:
  - `type MemberFormValues = { name: string; role: MemberRole; color: MemberColor; dateOfBirth: string }`
  - `MemberForm({ initial, submitLabel, isSubmitting, error, onSubmit, onCancel })` — validates trimmed name ≥ 2, emits `MemberFormValues`.
  - `AddMemberDialog({ onClose })` — creates then closes.
  - `EditMemberDialog({ member, onClose })` — updates, embeds `AvatarUpload`, offers delete.

- [ ] **Step 1: Write the failing MemberForm test**

Create `frontend/src/features/members/MemberForm.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberForm } from './MemberForm'

describe('MemberForm', () => {
  it('blocks submit when the trimmed name is too short', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' a ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')).toBeInTheDocument()
  })

  it('submits trimmed values', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Anna  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Anna', role: 'child', color: 'blue' }),
    )
  })

  it('prefills from initial values and cancels', () => {
    const onCancel = vi.fn()
    render(
      <MemberForm
        initial={{ name: 'Bea', role: 'parent', color: 'pink', dateOfBirth: '2015-01-01' }}
        submitLabel="Aktualisieren"
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Bea')
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MemberForm submitLabel="Speichern" error="Serverfehler" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Serverfehler')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/MemberForm.test.tsx`
Expected: FAIL — cannot resolve `./MemberForm`.

- [ ] **Step 3: Create MemberForm**

Create `frontend/src/features/members/MemberForm.tsx`:

```tsx
import { useState } from 'react'
import { MEMBER_COLORS, MEMBER_COLOR_KEYS, type MemberColor, type MemberRole } from './colors'

export interface MemberFormValues {
  name: string
  role: MemberRole
  color: MemberColor
  dateOfBirth: string
}

const DEFAULTS: MemberFormValues = { name: '', role: 'child', color: 'blue', dateOfBirth: '' }

export function MemberForm({
  initial,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<MemberFormValues>
  submitLabel: string
  isSubmitting?: boolean
  error?: string | null
  onSubmit: (values: MemberFormValues) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<MemberFormValues>({ ...DEFAULTS, ...initial })
  const [nameError, setNameError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const name = values.name.trim()
    if (name.length < 2) {
      setNameError('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')
      return
    }
    setNameError(null)
    onSubmit({ ...values, name })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-white">
        Name
        <input
          className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </label>
      {nameError && <p className="text-red-400 text-sm">{nameError}</p>}

      <fieldset className="flex gap-4 text-white">
        <legend className="mb-1">Rolle</legend>
        {(['parent', 'child'] as MemberRole[]).map((role) => (
          <label key={role} className="flex items-center gap-2 min-h-[44px]">
            <input
              type="radio"
              name="role"
              checked={values.role === role}
              onChange={() => setValues({ ...values, role })}
            />
            {role === 'parent' ? 'Elternteil' : 'Kind'}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1 text-white">
        <span>Farbe</span>
        <div className="flex gap-2 flex-wrap">
          {MEMBER_COLOR_KEYS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={values.color === color}
              onClick={() => setValues({ ...values, color })}
              className="w-11 h-11 rounded-full"
              style={{
                backgroundColor: MEMBER_COLORS[color],
                outline: values.color === color ? '3px solid white' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-white">
        Geburtstag (optional)
        <input
          type="date"
          className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
          value={values.dateOfBirth}
          onChange={(e) => setValues({ ...values, dateOfBirth: e.target.value })}
        />
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 min-h-[44px] bg-slate-600 text-white"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl px-4 py-3 min-h-[44px] bg-blue-500 text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run MemberForm test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/MemberForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing dialogs test**

Create `frontend/src/features/members/MemberDialogs.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./useMembersQuery', () => ({
  useCreateMemberMutation: vi.fn(),
  useUpdateMemberMutation: vi.fn(),
  useDeleteMemberMutation: vi.fn(),
}))
vi.mock('./AvatarUpload', () => ({ AvatarUpload: () => <div>AvatarUpload</div> }))

import {
  useCreateMemberMutation,
  useUpdateMemberMutation,
  useDeleteMemberMutation,
} from './useMembersQuery'
import { AddMemberDialog } from './AddMemberDialog'
import { EditMemberDialog } from './EditMemberDialog'
import type { MemberResponse } from '@/api/generated/model'

const member: MemberResponse = {
  id: 'm1', name: 'Anna', role: 'parent', color: 'blue', isActive: true,
  createdAt: '2026-07-22T10:00:00Z', updatedAt: '2026-07-22T10:00:00Z',
} as MemberResponse

describe('member dialogs', () => {
  it('AddMemberDialog creates a member and closes', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<AddMemberDialog onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Neu' }) }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('EditMemberDialog updates a member', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const onClose = vi.fn()
    render(<EditMemberDialog member={member} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', data: expect.objectContaining({ name: 'Anna' }) }))
  })

  it('EditMemberDialog deletes a member', async () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<EditMemberDialog member={member} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/members/MemberDialogs.test.tsx`
Expected: FAIL — dialogs unresolved.

- [ ] **Step 7: Create the dialog shell + AddMemberDialog**

Create `frontend/src/features/members/AddMemberDialog.tsx`:

```tsx
import { useState } from 'react'
import { MemberForm, type MemberFormValues } from './MemberForm'
import { useCreateMemberMutation } from './useMembersQuery'

export function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateMemberMutation()
  const [error, setError] = useState<string | null>(null)

  async function submit(values: MemberFormValues) {
    setError(null)
    try {
      await create.mutateAsync({
        data: {
          name: values.name,
          role: values.role,
          color: values.color,
          dateOfBirth: values.dateOfBirth || undefined,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Mitglied hinzufügen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-800 p-6">
        <h2 className="text-xl font-bold text-white mb-4">Mitglied hinzufügen</h2>
        <MemberForm
          submitLabel="Anlegen"
          isSubmitting={create.isPending}
          error={error}
          onSubmit={submit}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create EditMemberDialog**

Create `frontend/src/features/members/EditMemberDialog.tsx`:

```tsx
import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { MemberForm, type MemberFormValues } from './MemberForm'
import { AvatarUpload } from './AvatarUpload'
import { useUpdateMemberMutation, useDeleteMemberMutation } from './useMembersQuery'
import type { MemberColor, MemberRole } from './colors'

export function EditMemberDialog({
  member,
  onClose,
}: {
  member: MemberResponse
  onClose: () => void
}) {
  const update = useUpdateMemberMutation()
  const remove = useDeleteMemberMutation()
  const [error, setError] = useState<string | null>(null)

  async function submit(values: MemberFormValues) {
    setError(null)
    try {
      await update.mutateAsync({
        id: member.id,
        data: {
          name: values.name,
          role: values.role,
          color: values.color,
          dateOfBirth: values.dateOfBirth || undefined,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  async function deleteMember() {
    setError(null)
    try {
      await remove.mutateAsync({ id: member.id })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entfernen fehlgeschlagen.')
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Mitglied bearbeiten"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-800 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Mitglied bearbeiten</h2>
        <div className="mb-4">
          <AvatarUpload memberId={member.id} currentAvatarUrl={member.avatarUrl} />
        </div>
        <MemberForm
          initial={{
            name: member.name,
            role: member.role as MemberRole,
            color: member.color as MemberColor,
            dateOfBirth: member.dateOfBirth ?? '',
          }}
          submitLabel="Aktualisieren"
          isSubmitting={update.isPending}
          error={error}
          onSubmit={submit}
          onCancel={onClose}
        />
        <button
          type="button"
          onClick={deleteMember}
          className="mt-4 w-full rounded-xl px-4 py-3 min-h-[44px] bg-red-600 text-white"
        >
          Entfernen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run dialogs test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/members/MemberDialogs.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/members/MemberForm.tsx frontend/src/features/members/AddMemberDialog.tsx \
        frontend/src/features/members/EditMemberDialog.tsx frontend/src/features/members/MemberForm.test.tsx \
        frontend/src/features/members/MemberDialogs.test.tsx
git commit -m "feat(frontend): add member form and add/edit dialogs"
```

---

### Task 9: PinInputDialog (numeric keypad)

**Files:**
- Create: `frontend/src/features/pin/PinInputDialog.tsx`
- Test: `frontend/src/features/pin/PinInputDialog.test.tsx`

**Interfaces:**
- Produces: `PinInputDialog({ title, error?, onSubmit, onCancel })` — masked entry (dots), 4×3 keypad (1-9, „Löschen", 0, „←"), confirm „Bestätigen" enabled only for 4–6 digits, calls `onSubmit(pin: string)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/pin/PinInputDialog.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinInputDialog } from './PinInputDialog'

function typeDigits(digits: string) {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }))
}

describe('PinInputDialog', () => {
  it('keeps confirm disabled below 4 digits', () => {
    render(<PinInputDialog title="PIN eingeben" onSubmit={() => {}} onCancel={() => {}} />)
    typeDigits('123')
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled()
  })

  it('submits a valid 4-digit pin', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('backspace removes the last digit', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('12345')
    fireEvent.click(screen.getByRole('button', { name: '←' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('clear empties the entry', () => {
    render(<PinInputDialog title="PIN eingeben" onSubmit={() => {}} onCancel={() => {}} />)
    typeDigits('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled()
  })

  it('does not exceed 6 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('1234567')
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('123456')
  })

  it('renders an error and cancels', () => {
    const onCancel = vi.fn()
    render(<PinInputDialog title="PIN eingeben" error="Falsche PIN" onSubmit={() => {}} onCancel={onCancel} />)
    expect(screen.getByText('Falsche PIN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/pin/PinInputDialog.test.tsx`
Expected: FAIL — cannot resolve `./PinInputDialog`.

- [ ] **Step 3: Create PinInputDialog**

Create `frontend/src/features/pin/PinInputDialog.tsx`:

```tsx
import { useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

export function PinInputDialog({
  title,
  error,
  onSubmit,
  onCancel,
}: {
  title: string
  error?: string | null
  onSubmit: (pin: string) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const valid = pin.length >= 4 && pin.length <= 6

  function press(key: string) {
    if (key === 'Löschen') setPin('')
    else if (key === '←') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < 6 ? p + key : p))
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xs rounded-2xl bg-slate-800 p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white text-center">{title}</h2>
        <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-white' : 'bg-slate-600'}`}
            />
          ))}
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => press(key)}
              className="min-h-[56px] rounded-xl bg-slate-700 text-white text-lg"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl bg-slate-600 text-white"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(pin)}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/pin/PinInputDialog.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pin/PinInputDialog.tsx frontend/src/features/pin/PinInputDialog.test.tsx
git commit -m "feat(frontend): add numeric PIN input dialog"
```

---

### Task 10: SetupGuard + routing

**Files:**
- Create: `frontend/src/routing/SetupGuard.tsx`
- Create: `frontend/src/routing/NotFound.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/routing/SetupGuard.test.tsx`

**Interfaces:**
- Consumes: generated `useGetSetupStatus`, React Router `Navigate`.
- Produces:
  - `SetupGuard({ children })` — loading → „Lädt …"; error/no data → „Server nicht erreichbar" (does **not** redirect to the wizard); `setupCompleted === false` → `<Navigate to="/setup" replace />`; else renders `children`.
  - `NotFound` — 404 page „Seite nicht gefunden".
  - `App` routes: `/setup` → `SetupWizard`, `/` → guarded `SettingsView`, `*` → `NotFound`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routing/SetupGuard.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useGetSetupStatus: vi.fn() }))
import { useGetSetupStatus } from '@/api/generated/endpoints/familyHubAPI'
import { SetupGuard } from './SetupGuard'

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SetupGuard><div>Geschützt</div></SetupGuard>} />
        <Route path="/setup" element={<div>Wizard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SetupGuard', () => {
  it('shows a loading state', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({ isLoading: true, isError: false, data: undefined } as never)
    renderGuard()
    expect(screen.getByText('Lädt …')).toBeInTheDocument()
  })

  it('shows an error page and does NOT redirect to the wizard on network failure', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({ isLoading: false, isError: true, data: undefined } as never)
    renderGuard()
    expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument()
    expect(screen.queryByText('Wizard')).not.toBeInTheDocument()
  })

  it('redirects to the wizard when setup is incomplete', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      isLoading: false, isError: false, data: { data: { setupCompleted: false } },
    } as never)
    renderGuard()
    expect(screen.getByText('Wizard')).toBeInTheDocument()
  })

  it('renders children when setup is complete', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      isLoading: false, isError: false, data: { data: { setupCompleted: true } },
    } as never)
    renderGuard()
    expect(screen.getByText('Geschützt')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/routing/SetupGuard.test.tsx`
Expected: FAIL — cannot resolve `./SetupGuard`.

- [ ] **Step 3: Create SetupGuard**

Create `frontend/src/routing/SetupGuard.tsx`:

```tsx
import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useGetSetupStatus } from '@/api/generated/endpoints/familyHubAPI'

function FullScreen({ children, tone }: { children: ReactNode; tone: 'info' | 'error' }) {
  return (
    <div
      className={`flex items-center justify-center min-h-screen bg-slate-900 ${
        tone === 'error' ? 'text-red-400' : 'text-white'
      }`}
    >
      <p className="text-xl">{children}</p>
    </div>
  )
}

export function SetupGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGetSetupStatus()

  if (isLoading) return <FullScreen tone="info">Lädt …</FullScreen>
  if (isError || !data) return <FullScreen tone="error">Server nicht erreichbar</FullScreen>
  if (!data.data.setupCompleted) return <Navigate to="/setup" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Create NotFound**

Create `frontend/src/routing/NotFound.tsx`:

```tsx
export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
      <p className="text-xl">Seite nicht gefunden</p>
    </div>
  )
}
```

- [ ] **Step 5: Update App routing**

Replace `frontend/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SetupGuard } from '@/routing/SetupGuard'
import NotFound from '@/routing/NotFound'
import { SetupWizard } from '@/features/setup/SetupWizard'
import { SettingsView } from '@/features/settings/SettingsView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route
          path="/"
          element={
            <SetupGuard>
              <SettingsView />
            </SetupGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
```

> **Note:** `App.tsx` now imports `SetupWizard` (Task 11) and `SettingsView` (Task 12). Those imports will not resolve until those tasks are done — run the app/`type-check` only after Task 12. The `SetupGuard` test above is self-contained and passes now.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/routing/SetupGuard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routing/SetupGuard.tsx frontend/src/routing/NotFound.tsx \
        frontend/src/App.tsx frontend/src/routing/SetupGuard.test.tsx
git commit -m "feat(frontend): add setup guard, 404 page and app routing"
```

---

### Task 11: Setup wizard (Welcome, Members, PIN)

**Files:**
- Create: `frontend/src/features/setup/redirectHome.ts`
- Create: `frontend/src/features/setup/WelcomeStep.tsx`
- Create: `frontend/src/features/setup/MembersStep.tsx`
- Create: `frontend/src/features/setup/PinStep.tsx`
- Create: `frontend/src/features/setup/SetupWizard.tsx`
- Test: `frontend/src/features/setup/SetupWizard.test.tsx`

**Interfaces:**
- Consumes: `useGetSetupStatus`, `useUpdateSetupStep`, `useSetPin`, `useMembers`, `AddMemberDialog`, `MemberGrid`, `PinInputDialog`, `usePinSession`.
- Produces:
  - `redirectHome()` — `window.location.href = '/'` (mockable seam).
  - `WelcomeStep({ onNext })`, `MembersStep({ onNext })`, `PinStep({ onDone })`.
  - `SetupWizard` — reads `currentStep` for resume, shows „Schritt {n} von 3" + a percentage bar (33/66/100), advances via `updateSetupStep`, finishes by setting the PIN, storing the session, and calling `redirectHome()`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/setup/SetupWizard.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useGetSetupStatus: vi.fn(),
  useUpdateSetupStep: vi.fn(),
  useSetPin: vi.fn(),
}))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/members/AddMemberDialog', () => ({ AddMemberDialog: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close-add</button> }))
vi.mock('@/features/setup/redirectHome', () => ({ redirectHome: vi.fn() }))

import { useGetSetupStatus, useUpdateSetupStep, useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { useMembers } from '@/features/members/useMembersQuery'
import { redirectHome } from '@/features/setup/redirectHome'
import { SetupWizard } from './SetupWizard'

function setup({ step = 1, members = [] as unknown[] } = {}) {
  vi.mocked(useGetSetupStatus).mockReturnValue({
    data: { data: { currentStep: step } }, isLoading: false, isError: false,
  } as never)
  vi.mocked(useUpdateSetupStep).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
  vi.mocked(useSetPin).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }) } as never)
  vi.mocked(useMembers).mockReturnValue({ members, isLoading: false, isError: false } as never)
}

describe('SetupWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts at the welcome step', () => {
    setup({ step: 1 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Willkommen bei FamilyHub')).toBeInTheDocument()
    expect(screen.getByText('Schritt 1 von 3')).toBeInTheDocument()
  })

  it('resumes at the stored step', () => {
    setup({ step: 2, members: [] })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 2 von 3')).toBeInTheDocument()
    // Weiter disabled without members
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeDisabled()
  })

  it('enables Weiter on the members step when a member exists', () => {
    setup({ step: 2, members: [{ id: '1', name: 'Anna' }] })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeEnabled()
  })

  it('completes setup on the PIN step and redirects home', async () => {
    setup({ step: 3 })
    renderWithProviders(<SetupWizard />)
    // enter matching PINs
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(redirectHome).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/setup/SetupWizard.test.tsx`
Expected: FAIL — wizard files unresolved.

- [ ] **Step 3: Create redirectHome**

Create `frontend/src/features/setup/redirectHome.ts`:

```ts
export function redirectHome(): void {
  window.location.href = '/'
}
```

- [ ] **Step 4: Create WelcomeStep**

Create `frontend/src/features/setup/WelcomeStep.tsx`:

```tsx
export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-6 text-white text-center">
      <h1 className="text-3xl font-bold">Willkommen bei FamilyHub</h1>
      <p className="text-lg">
        Dein digitales Familien-Dashboard. Deine Daten bleiben auf deinem eigenen Server.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mx-auto rounded-xl bg-blue-500 px-6 py-3 min-h-[44px] text-white"
      >
        Los geht&apos;s →
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Create MembersStep**

Create `frontend/src/features/setup/MembersStep.tsx`:

```tsx
import { useState } from 'react'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'

export function MembersStep({ onNext }: { onNext: () => void }) {
  const { members } = useMembers()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-6 text-white">
      <h1 className="text-2xl font-bold text-center">Wer gehört zur Familie?</h1>
      <MemberGrid members={members} />
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mx-auto rounded-xl bg-slate-700 px-6 py-3 min-h-[44px] text-white"
      >
        Mitglied hinzufügen
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={members.length === 0}
        className="mx-auto rounded-xl bg-blue-500 px-6 py-3 min-h-[44px] text-white disabled:opacity-50"
      >
        Weiter →
      </button>
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
```

- [ ] **Step 6: Create PinStep**

Create `frontend/src/features/setup/PinStep.tsx`:

```tsx
import { useState } from 'react'
import { useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { PinInputDialog } from '@/features/pin/PinInputDialog'
import { redirectHome } from './redirectHome'

export function PinStep({ onDone }: { onDone?: () => void }) {
  const setPin = useSetPin()
  const { setSession } = usePinSession()
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function confirm(secondPin: string) {
    if (secondPin !== firstPin) {
      setError('Die PINs stimmen nicht überein.')
      setFirstPin(null)
      return
    }
    try {
      const result = await setPin.mutateAsync({ data: { pin: secondPin } })
      setSession(result.data.sessionToken)
      onDone?.()
      redirectHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht gesetzt werden.')
      setFirstPin(null)
    }
  }

  if (firstPin === null) {
    return (
      <PinInputDialog
        title="PIN vergeben"
        error={error}
        onSubmit={(pin) => {
          setError(null)
          setFirstPin(pin)
        }}
        onCancel={() => setError(null)}
      />
    )
  }

  return (
    <PinInputDialog
      title="PIN bestätigen"
      error={error}
      onSubmit={confirm}
      onCancel={() => setFirstPin(null)}
    />
  )
}
```

> The confirm button label in the first `PinInputDialog` is „Bestätigen" (from the keypad). The wizard test drives the two-step flow through the keypad; the „Weiter zur Bestätigung"/„Fertig" labels are provided by `SetupWizard` wrapping (next step) — see note in Step 7.

- [ ] **Step 7: Create SetupWizard**

Create `frontend/src/features/setup/SetupWizard.tsx`. It renders its own confirm labels for the PIN step so the two-phase flow reads „Weiter zur Bestätigung" then „Fertig":

```tsx
import { useEffect, useState } from 'react'
import { useGetSetupStatus, useUpdateSetupStep, useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { useMembers } from '@/features/members/useMembersQuery'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { WelcomeStep } from './WelcomeStep'
import { MembersStep } from './MembersStep'
import { redirectHome } from './redirectHome'

const PERCENT: Record<number, string> = { 1: '33%', 2: '66%', 3: '100%' }

export function SetupWizard() {
  const status = useGetSetupStatus()
  const updateStep = useUpdateSetupStep()
  const setPin = useSetPin()
  const { members } = useMembers()
  const { setSession } = usePinSession()

  const [step, setStep] = useState(1)
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const resume = status.data?.data.currentStep
    if (resume) setStep(resume)
  }, [status.data])

  async function goToStep(next: number) {
    await updateStep.mutateAsync({ data: { step: next } })
    setStep(next)
  }

  function pressDigit(digit: string) {
    if (digit === 'Löschen') setEntry('')
    else if (digit === '←') setEntry((p) => p.slice(0, -1))
    else setEntry((p) => (p.length < 6 ? p + digit : p))
  }

  async function confirmSecond() {
    if (entry !== firstPin) {
      setError('Die PINs stimmen nicht überein.')
      setFirstPin(null)
      setEntry('')
      return
    }
    try {
      const result = await setPin.mutateAsync({ data: { pin: entry } })
      setSession(result.data.sessionToken)
      redirectHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht gesetzt werden.')
      setFirstPin(null)
      setEntry('')
    }
  }

  const valid = entry.length >= 4 && entry.length <= 6
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="text-slate-300 mb-2">Schritt {step} von 3</p>
        <div className="h-2 rounded-full bg-slate-700 mb-8">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: PERCENT[step] }} />
        </div>

        {step === 1 && <WelcomeStep onNext={() => goToStep(2)} />}
        {step === 2 && <MembersStep onNext={() => goToStep(3)} />}
        {step === 3 && (
          <div className="flex flex-col gap-4 text-white">
            <h1 className="text-2xl font-bold text-center">
              {firstPin === null ? 'PIN vergeben' : 'PIN bestätigen'}
            </h1>
            <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`w-4 h-4 rounded-full ${i < entry.length ? 'bg-white' : 'bg-slate-600'}`} />
              ))}
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => pressDigit(key)}
                  className="min-h-[56px] rounded-xl bg-slate-700 text-white text-lg"
                >
                  {key}
                </button>
              ))}
            </div>
            {firstPin === null ? (
              <button
                type="button"
                disabled={!valid}
                onClick={() => { setFirstPin(entry); setEntry(''); setError(null) }}
                className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
              >
                Weiter zur Bestätigung
              </button>
            ) : (
              <button
                type="button"
                disabled={!valid}
                onClick={confirmSecond}
                className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
              >
                Fertig
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

> **DRY note:** `SetupWizard` inlines the keypad for its two-phase labels rather than reusing `PinInputDialog`, because the wizard needs distinct confirm labels („Weiter zur Bestätigung"/„Fertig") and no modal overlay. `PinStep.tsx` remains the reusable dialog-based variant for non-wizard contexts; it is exported but not used by the wizard. If you prefer strict DRY, delete `PinStep.tsx` — it is not imported anywhere. (Kept here to match the design's file list.)

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/setup/SetupWizard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/setup/
git commit -m "feat(frontend): add setup wizard with welcome, members and PIN steps"
```

---

### Task 12: SettingsView + ChangePinDialog

**Files:**
- Create: `frontend/src/features/settings/ChangePinDialog.tsx`
- Create: `frontend/src/features/settings/SettingsView.tsx`
- Test: `frontend/src/features/settings/ChangePinDialog.test.tsx`
- Test: `frontend/src/features/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `useMembers`, `MemberGrid`, `AddMemberDialog`, `EditMemberDialog`, `usePinSession`, `useVerifyPin`, `useChangePin`, `PinInputDialog`.
- Produces:
  - `ChangePinDialog({ onClose })` — three-phase PIN entry (aktuelle → neue → bestätigen) → `useChangePin`.
  - `SettingsView` — home page. Locked until a PIN session exists: „Zum Bearbeiten entsperren" opens `PinInputDialog` → `verify-pin` → `setSession`. Unlocked: „Mitglied hinzufügen", tap a tile to edit, „PIN ändern".

- [ ] **Step 1: Write the failing ChangePinDialog test**

Create `frontend/src/features/settings/ChangePinDialog.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useChangePin: vi.fn() }))
import { useChangePin } from '@/api/generated/endpoints/familyHubAPI'
import { ChangePinDialog } from './ChangePinDialog'

function enter(pin: string) {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }))
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
}

describe('ChangePinDialog', () => {
  it('walks current → new → confirm and calls changePin', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync } as never)
    const onClose = vi.fn()
    render(<ChangePinDialog onClose={onClose} />)

    expect(screen.getByText('Aktuelle PIN')).toBeInTheDocument()
    enter('1234')
    expect(screen.getByText('Neue PIN')).toBeInTheDocument()
    enter('5678')
    expect(screen.getByText('Neue PIN bestätigen')).toBeInTheDocument()
    enter('5678')

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ data: { currentPin: '1234', newPin: '5678' } }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows an error when confirmation does not match', () => {
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync: vi.fn() } as never)
    render(<ChangePinDialog onClose={() => {}} />)
    enter('1234')
    enter('5678')
    enter('0000')
    expect(screen.getByText('Die neuen PINs stimmen nicht überein.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/settings/ChangePinDialog.test.tsx`
Expected: FAIL — cannot resolve `./ChangePinDialog`.

- [ ] **Step 3: Create ChangePinDialog**

Create `frontend/src/features/settings/ChangePinDialog.tsx`:

```tsx
import { useState } from 'react'
import { useChangePin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from '@/features/pin/PinInputDialog'

type Phase = 'current' | 'next' | 'confirm'

export function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const changePin = useChangePin()
  const [phase, setPhase] = useState<Phase>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submitConfirm(confirmPin: string) {
    if (confirmPin !== newPin) {
      setError('Die neuen PINs stimmen nicht überein.')
      setPhase('next')
      return
    }
    try {
      await changePin.mutateAsync({ data: { currentPin, newPin } })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht geändert werden.')
      setPhase('current')
    }
  }

  if (phase === 'current') {
    return (
      <PinInputDialog
        title="Aktuelle PIN"
        error={error}
        onCancel={onClose}
        onSubmit={(pin) => {
          setError(null)
          setCurrentPin(pin)
          setPhase('next')
        }}
      />
    )
  }
  if (phase === 'next') {
    return (
      <PinInputDialog
        title="Neue PIN"
        error={error}
        onCancel={onClose}
        onSubmit={(pin) => {
          setError(null)
          setNewPin(pin)
          setPhase('confirm')
        }}
      />
    )
  }
  return <PinInputDialog title="Neue PIN bestätigen" error={error} onCancel={onClose} onSubmit={submitConfirm} />
}
```

- [ ] **Step 4: Run ChangePinDialog test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/settings/ChangePinDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing SettingsView test**

Create `frontend/src/features/settings/SettingsView.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useVerifyPin: vi.fn() }))
vi.mock('@/features/members/AddMemberDialog', () => ({ AddMemberDialog: () => <div>AddDialog</div> }))
vi.mock('@/features/members/EditMemberDialog', () => ({ EditMemberDialog: () => <div>EditDialog</div> }))
vi.mock('@/features/settings/ChangePinDialog', () => ({ ChangePinDialog: () => <div>ChangePinDialog</div> }))

const setSession = vi.fn()
let hasPinSession = false
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession, sessionToken: null, clearSession: vi.fn() }),
}))

import { useMembers } from '@/features/members/useMembersQuery'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { SettingsView } from './SettingsView'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

describe('SettingsView', () => {
  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useVerifyPin).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }) } as never)
  })

  it('shows a locked state and unlocks via PIN', async () => {
    render(<SettingsView />)
    expect(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' }))
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(setSession).toHaveBeenCalledWith('tok'))
  })

  it('shows management actions when unlocked', () => {
    hasPinSession = true
    render(<SettingsView />)
    expect(screen.getByRole('button', { name: 'Mitglied hinzufügen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PIN ändern' })).toBeInTheDocument()
  })

  it('opens the edit dialog when a member tile is tapped while unlocked', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: FAIL — cannot resolve `./SettingsView`.

- [ ] **Step 7: Create SettingsView**

Create `frontend/src/features/settings/SettingsView.tsx`:

```tsx
import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from '@/features/pin/PinInputDialog'
import { ChangePinDialog } from './ChangePinDialog'

export function SettingsView() {
  const { members } = useMembers()
  const { hasPinSession, setSession } = usePinSession()
  const verifyPin = useVerifyPin()

  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)
  const [changingPin, setChangingPin] = useState(false)

  async function unlock(pin: string) {
    setUnlockError(null)
    try {
      const result = await verifyPin.mutateAsync({ data: { pin } })
      setSession(result.data.sessionToken)
      setUnlocking(false)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Falsche PIN.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-white">Einstellungen</h1>

        <MemberGrid members={members} onSelect={hasPinSession ? setEditing : undefined} />

        {hasPinSession ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-xl bg-slate-700 px-5 py-3 min-h-[44px] text-white"
            >
              Mitglied hinzufügen
            </button>
            <button
              type="button"
              onClick={() => setChangingPin(true)}
              className="rounded-xl bg-slate-700 px-5 py-3 min-h-[44px] text-white"
            >
              PIN ändern
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setUnlocking(true)}
            className="self-start rounded-xl bg-blue-500 px-5 py-3 min-h-[44px] text-white"
          >
            Zum Bearbeiten entsperren
          </button>
        )}
      </div>

      {unlocking && (
        <PinInputDialog
          title="PIN eingeben"
          error={unlockError}
          onSubmit={unlock}
          onCancel={() => { setUnlocking(false); setUnlockError(null) }}
        />
      )}
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
      {changingPin && <ChangePinDialog onClose={() => setChangingPin(false)} />}
    </div>
  )
}
```

- [ ] **Step 8: Run SettingsView test to verify it passes**

Run: `cd frontend && npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the full frontend check (types, lint, coverage)**

Run: `cd frontend && npm run check`
Expected: `tsc` clean, ESLint 0 warnings, all Vitest tests pass, coverage gate (90% lines/functions/statements, 100% branches) holds.

> If branch coverage fails, open `frontend/coverage/index.html`, find the uncovered branch, and add a focused test. Do not lower thresholds.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/settings/
git commit -m "feat(frontend): add settings view with PIN unlock and change-PIN"
```

---

### Task 13: End-to-end smoke test (Playwright)

**Files:**
- Create: `frontend/e2e/setup-wizard.spec.ts`

**Interfaces:**
- Consumes: the built app + mocked API routes (Playwright `page.route`), mirroring the existing `e2e/health.spec.ts` mocking style.
- Produces: a browser-level check that an incomplete setup redirects to `/setup` and the welcome step renders.

- [ ] **Step 1: Write the E2E test**

Create `frontend/e2e/setup-wizard.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('redirects to the setup wizard when setup is incomplete', async ({ page }) => {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: false, currentStep: 1, hasFamilyMembers: false, hasPin: false }),
    }),
  )
  await page.route('**/api/v1/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByText('Willkommen bei FamilyHub')).toBeVisible()
})
```

- [ ] **Step 2: Run the E2E test**

Run: `cd frontend && npm run build && npm run test:e2e -- setup-wizard.spec.ts`
Expected: PASS (1 test). (`npm run build` first surfaces any type errors in `App.tsx` now that all imports resolve.)

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/setup-wizard.spec.ts
git commit -m "test(frontend): e2e smoke test for setup redirect"
```

---

## Self-Review Notes (traceability)

- **Routing / SetupGuard** (redirect to `/setup`, network error ≠ wizard — fixes old FA-SETUP-Schwäche #15) → Task 10.
- **PIN session state** (sessionStorage, 15-min timer reset on every request, `customFetch` header injection) → Tasks 2, 3, 4.
- **Members feature** (grid, card, add/edit dialogs, avatar canvas compression with the exact German error texts) → Tasks 5–8.
- **PIN keypad** (4×3 grid, masked, 4–6 digits) → Task 9; reused in unlock and change-PIN → Task 12.
- **Setup wizard** (Welcome → Members with „Weiter" gated on ≥1 member → PIN with confirm; „Schritt n von 3" + 33/66/100% bar; resume from `currentStep`; set-pin → store token → hard redirect) → Task 11.
- **Settings** (locked until unlock via verify-pin; add/edit members; change PIN) → Task 12.
- **Color palette** exact HSL values → Task 1.
- **Not in Stufe 2** (Google per member, OAuth wizard steps, on-screen keyboard, configurable timeout, birthdays in calendar, deactivate-via-UI) — intentionally absent.
- **Backend dependency:** all hooks come from the regenerated client (Task 1), which requires the backend plan's OpenAPI additions to be merged first.
```
