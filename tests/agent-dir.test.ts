import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { it } from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
// Import before setting the environment to catch paths cached at module load time.
import openAiApiModelsSync from "../extensions/index.ts";

it("resolves both files from the active Pi directory on each initialization", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-model-sync-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  t.after(async () => {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    await rm(root, { recursive: true, force: true });
  });

  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    const name = /\/(first|second)\//.exec(url)?.[1];
    assert.ok(name, `Unexpected request: ${url}`);
    if (url.endsWith("/pricing")) {
      assert.equal(init?.headers, undefined);
      return Response.json({ [`${name}-model`]: { max_input_tokens: 64000 } });
    }
    assert.equal(url, `https://example.invalid/${name}/models`);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${name}-test-key`);
    return Response.json({ data: [{ id: `${name}-model` }, { id: "excluded-model" }] });
  });

  for (const name of ["first", "second"]) {
    const dir = join(root, name);
    await mkdir(dir);
    await writeFile(
      join(dir, "models.json"),
      JSON.stringify({
        providers: {
          selected: {
            baseUrl: `https://example.invalid/${name}`,
            api: "openai-responses",
            apiKey: `${name}-test-key`,
            models: [{ id: "placeholder" }],
          },
          other: { baseUrl: "https://example.invalid/unselected", api: "openai-responses" },
        },
      }),
    );
    await writeFile(
      join(dir, "pi-openai-api-models-sync.json"),
      JSON.stringify({
        providerId: "selected",
        pricingUrl: `https://example.invalid/${name}/pricing`,
        include: [`^${name}-`],
      }),
    );
    // The second invocation also exercises Pi's built-in tilde expansion without changing HOME.
    process.env.PI_CODING_AGENT_DIR =
      name === "first" ? dir : `~/${relative(homedir(), dir).split("\\").join("/")}`;
    const registered: Array<{ id: string; config: ProviderConfig }> = [];
    await openAiApiModelsSync({
      registerProvider(id: string, config: ProviderConfig) {
        registered.push({ id, config });
      },
    } as ExtensionAPI);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].id, "selected");
    assert.deepEqual(
      registered[0].config.models?.map((model) => model.id),
      [`${name}-model`],
    );
    assert.equal(registered[0].config.models?.[0].contextWindow, 64000);
  }
  assert.deepEqual(requests, [
    "https://example.invalid/first/pricing",
    "https://example.invalid/first/models",
    "https://example.invalid/second/pricing",
    "https://example.invalid/second/models",
  ]);
});

it("does not fall back to a different directory when the active models.json is missing", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-model-sync-empty-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  t.after(async () => {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });
  process.env.PI_CODING_AGENT_DIR = dir;
  const warn = t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", () => assert.fail("No request should be made"));
  await openAiApiModelsSync({
    registerProvider() {
      assert.fail("No provider should be registered");
    },
  } as unknown as ExtensionAPI);
  assert.equal(warn.mock.calls.length, 1);
  assert.match(String(warn.mock.calls[0].arguments[0]), /extension is inactive/);
  assert.ok(String(warn.mock.calls[0].arguments[0]).includes(join(dir, "models.json")));
});
