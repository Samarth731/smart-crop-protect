/** Fetch JSON with a timeout, keeping the last good response in localStorage for offline use. */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new HttpError(res.status, `${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface Cached<T> {
  at: number;
  data: T;
}

const PREFIX = "scp-cache:";

export function readCache<T>(key: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // storage full or unavailable: drop the oldest cache entries and give up quietly
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
      for (const k of keys.slice(0, Math.ceil(keys.length / 2))) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Network first; on failure fall back to the cached copy (if any) and mark it stale.
 * `maxAgeMs` lets callers skip the network entirely while the cache is fresh.
 */
export async function cachedJson<T>(
  key: string,
  url: string,
  opts: { maxAgeMs?: number; timeoutMs?: number } = {},
): Promise<{ data: T; at: number; stale: boolean }> {
  const hit = readCache<T>(key);
  if (hit && opts.maxAgeMs && Date.now() - hit.at < opts.maxAgeMs) {
    return { data: hit.data, at: hit.at, stale: false };
  }
  try {
    const data = await fetchJson<T>(url, opts.timeoutMs);
    writeCache(key, data);
    return { data, at: Date.now(), stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, at: hit.at, stale: true };
    throw err;
  }
}

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
