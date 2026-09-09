import { createHash, randomBytes } from "node:crypto";

function base64Url(value: Buffer): string { return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

export function createPkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function createOAuthState(): string { return base64Url(randomBytes(32)); }