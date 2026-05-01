// src/api/http.ts
import { toast } from "@/hooks/use-toast"

const API_BASE_URL = "http://127.0.0.1:8000"

export async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {

  // 🚨 Guard-rail: prevent accidental full URLs
  if (endpoint.startsWith("http")) {
    throw new Error("❌ api() expects a relative path. Example: api('/projects')");
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  const started = performance.now()

  try {
    const token = localStorage.getItem("token"); // 🔥 GET TOKEN

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",

        // 🔥 ADD THIS LINE
        Authorization: token ? `Bearer ${token}` : "",

        ...(options.headers ?? {}),
      },
    });

    const elapsed = performance.now() - started
    if (import.meta.env.DEV && elapsed > 1500) {
      console.warn(`⚠️ API slow: ${endpoint} (${elapsed.toFixed(0)}ms)`)
    }

    if (!res.ok) {
      let message = `${res.status} — ${res.statusText}`

      try {
        const body = await res.json()
        message = body?.detail || body?.message || message
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
        title: "Timeout",
        description: "Server took too long to respond.",
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
