import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { THINKING_LEVELS, type ThinkingLevel } from '../index.ts'
import css from './ModelCapabilities.module.css'

/** One pi-ai model row as represented by the existing settings document. */
type ModelProfile = {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  reasoningEfforts?: false | Record<string, string | null>
}

/** Settings document shape the extension reads and patches. */
interface PiAiSettings {
  providers?: Record<string, { models?: ModelProfile[]; modelOverrides?: Record<string, Omit<ModelProfile, 'id'>> }>
}

/** A model row selected in the composer's directory. */
interface ModelChoice {
  provider: string
  providerName: string
  model: string
  modelName: string
}

/** One settings describe read: writable flag plus namespace views. */
type SettingsDescribeResult = {
  result: { ok: true; value: { writable: boolean; namespaces: SettingsNamespaceView[] } } | { ok: false; error: { message: string } }
}

/** One path-op settings write. */
type SettingsMutateResult = {
  result: { ok: true; value: SettingsNamespaceView } | { ok: false; error: { message: string } }
}

/** One provider group of the deployment model catalog. */
type ModelCatalogGroup = { id: string; name: string; models: { id: string; name: string }[] }

/** One model-catalog read for a session's workspace. */
type ModelCatalogResult = {
  result: { ok: true; value: { current: { provider: string; model: string }; groups: ModelCatalogGroup[] } }
    | { ok: false; error: { message: string } }
}

/**
 * The wire surface this dialog needs, spelled against the installed
 * dsh-api-remotes namespaces: the settings namespace (describe/mutate) and
 * one model-catalog read. The plugin half adapts the live remote carrier
 * onto this structural interface.
 */
export interface ModelSettingsApi {
  settings: {
    describe(): Promise<SettingsDescribeResult>
    mutate(request: { ns: string; expectedRevision?: number; ops: readonly SettingsPathOpView[] }): Promise<SettingsMutateResult>
  }
  sessions: {
    models(request: { sessionId: string }): Promise<ModelCatalogResult>
  }
}

type CapabilityDraft = { contextWindow: string; maxTokens: string; multimodal: boolean; efforts: readonly ThinkingLevel[] }

/** Parse capacities accepted by the existing models page. */
export function parseCapacity(value: string): number | undefined {
  const match = /^(\d+)([kKmM])?$/.exec(value.trim())
  if (match === null) return undefined
  const amount = Number(match[1])
  const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2] === undefined ? 1 : 1_000
  const result = amount * multiplier
  return Number.isSafeInteger(result) && result > 0 ? result : undefined
}

/** Common capacity stops offered beside the precise sliders. */
export const CONTEXT_STOPS = [16_384, 32_768, 65_536, 128_000, 256_000, 512_000, 1_000_000, 2_000_000] as const
/** Common maximum-output stops offered beside the precise sliders. */
export const OUTPUT_STOPS = [1_024, 2_048, 4_096, 8_192, 16_384, 32_768, 65_536, 128_000] as const

/** Snap a dragged capacity to a nearby common stop without sacrificing unit precision elsewhere. */
export function snapCapacity(value: number, stops: readonly number[]): number {
  const closest = stops.reduce((best, stop) => Math.abs(stop - value) < Math.abs(best - value) ? stop : best, stops[0] ?? value)
  return Math.abs(closest - value) <= Math.max(256, Math.round(closest * 0.02)) ? closest : value
}

/** Compact capacity label for sliders and quick-pick buttons. */
export function formatCapacity(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`
  return String(value)
}

/** Limit a unit-precise slider to the current common-value interval. */
export function capacitySliderBounds(value: number, min: number, max: number, stops: readonly number[]): readonly [number, number] {
  const lower = stops.filter(stop => stop < value).at(-1) ?? min
  const upper = stops.find(stop => stop > value) ?? max
  return [lower, upper]
}

/** Preserve existing provider wire values for selected reasoning levels. */
function reasoningEffortsFor(
  levels: readonly ThinkingLevel[],
  existing: false | Record<string, string | null> | undefined,
): false | Record<string, string | null> {
  const enabled = levels.filter(level => level !== 'off')
  if (enabled.length === 0) return false
  const previous = existing === false || existing === undefined ? {} : existing
  return Object.fromEntries(levels.map(level => [level, level === 'off' ? null : previous[level] ?? level]))
}

/** Persist the model capability patch through pi-ai's own settings schema. */
export async function saveModelCapabilities(
  api: ModelSettingsApi,
  namespace: SettingsNamespaceView,
  choice: ModelChoice,
  draft: CapabilityDraft,
  initial: CapabilityDraft,
): Promise<string | null> {
  const contextWindow = parseCapacity(draft.contextWindow)
  const maxTokens = parseCapacity(draft.maxTokens)
  if (contextWindow === undefined) return '上下文窗口必须是正整数，例如 128K 或 1M。'
  if (maxTokens === undefined) return '最大输出 token 必须是正整数，例如 8K 或 64K。'
  const current = namespace.value as PiAiSettings
  const route = current.providers?.[choice.provider] ?? {}
  const next = {
    ...(draft.contextWindow === initial.contextWindow ? {} : { contextWindow }),
    ...(draft.maxTokens === initial.maxTokens ? {} : { maxTokens }),
    ...(draft.multimodal === initial.multimodal ? {} : { input: draft.multimodal ? ['text', 'image'] : ['text'] }),
    ...(sameLevels(draft.efforts, initial.efforts)
      ? {}
      : {
        reasoningEfforts: reasoningEffortsFor(
          draft.efforts,
          route.models?.find(model => model.id === choice.model)?.reasoningEfforts
            ?? route.modelOverrides?.[choice.model]?.reasoningEfforts,
        ),
      }),
  }
  const models = route.models
  const modelIndex = models?.findIndex(model => model.id === choice.model) ?? -1
  // Settings path mutation walks plain objects only; indexing through a
  // `models` array would replace the array with an object keyed by its index.
  // Replace the complete array with one edited row instead.
  const op = models !== undefined && modelIndex >= 0
    ? {
      op: 'set' as const,
      path: ['providers', choice.provider, 'models'],
      value: models.map((model, index) => index === modelIndex
        ? { ...model, ...next, id: choice.model }
        : model),
    }
    : {
      op: 'set' as const,
      path: ['providers', choice.provider, 'modelOverrides', choice.model],
      value: { ...route.modelOverrides?.[choice.model], ...next },
    }
  const response = await api.settings.mutate({
    ns: namespace.ns,
    expectedRevision: namespace.revision,
    ops: [op],
  })
  return response.result.ok ? null : response.result.error.message
}

/** Whether two ordered capability level selections are identical. */
function sameLevels(left: readonly ThinkingLevel[], right: readonly ThinkingLevel[]): boolean {
  return left.length === right.length && left.every((level, index) => level === right[index])
}

/** Derive a selected model's saved capabilities from the pi-ai settings view. */
export function modelProfileOf(namespace: SettingsNamespaceView, choice: ModelChoice): ModelProfile | undefined {
  const settings = namespace.value as PiAiSettings
  const route = settings.providers?.[choice.provider]
  const model = route?.models?.find(item => item.id === choice.model)
  if (model !== undefined) return model
  const override = route?.modelOverrides?.[choice.model]
  return override === undefined ? undefined : { id: choice.model, ...override }
}

/** Props supplied by the session slot framework and the client plugin closure. */
export type ModelCapabilitiesProps = PropsRuntime<'conversation.input.right'> & {
  sessionId: string
  api: ModelSettingsApi
  describe: () => Promise<{ writable: boolean; namespaces: SettingsNamespaceView[] }>
  invalidateSettings: () => void
}

/** Slider plus common-value shortcuts for one integer model capacity. */
function CapacitySlider({ label, value, min, max, stops, disabled, onChange, onChoose }: {
  label: string
  value: number
  min: number
  max: number
  stops: readonly number[]
  disabled: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onChoose: (value: number) => void
}): ReactNode {
  const safeValue = Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : min
  const [sliderMin, sliderMax] = capacitySliderBounds(safeValue, min, max, stops)
  return (
    <section className={css.capacity} data-model-capabilities-capacity>
      <div className={css.capacityHeading}><span>{label}</span><output>{formatCapacity(safeValue)}</output></div>
      <input type="range" min={sliderMin} max={sliderMax} step="1" value={safeValue} disabled={disabled} aria-label={label + '，可精细调整到个位'} onChange={onChange} />
      <p className={css.precision}>当前区间 {formatCapacity(sliderMin)}–{formatCapacity(sliderMax)} · 可精细调整到个位</p>
      <div className={css.stops} aria-label={label + '常用值'}>
        {stops.map(stop => <button key={stop} type="button" disabled={disabled} data-active={stop === safeValue || undefined} onClick={() => { onChoose(stop) }}>{formatCapacity(stop)}</button>)}
      </div>
    </section>
  )
}

/**
 * Render a configuration affordance immediately beside the composer model
 * selector. It only opens for models backed by an `llm-pi-ai` provider, so
 * official adapters retain their adapter-owned capability declarations.
 */
export function ModelCapabilities({ sessionId, api, describe, invalidateSettings }: ModelCapabilitiesProps): ReactNode {
  const [open, setOpen] = useState(false)
  // Slot injection can supply fresh wrapper functions while the field draft
  // changes. The open-cycle fetch must not restart and replace the form for
  // those incidental identities, otherwise a controlled input loses focus.
  const apiRef = useRef(api)
  const describeRef = useRef(describe)
  apiRef.current = api
  describeRef.current = describe
  const [choice, setChoice] = useState<ModelChoice | null>(null)
  const [namespace, setNamespace] = useState<SettingsNamespaceView | null>(null)
  const [writable, setWritable] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CapabilityDraft>({ contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [] })
  const [initialDraft, setInitialDraft] = useState<CapabilityDraft>({ contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [] })

  // The model selector owns the visible entry point. This listener lets its menu
  // open the capability dialog without leaving a second composer-row button.
  useEffect(() => {
    const onOpen = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return
      // A null/undefined detail comes from the installed dsh's patched menu row
      // (one session is visible at a time); an exact session id comes from the
      // fork's menu row.
      if (event.detail !== null && event.detail !== undefined && event.detail !== sessionId) return
      setOpen(true)
    }
    window.addEventListener('dsh:open-model-capabilities', onOpen)
    return () => { window.removeEventListener('dsh:open-model-capabilities', onOpen) }
  }, [sessionId])

  useEffect(() => {
    if (!open) return
    let active = true
    setStatus('loading')
    setError(null)
    const models = apiRef.current.sessions.models({ sessionId: sessionId })
    const settings = describeRef.current()
    void Promise.all([models, settings]).then(([models, settings]) => {
      if (!active) return
      if (!models.result.ok) throw new Error(models.result.error.message)
      const selected = models.result.value.current
      const group = models.result.value.groups.find(item => item.id === selected.provider)
      const model = group?.models.find(item => item.id === selected.model)
      const nextChoice: ModelChoice = {
        provider: selected.provider,
        providerName: group?.name ?? selected.provider,
        model: selected.model,
        modelName: model?.name ?? selected.model,
      }
      const nextNamespace = settings.namespaces.find(item => item.ns === 'llm-pi-ai') ?? null
      const piAiSettings = nextNamespace?.value as PiAiSettings | undefined
      if (nextNamespace === null || piAiSettings?.providers?.[nextChoice.provider] === undefined) {
        setError('当前模型不是可配置的非官方模型。')
        setStatus('idle')
        return
      }
      const profile = modelProfileOf(nextNamespace, nextChoice)
      const effortMap = profile?.reasoningEfforts
      const levels = effortMap === undefined || effortMap === false
        ? []
        : THINKING_LEVELS.filter(level => effortMap[level] !== undefined)
      setChoice(nextChoice)
      setNamespace(nextNamespace)
      setWritable(settings.writable)
      const nextDraft: CapabilityDraft = {
        contextWindow: String(profile?.contextWindow ?? 128_000),
        maxTokens: String(profile?.maxTokens ?? 8_192),
        multimodal: profile?.input?.includes('image') === true,
        efforts: levels,
      }
      setDraft(nextDraft)
      setInitialDraft(nextDraft)
      setStatus('idle')
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('idle')
    })
    return () => { active = false }
  }, [open, sessionId])

  const updateCapacity = (field: 'contextWindow' | 'maxTokens', stops: readonly number[], event: ChangeEvent<HTMLInputElement>): void => {
    const value = snapCapacity(Number(event.target.value), stops)
    setDraft(current => ({ ...current, [field]: String(value) }))
  }
  const chooseCapacity = (field: 'contextWindow' | 'maxTokens', value: number): void => {
    setDraft(current => ({ ...current, [field]: String(value) }))
  }
  const toggleEffort = (level: ThinkingLevel): void => {
    setDraft(current => ({
      ...current,
      efforts: current.efforts.includes(level)
        ? current.efforts.filter(item => item !== level)
        : [...current.efforts, level],
    }))
  }
  const save = (): void => {
    if (choice === null || namespace === null) return
    setStatus('saving')
    setError(null)
    void saveModelCapabilities(api, namespace, choice, draft, initialDraft).then((failure) => {
      if (failure !== null) setError(failure)
      else {
        invalidateSettings()
        setOpen(false)
      }
      setStatus('idle')
    }, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('idle')
    })
  }
  const title = useMemo(() => choice === null ? '模型能力设置' : `${choice.modelName} 的能力设置`, [choice])

  return (
    <span className={css.root} data-model-capabilities>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={title}
        closeLabel="关闭模型能力设置"
        description={choice === null ? '' : `${choice.providerName} · ${choice.model}`}
        className={css.dialog as string}
        footer={(
          <div className={css.actions} data-model-capabilities-actions>
            <Button variant="outline" onClick={() => { setOpen(false) }}>取消</Button>
            <Button variant="primary" disabled={!writable || status === 'saving' || choice === null || namespace === null} onClick={save}>{status === 'saving' ? '保存中…' : '保存'}</Button>
          </div>
        )}
      >
        <div className={css.fields} data-model-capabilities-fields>
          {status === 'loading' ? <p className={css.notice}>正在读取模型配置…</p> : (
            <>
              <CapacitySlider label="上下文窗口" value={Number(draft.contextWindow)} min={1} max={2_000_000} stops={CONTEXT_STOPS} disabled={!writable || status === 'saving'} onChange={(event) => { updateCapacity('contextWindow', CONTEXT_STOPS, event) }} onChoose={(value) => { chooseCapacity('contextWindow', value) }} />
              <CapacitySlider label="最大输出 token" value={Number(draft.maxTokens)} min={1} max={128_000} stops={OUTPUT_STOPS} disabled={!writable || status === 'saving'} onChange={(event) => { updateCapacity('maxTokens', OUTPUT_STOPS, event) }} onChoose={(value) => { chooseCapacity('maxTokens', value) }} />
              <label className={css.checkbox} data-model-capabilities-multimodal><input type="checkbox" checked={draft.multimodal} onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft({ ...draft, multimodal: event.target.checked }) }} disabled={!writable || status === 'saving'} /><span>支持多模态图片输入</span></label>
              <fieldset data-model-capabilities-efforts disabled={!writable || status === 'saving'}><legend>思考等级</legend><div className={css.levels} data-model-capabilities-effort-list>{THINKING_LEVELS.map(level => <label key={level} className={css.checkbox} data-model-capabilities-effort><input type="checkbox" checked={draft.efforts.includes(level)} onChange={() => { toggleEffort(level) }} /><span>{level}</span></label>)}</div></fieldset>
              {error !== null && <p className={css.error} role="status">{error}</p>}
              {!writable && <p className={css.notice}>此部署的设置文档为只读。</p>}
            </>
          )}
        </div>
      </Modal>
    </span>
  )
}
