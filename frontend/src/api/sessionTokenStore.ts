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
