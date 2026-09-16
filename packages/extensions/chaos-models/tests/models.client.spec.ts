// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { API_PROTOCOLS, reasoningEffortsOf } from '../src/index.ts'
import { CONTEXT_STOPS, OUTPUT_STOPS, capacitySliderBounds, formatCapacity, parseCapacity, saveModelCapabilities, snapCapacity } from '../src/client/ModelCapabilities.tsx'

describe('model capability settings', () => {
  it('makes no reasoning claim until at least one level is selected', () => {
    expect(reasoningEffortsOf([])).toBe(false)
  })

  it('uses pi-ai wire values and keeps off parameterless', () => {
    expect(reasoningEffortsOf(['off', 'high', 'max'])).toEqual({ off: null, high: 'high', max: 'max' })
  })

  it('offers the protocols llm-pi-ai serves, in table order', () => {
    expect(API_PROTOCOLS).toEqual(['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai'])
  })

  it('parses token capacities with optional K and M suffixes', () => {
    expect(parseCapacity('131072')).toBe(131_072)
    expect(parseCapacity('128K')).toBe(128_000)
    expect(parseCapacity('1m')).toBe(1_000_000)
    expect(parseCapacity('0')).toBeUndefined()
    expect(parseCapacity('12KB')).toBeUndefined()
  })

  it('writes an installed catalog model as a model override', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await expect(saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { openai: {} } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: true, efforts: ['off', 'high'], api: '' },
      { contextWindow: '0', maxTokens: '0', multimodal: false, efforts: [], api: '' },
    )).resolves.toBeNull()
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'],
        value: { contextWindow: 128_000, maxTokens: 8_000, input: ['text', 'image'], reasoningEfforts: { off: null, high: 'high' } },
      }],
    }))
  })

  it('keeps inherited image and reasoning fields absent for a capacity-only override', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { openai: {} } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '256K', maxTokens: '8K', multimodal: true, efforts: ['high'], api: '' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: true, efforts: ['high'], api: '' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'],
        value: { contextWindow: 256_000 },
      }],
    }))
  })

  it('writes a selected protocol as part of a model override', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { openai: {} } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: 'anthropic-messages' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'],
        value: { api: 'anthropic-messages' },
      }],
    }))
  })

  it('removes the api field when the override is cleared back to the provider default', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { openai: { modelOverrides: { 'gpt-x': { api: 'openai-completions', contextWindow: 4096 } } } } },
        schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: 'openai-completions' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'],
        value: { contextWindow: 4096 },
      }],
    }))
  })

  it('leaves an untouched api override out of the write', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { openai: { modelOverrides: { 'gpt-x': { api: 'openai-responses' } } } } },
        schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '256K', maxTokens: '8K', multimodal: false, efforts: [], api: 'openai-responses' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: 'openai-responses' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'],
        value: { contextWindow: 256_000, api: 'openai-responses' },
      }],
    }))
  })

  it('updates a hand-declared model by replacing the models array', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { local: { models: [{ id: 'served', name: 'Served' }, { id: 'unchanged' }] } } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'local', providerName: 'Local', model: 'served', modelName: 'Served' },
      { contextWindow: '64K', maxTokens: '4K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '0', maxTokens: '0', multimodal: true, efforts: ['high'], api: '' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'local', 'models'],
        value: [
          { id: 'served', name: 'Served', contextWindow: 64_000, maxTokens: 4_000, input: ['text'], reasoningEfforts: false },
          { id: 'unchanged' },
        ],
      }],
    }))
  })

  it('sets and clears the api field on a models-array row', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { local: { models: [{ id: 'served', name: 'Served', api: 'openai-completions' }] } } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'local', providerName: 'Local', model: 'served', modelName: 'Served' },
      { contextWindow: '64K', maxTokens: '4K', multimodal: false, efforts: [], api: 'anthropic-messages' },
      { contextWindow: '64K', maxTokens: '4K', multimodal: false, efforts: [], api: 'openai-completions' },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'local', 'models'],
        value: [{ id: 'served', name: 'Served', api: 'anthropic-messages' }],
      }],
    }))

    const clearing = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate: clearing } } as never,
      {
        ns: 'llm-pi-ai', revision: 3,
        value: { providers: { local: { models: [{ id: 'served', name: 'Served', api: 'openai-completions', contextWindow: 8192 }] } } }, schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'local', providerName: 'Local', model: 'served', modelName: 'Served' },
      { contextWindow: '64K', maxTokens: '4K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '64K', maxTokens: '4K', multimodal: false, efforts: [], api: 'openai-completions' },
    )
    expect(clearing).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{
        op: 'set', path: ['providers', 'local', 'models'],
        value: [{ id: 'served', name: 'Served', contextWindow: 8192 }],
      }],
    }))
  })

  it('snaps capacities near common values while retaining unit precision elsewhere', () => {
    expect(snapCapacity(127_000, CONTEXT_STOPS)).toBe(128_000)
    expect(snapCapacity(130_600, CONTEXT_STOPS)).toBe(130_600)
    expect(snapCapacity(8_250, OUTPUT_STOPS)).toBe(8_192)
    expect(snapCapacity(12_345, OUTPUT_STOPS)).toBe(12_345)
  })

  it('formats slider values and exposes common stops', () => {
    expect(formatCapacity(256_000)).toBe('256K')
    expect(formatCapacity(1_000_000)).toBe('1M')
    expect(CONTEXT_STOPS).toContain(128_000)
    expect(OUTPUT_STOPS).toContain(8_192)
  })

  it('narrows unit-precision controls to the active common-value interval', () => {
    expect(capacitySliderBounds(256_000, 1, 2_000_000, CONTEXT_STOPS)).toEqual([128_000, 512_000])
    expect(capacitySliderBounds(16_384, 1, 2_000_000, CONTEXT_STOPS)).toEqual([1, 32_768])
  })
})
