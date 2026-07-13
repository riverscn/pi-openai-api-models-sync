# pi-openai-api-models-sync

[English](README.md) | 简体中文

这是一个 [Pi](https://pi.dev) 扩展包，用于从 OpenAI-compatible `/models` 接口同步可用模型，并补充价格、上下文窗口和推理能力等元数据。

## 工作方式

Pi 启动时，扩展会：

1. 从 `~/.pi/agent/models.json` 自动发现全部 `openai-responses` 和 `openai-completions` provider。
2. 使用各 provider 配置的认证信息请求 `<baseUrl>/models`。
3. 获取模型价格与能力元数据。
4. 按模型 ID 合并可用模型列表和元数据。
5. 通过 `pi.registerProvider()` 注册最终模型列表。

OpenAI-compatible API 是“模型当前是否可用”的权威来源。元数据源负责提供上下文窗口、最大输出、输入模态、Token 价格、长上下文阶梯价格和可用推理等级。

如果模型列表同步失败，扩展不会覆盖 `models.json` 中的静态配置。如果只有元数据获取失败，扩展仍会使用本地默认值注册模型。

## 特别感谢

特别感谢 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 项目提供并维护本扩展使用的模型元数据。扩展默认读取 [Wei-Shaw/model-price-repo](https://github.com/Wei-Shaw/model-price-repo)，该数据源也是 Sub2API 默认配置使用的模型价格与能力数据源。

本项目为独立项目，与 Sub2API 不存在隶属或官方背书关系。

## 安装

```bash
pi install git:github.com/riverscn/pi-openai-api-models-sync
```

扩展不要求额外配置，会自动发现 `~/.pi/agent/models.json` 中所有 OpenAI-compatible provider。对应 provider 只需已经存在于该文件中：

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

静态 `models` 只用于引导和故障回退。同步成功后，扩展会在当前 Pi 进程中用动态模型列表覆盖它。

在 Pi 中执行 `/reload` 或重新启动，然后检查结果：

```bash
pi --list-models
```

## 配置

配置文件是可选的。扩展内置默认值与 [`config.example.json`](config.example.json) 完全一致。只有需要覆盖默认行为时，才需要创建 `~/.pi/agent/pi-openai-api-models-sync.json`。

设置 `providerId` 时只同步指定 provider；省略时会自动发现并同步所有 OpenAI-compatible provider。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `providerId` | 所有兼容 provider | 可选的 `models.json` provider key |
| `pricingUrl` | Sub2API 元数据仓库 | 价格和模型能力 JSON 地址 |
| `include` | `[".*"]` | 正则列表，模型至少匹配一项才会保留 |
| `exclude` | audio/realtime/image/embedding/auto-review | 匹配这些正则的模型会被排除 |
| `requestTimeoutMs` | `15000` | 每个 HTTP 请求的超时时间 |
| `defaults` | 零费用、文本、128K/16K | 找不到模型元数据时使用的默认值 |
| `overrides` | `{}` | 按模型 ID 覆盖 Pi 模型元数据 |

Provider 的 `apiKey` 和 `headers` 支持与 Pi `models.json` 相同的值格式：字面量、`$ENV_VAR`、`${ENV_VAR}`，以及以 `!command` 开头的命令值。

## 推理等级

扩展根据以下元数据字段生成 Pi 的 think level：

- `supports_reasoning`
- `supports_none_reasoning_effort`
- `supports_minimal_reasoning_effort`
- `supports_xhigh_reasoning_effort`
- `supports_max_reasoning_effort`

对于推理模型，默认启用 `low`、`medium` 和 `high`。只有对应能力字段明确支持时，才启用 `off`、`minimal`、`xhigh` 和 `max`。如果 API 网关或模型别名的实际行为与元数据不同，可以通过 `overrides` 修正。

## 安全说明

扩展只在本地读取 provider 凭据，用于请求已配置的 `/models` 接口。凭据不会被写入文件、输出到日志或发送到元数据接口。元数据请求本身不携带认证信息。

建议在 `models.json` 中使用 `$OPENAI_API_KEY` 等环境变量引用，不要直接写入密钥。

## 开发

```bash
npm install
npm run typecheck
pi --no-extensions -e ./extensions/openai-api-models-sync.ts --list-models
```

## 许可证

MIT
