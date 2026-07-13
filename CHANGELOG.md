# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-13

### Added

- Add zero-configuration discovery for all OpenAI-compatible providers in Pi's `models.json`.
- Add optional provider filtering and per-model metadata overrides.

### Changed

- Exclude audio, realtime, image, embedding, and auto-review models by default.

## [0.2.0] - 2026-07-13

### Changed

- Rename the package to `pi-openai-api-models-sync`.
- Generalize model discovery for OpenAI-compatible APIs.
- Add English and Simplified Chinese documentation.
- Document and acknowledge the Sub2API metadata source.

## [0.1.0] - 2026-07-13

### Added

- Initial Pi extension package.
- Sync available models from an OpenAI-compatible `/models` endpoint.
- Enrich models with pricing, context, modality, and reasoning metadata.
