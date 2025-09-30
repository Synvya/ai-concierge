import { useCallback, useEffect, useState } from 'react'

const VISITOR_STORAGE_KEY = 'ai-concierge-visitor-id'
const SESSION_STORAGE_KEY = 'ai-concierge-session-id'

interface ClientIds {
  visitorId: string | null
  sessionId: string | null
  resetSession: () => void
}

const createUuid = () => crypto.randomUUID()

export const useClientIds = (): ClientIds => {
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const existingVisitor = localStorage.getItem(VISITOR_STORAGE_KEY)
    const resolvedVisitor = existingVisitor ?? createUuid()
    if (!existingVisitor) {
      localStorage.setItem(VISITOR_STORAGE_KEY, resolvedVisitor)
    }

    const existingSession = sessionStorage.getItem(SESSION_STORAGE_KEY)
    const resolvedSession = existingSession ?? createUuid()
    if (!existingSession) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, resolvedSession)
    }

    setVisitorId(resolvedVisitor)
    setSessionId(resolvedSession)
  }, [])

  const resetSession = useCallback(() => {
    const newSession = createUuid()
    sessionStorage.setItem(SESSION_STORAGE_KEY, newSession)
    setSessionId(newSession)
  }, [])

  return { visitorId, sessionId, resetSession }
}
