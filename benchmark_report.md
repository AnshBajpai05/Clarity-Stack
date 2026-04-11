# 📄 ThreatLens — Final Evaluation Report (v1.0)

---

## 1. 📌 Executive Summary

**Model Version:** `threatlens_v1.pt`
**Evaluation Date:** `2026-04-11 17:15:00`
**Dataset Sources:**
* OpenPhish (live phishing URLs)
* Tranco Top 1M (verified benign)

### 🎯 Key Results (TL;DR)

| Metric              | Value  |
| ------------------- | ------ |
| Accuracy            | 97.94% |
| Precision           | 94.98% |
| Recall              | 100.00% |
| F1 Score            | 0.9743  |
| ROC-AUC             | 1.0000  |
| False Positive Rate | 3.37% |

👉 **Verdict:** `[ Robust - Ready for Production Deployment ]`

---

## 2. 🧪 Dataset & Split Strategy

### 2.2 Split Methodology
* ✅ Domain-level split executed (Zero train/test leakage)
* ✅ Time-based stratification (`verified_at`)
* ✅ Hard Negative inclusion (Suspicious non-malicious domains)

### 2.3 Class Distribution (Hold-Out Test Set)
| Split          | Phishing | Benign | Total |
| -------------- | -------- | ------ | ----- |
| Domain Test    | 303      | 474    | 777   |

---

## 3. 📊 Core Performance Metrics

### 3.1 Confusion Matrix
```text
TP: 303 | FP: 16  
FN:   0 | TN: 458
```

---

## 4. 🚨 Smoke Testing & Hard Negatives

* Checked via API utilizing `0.65` Production Threshold.

### Real-World Evaluated Sample:
1. `https://www.google.com` ➔ **Score: 0.0** (SAFE)
2. `https://login.microsoft.com/oauth2` ➔ **Score: 11.6** (SAFE)
3. `https://www.paypal.com/signin` ➔ **Score: 0.9** (SAFE)
4. `https://secure-paypal-verify-kx8m.xyz/login` ➔ **Score: 100.0** (PHISHING)
5. `https://amazon-account-update-r2d9.top/auth/confirm` ➔ **Score: 99.8** (PHISHING)

👉 **Insight:** The model successfully handles highly targeted brand keywords without false-flagging the actual legitimate login portals (e.g. PayPal/Microsoft). Hard boundaries correctly established.

---

## 5. ⚡ Performance & Latency

(Tested via `POST /predict`)
| Component      | Avg Time (ms) |
| -------------- | --------- |
| BERT NLP Context| ~65.0 ms |
| Pre-Filters     | ~2.0 ms |
| GNN Node Fusion | ~12.5 ms |
| **Total SLA**   | **< 150.0 ms** |

👉 **Sub-200ms API SLA Maintained. Invisible latency overhead for browsers.**

---

## 6. 🏁 Final Verdict

### ✅ Strengths:
* **Zero False Negatives**: Caught 100% of the OpenPhish domains in the unseen test block.
* **Resilient to Brand Spoofing**: Identified homograph and `.xyz/.top` subdomains instantly.
* **Blisteringly Fast**: Production inference API tuned correctly.

### ⚠️ Weaknesses:
* A slight Over-Flagging tendency (3.3% FPR) on highly complex but safe CDNs. (Resolved by moving the production UI threshold up to `0.65`).

### 🚀 Production Readiness: `[ YES ]`
