import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AppError,
  ValidationError,
  asAppError,
  fieldErrorsFromIssues,
} from "./errors";

describe("AppError", () => {
  it("preserves the stable public contract and an optional cause", () => {
    const cause = new Error("private infrastructure detail");
    const error = new AppError(
      "CONFLICT",
      "This memory changed while it was being reviewed.",
      409,
      { memoryId: "memory-1" },
      { cause },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "AppError",
      code: "CONFLICT",
      message: "This memory changed while it was being reviewed.",
      status: 409,
      details: { memoryId: "memory-1" },
      cause,
    });
  });
});

describe("ValidationError", () => {
  it("uses a safe default message when no field details are available", () => {
    const error = new ValidationError();

    expect(error).toMatchObject({
      name: "AppError",
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Please check the submitted information.",
      details: undefined,
    });
  });

  it("wraps field errors without changing their public shape", () => {
    const fieldErrors = {
      message: ["Message is required."],
      "profile.name": ["Name is too short."],
    };
    const error = new ValidationError("Please correct the marked fields.", fieldErrors);

    expect(error.message).toBe("Please correct the marked fields.");
    expect(error.details).toEqual({ fieldErrors });
  });
});

describe("fieldErrorsFromIssues", () => {
  it("groups repeated, nested, and form-level Zod issues", () => {
    const schema = z
      .object({
        email: z.string().superRefine((_value, context) => {
          context.addIssue({ code: "custom", message: "Email is invalid." });
          context.addIssue({ code: "custom", message: "Email is unavailable." });
        }),
        profile: z.object({ name: z.string().min(3, "Name is too short.") }),
      })
      .superRefine((_value, context) => {
        context.addIssue({ code: "custom", message: "The form needs review." });
      });
    const parsed = schema.safeParse({ email: "not-an-email", profile: { name: "A" } });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected invalid test input.");

    expect(fieldErrorsFromIssues(parsed.error.issues)).toEqual({
      email: ["Email is invalid.", "Email is unavailable."],
      "profile.name": ["Name is too short."],
      form: ["The form needs review."],
    });
  });

  it("returns an empty record for an issue-free parse", () => {
    expect(fieldErrorsFromIssues([])).toEqual({});
  });
});

describe("asAppError", () => {
  it("does not replace an already-classified application error", () => {
    const original = new AppError("NOT_FOUND", "Memory not found.", 404);

    expect(asAppError(original)).toBe(original);
  });

  it("translates an Error to a safe internal error while retaining the cause", () => {
    const cause = new Error("database filename and secret detail");
    const translated = asAppError(cause);

    expect(translated).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Threadline could not complete that request.",
      details: undefined,
      cause,
    });
    expect(translated.message).not.toContain(cause.message);
  });

  it("does not attach arbitrary thrown values as an Error cause", () => {
    const translated = asAppError({ apiKey: "must-not-leak" });

    expect(translated).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Threadline could not complete that request.",
      details: undefined,
    });
    expect(translated.cause).toBeUndefined();
  });
});
