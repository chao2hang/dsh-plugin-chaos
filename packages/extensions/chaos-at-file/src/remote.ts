/** Strict Typert descriptor for the browser path-index request. */
import { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const sessionId = z.string().min(1)
const entry = z.object({ path: z.string().min(1), relative: z.string().min(1), kind: z.enum(['file', 'dir']) })

/** Strict Host descriptor registered by the plugin and mounted by its browser half. */
export const CHAOS_AT_FILE_INVOCATIONS: readonly InvocationDescriptor[] = [{
  id: '@deepseek-ai/dsh-plugin-chaos-at-file#chaosAtFile/search', service: 'chaosAtFile', namespace: 'chaosAtFile',
  method: 'search', implementation: 'remoteExportSearch', invocation: { kind: 'direct' },
  parameters: [{ name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: sessionId } }],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-plugin-chaos-at-file#FileEntry[]', schema: z.array(entry) },
}]

/** Client contribution for the package's isolated workspace-index Remote. */
export const CHAOS_AT_FILE_REMOTE: TypertRemoteContribution = { package: '@deepseek-ai/dsh-plugin-chaos-at-file', descriptors: CHAOS_AT_FILE_INVOCATIONS }
