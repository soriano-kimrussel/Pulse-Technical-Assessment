import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function newSession() {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return { id, token: `${id}.${secret}`, tokenHash: hashSecret(secret) };
}

function parseToken(token: unknown): { id: string; secret: string } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!isSessionId(id) || secret.length < 20) return null;
  return { id, secret };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function authenticate(token: unknown) {
  const parsed = parseToken(token);
  if (!parsed) return null;

  const row = await prisma.presence.findUnique({ where: { id: parsed.id } });
  if (!row) return null;

  const expected = Buffer.from(row.tokenHash, "hex");
  const actual = Buffer.from(hashSecret(parsed.secret), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return row;
}
