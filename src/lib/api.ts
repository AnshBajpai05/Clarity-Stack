export interface ApiPrediction {
  url: string;
  resolved_url?: string | null;
  is_phishing: boolean;
  risk_score: number;
  risk_level: string;
  verdict: string;
  confidence: string;  // "high" | "medium" | "low"
  reachability?: string;
  analysis_mode?: "OFFLINE" | "RESTRICTED" | "FULL";
  reasons: string[];
  attack_types?: string[];
  unused_signals?: string[];
  latency_ms?: number;
  score_breakdown?: {
    base_score: number;
    heuristic_boost: number;
    final_score: number;
  };
  scores: {
    gnn_score: number; 
    llm_score: number; 
    fusion_score: number;
    graph_node_count?: number;
    graph_signal?: "strong" | "weak" | "unknown";
  };
  evidence?: {
    structural_impact: number;
    scraping_status: "success" | "blocked" | "fast-path";
    signal_reliability?: {
      structural: string;
      content: string;
      network: string;
    };
  };
  domain_info: { domain: string; status_code?: number | null; load_time?: number };
  // Legacy fields
  final_url?: string;
  ssl_info?: { issuer: string; subject: string; not_before: string; not_after: string; is_valid: boolean } | null;
  security_headers?: { has_ssl: boolean; valid_ssl: boolean; has_content_security_policy: boolean; has_xss_protection: boolean; has_frame_protection: boolean } | null;
  threat_intel?: { is_malicious: boolean; threat_types: string[]; confidence_score: number; sources: string[]; last_updated: string } | null;
  analysis_time?: number;
}

// Normalized type used throughout the app
export interface ScanResult {
  url: string;
  finalUrl: string;
  domain: string;
  riskScore: number;
  verdict: "SAFE" | "SUSPICIOUS" | "PHISHING";
  confidence: string; // "high" | "medium" | "low"
  confidenceNum: number; // 0-100 for display gauges
  reasons: string[];
  attackTypes: string[];
  unusedSignals: string[];
  resolvedUrl: string | null;
  reachability: string;
  analysisMode: "OFFLINE" | "RESTRICTED" | "FULL";
  hasDetailedData: boolean;
  scoreBreakdown: ApiPrediction["score_breakdown"] | null;
  gnnScore: number;
  llmScore: number;
  fusionScore: number;
  graphSignal: "strong" | "weak" | "unknown";
  evidence: ApiPrediction["evidence"] | null;
  ssl: { issuer: string; validFrom: string; validTo: string; valid: boolean } | null;
  headers: { csp: boolean; xssProtection: boolean; frameProtection: boolean; hasSsl: boolean; validSsl: boolean };
  threatIntel: { isMalicious: boolean; threatTypes: string[]; confidence: number; sources: string[]; lastUpdated: string } | null;
  loadTime: number;
  httpStatus: number | null;
  timestamp: string;
  analysisTime: number;
}

const BASE_URL = import.meta.env.VITE_API_URL || "";

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
  const verdictMap: Record<string, ScanResult["verdict"]> = { safe: "SAFE", suspicious: "SUSPICIOUS", phishing: "PHISHING", error: "SUSPICIOUS" };
  const confidenceToNum = (c: string) => c === "high" ? 95 : c === "medium" ? 65 : 35;
  const hasDetailedData = !!(api.security_headers);

  return {
    url: api.url,
    finalUrl: api.resolved_url || api.final_url || api.url,
    resolvedUrl: api.resolved_url || null,
    domain: api.domain_info?.domain || new URL(api.url.startsWith("http") ? api.url : `https://${api.url}`).hostname,
    riskScore: Math.max(1, Math.round(api.risk_score)),
    verdict: verdictMap[api.verdict || api.risk_level] || "SUSPICIOUS",
    confidence: api.confidence as string,
    confidenceNum: typeof api.confidence === "string" ? confidenceToNum(api.confidence) : 50,
    reasons: api.reasons || [],
    attackTypes: api.attack_types || [],
    unusedSignals: api.unused_signals || [],
    reachability: api.reachability || "unknown",
    analysisMode: api.analysis_mode || "FULL",
    hasDetailedData,
    scoreBreakdown: api.score_breakdown || null,
    gnnScore: Math.round((api.scores?.gnn_score ?? 0.5) * 100),
    llmScore: Math.round((api.scores?.llm_score ?? 0.5) * 100),
    fusionScore: Math.round((api.scores?.fusion_score ?? 0.5) * 100),
    graphSignal: api.scores?.graph_signal || "unknown",
    evidence: api.evidence || null,
    ssl: api.ssl_info
      ? {
          issuer: typeof api.ssl_info.issuer === 'string'
            ? api.ssl_info.issuer
            : (api.ssl_info.issuer as any)?.organizationName || (api.ssl_info.issuer as any)?.commonName || 'Unknown',
          validFrom: api.ssl_info.not_before,
          validTo: api.ssl_info.not_after,
          valid: api.ssl_info.is_valid,
        }
      : api.security_headers?.has_ssl
        ? { issuer: "Verified (HTTPS)", validFrom: "—", validTo: "—", valid: true }
        : null,
    headers: {
      csp: api.security_headers?.has_content_security_policy ?? false,
      xssProtection: api.security_headers?.has_xss_protection ?? false,
      frameProtection: api.security_headers?.has_frame_protection ?? false,
      hasSsl: api.security_headers?.has_ssl ?? (api.resolved_url || api.url || "").startsWith("https"),
      validSsl: api.security_headers?.valid_ssl ?? (api.resolved_url || api.url || "").startsWith("https"),
    },
    threatIntel: api.threat_intel
      ? { isMalicious: api.threat_intel.is_malicious, threatTypes: api.threat_intel.threat_types, confidence: api.threat_intel.confidence_score * 100, sources: api.threat_intel.sources, lastUpdated: api.threat_intel.last_updated }
      : null,
    loadTime: api.domain_info?.load_time ?? 0,
    httpStatus: api.domain_info?.status_code ?? null,
    timestamp: new Date().toISOString(),
    analysisTime: api.analysis_time ?? (api.latency_ms ? api.latency_ms / 1000 : 0),
  };
}

// ---- API methods ----

export async function checkApiStatus(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/health`, { method: "GET" }, 5000);
    const data = await res.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}

export async function predictUrl(url: string, deepScan: boolean = false): Promise<ScanResult> {
  const res = await fetchWithTimeout(`${BASE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, deep_scan: deepScan }),
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
  const confidenceLabel: string = riskScore <= 15 || riskScore >= 85 ? "high" : riskScore >= 40 && riskScore <= 60 ? "low" : "medium";
  const confidenceNum = riskScore <= 15 || riskScore >= 85 ? 95 : riskScore >= 40 && riskScore <= 60 ? 35 : 65;
  let domain: string;
  try { domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { domain = url; }
  const baseScore = Math.round(riskScore * 0.4);
  const heuristicBoost = riskScore - baseScore;
  return {
    url: url.startsWith("http") ? url : `https://${url}`,
    finalUrl: url.startsWith("http") ? url : `https://${url}`,
    resolvedUrl: null,
    domain,
    riskScore,
    verdict: verdictMap[riskLevel],
    confidence: confidenceLabel,
    confidenceNum,
    reasons: isSafe ? ["Clear URL structure"] : isDangerous ? ["Suspicious TLD [+30]", "Brand impersonation [+35]"] : ["URL shortener detected [+5]"],
    attackTypes: isDangerous ? ["Brand Impersonation"] : [],
    unusedSignals: [],
    reachability: "reachable",
    analysisMode: "FULL",
    hasDetailedData: true,
    scoreBreakdown: { base_score: baseScore, heuristic_boost: heuristicBoost, final_score: riskScore },
    gnnScore: Math.round(riskScore * 0.9 + Math.random() * 10),
    llmScore: Math.round(riskScore * 1.05 + Math.random() * 5),
    fusionScore: riskScore,
    graphSignal: "strong",
    evidence: {
      structural_impact: baseScore,
      scraping_status: "success" as const,
      signal_reliability: { structural: "STRONG", content: "STRONG", network: "AVAILABLE" },
    },
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
