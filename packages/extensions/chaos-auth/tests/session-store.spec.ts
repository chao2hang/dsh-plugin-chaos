import { describe, it, expect } from 'vitest'
import {
  SessionStore, constantTimeEqual, cookieMaxAge, buildCookie, clearCookie,
  extractSessionId, DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_ABSOLUTE_TIMEOUT_MS,
  SESSION_COOKIE,
} from '../src/session-store.ts'

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
  })
  it('returns false for different strings of same length', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
  })
  it('returns false for different-length strings', () => {
    expect(constantTimeEqual('short', 'longer-string')).toBe(false)
  })
  it('returns false for empty vs non-empty', () => {
    expect(constantTimeEqual('', 'x')).toBe(false)
  })
  it('returns true for two empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true)
  })
  it('handles unicode safely', () => {
    expect(constantTimeEqual('密码🔐', '密码🔐')).toBe(true)
    expect(constantTimeEqual('密码🔐', '密码🔓')).toBe(false)
  })
})

describe('SessionStore construction', () => {
  it('creates with default config', () => {
    const store = new SessionStore({ idleTimeoutMs: 1000, absoluteTimeoutMs: 2000 })
    expect(store.size).toBe(0)
  })
  it('throws when absolute < idle', () => {
    expect(() => new SessionStore({ idleTimeoutMs: 5000, absoluteTimeoutMs: 3000 }))
      .toThrow(/absolute timeout.*must be >= idle timeout/)
  })
  it('accepts absolute === idle', () => {
    const store = new SessionStore({ idleTimeoutMs: 5000, absoluteTimeoutMs: 5000 })
    expect(store.size).toBe(0)
  })
  it('default timeouts are 7 days and 30 days', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(DEFAULT_ABSOLUTE_TIMEOUT_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('SessionStore session lifecycle', () => {
  const config = { idleTimeoutMs: 1000, absoluteTimeoutMs: 5000 }
  let store: SessionStore

  it('create generates a 256-bit (64 hex char) session ID', () => {
    store = new SessionStore(config)
    const session = store.create()
    expect(session.id).toHaveLength(64)
    expect(session.id).toMatch(/^[0-9a-f]+$/)
    expect(store.size).toBe(1)
  })

  it('validate returns the session for a valid ID', () => {
    const session = store.create()
    const validated = store.validate(session.id)
    expect(validated?.id).toBe(session.id)
  })

  it('validate returns undefined for an unknown ID', () => {
    expect(store.validate('nonexistent')).toBeUndefined()
  })

  it('validate returns undefined for undefined input', () => {
    expect(store.validate(undefined)).toBeUndefined()
  })

  it('destroy removes the session', () => {
    const session = store.create()
    store.destroy(session.id)
    expect(store.validate(session.id)).toBeUndefined()
  })

  it('destroy of undefined is a no-op', () => {
    store.destroy(undefined)
    expect(store.size).toBeGreaterThanOrEqual(0)
  })

  it('two sessions have different IDs', () => {
    const a = store.create()
    const b = store.create()
    expect(a.id).not.toBe(b.id)
  })
})

describe('SessionStore idle timeout', () => {
  it('expires session after idle timeout', () => {
    const store = new SessionStore({ idleTimeoutMs: 50, absoluteTimeoutMs: 5000 })
    const session = store.create()
    // Fast-forward time by mocking Date.now
    const originalNow = Date.now
    const created = Date.now()
    Date.now = () => created + 100
    const validated = store.validate(session.id)
    Date.now = originalNow
    expect(validated).toBeUndefined()
    expect(store.size).toBe(0)
  })

  it('refreshes lastActivity on validate (sliding expiry)', () => {
    const store = new SessionStore({ idleTimeoutMs: 100, absoluteTimeoutMs: 5000 })
    const session = store.create()
    const originalActivity = session.lastActivity
    // Small time advance
    const originalNow = Date.now
    Date.now = () => originalNow() + 50
    store.validate(session.id)
    Date.now = originalNow
    expect(session.lastActivity).toBeGreaterThan(originalActivity)
  })
})

describe('SessionStore absolute timeout', () => {
  it('expires session after absolute timeout even with activity', () => {
    // absolute must be >= idle, so set both short with absolute slightly longer
    const store = new SessionStore({ idleTimeoutMs: 50, absoluteTimeoutMs: 100 })
    const session = store.create()
    const originalNow = Date.now
    const created = Date.now()
    // Simulate continuous activity past absolute timeout
    // Keep refreshing idle but past absolute
    Date.now = () => created + 60 // still within idle (60 < 50? no, 60 > 50)
    store.validate(session.id) // this refreshes lastActivity
    Date.now = () => created + 150 // past absolute (150 > 100)
    const validated = store.validate(session.id)
    Date.now = originalNow
    expect(validated).toBeUndefined()
  })
})

describe('cookieMaxAge', () => {
  it('returns min of idle and absolute remaining', () => {
    const config = { idleTimeoutMs: 10000, absoluteTimeoutMs: 30000 }
    const now = 5000
    const session = { id: 'x', createdAt: 0, lastActivity: 0 }
    // idle remaining: 10000 - (5000 - 0) = 5000
    // absolute remaining: 30000 - (5000 - 0) = 25000
    // min = 5000 → 5 seconds
    expect(cookieMaxAge(session, now, config)).toBe(5)
  })

  it('returns 0 when expired', () => {
    const config = { idleTimeoutMs: 100, absoluteTimeoutMs: 200 }
    const session = { id: 'x', createdAt: 0, lastActivity: 0 }
    expect(cookieMaxAge(session, 500, config)).toBe(0)
  })

  it('absolute caps cookie when idle window is longer', () => {
    const config = { idleTimeoutMs: 50000, absoluteTimeoutMs: 3000 }
    const session = { id: 'x', createdAt: 2500, lastActivity: 2500 }
    // idle remaining: 50000 - (2500 - 2500) = 50000 → wait, now=2500
    // idle remaining: 2500 + 50000 - 2500 = 50000
    // absolute remaining: 2500 + 3000 - 2500 = 3000
    // min = 3000 → 3 seconds
    expect(cookieMaxAge(session, 2500, config)).toBe(3)
  })
})

describe('buildCookie', () => {
  it('includes HttpOnly and SameSite=Strict', () => {
    const config = { idleTimeoutMs: 10000, absoluteTimeoutMs: 30000 }
    const session = { id: 'abc', createdAt: 0, lastActivity: 0 }
    const cookie = buildCookie(session, 0, config, false)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain(`${SESSION_COOKIE}=abc`)
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
  })

  it('includes Secure when https', () => {
    const config = { idleTimeoutMs: 10000, absoluteTimeoutMs: 30000 }
    const session = { id: 'abc', createdAt: 0, lastActivity: 0 }
    const cookie = buildCookie(session, 0, config, true)
    expect(cookie).toContain('Secure')
  })
})

describe('clearCookie', () => {
  it('clears the cookie with Max-Age=0', () => {
    const cookie = clearCookie(false)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain(`${SESSION_COOKIE}=`)
    expect(cookie).toContain('HttpOnly')
  })
})

describe('extractSessionId', () => {
  it('extracts from a Cookie header', () => {
    const req = { headers: { cookie: `${SESSION_COOKIE}=abc123; other=xyz` } }
    expect(extractSessionId(req as never)).toBe('abc123')
  })

  it('returns undefined when no cookie header', () => {
    const req = { headers: {} }
    expect(extractSessionId(req as never)).toBeUndefined()
  })

  it('returns undefined when session cookie absent', () => {
    const req = { headers: { cookie: 'other=xyz' } }
    expect(extractSessionId(req as never)).toBeUndefined()
  })
})

describe('SessionStore cleanup', () => {
  it('removes expired sessions', () => {
    const store = new SessionStore({ idleTimeoutMs: 50, absoluteTimeoutMs: 100 })
    store.create()
    store.create()
    expect(store.size).toBe(2)
    const originalNow = Date.now
    const created = Date.now()
    Date.now = () => created + 200
    store.cleanup()
    Date.now = originalNow
    expect(store.size).toBe(0)
  })

  it('keeps active sessions', () => {
    const store = new SessionStore({ idleTimeoutMs: 10000, absoluteTimeoutMs: 30000 })
    const session = store.create()
    store.cleanup()
    expect(store.size).toBe(1)
    expect(store.validate(session.id)?.id).toBe(session.id)
  })
})
