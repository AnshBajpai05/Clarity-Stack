"""
ThreatLens V2 — Dynamic Threat Intelligence Engine

Replaces hardcoded brand lists and whitelists with:
  1. Tranco Top 10K popular domains (auto-downloaded, cached 24h)
  2. Externalized brands.json config (no redeploy to update)

Architecture:
  - Loaded ONCE at server startup
  - Zero runtime latency (in-memory sets)
  - Graceful fallback to static lists if Tranco download fails
"""

import json
import os
import time
import logging
import zipfile
import csv
import io

logger = logging.getLogger(__name__)

# Static fallback — used only if Tranco download fails
FALLBACK_POPULAR_DOMAINS = {
    'google', 'microsoft', 'microsoftonline', 'apple', 'amazon',
    'facebook', 'github', 'dev', 'notion', 'slack', 'zoom', 'medium',
    'spotify', 'atlassian', 'gravatar', 'auth0', 'vercel', 'supabase',
    'cloudflare', 'digitalocean', 'heroku', 'kaggle', 'openai',
    'huggingface', 'arxiv', 'ieee', 'springer', 'sciencedirect',
    'nature', 'firebase', 'stackoverflow', 'twitter', 'linkedin',
    'reddit', 'wikipedia', 'youtube', 'dropbox', 'adobe', 'oracle',
    'salesforce', 'shopify', 'twitch', 'discord', 'pinterest',
    'snapchat', 'tiktok', 'paypal', 'netflix', 'samsung', 'intel',
    'nvidia', 'amd', 'ibm', 'cisco', 'vmware', 'docker', 'mongodb',
    'elastic', 'datadog', 'cloudflare', 'fastly', 'akamai'
}


class ThreatIntelEngine:
    """Config-driven threat intelligence with dynamic domain popularity."""

    def __init__(self, config_path: str = None, tranco_top_n: int = 10000):
        self.tranco_top_n = tranco_top_n
        self.popular_domains: set = set()
        self.brands: list = []
        self.keywords: list = []
        self.sec_terms: list = []
        self.stealth_words: list = []
        self.suspicious_tlds: list = []

        # Load externalized config
        self._load_config(config_path)

        # Load Tranco popular domains
        self._load_tranco()

    def _load_config(self, config_path: str = None):
        """Load brands, keywords, TLDs from brands.json."""
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(__file__), 'data', 'brands.json'
            )

        try:
            with open(config_path, 'r') as f:
                config = json.load(f)

            self.brands = config.get('brands', [])
            self.keywords = config.get('keywords', [])
            self.sec_terms = config.get('sec_terms', [])
            self.stealth_words = config.get('stealth_words', [])
            self.suspicious_tlds = config.get('suspicious_tlds', [])

            logger.info(
                f"Loaded config: {len(self.brands)} brands, "
                f"{len(self.keywords)} keywords, "
                f"{len(self.suspicious_tlds)} suspicious TLDs"
            )
        except Exception as e:
            logger.error(f"Failed to load brands.json: {e}. Using defaults.")
            self.brands = [
                'paypal', 'amazon', 'apple', 'microsoft', 'netflix',
                'bankofamerica', 'chase', 'wellsfargo', 'google',
                'facebook', 'instagram', 'whatsapp', 'telegram',
                'coinbase', 'binance', 'stripe', 'dhl', 'fedex',
                'usps', 'icloud', 'office365', 'slack', 'linkedin'
            ]
            self.keywords = [
                'login', 'verify', 'auth', 'secure', 'payment',
                'update', 'billing', 'verification', 'account', 'signin'
            ]
            self.sec_terms = [
                'login', 'verify', 'auth', 'secure', 'payment',
                'billing', 'account', 'signin', 'identity',
                'validation', 'confirm', 'access', 'session',
                'maintenance', 'update', 'check', 'verification',
                'security', 'notification', 'alert', 'resolution',
                'subscription'
            ]
            self.stealth_words = ['service', 'center', 'portal', 'support', 'help']
            self.suspicious_tlds = ['xyz', 'top', 'club', 'ninja', 'online', 'support', 'biz']

    def _load_tranco(self):
        """Download and cache Tranco Top 1M list, extract top N domains."""
        cache_dir = os.path.join(os.path.dirname(__file__), 'data', 'tranco')
        cache_file = os.path.join(cache_dir, 'top-1m.csv')
        cache_meta = os.path.join(cache_dir, 'last_updated.txt')

        os.makedirs(cache_dir, exist_ok=True)

        # Check if cache is fresh (< 24h)
        cache_fresh = False
        if os.path.exists(cache_file) and os.path.exists(cache_meta):
            try:
                with open(cache_meta, 'r') as f:
                    last_ts = float(f.read().strip())
                if time.time() - last_ts < 86400:  # 24 hours
                    cache_fresh = True
            except:
                pass

        # Download if cache is stale
        if not cache_fresh:
            try:
                import requests
                logger.info("Downloading Tranco Top 1M list...")
                resp = requests.get(
                    'https://tranco-list.eu/top-1m.csv.zip',
                    timeout=30
                )
                resp.raise_for_status()

                # Extract CSV from ZIP
                z = zipfile.ZipFile(io.BytesIO(resp.content))
                csv_name = z.namelist()[0]
                z.extract(csv_name, cache_dir)

                # Rename to standard name if different
                extracted_path = os.path.join(cache_dir, csv_name)
                if extracted_path != cache_file:
                    if os.path.exists(cache_file):
                        os.remove(cache_file)
                    os.rename(extracted_path, cache_file)

                # Update cache timestamp
                with open(cache_meta, 'w') as f:
                    f.write(str(time.time()))

                logger.info("Tranco list downloaded and cached.")
            except Exception as e:
                logger.warning(f"Tranco download failed: {e}. Using fallback.")

        # Parse CSV → extract top N domains
        if os.path.exists(cache_file):
            try:
                domains = set()
                with open(cache_file, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    for i, row in enumerate(reader):
                        if i >= self.tranco_top_n:
                            break
                        if len(row) >= 2:
                            domains.add(row[1].strip().lower())
                        elif len(row) == 1:
                            domains.add(row[0].strip().lower())

                self.popular_domains = domains
                logger.info(f"Loaded {len(self.popular_domains)} popular domains from Tranco")
            except Exception as e:
                logger.warning(f"Failed to parse Tranco CSV: {e}. Using fallback.")
                self.popular_domains = FALLBACK_POPULAR_DOMAINS.copy()
        else:
            logger.warning("No Tranco cache available. Using static fallback.")
            self.popular_domains = FALLBACK_POPULAR_DOMAINS.copy()

    def is_popular(self, domain: str) -> bool:
        """Check if a domain is in the Tranco Top N (trusted)."""
        domain = domain.lower().strip()
        # Check exact match and common variations
        return (
            domain in self.popular_domains
            or f"{domain}.com" in self.popular_domains
            or f"{domain}.org" in self.popular_domains
            or f"{domain}.net" in self.popular_domains
            or f"{domain}.co" in self.popular_domains
        )

    def get_rank(self, domain: str) -> int:
        """Get approximate popularity rank. 0 = not ranked."""
        # For set-based lookup, we just return 1 (popular) or 0 (not)
        return 1 if self.is_popular(domain) else 0
