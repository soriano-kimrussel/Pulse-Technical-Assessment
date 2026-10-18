interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
let lastSweep = Date.now();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    lastSweep = now;
  }

  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
