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
    deep_scan: bool = Field(default=False, description="Whether to perform a full metadata scrape (SSL, headers)")

class BatchPredictRequest(BaseModel):
    urls: List[str]
    force_deep: bool = Field(default=False, description="Whether to force deep scan on all URLs")

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

async def resolve_redirect(url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.head(url, follow_redirects=False)
            if 300 <= res.status_code < 400:
                return res.headers.get("location")
            res = await client.get(url, follow_redirects=False)
            if 300 <= res.status_code < 400:
                return res.headers.get("location")
            res = await client.get(url, follow_redirects=True)
            if str(res.url) != url:
                return str(res.url)
    except:
        return None

def get_confidence(score: float, reasons: list, analysis_mode: str, graph_signal: str) -> str:
    SAFE_SIGNALS = {"Clear URL structure", "Verified Trusted Infrastructure (Fast-Path)"}
    threat_signals = len([r for r in reasons if r not in SAFE_SIGNALS])
    
    if score < 50:
        if analysis_mode == "FULL" and graph_signal == "strong":
            return "high"
        return "low"
    
    if score >= 65:
        if threat_signals >= 2 or score >= 90:
            return "high"
        if analysis_mode == "OFFLINE" or graph_signal == "weak":
            return "medium"
        return "high"
        
    return "medium"

async def run_prediction(url: str, force_deep: bool = False) -> Dict[str, Any]:
    """Production phishing detection: heuristics → ML → decision override."""
    start_time = time.time()
    reasons = []

    # Ensure URL has protocol to avoid httpx crashes
    if not url.startswith(('http://', 'https://')):
        url = f"http://{url}"

    # --- REDIRECT RESOLUTION ---
    original_url = url
    resolved_url = await resolve_redirect(url) or url
    
    extra_score = 0
    if resolved_url != original_url:
        orig_ext = tldextract.extract(original_url)
        res_ext = tldextract.extract(resolved_url)
        orig_domain = f"{orig_ext.domain}.{orig_ext.suffix}"
        res_domain = f"{res_ext.domain}.{res_ext.suffix}"
        if orig_domain != res_domain and res_domain != ".":
            reasons.append("Redirects to external destination [+15]")
            extra_score += 15
        if not resolved_url.startswith('http'):
            from urllib.parse import urljoin
            resolved_url = urljoin(original_url, resolved_url)
        url = resolved_url 
        
    # Flag initialization
    signal_count = 0.0
    is_ip = is_shortener = is_official = False
    has_mismatch = has_typo = has_keyword = has_subdomain_abuse = False
    has_bad_tld = has_stealth_pattern = False
    keywords = intel.keywords if intel else []
    brands = intel.brands if intel else []

    # ═══════════════════════════════════════
    # PHASE 1: Structural Heuristics
    # ═══════════════════════════════════════
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
        extracted = tldextract.extract(url)
        subdomain = extracted.subdomain.lower()
        domain = extracted.domain.lower()
        suffix = extracted.suffix.lower()
        registered_domain = f"{domain}.{suffix}" if suffix else domain

        # -- Open Redirect --
        unquoted_url = unquote(url)
        query_part = unquoted_url.split('?', 1)[-1] if '?' in unquoted_url else ''
        if "http://" in query_part or "https://" in query_part:
            extra_score += 45
            signal_count += 1
            reasons.append("Open Redirect detected (Nested URL) [+45]")
            has_stealth_pattern = True 

        # -- Punycode --
        if domain.startswith("xn--"):
            extra_score += 50
            signal_count += 1
            reasons.append("Punycode (Homograph) Attack Pattern [+50]")

        # -- Reachability --
        reachability = "reachable"
        if host:
            host_clean = host.split(':')[0]
            try:
                loop = asyncio.get_event_loop()
                await asyncio.wait_for(loop.getaddrinfo(host_clean, None), timeout=1.5)
            except (socket.gaierror, asyncio.TimeoutError):
                reachability = "unreachable"
                extra_score += 15
                reasons.append("Domain Unreachable (NXDOMAIN) [+15]")
            except Exception: pass

        # -- Shortener --
        shorteners = {'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'buff.ly', 'ow.ly'}
        if host in shorteners or any(host.endswith(f".{s}") for s in shorteners):
            is_shortener = True
            signal_count += 1
            extra_score += 5
            reasons.append("URL shortener detected [+5]")

        # -- IP Host --
        if (any(c.isdigit() for c in host.replace('.', '').replace(':', ''))
                and len(host.split('.')) == 4
                and not any(c.isalpha() for c in host)):
            is_ip = True
            try:
                ip_obj = ipaddress.ip_address(host.split(':')[0])
                if not (ip_obj.is_private or ip_obj.is_loopback):
                    extra_score += 95
                    reasons.append("IP-based host [+95]")
            except ValueError: pass

        # -- TLD --
        _suspicious_tlds = intel.suspicious_tlds if intel else ['xyz', 'top', 'club', 'ninja', 'online', 'biz']
        if suffix in _suspicious_tlds:
            signal_count += 1
            extra_score += 30
            reasons.append(f"Suspicious TLD (.{suffix}) [+30]")

        # -- Brand --
        matched_brand = next((b for b in brands if b in host), None)
        if intel and intel.is_popular(registered_domain) and not is_shortener:
            is_official = True
        elif not intel and domain in {'google', 'amazon', 'microsoft', 'apple', 'facebook', 'github'} and not is_shortener:
            is_official = True

        if matched_brand and not is_official:
            if matched_brand in subdomain and matched_brand != domain:
                has_subdomain_abuse = True
                extra_score += 50
                reasons.append(f"Brand in subdomain ({matched_brand}) [+50]")
            elif matched_brand != domain:
                has_mismatch = True
                extra_score += 35
                reasons.append(f"Brand impersonation ({matched_brand}) [+35]")

        # -- Digit Sub --
        if not is_official and not has_mismatch:
            digit_map = {'0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '8': 'b'}
            normalized = ''.join(digit_map.get(c, c) for c in domain)
            if normalized != domain and any(b == normalized for b in brands):
                has_typo = True
                extra_score += 45
                reasons.append("Digit substitution attack [+45]")

        # -- Levenshtein --
        if not is_official and not has_mismatch and not has_typo:
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
                if levenshtein(domain, b) <= 2:
                    has_typo = True
                    extra_score += 30
                    reasons.append(f"Typosquatting detected ({b}) [+30]")
                    break

        # -- Keywords --
        if any(kw in path or kw in host for kw in keywords):
            signal_count += 0.5
            if extra_score > 0:
                extra_score += 20
                reasons.append("Keywords amplify structural risk [+20]")

    except Exception as he:
        logger.warning(f"Heuristics error for {url}: {he}")

    # ═══════════════════════════════════════
    # PHASE 1.5: Trusted Infrastructure Fast-Path
    # ═══════════════════════════════════════
    TRUSTED_ROOTS = {
        "google.com", "github.com", "amazon.com", "microsoft.com", 
        "apple.com", "linkedin.com", "chatgpt.com", "openai.com", 
        "cloudflare.com", "youtube.com", "netflix.com"
    }
    root_domain = f"{domain}.{suffix}".lower()
    
    if root_domain in TRUSTED_ROOTS and signal_count == 0:
        scores = {"gnn_score": 0.08, "llm_score": 0.05, "fusion_score": 0.06}
        extra_score = 0
        has_any_signal = False
        reasons = ["Verified Trusted Infrastructure (Fast-Path)"]
        effective_fusion = scores["fusion_score"]
        risk_score = 1.0
        goto_phase_3 = True
    else:
        goto_phase_3 = False

    # ═══════════════════════════════════════
    # PHASE 2: ML Pipeline
    # ═══════════════════════════════════════
    metadata = None
    if not goto_phase_3:
        scores = {"fusion_score": 0.5, "llm_score": 0.5, "gnn_score": 0.5}
        try:
            async with batch_semaphore:
                try: metadata = await scrape_url(url, check_threat_intel=True)
                except: pass
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
    if not goto_phase_3:
        has_any_signal = (has_bad_tld or has_mismatch or has_subdomain_abuse
                          or has_typo or is_ip or has_stealth_pattern or is_shortener)
        gnn_score = scores.get('gnn_score', 0.5)
        llm_score = scores.get('llm_score', 0.5)
        fusion_score = scores.get('fusion_score', 0.5)
        if llm_score < 0.05:
            effective_fusion = gnn_score * 0.7 + 0.5 * 0.3
            scores['fusion_score'] = effective_fusion
            scores['llm_score'] = 0.0
        else:
            effective_fusion = fusion_score

        if not has_any_signal:
            effective_fusion = min(effective_fusion, 0.25)
        risk_score = (effective_fusion * 100) + extra_score

    # Floor / Ceiling
    if is_shortener:
        risk_score = max(risk_score, 55)
        brand_in_path = any(b in path for b in brands)
        kw_in_path = any(kw in path for kw in keywords)
        if not brand_in_path and not kw_in_path:
            risk_score = min(risk_score, 60)
    if is_ip: risk_score = 99.9
    risk_score = min(risk_score, 99.9)

    verdict = "safe"
    if risk_score < 30: verdict = "safe"
    elif risk_score < 65: verdict = "suspicious"
    else: verdict = "phishing"

    if (has_mismatch or has_typo or has_subdomain_abuse or has_stealth_pattern) and signal_count >= 1.0:
        verdict = "phishing"

    analysis_mode = "FULL"
    if reachability == "unreachable":
        analysis_mode = "OFFLINE"
    elif not goto_phase_3 and llm_score < 0.05:
        analysis_mode = "RESTRICTED"
        
    unused_signals = []
    if analysis_mode == "OFFLINE":
        unused_signals.extend(["Content Intelligence (Offline)", "External Threat Feeds (Offline)", "Network Metatdata (Offline)"])
    elif analysis_mode == "RESTRICTED":
        unused_signals.append("Content Intelligence (Bot Blocked)")
        
    attack_types = []
    if verdict == "phishing":
        if has_mismatch: attack_types.append("Brand Impersonation")
        if has_typo: attack_types.append("Typosquatting")
        if has_stealth_pattern: attack_types.append("Redirect-based Phishing")
        if has_subdomain_abuse: attack_types.append("Subdomain Abuse")
        if is_shortener: attack_types.append("URL Obfuscation")
        if not attack_types: attack_types.append("Heuristic Pattern Match")

    final_reasons = reasons if reasons else ["Clear URL structure"]
    return {
        "url": original_url,
        "resolved_url": url if url != original_url else None,
        "is_phishing": verdict == "phishing",
        "risk_score": round(max(0.1, risk_score), 2),
        "risk_level": verdict,
        "verdict": verdict,
        "confidence": get_confidence(risk_score, final_reasons, analysis_mode, scores.get('graph_signal', 'unknown')),
        "reachability": reachability,
        "analysis_mode": analysis_mode,
        "reasons": final_reasons,
        "attack_types": attack_types,
        "unused_signals": unused_signals,
        "latency_ms": round((time.time() - start_time) * 1000),
        "score_breakdown": {
            "base_score": round(effective_fusion * 100, 1),
            "heuristic_boost": round(float(extra_score), 1),
            "final_score": round(max(0.1, risk_score), 2)
        },
        "scores": {
            "gnn_score": round(scores.get('gnn_score', 0.5), 4),
            "llm_score": round(scores.get('llm_score', 0.5), 4),
            "fusion_score": round(scores.get('fusion_score', 0.5), 4),
            "graph_node_count": scores.get('graph_node_count', 0),
            "graph_signal": scores.get('graph_signal', 'unknown')
        },
        "evidence": {
            "structural_impact": round(effective_fusion * 100, 1),
            "scraping_status": "blocked" if (not goto_phase_3 and llm_score < 0.05) else "success" if (not goto_phase_3) else "fast-path",
            "signal_reliability": {
                "structural": "STRONG" if scores.get('graph_signal') == 'strong' else "WEAK",
                "content": "UNAVAILABLE" if analysis_mode in {"RESTRICTED", "OFFLINE"} else "STRONG",
                "network": "UNAVAILABLE" if reachability == "unreachable" else "AVAILABLE"
            }
        },
        "domain_info": {"domain": domain, "status_code": metadata.status_code if metadata else None},
        "ssl_info": metadata.ssl_info.dict() if metadata and metadata.ssl_info else None,
        "threat_intel": metadata.threat_intel.dict() if metadata and metadata.threat_intel else None,
        "security_headers": {
            "has_ssl": url.startswith("https"),
            "valid_ssl": url.startswith("https") and reachability == "reachable",
            "has_content_security_policy": metadata.headers.get('Content-Security-Policy') is not None if metadata else False,
            "has_xss_protection": metadata.headers.get('X-XSS-Protection') is not None if metadata else False,
            "has_frame_protection": metadata.headers.get('X-Frame-Options') is not None if metadata else False,
        }
    }


# ---- API Endpoints ----

@app.post("/predict")
async def predict_url_endpoint(request: PredictRequest):
    try:
        result = await run_prediction(str(request.url), force_deep=request.deep_scan)
        return result
    except Exception as e:
        logger.error(f"Error in predict: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/batch")
async def predict_batch(request: BatchPredictRequest):
    try:
        tasks = [run_prediction(str(url), force_deep=request.force_deep) for url in request.urls]
        return await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        logger.error(f"Batch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": detector is not None, "timestamp": datetime.now().isoformat()}

@app.get("/")
async def root():
    return {"name": "ThreatLens API", "status": "online", "port": 8004}