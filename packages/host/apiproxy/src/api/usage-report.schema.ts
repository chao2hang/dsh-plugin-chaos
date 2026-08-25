/** Usage-report wire schemas. */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** Return whether the runtime can use a browser-supplied IANA time zone. */
function supportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

/** usage-report.read request payload. */
export const usageReportReadRequestSchema = z.object({
  timeZone: z.string().max(128).refine(supportedTimeZone),
}) satisfies z.ZodType<Wire<RequestPayload<'usage-report.read'>>>

const totalsSchema = z.object({
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
})

/** usage-report.read response value. */
export const usageReportReadValueSchema: z.ZodType<Wire<ResponseValue<'usage-report.read'>>> = z.object({
  days: z.array(totalsSchema.extend({
    date: z.string(),
    routes: z.array(totalsSchema.extend({ provider: z.string(), model: z.string() })),
  })),
  models: z.array(totalsSchema.extend({ provider: z.string(), model: z.string() })),
  unattributed: totalsSchema,
})
