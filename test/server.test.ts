import { describe, expect, mock, test } from "bun:test";
import { analyzeWord, handleSkiptingarRequest, hyphenate } from "../src";
import {
  configureSkiptingar,
  remoteResult,
  requestRemote,
  subscribeRemote,
  usesEndpoint,
} from "../src/client/remote";

const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

describe("handleSkiptingarRequest", () => {
  test("answers process and analyze jobs in order", async () => {
    const response = await handleSkiptingarRequest(
      post({
        items: [
          { op: "process", text: "Hraðbrautarframkvæmdir", options: { typeset: false } },
          { op: "analyze", word: "vítamín", options: { rules: "ritreglur" } },
        ],
      })
    );
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: unknown[] };
    expect(results).toEqual([
      hyphenate("Hraðbrautarframkvæmdir"),
      analyzeWord("vítamín", { rules: "ritreglur" }),
    ]);
  });

  test("refuses other methods, bad bodies and oversized requests", async () => {
    const get = await handleSkiptingarRequest(new Request("http://x/api"));
    expect(get.status).toBe(405);
    const notJson = new Request("http://x/api", { method: "POST", body: "{" });
    expect((await handleSkiptingarRequest(notJson)).status).toBe(400);
    expect((await handleSkiptingarRequest(post({ items: [{ op: "x" }] }))).status).toBe(
      400
    );
    const big = post({ items: [{ op: "process", text: "a".repeat(60_000) }] });
    expect((await handleSkiptingarRequest(big)).status).toBe(400);
    const many = post({
      items: Array.from({ length: 3 }, () => ({ op: "analyze", word: "a" })),
    });
    expect((await handleSkiptingarRequest(many, { maxItems: 2 })).status).toBe(400);
  });
});

describe("the remote client", () => {
  test("sends one request per tick, caches answers, and falls back on failure", async () => {
    const calls: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return handleSkiptingarRequest(
        new Request("http://x/api", { method: "POST", body: String(init?.body) })
      );
    }) as unknown as typeof fetch;
    try {
      configureSkiptingar({ endpoint: "/api" });
      let notified = 0;
      const stop = subscribeRemote(() => {
        notified += 1;
      });
      requestRemote("a", { op: "process", text: "Sveitarstjórnarkosningar" });
      requestRemote("b", { op: "analyze", word: "vítamín" });
      requestRemote("a", { op: "process", text: "Sveitarstjórnarkosningar" });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(calls).toHaveLength(1);
      expect((calls[0] as { items: unknown[] }).items).toHaveLength(2);
      expect(remoteResult("a")).toBe(hyphenate("Sveitarstjórnarkosningar"));
      expect(notified).toBeGreaterThan(0);

      globalThis.fetch = mock(
        async () => new Response("no", { status: 500 })
      ) as unknown as typeof fetch;
      requestRemote("c", { op: "process", text: "Orðabók" });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(usesEndpoint()).toBe(false);
      stop();
    } finally {
      globalThis.fetch = realFetch;
      configureSkiptingar({ endpoint: undefined });
    }
  });
});
