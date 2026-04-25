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
from urllib.parse import urlparse, unquote, parse_qs
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

# Cache of the most recent scan result — used by /export/siem
_last_result: Dict[str, Any] = {}

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

import re

def tokenize_domain(domain_str):
    domain_str = domain_str.lower()
    tokens = re.split(r"[.\-]", domain_str)
    return [t for t in tokens if t]

SUSPICIOUS_WORDS = [
    "login", "secure", "verify", "update",
    "account", "bank", "support", "signin"
]

def suspicious_token_score(tokens, root_domain=""):
    """Score suspicious tokens, but grant amnesty to trusted root domains."""
    TRUSTED_ROOTS = {"google.com", "microsoft.com", "microsoftonline.com", "amazon.com", "apple.com", "github.com", "zoom.us", "spotify.com"}
    if root_domain in TRUSTED_ROOTS:
        return 0
    
    score = 0
    for t in tokens:
        if t in SUSPICIOUS_WORDS:
            score += 5
    return score

def calculate_namespace_risk(subdomain: str, root_domain: str = "") -> float:
    """Evaluate structural risk, but scale down for known SaaS providers."""
    risk = 0.0
    if not subdomain: return risk
    
    SAAS_PROVIDERS = {"googleapis.com", "amazonaws.com", "workers.dev", "github.io", "vercel.app", "azurewebsites.net"}
    scale = 0.5 if root_domain in SAAS_PROVIDERS else 1.0
    
    parts = subdomain.split('.')
    if len(parts) >= 2: risk += 0.5
    leaf = parts[0]
    digit_ratio = sum(c.isdigit() for c in leaf) / len(leaf) if leaf else 0
    if digit_ratio > 0.3 or len(leaf) > 15: risk += 0.5
    
    return risk * scale

def calculate_benign_signal(domain: str, signals: Dict) -> float:
    """Detect 'benign complexity' - complex but trusted cloud/SaaS infrastructure."""
    score = 0.0
    TRUSTED_SAAS = {"googleapis.com", "amazonaws.com", "microsoft.com", "azure.com", "github.com", "cloudflare.com"}
    
    if any(ts in domain for ts in TRUSTED_SAAS):
        score += 0.5
        
    # If it's a popular site but has friction (like login portals), reward it
    if intel and intel.is_popular(domain.split('.')[0]):
        score += 0.3
        
    return score

def calculate_access_friction(status_code: int, content_length: int, render_success: bool = True) -> float:
    """Measure the failure pattern of interaction (anti-bot handling)."""
    score = 0.0
    if status_code in (401, 403, 405, 429, 503): score += 0.33
    if content_length < 500: score += 0.33
    if not render_success: score += 0.34
    return score

def domain_complexity(tokens):
    return len([t for t in tokens if t not in ('www', 'com', 'net', 'org', 'co', 'uk', 'us', 'io')])

def has_nested_keywords(tokens):
    return len(tokens) >= 4

def is_external_redirect(base_url, nested_url):
    try:
        base_domain = urlparse(base_url).netloc.split(":")[0]
        nested_domain = urlparse(nested_url).netloc.split(":")[0]
        return base_domain.split('.')[-2:] != nested_domain.split('.')[-2:]
    except:
        return False

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

def compute_logit(signals):
    """
    SOTA Meta-Classifier using 13 signal dimensions + 1 interaction term.
    """
    # Signal Interaction: SaaS Brand Impersonation
    # Counteracts "SaaS Amnesty" if a strong brand mismatch exists on a risky namespace
    brand_saas_interaction = signals.get("brand_mismatch", 0) * signals.get("namespace_risk", 0)

    return (
        3.363132 * signals.get("namespace_risk", 0) +
        0.000000 * signals.get("access_friction", 0) +
        -0.476106 * signals.get("structural_anomaly", 0) +
        -0.513419 * signals.get("uncertainty", 0) +
        0.000000 * signals.get("is_shortener", 0) +
        8.661749 * signals.get("is_ip", 0) +
        0.898974 * signals.get("is_unreachable", 0) +
        -0.552916 * signals.get("gnn_score", 0.5) +
        -0.522012 * signals.get("nlp_score", 0.5) +
        0.000000 * signals.get("visual_score", 0) +
        1.800000 * signals.get("redirect_depth", 0) +
        5.000000 * signals.get("brand_mismatch", 0) +
        -4.000000 * signals.get("redirect_trust", 1) +
        10.000000 * brand_saas_interaction +  # Non-linear signal interaction
        -1.500000  # Calibration Bias
    )

def sigmoid(x):
    import math
    return 1 / (1 + math.exp(-x))

async def run_prediction(url: str, force_deep: bool = False) -> Dict[str, Any]:
    """Production phishing detection: heuristics → ML → decision override."""
    start_time = time.time()
    reasons = []

    # Ensure URL has protocol to avoid httpx crashes
    if not url.startswith(('http://', 'https://')):
        url = f"http://{url}"

    # Flag initialization
    signal_count = 0.0
    tok_score = 0.0
    is_ip = is_shortener = is_official = False
    has_mismatch = has_typo = has_keyword = has_subdomain_abuse = False
    has_bad_tld = has_stealth_pattern = False

    signals = {
        "namespace_risk": 0.0,
        "access_friction": 0.0,
        "structural_anomaly": 0.0,
        "uncertainty": 0.0,
        "is_shortener": 0.0,
        "has_ip_pattern": 0.0,
        "is_unreachable": 0.0,
        "gnn_score": 0.5,
        "nlp_score": 0.5,
        "visual_score": 0.0,
        "redirect_depth": 0.0,
        "benign_signal": 0.0,
    }

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
            signal_count += 1.0
            signals["redirect_depth"] = 1.0
        if not resolved_url.startswith('http'):
            from urllib.parse import urljoin
            resolved_url = urljoin(original_url, resolved_url)
        url = resolved_url 
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
        params = parse_qs(parsed.query)
        for key, values in params.items():
            for val in values:
                if "http://" in val or "https://" in val:
                    if is_external_redirect(url, val):
                        extra_score += 45
                        signal_count += 1
                        reasons.append("Open Redirect detected (Nested URL) [+45]")
                        has_stealth_pattern = True 
                        break

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
                signals["is_unreachable"] = 1.0
                extra_score += 15
                reasons.append("Domain Unreachable (NXDOMAIN) [+15]")
            except Exception: pass

        # -- Shortener --
        shorteners = {'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'buff.ly', 'ow.ly'}
        if host in shorteners or any(host.endswith(f".{s}") for s in shorteners):
            is_shortener = True
            signals["is_shortener"] = 1.0
            signal_count += 1
            extra_score += 5
            reasons.append("URL shortener detected [+5]")

        # -- IP Pattern (Detect embedded IPs) --
        import re
        has_ip_pattern = bool(re.search(r'\b\d{1,3}(?:\.\d{1,3}){3}\b', host))
        signals["has_ip_pattern"] = 1.0 if has_ip_pattern else 0.0
        
        if has_ip_pattern:
            extra_score += 95
            reasons.append("IP-based host pattern detected [+95]")

        # -- TLD --
        _suspicious_tlds = intel.suspicious_tlds if intel else ['xyz', 'top', 'club', 'ninja', 'online', 'biz']
        if suffix in _suspicious_tlds:
            signal_count += 1
            extra_score += 30
            reasons.append(f"Suspicious TLD (.{suffix}) [+30]")

        # -- Generalizable Lexical Deception --
        tokens = tokenize_domain(host)
        
        # 1. Suspicious Tokens
        tok_score = suspicious_token_score(tokens, root_domain=registered_domain)
        if tok_score > 0:
            extra_score += tok_score
            reasons.append(f"Suspicious token pattern [+{(tok_score)}]")
            signal_count += 1
            has_stealth_pattern = True
            
        # 2. Structural Anomaly (Too many tokens)
        if domain_complexity(tokens) >= 3:
            signals["structural_anomaly"] = 1.0
            extra_score += 10
            reasons.append("Domain structural anomaly (excessive tokens) [+10]")

        # 3. Namespace Risk (User-Controlled Space)
        namespace_risk_score = calculate_namespace_risk(subdomain, root_domain=registered_domain)
        if namespace_risk_score > 0:
            signals["namespace_risk"] = namespace_risk_score
            extra_score += namespace_risk_score * 15.0 # Lowered impact
            signal_count += 1
            reasons.append(f"Namespace risk (nested/entropy) [+{(namespace_risk_score * 15.0)}]")
            
        # 4. Benign Signal (Reward)
        benign_val = calculate_benign_signal(registered_domain, signals)
        if benign_val > 0:
            signals["benign_signal"] = benign_val
            reasons.append(f"Trusted Infrastructure Context (Benign Reward)")
            
        # 3. Subdomain Deception (Keyword stuffing)
        if has_nested_keywords(tokens):
            extra_score += 10
            reasons.append("Subdomain keyword stuffing detected [+10]")
            has_subdomain_abuse = True
            signal_count += 1
            
        # 4. NXDOMAIN Synergy
        if reachability == "unreachable":
            extra_score += 20
            reasons.append("NXDOMAIN Penalty [+20]")
            if tok_score >= 5:
                extra_score += 20
                reasons.append("NXDOMAIN + Suspicious Token Synergy [+20]")
            
        if any(kw in path or kw in host for kw in keywords):
            signal_count += 0.5
    except Exception as he:
        logger.warning(f"Heuristics error: {he}")

    # ═══════════════════════════════════════
    # PHASE 1.5: SOTA Signal Extraction (Relational)
    # ═══════════════════════════════════════
    brand_mismatch = 0.0
    root_label = domain.lower()
    for token in tokens:
        if intel and token in intel.brands:
            from difflib import SequenceMatcher
            similarity = SequenceMatcher(None, token, root_label).ratio()
            if similarity < 0.8:
                brand_mismatch = max(brand_mismatch, 1.0 - similarity)
                reasons.append(f"Brand/Infra mismatch detected ({token} on {root_label})")
                break
    signals["brand_mismatch"] = round(brand_mismatch, 4)

    # 2. Minimalist Fast-Path (Strictly for trusted giants)
    MINIMAL_TRUSTED = {"google.com", "microsoft.com", "amazon.com", "github.com", "apple.com"}
    goto_phase_3 = False
    if registered_domain in MINIMAL_TRUSTED and signal_count == 0 and not is_shortener:
        scores = {"gnn_score": 0.05, "nlp_score": 0.05}
        prob = 0.01
        goto_phase_3 = True

    # ═══════════════════════════════════════
    # PHASE 2: ML Pipeline
    # ═══════════════════════════════════════
    metadata = None
    browser_data = {}
    access_friction_score = 0.0
    redirect_trust = 1.0 
    
    if not goto_phase_3:
        scores = {"gnn_score": 0.5, "nlp_score": 0.5}
        needs_deep_scan = force_deep or is_shortener
        
        try:
            metadata = await scrape_url(url, check_threat_intel=True)
            status_code = metadata.get('domain_info', {}).get('status_code', 200)
            content_length = len(metadata.get('text_content', ''))
            access_friction_score = calculate_access_friction(status_code, content_length)
            if access_friction_score >= 20: needs_deep_scan = True
        except: pass
            
        if needs_deep_scan:
            try:
                await asyncio.wait_for(batch_semaphore.acquire(), timeout=5.0)
                try:
                    from browser_engine import fetch_rendered_content, resolve_ip
                    browser_data = await fetch_rendered_content(url, capture_screenshot=True)
                finally:
                    batch_semaphore.release()
                
                final_url = browser_data.get('final_url', url)
                final_host = urlparse(final_url).netloc.split(":")[0]
                
                # Lean Redirect Trust: Is the destination in the same ecosystem or popular?
                if final_host == host or (intel and intel.is_popular(final_host)):
                    redirect_trust = 1.0
                elif any(s in final_host for s in ["microsoft.com", "google.com", "office.com"]):
                    redirect_trust = 0.9
                else:
                    redirect_trust = 0.2
                
                if is_shortener and final_url != url:
                    return await run_prediction(final_url, force_deep=True)
                browser_data["ip"] = await resolve_ip(host)
            except Exception as be:
                logger.warning(f"Engine error: {be}")
        
        signals["redirect_trust"] = round(redirect_trust, 4)
        signals["access_friction"] = access_friction_score / 100.0
        signals["is_shortener"] = 1.0 if is_shortener else 0.0

        try:
            if detector is not None:
                url_data = {
                    'url': url,
                    'metadata': metadata if metadata else {'domain_info': {'domain': domain}, 'text_content': ''},
                    'browser': browser_data,
                    'ip': browser_data.get('ip')
                }
                scores = detector.predict(url_data)
        except Exception as mle:
            logger.warning(f"ML Scoring error: {mle}")

        signals["gnn_score"] = scores.get('gnn_score', 0.5)
        signals["nlp_score"] = scores.get('nlp_score', 0.5)
        signals["visual_score"] = scores.get('visual_score', 0.0)

        # Decision Engine
        def is_low_signal(val, eps=0.05):
            return abs(val - 0.5) < eps

        signals["uncertainty"] = (
            is_low_signal(signals["gnn_score"]) +
            is_low_signal(signals["nlp_score"]) +
            signals["access_friction"]
        ) / 3.0

        prob = sigmoid(compute_logit(signals))
        risk_score = round(prob * 100, 2)

        # --- HARD GUARD: Unreachable domains ---
        # ML prediction is meaningless when the domain cannot be reached.
        # No data = no trust. Override before any score-based verdict.
        if signals.get("is_unreachable", 0) >= 1.0:
            if signals.get("has_ip_pattern", 0) >= 1.0 and signals.get("structural_anomaly", 0) >= 1.0:
                verdict = "HIGH_RISK"
                reasons.append("Unreachable domain with embedded IP pattern and structural anomaly — escalating to HIGH_RISK.")
            else:
                verdict = "VERIFICATION_REQUIRED"
                reasons.append("Domain unreachable (NXDOMAIN/Timeout) — prediction untrustworthy")
        elif signals["access_friction"] >= 0.6 and signal_count == 0 and not is_shortener:
            verdict = "VERIFICATION_REQUIRED"
            reasons.append("High access friction (Anti-bot/403) with no malicious signals. Verification required.")
        elif prob >= 0.8:
            verdict = "PHISHING"
        elif prob >= 0.6:
            verdict = "HIGH_RISK"
        elif prob >= 0.4:
            verdict = "SUSPICIOUS"
        else:
            verdict = "SAFE"

    analysis_mode = "FULL"
    _nlp_score = round(signals.get('nlp_score', 0.5), 4)
    _gnn_score = round(signals.get('gnn_score', 0.5), 4)
    if reachability == "unreachable":
        analysis_mode = "OFFLINE"
    elif not goto_phase_3 and _nlp_score < 0.05:
        analysis_mode = "RESTRICTED"
        
    unused_signals = []
    if analysis_mode == "OFFLINE":
        unused_signals.extend(["Content Intelligence (Offline)", "External Threat Feeds (Offline)", "Network Metatdata (Offline)"])
    elif analysis_mode == "RESTRICTED":
        unused_signals.append("Content Intelligence (Bot Blocked)")
        
    attack_types = []
    if verdict == "PHISHING":
        if has_mismatch: attack_types.append("Brand Impersonation")
        if has_typo: attack_types.append("Typosquatting")
        if has_stealth_pattern: attack_types.append("Redirect-based Phishing")
        if has_subdomain_abuse: attack_types.append("Subdomain Abuse")
        if is_shortener: attack_types.append("URL Obfuscation")
        if not attack_types: attack_types.append("Heuristic Pattern Match")

    # Force confidence to "low" when verdict was overridden by hard guard (unreachable)
    _is_unreachable_verify = (verdict == "VERIFICATION_REQUIRED" and signals.get("is_unreachable", 0) >= 1.0)

    final_reasons = reasons if reasons else ["Clear URL structure"]
    result = {
        "url": original_url,
        "resolved_url": url if url != original_url else None,
        "is_phishing": verdict == "PHISHING",
        "risk_probability": None if _is_unreachable_verify else (round(prob, 4) if not goto_phase_3 else 0.01),
        "risk_score": round(max(0.1, risk_score), 2),
        "risk_level": verdict,
        "verdict": verdict,
        "confidence": "low" if _is_unreachable_verify else get_confidence(risk_score, final_reasons, analysis_mode, scores.get('graph_signal', 'unknown')),
        "reachability": reachability,
        "analysis_mode": analysis_mode,
        "reasons": final_reasons,
        "attack_types": attack_types,
        "unused_signals": unused_signals,
        "latency_ms": round((time.time() - start_time) * 1000),
        "score_breakdown": {
            "base_score": round(prob * 100, 1) if not goto_phase_3 else 1.0,
            "final_score": round(max(0.1, risk_score), 2)
        },
        "signals": signals,
        "scores": {
            "gnn_score": round(scores.get('gnn_score', 0.5), 4),
            "nlp_score": _nlp_score,
            "llm_score": _nlp_score,  # backward-compat alias
            "fusion_score": round(scores.get('fusion_score', 0.5), 4),
            "graph_node_count": scores.get('graph_node_count', 0),
            "graph_signal": scores.get('graph_signal', 'unknown')
        },
        "deep_scan": {
            "enabled": force_deep,
            "external_scripts_count": len(browser_data.get('external_scripts', [])),
            "redirect_count": len(browser_data.get('redirect_chain', [])),
            "screenshot_available": browser_data.get('screenshot_b64') is not None,
            "render_error": browser_data.get('error'),
        } if force_deep else None,
        "evidence": {
            "structural_impact": round(prob * 100, 1) if not goto_phase_3 else 1.0,
            "scraping_status": "blocked" if analysis_mode == "RESTRICTED" else "success" if (not goto_phase_3) else "fast-path",
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
    _last_result.update(result)
    return result


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


@app.get("/export/siem")
async def export_siem():
    """Export the last scan result as a SIEM-compatible JSON artifact."""
    import uuid
    from fastapi.responses import JSONResponse
    if not _last_result:
        raise HTTPException(status_code=404, detail="No scan result available. Run a scan first.")
    payload = {
        "schema": "threatlens-siem-v1",
        "export_id": str(uuid.uuid4()),
        "exported_at": datetime.now().isoformat(),
        "result": _last_result,
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="threatlens_export.json"'},
    )

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve built frontend static assets if they exist
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "dist")

if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve any static file in dist directly if it exists (e.g., /vite.svg)
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # SPA catch-all: return index.html for React Router to handle
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
            
        return {"name": "ThreatLens API", "status": "online", "message": "Frontend build not found"}
else:
    @app.get("/")
    async def root():
        return {"name": "ThreatLens API", "status": "online", "message": "Frontend build not found"}