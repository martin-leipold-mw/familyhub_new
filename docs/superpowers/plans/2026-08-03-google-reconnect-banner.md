# Google Reconnect Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a global, high-contrast "Google-Verbindung abgelaufen" banner with a one-click "Neu verbinden" button on every screen whenever any Google connection is `revoked`, and remove it automatically once all connections are `active` again.

**Architecture:** Pure frontend for the core feature — no API-contract change, no backend change required for the banner. A new `ConnectionRevokedBanner` component reads the connections list (polled every ~60 s), renders `null` when nothing is revoked, and otherwise renders a banner whose button re-runs the existing OAuth authorize flow with `returnUrl` set to the current path. The banner is mounted once in `AppShell`, so it appears above the content of every routed screen. A secondary, independent backend hardening persists a rotated refresh token when Google returns one during refresh.

**Tech Stack:** React 18 / TypeScript / Vite, TanStack Query (orval-generated hooks), Tailwind, vitest + Testing Library. Backend (optional task): Kotlin / Spring Boot, MockK + AssertJ + JUnit 5.

## Global Constraints

- **German-language UI throughout.** Quote German strings exactly as written in this plan.
- **Touch targets ≥ 44 × 44 px**, no hover-only interactions (`min-h-[44px]` on buttons).
- **No PIN gate on the reconnect button.** The banner must NOT import or consult `usePinSession`; the Google consent is the safeguard and the authorize/callback endpoints are not PIN-protected.
- **Never hand-edit generated API code** under `frontend/src/api/generated/`. Consume the generated hooks only.
- **Contract-first:** `api/openapi.yml` is unchanged by this plan. Do not touch it.
- **Frontend gate:** `npm run check` (run from `frontend/`) must be green. Single test file: `npm run test:run -- <path>` from `frontend/`.
- **Backend gate (only if Task 4 is done):** `./gradlew check` green; needs **Java 21** + Docker. Single unit test: `./gradlew test --tests "*GoogleTokenProviderTest*"` from `backend/`.

---

## File Structure

- `frontend/src/features/google/ConnectionRevokedBanner.tsx` (new) — the banner component. Sole responsibility: decide visibility from connection status and trigger the reconnect OAuth round-trip.
- `frontend/src/features/google/ConnectionRevokedBanner.test.tsx` (new) — unit tests for the banner, following the mocking style of `GoogleAccountsSettings.test.tsx`.
- `frontend/src/features/google/useGoogleConnections.ts` (modify) — add a `refetchInterval` so the connections query polls; the banner appears/disappears without a reload.
- `frontend/src/features/google/useGoogleConnections.test.tsx` (modify) — assert the polling option is passed.
- `frontend/src/routing/AppShell.tsx` (modify) — mount the banner above `{children}`.
- `frontend/src/routing/AppShell.test.tsx` (modify) — assert the banner is mounted above children.
- `backend/src/main/kotlin/com/familyhub/google/token/GoogleTokenProvider.kt` (modify, Task 4 / optional) — persist a rotated refresh token.
- `backend/src/test/kotlin/com/familyhub/google/token/GoogleTokenProviderTest.kt` (modify, Task 4 / optional) — cover both rotation branches.

---

## Task 1: Poll the connections list

**Files:**
- Modify: `frontend/src/features/google/useGoogleConnections.ts:10-17`
- Test: `frontend/src/features/google/useGoogleConnections.test.tsx` (add one test in the existing `describe('useGoogleConnections', …)` block, around line 86)

**Interfaces:**
- Consumes: generated `useListConnections(options?: { query?: Partial<UseQueryOptions<…>> })` from `@/api/generated/endpoints/familyHubAPI`.
- Produces: `useGoogleConnections(): { connections: ConnectionResponse[]; isLoading: boolean; isError: boolean }` — signature unchanged, but the underlying query now polls every 60 000 ms. Task 2 consumes this.

**Context:** `useListConnections` currently is called with no arguments. Its first parameter accepts `{ query?: Partial<UseQueryOptions<…>> }`, so `refetchInterval` goes under `query`. Polling here is intentionally central: the settings page also uses this hook, and the connections list is cheap (see design doc §2).

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('useGoogleConnections', () => { … })` block in `frontend/src/features/google/useGoogleConnections.test.tsx` (after the two existing tests, before the closing `})` of that describe):

```tsx
  it('polls the connections list every 60 seconds', () => {
    vi.mocked(useListConnections).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListConnections>)

    renderHook(() => useGoogleConnections(), { wrapper: makeWrapper() })
    expect(vi.mocked(useListConnections)).toHaveBeenCalledWith({
      query: { refetchInterval: 60000 },
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/google/useGoogleConnections.test.tsx`
Expected: FAIL — the new test reports `useListConnections` was called with `undefined` (or no args), not `{ query: { refetchInterval: 60000 } }`.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/features/google/useGoogleConnections.ts`, change the `useGoogleConnections` function so the query polls:

```ts
export function useGoogleConnections() {
  const query = useListConnections({ query: { refetchInterval: 60000 } })
  return {
    connections: (query.data?.data ?? []) as ConnectionResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
```

Leave the rest of the file (`useDisconnectConnectionMutation`, `useRefreshConnectionMutation`, imports) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/features/google/useGoogleConnections.test.tsx`
Expected: PASS — all tests in the file, including the new one, are green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/useGoogleConnections.ts frontend/src/features/google/useGoogleConnections.test.tsx
git commit -m "feat(google): poll connections list so revoked status surfaces live"
```

---

## Task 2: ConnectionRevokedBanner component

**Files:**
- Create: `frontend/src/features/google/ConnectionRevokedBanner.tsx`
- Test: `frontend/src/features/google/ConnectionRevokedBanner.test.tsx`

**Interfaces:**
- Consumes:
  - `useGoogleConnections(): { connections: ConnectionResponse[]; isLoading; isError }` (Task 1).
  - `useStartGoogleAuth(): { mutateAsync: (params?: AuthorizeGoogleParams) => Promise<string>; isPending: boolean }` from `@/features/google/useCalendars`. `mutateAsync` resolves to the Google `authUrl` string. `AuthorizeGoogleParams` has optional `{ credentialsId?: string; returnUrl?: string }`.
- Produces: `ConnectionRevokedBanner` — a React component taking **no props**, default-exported as a named export. Task 3 mounts it.

**Context:** Mirrors the reconnect handler in `GoogleAccountsSettings.tsx` (`startAuth.mutateAsync({ returnUrl }).then(url => window.location.href = url)`), but: (a) `returnUrl` is the *current* path so the user returns to the screen they were on, and (b) there is **no** `hasPinSession` gate. A connection is revoked when `connection.status.toLowerCase() === 'revoked'` — the same check used in `GoogleAccountsSettings.tsx:53`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/google/ConnectionRevokedBanner.test.tsx`:

```tsx
import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { ConnectionRevokedBanner } from './ConnectionRevokedBanner'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'

const activeConnection = {
  connectionId: 'conn-1',
  memberId: 'mem-1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: '2024-01-15T10:00:00Z',
  scopes: ['calendar'],
}

const revokedConnection = {
  connectionId: 'conn-2',
  memberId: 'mem-2',
  email: 'bob@gmail.com',
  name: 'Bob',
  status: 'REVOKED',
  lastSyncedAt: null,
  scopes: [],
}

const BANNER_TEXT = 'Google-Verbindung abgelaufen. Kalender wird nicht mehr aktualisiert.'

describe('ConnectionRevokedBanner', () => {
  const startAuthMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useStartGoogleAuth).mockReturnValue({
      mutateAsync: startAuthMutateAsync,
      isPending: false,
    } as never)
    startAuthMutateAsync.mockResolvedValue(AUTH_URL)

    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/kalender' },
      writable: true,
    })
  })

  it('renders nothing when all connections are active', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neu verbinden' })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no connections', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('renders the banner when at least one connection is revoked', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection, revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).toBeInTheDocument()
  })

  it('reconnect button is enabled without any PIN session', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).not.toBeDisabled()
  })

  it('clicking "Neu verbinden" authorizes with the current path and redirects to authUrl', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuthMutateAsync).toHaveBeenCalledWith({ returnUrl: '/kalender' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/google/ConnectionRevokedBanner.test.tsx`
Expected: FAIL — module `./ConnectionRevokedBanner` cannot be resolved (component not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/features/google/ConnectionRevokedBanner.tsx`:

```tsx
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'

/**
 * Global banner shown on every screen when any Google connection is revoked.
 * The reconnect button re-runs the same OAuth authorize flow used in
 * Settings, returning the user to the screen they were on. No PIN gate:
 * the Google consent screen is the safeguard.
 */
export function ConnectionRevokedBanner() {
  const { connections } = useGoogleConnections()
  const startAuth = useStartGoogleAuth()

  const hasRevoked = connections.some((c) => c.status.toLowerCase() === 'revoked')
  if (!hasRevoked) return null

  async function handleReconnect() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: window.location.pathname })
    window.location.href = authUrl
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-col items-start gap-3 bg-amber-500 px-4 py-3 text-slate-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-lg font-semibold">
        Google-Verbindung abgelaufen. Kalender wird nicht mehr aktualisiert.
      </p>
      <button
        type="button"
        onClick={handleReconnect}
        disabled={startAuth.isPending}
        className="min-h-[44px] self-start rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white disabled:opacity-50 sm:self-auto"
      >
        Neu verbinden
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/features/google/ConnectionRevokedBanner.test.tsx`
Expected: PASS — all five tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/ConnectionRevokedBanner.tsx frontend/src/features/google/ConnectionRevokedBanner.test.tsx
git commit -m "feat(google): add global revoked-connection reconnect banner"
```

---

## Task 3: Mount the banner in AppShell

**Files:**
- Modify: `frontend/src/routing/AppShell.tsx:1-9`
- Test: `frontend/src/routing/AppShell.test.tsx`

**Interfaces:**
- Consumes: `ConnectionRevokedBanner` (Task 2), no props.
- Produces: `AppShell({ children }: { children: ReactNode })` — unchanged signature, now rendering the banner above `{children}`. `AppShell` is already used in `frontend/src/App.tsx` for both the `/` and `/settings` routes, so the banner reaches every routed screen.

**Context:** `AppShell.test.tsx` currently has a single test that renders children directly (no Router, no QueryClient). Mock the banner module so this test file stays free of the banner's data hooks; the banner's own behavior is covered by Task 2.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `frontend/src/routing/AppShell.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/features/google/ConnectionRevokedBanner', () => ({
  ConnectionRevokedBanner: () => <div data-testid="revoked-banner" />,
}))

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })

  it('renders the revoked-connection banner above the children', () => {
    const { container } = render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByTestId('revoked-banner')).toBeInTheDocument()
    // The banner must be the first child of the shell, i.e. above the content.
    const root = container.firstChild as HTMLElement
    expect(root.firstElementChild).toHaveAttribute('data-testid', 'revoked-banner')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/routing/AppShell.test.tsx`
Expected: FAIL — `getByTestId('revoked-banner')` finds no element (AppShell does not render the banner yet).

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `frontend/src/routing/AppShell.tsx` with:

```tsx
import { type ReactNode } from 'react'
import { ConnectionRevokedBanner } from '@/features/google/ConnectionRevokedBanner'

/**
 * Minimal application frame. Renders the global revoked-connection banner
 * above the page content so it is visible on every screen. Prepared for a
 * future section navigation (Aufgaben/Haushalt/Fotos).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900">
      <ConnectionRevokedBanner />
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/routing/AppShell.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Run the full frontend gate**

Run (from `frontend/`): `npm run check`
Expected: PASS — `tsc --noEmit`, eslint (0 warnings), dependency-cruiser, and coverage all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routing/AppShell.tsx frontend/src/routing/AppShell.test.tsx
git commit -m "feat(google): mount revoked-connection banner in AppShell"
```

---

## Task 4 (optional): Persist rotated refresh token on refresh

> Secondary hardening from the design doc §"Optional — Backend-Härtung". Independent of the banner; reduces rare unnecessary disconnects. Skip this task if the backend gate cannot be run (needs Java 21 + Docker). If done, the DoD requires `./gradlew check` to be green.

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/token/GoogleTokenProvider.kt:49-52`
- Test: `backend/src/test/kotlin/com/familyhub/google/token/GoogleTokenProviderTest.kt` (add two tests near the existing `sets status to active …` test, ~line 214)

**Interfaces:**
- Consumes: `GoogleOAuthFlow.refresh(...)` returns `GoogleTokenSet(accessToken: String, refreshToken: String?, expiresInSeconds: Long, scope: String?)`. `GoogleConnection.refreshToken` is a non-null `var String` holding the **encrypted** token. `EncryptionService.encrypt(String): String` / `decrypt(String): String`.
- Produces: `GoogleTokenProvider.validAccessToken` unchanged signature; on a successful refresh it now overwrites `connection.refreshToken` with the encrypted rotated token **only when** `newTokens.refreshToken != null`.

**Context:** Google may return a new refresh token during a refresh. Today `GoogleTokenProvider` ignores it, so an unexpected rotation would eventually fail the next refresh and revoke the connection. The existing test `conn(...)` helper seeds `refreshToken = enc.encrypt("RT")`.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `backend/src/test/kotlin/com/familyhub/google/token/GoogleTokenProviderTest.kt`, inside the `class GoogleTokenProviderTest`, just before its final closing brace (after the `sets status to active and persists expiresAt after successful refresh` test):

```kotlin
    // ─── refresh-token rotation: Google returns a new refresh token → persist it ─

    @Test fun `persists rotated refresh token when refresh returns a new one`() {
        val c = conn(now.minusSeconds(100))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", "ROTATED", 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "ROTATED" }) }
    }

    // ─── refresh-token rotation: Google returns null → keep the existing token ─

    @Test fun `keeps existing refresh token when refresh returns null`() {
        val c = conn(now.minusSeconds(100))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "RT" }) }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `./gradlew test --tests "*GoogleTokenProviderTest*"`
Expected: FAIL — the `persists rotated refresh token …` test fails because `connection.refreshToken` still decrypts to `"RT"`, not `"ROTATED"`. (The `keeps existing …` test passes already; that is fine — it locks in the no-rotation branch.)

- [ ] **Step 3: Write the minimal implementation**

In `backend/src/main/kotlin/com/familyhub/google/token/GoogleTokenProvider.kt`, inside `validAccessToken`, extend the successful-refresh block so it persists a rotated refresh token when present:

```kotlin
            connection.accessToken = encryption.encrypt(newTokens.accessToken)
            connection.tokenExpiresAt = Instant.now(clock).plusSeconds(newTokens.expiresInSeconds)
            if (newTokens.refreshToken != null) {
                connection.refreshToken = encryption.encrypt(newTokens.refreshToken)
            }
            connection.status = "active"
            connections.save(connection)
            return newTokens.accessToken
```

Leave every other line of the file unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `./gradlew test --tests "*GoogleTokenProviderTest*"`
Expected: PASS — both new tests and all pre-existing tests in the class are green.

- [ ] **Step 5: Run the full backend gate**

Run (from `backend/`): `./gradlew check`
Expected: PASS — codegen, compile, ktlint + detekt, tests, and JaCoCo coverage all green. (Requires `JAVA_HOME` → JDK 21 and Docker.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/token/GoogleTokenProvider.kt backend/src/test/kotlin/com/familyhub/google/token/GoogleTokenProviderTest.kt
git commit -m "fix(google): persist rotated refresh token on token refresh"
```

---

## Definition of Done

- Banner appears proactively on every screen as soon as a connection is `revoked`, and disappears automatically after a successful reconnect (driven by the ~60 s poll from Task 1).
- Reconnect works without a PIN, and returns the user to the same screen (`returnUrl` = current path).
- `npm run check` (from `frontend/`) is green.
- If Task 4 was done: `./gradlew check` (from `backend/`) is green.
