/**
 * Thin fetch wrapper: JWT auth with silent refresh, normalised errors, uploads, downloads.
 * In the demo bundle a mock handler is installed on `globalThis.__MAN_DEMO__` and every call is served in-browser.
 */
export const API_BASE = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) || "/api/v1";

type DemoHandler = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: any }>;
type DemoApi = { handle: DemoHandler; download: (path: string, name: string) => void };
const demo = (): DemoApi | undefined => (globalThis as any).__MAN_DEMO__;
export const isDemo = () => !!demo();

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super((data && (data.detail as string)) || "خطا در ارتباط با سرور");
    this.status = status;
    this.data = data;
  }
  field(name: string): string | undefined {
    const e = this.data?.errors?.[name];
    return Array.isArray(e) ? e[0] : typeof e === "string" ? e : undefined;
  }
}

// localStorage with an in-memory fallback (private windows / sandboxed frames can throw).
const memory: Record<string, string | null> = {};
const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return memory[k] ?? null; }
  },
  set(k: string, v: string | null) {
    memory[k] = v;
    try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};

export const tokens = {
  get access() { return store.get("man.access"); },
  get refresh() { return store.get("man.refresh"); },
  set(access: string | null, refresh?: string | null) {
    store.set("man.access", access);
    if (refresh !== undefined) store.set("man.refresh", refresh);
  },
  clear() { store.set("man.access", null); store.set("man.refresh", null); },
};

function qs(params?: Record<string, any>) {
  if (!params) return "";
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  refreshing ??= fetch(`${API_BASE}/auth/refresh/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: tokens.refresh }),
  }).then(async (r) => {
    if (!r.ok) return false;
    const d = await r.json();
    tokens.set(d.access, d.refresh ?? tokens.refresh);
    return true;
  }).catch(() => false).finally(() => { setTimeout(() => (refreshing = null), 0); });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, opts: { headers?: Record<string, string> } = {}): Promise<T> {
  const d = demo();
  if (d) {
    const res = await d.handle(method, path, body);
    if (res.status >= 400) throw new ApiError(res.status, res.data);
    return res.data as T;
  }
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const doFetch = () => fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
      ...opts.headers,
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  let r: Response;
  try {
    r = await doFetch();
  } catch {
    throw new ApiError(0, { detail: "اتصال به سرور برقرار نشد. اینترنت را بررسی کنید." });
  }
  if (r.status === 401 && tokens.refresh && (await tryRefresh())) r = await doFetch();
  if (r.status === 401) {
    tokens.clear();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("man:logout"));
  }
  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { detail: text.slice(0, 200) }; } })() : null;
  if (!r.ok) {
    if (r.status === 429) throw new ApiError(429, { detail: "تعداد درخواست‌ها زیاد است؛ چند لحظه بعد دوباره تلاش کنید." });
    if (r.status >= 500) throw new ApiError(r.status, { detail: "خطای سرور؛ لطفاً دوباره تلاش کنید." });
    throw new ApiError(r.status, data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, any>) => request<T>("GET", path + qs(params)),
  post: <T = any>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", path, body ?? {}, { headers }),
  patch: <T = any>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T = any>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T = any>(path: string) => request<T>("DELETE", path),
  /** Download a binary (PDF/XLSX) with auth and save it. */
  async download(path: string, filename: string, params?: Record<string, any>) {
    const d = demo();
    if (d) return d.download(path + qs(params), filename);
    const doFetch = () => fetch(`${API_BASE}${path}${qs(params)}`, {
      headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
    });
    let r = await doFetch();
    if (r.status === 401 && (await tryRefresh())) r = await doFetch();
    if (!r.ok) {
      const t = await r.text();
      let detail = "دریافت فایل ناموفق بود.";
      try { detail = JSON.parse(t).detail || detail; } catch { /* not json */ }
      throw new ApiError(r.status, { detail });
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export function newIdempotencyKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
