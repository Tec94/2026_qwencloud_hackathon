import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSessionSecretForRuntime } from "./runtime-config";

function secret(): string {
  return getSessionSecretForRuntime();
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function privacyHash(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex").slice(0, 24);
}

export function createSignedCapability(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedCapability<T>(value: string): T | null {
  const [encoded, suppliedSignature, extra] = value.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
