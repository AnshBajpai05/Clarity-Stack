// src/api/http.ts
// §1.7 Auth Hardening: Silent refresh interceptor, __Host- cookie prefix support
import { toast } from "@/hooks/use-toast"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ── Cookie Helpers ────────────────────────────────────────────────────────────

/**
 * Read a cookie by name, checking both plain and __Host- prefixed variants.
 * In production, the backend sets __Host- cookies; in dev, plain names are used.
 */
export function getCookie(name: string): string | null {
  // Try __Host- prefix first (production), then plain name (dev)
  const hostPrefixed = document.cookie.match(new RegExp('(^| )__Host-' + name + '=([^;]+)'));
  if (hostPrefixed) return hostPrefixed[2];
  const plain = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return plain ? plain[2] : null;
}

// ── Silent Refresh State Machine ─────────────────────────────────────────────

let _isRefreshing = false;
// Queue of { resolve, reject } callbacks for requests waiting on refresh
let _refreshQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

function _processRefreshQueue(err: Error | null) {
  _refreshQueue.forEach(cb => err ? cb.reject(err) : cb.resolve());
  _refreshQueue = [];
}

async function _attemptSilentRefresh(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Refresh failed");
  }
}

// ── Core Fetch Wrapper ────────────────────────────────────────────────────────

export async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {

  // 🚨 Guard-rail: prevent accidental full URLs
  if (endpoint.startsWith("http")) {
    throw new Error("❌ api() expects a relative path. Example: api('/projects')");
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  const started = performance.now()

  try {
    const csrfToken = getCookie("csrf_token");

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: "include", // §5.4: auto-send httpOnly cookies
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), // Double-submit CSRF
        ...(options.headers ?? {}),
      },
    });

    const elapsed = performance.now() - started
    if (import.meta.env.DEV && elapsed > 1500) {
      console.warn(`⚠️ API slow: ${endpoint} (${elapsed.toFixed(0)}ms)`)
    }

    if (!res.ok) {
      // §1.7 Silent Refresh: on 401, attempt a token refresh and retry once
      if (res.status === 401) {
        // Don't retry the refresh endpoint itself — that would loop forever
        if (endpoint === "/api/auth/refresh") {
          window.location.href = "/login";
          return Promise.reject(new Error("Session expired."));
        }

        if (_isRefreshing) {
          // Another request is already refreshing — queue this one
          return new Promise<T>((resolve, reject) => {
            _refreshQueue.push({
              resolve: () => api<T>(endpoint, options).then(resolve).catch(reject),
              reject,
            });
          });
        }

        _isRefreshing = true;
        try {
          await _attemptSilentRefresh();
          _processRefreshQueue(null);
          _isRefreshing = false;
          // Retry the original request (CSRF cookie was refreshed by /refresh)
          return api<T>(endpoint, options);
        } catch (refreshErr) {
          const err = new Error("Session expired. Please log in again.");
          _processRefreshQueue(err);
          _isRefreshing = false;
          window.location.href = "/login";
          return Promise.reject(err);
        }
      }
      
      let message = `${res.status} — ${res.statusText}`

      try {
        const body = await res.json();
        let extractedMessage = body?.detail || body?.message || message;
        
        // Handle FastAPI validation error arrays
        if (Array.isArray(extractedMessage)) {
          extractedMessage = extractedMessage
            .map((err: any) => `${err.loc?.[err.loc.length - 1] || 'Field'}: ${err.msg}`)
            .join(' | ');
        } else if (typeof extractedMessage === 'object') {
          extractedMessage = JSON.stringify(extractedMessage);
        }
        
        message = typeof extractedMessage === 'string' ? extractedMessage : String(extractedMessage);
      } catch {}

      toast({
        title: "API Error",
        description: message,
        variant: "destructive",
      })

      throw new Error(message)
    }

    return await res.json()
  }

  catch (err: any) {

    if (err?.name === "AbortError") {
      toast({
        title: "Request Timeout",
        description: "The AI is taking a bit longer than usual to synthesize your answer. Please wait a moment or try again.",
        variant: "destructive",
      })
    }

    else if (!navigator.onLine) {
      toast({
        title: "Offline",
        description: "You appear to be disconnected.",
      })
    }

    else {
      toast({
        title: "Network Error",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      })
    }

    if (import.meta.env.DEV) console.error("🌐 NETWORK ERROR", err)

    throw err
  }

  finally {
    clearTimeout(timeout)
  }
}
