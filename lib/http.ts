export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function withErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api]", err);
      return error("internal error", 500);
    }
  };
}

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | undefined> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return undefined;
  const text = await request.text();
  if (!text || text.length > maxBytes) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
