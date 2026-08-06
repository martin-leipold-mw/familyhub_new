# Settings Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the FamilyHub settings page in four phases — a reusable light/dark theme system, a full-page keyboard-operable PIN gate with a root-cause fix for the session-expiry bug, a clean daely-inspired layout, and an explicit "choose member first, then OAuth" Google-account link.

**Architecture:** Phase **A** adds a CSS-variable design-token system (`darkMode: 'class'`) and a `ThemeProvider`. Phase **C** makes `customFetch` surface a `401` through a `sessionTokenStore` pub/sub that `PinSessionContext` subscribes to, re-gating the page via a new `PinGate`, and teaches the keypad physical-keyboard input. Phase **B** restructures `SettingsView` into token-styled `SectionCard`-based sections. Phase **D** threads an optional `memberId` query param through `authorizeGoogle` (contract + both generated clients) so a connection is attached to an existing member.

**Tech Stack:** Frontend — React 18 / TypeScript / Vite, Tailwind v3, TanStack Query, react-router v6, `lucide-react`, vitest + @testing-library/react. Backend — Kotlin 2 / Spring Boot 3, JPA, MockK + JUnit 5 + AssertJ. Contract — `api/openapi.yml` (orval + kotlin-spring codegen).

## Global Constraints

- **Frontend commands run from `frontend/`** (Node ≥ 20). Single-file test: `npm run test:run -- <path>`. Full gate: `npm run check` (`tsc --noEmit` + `eslint . --max-warnings 0` + `depcruise` + `test:coverage`).
- **Coverage thresholds (enforced by `npm run check`):** lines 90, **branches 100**, functions 90, statements 90. Every `if`/`? :`/`&&`/`||`/default-parameter branch you introduce must be exercised by a test. This is the strictest constraint in the plan.
- **`src/main.tsx` is coverage-exempt** (see `vite.config.ts` coverage `exclude`). Code placed there needs no test; code anywhere else in `src/features/**` or `src/routing/**` does.
- **Backend commands run from `backend/`** and need **Java 21** (`JAVA_HOME` must point at a JDK 21). Full gate: `./gradlew check`. The `ConnectionService` test is a **MockK unit test** (no Testcontainers/Docker).
- **Contract-first:** never hand-edit generated code. Change `api/openapi.yml`, then regenerate: frontend `npm run generate:api`, backend `./gradlew openApiGenerate` (runs inside `./gradlew check`). Generated code is gitignored — commit only `api/openapi.yml`.
- **German UI strings, verbatim** as written in each task.
- **Named exports; function components WITHOUT explicit return-type annotations** (match `PinSessionContext.tsx`, `SnackbarProvider.tsx`). Tailwind classes only, no inline styles except the existing avatar `boxShadow` ring pattern.
- **Touch targets ≥ 44 × 44 px** — buttons use `min-h-[44px]` (and `min-w-[44px]` for icon-only buttons). No hover-only interactions.
- **eslint runs with `--max-warnings 0`** — no unused vars, no `any` beyond the established `as never` cast in tests.
- **Accent colour is green, expressed as a single token** (`--accent`). Never hardcode a green; always use the `accent` token so it is swappable in one line.
- **`@/` path alias** maps to `frontend/src/`.
- **Phase order is A → C → B → D.** Each phase must end green (`npm run check` / `./gradlew check`) and be reachable through the UI before the next begins.

---

## File Structure

### Phase A — Theme system
- `frontend/tailwind.config.ts` — **modify.** Add `darkMode: 'class'` and the token colour map.
- `frontend/src/index.css` — **modify.** Add `:root` (light) and `.dark` (dark) CSS-variable blocks.
- `frontend/src/features/theme/ThemeProvider.tsx` — **new.** Context + `useTheme()`, mirrors `PinSessionContext` idiom.
- `frontend/src/features/theme/ThemeToggle.tsx` — **new.** Sun/Moon button.
- `frontend/src/main.tsx` — **modify** (coverage-exempt). Mount `ThemeProvider`.
- `frontend/src/features/settings/SettingsView.tsx` — **modify.** Render `ThemeToggle` (interim placement; relocated in Phase B).

### Phase C — PIN gate + keyboard + 401 fix
- `frontend/src/api/sessionTokenStore.ts` — **modify.** Add `notifySessionExpired` / `subscribeSessionExpired`.
- `frontend/src/api/customFetch.ts` — **modify.** Export `ApiError`, preserve `response.status`, fire `notifySessionExpired()` on 401.
- `frontend/src/features/pin/PinSessionContext.tsx` — **modify.** Subscribe to the expired signal → `clearSession()`.
- `frontend/src/features/pin/PinInputDialog.tsx` — **modify.** Physical-keyboard handler + `cancelLabel` prop.
- `frontend/src/features/pin/PinGate.tsx` — **new.** Full-page gate: no session → keypad; session → `children`.
- `frontend/src/features/settings/SettingsView.tsx` — **modify.** Wrap content in `PinGate`; drop the unlock button / read-only path.

### Phase B — Layout redesign
- `frontend/src/features/settings/SectionCard.tsx` — **new.** Card with title + optional `+` action.
- `frontend/src/features/members/MemberCard.tsx` — **modify.** Tokens + linked ✓ badge.
- `frontend/src/features/members/MemberGrid.tsx` — **modify.** Pass `linkedMemberIds`.
- `frontend/src/features/settings/MemberSection.tsx` — **new.** Members card (grid + add/edit).
- `frontend/src/features/google/GoogleAccountsSettings.tsx` — **modify.** Token card, member avatar, status badge, trash icon, `+` header.
- `frontend/src/features/google/CalendarSection.tsx` — **new.** Collapsible calendar card (replaces `CalendarManagement.tsx`).
- `frontend/src/features/google/CalendarManagement.tsx` + `.test.tsx` — **delete.**
- `frontend/src/features/settings/SettingsView.tsx` — **modify.** Assemble sections + ghost "PIN ändern".

### Phase D — Member ↔ Google link (full-stack)
- `api/openapi.yml` — **modify.** Add optional `memberId` query param to `authorizeGoogle`.
- `backend/.../google/oauth/OAuthStateStore.kt` — **modify.** `memberId` on entry + `create`.
- `backend/.../google/connection/ConnectionService.kt` — **modify.** `startAuthorization` + `handleCallback` member linking.
- `backend/.../google/connection/GoogleAuthController.kt` — **modify.** New `authorizeGoogle` param.
- `frontend/src/features/google/MemberPickerDialog.tsx` — **new.** "Choose member first" dialog.
- `frontend/src/features/google/GoogleAccountsSettings.tsx` — **modify.** `+` opens picker; pass `memberId`.
- `frontend/src/features/setup/ConnectStep.tsx` — **modify.** Pass `memberId` (or fallback).

**Dependency-cruiser note:** the existing ruleset (`no-circular`, `no-orphans`, `not-to-test`, `not-to-dev-dep`, `no-phantom-deps`) has no layering rule, so `settings/` importing `google/`, `members/`, `theme/`, `pin/` is allowed (already the case today). No new orphan files — every new file is imported by a sibling.

---
---

# PHASE A — Theme system

## Task A1: Design tokens (Tailwind config + CSS variables)

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: token utility classes usable everywhere — `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-accent`, `bg-accent-weak`, `bg-danger`, `bg-danger-weak`, `bg-warn`, `bg-warn-weak`, `text-primary`, `text-muted`, `text-accent`, `text-danger`, `text-warn`, `border-subtle`, `ring-accent`. Toggling `class="dark"` on `<html>` swaps every value.

There is no test for pure config/CSS; correctness is verified structurally by later theme tests and `npm run check`.

- [ ] **Step 1: Add `darkMode` and the token colour map to Tailwind**

Replace the whole of `frontend/tailwind.config.ts` with:

```ts
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
```

- [ ] **Step 2: Add the CSS-variable blocks to `index.css`**

Replace the whole of `frontend/src/index.css` with (light values under `:root`, dark under `.dark`; the two `--surface-2` values are interpolated — the spec omitted them):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #f4f2ee;
  --surface: #ffffff;
  --surface-2: #ede9e2;
  --border: #e7e3dc;
  --text: #1c1b19;
  --muted: #807a70;
  --accent: #2e6f5e;
  --accent-weak: #e4efe9;
  --danger: #c7503f;
  --danger-weak: #f6e4e0;
  --warn: #b5771f;
  --warn-weak: #f6ecd9;
}

.dark {
  --bg: #15181b;
  --surface: #1e2328;
  --surface-2: #262c32;
  --border: #2e353c;
  --text: #f1efeb;
  --muted: #9aa0a6;
  --accent: #54c9a3;
  --accent-weak: #1c3a32;
  --danger: #e9705e;
  --danger-weak: #3a2420;
  --warn: #e0a94a;
  --warn-weak: #352b18;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (no type errors). The token classes have no runtime test yet; they are exercised by Phase B.

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.ts frontend/src/index.css
git commit -m "feat(theme): add design tokens and dark-mode class strategy"
```

---

## Task A2: ThemeProvider + useTheme

**Files:**
- Create: `frontend/src/features/theme/ThemeProvider.tsx`
- Test: `frontend/src/features/theme/ThemeProvider.test.tsx`

**Interfaces:**
- Consumes: nothing (React + `window.matchMedia` + `localStorage`).
- Produces:
  - `const THEME_STORAGE_KEY = 'familyhub.theme'`
  - `type Theme = 'light' | 'dark'`
  - `function ThemeProvider({ children }: { children: ReactNode })` — on mount picks `localStorage[THEME_STORAGE_KEY]` if `'light'`/`'dark'`, else `prefers-color-scheme`. Keeps `<html class="dark">` and `localStorage` in sync with the current theme.
  - `function useTheme(): { theme: Theme; toggle: () => void }` — throws `'useTheme must be used within a ThemeProvider'` outside the provider.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/theme/ThemeProvider.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, renderHook, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from './ThemeProvider'

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

function Probe() {
  const { theme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockMatchMedia(false)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('throws when useTheme is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
    spy.mockRestore()
  })

  it('uses localStorage "light" over system preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    mockMatchMedia(true) // system says dark, but stored wins
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('uses localStorage "dark" and sets the html class', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('falls back to system dark when nothing is stored', () => {
    mockMatchMedia(true)
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('falls back to system light when nothing is stored', () => {
    mockMatchMedia(false)
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('toggle switches light→dark, adds the class and persists', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('toggle switches dark→light, removes the class and persists', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/theme/ThemeProvider.test.tsx`
Expected: FAIL — `Failed to resolve import "./ThemeProvider"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/theme/ThemeProvider.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export const THEME_STORAGE_KEY = 'familyhub.theme'
export type Theme = 'light' | 'dark'

interface ThemeValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/theme/ThemeProvider.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/theme/ThemeProvider.tsx frontend/src/features/theme/ThemeProvider.test.tsx
git commit -m "feat(theme): ThemeProvider with system/localStorage default and toggle"
```

---

## Task A3: ThemeToggle, mount provider, show toggle in settings

**Files:**
- Create: `frontend/src/features/theme/ThemeToggle.tsx`
- Test: `frontend/src/features/theme/ThemeToggle.test.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/features/settings/SettingsView.tsx`
- Modify: `frontend/src/features/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` (Task A2).
- Produces: `function ThemeToggle()` — a `min-h-[44px] min-w-[44px]` button; `aria-label` `'Zu dunklem Design wechseln'` when light, `'Zu hellem Design wechseln'` when dark; renders a `Moon` icon in light mode and a `Sun` icon in dark mode.

- [ ] **Step 1: Write the failing ThemeToggle test**

Create `frontend/src/features/theme/ThemeToggle.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockMatchMedia(false) // start in light
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the "switch to dark" label in light mode and toggles to dark', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    const btn = screen.getByRole('button', { name: 'Zu dunklem Design wechseln' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Zu hellem Design wechseln' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/theme/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `./ThemeToggle`.

- [ ] **Step 3: Write ThemeToggle**

Create `frontend/src/features/theme/ThemeToggle.tsx`:

```tsx
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/theme/ThemeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount ThemeProvider in main.tsx**

In `frontend/src/main.tsx`, add the import and wrap `App` (outermost app provider so the `<html>` class applies to every route). Change:

```tsx
import { PinSessionProvider } from '@/features/pin/PinSessionContext'
import './index.css'
```
to:
```tsx
import { PinSessionProvider } from '@/features/pin/PinSessionContext'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import './index.css'
```
and change the render tree from:
```tsx
    <QueryClientProvider client={queryClient}>
      <PinSessionProvider>
        <App />
      </PinSessionProvider>
    </QueryClientProvider>
```
to:
```tsx
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PinSessionProvider>
          <App />
        </PinSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
```

(`main.tsx` is coverage-exempt, so no test change is needed for this file.)

- [ ] **Step 6: Render ThemeToggle in the current SettingsView (interim)**

In `frontend/src/features/settings/SettingsView.tsx`, add the import:
```tsx
import { ThemeToggle } from '@/features/theme/ThemeToggle'
```
and replace the existing top `<Link>` line:
```tsx
        <Link to="/" className="self-start text-blue-400 min-h-[44px] flex items-center">
          ← Zum Kalender
        </Link>
```
with a row that also holds the toggle:
```tsx
        <div className="flex items-center justify-between">
          <Link to="/" className="text-blue-400 min-h-[44px] flex items-center">
            ← Zum Kalender
          </Link>
          <ThemeToggle />
        </div>
```

- [ ] **Step 7: Stub ThemeToggle in the SettingsView test**

In `frontend/src/features/settings/SettingsView.test.tsx`, add this mock alongside the other `vi.mock(...)` calls near the top (so the test does not need a `ThemeProvider`):

```tsx
vi.mock('@/features/theme/ThemeToggle', () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
```

- [ ] **Step 8: Run the affected suites**

Run: `npm run test:run -- src/features/theme/ThemeToggle.test.tsx src/features/settings/SettingsView.test.tsx`
Expected: PASS (all).

- [ ] **Step 9: Full gate**

Run: `npm run check`
Expected: exit 0 (types, lint, depcruise, coverage all green).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/theme frontend/src/main.tsx frontend/src/features/settings/SettingsView.tsx frontend/src/features/settings/SettingsView.test.tsx
git commit -m "feat(theme): mount ThemeProvider and show sun/moon toggle in settings"
```

---
---

# PHASE C — PIN gate + keyboard + 401 session fix

## Task C1: sessionTokenStore — session-expired pub/sub

**Files:**
- Modify: `frontend/src/api/sessionTokenStore.ts`
- Test: `frontend/src/api/sessionTokenStore.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces (added to the existing module):
  - `function notifySessionExpired(): void` — invokes every subscribed listener.
  - `function subscribeSessionExpired(listener: () => void): () => void` — returns an unsubscribe function.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/sessionTokenStore.test.ts`:

```ts
import { vi } from 'vitest'
import { notifySessionExpired, subscribeSessionExpired } from './sessionTokenStore'

describe('sessionTokenStore session-expired signal', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribeSessionExpired(listener)
    notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/api/sessionTokenStore.test.ts`
Expected: FAIL — `notifySessionExpired`/`subscribeSessionExpired` are not exported.

- [ ] **Step 3: Add the pub/sub to sessionTokenStore**

In `frontend/src/api/sessionTokenStore.ts`, append (after the existing `subscribeActivity` block):

```ts
const sessionExpiredListeners = new Set<() => void>()

export function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener())
}

export function subscribeSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/api/sessionTokenStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/sessionTokenStore.ts frontend/src/api/sessionTokenStore.test.ts
git commit -m "feat(pin): add session-expired pub/sub to sessionTokenStore"
```

---

## Task C2: customFetch — preserve 401 status and fire the signal

**Files:**
- Modify: `frontend/src/api/customFetch.ts`
- Modify: `frontend/src/api/customFetch.test.ts`

**Interfaces:**
- Consumes: `notifySessionExpired` (Task C1).
- Produces: `class ApiError extends Error { status: number }` (exported). `customFetch` now throws `ApiError` (still `instanceof Error`, message unchanged) and calls `notifySessionExpired()` when `response.status === 401`.

- [ ] **Step 1: Add the failing test for the 401 signal**

In `frontend/src/api/customFetch.test.ts`, add an import of the new signal at the top (after the existing imports):

```ts
import { subscribeSessionExpired } from './sessionTokenStore'
```
and add this test inside the `describe('customFetch', ...)` block:

```ts
  it('fires the session-expired signal on 401 and preserves the status', async () => {
    mockFetch(401, { message: 'PIN-Sitzung erforderlich' })
    const listener = vi.fn()
    const unsub = subscribeSessionExpired(listener)
    await expect(customFetch('/api/v1/members')).rejects.toMatchObject({
      message: 'PIN-Sitzung erforderlich',
      status: 401,
    })
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/api/customFetch.test.ts`
Expected: FAIL — thrown value has no `status` property and the listener is never called.

- [ ] **Step 3: Update customFetch**

In `frontend/src/api/customFetch.ts`, change the import line:
```ts
import { getSessionToken, notifyActivity } from './sessionTokenStore'
```
to:
```ts
import { getSessionToken, notifyActivity, notifySessionExpired } from './sessionTokenStore'
```
Add the error class just below the imports:
```ts
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```
Replace the error branch:
```ts
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message ?? `HTTP ${response.status}`)
  }
```
with:
```ts
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    if (response.status === 401) notifySessionExpired()
    throw new ApiError(error.message ?? `HTTP ${response.status}`, response.status)
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/api/customFetch.test.ts`
Expected: PASS (existing error tests still pass — `ApiError` keeps the same messages; new 401 test passes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/customFetch.ts frontend/src/api/customFetch.test.ts
git commit -m "fix(pin): customFetch preserves 401 status and signals session expiry"
```

---

## Task C3: PinSessionContext — clear session on the expired signal

**Files:**
- Modify: `frontend/src/features/pin/PinSessionContext.tsx`
- Modify: `frontend/src/features/pin/PinSessionContext.test.tsx`

**Interfaces:**
- Consumes: `subscribeSessionExpired` (Task C1), the existing `clearSession`.
- Produces: no new export. Behavior: a `notifySessionExpired()` from anywhere clears the PIN session (`hasPinSession` → `false`).

- [ ] **Step 1: Add the failing test**

In `frontend/src/features/pin/PinSessionContext.test.tsx`, extend the store import:
```ts
import { getSessionToken, notifyActivity, setSessionToken } from '@/api/sessionTokenStore'
```
to:
```ts
import { getSessionToken, notifyActivity, setSessionToken, notifySessionExpired } from '@/api/sessionTokenStore'
```
and add these tests inside the `describe('PinSessionContext', ...)` block:

```ts
  it('clears the session when a session-expired signal fires', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('has').textContent).toBe('true')
    act(() => { notifySessionExpired() })
    expect(screen.getByTestId('has').textContent).toBe('false')
    expect(getSessionToken()).toBeNull()
  })

  it('stops reacting to the signal after unmount', () => {
    const { unmount } = render(<PinSessionProvider><Probe /></PinSessionProvider>)
    unmount()
    // No provider mounted → must not throw when the signal fires.
    act(() => { notifySessionExpired() })
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/pin/PinSessionContext.test.tsx`
Expected: FAIL — the first new test still reads `has` = `true` after the signal.

- [ ] **Step 3: Subscribe to the signal in the provider**

In `frontend/src/features/pin/PinSessionContext.tsx`, extend the store import:
```ts
import { setSessionToken, subscribeActivity } from '@/api/sessionTokenStore'
```
to:
```ts
import { setSessionToken, subscribeActivity, subscribeSessionExpired } from '@/api/sessionTokenStore'
```
and add this effect immediately **after** the existing `const setSession = useCallback(...)` block and **before** the timer `useEffect`:

```tsx
  useEffect(() => subscribeSessionExpired(clearSession), [clearSession])
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/pin/PinSessionContext.test.tsx`
Expected: PASS (all, including the two new tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pin/PinSessionContext.tsx frontend/src/features/pin/PinSessionContext.test.tsx
git commit -m "fix(pin): re-gate on server 401 by clearing session on expiry signal"
```

---

## Task C4: PinInputDialog — physical keyboard + cancelLabel

**Files:**
- Modify: `frontend/src/features/pin/PinInputDialog.tsx`
- Modify: `frontend/src/features/pin/PinInputDialog.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PinInputDialog` gains an optional `cancelLabel?: string` prop (defaults to `'Abbrechen'`) and a `window` `keydown` handler: `0`–`9` append (cap 6), `Backspace` deletes last, `Enter` submits when `pin.length >= 4`, `Escape` cancels. The touch keypad is unchanged.

- [ ] **Step 1: Add failing keyboard + cancelLabel tests**

In `frontend/src/features/pin/PinInputDialog.test.tsx`, add these tests inside the `describe('PinInputDialog', ...)` block:

```ts
  it('accepts digits and Enter from the physical keyboard', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '1234') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('Enter does nothing below 4 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '12') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Backspace deletes the last keyboard digit', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '12345') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('keyboard entry caps at 6 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '1234567') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('123456')
  })

  it('Escape triggers onCancel; unrelated keys are ignored', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'a' }) // ignored, no throw
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders a custom cancel label', () => {
    render(<PinInputDialog title="PIN eingeben" cancelLabel="← Zum Kalender" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: '← Zum Kalender' })).toBeInTheDocument()
  })
```

Also add `screen` to the existing import if it is not already present:
```ts
import { render, screen, fireEvent } from '@testing-library/react'
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/pin/PinInputDialog.test.tsx`
Expected: FAIL — keyboard events do nothing; no `cancelLabel` prop.

- [ ] **Step 3: Implement the keyboard handler + cancelLabel**

Replace the whole of `frontend/src/features/pin/PinInputDialog.tsx` with:

```tsx
import { useEffect, useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

export function PinInputDialog({
  title,
  error,
  cancelLabel = 'Abbrechen',
  onSubmit,
  onCancel,
}: {
  title: string
  error?: string | null
  cancelLabel?: string
  onSubmit: (pin: string) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const valid = pin.length >= 4

  function press(key: string) {
    if (key === 'Löschen') setPin('')
    else if (key === '←') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < 6 ? p + key : p))
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') {
        if (pin.length >= 4) onSubmit(pin)
      } else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, onSubmit, onCancel])

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xs rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary text-center">{title}</h2>
        <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-surface-2'}`}
            />
          ))}
        </div>
        {error && <p className="text-danger text-sm text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => press(key)}
              className="min-h-[56px] rounded-xl bg-surface-2 text-primary text-lg"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl bg-surface-2 text-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(pin)}
            className="flex-1 min-h-[44px] rounded-xl bg-accent text-white disabled:opacity-50"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/pin/PinInputDialog.test.tsx`
Expected: PASS (existing click tests + 6 new keyboard/label tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pin/PinInputDialog.tsx frontend/src/features/pin/PinInputDialog.test.tsx
git commit -m "feat(pin): keyboard input and cancelLabel for the PIN keypad"
```

---

## Task C5: PinGate — full-page gate

**Files:**
- Create: `frontend/src/features/pin/PinGate.tsx`
- Test: `frontend/src/features/pin/PinGate.test.tsx`

**Interfaces:**
- Consumes: `usePinSession()`, `useVerifyPin` (`@/api/generated/endpoints/familyHubAPI`), `PinInputDialog` (with `cancelLabel`).
- Produces: `function PinGate({ children }: { children: ReactNode })` — when `hasPinSession` is false renders the full-page keypad (`cancelLabel="← Zum Kalender"`, Abbrechen/Escape navigate to `/`); on successful verify calls `setSession`. When `hasPinSession` is true renders `children`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/pin/PinGate.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

let hasPinSession = false
const setSession = vi.fn()
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession, sessionToken: null, clearSession: vi.fn() }),
}))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useVerifyPin: vi.fn() }))

import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinGate } from './PinGate'

function renderGate() {
  return render(
    <MemoryRouter>
      <PinGate><div>SECRET</div></PinGate>
    </MemoryRouter>,
  )
}

describe('PinGate', () => {
  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }),
    } as never)
  })

  it('renders the keypad and hides children when locked', () => {
    renderGate()
    expect(screen.getByRole('dialog', { name: 'PIN eingeben' })).toBeInTheDocument()
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
  })

  it('renders children when a session exists', () => {
    hasPinSession = true
    renderGate()
    expect(screen.getByText('SECRET')).toBeInTheDocument()
  })

  it('verifies the PIN and sets the session', async () => {
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(setSession).toHaveBeenCalledWith('tok'))
  })

  it('navigates to the calendar via the cancel control', () => {
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: '← Zum Kalender' }))
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('shows the server error when verification fails with an Error', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Falsche PIN')),
    } as never)
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN')).toBeInTheDocument())
  })

  it('shows a fallback error when verification fails with a non-Error', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue('boom'),
    } as never)
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/pin/PinGate.test.tsx`
Expected: FAIL — cannot resolve `./PinGate`.

- [ ] **Step 3: Write PinGate**

Create `frontend/src/features/pin/PinGate.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePinSession } from './PinSessionContext'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from './PinInputDialog'

export function PinGate({ children }: { children: ReactNode }) {
  const { hasPinSession, setSession } = usePinSession()
  const verifyPin = useVerifyPin()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function verify(pin: string) {
    setError(null)
    try {
      const result = await verifyPin.mutateAsync({ data: { pin } })
      setSession(result.data.sessionToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falsche PIN.')
    }
  }

  if (hasPinSession) return <>{children}</>

  return (
    <div className="min-h-screen bg-bg text-primary">
      <PinInputDialog
        title="PIN eingeben"
        error={error}
        cancelLabel="← Zum Kalender"
        onSubmit={verify}
        onCancel={() => navigate('/')}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/pin/PinGate.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pin/PinGate.tsx frontend/src/features/pin/PinGate.test.tsx
git commit -m "feat(pin): full-page PinGate that keypad-locks settings until verified"
```

---

## Task C6: SettingsView — wrap in PinGate, drop the unlock button

**Files:**
- Modify: `frontend/src/features/settings/SettingsView.tsx`
- Modify: `frontend/src/features/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `PinGate` (Task C5). No longer uses `usePinSession`/`useVerifyPin`/`PinInputDialog` directly.
- Produces: unchanged export `SettingsView`. Content renders only inside `PinGate`, so member editing/add/change-pin are always available (no read-only path).

- [ ] **Step 1: Rewrite the SettingsView test for the gated structure**

Replace the whole of `frontend/src/features/settings/SettingsView.test.tsx` with (PinGate and ThemeToggle stubbed to passthroughs; the unlock-flow tests move to `PinGate.test.tsx`):

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/theme/ThemeToggle', () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
vi.mock('@/features/members/AddMemberDialog', () => ({
  AddMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>AddDialog<button onClick={onClose}>CloseAdd</button></div>
  ),
}))
vi.mock('@/features/members/EditMemberDialog', () => ({
  EditMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>EditDialog<button onClick={onClose}>CloseEdit</button></div>
  ),
}))
vi.mock('@/features/settings/ChangePinDialog', () => ({
  ChangePinDialog: ({ onClose }: { onClose: () => void }) => (
    <div>ChangePinDialog<button onClick={onClose}>CloseChangePin</button></div>
  ),
}))
vi.mock('@/features/google/GoogleAccountsSettings', () => ({
  GoogleAccountsSettings: () => <div>GoogleAccountsSettings</div>,
}))
vi.mock('@/features/google/CalendarManagement', () => ({
  CalendarManagement: () => <div>CalendarManagement</div>,
}))

import { useMembers } from '@/features/members/useMembersQuery'
import { SettingsView } from './SettingsView'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

function renderView() {
  return render(<MemoryRouter><SettingsView /></MemoryRouter>)
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
  })

  it('shows management actions (behind the gate)', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Mitglied hinzufügen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PIN ändern' })).toBeInTheDocument()
  })

  it('opens the edit dialog when a member tile is tapped', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })

  it('opens and closes AddMemberDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseAdd' }))
    expect(screen.queryByText('AddDialog')).not.toBeInTheDocument()
  })

  it('opens and closes EditMemberDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseEdit' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })

  it('opens and closes ChangePinDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseChangePin' }))
    expect(screen.queryByText('ChangePinDialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: FAIL — current `SettingsView` still renders the unlock button and has no gate.

- [ ] **Step 3: Rewrite SettingsView (interim gated version)**

Replace the whole of `frontend/src/features/settings/SettingsView.tsx` with:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemberResponse } from '@/api/generated/model'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChangePinDialog } from './ChangePinDialog'
import { GoogleAccountsSettings } from '@/features/google/GoogleAccountsSettings'
import { CalendarManagement } from '@/features/google/CalendarManagement'
import { PinGate } from '@/features/pin/PinGate'
import { ThemeToggle } from '@/features/theme/ThemeToggle'

export function SettingsView() {
  const { members } = useMembers()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)
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

          <MemberGrid members={members} onSelect={setEditing} />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-xl bg-surface-2 px-5 py-3 min-h-[44px] text-primary"
            >
              Mitglied hinzufügen
            </button>
            <button
              type="button"
              onClick={() => setChangingPin(true)}
              className="rounded-xl bg-surface-2 px-5 py-3 min-h-[44px] text-primary"
            >
              PIN ändern
            </button>
          </div>

          <GoogleAccountsSettings />
          <CalendarManagement />
        </div>
      </div>

      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
      {changingPin && <ChangePinDialog onClose={() => setChangingPin(false)} />}
    </PinGate>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Full gate**

Run: `npm run check`
Expected: exit 0. (If coverage flags `GoogleAccountsSettings`/`CalendarManagement` branches for the now-always-true `hasPinSession` — they are unchanged from before and were already covered by their own tests; do not touch them here, Phase B rewrites them.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/settings/SettingsView.tsx frontend/src/features/settings/SettingsView.test.tsx
git commit -m "feat(settings): gate settings behind full-page PinGate, remove unlock button"
```

---
---

# PHASE B — Layout redesign

## Task B1: SectionCard

**Files:**
- Create: `frontend/src/features/settings/SectionCard.tsx`
- Test: `frontend/src/features/settings/SectionCard.test.tsx`

**Interfaces:**
- Consumes: `Plus` from `lucide-react`.
- Produces: `function SectionCard({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children?: ReactNode })` — token-styled card; when `action` is set, renders a `+` icon button in the header with `aria-label={action.label}`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/settings/SectionCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders a title and children', () => {
    render(<SectionCard title="Mitglieder"><p>Inhalt</p></SectionCard>)
    expect(screen.getByRole('heading', { name: 'Mitglieder' })).toBeInTheDocument()
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the + action and fires onClick', () => {
    const onClick = vi.fn()
    render(<SectionCard title="Google-Konten" action={{ label: 'Konto verbinden', onClick }} />)
    const btn = screen.getByRole('button', { name: 'Konto verbinden' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/settings/SectionCard.test.tsx`
Expected: FAIL — cannot resolve `./SectionCard`.

- [ ] **Step 3: Write SectionCard**

Create `frontend/src/features/settings/SectionCard.tsx`:

```tsx
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/settings/SectionCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/SectionCard.tsx frontend/src/features/settings/SectionCard.test.tsx
git commit -m "feat(settings): SectionCard with optional + header action"
```

---

## Task B2: MemberCard + MemberGrid — tokens and linked ✓

**Files:**
- Modify: `frontend/src/features/members/MemberCard.tsx`
- Modify: `frontend/src/features/members/MemberGrid.tsx`
- Modify: `frontend/src/features/members/MemberGrid.test.tsx`

**Interfaces:**
- Consumes: `Check` from `lucide-react`, existing `MEMBER_COLORS`/`roleLabel`.
- Produces:
  - `MemberCard` gains `linked?: boolean` (default `false`); when true it shows a green ✓ badge (`aria-label="Mit Google verknüpft"`). Token classes replace `slate`.
  - `MemberGrid` gains `linkedMemberIds?: string[]` (default `[]`); passes `linked={linkedMemberIds.includes(member.id)}` to each card.

- [ ] **Step 1: Update the MemberGrid test**

Read the current `frontend/src/features/members/MemberGrid.test.tsx` first, then add this test inside its `describe` block (keep the existing tests):

```tsx
  it('marks linked members with a verknüpft badge', () => {
    const members = [
      { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' },
      { id: '2', name: 'Ben', role: 'child', color: 'pink', isActive: true, createdAt: 'x', updatedAt: 'x' },
    ]
    render(<MemberGrid members={members as never} linkedMemberIds={['1']} />)
    expect(screen.getAllByLabelText('Mit Google verknüpft')).toHaveLength(1)
  })
```

If `render`/`screen` are not yet imported in that file, add: `import { render, screen } from '@testing-library/react'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/members/MemberGrid.test.tsx`
Expected: FAIL — no `verknüpft` badge exists yet.

- [ ] **Step 3: Rewrite MemberCard with tokens + linked badge**

Replace the whole of `frontend/src/features/members/MemberCard.tsx` with:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { Check } from 'lucide-react'
import { MEMBER_COLORS, roleLabel, type MemberColor } from './colors'

export function MemberCard({
  member,
  onClick,
  linked = false,
}: {
  member: MemberResponse
  onClick?: () => void
  linked?: boolean
}) {
  const ring = MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={member.name}
      className="relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-surface-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <span
        className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-surface"
        style={{ boxShadow: `0 0 0 4px ${ring}` }}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-primary">{member.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      {linked && (
        <span
          aria-label="Mit Google verknüpft"
          className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full bg-accent text-white"
        >
          <Check aria-hidden className="w-4 h-4" />
        </span>
      )}
      <span className="text-lg font-semibold text-primary">{member.name}</span>
      <span className="text-sm text-muted">{roleLabel(member.role)}</span>
    </button>
  )
}
```

- [ ] **Step 4: Update MemberGrid to pass linkedMemberIds**

Replace the whole of `frontend/src/features/members/MemberGrid.tsx` with:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { MemberCard } from './MemberCard'

export function MemberGrid({
  members,
  onSelect,
  linkedMemberIds = [],
}: {
  members: MemberResponse[]
  onSelect?: (member: MemberResponse) => void
  linkedMemberIds?: string[]
}) {
  if (members.length === 0) {
    return (
      <p className="text-muted text-center py-8">Noch keine Familienmitglieder angelegt.</p>
    )
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          onClick={() => onSelect?.(member)}
          linked={linkedMemberIds.includes(member.id)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run the member tests**

Run: `npm run test:run -- src/features/members/MemberGrid.test.tsx`
Expected: PASS (existing + new badge test).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/members/MemberCard.tsx frontend/src/features/members/MemberGrid.tsx frontend/src/features/members/MemberGrid.test.tsx
git commit -m "feat(members): token styling and linked-account checkmark on member tiles"
```

---

## Task B3: MemberSection

**Files:**
- Create: `frontend/src/features/settings/MemberSection.tsx`
- Test: `frontend/src/features/settings/MemberSection.test.tsx`

**Interfaces:**
- Consumes: `SectionCard` (B1), `MemberGrid` (B2), `AddMemberDialog`, `EditMemberDialog`, `useMembers`, `useGoogleConnections`.
- Produces: `function MemberSection()` — a "Mitglieder" `SectionCard` whose `+` opens `AddMemberDialog`; tiles open `EditMemberDialog`; linked members (those whose `id` appears as a connection's `memberId`) show the ✓ badge.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/settings/MemberSection.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
vi.mock('@/features/members/AddMemberDialog', () => ({
  AddMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>AddDialog<button onClick={onClose}>CloseAdd</button></div>
  ),
}))
vi.mock('@/features/members/EditMemberDialog', () => ({
  EditMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>EditDialog<button onClick={onClose}>CloseEdit</button></div>
  ),
}))

import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { MemberSection } from './MemberSection'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }
const connection = { connectionId: 'c1', memberId: '1', email: 'a@x.de', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }

describe('MemberSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection], isLoading: false, isError: false } as never)
  })

  it('shows the linked badge for a member with a connection', () => {
    render(<MemberSection />)
    expect(screen.getByLabelText('Mit Google verknüpft')).toBeInTheDocument()
  })

  it('opens AddMemberDialog from the + action', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
  })

  it('opens EditMemberDialog when a tile is tapped', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })

  it('closes the add dialog again', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseAdd' }))
    expect(screen.queryByText('AddDialog')).not.toBeInTheDocument()
  })

  it('closes the edit dialog again', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseEdit' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/settings/MemberSection.test.tsx`
Expected: FAIL — cannot resolve `./MemberSection`.

- [ ] **Step 3: Write MemberSection**

Create `frontend/src/features/settings/MemberSection.tsx`:

```tsx
import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { SectionCard } from './SectionCard'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'

export function MemberSection() {
  const { members } = useMembers()
  const { connections } = useGoogleConnections()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)

  const linkedMemberIds = connections.map((c) => c.memberId)

  return (
    <SectionCard title="Mitglieder" action={{ label: 'Mitglied hinzufügen', onClick: () => setAdding(true) }}>
      <MemberGrid members={members} onSelect={setEditing} linkedMemberIds={linkedMemberIds} />
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/settings/MemberSection.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/MemberSection.tsx frontend/src/features/settings/MemberSection.test.tsx
git commit -m "feat(settings): MemberSection card with add/edit and linked badges"
```

---

## Task B4: GoogleAccountsSettings — token card with avatar, badge, trash

**Files:**
- Modify: `frontend/src/features/google/GoogleAccountsSettings.tsx`
- Modify: `frontend/src/features/google/GoogleAccountsSettings.test.tsx`

**Interfaces:**
- Consumes: `SectionCard` (B1), `useGoogleConnections`, `useDisconnectConnectionMutation`, `useStartGoogleAuth`, `useMembers`, `MEMBER_COLORS`, `Trash2`/`RefreshCw` from `lucide-react`.
- Produces: unchanged export `GoogleAccountsSettings`. Now a `SectionCard title="Google-Konten"` with `+` header (starts connect via full-page redirect), one row per connection (member avatar, `name (email)`, status badge, red trash button `aria-label="{name} trennen"`), revoked rows show `Verbindung abgelaufen` + `Neu verbinden`. **No `hasPinSession` gating** (the page is behind `PinGate`).

- [ ] **Step 1: Rewrite the GoogleAccountsSettings test**

Replace the whole of `frontend/src/features/google/GoogleAccountsSettings.test.tsx` with:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
  useDisconnectConnectionMutation: vi.fn(),
}))
vi.mock('@/features/google/useCalendars', () => ({ useStartGoogleAuth: vi.fn() }))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { GoogleAccountsSettings } from './GoogleAccountsSettings'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'
// `member` has an avatarUrl so the active row exercises the <img> branch; the
// revoked row's memberId (mem-2) has no matching member, exercising the <span>
// initial-letter branch. Together they cover both sides of `member?.avatarUrl`.
const member = { id: 'mem-1', name: 'Anna', role: 'parent', color: 'blue', avatarUrl: 'http://x/a.png', isActive: true, createdAt: 'x', updatedAt: 'x' }
const active = { connectionId: 'conn-1', memberId: 'mem-1', email: 'anna@gmail.com', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
const revoked = { connectionId: 'conn-2', memberId: 'mem-2', email: 'bob@gmail.com', name: 'Bob', status: 'REVOKED', lastSyncedAt: null, scopes: [] }

describe('GoogleAccountsSettings', () => {
  const disconnect = vi.fn()
  const startAuth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useDisconnectConnectionMutation).mockReturnValue({ mutateAsync: disconnect } as never)
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: startAuth } as never)
    startAuth.mockResolvedValue(AUTH_URL)
    disconnect.mockResolvedValue(undefined)
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('shows loading', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: true, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows error', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: true } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Fehler beim Laden der Konten.')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Noch kein Google-Konto verbunden.')).toBeInTheDocument()
  })

  it('shows an active connection with Verbunden and a trash button', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [active], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbunden')).toHaveClass('text-accent')
    expect(screen.getByText('Anna (anna@gmail.com)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna trennen' })).toBeInTheDocument()
  })

  it('shows a revoked connection with a reconnect button', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [revoked], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbindung abgelaufen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).toBeInTheDocument()
  })

  it('trash button triggers disconnect', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [active], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna trennen' }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith({ id: 'conn-1' }))
  })

  it('+ action starts the connect redirect', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Google-Konto verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/settings' })
  })

  it('reconnect redirects to the auth url', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [revoked], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/google/GoogleAccountsSettings.test.tsx`
Expected: FAIL — current component has no trash `aria-label`, no `+` action, uses `text-green-400`.

- [ ] **Step 3: Rewrite GoogleAccountsSettings**

Replace the whole of `frontend/src/features/google/GoogleAccountsSettings.tsx` with:

```tsx
import { Trash2, RefreshCw } from 'lucide-react'
import { SectionCard } from '@/features/settings/SectionCard'
import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { MEMBER_COLORS, type MemberColor } from '@/features/members/colors'

export function GoogleAccountsSettings() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { members } = useMembers()
  const disconnectMutation = useDisconnectConnectionMutation()
  const startAuth = useStartGoogleAuth()

  async function handleConnect() {
    // Return to the settings page after the OAuth round-trip, not the calendar start page.
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings' })
    window.location.href = authUrl
  }

  async function handleReconnect() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings' })
    window.location.href = authUrl
  }

  async function handleDisconnect(id: string) {
    await disconnectMutation.mutateAsync({ id })
  }

  if (isLoading) {
    return (
      <SectionCard title="Google-Konten">
        <p className="text-muted">Wird geladen…</p>
      </SectionCard>
    )
  }

  if (isError) {
    return (
      <SectionCard title="Google-Konten">
        <p className="text-danger">Fehler beim Laden der Konten.</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Google-Konten" action={{ label: 'Google-Konto verbinden', onClick: handleConnect }}>
      {connections.length === 0 ? (
        <p className="text-muted">Noch kein Google-Konto verbunden.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {connections.map((connection) => {
            const isRevoked = connection.status.toLowerCase() === 'revoked'
            const member = members.find((m) => m.id === connection.memberId)
            const ring = member
              ? MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
              : MEMBER_COLORS.blue
            const initial = (member?.name ?? connection.name).charAt(0).toUpperCase()
            return (
              <li key={connection.connectionId} className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-surface-2 flex-shrink-0"
                  style={{ boxShadow: `0 0 0 3px ${ring}` }}
                >
                  {member?.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary">{initial}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-primary font-medium truncate">
                    {connection.name} ({connection.email})
                  </p>
                  {isRevoked ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-danger text-sm">Verbindung abgelaufen</span>
                      <button
                        type="button"
                        onClick={handleReconnect}
                        className="inline-flex items-center gap-1 rounded-xl bg-warn-weak text-warn px-3 min-h-[44px]"
                      >
                        <RefreshCw aria-hidden className="w-4 h-4" /> Neu verbinden
                      </button>
                    </div>
                  ) : (
                    <span className="text-accent text-sm">Verbunden</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`${connection.name} trennen`}
                  onClick={() => handleDisconnect(connection.connectionId)}
                  className="flex items-center justify-center rounded-xl text-danger min-h-[44px] min-w-[44px] flex-shrink-0"
                >
                  <Trash2 aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/google/GoogleAccountsSettings.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/GoogleAccountsSettings.tsx frontend/src/features/google/GoogleAccountsSettings.test.tsx
git commit -m "feat(google): redesigned accounts card with avatar, badge and trash icon"
```

---

## Task B5: CalendarSection (collapsible) — replaces CalendarManagement

**Files:**
- Create: `frontend/src/features/google/CalendarSection.tsx`
- Test: `frontend/src/features/google/CalendarSection.test.tsx`
- Delete: `frontend/src/features/google/CalendarManagement.tsx`, `frontend/src/features/google/CalendarManagement.test.tsx`

**Interfaces:**
- Consumes: `useGoogleConnections`, `useAllCalendars`, `useCalendarsForMember`, `useSaveSelectedCalendarsMutation`, `useUpdateCalendarFlagsMutation`, `ChevronDown`/`ChevronRight` from `lucide-react`.
- Produces: `function CalendarSection()` — a collapsible card. Header button `aria-expanded` toggles; label `Kalender · {N} ausgewählt` where `N` = count of `useAllCalendars()` calendars with `isSelected`. Expanded body renders one `ConnectionCalendars` (private, token-styled, no `hasPinSession` prop) per connection.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/google/CalendarSection.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
vi.mock('@/features/google/useCalendars', () => ({
  useAllCalendars: vi.fn(),
  useCalendarsForMember: vi.fn(),
  useSaveSelectedCalendarsMutation: vi.fn(),
  useUpdateCalendarFlagsMutation: vi.fn(),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllCalendars,
  useCalendarsForMember,
  useSaveSelectedCalendarsMutation,
  useUpdateCalendarFlagsMutation,
} from '@/features/google/useCalendars'
import { CalendarSection } from './CalendarSection'

const connection = { connectionId: 'c1', memberId: 'm1', email: 'a@x.de', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
const cal = { id: 'cal1', summary: 'Familie', color: '#123456', isSelected: true, isShared: false, isWriteTarget: false }

const save = vi.fn()
const flags = vi.fn()

function expand() {
  fireEvent.click(screen.getByRole('button', { expanded: false }))
}

describe('CalendarSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAllCalendars).mockReturnValue({ calendars: [cal, { ...cal, id: 'cal2', isSelected: false }], isLoading: false, isError: false } as never)
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [cal], isLoading: false, isError: false } as never)
    vi.mocked(useSaveSelectedCalendarsMutation).mockReturnValue({ mutateAsync: save } as never)
    vi.mocked(useUpdateCalendarFlagsMutation).mockReturnValue({ mutateAsync: flags } as never)
    save.mockResolvedValue(undefined)
    flags.mockResolvedValue(undefined)
    // Default: one active connection loaded (section not loading/erroring).
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection], isLoading: false, isError: false } as never)
  })

  // ── section-level branches ──
  it('shows section loading', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: true, isError: false } as never)
    render(<CalendarSection />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows section error', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: true } as never)
    render(<CalendarSection />)
    expect(screen.getByText('Fehler beim Laden der Verbindungen.')).toBeInTheDocument()
  })

  it('shows the selected count and stays collapsed by default', () => {
    render(<CalendarSection />)
    expect(screen.getByText('Kalender · 1 ausgewählt')).toBeInTheDocument()
    expect(screen.queryByText('Anna – Kalender')).not.toBeInTheDocument()
  })

  it('shows an empty note when expanded with no connections', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Keine Google-Konten verbunden.')).toBeInTheDocument()
  })

  // ── inner ConnectionCalendars branches ──
  it('expands to reveal per-connection calendars', () => {
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Anna – Kalender')).toBeInTheDocument()
    expect(screen.getByText('Familie')).toBeInTheDocument()
  })

  it('shows inner loading', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: true, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows inner error', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: false, isError: true } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Fehler beim Laden der Kalender.')).toBeInTheDocument()
  })

  it('shows the empty-calendars note', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: false, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Keine Kalender gefunden.')).toBeInTheDocument()
  })

  it('toggles a calendar off and on, then saves the selection', async () => {
    render(<CalendarSection />)
    expand()
    const selectCheckbox = screen.getByRole('checkbox', { name: 'Familie' })
    fireEvent.click(selectCheckbox) // deselect
    fireEvent.click(selectCheckbox) // reselect (covers both handleToggle branches)
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarIds: ['cal1'] } }),
    )
  })

  it('sets a calendar as shared', async () => {
    render(<CalendarSection />)
    expand()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Geteilt/Familie' }))
    await waitFor(() =>
      expect(flags).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal1', isShared: true } }),
    )
  })

  it('sets a calendar as the write target', async () => {
    render(<CalendarSection />)
    expand()
    fireEvent.click(screen.getByRole('radio', { name: 'Primärkalender' }))
    await waitFor(() =>
      expect(flags).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal1', isWriteTarget: true } }),
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/google/CalendarSection.test.tsx`
Expected: FAIL — cannot resolve `./CalendarSection`.

- [ ] **Step 3: Write CalendarSection (with token-migrated ConnectionCalendars)**

Create `frontend/src/features/google/CalendarSection.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ConnectionResponse, CalendarResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllCalendars,
  useCalendarsForMember,
  useSaveSelectedCalendarsMutation,
  useUpdateCalendarFlagsMutation,
} from '@/features/google/useCalendars'

function ConnectionCalendars({ connection }: { connection: ConnectionResponse }) {
  const { calendars, isLoading, isError } = useCalendarsForMember(connection.memberId)
  const saveMutation = useSaveSelectedCalendarsMutation()
  const flagsMutation = useUpdateCalendarFlagsMutation()

  async function setShared(calendarId: string, isShared: boolean) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isShared } })
  }

  async function setWriteTarget(calendarId: string) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isWriteTarget: true } })
  }

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    calendars.filter((c) => c.isSelected).map((c) => c.id),
  )

  useEffect(() => {
    setSelectedIds(calendars.filter((c) => c.isSelected).map((c) => c.id))
  }, [calendars])

  function handleToggle(calendarId: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, calendarId] : prev.filter((id) => id !== calendarId)))
  }

  async function handleSave() {
    await saveMutation.mutateAsync({ data: { memberId: connection.memberId, calendarIds: selectedIds } })
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-medium text-primary mb-2">{connection.name} – Kalender</h3>

      {isLoading && <p className="text-muted">Wird geladen…</p>}
      {isError && <p className="text-danger">Fehler beim Laden der Kalender.</p>}
      {!isLoading && !isError && calendars.length === 0 && (
        <p className="text-muted">Keine Kalender gefunden.</p>
      )}

      {!isLoading && !isError && calendars.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {calendars.map((calendar: CalendarResponse) => (
            <li key={calendar.id} className="flex flex-wrap items-center gap-3">
              <span
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: calendar.color }}
                aria-hidden="true"
              />
              <label className="flex items-center gap-2 text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(calendar.id)}
                  onChange={(e) => handleToggle(calendar.id, e.target.checked)}
                  className="w-5 h-5"
                />
                {calendar.summary}
              </label>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Geteilt/Familie"
                  checked={calendar.isShared}
                  onChange={(e) => void setShared(calendar.id, e.target.checked)}
                  className="w-5 h-5"
                />
                Geteilt
              </label>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="radio"
                  aria-label="Primärkalender"
                  name={`write-target-${connection.connectionId}`}
                  checked={calendar.isWriteTarget}
                  onChange={() => void setWriteTarget(calendar.id)}
                  className="w-5 h-5"
                />
                Primär
              </label>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && (
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-accent px-4 py-2 min-h-[44px] text-white"
        >
          Speichern
        </button>
      )}
    </div>
  )
}

export function CalendarSection() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { calendars } = useAllCalendars()
  const [open, setOpen] = useState(false)
  const selectedCount = calendars.filter((c) => c.isSelected).length

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-muted">Wird geladen…</p>
      </section>
    )
  }

  if (isError) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-danger">Fehler beim Laden der Verbindungen.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-surface border border-subtle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 min-h-[44px]"
      >
        <span className="text-xl font-semibold text-primary">Kalender · {selectedCount} ausgewählt</span>
        {open ? <ChevronDown aria-hidden className="text-muted" /> : <ChevronRight aria-hidden className="text-muted" />}
      </button>
      {open && (
        <div className="p-4 pt-0">
          {connections.length === 0 ? (
            <p className="text-muted">Keine Google-Konten verbunden.</p>
          ) : (
            connections.map((connection) => (
              <ConnectionCalendars key={connection.connectionId} connection={connection} />
            ))
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Delete the old CalendarManagement files**

```bash
git rm frontend/src/features/google/CalendarManagement.tsx frontend/src/features/google/CalendarManagement.test.tsx
```

- [ ] **Step 5: Run the new test**

Run: `npm run test:run -- src/features/google/CalendarSection.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/google/CalendarSection.tsx frontend/src/features/google/CalendarSection.test.tsx
git commit -m "feat(google): collapsible CalendarSection replacing CalendarManagement"
```

---

## Task B6: Assemble the new SettingsView

**Files:**
- Modify: `frontend/src/features/settings/SettingsView.tsx`
- Modify: `frontend/src/features/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `PinGate`, `ThemeToggle`, `MemberSection` (B3), `GoogleAccountsSettings` (B4), `CalendarSection` (B5), `ChangePinDialog`.
- Produces: unchanged export `SettingsView`. Order: topbar (← link + ThemeToggle) → `MemberSection` → `GoogleAccountsSettings` → `CalendarSection` → ghost "PIN ändern" button.

- [ ] **Step 1: Rewrite the SettingsView test for the assembled sections**

Replace the whole of `frontend/src/features/settings/SettingsView.test.tsx` with:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/theme/ThemeToggle', () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
vi.mock('@/features/settings/MemberSection', () => ({ MemberSection: () => <div>MemberSection</div> }))
vi.mock('@/features/google/GoogleAccountsSettings', () => ({ GoogleAccountsSettings: () => <div>GoogleAccountsSettings</div> }))
vi.mock('@/features/google/CalendarSection', () => ({ CalendarSection: () => <div>CalendarSection</div> }))
vi.mock('@/features/settings/ChangePinDialog', () => ({
  ChangePinDialog: ({ onClose }: { onClose: () => void }) => (
    <div>ChangePinDialog<button onClick={onClose}>CloseChangePin</button></div>
  ),
}))

import { SettingsView } from './SettingsView'

function renderView() {
  return render(<MemoryRouter><SettingsView /></MemoryRouter>)
}

describe('SettingsView', () => {
  it('renders the three sections and the theme toggle', () => {
    renderView()
    expect(screen.getByText('MemberSection')).toBeInTheDocument()
    expect(screen.getByText('GoogleAccountsSettings')).toBeInTheDocument()
    expect(screen.getByText('CalendarSection')).toBeInTheDocument()
    expect(screen.getByText('ThemeToggle')).toBeInTheDocument()
  })

  it('opens and closes the ChangePinDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseChangePin' }))
    expect(screen.queryByText('ChangePinDialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: FAIL — `SettingsView` still imports `CalendarManagement` and renders the member grid inline.

- [ ] **Step 3: Rewrite SettingsView**

Replace the whole of `frontend/src/features/settings/SettingsView.tsx` with:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PinGate } from '@/features/pin/PinGate'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { MemberSection } from './MemberSection'
import { GoogleAccountsSettings } from '@/features/google/GoogleAccountsSettings'
import { CalendarSection } from '@/features/google/CalendarSection'
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/settings/SettingsView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Full gate**

Run: `npm run check`
Expected: exit 0 (types, lint, depcruise, 100%-branch coverage). If any migrated file dips below a threshold, add the missing-branch test in that file's suite before proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/settings/SettingsView.tsx frontend/src/features/settings/SettingsView.test.tsx
git commit -m "feat(settings): assemble redesigned settings from sections + ghost PIN button"
```

---
---

# PHASE D — Member ↔ Google-account link (full-stack)

## Task D1: Contract — add optional `memberId` to authorizeGoogle

**Files:**
- Modify: `api/openapi.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: `authorizeGoogle` gains an optional `memberId` query param (`type: string, format: uuid`). After regeneration: frontend `AuthorizeGoogleParams` gains `memberId?: string`; backend `GoogleAuthApi.authorizeGoogle` gains a third `memberId: UUID?` parameter.

- [ ] **Step 1: Add the parameter to the spec**

In `api/openapi.yml`, under path `/v1/google/auth/authorize` → `get` → `parameters:`, add a third entry **after** the `returnUrl` param and **before** `responses:`:

```yaml
        - name: memberId
          in: query
          required: false
          schema:
            type: string
            format: uuid
```

- [ ] **Step 2: Regenerate the frontend client and verify the param exists**

Run: `cd frontend && npm run generate:api`
Then confirm the generated model gained the field:
Run: `grep -n "memberId" frontend/src/api/generated/model/authorizeGoogleParams.ts`
Expected: a line `memberId?: string;`.

- [ ] **Step 3: Regenerate the backend interface and verify no breaking-change**

Run: `cd backend && ./gradlew openApiGenerate`
Expected: BUILD SUCCESSFUL. The generated `GoogleAuthApi.authorizeGoogle` now takes `memberId: UUID?`. (An additive optional query param is **not** a breaking change under oasdiff — no `breaking-change` label needed.)

- [ ] **Step 4: Commit the spec (generated code is gitignored)**

```bash
git add api/openapi.yml
git commit -m "feat(api): optional memberId query param on authorizeGoogle"
```

---

## Task D2: OAuthStateStore — carry memberId through the flow

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/oauth/OAuthStateStore.kt`
- Modify: `backend/src/test/kotlin/com/familyhub/google/oauth/OAuthStateStoreTest.kt` (if present; else create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `data class OAuthStateEntry(val credentialsId: UUID?, val returnUrl: String, val verifier: String, val memberId: UUID? = null)`
  - `fun create(credentialsId: UUID?, returnUrl: String, verifier: String, memberId: UUID? = null): String`
  - The defaults keep all existing positional call sites (tests) compiling.

- [ ] **Step 1: Add a failing test that memberId round-trips**

First check for an existing store test: `ls backend/src/test/kotlin/com/familyhub/google/oauth/OAuthStateStoreTest.kt`.

If it exists, add this test method inside its class; otherwise create the file with this content:

```kotlin
package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.ZoneOffset
import java.util.UUID

class OAuthStateStoreMemberIdTest {
    private val store = OAuthStateStore(Clock.systemUTC().let { Clock.fixed(it.instant(), ZoneOffset.UTC) })

    @Test
    fun `create stores and consume returns the memberId`() {
        val memberId = UUID.randomUUID()
        val state = store.create(UUID.randomUUID(), "/settings", "verifier", memberId)
        val entry = store.consume(state)
        assertThat(entry).isNotNull
        assertThat(entry!!.memberId).isEqualTo(memberId)
    }

    @Test
    fun `create without memberId defaults to null`() {
        val state = store.create(UUID.randomUUID(), "/settings", "verifier")
        assertThat(store.consume(state)!!.memberId).isNull()
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.OAuthStateStoreMemberIdTest"`
Expected: FAIL to compile — `create` has no 4-arg overload and `OAuthStateEntry` has no `memberId`.

- [ ] **Step 3: Add memberId to the entry and create()**

In `backend/src/main/kotlin/com/familyhub/google/oauth/OAuthStateStore.kt`:

Change the data class:
```kotlin
data class OAuthStateEntry(val credentialsId: UUID?, val returnUrl: String, val verifier: String)
```
to:
```kotlin
data class OAuthStateEntry(
    val credentialsId: UUID?,
    val returnUrl: String,
    val verifier: String,
    val memberId: UUID? = null,
)
```

Change `create`:
```kotlin
    fun create(
        credentialsId: UUID?,
        returnUrl: String,
        verifier: String,
    ): String {
        val nonce = encoder.encodeToString(ByteArray(24).also { random.nextBytes(it) })
        store[nonce] = Stored(OAuthStateEntry(credentialsId, returnUrl, verifier), clock.instant())
        return nonce
    }
```
to:
```kotlin
    fun create(
        credentialsId: UUID?,
        returnUrl: String,
        verifier: String,
        memberId: UUID? = null,
    ): String {
        val nonce = encoder.encodeToString(ByteArray(24).also { random.nextBytes(it) })
        store[nonce] = Stored(OAuthStateEntry(credentialsId, returnUrl, verifier, memberId), clock.instant())
        return nonce
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.OAuthStateStoreMemberIdTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth/OAuthStateStore.kt backend/src/test/kotlin/com/familyhub/google/oauth/
git commit -m "feat(google): carry memberId through the in-memory OAuth state"
```

---

## Task D3: ConnectionService — link a connection to a chosen member

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/connection/ConnectionService.kt`
- Modify: `backend/src/test/kotlin/com/familyhub/google/connection/ConnectionServiceTest.kt`

**Interfaces:**
- Consumes: `OAuthStateStore.create(..., memberId)` (D2), `connections.findByFamilyMemberId`, `members.findById`.
- Produces:
  - `fun startAuthorization(credentialsId: UUID?, returnUrl: String, memberId: UUID? = null): String` — passes `memberId` into `stateStore.create`.
  - `handleCallback` behavior (model decisions):
    1. `entry.memberId != null` + no existing connection for that Google account → attach a **new** connection to the chosen existing member (no auto-create); any prior connection on that member is deleted (1:1 replace).
    2. Existing connection for the Google account + `entry.memberId != null` and different → **rehang** it to the chosen member (delete a conflicting connection on the target first).
    3. `entry.memberId == null` → unchanged auto-create fallback.

- [ ] **Step 1: Update existing startAuthorization test stubs, then add failing member-link tests**

In `backend/src/test/kotlin/com/familyhub/google/connection/ConnectionServiceTest.kt`:

(a) The existing `startAuthorization` tests stub `stateStore.create` with **three** args; the call now passes four. Update each `every { stateStore.create(...) }` for startAuthorization to include a trailing `null`, e.g. change:
```kotlin
        every { stateStore.create(credId, "/setup", "verifier") } returns "state-nonce"
```
to:
```kotlin
        every { stateStore.create(credId, "/setup", "verifier", null) } returns "state-nonce"
```
Do the same for the `"/home"` stub (and any other startAuthorization stub in the file).

(b) Add these new tests inside the class (they assume the existing helpers/stubbing style — construct `OAuthStateEntry` positionally with a 4th `memberId` arg):

```kotlin
    @Test
    fun `startAuthorization forwards memberId into the state`() {
        val memberId = UUID.randomUUID()
        every { credentials.entity(credId) } returns credEntity
        every { pkce.generateVerifier() } returns "verifier"
        every { pkce.challengeFor("verifier") } returns "challenge"
        every { stateStore.create(credId, "/settings", "verifier", memberId) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "https://g"

        service.startAuthorization(credId, "/settings", memberId)

        verify { stateStore.create(credId, "/settings", "verifier", memberId) }
    }

    @Test
    fun `handleCallback with memberId links a new connection to the existing member`() {
        val memberId = UUID.randomUUID()
        val existingMember = FamilyMember(name = "Anna", role = "parent", color = "blue").also { it.id = memberId }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", memberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("sub-1", "anna@gmail.com", "Anna Google", null)
        every { connections.findByGoogleAccountId("sub-1") } returns null
        every { connections.findByFamilyMemberId(memberId) } returns null
        every { members.findById(memberId) } returns Optional.of(existingMember)

        val result = service.handleCallback("code", "state")

        assertThat(result.memberId).isEqualTo(memberId)
        assertThat(result.isNewMember).isFalse()
        verify(exactly = 0) { members.save(any()) }
        verify { connections.save(match<GoogleConnection> { it.familyMemberId == memberId && it.googleAccountId == "sub-1" }) }
    }

    @Test
    fun `handleCallback with memberId replaces the members existing connection`() {
        val memberId = UUID.randomUUID()
        val existingMember = FamilyMember(name = "Anna", role = "parent", color = "blue").also { it.id = memberId }
        val prior = GoogleConnection(
            familyMemberId = memberId, credentialsId = credId, googleAccountId = "old-sub",
            email = "old@gmail.com", accessToken = enc.encrypt("a"), refreshToken = enc.encrypt("r"),
            tokenExpiresAt = Instant.now(), scopes = listOf("calendar"),
        ).also { it.id = UUID.randomUUID() }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", memberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("new-sub", "new@gmail.com", "Anna", null)
        every { connections.findByGoogleAccountId("new-sub") } returns null
        every { connections.findByFamilyMemberId(memberId) } returns prior
        every { members.findById(memberId) } returns Optional.of(existingMember)

        service.handleCallback("code", "state")

        verify { connections.delete(prior) }
        verify { connections.save(match<GoogleConnection> { it.googleAccountId == "new-sub" }) }
    }

    @Test
    fun `handleCallback rehangs a known Google account to the chosen member`() {
        val oldMemberId = UUID.randomUUID()
        val newMemberId = UUID.randomUUID()
        val newMember = FamilyMember(name = "Ben", role = "child", color = "pink").also { it.id = newMemberId }
        val existingConn = GoogleConnection(
            familyMemberId = oldMemberId, credentialsId = credId, googleAccountId = "sub-9",
            email = "x@gmail.com", accessToken = enc.encrypt("a"), refreshToken = enc.encrypt("r"),
            tokenExpiresAt = Instant.now(), scopes = listOf("calendar"),
        ).also { it.id = UUID.randomUUID() }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", newMemberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("sub-9", "x@gmail.com", "X", null)
        every { connections.findByGoogleAccountId("sub-9") } returns existingConn
        every { connections.findByFamilyMemberId(newMemberId) } returns null
        every { members.findById(newMemberId) } returns Optional.of(newMember)

        val result = service.handleCallback("code", "state")

        assertThat(result.memberId).isEqualTo(newMemberId)
        verify { connections.save(match<GoogleConnection> { it.familyMemberId == newMemberId } ) }
    }
```

Ensure the imports at the top of the test file include (add any missing):
```kotlin
import com.familyhub.google.oauth.GoogleTokenSet
import com.familyhub.google.oauth.GoogleUserInfo
```
(The wildcard `import com.familyhub.google.oauth.*` already present covers these; add explicit imports only if compilation complains.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.connection.ConnectionServiceTest"`
Expected: FAIL — `startAuthorization` has no 3-arg overload with `memberId`; `handleCallback` still auto-creates a member when `entry.memberId` is set.

- [ ] **Step 3: Add memberId to startAuthorization**

In `backend/src/main/kotlin/com/familyhub/google/connection/ConnectionService.kt`, change `startAuthorization`:
```kotlin
    fun startAuthorization(
        credentialsId: UUID?,
        returnUrl: String,
    ): String {
```
to:
```kotlin
    fun startAuthorization(
        credentialsId: UUID?,
        returnUrl: String,
        memberId: UUID? = null,
    ): String {
```
and change the state-creation line:
```kotlin
        val state = stateStore.create(cred.id, safeReturn, verifier)
```
to:
```kotlin
        val state = stateStore.create(cred.id, safeReturn, verifier, memberId)
```

- [ ] **Step 4: Rewrite the linking logic in handleCallback**

In the same file, replace the whole `if (existing == null) { ... } else { ... }` block (the member/connection creation logic, currently lines ~91–130) with:

```kotlin
        val member: FamilyMember
        val isNew: Boolean
        if (existing == null) {
            if (refresh == null) {
                throw ValidationException(
                    "Google hat kein Refresh-Token geliefert. Bitte den Zugriff in den " +
                        "Google-Kontoeinstellungen entfernen und erneut verbinden.",
                )
            }
            val chosenMemberId = entry.memberId
            if (chosenMemberId != null) {
                member =
                    members.findById(chosenMemberId).orElseThrow {
                        ResourceNotFoundException("Mitglied nicht gefunden")
                    }
                // 1 member ↔ 1 Google account: replace any prior connection on this member.
                connections.findByFamilyMemberId(chosenMemberId)?.let { connections.delete(it) }
                isNew = false
            } else {
                member =
                    members.save(
                        FamilyMember(
                            name = userInfo.name ?: userInfo.email, role = "parent",
                            color = palette[(members.count() % palette.size).toInt()],
                        ),
                    )
                isNew = true
            }
            connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!, credentialsId = cred.id, googleAccountId = userInfo.sub,
                    email = userInfo.email, accessToken = encryption.encrypt(tokens.accessToken),
                    refreshToken = encryption.encrypt(refresh),
                    tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds),
                    scopes = if (tokens.scope != null) tokens.scope.split(" ") else emptyList(), status = "active",
                ),
            )
        } else {
            // Known Google account: update tokens, and rehang to the chosen member if one was picked.
            val targetMemberId = entry.memberId ?: existing.familyMemberId
            if (entry.memberId != null && entry.memberId != existing.familyMemberId) {
                connections.findByFamilyMemberId(entry.memberId)?.let {
                    if (it.id != existing.id) connections.delete(it)
                }
            }
            member =
                members.findById(targetMemberId).orElseThrow {
                    ResourceNotFoundException("Mitglied nicht gefunden")
                }
            existing.familyMemberId = targetMemberId
            existing.accessToken = encryption.encrypt(tokens.accessToken)
            existing.tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds)
            existing.status = "active"
            existing.credentialsId = cred.id
            if (refresh != null) existing.refreshToken = encryption.encrypt(refresh)
            tokens.scope?.let { existing.scopes = it.split(" ") }
            connections.save(existing)
            isNew = false
        }
```

(The surrounding lines — `val existing = ...`, `val refresh = tokens.refreshToken`, `settings.setGoogleConnected(true)`, and the `return CallbackResult(...)` — stay exactly as they are.)

- [ ] **Step 5: Run to verify all ConnectionService tests pass**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.connection.ConnectionServiceTest"`
Expected: PASS (existing fallback/auto-create tests + the 4 new member-link tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/connection/ConnectionService.kt backend/src/test/kotlin/com/familyhub/google/connection/ConnectionServiceTest.kt
git commit -m "feat(google): attach OAuth connection to a chosen existing member"
```

---

## Task D4: GoogleAuthController — accept the memberId param

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/connection/GoogleAuthController.kt`

**Interfaces:**
- Consumes: regenerated `GoogleAuthApi.authorizeGoogle(credentialsId, returnUrl, memberId)`, `ConnectionService.startAuthorization(..., memberId)` (D3).
- Produces: the controller override matching the new interface signature, forwarding `memberId`.

- [ ] **Step 1: Update the override signature**

In `backend/src/main/kotlin/com/familyhub/google/connection/GoogleAuthController.kt`, change:
```kotlin
    override fun authorizeGoogle(
        credentialsId: UUID?,
        returnUrl: String?,
    ): ResponseEntity<AuthUrlResponse> =
        ResponseEntity.ok(AuthUrlResponse(authUrl = service.startAuthorization(credentialsId, returnUrl ?: "/")))
```
to:
```kotlin
    override fun authorizeGoogle(
        credentialsId: UUID?,
        returnUrl: String?,
        memberId: UUID?,
    ): ResponseEntity<AuthUrlResponse> =
        ResponseEntity.ok(AuthUrlResponse(authUrl = service.startAuthorization(credentialsId, returnUrl ?: "/", memberId)))
```

- [ ] **Step 2: Run the backend gate**

Run: `cd backend && ./gradlew check`
Expected: BUILD SUCCESSFUL (codegen regenerates `GoogleAuthApi` with three params; the override now matches; ktlint/detekt/tests/coverage green). If JaCoCo flags the new `handleCallback` branches, they are covered by Task D3's tests — re-run confirms.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/connection/GoogleAuthController.kt
git commit -m "feat(google): pass memberId from authorizeGoogle to the service"
```

---

## Task D5: Frontend — MemberPickerDialog and "choose member first" wiring

**Files:**
- Create: `frontend/src/features/google/MemberPickerDialog.tsx`
- Test: `frontend/src/features/google/MemberPickerDialog.test.tsx`
- Modify: `frontend/src/features/google/GoogleAccountsSettings.tsx`
- Modify: `frontend/src/features/google/GoogleAccountsSettings.test.tsx`
- Modify: `frontend/src/features/setup/ConnectStep.tsx`
- Modify: `frontend/src/features/setup/ConnectStep.test.tsx`

**Interfaces:**
- Consumes: `MemberResponse`, `MEMBER_COLORS`/`roleLabel`, `useMembers`, `useStartGoogleAuth` (now accepts `{ returnUrl, memberId }`).
- Produces: `function MemberPickerDialog({ members, onSelect, onCancel }: { members: MemberResponse[]; onSelect: (memberId: string) => void; onCancel: () => void })` — a `role="dialog"` list of members; each row calls `onSelect(member.id)`.

- [ ] **Step 1: Write the failing MemberPickerDialog test**

Create `frontend/src/features/google/MemberPickerDialog.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { MemberPickerDialog } from './MemberPickerDialog'

// Anna has an avatar (covers the <img> branch), Ben does not (covers the
// initial-letter <span> branch); the two roles cover both roleLabel outputs.
const members = [
  { id: '1', name: 'Anna', role: 'parent', color: 'blue', avatarUrl: 'http://x/a.png', isActive: true, createdAt: 'x', updatedAt: 'x' },
  { id: '2', name: 'Ben', role: 'child', color: 'pink', isActive: true, createdAt: 'x', updatedAt: 'x' },
]

describe('MemberPickerDialog', () => {
  it('lists members and returns the chosen id', () => {
    const onSelect = vi.fn()
    render(<MemberPickerDialog members={members as never} onSelect={onSelect} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('cancels', () => {
    const onCancel = vi.fn()
    render(<MemberPickerDialog members={members as never} onSelect={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a hint when there are no members', () => {
    render(<MemberPickerDialog members={[]} onSelect={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Bitte zuerst ein Mitglied anlegen.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/google/MemberPickerDialog.test.tsx`
Expected: FAIL — cannot resolve `./MemberPickerDialog`.

- [ ] **Step 3: Write MemberPickerDialog**

Create `frontend/src/features/google/MemberPickerDialog.tsx`:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { MEMBER_COLORS, roleLabel, type MemberColor } from '@/features/members/colors'

export function MemberPickerDialog({
  members,
  onSelect,
  onCancel,
}: {
  members: MemberResponse[]
  onSelect: (memberId: string) => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Mitglied auswählen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary">Für welches Mitglied?</h2>
        {members.length === 0 ? (
          <p className="text-muted">Bitte zuerst ein Mitglied anlegen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => {
              const ring = MEMBER_COLORS[m.color as MemberColor] ?? MEMBER_COLORS.blue
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className="w-full flex items-center gap-3 rounded-xl bg-surface-2 p-3 min-h-[44px] text-left"
                  >
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-surface flex-shrink-0"
                      style={{ boxShadow: `0 0 0 3px ${ring}` }}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-primary">{m.name.charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-primary font-medium">{m.name}</span>
                      <span className="text-sm text-muted">{roleLabel(m.role)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="self-end min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:run -- src/features/google/MemberPickerDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the picker into GoogleAccountsSettings**

In `frontend/src/features/google/GoogleAccountsSettings.tsx`:

Add imports:
```tsx
import { useState } from 'react'
import { MemberPickerDialog } from '@/features/google/MemberPickerDialog'
```
Add picker state at the top of the component (after the existing hook calls):
```tsx
  const [picking, setPicking] = useState(false)
```
Change `handleConnect` and `handleReconnect` to accept a `memberId`:
```tsx
  async function handleConnect(memberId: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings', memberId })
    window.location.href = authUrl
  }

  async function handleReconnect(memberId: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings', memberId })
    window.location.href = authUrl
  }
```
Change the `SectionCard` `action` to open the picker instead of connecting directly:
```tsx
    <SectionCard title="Google-Konten" action={{ label: 'Google-Konto verbinden', onClick: () => setPicking(true) }}>
```
Change the reconnect button's `onClick` to pass the connection's member:
```tsx
                        onClick={() => handleReconnect(connection.memberId)}
```
Finally, render the picker at the very end of the `SectionCard` (just before its closing `</SectionCard>`), by wrapping the current single child list in a fragment. Concretely, change the closing of the card from:
```tsx
      )}
    </SectionCard>
  )
}
```
to:
```tsx
      )}
      {picking && (
        <MemberPickerDialog
          members={members}
          onSelect={(id) => {
            setPicking(false)
            void handleConnect(id)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </SectionCard>
  )
}
```

- [ ] **Step 6: Update the GoogleAccountsSettings test for the picker flow**

In `frontend/src/features/google/GoogleAccountsSettings.test.tsx`, replace the two tests `'+ action starts the connect redirect'` and `'reconnect redirects to the auth url'` with these (the `+` now opens the picker; selecting a member passes `memberId`):

```tsx
  it('+ action opens the member picker, and choosing a member starts the connect', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Google-Konto verbinden' }))
    expect(screen.getByRole('dialog', { name: 'Mitglied auswählen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/settings', memberId: 'mem-1' })
  })

  it('reconnect passes the connection member id', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [revoked], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/settings', memberId: 'mem-2' }))
  })

  it('cancels the member picker', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Google-Konto verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog', { name: 'Mitglied auswählen' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Run the GoogleAccountsSettings suite**

Run: `npm run test:run -- src/features/google/GoogleAccountsSettings.test.tsx`
Expected: PASS.

- [ ] **Step 8: Wire memberId into the setup ConnectStep**

Replace the whole of `frontend/src/features/setup/ConnectStep.tsx` with:

```tsx
import { useState } from 'react'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { MemberPickerDialog } from '@/features/google/MemberPickerDialog'

// `onNext` is intentionally unused: this step redirects to Google via
// window.location.href, and progression is handled by the OAuth callback +
// wizard resume when the user returns. The prop is kept for interface uniformity.
export function ConnectStep({ onNext: _onNext }: { onNext: () => void }) {
  const startAuth = useStartGoogleAuth()
  const { members } = useMembers()
  const [picking, setPicking] = useState(false)

  async function connect(memberId?: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/setup', memberId })
    window.location.href = authUrl
  }

  function handleClick() {
    // With members present, attach to a chosen one; with none, fall back to auto-create.
    if (members.length === 0) void connect()
    else setPicking(true)
  }

  return (
    <div className="flex flex-col gap-6 text-white text-center">
      <h1 className="text-2xl font-bold">Mit Google verbinden</h1>
      <p className="text-slate-300">
        Du wirst jetzt zu Google weitergeleitet, um FamilyHub den Zugriff auf deinen Kalender zu
        erlauben. Nach der Bestätigung kehrst du automatisch hierher zurück.
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="mx-auto min-h-[44px] rounded-xl bg-blue-500 px-6 py-3 text-white"
      >
        Mit Google verbinden
      </button>
      {picking && (
        <MemberPickerDialog
          members={members}
          onSelect={(id) => {
            setPicking(false)
            void connect(id)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}
```

(Note: `ConnectStep` keeps its hardcoded `text-white`/`slate` styling — the setup wizard is deliberately out of scope for the theme migration, per the spec's non-goals.)

- [ ] **Step 9: Update the ConnectStep test**

Read `frontend/src/features/setup/ConnectStep.test.tsx` first. Update it to mock `@/features/members/useMembersQuery` and cover both branches. Replace its body with:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useCalendars', () => ({ useStartGoogleAuth: vi.fn() }))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { ConnectStep } from './ConnectStep'

const AUTH_URL = 'https://accounts.google.com/auth'
const member = { id: 'm1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

describe('ConnectStep', () => {
  const startAuth = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: startAuth } as never)
    startAuth.mockResolvedValue(AUTH_URL)
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('with members, opens the picker and connects with the chosen memberId', async () => {
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    render(<ConnectStep onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/setup', memberId: 'm1' })
  })

  it('with no members, connects without a memberId (fallback)', async () => {
    vi.mocked(useMembers).mockReturnValue({ members: [], isLoading: false, isError: false } as never)
    render(<ConnectStep onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/setup', memberId: undefined })
  })
})
```

- [ ] **Step 10: Run the setup suite**

Run: `npm run test:run -- src/features/setup/ConnectStep.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 11: Full frontend gate**

Run: `npm run check`
Expected: exit 0 (types, lint, depcruise, 100%-branch coverage).

- [ ] **Step 12: Commit**

```bash
git add frontend/src/features/google/MemberPickerDialog.tsx frontend/src/features/google/MemberPickerDialog.test.tsx frontend/src/features/google/GoogleAccountsSettings.tsx frontend/src/features/google/GoogleAccountsSettings.test.tsx frontend/src/features/setup/ConnectStep.tsx frontend/src/features/setup/ConnectStep.test.tsx
git commit -m "feat(google): choose member first before starting the OAuth connect"
```

---
---

## Final verification (whole feature)

- [ ] **Backend gate:** `cd backend && ./gradlew check` → BUILD SUCCESSFUL.
- [ ] **Frontend gate:** `cd frontend && npm run check` → exit 0.
- [ ] **Combined pre-commit mirror:** `scripts/pre-commit-check.sh` → green.
- [ ] **Manual smoke (reachable through UI):** run the app, open `/settings` → PIN gate appears; type the PIN on the physical keyboard, press Enter → sections appear; toggle sun/moon → settings recolors; add a member; `+` on Google-Konten opens the member picker; the trash icon disconnects; the Kalender card expands to the calendar list.

---

## Notes on risks (from the spec)

- **Coverage 100% branches:** the new branches most likely to trip coverage are the `customFetch` 401 path (Task C2 test), the four `initialTheme` branches (Task A2 tests), the `PinInputDialog` keyboard branches incl. the Enter-below-4 and >6-digit caps (Task C4 tests), and the `handleCallback` member-link branches (Task D3 tests). Each is exercised by a dedicated test in its task.
- **Setup ConnectStep memberId:** handled by branching on `members.length` — picker when members exist, auto-create fallback when none (Task D5, both branches tested).
- **Interim theme inconsistency:** calendar/setup pages remain hardcoded dark; only Settings is token-migrated. This is accepted by the spec ("Settings zuerst").
