// API response types matching the backend
export interface ApiPrediction {
  url: string;
  final_url: string;
  is_phishing: boolean;
  confidence: number;
  risk_score: number;
  risk_level: "safe" | "suspicious" | "phishing";
  scores: { gnn_score: number; llm_score: number; fusion_score: number };
  ssl_info: { issuer: string; subject: string; not_before: string; not_after: string; is_valid: boolean } | null;
  security_headers: { has_ssl: boolean; valid_ssl: boolean; has_content_security_policy: boolean; has_xss_protection: boolean; has_frame_protection: boolean };
  threat_intel: { is_malicious: boolean; threat_types: string[]; confidence_score: number; sources: string[]; last_updated: string } | null;
  domain_info: { domain: string; scheme: string; path: string; load_time: number; status_code: number };
  analysis_time: number;
}

// Normalized type used throughout the app
export interface ScanResult {
  url: string;
  finalUrl: string;
  domain: string;
  riskScore: number;
  verdict: "SAFE" | "SUSPICIOUS" | "PHISHING";
  confidence: number;
  gnnScore: number;
  llmScore: number;
  fusionScore: number;
  ssl: { issuer: string; validFrom: string; validTo: string; valid: boolean } | null;
  headers: { csp: boolean; xssProtection: boolean; frameProtection: boolean; hasSsl: boolean; validSsl: boolean };
  threatIntel: { isMalicious: boolean; threatTypes: string[]; confidence: number; sources: string[]; lastUpdated: string } | null;
  loadTime: number;
  httpStatus: number;
  timestamp: string;
  analysisTime: number;
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new ApiError(`API error: ${res.status}`, res.status);
    return res;
  } catch (e: any) {
    if (e.name === "AbortError") throw new ApiError("Request timed out (30s)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function mapApiToScanResult(api: ApiPrediction): ScanResult {
  const verdictMap: Record<string, ScanResult["verdict"]> = { safe: "SAFE", suspicious: "SUSPICIOUS", phishing: "PHISHING" };
  return {
    url: api.url,
    finalUrl: api.final_url,
    domain: api.domain_info.domain,
    riskScore: Math.round(api.risk_score),
    verdict: verdictMap[api.risk_level] || "SUSPICIOUS",
    confidence: Math.round(api.confidence * 100),
    gnnScore: Math.round(api.scores.gnn_score * 100),
    llmScore: Math.round(api.scores.llm_score * 100),
    fusionScore: Math.round(api.scores.fusion_score * 100),
    ssl: api.ssl_info
      ? { issuer: api.ssl_info.issuer, validFrom: api.ssl_info.not_before, validTo: api.ssl_info.not_after, valid: api.ssl_info.is_valid }
      : null,
    headers: {
      csp: api.security_headers.has_content_security_policy,
      xssProtection: api.security_headers.has_xss_protection,
      frameProtection: api.security_headers.has_frame_protection,
      hasSsl: api.security_headers.has_ssl,
      validSsl: api.security_headers.valid_ssl,
    },
    threatIntel: api.threat_intel
      ? { isMalicious: api.threat_intel.is_malicious, threatTypes: api.threat_intel.threat_types, confidence: api.threat_intel.confidence_score * 100, sources: api.threat_intel.sources, lastUpdated: api.threat_intel.last_updated }
      : null,
    loadTime: api.domain_info.load_time,
    httpStatus: api.domain_info.status_code,
    timestamp: new Date().toISOString(),
    analysisTime: api.analysis_time,
  };
}

// ---- API methods ----

export async function checkApiStatus(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/`, { method: "GET" }, 5000);
    const data = await res.json();
    return !!data.name;
  } catch {
    return false;
  }
}

export async function predictUrl(url: string): Promise<ScanResult> {
  const res = await fetchWithTimeout(`${BASE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data: ApiPrediction = await res.json();
  return mapApiToScanResult(data);
}

export async function predictBatch(urls: string[]): Promise<ScanResult[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/predict/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  const data: ApiPrediction[] = await res.json();
  return data.map(mapApiToScanResult);
}

// ---- Demo mode ----

function demoDelay() {
  return new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
}

function makeDemoResult(url: string, riskScore: number, riskLevel: "safe" | "suspicious" | "phishing"): ScanResult {
  const verdictMap: Record<string, ScanResult["verdict"]> = { safe: "SAFE", suspicious: "SUSPICIOUS", phishing: "PHISHING" };
  const isSafe = riskLevel === "safe";
  const isDangerous = riskLevel === "phishing";
  let domain: string;
  try { domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { domain = url; }
  return {
    url: url.startsWith("http") ? url : `https://${url}`,
    finalUrl: url.startsWith("http") ? url : `https://${url}`,
    domain,
    riskScore,
    verdict: verdictMap[riskLevel],
    confidence: isSafe ? 96 : isDangerous ? 94 : 72,
    gnnScore: Math.round(riskScore * 0.9 + Math.random() * 10),
    llmScore: Math.round(riskScore * 1.05 + Math.random() * 5),
    fusionScore: riskScore,
    ssl: isSafe
      ? { issuer: "DigiCert Inc", validFrom: "2024-03-01", validTo: "2025-03-01", valid: true }
      : isDangerous ? null : { issuer: "Let's Encrypt", validFrom: "2024-06-15", validTo: "2024-09-15", valid: false },
    headers: {
      csp: isSafe,
      xssProtection: isSafe || !isDangerous,
      frameProtection: isSafe,
      hasSsl: !isDangerous,
      validSsl: isSafe,
    },
    threatIntel: isDangerous
      ? { isMalicious: true, threatTypes: ["SOCIAL_ENGINEERING", "PHISHING"], confidence: 92, sources: ["Google Safe Browsing", "PhishTank"], lastUpdated: new Date().toISOString() }
      : isSafe
        ? { isMalicious: false, threatTypes: [], confidence: 98, sources: ["Google Safe Browsing"], lastUpdated: new Date().toISOString() }
        : null,
    loadTime: 0.3 + Math.random() * 1.5,
    httpStatus: isDangerous ? 403 : 200,
    timestamp: new Date().toISOString(),
    analysisTime: 0.5 + Math.random() * 1.0,
  };
}

export async function demoPredictUrl(url: string): Promise<ScanResult> {
  await demoDelay();
  const lower = url.toLowerCase();
  if (/google\.com|github\.com|microsoft\.com|apple\.com/.test(lower)) {
    return makeDemoResult(url, 8, "safe");
  }
  if (/paypal.*verify|secure.*login|\.tk$|\.ml$|\.ga$|amaz0n|faceb00k|micr0soft/.test(lower)) {
    return makeDemoResult(url, 92, "phishing");
  }
  const suspScore = 45 + Math.floor(Math.random() * 21);
  return makeDemoResult(url, suspScore, "suspicious");
}

export async function demoPredictBatch(urls: string[]): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (const u of urls) {
    results.push(await demoPredictUrl(u));
  }
  return results;
}

// ---- localStorage ----

export function isValidUrl(input: string): boolean {
  try {
    const url = input.startsWith("http") ? input : `https://${input}`;
    new URL(url);
    return true;
  } catch { return false; }
}

const STORAGE_KEY = "threatlens_scans";

export function getRecentScans(): ScanResult[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

export function saveScan(result: ScanResult) {
  const scans = getRecentScans();
  scans.unshift(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans.slice(0, 50)));
}
