import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

type Handler = (req: { method?: string }, res: ResponseRecorder) => void | Promise<void>

class ResponseRecorder {
  statusCode: number | undefined
  headers: Record<string, string> | undefined
  body: string | undefined

  writeHead(statusCode: number, headers?: Record<string, string>): this {
    this.statusCode = statusCode
    this.headers = headers
    return this
  }

  end(body?: string): this {
    this.body = body
    return this
  }
}

function mount(restart: () => Promise<{ ok: true } | { ok: false; reason: string }>): Handler {
  const routes = new Map<string, Handler>()
  const ctx = {
    webServer: {
      register(route: { path: string; handler: Handler }) {
        routes.set(route.path, route.handler)
        return () => { routes.delete(route.path) }
      },
    },
    get(name: string) {
      if (name === 'processControl') return { canRestart: true, restart }
      return undefined
    },
    effect(callback: () => () => void) { callback() },
  }
  apply(ctx as never, { enabled: true })
  const handler = routes.get('/api/system/restart')
  if (handler === undefined) throw new Error('restart route was not registered')
  return handler
}

describe('restart route', () => {
  it('waits for the process-control result before acknowledging success', async () => {
    let resolve!: (result: { ok: true }) => void
    const handler = mount(() => new Promise((done) => { resolve = done }))
    const response = new ResponseRecorder()
    const request = handler({ method: 'POST' }, response)

    expect(response.statusCode).toBeUndefined()
    resolve({ ok: true })
    await request

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(JSON.stringify({ ok: true }))
  })

  it('returns the process-control refusal instead of leaving the client waiting', async () => {
    const handler = mount(async () => ({ ok: false, reason: 'restart already pending' }))
    const response = new ResponseRecorder()

    await handler({ method: 'POST' }, response)

    expect(response.statusCode).toBe(503)
    expect(response.body).toBe(JSON.stringify({ ok: false, reason: 'restart already pending' }))
  })

  it('returns a thrown restart failure as a refusal', async () => {
    const handler = mount(async () => { throw new Error('successor exited before taking over') })
    const response = new ResponseRecorder()

    await handler({ method: 'POST' }, response)

    expect(response.statusCode).toBe(503)
    expect(response.body).toBe(JSON.stringify({ ok: false, reason: 'successor exited before taking over' }))
  })
})
