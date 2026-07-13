import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pricingToCost,
  pricingToThinking,
  shouldInclude,
} from "../extensions/openai-api-models-sync.ts";

describe("pricingToCost", () => {
  it("converts per-token prices to Pi per-million-token prices", () => {
    assert.deepEqual(
      pricingToCost({
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.000015,
        cache_read_input_token_cost: 0.00000025,
      }),
      {
        input: 2.5,
        output: 15,
        cacheRead: 0.25,
        cacheWrite: 0,
      },
    );
  });

  it("builds a long-context tier from explicit prices", () => {
    const cost = pricingToCost({
      input_cost_per_token: 0.0000025,
      output_cost_per_token: 0.000015,
      input_cost_per_token_above_272k_tokens: 0.000005,
      output_cost_per_token_above_272k_tokens: 0.0000225,
    });

    assert.deepEqual(cost?.tiers, [
      {
        inputTokensAbove: 272_000,
        input: 5,
        output: 22.5,
        cacheRead: 0,
        cacheWrite: 0,
      },
    ]);
  });

  it("builds a long-context tier from multipliers", () => {
    const cost = pricingToCost({
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.00003,
      cache_read_input_token_cost: 0.0000005,
      long_context_input_token_threshold: 300_000,
      long_context_input_cost_multiplier: 2,
      long_context_output_cost_multiplier: 1.5,
    });

    assert.deepEqual(cost?.tiers, [
      {
        inputTokensAbove: 300_000,
        input: 10,
        output: 45,
        cacheRead: 1,
        cacheWrite: 0,
      },
    ]);
  });
});

describe("pricingToThinking", () => {
  it("disables thinking metadata for non-reasoning models", () => {
    assert.deepEqual(pricingToThinking(undefined), { reasoning: false });
    assert.deepEqual(pricingToThinking({ supports_reasoning: false }), { reasoning: false });
  });

  it("maps optional reasoning levels from capability flags", () => {
    assert.deepEqual(
      pricingToThinking({
        supports_reasoning: true,
        supports_none_reasoning_effort: true,
        supports_minimal_reasoning_effort: false,
        supports_xhigh_reasoning_effort: true,
        supports_max_reasoning_effort: false,
      }),
      {
        reasoning: true,
        thinkingLevelMap: {
          off: "off",
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: null,
        },
      },
    );
  });
});

describe("shouldInclude", () => {
  it("requires an include match and rejects exclude matches", () => {
    const include = [/^gpt-/];
    const exclude = [/audio/, /realtime/, /image/, /embedding/, /auto-review/];

    assert.equal(shouldInclude("gpt-5.5", include, exclude), true);
    assert.equal(shouldInclude("gpt-image-1", include, exclude), false);
    assert.equal(shouldInclude("claude-sonnet", include, exclude), false);
  });
});
