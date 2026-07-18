import { describe, expect, expectTypeOf, it } from "vitest";

import { err, ok, type Result } from "./result";

describe("Result helpers", () => {
  it("creates a successful result and supports discriminated narrowing", () => {
    const result: Result<{ id: string }, "NOT_FOUND"> = ok({ id: "memory-1" });

    expect(result).toEqual({ ok: true, value: { id: "memory-1" } });
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{ id: string }>();
      expect(result.value.id).toBe("memory-1");
    } else {
      throw new Error("Expected an Ok result.");
    }
  });

  it("creates a failed result and preserves the typed error value", () => {
    const failure = { code: "CONSENT_REQUIRED" as const, status: 403 };
    const result: Result<number, typeof failure> = err(failure);

    expect(result).toEqual({ ok: false, error: failure });
    if (!result.ok) {
      expectTypeOf(result.error).toEqualTypeOf<typeof failure>();
      expect(result.error).toBe(failure);
    } else {
      throw new Error("Expected an Err result.");
    }
  });

  it("does not alter falsy success or failure payloads", () => {
    expect(ok(0)).toEqual({ ok: true, value: 0 });
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
    expect(err("")).toEqual({ ok: false, error: "" });
  });
});
