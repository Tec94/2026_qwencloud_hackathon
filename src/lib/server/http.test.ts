import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { MAX_JSON_BODY_BYTES, parseJson } from "./http";

const schema = z.object({ content: z.string() });

describe("parseJson request limits", () => {
  it("parses a valid JSON body below the application cap", async () => {
    const request = new Request("https://threadline.test/api", {
      method: "POST",
      body: JSON.stringify({ content: "synthetic reflection" }),
      headers: { "content-type": "application/json" },
    });

    await expect(parseJson(request, schema)).resolves.toEqual({
      content: "synthetic reflection",
    });
  });

  it("rejects a declared body larger than 16 KB before reading it", async () => {
    const request = new Request("https://threadline.test/api", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
    });

    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
  });

  it("stops a chunked body once the streamed bytes cross the cap", async () => {
    const oversized = new Uint8Array(MAX_JSON_BODY_BYTES + 1).fill(97);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    });
    const request = new Request("https://threadline.test/api", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
  });

  it("uses the stable validation envelope source for malformed JSON", async () => {
    const request = new Request("https://threadline.test/api", {
      method: "POST",
      body: "{not-json}",
    });

    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });
});
