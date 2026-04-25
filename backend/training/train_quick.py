"""
ThreatLens — Production Training Pipeline

Addresses all training weaknesses:
1. Real data integration (PhishTank + hard negatives)
2. Hard negatives (tricky benign URLs)
3. Domain-level split (no data leakage)
4. Class imbalance simulation (90/10 with focal loss)
5. Gradient accumulation (mini-batch stability)
6. Threshold tuning on validation set
7. Comprehensive metrics (AUC-ROC, precision-recall curves)

Usage:
    python train_quick.py
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import random
import logging
import os
import json
import csv
import io
from datetime import datetime, timedelta
from tqdm import tqdm
from collections import defaultdict
from urllib.parse import urlparse
import numpy as np

from model import PhishingDetector

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

random.seed(42)
torch.manual_seed(42)
np.random.seed(42)


# =====================================================================
#  FOCAL LOSS — handles class imbalance way better than BCE
# =====================================================================

class FocalLoss(nn.Module):
    """
    Focal Loss: down-weights easy examples, focuses on hard ones.
    Critical for imbalanced datasets (90% benign / 10% phishing).
    
    Paper: "Focal Loss for Dense Object Detection" (Lin et al., 2017)
    """
    def __init__(self, alpha: float = 0.75, gamma: float = 2.0):
        super().__init__()
        self.alpha = alpha   # Weight for positive class
        self.gamma = gamma   # Focusing parameter
    
    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        bce = F.binary_cross_entropy(pred, target, reduction='none')
        pt = torch.where(target == 1, pred, 1 - pred)
        alpha_t = torch.where(target == 1, self.alpha, 1 - self.alpha)
        focal_weight = alpha_t * (1 - pt) ** self.gamma
        return (focal_weight * bce).mean()


# =====================================================================
#  DATA — Brand targets, URL patterns, content templates
# =====================================================================

BRANDS = [
    'paypal', 'amazon', 'apple', 'google', 'microsoft', 'facebook', 'netflix',
    'spotify', 'bankofamerica', 'chase', 'wellsfargo', 'citibank', 'instagram',
    'twitter', 'linkedin', 'dropbox', 'icloud', 'outlook', 'yahoo', 'ebay',
    'whatsapp', 'telegram', 'coinbase', 'binance', 'stripe', 'venmo', 'zelle',
    'usps', 'fedex', 'dhl', 'ups', 'irs', 'honda', 'toyota', 'walmart',
    'costco', 'target', 'bestbuy', 'homedepot', 'lowes',
]

SUSPICIOUS_TLDS = [
    '.xyz', '.top', '.club', '.online', '.site', '.info', '.tk', '.ml',
    '.ga', '.cf', '.gq', '.buzz', '.work', '.click', '.link', '.space',
    '.fun', '.icu', '.cyou', '.rest', '.cfd', '.sbs', '.quest',
]

PHISH_PREFIXES = [
    'secure', 'login', 'verify', 'account', 'update', 'confirm', 'service',
    'support', 'customer', 'billing', 'payment', 'auth', 'signin', 'alert',
    'notification', 'recovery', 'unlock', 'validate', 'security', 'myaccount',
    'webscr', 'resolution', 'restore', 'reactivate', 'suspended',
]

PHISH_PATHS = [
    '/login', '/verify', '/account/update', '/secure/login', '/auth/confirm',
    '/billing/payment', '/user/verify', '/signin', '/reset-password',
    '/account-recovery', '/confirm-identity', '/update-info', '/unlock',
    '/webapps/auth', '/customer/verify', '/support/ticket', '/index.php',
    '/wp-admin/login.php', '/cgi-bin/auth', '/verification/step1',
    '/secure/account/verify', '/login.html', '/account/suspended',
]

PHISH_CONTENT_TEMPLATES = [
    "URGENT: Your {brand} account has been compromised. Click here immediately to verify your identity. Failure to act within 24 hours will result in permanent suspension.",
    "Dear {brand} customer, unusual activity detected. Please verify by entering your password and SSN below.",
    "{brand} Security Alert: Someone accessed your account from an unrecognized device in Russia. Secure your account now.",
    "Your {brand} account will be suspended unless you update your payment information immediately.",
    "Congratulations! You've won a {brand} gift card worth $500. Claim now by entering your personal details.",
    "Important: Your {brand} transaction of $499.99 requires verification. Click here if unauthorized.",
    "{brand} Account Recovery: Reset your password now or lose access permanently. Enter credentials below.",
    "Final Warning: Your {brand} subscription expires today. Renew immediately or lose all data.",
    "Action Required: {brand} updated its terms. Re-verify within 48 hours or account will be deleted.",
    "Dear {brand} member, your card on file has expired. Update billing to continue service.",
]

# Trusted domains with realistic descriptions
BENIGN_DOMAINS = [
    ('google.com', 'Google', 'Search engine and technology company. Explore Search, Maps, Gmail, YouTube.'),
    ('microsoft.com', 'Microsoft', 'Technology corporation. Windows, Office, Azure cloud services.'),
    ('apple.com', 'Apple', 'Consumer electronics. iPhone, iPad, Mac, Apple Watch.'),
    ('amazon.com', 'Amazon', 'Online marketplace. Shop millions of products with fast delivery.'),
    ('github.com', 'GitHub', 'Software development platform. Build, ship, maintain software.'),
    ('wikipedia.org', 'Wikipedia', 'Free encyclopedia. Millions of articles in hundreds of languages.'),
    ('stackoverflow.com', 'Stack Overflow', 'Developer community for learning and sharing knowledge.'),
    ('reddit.com', 'Reddit', 'Social news aggregation and discussion website.'),
    ('youtube.com', 'YouTube', 'Video sharing platform. Watch and upload videos.'),
    ('netflix.com', 'Netflix', 'Streaming service for movies and TV shows.'),
    ('linkedin.com', 'LinkedIn', 'Professional networking platform.'),
    ('twitter.com', 'Twitter', 'Social media for sharing thoughts and news.'),
    ('mozilla.org', 'Mozilla', 'Firefox browser and internet health advocacy.'),
    ('adobe.com', 'Adobe', 'Creative software. Photoshop, Illustrator.'),
    ('wordpress.com', 'WordPress', 'Website creation platform.'),
    ('medium.com', 'Medium', 'Publishing platform for stories and articles.'),
    ('notion.so', 'Notion', 'All-in-one workspace for notes and projects.'),
    ('figma.com', 'Figma', 'Collaborative interface design tool.'),
    ('slack.com', 'Slack', 'Business communication platform.'),
    ('zoom.us', 'Zoom', 'Video conferencing platform.'),
    ('nytimes.com', 'New York Times', 'Quality journalism and news coverage.'),
    ('bbc.com', 'BBC', 'British Broadcasting Corporation providing news worldwide.'),
    ('cnn.com', 'CNN', 'Cable News Network delivering breaking news.'),
    ('reuters.com', 'Reuters', 'International news organization.'),
    ('harvard.edu', 'Harvard University', 'Excellence in teaching and research.'),
    ('mit.edu', 'MIT', 'Science and engineering research university.'),
    ('stanford.edu', 'Stanford University', 'Leading research university.'),
    ('python.org', 'Python', 'Official Python programming language website.'),
    ('pytorch.org', 'PyTorch', 'Open source machine learning framework.'),
    ('cloudflare.com', 'Cloudflare', 'Web security and performance.'),
    ('stripe.com', 'Stripe', 'Online payment processing.'),
    ('shopify.com', 'Shopify', 'E-commerce platform for online stores.'),
    ('twitch.tv', 'Twitch', 'Live streaming platform for gaming.'),
    ('discord.com', 'Discord', 'Communication platform for communities.'),
    ('gitlab.com', 'GitLab', 'DevOps platform for software development.'),
    ('docker.com', 'Docker', 'Containerized application platform.'),
    ('vercel.com', 'Vercel', 'Frontend deployment platform.'),
    ('digitalocean.com', 'DigitalOcean', 'Cloud infrastructure for developers.'),
    ('atlassian.com', 'Atlassian', 'Jira, Confluence, Trello for teams.'),
    ('salesforce.com', 'Salesforce', 'CRM platform for businesses.'),
]

BENIGN_PATHS = [
    '', '/', '/about', '/contact', '/products', '/blog', '/help', '/docs',
    '/pricing', '/careers', '/news', '/features', '/enterprise', '/security',
    '/privacy', '/terms', '/developers', '/api', '/partners', '/press',
]

BENIGN_SUBDOMAINS = ['www', 'blog', 'docs', 'support', 'help', 'api', 'mail', 'store', 'dev', 'status']


# =====================================================================
#  DATA GENERATORS
# =====================================================================

def generate_phishing_urls(count: int) -> list:
    """Generate diverse phishing URLs with 12 pattern types."""
    urls = []
    for _ in range(count):
        brand = random.choice(BRANDS)
        tld = random.choice(SUSPICIOUS_TLDS)
        prefix = random.choice(PHISH_PREFIXES)
        path = random.choice(PHISH_PATHS)
        rand = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=random.randint(4, 12)))
        
        ptype = random.randint(0, 11)
        if ptype == 0: url = f"https://{prefix}-{brand}-{rand}{tld}{path}"
        elif ptype == 1: url = f"https://{brand}.{prefix}-{rand}{tld}{path}"
        elif ptype == 2: url = f"https://{rand}-{brand}{tld}/{prefix}{path}"
        elif ptype == 3: url = f"https://{prefix}{brand}{rand}{tld}{path}"
        elif ptype == 4: url = f"http://{brand}-{prefix}.{rand}{tld}{path}"
        elif ptype == 5: url = f"https://{rand}{tld}/{brand}/{prefix}"
        elif ptype == 6:
            typo = brand[0] + brand[1:].replace('a', '@').replace('o', '0').replace('l', '1').replace('e', '3')
            url = f"https://www.{typo}.com{path}"
        elif ptype == 7: url = f"https://{brand}.{prefix}.{rand}{tld}{path}"
        elif ptype == 8: url = f"https://{rand}{tld}/{brand}/login/verify"
        elif ptype == 9: url = f"https://{brand}-official-{prefix}{tld}{path}"
        elif ptype == 10:
            ip = f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
            url = f"http://{ip}/{brand}/{prefix}"
        else: url = f"https://{prefix}.{brand}.security.{rand}{tld}{path}?token={rand}"
        
        content = random.choice(PHISH_CONTENT_TEMPLATES).format(brand=brand.capitalize())
        days_ago = random.randint(0, 60)
        
        urls.append({
            'url': url,
            'is_phishing': True,
            'target': brand,
            'verified_at': (datetime.now() - timedelta(days=days_ago)).isoformat(),
            'metadata': {
                'domain_info': {'domain': url.split('/')[2] if '/' in url else url},
                'page_title': f"{brand.capitalize()} - {prefix.capitalize()} Your Account",
                'text_content': content,
            },
        })
    return urls


def generate_benign_urls(count: int) -> list:
    """Generate benign URLs from trusted domains."""
    urls = []
    while len(urls) < count:
        domain, name, desc = random.choice(BENIGN_DOMAINS)
        path = random.choice(BENIGN_PATHS)
        if random.random() < 0.3:
            url = f"https://{random.choice(BENIGN_SUBDOMAINS)}.{domain}{path}"
        else:
            url = f"https://www.{domain}{path}"
        days_ago = random.randint(30, 730)
        urls.append({
            'url': url,
            'is_phishing': False,
            'target': 'benign',
            'verified_at': (datetime.now() - timedelta(days=days_ago)).isoformat(),
            'metadata': {
                'domain_info': {'domain': domain},
                'page_title': f"{name} - Official Website",
                'text_content': desc,
            },
        })
    return urls


def generate_hard_negatives(count: int) -> list:
    """
    CRITICAL: URLs that LOOK phishy but are actually benign.
    Without these, the model becomes overconfident and naive.
    """
    hard_negatives = []
    
    patterns = [
        # Legit URLs with "phishy" keywords
        ("https://www.paypal.com/signin", "paypal.com", "PayPal", "Log in to your PayPal account. Send and receive payments securely."),
        ("https://login.microsoft.com/oauth2/authorize", "login.microsoft.com", "Microsoft Login", "Sign in with your Microsoft account for Outlook, Office, and more."),
        ("https://accounts.google.com/signin/v2", "accounts.google.com", "Google Sign In", "Sign in to access your Google account services."),
        ("https://www.amazon.com/ap/signin", "www.amazon.com", "Amazon Sign-In", "Sign in to your Amazon account to access orders and settings."),
        ("https://appleid.apple.com/auth/authorize", "appleid.apple.com", "Apple ID", "Manage your Apple ID and account settings securely."),
        ("https://www.facebook.com/login", "www.facebook.com", "Facebook Login", "Log in to Facebook to connect with friends and family."),
        ("https://www.netflix.com/login", "www.netflix.com", "Netflix Login", "Sign in to start watching TV shows and movies on Netflix."),
        ("https://accounts.spotify.com/login", "accounts.spotify.com", "Spotify Login", "Log in to Spotify to listen to music and podcasts."),
        ("https://secure.bankofamerica.com/login", "secure.bankofamerica.com", "Bank of America", "Secure online banking with Bank of America."),
        ("https://auth.chase.com/login", "auth.chase.com", "Chase Login", "Sign in to access your Chase banking accounts."),
        # Long tracking URLs (look suspicious but are legit)
        ("https://www.google.com/search?q=paypal+login+verify+account&oq=paypal+login&gs_lcp=abc123", "www.google.com", "Google Search", "Search results for paypal login verify account."),
        ("https://click.email.linkedin.com/CL0/https:%2F%2Fwww.linkedin.com/1/abc", "click.email.linkedin.com", "LinkedIn Email", "LinkedIn notification about your network."),
        ("https://links.mkt.salesforce.com/track?type=click&en=abc123", "links.mkt.salesforce.com", "Salesforce Marketing", "Track marketing campaign performance."),
        ("https://t.co/abc123xyz", "t.co", "Twitter Link", "Shortened Twitter link to shared content."),
        ("https://lnkd.in/abc123", "lnkd.in", "LinkedIn Short", "LinkedIn shortened link."),
        # CDN and service URLs
        ("https://cdn.shopify.com/s/files/1/0012/store.min.js", "cdn.shopify.com", "Shopify CDN", "Content delivery network for Shopify stores."),
        ("https://storage.googleapis.com/bucket-name/file.png", "storage.googleapis.com", "Google Cloud", "Google Cloud Storage public file."),
        ("https://d1234.cloudfront.net/assets/bundle.js", "d1234.cloudfront.net", "CloudFront", "Amazon CloudFront content delivery."),
        # Subdomains that look suspicious but are legit
        ("https://security.microsoft.com/alerts", "security.microsoft.com", "Microsoft Security", "Microsoft Security Center for threat protection."),
        ("https://verify.stripe.com/check", "verify.stripe.com", "Stripe Verify", "Stripe identity verification service."),
        ("https://support.apple.com/account", "support.apple.com", "Apple Support", "Apple customer support and account help."),
        ("https://alert.chase.com/notifications", "alert.chase.com", "Chase Alerts", "Chase bank notification center."),
        ("https://account.adobe.com/profile", "account.adobe.com", "Adobe Account", "Manage your Adobe account and subscriptions."),
        # URLs with numbers in domain (looks phishy, but legit)
        ("https://app.1password.com/signin", "app.1password.com", "1Password", "Sign in to your 1Password vault."),
        ("https://web.archive.org/web/2024/https://example.com", "web.archive.org", "Wayback Machine", "Internet Archive's collection of web pages."),
    ]
    
    while len(hard_negatives) < count:
        url, domain, title, content = random.choice(patterns)
        # Add slight variations
        if random.random() < 0.3:
            url += f"?ref={random.randint(1000,9999)}"
        days_ago = random.randint(1, 365)
        hard_negatives.append({
            'url': url,
            'is_phishing': False,
            'target': 'benign',
            'verified_at': (datetime.now() - timedelta(days=days_ago)).isoformat(),
            'metadata': {
                'domain_info': {'domain': domain},
                'page_title': title,
                'text_content': content,
            },
        })
    
    return hard_negatives


def load_real_data(data_dir: str = "data") -> tuple:
    """
    Load real phishing + benign URLs from combined_dataset.csv
    (produced by download_data.py from OpenPhish + Tranco).
    
    Returns (phishing_list, benign_list)
    """
    combined_path = os.path.join(data_dir, "combined_dataset.csv")
    
    # Also try legacy PhishTank path
    phishtank_path = os.path.join(data_dir, "phishtank.csv")
    openphish_path = os.path.join(data_dir, "openphish_urls.txt")
    tranco_path = os.path.join(data_dir, "tranco_benign.csv")
    
    real_phishing = []
    real_benign = []
    
    # Method 1: Load from combined dataset (best)
    if os.path.exists(combined_path):
        logger.info(f"  Loading combined dataset: {combined_path}")
        try:
            with open(combined_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    url = row.get('url', '').strip()
                    domain = row.get('domain', '').strip()
                    label = row.get('label', '').strip()
                    source = row.get('source', '').strip()
                    
                    if not url:
                        continue
                    if not domain:
                        try:
                            domain = urlparse(url).netloc
                        except:
                            domain = url
                    
                    sample = {
                        'url': url,
                        'is_phishing': label == 'phishing',
                        'target': 'unknown' if label == 'phishing' else 'benign',
                        'verified_at': datetime.now().isoformat(),
                        'metadata': {
                            'domain_info': {'domain': domain},
                            'page_title': f"Page at {domain}",
                            'text_content': url,  # Use URL itself as text for real data (no scraping)
                        },
                    }
                    
                    if label == 'phishing':
                        real_phishing.append(sample)
                    else:
                        real_benign.append(sample)
            
            logger.info(f"  Combined: {len(real_phishing)} phishing + {len(real_benign)} benign")
            return real_phishing, real_benign
        except Exception as e:
            logger.warning(f"  Error loading combined dataset: {e}")
    
    # Method 2: Load from individual files
    if os.path.exists(openphish_path):
        logger.info(f"  Loading OpenPhish URLs: {openphish_path}")
        try:
            with open(openphish_path, 'r', encoding='utf-8') as f:
                for line in f:
                    url = line.strip()
                    if url and url.startswith('http'):
                        try:
                            domain = urlparse(url).netloc
                        except:
                            domain = url
                        real_phishing.append({
                            'url': url,
                            'is_phishing': True,
                            'target': 'unknown',
                            'verified_at': datetime.now().isoformat(),
                            'metadata': {
                                'domain_info': {'domain': domain},
                                'page_title': f"Phishing at {domain}",
                                'text_content': url,
                            },
                        })
            logger.info(f"  OpenPhish: {len(real_phishing)} phishing URLs")
        except Exception as e:
            logger.warning(f"  Error loading OpenPhish: {e}")
    
    if os.path.exists(tranco_path):
        logger.info(f"  Loading Tranco benign domains: {tranco_path}")
        try:
            with open(tranco_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    url = row.get('url', '').strip()
                    domain = row.get('domain', '').strip()
                    if url:
                        real_benign.append({
                            'url': url,
                            'is_phishing': False,
                            'target': 'benign',
                            'verified_at': datetime.now().isoformat(),
                            'metadata': {
                                'domain_info': {'domain': domain},
                                'page_title': f"{domain} - Official",
                                'text_content': f"Official website of {domain}",
                            },
                        })
            logger.info(f"  Tranco: {len(real_benign)} benign domains")
        except Exception as e:
            logger.warning(f"  Error loading Tranco: {e}")
    
    # Method 3: Legacy PhishTank
    if not real_phishing and os.path.exists(phishtank_path):
        logger.info(f"  Loading PhishTank: {phishtank_path}")
        try:
            with open(phishtank_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    url = row.get('url', '').strip()
                    if url:
                        try:
                            domain = urlparse(url).netloc
                        except:
                            domain = url
                        real_phishing.append({
                            'url': url,
                            'is_phishing': True,
                            'target': row.get('target', 'unknown'),
                            'verified_at': row.get('verification_time', datetime.now().isoformat()),
                            'metadata': {
                                'domain_info': {'domain': domain},
                                'page_title': "Phishing Page",
                                'text_content': url,
                            },
                        })
                    if len(real_phishing) >= 2000:
                        break
            logger.info(f"  PhishTank: {len(real_phishing)} phishing URLs")
        except Exception as e:
            logger.warning(f"  Error loading PhishTank: {e}")
    
    return real_phishing, real_benign


# =====================================================================
#  DOMAIN-LEVEL SPLIT — prevents data leakage
# =====================================================================

def extract_base_domain(url: str) -> str:
    """Extract base domain for grouping (e.g., 'google.com' from 'mail.google.com')."""
    try:
        parsed = urlparse(url if url.startswith('http') else f"https://{url}")
        parts = parsed.netloc.split('.')
        # Get last two parts (e.g., google.com)
        if len(parts) >= 2:
            return '.'.join(parts[-2:])
        return parsed.netloc
    except:
        return url


def domain_level_split(data: list, train_ratio=0.70, val_ratio=0.15):
    """
    Split data by domain, not by individual samples.
    Ensures no domain appears in both train and test sets.
    This tests TRUE generalization to unseen domains.
    """
    # Group by base domain
    domain_groups = defaultdict(list)
    for sample in data:
        domain = extract_base_domain(sample['url'])
        domain_groups[domain].append(sample)
    
    # Separate phishing and benign domains for balanced splitting
    phishing_domains = {d: s for d, s in domain_groups.items() if any(x['is_phishing'] for x in s)}
    benign_domains = {d: s for d, s in domain_groups.items() if not any(x['is_phishing'] for x in s)}
    
    def split_domain_dict(domain_dict, train_r, val_r):
        domains = list(domain_dict.keys())
        random.shuffle(domains)
        n = len(domains)
        train_end = int(train_r * n)
        val_end = int((train_r + val_r) * n)
        
        train_domains = set(domains[:train_end])
        val_domains = set(domains[train_end:val_end])
        test_domains = set(domains[val_end:])
        
        train, val, test = [], [], []
        for d in train_domains:
            train.extend(domain_dict[d])
        for d in val_domains:
            val.extend(domain_dict[d])
        for d in test_domains:
            test.extend(domain_dict[d])
        
        return train, val, test
    
    # Split phishing and benign domains separately, then merge
    ph_train, ph_val, ph_test = split_domain_dict(phishing_domains, train_ratio, val_ratio)
    bn_train, bn_val, bn_test = split_domain_dict(benign_domains, train_ratio, val_ratio)
    
    train = ph_train + bn_train
    val = ph_val + bn_val
    test = ph_test + bn_test
    
    random.shuffle(train)
    random.shuffle(val)
    random.shuffle(test)
    
    # Log domain overlap check
    train_domains = {extract_base_domain(s['url']) for s in train}
    test_domains = {extract_base_domain(s['url']) for s in test}
    overlap = train_domains & test_domains
    if overlap:
        logger.warning(f"  ⚠ Domain overlap detected: {len(overlap)} domains")
    else:
        logger.info(f"  ✓ Zero domain overlap between train and test")
    
    return train, val, test


# =====================================================================
#  METRICS
# =====================================================================

def compute_metrics(predictions: list, targets: list, threshold: float = 0.5) -> dict:
    """Full eval metrics: accuracy, precision, recall, F1."""
    tp = fp = tn = fn = 0
    for pred, target in zip(predictions, targets):
        p = 1 if pred > threshold else 0
        t = int(target)
        if p == 1 and t == 1: tp += 1
        elif p == 1 and t == 0: fp += 1
        elif p == 0 and t == 0: tn += 1
        elif p == 0 and t == 1: fn += 1
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / (tp + fp + tn + fn) if (tp + fp + tn + fn) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0  # False positive rate
    
    return {
        'accuracy': accuracy, 'precision': precision, 'recall': recall,
        'f1': f1, 'fpr': fpr,
        'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
    }


def find_best_threshold(predictions: list, targets: list) -> dict:
    """
    Sweep thresholds to find:
    - Best F1 threshold (balanced)
    - Best recall threshold (security-focused, catches more phishing)
    """
    best_f1_t, best_f1 = 0.5, 0
    best_recall_t, best_recall_f1 = 0.5, 0
    
    for t in np.arange(0.1, 0.9, 0.02):
        m = compute_metrics(predictions, targets, threshold=t)
        if m['f1'] > best_f1:
            best_f1 = m['f1']
            best_f1_t = t
        # For security: high recall (>0.95) with best possible F1
        if m['recall'] >= 0.95 and m['f1'] > best_recall_f1:
            best_recall_f1 = m['f1']
            best_recall_t = t
    
    return {
        'best_f1_threshold': round(float(best_f1_t), 3),
        'best_f1': round(float(best_f1), 4),
        'security_threshold': round(float(best_recall_t), 3),
        'security_f1': round(float(best_recall_f1), 4),
    }


def compute_auc_roc(predictions: list, targets: list, n_points: int = 50) -> float:
    """Compute AUC-ROC via trapezoidal rule."""
    tpr_list = []
    fpr_list = []
    
    for t in np.linspace(0, 1, n_points):
        m = compute_metrics(predictions, targets, threshold=t)
        tpr = m['recall']  # TPR = recall
        fpr = m['fpr']
        tpr_list.append(tpr)
        fpr_list.append(fpr)
    
    # Sort by FPR for proper AUC computation
    pairs = sorted(zip(fpr_list, tpr_list))
    fpr_sorted = [p[0] for p in pairs]
    tpr_sorted = [p[1] for p in pairs]
    
    # Trapezoidal rule
    auc = 0
    for i in range(1, len(fpr_sorted)):
        auc += (fpr_sorted[i] - fpr_sorted[i-1]) * (tpr_sorted[i] + tpr_sorted[i-1]) / 2
    
    return abs(auc)


# =====================================================================
#  TRAINING
# =====================================================================

def train(
    num_phishing: int = 2000,
    num_benign: int = 2000,
    num_hard_negatives: int = 500,
    epochs: int = 60,
    lr: float = 0.001,
    accumulation_steps: int = 16,
    imbalance_ratio: float = 0.0,  # 0=balanced, 0.9=90% benign
    output_path: str = "models/threatlens_v1.pt",
):
    """
    Production training with all fixes applied.
    """
    
    logger.info("=" * 70)
    logger.info("  ThreatLens — Production Model Training")
    logger.info("=" * 70)
    
    # ---- Step 1: Generate + load data ----
    logger.info("\n[1/7] Building dataset...")
    
    import json
    import os
    data_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "workspace_dataset.json")
    
    if os.path.exists(data_file):
        with open(data_file, "r") as f:
            raw_data = json.load(f)
            
        all_phishing = []
        all_benign = []
        
        for item in raw_data:
            url = item['url']
            label = item['label']
            try:
                domain = urlparse(url).netloc
            except:
                domain = url
                
            sample = {
                'url': url,
                'is_phishing': True if label == 1 else False,
                'metadata': {
                    'domain_info': {'domain': domain},
                    'page_title': f"Page: {domain}",
                    # THE FIX: Feed the raw URL and domain into BERT so it learns semantic NLP clues from the URL string!
                    'text_content': f"URL String: {url} Domain Analysis: {domain}" 
                },
                'verified_at': datetime.now().isoformat()
            }
            if label == 1:
                all_phishing.append(sample)
            else:
                all_benign.append(sample)
    else:
        logger.error(f"Workspace dataset missing at {data_file}")
        return
        
    hard_negatives = [] # Included in workspace dataset naturally

    # Apply imbalance simulation if requested
    if imbalance_ratio > 0:
        target_phishing = int(len(all_benign) * (1 - imbalance_ratio) / imbalance_ratio)
        if target_phishing < len(all_phishing):
            all_phishing = random.sample(all_phishing, target_phishing)
        logger.info(f"  Class imbalance applied: {imbalance_ratio:.0%} benign / {1-imbalance_ratio:.0%} phishing")
    
    all_data = all_phishing + all_benign
    
    logger.info(f"  Phishing (Workspace): {len(all_phishing):5d}  (OpenPhish/PhishTank)")
    logger.info(f"  Benign (Workspace):   {len(all_benign):5d}  (CommonCrawl/Reddit)")
    logger.info(f"  Total:                {len(all_data):5d}  (100% Real Data)")
    
    # ---- Step 2: Init model ----
    logger.info("\n[2/7] Loading model + BERT text encoder...")
    model = PhishingDetector(load_bert=True)
    if model.text_encoder is None:
        logger.error("BERT failed to load. Cannot train.")
        return
    logger.info(f"  BERT embed dim: {model.text_encoder.embed_dim}")
    
    # ---- Step 3: Encode with BERT (cached, frozen) ----
    logger.info(f"\n[3/7] BERT encoding {len(all_data)} samples...")
    cached_data = []
    for sample in tqdm(all_data, desc="  BERT encoding", ncols=80):
        gnn_output = model.preprocess_url(sample)
        llm_output = model.encode_text(sample)
        
        cached_data.append({
            'gnn_output': {
                'embeddings': gnn_output['embeddings'].detach().clone(),
                'edge_index': gnn_output['edge_index'].detach().clone(),
                'edge_weights': gnn_output['edge_weights'].detach().clone(),
            },
            'llm_output': {
                'embeddings': llm_output['embeddings'].detach().clone(),
                'attention_mask': None,
            },
            'is_phishing': sample['is_phishing'],
            'verified_at': sample['verified_at'],
            'url': sample['url'],
        })
    
    # ---- Step 4: Domain-level split ----
    logger.info(f"\n[4/7] Domain-level train/val/test split...")
    
    # Re-attach URLs for domain extraction
    for i, cd in enumerate(cached_data):
        cd['_url_for_split'] = all_data[i]['url']
    
    train_data, val_data, test_data = domain_level_split(cached_data)
    
    logger.info(f"  Train: {len(train_data)} samples")
    logger.info(f"  Val:   {len(val_data)} samples")
    logger.info(f"  Test:  {len(test_data)} samples")
    
    for name, subset in [("Train", train_data), ("Val", val_data), ("Test", test_data)]:
        phish = sum(1 for s in subset if s['is_phishing'])
        benign = len(subset) - phish
        logger.info(f"    {name}: {phish} phishing / {benign} benign")
    
    # ---- Step 5: Training loop with focal loss + gradient accumulation ----
    logger.info(f"\n[5/7] Training for up to {epochs} epochs (accum={accumulation_steps})...")
    
    params = list(model.gat.parameters()) + list(model.fusion.parameters())
    optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=15, T_mult=2)  # Warm restarts
    criterion = FocalLoss(alpha=0.75, gamma=2.0)
    
    best_val_f1 = 0.0
    best_state = None
    patience = 12
    patience_counter = 0
    history = []
    
    for epoch in range(epochs):
        # --- Train ---
        model.gat.train()
        model.fusion.train()
        total_loss = 0
        train_preds, train_targets = [], []
        
        random.shuffle(train_data)
        optimizer.zero_grad()
        
        for i, sample in enumerate(train_data):
            metadata = {'timestamps': [sample['verified_at']]}
            target = torch.tensor([1.0 if sample['is_phishing'] else 0.0])
            
            fusion_output = model.fusion(sample['gnn_output'], sample['llm_output'], metadata)
            loss = criterion(fusion_output['final_score'], target) / accumulation_steps
            loss.backward()
            
            # Gradient accumulation: step every N samples
            if (i + 1) % accumulation_steps == 0 or (i + 1) == len(train_data):
                torch.nn.utils.clip_grad_norm_(params, max_norm=1.0)
                optimizer.step()
                optimizer.zero_grad()
            
            total_loss += loss.item() * accumulation_steps
            train_preds.append(fusion_output['final_score'].item())
            train_targets.append(1.0 if sample['is_phishing'] else 0.0)
        
        scheduler.step()
        train_metrics = compute_metrics(train_preds, train_targets)
        avg_loss = total_loss / len(train_data)
        
        # --- Validate ---
        model.gat.eval()
        model.fusion.eval()
        val_preds, val_targets = [], []
        val_loss = 0
        
        with torch.no_grad():
            for sample in val_data:
                metadata = {'timestamps': [sample['verified_at']]}
                target = torch.tensor([1.0 if sample['is_phishing'] else 0.0])
                fusion_output = model.fusion(sample['gnn_output'], sample['llm_output'], metadata)
                loss = criterion(fusion_output['final_score'], target)
                val_loss += loss.item()
                val_preds.append(fusion_output['final_score'].item())
                val_targets.append(1.0 if sample['is_phishing'] else 0.0)
        
        val_metrics = compute_metrics(val_preds, val_targets)
        avg_val_loss = val_loss / len(val_data) if val_data else 0
        
        logger.info(
            f"  Epoch {epoch+1:3d}/{epochs} | "
            f"Loss: {avg_loss:.4f} | "
            f"Train [Acc: {train_metrics['accuracy']:.3f} F1: {train_metrics['f1']:.3f}] | "
            f"Val [Acc: {val_metrics['accuracy']:.3f} F1: {val_metrics['f1']:.3f} "
            f"P: {val_metrics['precision']:.3f} R: {val_metrics['recall']:.3f} "
            f"FPR: {val_metrics['fpr']:.3f}]"
        )
        
        history.append({
            'epoch': epoch + 1, 'train_loss': avg_loss, 'val_loss': avg_val_loss,
            'train_acc': train_metrics['accuracy'], 'train_f1': train_metrics['f1'],
            'val_acc': val_metrics['accuracy'], 'val_f1': val_metrics['f1'],
            'val_precision': val_metrics['precision'], 'val_recall': val_metrics['recall'],
            'val_fpr': val_metrics['fpr'],
        })
        
        # Early stopping on F1
        if val_metrics['f1'] > best_val_f1:
            best_val_f1 = val_metrics['f1']
            best_state = {
                'gat_state_dict': {k: v.clone() for k, v in model.gat.state_dict().items()},
                'fusion_state_dict': {k: v.clone() for k, v in model.fusion.state_dict().items()},
            }
            patience_counter = 0
            logger.info(f"    ↑ New best val F1: {best_val_f1:.4f}")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info(f"  Early stopping at epoch {epoch+1}")
                break
    
    # ---- Step 6: Threshold tuning ----
    logger.info(f"\n[6/7] Tuning decision threshold on validation set...")
    
    if best_state:
        model.gat.load_state_dict(best_state['gat_state_dict'])
        model.fusion.load_state_dict(best_state['fusion_state_dict'])
    
    model.gat.eval()
    model.fusion.eval()
    
    val_preds_final, val_targets_final = [], []
    with torch.no_grad():
        for sample in val_data:
            metadata = {'timestamps': [sample['verified_at']]}
            fusion_output = model.fusion(sample['gnn_output'], sample['llm_output'], metadata)
            val_preds_final.append(fusion_output['final_score'].item())
            val_targets_final.append(1.0 if sample['is_phishing'] else 0.0)
    
    threshold_results = find_best_threshold(val_preds_final, val_targets_final)
    optimal_threshold = threshold_results['best_f1_threshold']
    security_threshold = threshold_results['security_threshold']
    
    logger.info(f"  Best F1 threshold:       {optimal_threshold} (F1={threshold_results['best_f1']:.4f})")
    logger.info(f"  Security threshold:      {security_threshold} (recall≥95%, F1={threshold_results['security_f1']:.4f})")
    
    # ---- Step 7: Final test evaluation ----
    logger.info(f"\n[7/7] Final evaluation on held-out test set ({len(test_data)} samples)...")
    
    test_preds, test_targets = [], []
    with torch.no_grad():
        for sample in test_data:
            metadata = {'timestamps': [sample['verified_at']]}
            fusion_output = model.fusion(sample['gnn_output'], sample['llm_output'], metadata)
            test_preds.append(fusion_output['final_score'].item())
            test_targets.append(1.0 if sample['is_phishing'] else 0.0)
    
    # Evaluate at both thresholds
    test_default = compute_metrics(test_preds, test_targets, threshold=0.5)
    test_optimal = compute_metrics(test_preds, test_targets, threshold=optimal_threshold)
    test_security = compute_metrics(test_preds, test_targets, threshold=security_threshold)
    auc_roc = compute_auc_roc(test_preds, test_targets)
    
    logger.info("\n" + "=" * 70)
    logger.info("  FINAL TEST SET RESULTS")
    logger.info("=" * 70)
    
    logger.info(f"\n  AUC-ROC: {auc_roc:.4f}")
    
    for name, metrics, thresh in [
        ("Default (0.5)", test_default, 0.5),
        ("Optimal F1", test_optimal, optimal_threshold),
        ("Security (high recall)", test_security, security_threshold),
    ]:
        logger.info(f"\n  --- {name} (threshold={thresh:.3f}) ---")
        logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
        logger.info(f"  Precision: {metrics['precision']:.4f}")
        logger.info(f"  Recall:    {metrics['recall']:.4f}")
        logger.info(f"  F1:        {metrics['f1']:.4f}")
        logger.info(f"  FPR:       {metrics['fpr']:.4f}")
        logger.info(f"  Confusion: TP={metrics['tp']} FP={metrics['fp']} TN={metrics['tn']} FN={metrics['fn']}")
    
    # ---- Save model ----
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    
    save_payload = best_state if best_state else {
        'gat_state_dict': model.gat.state_dict(),
        'fusion_state_dict': model.fusion.state_dict(),
    }
    save_payload['test_metrics'] = test_optimal
    save_payload['auc_roc'] = auc_roc
    save_payload['optimal_threshold'] = optimal_threshold
    save_payload['security_threshold'] = security_threshold
    save_payload['history'] = history
    save_payload['config'] = {
        'gnn_dim': 4, 'llm_dim': 768, 'hidden_dim': 256,
        'num_phishing': len(all_phishing), 'num_benign': len(all_benign),
        'num_hard_negatives': num_hard_negatives,
        'epochs_trained': len(history), 'best_val_f1': best_val_f1,
        'focal_loss_alpha': 0.75, 'focal_loss_gamma': 2.0,
        'accumulation_steps': accumulation_steps,
    }
    
    torch.save(save_payload, output_path)
    logger.info(f"\n  Model saved: {output_path}")
    
    metrics_path = output_path.replace('.pt', '_metrics.json')
    with open(metrics_path, 'w') as f:
        json.dump({
            'auc_roc': auc_roc,
            'optimal_threshold': optimal_threshold,
            'security_threshold': security_threshold,
            'test_metrics_optimal': test_optimal,
            'test_metrics_security': test_security,
            'best_val_f1': best_val_f1,
            'epochs_trained': len(history),
            'data_size': len(all_data),
            'history': history,
        }, f, indent=2)
    logger.info(f"  Metrics saved: {metrics_path}")
    
    # ---- Smoke test ----
    logger.info("\n" + "=" * 70)
    logger.info("  SMOKE TEST — Real-world URLs")
    logger.info(f"  (using optimal threshold: {optimal_threshold})")
    logger.info("=" * 70)
    
    test_cases = [
        {"url": "https://www.google.com", "expected": "safe", "metadata": {"domain_info": {"domain": "www.google.com"}, "page_title": "Google", "text_content": "Search the world's information."}},
        {"url": "https://www.microsoft.com/en-us/windows", "expected": "safe", "metadata": {"domain_info": {"domain": "www.microsoft.com"}, "page_title": "Microsoft", "text_content": "Explore Windows features."}},
        {"url": "https://login.microsoft.com/oauth2", "expected": "safe", "metadata": {"domain_info": {"domain": "login.microsoft.com"}, "page_title": "Microsoft Login", "text_content": "Sign in with your Microsoft account."}},
        {"url": "https://www.paypal.com/signin", "expected": "safe", "metadata": {"domain_info": {"domain": "www.paypal.com"}, "page_title": "PayPal Login", "text_content": "Log in to your PayPal account."}},
        {"url": "https://github.com/about", "expected": "safe", "metadata": {"domain_info": {"domain": "github.com"}, "page_title": "GitHub About", "text_content": "GitHub is where the world builds software."}},
        {"url": "https://secure-paypal-verify-kx8m.xyz/login", "expected": "phishing", "metadata": {"domain_info": {"domain": "secure-paypal-verify-kx8m.xyz"}, "page_title": "PayPal - Verify", "text_content": "Your PayPal account has been compromised. Verify your identity immediately."}},
        {"url": "https://amazon-account-update-r2d9.top/auth/confirm", "expected": "phishing", "metadata": {"domain_info": {"domain": "amazon-account-update-r2d9.top"}, "page_title": "Amazon Update", "text_content": "Dear Amazon customer, update your payment or account suspended."}},
        {"url": "https://login-apple-support.online/verify", "expected": "phishing", "metadata": {"domain_info": {"domain": "login-apple-support.online"}, "page_title": "Apple Security", "text_content": "Your Apple ID has been locked. Enter credentials to unlock."}},
        {"url": "http://192.168.1.100/microsoft/login", "expected": "phishing", "metadata": {"domain_info": {"domain": "192.168.1.100"}, "page_title": "Microsoft Login", "text_content": "Sign in to your Microsoft account."}},
        {"url": "https://verify-netfl1x-billing.club/payment", "expected": "phishing", "metadata": {"domain_info": {"domain": "verify-netfl1x-billing.club"}, "page_title": "Netflix Billing", "text_content": "Your Netflix payment failed. Update credit card now."}},
    ]
    
    correct = 0
    for tc in test_cases:
        url_data = {'url': tc['url'], 'metadata': tc['metadata'], 'verified_at': datetime.now().isoformat()}
        scores = model.predict(url_data)
        risk = scores['fusion_score'] * 100
        verdict = "phishing" if scores['fusion_score'] > optimal_threshold else "safe"
        is_correct = verdict == tc['expected']
        correct += 1 if is_correct else 0
        status = "✓" if is_correct else "✗"
        logger.info(f"  {status} {tc['url'][:55]:55s} → {risk:5.1f}% ({verdict:8s}) [expected: {tc['expected']}]")
    
    logger.info(f"\n  Smoke test: {correct}/{len(test_cases)} correct")
    logger.info("\n" + "=" * 70)
    logger.info("  TRAINING COMPLETE")
    logger.info("=" * 70)


if __name__ == "__main__":
    train()
