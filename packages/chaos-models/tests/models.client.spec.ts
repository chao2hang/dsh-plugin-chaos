// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { API_PROTOCOLS, reasoningEffortsOf } from '../src/index.ts'
import { CONTEXT_STOPS, OUTPUT_STOPS, capacitySliderBounds, formatCapacity, parseCapacity, saveModelCapabilities, snapCapacity } from '../src/client/ModelCapabilities.tsx'
import {
  CLIENT_IDENTITY_PRESETS, detectClientPlatform, fillIdentityTemplate, latestNpmVersion,
  mergedIdentityHeaders, presetIdOfValue,
} from '../src/client/clientIdentity.ts'

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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
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

  it('fills identity templates with the looked-up version and platform', () => {
    expect(fillIdentityTemplate('claude-cli/{version} (external, cli)', '2.1.281', { os: 'Mac OS', arch: 'arm64' }))
      .toBe('claude-cli/2.1.281 (external, cli)')
    expect(fillIdentityTemplate('QwenCode/{version} ({os}; {arch})', '0.24.4', { os: 'Linux', arch: 'x64' }))
      .toBe('QwenCode/0.24.4 (Linux; x64)')
  })

  it('detects the platform words from the browser user-agent', () => {
    expect(detectClientPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'))
      .toEqual({ os: 'Mac OS', arch: 'x64' })
    expect(detectClientPlatform('Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36'))
      .toEqual({ os: 'Linux', arch: 'arm64' })
    expect(detectClientPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'))
      .toEqual({ os: 'Windows', arch: 'x64' })
  })

  it('matches a saved user-agent back to its preset and marks others custom', () => {
    expect(presetIdOfValue(CLIENT_IDENTITY_PRESETS, '')).toBe('')
    expect(presetIdOfValue(CLIENT_IDENTITY_PRESETS, 'claude-cli/2.1.281 (external, cli)')).toBe('claude-code')
    expect(presetIdOfValue(CLIENT_IDENTITY_PRESETS, 'codex-tui/0.156.1 (Mac OS 26.3.1; arm64) (codex-tui; 0.156.1)')).toBe('codex')
    expect(presetIdOfValue(CLIENT_IDENTITY_PRESETS, 'my-gateway/1.0')).toBe('custom')
  })

  it('queries the npm registry latest dist-tag for a preset version', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: '2.1.281' }), { status: 200 })))
    await expect(latestNpmVersion('@anthropic-ai/claude-code', fetchImpl)).resolves.toBe('2.1.281')
    expect(fetchImpl).toHaveBeenCalledWith('https://registry.npmjs.org/%40anthropic-ai%2Fclaude-code/latest')
  })

  it('refuses an npm registry answer without a version', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{"error":"nope"}', { status: 200 })))
    await expect(latestNpmVersion('@anthropic-ai/claude-code', fetchImpl)).rejects.toThrow('version')
    const failing = vi.fn(() => Promise.resolve(new Response('', { status: 500 })))
    await expect(latestNpmVersion('@openai/codex', failing)).rejects.toThrow('500')
  })

  it('merges managed identity keys over stored route headers', () => {
    expect(mergedIdentityHeaders(
      { 'user-agent': 'old', 'x-keep': 'yes' },
      { 'user-agent': 'claude-cli/2.1.281 (external, cli)', originator: 'codex_cli_rs' },
    )).toEqual({ 'user-agent': 'claude-cli/2.1.281 (external, cli)', 'x-keep': 'yes', originator: 'codex_cli_rs' })
    expect(mergedIdentityHeaders(
      { 'user-agent': 'old', originator: 'codex_cli_rs', 'x-keep': 'yes' },
      { 'user-agent': undefined, originator: undefined },
    )).toEqual({ 'x-keep': 'yes' })
  })

  it('writes an identity change as a provider headers op beside the capability op', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
        value: { providers: { openai: { headers: { 'user-agent': 'old' } } } },
        schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      {
        next: { 'user-agent': 'claude-cli/2.1.281 (external, cli)', 'x-keep': 'yes' },
        previous: { 'user-agent': 'old' },
      },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [
        { op: 'set', path: ['providers', 'openai', 'headers'], value: { 'user-agent': 'claude-cli/2.1.281 (external, cli)', 'x-keep': 'yes' } },
        { op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'], value: {} },
      ],
    }))
  })

  it('removes the stored headers object when the identity is cleared', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
        value: { providers: { openai: { headers: { 'user-agent': 'old', originator: 'codex_cli_rs' } } } },
        schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { next: {}, previous: { 'user-agent': 'old', originator: 'codex_cli_rs' } },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [
        { op: 'unset', path: ['providers', 'openai', 'headers'] },
        { op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'], value: {} },
      ],
    }))
  })

  it('skips the headers op when the identity is unchanged', async () => {
    const mutate = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    const previous = { 'user-agent': 'claude-cli/2.1.281 (external, cli)' }
    await saveModelCapabilities(
      { settings: { mutate } } as never,
      {
        ns: 'llm-pi-ai', revision: 3, autoGenerate: false,
        value: { providers: { openai: { headers: previous } } },
        schema: {}, applies: 'live', secrets: [],
      },
      { provider: 'openai', providerName: 'OpenAI', model: 'gpt-x', modelName: 'GPT X' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { contextWindow: '128K', maxTokens: '8K', multimodal: false, efforts: [], api: '' },
      { next: previous, previous },
    )
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      ops: [{ op: 'set', path: ['providers', 'openai', 'modelOverrides', 'gpt-x'], value: {} }],
    }))
  })
})
