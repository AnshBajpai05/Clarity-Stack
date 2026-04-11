from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, Field
from typing import List, Dict, Optional, Any
import time
import logging
import requests
import ssl
import socket
import json
from datetime import datetime
import httpx
import asyncio
from bs4 import BeautifulSoup
from urllib.parse import urlparse, unquote
import ipaddress
import aiohttp
import os
from dotenv import load_dotenv
import tldextract

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global Batch Semaphore
batch_semaphore = asyncio.Semaphore(10)

# API Keys
GOOGLE_SAFE_BROWSING_API_KEY = os.getenv("GOOGLE_SAFE_BROWSING_API_KEY", "")

app = FastAPI(title="ThreatLens — AI Phishing Detection API")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Model + Intel loading ---
detector = None
intel = None

@app.on_event("startup")
async def startup_load_model():
    global detector, intel
    # Load Threat Intelligence Engine (Tranco + brands.json)
    try:
        from threat_intel import ThreatIntelEngine
        intel = ThreatIntelEngine()
        logger.info("ThreatIntel engine loaded successfully")
    except Exception as e:
        logger.warning(f"ThreatIntel engine failed: {e}. Using inline fallbacks.")

    # Load ML Model
    try:
        from model import PhishingDetector
        model_path = "models/threatlens_v1.pt"
        if not os.path.exists(model_path):
            model_path = "models/phishing_detector.pt"
        if not os.path.exists(model_path):
            model_path = None
        detector = PhishingDetector(model_path=model_path, load_bert=True)
        logger.info("ThreatLens model loaded successfully")
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        try:
            from model import PhishingDetector
            detector = PhishingDetector(load_bert=True)
            logger.info("Model initialized without saved weights")
        except Exception as e2:
            logger.error(f"Could not initialize model at all: {e2}")


# ---- Request & Response Models ----

class URLRequest(BaseModel):
    url: str
    check_threat_intel: bool = Field(default=True, description="Whether to check threat intelligence APIs")

class BatchURLRequest(BaseModel):
    urls: List[str]
    check_threat_intel: bool = Field(default=True, description="Whether to check threat intelligence APIs")

class PredictRequest(BaseModel):
    url: str

class BatchPredictRequest(BaseModel):
    urls: List[str]

class SSLCertInfo(BaseModel):
    issuer: Dict[str, str]
    subject: Dict[str, str]
    version: int
    not_before: str
    not_after: str
    serial_number: str
    is_valid: bool

class ThreatIntelInfo(BaseModel):
    is_malicious: bool
    threat_types: List[str]
    confidence_score: float
    last_updated: str
    sources: List[str]
    security_checks: Dict[str, bool]

class URLMetadata(BaseModel):
    original_url: HttpUrl
    final_url: HttpUrl
    status_code: Optional[int]
    load_time: float  # seconds
    page_title: Optional[str]
    text_content: Optional[str]
    headers: Dict[str, str]
    domain_info: Dict[str, str]
    ssl_info: Optional[SSLCertInfo]
    threat_intel: Optional[ThreatIntelInfo]

# ---- SSL Certificate Functions ----

def get_ssl_cert_info(hostname: str) -> Optional[SSLCertInfo]:
    """Get SSL certificate information for a domain."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                # Convert issuer and subject to dictionaries
                issuer_dict = {}
                if isinstance(cert['issuer'], tuple):
                    for item in cert['issuer']:
                        if isinstance(item, tuple) and len(item) > 0:
                            if isinstance(item[0], tuple):
                                issuer_dict[item[0][0]] = item[0][1]
                            else:
                                issuer_dict[item[0]] = item[1] if len(item) > 1 else ""
                
                subject_dict = {}
                if isinstance(cert['subject'], tuple):
                    for item in cert['subject']:
                        if isinstance(item, tuple) and len(item) > 0:
                            if isinstance(item[0], tuple):
                                subject_dict[item[0][0]] = item[0][1]
                            else:
                                subject_dict[item[0]] = item[1] if len(item) > 1 else ""
                
                not_before = datetime.strptime(cert['notBefore'], '%b %d %H:%M:%S %Y %Z')
                not_after = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                
                return SSLCertInfo(
                    issuer=issuer_dict if issuer_dict else {"unknown": "unknown"},
                    subject=subject_dict if subject_dict else {"unknown": "unknown"},
                    version=cert.get('version', 0),
                    not_before=not_before.isoformat(),
                    not_after=not_after.isoformat(),
                    serial_number=str(cert.get('serialNumber', '0')),
                    is_valid=datetime.now() < not_after
                )
    except Exception as e:
        logger.error(f"Error getting SSL cert info: {str(e)}")
        return None

# ---- Threat Intelligence Functions ----

async def check_google_safe_browsing(url: str) -> Dict[str, Any]:
    """Check URL against Google Safe Browsing API."""
    if not GOOGLE_SAFE_BROWSING_API_KEY:
        logger.warning("Google Safe Browsing API key not configured")
        return None
        
    try:
        safe_browsing_url = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
        payload = {
            "client": {
                "clientId": "threatlens-api",
                "clientVersion": "1.0.0"
            },
            "threatInfo": {
                "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": url}]
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{safe_browsing_url}?key={GOOGLE_SAFE_BROWSING_API_KEY}", json=payload) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Google Safe Browsing API error: {response.status}")
                    return None
    except Exception as e:
        logger.error(f"Error checking Google Safe Browsing: {str(e)}")
        return None

def perform_security_checks(url: str, headers: Dict[str, str], ssl_info: Optional[SSLCertInfo]) -> Dict[str, bool]:
    """Perform various free security checks on the URL."""
    checks = {
        "has_ssl": False,
        "valid_ssl": False,
        "has_security_headers": False,
        "has_content_security_policy": False,
        "has_xss_protection": False,
        "has_frame_protection": False
    }
    
    if ssl_info:
        checks["has_ssl"] = True
        checks["valid_ssl"] = ssl_info.is_valid
    
    security_headers = {
        "Content-Security-Policy": "has_content_security_policy",
        "Content-Security-Policy-Report-Only": "has_content_security_policy",
        "X-XSS-Protection": "has_xss_protection",
        "X-Frame-Options": "has_frame_protection"
    }
    
    for header, check_key in security_headers.items():
        if header.lower() in [h.lower() for h in headers.keys()]:
            checks[check_key] = True
    
    checks["has_security_headers"] = any(checks[key] for key in ["has_content_security_policy", "has_xss_protection", "has_frame_protection"])
    
    return checks

def parse_threat_intel_results(google_sb_result: Dict, security_checks: Dict[str, bool]) -> ThreatIntelInfo:
    """Parse and combine results from threat intelligence APIs and security checks."""
    threat_types = []
    confidence_score = 0.0
    sources = []
    
    if google_sb_result:
        sources.append("Google Safe Browsing")
        if "matches" in google_sb_result:
            for match in google_sb_result["matches"]:
                threat_types.extend(match.get("threatType", []))
                confidence_score = max(confidence_score, 0.8)
    
    security_score = sum(1 for check in security_checks.values() if check) / len(security_checks)
    
    if not threat_types:
        confidence_score = max(confidence_score, 1.0 - security_score)
    
    return ThreatIntelInfo(
        is_malicious=len(threat_types) > 0 or (not threat_types and security_score < 0.3),
        threat_types=list(set(threat_types)),
        confidence_score=confidence_score,
        last_updated=datetime.now().isoformat(),
        sources=sources,
        security_checks=security_checks
    )

# ---- Core Scraping Function ----

async def scrape_url(url: str, check_threat_intel: bool = True) -> URLMetadata:
    """
    Uses httpx to fetch URL and extracts metadata for phishing detection.
    """
    try:
        logger.info(f"Fetching URL: {url}")
        start_time = time.time()
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        async with httpx.AsyncClient(verify=True) as client:
            # OPTIMIZED: Using 5s timeout for production-grade fast inference (Option A)
            response = await client.get(url, headers=headers, timeout=5, follow_redirects=True)
            load_time = time.time() - start_time
            
            final_url = str(response.url)
            status_code = response.status_code
            
            soup = BeautifulSoup(response.text, 'html.parser')
            title = soup.title.string if soup.title else None
            text_content = soup.get_text(separator='\n', strip=True)
            
            parsed_url = urlparse(final_url)
            domain_info = {
                'domain': parsed_url.netloc,
                'scheme': parsed_url.scheme,
                'path': parsed_url.path,
                'query': parsed_url.query,
                'fragment': parsed_url.fragment
            }
            
            ssl_info = get_ssl_cert_info(parsed_url.netloc)
            
            threat_intel = None
            if check_threat_intel:
                google_sb_result = await check_google_safe_browsing(url)
                security_checks = perform_security_checks(url, dict(response.headers), ssl_info)
                threat_intel = parse_threat_intel_results(google_sb_result, security_checks)
            
            logger.info(f"Successfully processed URL: {final_url}")
            
            return URLMetadata(
                original_url=url,
                final_url=final_url,
                status_code=status_code,
                load_time=load_time,
                page_title=title,
                text_content=text_content,
                headers=dict(response.headers),
                domain_info=domain_info,
                ssl_info=ssl_info,
                threat_intel=threat_intel
            )
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ---- Prediction Helper ----

async def run_prediction(url: str) -> Dict[str, Any]:
    """Production phishing detection: heuristics → ML → decision override."""
    start_time = time.time()
    reasons = []

    # Flag initialization
    extra_score = 0
    signal_count = 0.0
    is_ip = is_shortener = is_official = False
    has_mismatch = has_typo = has_keyword = has_subdomain_abuse = False
    has_bad_tld = has_stealth_pattern = False
    domain = subdomain = suffix = registered_domain = ""
    keywords = intel.keywords if intel else []  # Safe fallback for Phase 3
    brands = intel.brands if intel else []

    try:
        # ═══════════════════════════════════════
        # PHASE 1: Structural Heuristics
        # ═══════════════════════════════════════
        try:
            parsed = urlparse(url if url.startswith('http') else f"http://{url}")
            host = parsed.netloc.lower()
            path = parsed.path.lower()

            extracted = tldextract.extract(url)
            subdomain = extracted.subdomain.lower()
            domain = extracted.domain.lower()
            suffix = extracted.suffix.lower()
            registered_domain = f"{domain}.{suffix}" if suffix else domain

            # ── [PATCH] Open Redirect Detection ──
            unquoted_url = unquote(url)
            query_part = unquoted_url.split('?', 1)[-1] if '?' in unquoted_url else ''
            if "http://" in query_part or "https://" in query_part:
                extra_score += 45
                signal_count += 1
                reasons.append("Open Redirect detected (Nested URL)")
                # This ensures `is_official` evaluation below won't strictly protect it if we force it later.
                has_stealth_pattern = True 

            # ── [PATCH] Punycode / Homograph Trap ──
            if domain.startswith("xn--"):
                extra_score += 50
                signal_count += 1
                reasons.append("Punycode (Homograph) Attack Pattern")

            # ── 0. Reachability Check (Fast DNS Ping) ──
            reachability = "reachable"
            if host:
                host_clean = host.split(':')[0]
                try:
                    loop = asyncio.get_event_loop()
                    # 1.5s timeout for fast offline failure
                    await asyncio.wait_for(
                        loop.getaddrinfo(host_clean, None), 
                        timeout=1.5
                    )
                except socket.gaierror:
                    reachability = "unreachable"
                    extra_score += 15  # Penalty for NXDOMAIN
                    reasons.append("Domain Unreachable (NXDOMAIN)")
                except asyncio.TimeoutError:
                    reachability = "unreachable"
                    reasons.append("Verification Timeout (Server Unresponsive)")
                except Exception:
                    pass

            # ── 1. Shortener (suspicious only — not independently phishing) ──
            shorteners = {'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'buff.ly', 'ow.ly'}
            if host in shorteners or any(host.endswith(f".{s}") for s in shorteners):
                is_shortener = True
                signal_count += 1
                extra_score += 5  # Minimal — floor handles the rest
                reasons.append("URL shortener detected")

            # ── 2. IP Host ──
            if (any(c.isdigit() for c in host.replace('.', '').replace(':', ''))
                    and len(host.split('.')) == 4
                    and not any(c.isalpha() for c in host)):
                is_ip = True
                try:
                    ip_obj = ipaddress.ip_address(host.split(':')[0])
                    if ip_obj.is_private or ip_obj.is_loopback:
                        is_ip = False
                        extra_score -= 10  # Baseline safe boost for local
                        reasons.append("Private/Internal Network IP structure")
                except ValueError:
                    pass
                
                if is_ip:
                    extra_score += 95
                    reasons.append("IP-based host")

            # ── 3. Suspicious TLD (config-driven) ──
            _suspicious_tlds = intel.suspicious_tlds if intel else ['xyz', 'top', 'club', 'ninja', 'online', 'support', 'biz']
            has_bad_tld = suffix in _suspicious_tlds
            if has_bad_tld:
                signal_count += 1
                extra_score += 30
                reasons.append(f"Suspicious TLD (.{suffix})")

            # ── 4. Brand Protection (config-driven) ──
            # brands defined at top
            matched_brand = next((b for b in brands if b in host), None)

            # Dynamic popularity check (Tranco Top 10K) replaces hardcoded whitelist
            # Explicitly exclude shorteners because even popular shorteners host malware
            if intel and intel.is_popular(registered_domain) and not is_shortener:
                is_official = True
            elif not intel and domain in {'google', 'microsoft', 'microsoftonline', 'apple', 'amazon', 'facebook', 'github', 'dev', 'notion', 'slack', 'zoom', 'medium'} and not is_shortener:
                is_official = True  # Static fallback

            # Unconditionally evaluate subdomain abuse (Attack > Trust)
            if matched_brand:
                if matched_brand in subdomain and matched_brand != domain:
                    has_subdomain_abuse = True
                    signal_count += 1
                    extra_score += 50
                    reasons.append(f"Brand in subdomain ({matched_brand})")
                elif matched_brand != domain and not is_official:
                    has_mismatch = True
                    signal_count += 1
                    extra_score += 35
                    reasons.append(f"Brand impersonation ({matched_brand})")

            # ── Trust Override ──
            if has_stealth_pattern or has_subdomain_abuse:
                is_official = False
            # ── 5a. Digit Substitution Detection (g00gle, paypa1, faceb00k) ──
            if not is_official and not has_mismatch and not has_subdomain_abuse:
                digit_map = {'0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g'}
                normalized = ''.join(digit_map.get(c, c) for c in domain)
                if normalized != domain:
                    for b in brands:
                        if normalized == b:
                            has_typo = True
                            signal_count += 1.5
                            extra_score += 45
                            reasons.append(f"Digit substitution attack ({b})")
                            break

            # ── 5b. Levenshtein Typosquatting (fallback) ──
            if not is_official and not has_mismatch and not has_subdomain_abuse and not has_typo:
                def levenshtein(s1, s2):
                    if len(s1) < len(s2): return levenshtein(s2, s1)
                    if len(s2) == 0: return len(s1)
                    prev = range(len(s2) + 1)
                    for i, c1 in enumerate(s1):
                        curr = [i + 1]
                        for j, c2 in enumerate(s2):
                            curr.append(min(prev[j+1]+1, curr[j]+1, prev[j]+(c1!=c2)))
                        prev = curr
                    return prev[-1]

                for b in brands:
                    # Check the whole domain and hyphen-split pieces to catch 'arnazon-secure'
                    parts = [domain] + domain.split('-')
                    for part in parts:
                        dist = levenshtein(part, b)
                        if dist == 1:
                            has_typo = True
                            signal_count += 1
                            extra_score += 35
                            reasons.append(f"Typosquatting ({b})")
                            break
                        elif dist == 2:
                            has_typo = True
                            signal_count += 1
                            extra_score += 25
                            reasons.append(f"Deep typosquatting ({b})")
                            break
                    if has_typo:
                        break

            # ── 6. Stealth Phishing Domain Pattern (config-driven) ──
            # Catches: account-security-center.net, identity-check-service.com
            if not is_official:
                sec_terms = intel.sec_terms if intel else [
                    'login', 'verify', 'auth', 'secure', 'payment',
                    'billing', 'account', 'signin', 'identity',
                    'validation', 'confirm', 'access', 'session',
                    'maintenance', 'update', 'check', 'verification',
                    'security', 'notification', 'alert', 'resolution',
                    'subscription'
                ]
                stealth_words = intel.stealth_words if intel else ['service', 'center', 'portal', 'support', 'help']

                sec_count = sum(1 for t in sec_terms if t in domain)
                has_stealth_word = any(w in domain for w in stealth_words)

                if sec_count >= 2:
                    has_stealth_pattern = True
                    signal_count += 2
                    extra_score += 45
                    reasons.append(f"Stealth phishing: {sec_count} security terms in domain")
                elif sec_count == 1 and has_stealth_word:
                    has_stealth_pattern = True
                    signal_count += 1.5
                    extra_score += 40
                    reasons.append("Stealth phishing domain pattern")

            # ── 7. Keywords (CONTEXT ONLY — config-driven) ──
            # Keywords like "login" appear in legit URLs constantly.
            # Only boost score when paired with structural red flags.
            # keywords defined at top
            has_structural = (has_bad_tld or has_mismatch or has_subdomain_abuse
                              or has_typo or is_ip or has_stealth_pattern)
            if any(kw in path or kw in host for kw in keywords):
                has_keyword = True
                signal_count += 0.5
                if has_structural:
                    extra_score += 20
                    reasons.append("Keywords amplify structural risk")
                # NO boost when keywords appear alone (legit login pages)

            # ── 8. Shortener + Suspicious Content ──
            if is_shortener:
                brand_in_path = any(b in path for b in brands)
                kw_in_path = any(kw in path for kw in keywords)
                if brand_in_path or kw_in_path:
                    extra_score += 40
                    signal_count += 1
                    reasons.append("Suspicious content in shortened URL")

            # ── 9. Multi-Signal Synergy ──
            if signal_count >= 2.0:
                extra_score += 25
                reasons.append("Multi-signal synergy")

        except Exception as he:
            logger.warning(f"Heuristics error for {url}: {he}")

        # ═══════════════════════════════════════
        # PHASE 2: ML Pipeline
        # ═══════════════════════════════════════
        scores = {"fusion_score": 0.5, "llm_score": 0.5, "gnn_score": 0.5}
        metadata = None

        try:
            async with batch_semaphore:
                try:
                    metadata = await scrape_url(url, check_threat_intel=True)
                except:
                    pass  # Proceed with heuristics — DNS failure is NOT a blocker

            if detector is not None:
                formatted_text = f"URL String: {url} Domain: {domain}.{suffix}"
                url_data = {
                    'url': url,
                    'metadata': metadata if metadata else {
                        'domain_info': {'domain': domain},
                        'text_content': formatted_text
                    },
                    'verified_at': datetime.now().isoformat(),
                }
                scores = detector.predict(url_data)
        except Exception as mle:
            logger.warning(f"ML error for {url}: {mle}")

        # ═══════════════════════════════════════
        # PHASE 3: Decision Engine
        # ═══════════════════════════════════════
        fusion_score = scores.get('fusion_score', 0.5)

        # ML CALIBRATION: When URL has no structural red flags,
        # cap model contribution to prevent FPR on legit login pages.
        # The model overfits on "login page" content — this neutralizes that.
        has_any_signal = (has_bad_tld or has_mismatch or has_subdomain_abuse
                          or has_typo or is_ip or has_stealth_pattern or is_shortener)
        if not has_any_signal:
            fusion_score = min(fusion_score, 0.25)

        risk_score = (fusion_score * 100) + extra_score

        # Floor / Ceiling
        if is_shortener:
            risk_score = max(risk_score, 55)  # At least suspicious
            # Cap shorteners WITHOUT brand/keyword in path to suspicious range
            brand_in_path = any(b in path for b in brands) if 'path' in dir() else False
            kw_in_path = any(kw in path for kw in keywords) if 'path' in dir() else False
            if not brand_in_path and not kw_in_path:
                risk_score = min(risk_score, 60)  # Stay in suspicious, not phishing
        if is_ip: risk_score = 99.9
        risk_score = min(risk_score, 99.9)

        # Threshold verdict
        verdict = "safe"
        if risk_score < 30: verdict = "safe"
        elif risk_score < 65: verdict = "suspicious"
        else: verdict = "phishing"

        # Decision Override: structural confirmation → force phishing
        if ((has_mismatch or has_typo or has_subdomain_abuse or has_stealth_pattern)
                and signal_count >= 1.0):
            verdict = "phishing"

        # ── [PATCH] File Download Trap ──
        dangerous_exts = {'.exe', '.zip', '.scr', '.msi', '.sh', '.bat'}
        has_dangerous_file = any(ext in path for ext in dangerous_exts)

        # ── [PATCH] Hardened FPR Guard ──
        if is_official:
            if has_dangerous_file:
                # E.g. Github, GDrive hosting direct malware
                verdict = "suspicious" if verdict != "phishing" else "phishing"
                risk_score = max(risk_score, 64.0)
                reasons.append("Executable download hosted on trusted infrastructure")
            else:
                # Clean official domain
                verdict = "safe"
                risk_score = min(risk_score, 25.0)

        # Response
        return {
            "url": url,
            "is_phishing": verdict == "phishing",
            "risk_score": round(max(0.1, risk_score), 2),
            "risk_level": verdict,
            "verdict": verdict,
            "reachability": reachability,
            "reasons": reasons if reasons else ["Clear URL structure"],
            "latency_ms": round((time.time() - start_time) * 1000),
            "scores": {
                "gnn_score": round(scores.get('gnn_score', 0.5), 4),
                "llm_score": round(scores.get('llm_score', 0.5), 4),
                "fusion_score": round(scores.get('fusion_score', 0.5), 4),
            },
            "domain_info": {"domain": domain, "status_code": 200}
        }
    except Exception as fatal_e:
        logger.error(f"FATAL: {url}: {fatal_e}")
        return {
            "url": url,
            "verdict": "error",
            "risk_score": -1,
            "reasons": [f"System error: {str(fatal_e)}"]
        }


# ---- API Endpoints ----

# --- Prediction endpoints (new) ---

@app.post("/predict")
async def predict_url_endpoint(request: PredictRequest):
    """
    Analyze a URL for phishing using the GNN + LLM fusion model.
    
    Returns a structured verdict with risk score, confidence, and detailed
    security analysis including SSL, security headers, and threat intelligence.
    """
    try:
        result = await run_prediction(str(request.url))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in predict: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/batch", response_model=List[Dict[str, Any]])
async def predict_batch(request: BatchURLRequest):
    """
    Analyzes multiple URLs in parallel with concurrency limiting.
    """
    try:
        logger.info(f"Received batch prediction request for {len(request.urls)} URLs")
        tasks = [run_prediction(str(url)) for url in request.urls]
        # Use return_exceptions=True to ensure one failure doesn't kill the batch
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter and log any exceptions
        final_results = []
        for i, res in enumerate(results):
            if isinstance(res, Exception):
                logger.error(f"Error in batch prediction for URL {request.urls[i]}: {res}")
                final_results.append({
                    "url": str(request.urls[i]),
                    "error": str(res),
                    "verdict": "error",
                    "risk_score": -1
                })
            else:
                final_results.append(res)
                
        return final_results
    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Preprocessing endpoints (existing) ---

@app.post("/preprocess", response_model=URLMetadata)
async def preprocess_url(request: URLRequest):
    """
    Preprocesses the URL by:
      - Fetching the webpage
      - Extracting and returning various metadata required for phishing detection.
      - Checking SSL certificate information
      - Checking threat intelligence databases
    
    The output JSON includes final URL after redirects, page content,
    HTTP headers, domain information, SSL certificate info, and threat intelligence data.
    """
    try:
        logger.info(f"Received request to preprocess URL: {request.url}")
        result = await scrape_url(
            str(request.url),
            request.check_threat_intel
        )
        return result
    except Exception as e:
        logger.error(f"Error in preprocess_url: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/preprocess/batch", response_model=List[URLMetadata])
async def preprocess_urls_batch(request: BatchURLRequest):
    """
    Preprocesses multiple URLs in parallel.
    """
    try:
        logger.info(f"Received batch request for {len(request.urls)} URLs")
        tasks = [
            scrape_url(
                str(url),
                request.check_threat_intel
            )
            for url in request.urls
        ]
        results = await asyncio.gather(*tasks)
        return results
    except Exception as e:
        logger.error(f"Error in preprocess_urls_batch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/preprocess")
async def preprocess_url_get(url: str, check_threat_intel: bool = True):
    """
    GET endpoint for testing URL preprocessing.
    
    Parameters:
    - url: The URL to check (must be URL encoded)
    - check_threat_intel: Whether to check threat intelligence APIs (default: True)
    
    Example:
    /preprocess?url=https%3A%2F%2Fexample.com&check_threat_intel=true
    """
    try:
        logger.info(f"Received GET request to preprocess URL: {url}")
        result = await scrape_url(
            url,
            check_threat_intel
        )
        return result
    except Exception as e:
        logger.error(f"Error in preprocess_url_get: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/preprocess/batch")
async def preprocess_urls_batch_get(urls: str, check_threat_intel: bool = True):
    """
    GET endpoint for testing batch URL preprocessing.
    
    Parameters:
    - urls: Comma-separated list of URLs to check (must be URL encoded)
    - check_threat_intel: Whether to check threat intelligence APIs (default: True)
    """
    try:
        url_list = [url.strip() for url in urls.split(",")]
        logger.info(f"Received GET batch request for {len(url_list)} URLs")
        tasks = [
            scrape_url(
                url,
                check_threat_intel
            )
            for url in url_list
        ]
        results = await asyncio.gather(*tasks)
        return results
    except Exception as e:
        logger.error(f"Error in preprocess_urls_batch_get: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Health / Root ---

@app.get("/")
async def root():
    """Root endpoint with API information."""
    model_status = "loaded" if detector is not None else "not loaded"
    return {
        "name": "ThreatLens — AI Phishing Detection API",
        "version": "1.0.0",
        "status": "online",
        "model_status": model_status,
        "endpoints": {
            "/predict": {
                "methods": ["POST"],
                "description": "Analyze a URL for phishing (ML model)",
            },
            "/predict/batch": {
                "methods": ["POST"],
                "description": "Analyze multiple URLs for phishing",
            },
            "/preprocess": {
                "methods": ["GET", "POST"],
                "description": "Extract URL metadata without ML prediction",
            },
            "/preprocess/batch": {
                "methods": ["GET", "POST"],
                "description": "Extract metadata for multiple URLs",
            },
            "/docs": "Interactive API documentation (Swagger UI)",
        },
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": detector is not None,
        "timestamp": datetime.now().isoformat(),
    }