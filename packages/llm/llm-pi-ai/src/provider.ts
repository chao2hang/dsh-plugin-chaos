/**
 * Construction of the pi-ai `Provider` that one configured route registers into
 * the adapter's `Models` collection.
 *
 * Two constructions, one decision: a route whose every model keeps the wire
 * protocol its installed catalog entry owns **reuses that catalog provider**
 * with its models replaced — the catalog provider owns API implementations this
 * package cannot reconstruct (Bedrock loads its Smithy module through a
 * separate entry point), so rebuilding it from parts would silently narrow
 * which providers work. Every other route — one pi-ai has never heard of, one
 * repointed at the route level, or a catalog route whose models disagree after
 * per-model `api` entries — is built over the protocol table below: one
 * protocol for every model, or a per-model dispatch when they differ.
 *
 * Credentials never reach this module's storage: the harness resolves a route's
 * key through `ctx.credentials` before the request enters pi-ai and hands it
 * over as a stream option, which `Models` presents to `resolve()` as the
 * credential key.
 *
 * @module dsh-llm-pi-ai/provider
 */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, ApiKeyAuth, Model, Provider, ProviderStreams } from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { catalogModels, catalogProvider, PiAiCatalogError } from './catalog.ts'

/**
 * Wire protocols a configured route may name, mapped to pi-ai's lazily loaded
 * implementations. Each entry is the factory that pi-ai's matching provider
 * factory uses, so a hand-declared route reaches exactly the implementation a
 * catalog route would.
 *
 * The table is deliberately narrow: the protocols a hand-declared route
 * actually reads, each completely describable with a key, an
 * endpoint, and headers. Bedrock signs with SigV4 over AWS credentials and a
 * region, Vertex needs a project, a location, and application-default
 * credentials, Azure needs provider environment plus an api-version, and Codex
 * authenticates through OAuth — none of which this configuration shape can
 * express, so offering them would hand back a provider that cannot
 * authenticate. Google's Generative Language API takes a plain key header like
 * the OpenAI family, which is what admitted it. The remainder are absent for
 * want of a consumer rather than a blocker: each is one line here once a
 * deployment needs it. Catalog routes still reach every protocol through their
 * own provider; only an explicit override is refused.
 */
const PROTOCOLS: Readonly<Record<string, () => ProviderStreams>> = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
  'google-generative-ai': googleGenerativeAIApi,
}

/**
 * Every wire protocol a configured route may name, most-reached first. The
 * order is the table's and therefore stable; a configuration surface offering
 * a choice presents the first as its default, which is why the protocol a
 * hand-declared gateway most often speaks — and the one endpoint interrogation
 * can read — leads.
 * @returns the supported protocol identifiers.
 */
export function supportedProtocols(): readonly string[] {
  return Object.keys(PROTOCOLS)
}

/**
 * Api-key auth for a route the harness authenticates itself. `Models` calls
 * this after the adapter has already resolved the route's credential, so a
 * missing key here is not this layer's failure: a named-but-unresolvable
 * reference has already failed the request with `MISSING_CREDENTIAL`, and a
 * route naming no credential at all is deliberately unauthenticated. Reporting
 * it as configured hands the decision to the protocol, which is where the
 * requirement actually lives — pi-ai's OpenAI-compatible implementation, for
 * one, still insists on a key or an `Authorization` header of its own.
 * @param name - display name used as the resolution's status label.
 * @returns the api-key auth for a harness-authenticated route.
 */
function harnessApiKeyAuth(name: string): ApiKeyAuth {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

/** The resolved route facts provider construction reads. */
export interface ProviderSpec {
  /** Provider route key; also the `Models` collection key and each model's `provider`. */
  provider: string
  /** Display name for selectors and status labels. */
  displayName: string
  /** Wire protocol override; absent means each model keeps its catalog protocol. */
  api?: string
  /** Endpoint override already applied to {@link models}; kept for provider-level display. */
  baseURL?: string
  /** The route's materialized models, in configuration order. */
  models: readonly Model<Api>[]
  /**
   * Whether the profile names a credential, which it does through `apiKeyEnv`
   * alone: configuration carries the reference, never the secret. Only that
   * decides whether {@link routeAuth} adds the harness's own api-key method to
   * a catalog provider that offers none; the key itself still arrives per
   * request, never at construction.
   */
  namesCredential: boolean
}

/**
 * The auth one route resolves its credential through.
 *
 * A catalog route keeps the installed provider's own auth, which is what
 * preserves provider-native ambient discovery for a profile naming no
 * credential. That holds even when the profile repoints the protocol: which
 * environment a provider reads is a property of the provider, not of the wire
 * format its models speak.
 *
 * The single addition covers a catalog provider that offers no api-key method
 * at all. pi-ai resolves a request's `apiKey` override only when the provider
 * declares one (`resolveProviderAuth` checks `provider.auth.apiKey` before
 * honouring the override), so an OAuth-only provider — `openai-codex` is the
 * one the installed catalog ships — would refuse a profile's explicit key with
 * `Provider is not configured` before any request went out. Adding the harness
 * method beside the provider's own restores that route. A keyless profile adds
 * nothing and still reports the honest refusal, because this adapter resolves
 * credentials through its own seam and holds no OAuth store to fall back on.
 * @param spec - the resolved route facts.
 * @param catalog - the installed catalog provider, when pi-ai ships one.
 * @returns the auth to construct this route's provider with.
 */
function routeAuth(spec: ProviderSpec, catalog: Provider | undefined): Provider['auth'] {
  if (catalog === undefined) return { apiKey: harnessApiKeyAuth(spec.displayName) }
  if (catalog.auth.apiKey !== undefined || !spec.namesCredential) return catalog.auth
  return { ...catalog.auth, apiKey: harnessApiKeyAuth(spec.displayName) }
}

/**
 * Reuse an installed catalog provider with this route's models and identity.
 * Model dispatch stays with the catalog provider, so its API implementations,
 * compatibility quirks, and ambient credential discovery are preserved exactly.
 * Catalog-owned dynamic refresh is dropped: this route's catalog is the
 * settings document, and a background refresh would contradict it.
 */
function reuseCatalogProvider(base: Provider, spec: ProviderSpec): Provider {
  // Provider-level `baseUrl` is display metadata: pi-ai routes every request
  // through `Model.baseUrl`, which model resolution has already overridden.
  const baseUrl = spec.baseURL ?? base.baseUrl
  return {
    id: spec.provider,
    name: spec.displayName,
    ...baseUrl === undefined ? {} : { baseUrl },
    auth: routeAuth(spec, base),
    getModels: () => spec.models,
    // Delegated rather than copied: the catalog provider stays the receiver, so
    // an implementation holding state on itself keeps working.
    stream: (model, context, options) => base.stream(model, context, options),
    streamSimple: (model, context, options) => base.streamSimple(model, context, options),
  }
}

/**
 * Whether every model keeps the wire protocol its installed catalog entry
 * owns. This is the reuse test: the catalog provider dispatches each model by
 * its own `api`, so a model set it already serves needs no rebuilt provider —
 * and for the protocols this package cannot construct, it is the only
 * dispatcher there is.
 * @param spec - the resolved route facts.
 * @returns whether the installed catalog provider can serve every model as-is.
 */
function keepsInstalledProtocols(spec: ProviderSpec): boolean {
  const defaults = catalogModels(spec.provider)
  return spec.models.every(model => model.api === defaults.get(model.id)?.api)
}

/**
 * Build the pi-ai provider for one route whose models speak more than one
 * protocol — the shape a multi-protocol gateway produces when individual
 * models repoint away from the route's default. Dispatch is per model: an api
 * the protocol table serves is constructed here, and one it cannot construct
 * is a protocol the model kept from the installed catalog, delegated to that
 * provider. Construction refuses a table-unservable api with no catalog to
 * fall back on, naming the protocol.
 * @param spec - the resolved route facts.
 * @param catalog - the installed catalog provider, when pi-ai ships one.
 * @returns the provider to register in the adapter's `Models` collection.
 * @throws Error when a model names a wire protocol neither the table nor an
 * installed catalog provider can serve.
 */
function multiProtocolProvider(spec: ProviderSpec, catalog: Provider | undefined): Provider {
  const served = new Map<string, ProviderStreams>()
  for (const model of spec.models) {
    if (served.has(model.api)) continue
    const factory = PROTOCOLS[model.api]
    if (factory !== undefined) {
      served.set(model.api, factory())
      continue
    }
    // Only a model that kept its installed catalog protocol can reach this
    // without a catalog: configured protocol names are validated against the
    // table's keys at the settings boundary, and model resolution refuses a
    // protocol-less model outright.
    if (catalog === undefined) {
      throw new PiAiCatalogError(
        `llm-pi-ai: provider "${spec.provider}" names api "${model.api}", which this build cannot serve;`
        + ` supported protocols are ${supportedProtocols().join(', ')}`,
      )
    }
    served.set(model.api, {
      stream: (requestModel, context, options) => catalog.stream(requestModel, context, options),
      streamSimple: (requestModel, context, options) => catalog.streamSimple(requestModel, context, options),
    })
  }
  // Provider-level `baseUrl` is display metadata: pi-ai routes every request
  // through `Model.baseUrl`, which model resolution has already overridden.
  const baseUrl = spec.baseURL ?? catalog?.baseUrl
  const implementationFor = (model: Model<Api>): ProviderStreams => {
    const implementation = served.get(model.api)
    /* v8 ignore next 3 -- model resolution leaves no model whose api missed the map above */
    if (implementation === undefined) {
      throw new Error(`llm-pi-ai: provider "${spec.provider}" has no implementation for "${model.api}"`)
    }
    return implementation
  }
  return {
    id: spec.provider,
    name: spec.displayName,
    ...baseUrl === undefined ? {} : { baseUrl },
    auth: routeAuth(spec, catalog),
    getModels: () => spec.models,
    stream: (model, context, options) => implementationFor(model).stream(model, context, options),
    streamSimple: (model, context, options) => implementationFor(model).streamSimple(model, context, options),
  }
}

/**
 * Build the pi-ai provider for one resolved route.
 * @param spec - the resolved route facts.
 * @returns the provider to register in the adapter's `Models` collection.
 * @throws Error when the route names a wire protocol this build cannot serve.
 */
export function buildProvider(spec: ProviderSpec): Provider {
  const catalog = catalogProvider(spec.provider)
  // A catalog route whose models keep their installed protocols delegates to
  // the catalog provider — the only dispatcher for the protocols this package
  // cannot construct. Any explicit repoint, at the route or on one model,
  // leaves that path.
  if (spec.api === undefined && catalog !== undefined && keepsInstalledProtocols(spec)) {
    return reuseCatalogProvider(catalog, spec)
  }

  const apis = [...new Set(spec.models.map(model => model.api))]
  // Every model on the single-protocol path carries one protocol: an explicit
  // route-level api replaces each catalog model's own, and model resolution
  // requires one for a route the catalog cannot default. So the route has a
  // single API.
  if (apis.length <= 1) {
    const api = spec.api ?? apis[0]
    const factory = api === undefined ? undefined : PROTOCOLS[api]
    if (factory === undefined) {
      throw new Error(
        `llm-pi-ai: provider "${spec.provider}" names api "${spec.api}", which this build cannot serve;`
        + ` supported protocols are ${supportedProtocols().join(', ')}`,
      )
    }
    return createProvider({
      id: spec.provider,
      name: spec.displayName,
      ...spec.baseURL === undefined ? {} : { baseUrl: spec.baseURL },
      auth: routeAuth(spec, catalog),
      models: spec.models,
      api: factory(),
    })
  }
  return multiProtocolProvider(spec, catalog)
}
