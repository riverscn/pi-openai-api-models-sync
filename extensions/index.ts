import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ProviderConfig,
  type ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";

type Cost = ProviderModelConfig["cost"];
type ThinkingLevelMap = NonNullable<ProviderModelConfig["thinkingLevelMap"]>;
type SyncedModel = ProviderModelConfig;
type StoredProviderConfig = Omit<ProviderConfig, "models" | "oauth" | "streamSimple">;

type ModelsJson = {
  providers?: Record<string, StoredProviderConfig>;
};

export type PricingEntry = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  input_cost_per_token_above_272k_tokens?: number;
  output_cost_per_token_above_272k_tokens?: number;
  cache_read_input_token_cost_above_272k_tokens?: number;
  cache_creation_input_token_cost_above_272k_tokens?: number;
  long_context_input_token_threshold?: number;
  long_context_input_cost_multiplier?: number;
  long_context_output_cost_multiplier?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  supported_modalities?: string[];
  supports_reasoning?: boolean;
  supports_none_reasoning_effort?: boolean;
  supports_minimal_reasoning_effort?: boolean;
  supports_xhigh_reasoning_effort?: boolean;
  supports_max_reasoning_effort?: boolean;
};

type ModelOverride = Partial<SyncedModel> & { id?: never };

type ExtensionConfig = {
  providerId?: string;
  pricingUrl?: string;
  include?: string[];
  exclude?: string[];
  requestTimeoutMs?: number;
  defaults?: ModelOverride;
  overrides?: Record<string, ModelOverride>;
};

const AGENT_DIR = join(homedir(), CONFIG_DIR_NAME, "agent");
const CONFIG_PATH = join(AGENT_DIR, "pi-openai-api-models-sync.json");
const MODELS_PATH = join(AGENT_DIR, "models.json");
const PER_MILLION = 1_000_000;
const DEFAULT_PRICING_URL =
  "https://raw.githubusercontent.com/Wei-Shaw/model-price-repo/main/model_prices_and_context_window.json";
const DEFAULT_COST: Cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_INCLUDE = [".*"];
const DEFAULT_EXCLUDE = ["audio", "realtime", "image", "embedding", "auto-review"];
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MODEL: Omit<SyncedModel, "id" | "name"> = {
  reasoning: false,
  input: ["text"],
  contextWindow: 128_000,
  maxTokens: 16_384,
  cost: DEFAULT_COST,
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadConfig(): ExtensionConfig {
  if (existsSync(CONFIG_PATH)) return readJson<ExtensionConfig>(CONFIG_PATH);
  return {};
}

function isOpenAiCompatibleProvider(provider: StoredProviderConfig): boolean {
  return Boolean(
    provider.baseUrl &&
      (provider.api === "openai-responses" || provider.api === "openai-completions"),
  );
}

function resolveValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("!")) {
    return execFileSync("sh", ["-c", value.slice(1)], { encoding: "utf8" }).trim();
  }

  return value.replace(
    /\$\$|\$!|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      if (match === "$$") return "$";
      if (match === "$!") return "!";
      return process.env[braced ?? bare] ?? "";
    },
  );
}

function modelName(id: string, displayName?: string): string {
  if (displayName && displayName !== id) return displayName;
  return id
    .split("-")
    .map((part) =>
      part.toUpperCase() === part ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

export function shouldInclude(id: string, include: RegExp[], exclude: RegExp[]): boolean {
  return (
    include.some((pattern) => pattern.test(id)) && !exclude.some((pattern) => pattern.test(id))
  );
}

async function fetchModels(
  provider: StoredProviderConfig,
  timeoutMs: number,
): Promise<Array<{ id: string; display_name?: string; name?: string }>> {
  if (!provider.baseUrl) throw new Error("provider.baseUrl is required");

  const apiKey = resolveValue(provider.apiKey);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(provider.headers ?? {})) {
    const resolved = resolveValue(value);
    if (resolved) headers[key] = resolved;
  }
  if (provider.authHeader !== false && apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GET /models failed: HTTP ${response.status}`);

  const payload = (await response.json()) as {
    data?: Array<{ id: string; display_name?: string; name?: string }>;
  };
  if (!Array.isArray(payload.data))
    throw new Error("GET /models response did not contain a data array");
  return payload.data.filter((model) => typeof model.id === "string" && model.id.length > 0);
}

async function fetchPricing(url: string, timeoutMs: number): Promise<Record<string, PricingEntry>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`pricing fetch failed: HTTP ${response.status}`);
  return (await response.json()) as Record<string, PricingEntry>;
}

function perMillion(value: number | undefined): number {
  return (value ?? 0) * PER_MILLION;
}

export function pricingToCost(entry: PricingEntry | undefined): Cost | undefined {
  if (!entry) return undefined;

  const cost: Cost = {
    input: perMillion(entry.input_cost_per_token),
    output: perMillion(entry.output_cost_per_token),
    cacheRead: perMillion(entry.cache_read_input_token_cost),
    cacheWrite: perMillion(entry.cache_creation_input_token_cost),
  };

  const threshold = entry.long_context_input_token_threshold ?? 272_000;
  const longInput =
    entry.input_cost_per_token_above_272k_tokens ??
    multiply(entry.input_cost_per_token, entry.long_context_input_cost_multiplier);
  const longOutput =
    entry.output_cost_per_token_above_272k_tokens ??
    multiply(entry.output_cost_per_token, entry.long_context_output_cost_multiplier);
  const longCacheRead =
    entry.cache_read_input_token_cost_above_272k_tokens ??
    multiply(entry.cache_read_input_token_cost, entry.long_context_input_cost_multiplier);
  const longCacheWrite =
    entry.cache_creation_input_token_cost_above_272k_tokens ??
    multiply(entry.cache_creation_input_token_cost, entry.long_context_input_cost_multiplier);

  if ([longInput, longOutput, longCacheRead, longCacheWrite].some((value) => value !== undefined)) {
    cost.tiers = [
      {
        inputTokensAbove: threshold,
        input: perMillion(longInput ?? entry.input_cost_per_token),
        output: perMillion(longOutput ?? entry.output_cost_per_token),
        cacheRead: perMillion(longCacheRead ?? entry.cache_read_input_token_cost),
        cacheWrite: perMillion(longCacheWrite ?? entry.cache_creation_input_token_cost),
      },
    ];
  }

  return cost;
}

function multiply(value: number | undefined, multiplier: number | undefined): number | undefined {
  return value !== undefined && multiplier !== undefined ? value * multiplier : undefined;
}

export function pricingToThinking(entry: PricingEntry | undefined): {
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
} {
  if (!entry?.supports_reasoning) return { reasoning: false };

  return {
    reasoning: true,
    thinkingLevelMap: {
      off: entry.supports_none_reasoning_effort ? "off" : null,
      minimal: entry.supports_minimal_reasoning_effort ? "minimal" : null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: entry.supports_xhigh_reasoning_effort ? "xhigh" : null,
      max: entry.supports_max_reasoning_effort ? "max" : null,
    },
  };
}

function pricingToInput(entry: PricingEntry | undefined): Array<"text" | "image"> | undefined {
  if (!entry?.supported_modalities?.includes("image")) return undefined;
  return ["text", "image"];
}

function mergeModel(base: SyncedModel, override: ModelOverride | undefined): SyncedModel {
  if (!override) return base;
  return {
    ...base,
    ...override,
    id: base.id,
    thinkingLevelMap:
      override.thinkingLevelMap === undefined
        ? base.thinkingLevelMap
        : { ...(base.thinkingLevelMap ?? {}), ...override.thinkingLevelMap },
    cost: override.cost === undefined ? base.cost : { ...base.cost, ...override.cost },
  };
}

export default async function openAiApiModelsSync(pi: ExtensionAPI): Promise<void> {
  if (!existsSync(MODELS_PATH)) {
    console.warn(`[pi-openai-api-models-sync] Missing ${MODELS_PATH}; extension is inactive.`);
    return;
  }

  const config = loadConfig();
  const modelsJson = readJson<ModelsJson>(MODELS_PATH);
  const providers = Object.entries(modelsJson.providers ?? {});
  const selectedProviders = config.providerId
    ? providers.filter(([providerId]) => providerId === config.providerId)
    : providers.filter(([, provider]) => isOpenAiCompatibleProvider(provider));

  if (selectedProviders.length === 0) {
    const reason = config.providerId
      ? `Provider '${config.providerId}' was not found`
      : "No OpenAI-compatible providers were found";
    console.warn(`[pi-openai-api-models-sync] ${reason} in ${MODELS_PATH}.`);
    return;
  }

  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  let pricing: Record<string, PricingEntry> = {};
  try {
    pricing = await fetchPricing(config.pricingUrl ?? DEFAULT_PRICING_URL, timeoutMs);
  } catch (error) {
    console.warn(
      `[pi-openai-api-models-sync] Pricing unavailable; using defaults: ${errorMessage(error)}`,
    );
  }

  const include = (config.include ?? DEFAULT_INCLUDE).map((pattern) => new RegExp(pattern));
  const exclude = (config.exclude ?? DEFAULT_EXCLUDE).map((pattern) => new RegExp(pattern));
  const defaults = { ...DEFAULT_MODEL, ...(config.defaults ?? {}) };

  await Promise.all(
    selectedProviders.map(async ([providerId, provider]) => {
      let remoteModels: Awaited<ReturnType<typeof fetchModels>>;
      try {
        remoteModels = await fetchModels(provider, timeoutMs);
      } catch (error) {
        console.warn(
          `[pi-openai-api-models-sync] Model sync skipped for '${providerId}': ${errorMessage(error)}`,
        );
        return;
      }

      const models = remoteModels
        .filter((model) => shouldInclude(model.id, include, exclude))
        .map((model): SyncedModel => {
          const entry = pricing[model.id];
          const thinking = pricingToThinking(entry);
          return mergeModel(
            {
              id: model.id,
              name: modelName(model.id, model.display_name ?? model.name),
              reasoning: thinking.reasoning,
              thinkingLevelMap: thinking.thinkingLevelMap,
              input: pricingToInput(entry) ?? defaults.input ?? DEFAULT_MODEL.input,
              contextWindow:
                entry?.max_input_tokens ?? defaults.contextWindow ?? DEFAULT_MODEL.contextWindow,
              maxTokens:
                entry?.max_output_tokens ??
                entry?.max_tokens ??
                defaults.maxTokens ??
                DEFAULT_MODEL.maxTokens,
              cost: pricingToCost(entry) ?? defaults.cost ?? DEFAULT_COST,
              compat: defaults.compat,
            },
            config.overrides?.[model.id],
          );
        });

      if (models.length === 0) {
        console.warn(`[pi-openai-api-models-sync] No models matched provider '${providerId}'.`);
        return;
      }

      pi.registerProvider(providerId, { ...provider, models });
    }),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
