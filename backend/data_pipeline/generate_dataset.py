import asyncio
import logging
import os
import torch
from urllib.request import urlopen
from browser_engine import fetch_rendered_content
from model import URLGraphBuilder

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

NUM_BENIGN = 50
NUM_PHISHING = 50
OUTPUT_FILE = "data/dataset.pt"

def load_tranco(limit=NUM_BENIGN):
    # Live top domains for stable benign graphs
    domains = [
        "google.com", "youtube.com", "facebook.com", "baidu.com", "wikipedia.org",
        "yahoo.com", "twitter.com", "amazon.com", "instagram.com", "linkedin.com",
        "reddit.com", "netflix.com", "bing.com", "live.com", "office.com",
        "microsoft.com", "twitch.tv", "apple.com", "tiktok.com", "paypal.com",
        "github.com", "stackoverflow.com", "aws.amazon.com", "cloudflare.com"
    ]
    return [f"https://{d}" for d in domains[:limit]]

def load_phishing(limit=NUM_PHISHING):
    # Live OpenPhish feed
    logger.info("Fetching OpenPhish feed...")
    try:
        response = urlopen("https://openphish.com/feed.txt", timeout=10)
        lines = response.read().decode('utf-8').splitlines()
        logger.info(f"Fetched {len(lines)} phishing URLs.")
        return lines[:limit]
    except Exception as e:
        logger.error(f"Failed to fetch OpenPhish: {e}")
        return []

async def process_url(url, label):
    try:
        browser_data = await fetch_rendered_content(url, timeout_ms=10000, capture_screenshot=False)
        if browser_data.get("error") and browser_data["error"] != "playwright_missing":
            return None
            
        url_data = {"url": url, "browser": browser_data, "ip": browser_data.get("ip")}
        builder = URLGraphBuilder()
        builder.add_url(url_data)
        
        # Filter out weak graphs
        if len(builder.graph.nodes()) < 2:
            return None
            
        x, edge_index, graph_features = builder.build_graph_tensors()
        
        # Strip padding for PyG Data objects since DataLoader handles batching
        mask = (x.abs().sum(dim=-1) > 0)
        x_clean = x[mask]
        
        # Build PyG Data
        from torch_geometric.data import Data
        y = torch.tensor([label], dtype=torch.float)
        data = Data(x=x_clean, edge_index=edge_index, y=y, graph_features=graph_features)
        data.url = url
        return data
    except Exception as e:
        logger.debug(f"Error processing {url}: {e}")
        return None

async def main():
    os.makedirs("data", exist_ok=True)
    
    benign_urls = load_tranco(limit=100)
    phishing_urls = load_phishing(limit=100)
    
    dataset = []
    
    logger.info("Building Benign Dataset (Label 0)...")
    for url in benign_urls:
        data = await process_url(url, 0)
        if data:
            dataset.append(data)
            logger.info(f"[+] Benign: {url} ({len(data.x)} nodes)")
        if len(dataset) >= NUM_BENIGN:
            break
            
    logger.info("Building Phishing Dataset (Label 1)...")
    phish_count = 0
    for url in phishing_urls:
        data = await process_url(url, 1)
        if data:
            dataset.append(data)
            phish_count += 1
            logger.info(f"[+] Phishing: {url} ({len(data.x)} nodes)")
        if phish_count >= NUM_PHISHING:
            break
            
    torch.save(dataset, OUTPUT_FILE)
    logger.info(f"Saved {len(dataset)} valid graphs to {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(main())
