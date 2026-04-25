"""
ThreatLens — Playwright Browser Engine
Replaces httpx+BeautifulSoup with a real headless browser.
Captures: rendered DOM, redirect chain, external script hosts, screenshot.
"""
import asyncio, base64, logging, time
from typing import Dict, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


async def fetch_rendered_content(url: str, timeout_ms: int = 8000, capture_screenshot: bool = False) -> Dict:
    """Render a URL in headless Chromium and return behavioral signals."""
    result: Dict = {
        "html": "", "title": None, "final_url": url,
        "redirect_chain": [], "external_scripts": [],
        "screenshot_b64": None, "load_time": 0.0, "ip": None, "error": None,
    }
    try:
        from playwright.async_api import async_playwright
        from playwright_stealth import stealth
    except ImportError:
        logger.warning("playwright or playwright-stealth not installed. Run: pip install playwright playwright-stealth")
        result["error"] = "playwright_missing"
        return result

    start = time.time()
    try:
        async with async_playwright() as p:
            # We use headless=False as per stealth best practices if possible, 
            # but on a server we often must use headless=True. 
            # Stealth works reasonably well even with headless=True.
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                ignore_https_errors=True,
            )
            page = await context.new_page()
            
            # Apply stealth
            await stealth(page)
            
            page.on("response", lambda r: result["redirect_chain"].append(r.url) if r.status in (301, 302, 303, 307, 308) else None)
            try:
                await page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
                result["html"] = await page.content()
                result["title"] = await page.title()
                result["final_url"] = page.url
                origin_host = urlparse(page.url).netloc
                try:
                    srcs: List[str] = await page.eval_on_selector_all("script[src]", "els => els.map(e => e.getAttribute('src'))")
                    result["external_scripts"] = [s for s in srcs if s and _is_external(s, origin_host)]
                except Exception: pass
                if capture_screenshot:
                    try:
                        result["screenshot_b64"] = base64.b64encode(await page.screenshot(type="webp", full_page=False)).decode()
                    except Exception: pass
            except Exception as e:
                result["error"] = str(e)
            finally:
                result["load_time"] = round(time.time() - start, 3)
                await browser.close()
    except Exception as e:
        result["error"] = str(e)
        result["load_time"] = round(time.time() - start, 3)
    return result


def _is_external(src: str, origin_host: str) -> bool:
    if src.startswith("//"):
        src = "https:" + src
    parsed = urlparse(src)
    return bool(parsed.netloc) and parsed.netloc != origin_host


async def resolve_ip(hostname: str) -> Optional[str]:
    try:
        loop = asyncio.get_event_loop()
        addrs = await asyncio.wait_for(loop.getaddrinfo(hostname, None), timeout=2.0)
        return addrs[0][4][0] if addrs else None
    except Exception:
        return None
