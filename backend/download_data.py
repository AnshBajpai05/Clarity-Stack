"""
ThreatLens — Real Dataset Downloader

Downloads real phishing + benign URL datasets for production training.

Sources:
  - OpenPhish community feed (active phishing URLs, updated regularly)
  - PhishStats scored CSV (large phishing database with confidence scores)
  - Tranco top 1M (research-grade benign domain ranking)
  - Kaggle Phishing URL Dataset (if kaggle CLI available)
"""

import os
import csv
import json
import zipfile
import io
import logging
import time
from datetime import datetime
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def download_file(url: str, desc: str) -> bytes:
    """Download file with proper headers."""
    import urllib.request
    
    logger.info(f"  Downloading {desc}...")
    logger.info(f"  URL: {url}")
    
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ThreatLens/1.0',
        'Accept': '*/*',
    })
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
            logger.info(f"  Downloaded {len(data):,} bytes")
            return data
    except Exception as e:
        logger.error(f"  Failed to download {desc}: {e}")
        return None


def download_openphish():
    """
    OpenPhish Community Feed — active phishing URLs.
    Free, no auth. Updated every ~15 min.
    """
    logger.info("\n[1] OpenPhish Community Feed")
    
    output_path = os.path.join(DATA_DIR, "openphish_urls.txt")
    
    data = download_file("https://openphish.com/feed.txt", "OpenPhish feed")
    if not data:
        return 0
    
    text = data.decode('utf-8', errors='ignore')
    urls = [line.strip() for line in text.strip().split('\n') if line.strip() and line.startswith('http')]
    
    with open(output_path, 'w', encoding='utf-8') as f:
        for url in urls:
            f.write(url + '\n')
    
    logger.info(f"  Saved {len(urls)} phishing URLs to {output_path}")
    return len(urls)


def download_phishstats():
    """
    PhishStats — large phishing URL database with scores.
    Free, no auth. ~100K+ URLs.
    """
    logger.info("\n[2] PhishStats Database")
    
    output_path = os.path.join(DATA_DIR, "phishstats.csv")
    
    # PhishStats provides a CSV with scores
    data = download_file("https://phishstats.info/phish_score.csv", "PhishStats CSV")
    if not data:
        return 0
    
    text = data.decode('utf-8', errors='ignore')
    lines = text.strip().split('\n')
    
    urls = []
    for line in lines[1:]:  # Skip header
        parts = line.split(',')
        if len(parts) >= 3:
            # Format: date,score,url,ip
            url = parts[2].strip().strip('"')
            score = parts[1].strip()
            if url.startswith('http'):
                urls.append({'url': url, 'score': score})
    
    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'score'])
        writer.writeheader()
        writer.writerows(urls[:10000])  # Cap at 10K for manageable training
    
    logger.info(f"  Saved {min(len(urls), 10000)} phishing URLs to {output_path}")
    return min(len(urls), 10000)


def download_tranco():
    """
    Tranco Top 1M — research-grade benign domain ranking.
    Free, no auth. More reliable than Alexa (which was discontinued).
    Used in academic papers as ground truth for benign domains.
    """
    logger.info("\n[3] Tranco Top 1M (benign domains)")
    
    output_path = os.path.join(DATA_DIR, "tranco_benign.csv")
    
    # Try the latest Tranco list
    data = download_file("https://tranco-list.eu/top-1m.csv.zip", "Tranco Top 1M")
    
    if data:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                csv_name = z.namelist()[0]
                csv_data = z.read(csv_name).decode('utf-8', errors='ignore')
                lines = csv_data.strip().split('\n')
                
                domains = []
                for line in lines[:5000]:  # Top 5000 domains
                    parts = line.strip().split(',')
                    if len(parts) >= 2:
                        rank = parts[0]
                        domain = parts[1].strip()
                        if domain and '.' in domain:
                            domains.append({'rank': rank, 'domain': domain, 'url': f"https://www.{domain}"})
                
                with open(output_path, 'w', encoding='utf-8', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=['rank', 'domain', 'url'])
                    writer.writeheader()
                    writer.writerows(domains)
                
                logger.info(f"  Saved {len(domains)} benign domains to {output_path}")
                return len(domains)
        except Exception as e:
            logger.error(f"  Error processing Tranco zip: {e}")
    
    # Fallback: try direct CSV
    data = download_file("https://tranco-list.eu/top-1m.csv", "Tranco CSV (direct)")
    if data:
        text = data.decode('utf-8', errors='ignore')
        lines = text.strip().split('\n')
        domains = []
        for line in lines[:5000]:
            parts = line.strip().split(',')
            if len(parts) >= 2:
                domains.append({'rank': parts[0], 'domain': parts[1].strip(), 'url': f"https://www.{parts[1].strip()}"})
        
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['rank', 'domain', 'url'])
            writer.writeheader()
            writer.writerows(domains)
        
        logger.info(f"  Saved {len(domains)} benign domains to {output_path}")
        return len(domains)
    
    return 0


def build_combined_dataset():
    """
    Combine all downloaded data into a single clean training CSV:
    - url, label (phishing/benign), source
    """
    logger.info("\n[4] Building combined dataset...")
    
    output_path = os.path.join(DATA_DIR, "combined_dataset.csv")
    rows = []
    
    # Load OpenPhish URLs
    openphish_path = os.path.join(DATA_DIR, "openphish_urls.txt")
    if os.path.exists(openphish_path):
        with open(openphish_path, 'r', encoding='utf-8') as f:
            for line in f:
                url = line.strip()
                if url:
                    try:
                        domain = urlparse(url).netloc
                    except:
                        domain = url
                    rows.append({
                        'url': url,
                        'domain': domain,
                        'label': 'phishing',
                        'source': 'openphish',
                    })
    
    # Load PhishStats URLs
    phishstats_path = os.path.join(DATA_DIR, "phishstats.csv")
    if os.path.exists(phishstats_path):
        with open(phishstats_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = row.get('url', '').strip()
                if url and url.startswith('http'):
                    try:
                        domain = urlparse(url).netloc
                    except:
                        domain = url
                    rows.append({
                        'url': url,
                        'domain': domain,
                        'label': 'phishing',
                        'source': 'phishstats',
                    })
    
    # Load Tranco benign domains
    tranco_path = os.path.join(DATA_DIR, "tranco_benign.csv")
    if os.path.exists(tranco_path):
        with open(tranco_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = row.get('url', '').strip()
                domain = row.get('domain', '').strip()
                if url:
                    rows.append({
                        'url': url,
                        'domain': domain,
                        'label': 'benign',
                        'source': 'tranco',
                    })
    
    # Deduplicate by URL
    seen = set()
    unique_rows = []
    for row in rows:
        if row['url'] not in seen:
            seen.add(row['url'])
            unique_rows.append(row)
    
    # Write combined dataset
    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'domain', 'label', 'source'])
        writer.writeheader()
        writer.writerows(unique_rows)
    
    phishing_count = sum(1 for r in unique_rows if r['label'] == 'phishing')
    benign_count = sum(1 for r in unique_rows if r['label'] == 'benign')
    
    logger.info(f"  Combined dataset: {len(unique_rows)} URLs")
    logger.info(f"    Phishing: {phishing_count}")
    logger.info(f"    Benign:   {benign_count}")
    logger.info(f"  Saved to: {output_path}")
    
    return len(unique_rows)


def main():
    logger.info("=" * 60)
    logger.info("  ThreatLens — Dataset Downloader")
    logger.info("=" * 60)
    
    total = 0
    
    # Download each source
    n = download_openphish()
    total += n
    
    n = download_phishstats()
    total += n
    
    n = download_tranco()
    total += n
    
    # Build combined dataset
    if total > 0:
        combined = build_combined_dataset()
        logger.info(f"\n{'=' * 60}")
        logger.info(f"  DONE — {combined} total URLs ready for training")
        logger.info(f"  Dataset at: {os.path.join(DATA_DIR, 'combined_dataset.csv')}")
        logger.info(f"{'=' * 60}")
    else:
        logger.error("\n  No datasets could be downloaded. Check internet connection.")


if __name__ == "__main__":
    main()
