# pi-sub2api-models-sync

A [Pi](https://pi.dev) extension package that keeps a Sub2API-backed provider's model list in sync and enriches each model with pricing and capability metadata.

## How it works

At Pi startup, the extension:

1. Reads an existing provider from `~/.pi/agent/models.json`.
2. Requests `<baseUrl>/models` with the provider's configured authentication.
3. Fetches Sub2API's upstream model metadata repository.
4. Intersects the available model IDs with pricing and capability metadata.
5. Registers the resulting models through `pi.registerProvider()`.

The gateway remains the source of truth for model availability. The metadata repository supplies context windows, output limits, input modalities, token pricing, long-context pricing tiers, and supported reasoning levels.

If model discovery fails, the extension leaves the static provider configuration untouched. If only pricing discovery fails, models are registered with configured defaults.

## Install

```bash
pi install git:github.com/riverscn/pi-sub2api-models-sync
```

Create `~/.pi/agent/sub2api-models-sync.json`:

```json
{
  "providerId": "sub2api",
  "include": ["^gpt-5\\."],
  "exclude": ["audio", "realtime", "image", "auto-review"]
}
```

The provider must already exist in `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "sub2api": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-responses",
      "apiKey": "$SUB2API_API_KEY",
      "authHeader": true,
      "models": [
        { "id": "placeholder" }
      ]
    }
  }
}
```

The static `models` entry is only a bootstrap/fallback. Once this extension loads successfully, the dynamically discovered list replaces it for the active Pi process.

Run `/reload` in Pi or restart it, then inspect the result:

```bash
pi --list-models
```

## Configuration

The complete configuration is shown in [`config.example.json`](config.example.json).

| Field | Default | Description |
| --- | --- | --- |
| `providerId` | required | Provider key in `models.json` |
| `pricingUrl` | Sub2API model-price-repo | Pricing and capability JSON URL |
| `include` | `[".*"]` | Regex patterns; a model must match at least one |
| `exclude` | audio/realtime/image/embedding | Regex patterns removed from the result |
| `requestTimeoutMs` | `15000` | Timeout for each HTTP request |
| `defaults` | zero-cost, text, 128K/16K | Metadata used when pricing has no model entry |
| `overrides` | `{}` | Per-model Pi metadata overrides |

Provider `apiKey` and `headers` support the same value forms as Pi's `models.json`: literals, `$ENV_VAR`, `${ENV_VAR}`, and leading `!command` values.

## Reasoning levels

Reasoning levels are derived from these metadata fields:

- `supports_reasoning`
- `supports_none_reasoning_effort`
- `supports_minimal_reasoning_effort`
- `supports_xhigh_reasoning_effort`
- `supports_max_reasoning_effort`

For a reasoning model, `low`, `medium`, and `high` are enabled. `off`, `minimal`, `xhigh`, and `max` are enabled only when the corresponding capability flag is present. Use `overrides` when a gateway or aliased model behaves differently from the metadata repository.

## Security

The extension reads provider credentials locally to call `/models`. It does not write credentials, include them in logs, or send them to the pricing endpoint. The pricing request is unauthenticated.

Prefer environment references such as `$SUB2API_API_KEY` instead of storing a literal secret in `models.json`.

## Development

```bash
npm install
npm run typecheck
pi --no-extensions -e ./extensions/sub2api-models-sync.ts --list-models
```

## License

MIT
