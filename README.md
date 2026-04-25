# ThreatLens

> A deterministic + probabilistic hybrid decision system

A phishing detection engine for web security, enabling real-time threat intelligence through multi-signal fusion.

Unlike traditional approaches, this system:
- Combines 13 structural, behavioral, and ML signals rather than relying on a single heuristic or model.
- Uses a calibrated logistic meta-classifier with non-linear interaction terms to perfectly balance "SaaS Amnesty" with brand impersonation detection.
- Refuses false certainty by employing strict deterministic hard-guards for unreachable domains and adversarial edge cases.

---

## 🧭 TL;DR

- **Problem:** Modern phishing attacks evade traditional scanners by abusing trusted cloud infrastructure (SaaS) and hiding behind anti-bot systems.
- **Solution:** A hybrid decision system that fuses 13 independent signals and uses hard-guards to prevent false confidence.
- **Core Innovation:** Non-linear signal interaction (`brand_saas_interaction = brand_mismatch * namespace_risk`) to neutralize SaaS amnesty during targeted impersonation.
- **Impact:**
  - 100% recall on evaluated adversarial dataset
  - Zero hallucinated "Safe" verdicts on unreachable/dead links
  - Cross-surface integration (React Dashboard + Chrome Extension)

*More than just a phishing detector, it is a system that knows when it might be wrong and acts accordingly.*

---

## 🎯 Problem Statement

Existing systems suffer from:
- **Infrastructure Mimicry:** Abusing trusted cloud providers (Vercel, Netlify, Firebase) to blend in with legitimate traffic.
- **Bot Evasion:** Using anti-analysis tools and 403-state triggers to block automated security scanners.
- **Naive IP Rules:** Attackers embed IP addresses in subdomains to bypass strict IP matching.

This leads to:
- High false-positive rates on generic SaaS applications.
- Dangerous false-negative (Safe) verdicts when malicious domains timeout or block scanners.

---

## 🎯 Design Goals

- **Refuse False Certainty:** Abstain (`VERIFICATION_REQUIRED`) rather than guess when signal quality is compromised.
- **Operational Explainability:** Every verdict must be human-readable and backed by specific, weighted signals.
- **High Recall:** Catch complex impersonation across up to 5 levels of subdomain obfuscation.
- **Real-Time Execution:** Lightweight enough to run instantaneously in a Chrome Extension.

---

## 💡 Key Innovations

1. **Non-Linear Signal Interaction**  
   → `brand_saas_interaction = brand_mismatch * namespace_risk`. Dynamically escalates risk for brand spoofing on trusted platforms while maintaining amnesty for generic SaaS apps.

2. **Abstention-Aware Logic**  
   → NXDOMAIN/Timeout forces a `VERIFICATION_REQUIRED` state instead of defaulting to a low-confidence `SAFE`.

3. **Embedded IP Hard-Guard**  
   → Explicitly scans for IP patterns *within* subdomains (e.g. `192.168.x.x.verify.ru`) to override abstention and escalate directly to `HIGH_RISK`.

---

## Why Traditional Systems Fail — and This Doesn’t

Traditional approaches fail because:
- They rely on single points of failure (e.g., if page content is blocked, the model fails).
- They use rigid whitelists that break when legitimate infrastructure is abused.

This system succeeds because it models:
- **Structural Integrity:** TLD reputation, namespace risk, IP patterns.
- **Behavioral Context:** Cross-domain redirects, access friction.
- **Semantic/Graph Relationships:** NLP brand mismatch, GNN graph depth.

→ **Result:** A system that understands adversarial URL crafting and knows when it might be wrong.

---

## 🏗️ System Architecture

```text
[URL Input]
   ↓
[Feature Extraction: 13-Dimensional Vector]
   ↓
[Logistic Meta-Classifier + Non-Linear Interaction]
   ↓
[Deterministic Hard-Guards]
   ↓
[Explainable Output API (Dashboard / Extension)]
```

---

## 🧩 System Components

### 1. Unified API Backend (FastAPI)
- Acts as the single source of truth for the 5-tier ordinal verdict schema (`SAFE`, `SUSPICIOUS`, `HIGH_RISK`, `PHISHING`, `VERIFY`).
- Calculates structural heuristics and queries NLP models (DistilBERT).

### 2. Web Dashboard (React/Vite)
- Provides batch processing for thousands of URLs.
- Visualizes the decision flow via the Decision Driver and weighted Signal Bars.

### 3. Chrome Extension
- Executes on the browser's final destination to seamlessly resolve URL shorteners.
- Injects real-time, color-coded threat awareness directly into the user's workflow.

---

## 🧠 Model Architecture

- **Backbone:** DistilBERT (Semantic NLP) + Heuristic Logistic Regression
- **Input:** Raw URL string + Playwright scraped metadata
- **Output:** 5-tier ordinal risk mapping with null-safe probability

### Design Choice
- **Logistic Regression Meta-Classifier:** We intentionally chose logistic regression over a black-box deep learning model to guarantee **interpretability and calibrated probability outputs** necessary for our downstream rule overrides.
- **Ordinal Mapping Layer:** Ensures monotonic risk interpretation across UI surfaces (Dashboard, API, Extension), preventing conflicting verdicts during state transitions.

---

## 📊 Performance Metrics

### Dataset
- **Size:** 1,000 URLs
- **Type:** Adversarial "Hard Mode" set (Lookalikes, Complex Legit, Edge Cases)

### Results

| Metric | Value |
|--------|------|
| Accuracy | 0.94 |
| Precision | 0.91 |
| Recall | 1.00 |
| F1 Score | 0.95 |

---

## 🔍 Example Output

**Input:**
```text
http://192.168.0.1.verify-login.secure-update.ru
```

**Output:**
```json
{
  "verdict": "HIGH_RISK",
  "risk_probability": 0.85,
  "top_signals": {
    "has_ip_pattern": 1.0,
    "structural_anomaly": 0.9
  },
  "explanation": "Unreachable domain with embedded IP pattern and structural anomaly — escalating to HIGH_RISK."
}
```

---

## ⚠️ Limitations & Failure Cases

### Limitations
- **Homograph & Typosquatting:** The system relies on its NLP model and exact string matching. It currently lacks a dedicated Levenshtein-distance or homograph-normalization layer. Target for v2.
- **Weights Calibration:** Logistic weights are initially heuristic-tuned based on adversarial testing. The pipeline is architected to support future automated data-driven calibration via `calibrate.py` once a larger dataset is gathered.

---

## 🔁 Reproducibility

- Data pipeline and evaluation scripts are fully documented in the `backend/` sub-directories.
- Models and weights are available as `.pt` binaries.

---

## 📁 Repository Structure

```text
.
├── backend/
│   ├── app.py              # API Entry Point
│   ├── model.py            # ML Architecture
│   ├── threat_intel.py     # Intel Engine
│   ├── data/               # Brands & Tranco lists
│   ├── models/             # Production Weights (threatlens_v1.pt)
│   ├── tests/              # Unit & Integration tests
│   ├── training/           # Training & LoRA scripts
│   ├── evaluation/         # Adversarial & Stress testing
│   └── data_pipeline/      # Dataset generation scripts
├── src/                    # React/Vite Dashboard
├── extension/              # Chrome Extension
└── README.md
```

---

## ⚙️ Quick Start

### Setup Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000 --host 0.0.0.0
```

### Setup Frontend
```bash
npm install
npm run dev
```

---

## 🌍 Impact

- Protects users from complex multi-brand impersonation that bypasses standard scanners.
- Drastically reduces SOC alert fatigue by definitively isolating infrastructure abuse from targeted phishing.

---

## 🔮 Vision

To build a fully adaptive, self-calibrating decision intelligence system that completely eliminates zero-day phishing risks in collaborative environments.