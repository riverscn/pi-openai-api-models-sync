# pi-openai-api-models-sync

English | [简体中文](README_CN.md)

A [Pi](https://pi.dev) extension package that syncs models from an OpenAI-compatible `/models` endpoint and enriches them with pricing and capability metadata.

## How it works

At Pi startup, the extension:

1. Finds all `openai-responses` and `openai-completions` providers in `~/.pi/agent/models.json`.
2. Requests `<baseUrl>/models` with each provider's configured authentication.
3. Fetches model pricing and capability metadata.
4. Intersects the available model IDs with the metadata.
5. Registers the resulting models through `pi.registerProvider()`.

The OpenAI-compatible API is the source of truth for model availability. The metadata source supplies context windows, output limits, input modalities, token pricing, long-context pricing tiers, and supported reasoning levels.

If model discovery fails, the extension leaves the static provider configuration untouched. If only metadata discovery fails, models are registered with configured defaults.

## Acknowledgements

Special thanks to [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) for providing and maintaining the model metadata used by this extension. By default, the extension reads [Wei-Shaw/model-price-repo](https://github.com/Wei-Shaw/model-price-repo), the metadata source configured by Sub2API.

This project is independent and is not affiliated with or endorsed by Sub2API.

## Install

```bash
pi install git:github.com/riverscn/pi-openai-api-models-sync
```

No extension configuration is required. The extension automatically discovers every OpenAI-compatible provider in `~/.pi/agent/models.json`. A provider must already exist there:

```json
{
  "providers": {
    "openai-api": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-responses",
      "apiKey": "$OPENAI_API_KEY",
      "authHeader": true,
      "models": [
        { "id": "placeholder" }
      ]
    }
  }
}
```

The static `models` entry is only a bootstrap and fallback. After a successful sync, the extension replaces it for the active Pi process.

Run `/reload` in Pi or restart it, then inspect the result:

```bash
pi --list-models
```

## Configuration

Configuration is optional. The built-in defaults are exactly those shown in [`config.example.json`](config.example.json). Create `~/.pi/agent/pi-openai-api-models-sync.json` only when you need to override them.

Set `providerId` to sync only one provider; omit it to auto-discover and sync all OpenAI-compatible providers.

| Field | Default | Description |
| --- | --- | --- |
| `providerId` | all compatible providers | Optional provider key in `models.json` |
| `pricingUrl` | Sub2API metadata repository | Pricing and capability JSON URL |
| `include` | `[".*"]` | Regex patterns; a model must match at least one |
| `exclude` | audio/realtime/image/embedding/auto-review | Regex patterns removed from the result |
| `requestTimeoutMs` | `15000` | Timeout for each HTTP request |
| `defaults` | zero-cost, text, 128K/16K | Metadata used when no matching entry exists |
| `overrides` | `{}` | Per-model Pi metadata overrides |

Provider `apiKey` and `headers` support the same value forms as Pi's `models.json`: literals, `$ENV_VAR`, `${ENV_VAR}`, and leading `!command` values.

## Reasoning levels

Reasoning levels are derived from these metadata fields:

- `supports_reasoning`
- `supports_none_reasoning_effort`
- `supports_minimal_reasoning_effort`
- `supports_xhigh_reasoning_effort`
- `supports_max_reasoning_effort`

For a reasoning model, `low`, `medium`, and `high` are enabled. `off`, `minimal`, `xhigh`, and `max` are enabled only when the corresponding capability flag is present. Use `overrides` when an API gateway or aliased model behaves differently from the metadata repository.

## Security

The extension reads provider credentials locally only to call the configured `/models` endpoint. It does not write credentials, include them in logs, or send them to the metadata endpoint. The metadata request is unauthenticated.

Prefer environment references such as `$OPENAI_API_KEY` instead of storing a literal secret in `models.json`.

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
pi --no-extensions -e ./extensions/openai-api-models-sync.ts --list-models
```

## License

MIT
