/**
 * Session store: in-memory sessions with idle and absolute timeouts.
 * Security invariants:
 * - Token comparison is constant-time (crypto.timingSafeEqual).
 * - Session IDs are 256-bit random (crypto.randomBytes).
 * - Idle timeout refreshes on every authenticated request.
 * - Cookie expiry is min(idle window, remaining absolute window).
 * - Absolute timeout < idle timeout is a configuration error (checked at init).
 * - Expired sessions are cleaned up lazily on access.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

/** One authenticated session. */
interface Session {
  /** 256-bit random session ID (hex). */
  id: string
  /** Creation timestamp (ms since epoch). */
  createdAt: number
  /** Last activity timestamp (ms since epoch). */
  lastActivity: number
}

/** Session store configuration. */
export interface SessionStoreConfig {
  /** Idle timeout in ms: session expires after this much inactivity. */
  idleTimeoutMs: number
  /** Absolute timeout in ms: session expires after this much total lifetime. */
  absoluteTimeoutMs: number
}

/** Default idle timeout: 7 days. */
export const DEFAULT_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000
/** Default absolute timeout: 30 days. */
export const DEFAULT_ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000

/** Cookie name for the session. */
export const SESSION_COOKIE = 'dsh-session'

/**
 * Constant-time string comparison. Compares two strings of equal length;
 * different-length strings return false immediately (the length itself is not
 * a secret, but the comparison of the common prefix is still constant-time).
 * @param a - first string.
 * @param b - second string.
 * @returns true when the strings are equal.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Compute the cookie max-age for a session: the minimum of the remaining
 * idle window and the remaining absolute window. This ensures the cookie
 * never claims a lifetime the server will not honor.
 * @param session - the session.
 * @param now - current timestamp.
 * @param config - timeout configuration.
 * @returns max-age in seconds (0 when already expired).
 */
export function cookieMaxAge(session: Session, now: number, config: SessionStoreConfig): number {
  const idleRemaining = session.lastActivity + config.idleTimeoutMs - now
  const absoluteRemaining = session.createdAt + config.absoluteTimeoutMs - now
  const remaining = Math.min(idleRemaining, absoluteRemaining)
  return Math.max(0, Math.floor(remaining / 1000))
}

/**
 * In-memory session store with sliding idle expiry and absolute lifetime cap.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>()
  private readonly config: SessionStoreConfig

  /**
   * @param config - timeout configuration. Absolute timeout must be >= idle
   * timeout; a smaller absolute timeout is a configuration error.
   */
  constructor(config: SessionStoreConfig) {
    if (config.absoluteTimeoutMs < config.idleTimeoutMs) {
      throw new Error(
        `auth: absolute timeout (${String(config.absoluteTimeoutMs)}ms) must be >= idle timeout (${String(config.idleTimeoutMs)}ms)`,
      )
    }
    this.config = config
  }

  /**
   * Create a new session for a verified token. The session ID is 256-bit
   * random; the store records creation and activity timestamps.
   * @returns the new session.
   */
  create(): Session {
    const now = Date.now()
    const session: Session = {
      id: randomBytes(32).toString('hex'),
      createdAt: now,
      lastActivity: now,
    }
    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Validate a session ID and refresh its activity timestamp. Returns the
   * session when valid (not expired), or undefined when invalid/expired.
   * Expired sessions are removed lazily.
   * @param sessionId - the session ID from the cookie.
   * @returns the valid session, or undefined.
   */
  validate(sessionId: string | undefined): Session | undefined {
    if (sessionId === undefined) return undefined
    const session = this.sessions.get(sessionId)
    if (session === undefined) return undefined
    const now = Date.now()
    // Idle expiry: too much time since last activity.
    if (now - session.lastActivity > this.config.idleTimeoutMs) {
      this.sessions.delete(sessionId)
      return undefined
    }
    // Absolute expiry: too much time since creation.
    if (now - session.createdAt > this.config.absoluteTimeoutMs) {
      this.sessions.delete(sessionId)
      return undefined
    }
    // Sliding expiry: refresh activity.
    session.lastActivity = now
    return session
  }

  /**
   * Invalidate a session (logout).
   * @param sessionId - the session ID to destroy.
   */
  destroy(sessionId: string | undefined): void {
    if (sessionId === undefined) return
    this.sessions.delete(sessionId)
  }

  /** Current session count (for diagnostics and restart confirmation). */
  get size(): number {
    return this.sessions.size
  }

  /**
   * Lazily clean up all expired sessions. Called periodically to prevent
   * unbounded growth from abandoned sessions.
   */
  cleanup(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.config.idleTimeoutMs ||
          now - session.createdAt > this.config.absoluteTimeoutMs) {
        this.sessions.delete(id)
      }
    }
  }
}

/**
 * Extract the session ID from a request's Cookie header.
 * @param req - the HTTP request.
 * @returns the session ID, or undefined when absent.
 */
export function extractSessionId(req: IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie
  if (cookieHeader === undefined) return undefined
  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === SESSION_COOKIE) return valueParts.join('=')
  }
  return undefined
}

/**
 * Build the Set-Cookie header value for a session.
 * @param session - the session.
 * @param now - current timestamp.
 * @param config - timeout configuration.
 * @param secure - whether to set the Secure flag (HTTPS).
 * @returns the Set-Cookie header value.
 */
export function buildCookie(session: Session, now: number, config: SessionStoreConfig, secure: boolean): string {
  const maxAge = cookieMaxAge(session, now, config)
  const flags = [
    `${SESSION_COOKIE}=${session.id}`,
    `Max-Age=${String(maxAge)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ]
  if (secure) flags.push('Secure')
  return flags.join('; ')
}

/**
 * Build a cookie-clearing Set-Cookie header (for logout).
 * @param secure - whether the connection is HTTPS, adding the `Secure` flag.
 * @returns the `Set-Cookie` header value that expires the session cookie.
 */
export function clearCookie(secure: boolean): string {
  const flags = [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ]
  if (secure) flags.push('Secure')
  return flags.join('; ')
}
