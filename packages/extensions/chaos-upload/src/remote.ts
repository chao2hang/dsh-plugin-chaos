/** Strict Typert descriptor for the browser workspace-upload request. */
import { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const sessionId = z.string().min(1)
const uploadRequest = z.object({
  name: z.string().min(1),
  data: z.string().min(1),
})
const uploadResult = z.object({
  relative: z.string().min(1),
  bytes: z.number().int().nonnegative(),
})

/** Strict Host descriptor registered by the plugin and mounted by its browser half. */
export const CHAOS_UPLOAD_INVOCATIONS: readonly InvocationDescriptor[] = [{
  id: '@deepseek-ai/dsh-plugin-chaos-upload#chaosUpload/upload', service: 'chaosUpload', namespace: 'chaosUpload',
  method: 'upload', implementation: 'remoteUpload', invocation: { kind: 'direct' },
  parameters: [
    { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: sessionId } },
    { name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-plugin-chaos-upload/types#UploadRequest', schema: uploadRequest } },
  ],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-plugin-chaos-upload/types#UploadResult', schema: uploadResult },
}]

/** Client contribution for the package's isolated workspace-upload Remote. */
export const CHAOS_UPLOAD_REMOTE: TypertRemoteContribution = { package: '@deepseek-ai/dsh-plugin-chaos-upload', descriptors: CHAOS_UPLOAD_INVOCATIONS }
