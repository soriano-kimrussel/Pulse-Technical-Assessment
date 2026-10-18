import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { removeSessions } from "@/lib/sessions";
import { error, json, readJson, withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrors(async (request: NextRequest) => {
  const body = await readJson(request, 1024);
  const me = await authenticate(body?.token);
  if (!me) return error("unauthorized", 401);

  await removeSessions([me.id]);
  return json({ ok: true });
});
