Here you go — clean, ready-to-use **`TODO.md`** file for your repo 👇

---

````md
# 🧠 ThreatLens Roadmap

A structured roadmap to evolve ThreatLens from a strong MVP into a production-grade security system.

---

# ✅ V1.1 — Trust & Accuracy Patch (Immediate)

## 🎯 Goal
Fix credibility issues and make the system demo-ready.

---

## 🔴 Core Fixes (MANDATORY)

### 1. Reachability Logic Fix
- [ ] Replace incorrect `offline` classification
- [ ] Introduce proper states:
  - `offline` → DNS fail / NXDOMAIN
  - `limited` → timeout / bot-blocked
- [ ] Ensure live sites never show `OFFLINE` incorrectly

---

### 2. Content Score Reliability Guard
- [ ] Add `content_length` validation
- [ ] If below threshold:
  - [ ] Set `content_score = None`
  - [ ] Mark as `UNAVAILABLE`
- [ ] UI label:
  - `"Low reliability content"`

---

### 3. Confidence Calibration Patch
- [ ] Add trusted-domain override:
```python
if trusted_domain and no_threat_signals:
    confidence = "high"
````

* [ ] Prevent safe domains from showing LOW confidence

---

### 4. Offline Phishing Explanation

* [ ] Add UI message:

```
Verdict based on structural heuristics only
```

* [ ] Display near score / decision driver

---

### 5. UX Consistency Cleanup

* [ ] Standardize labels:

  * AVAILABLE / LIMITED / UNAVAILABLE
  * STRONG / WEAK
* [ ] Remove misleading ❌ indicators

---

## ✅ Output of V1.1

* Demo-safe
* Trustworthy UI
* No contradictory signals
* Ready for team sharing

---

# 🚀 V2 — Intelligence & Depth Upgrade

## 🎯 Goal

Move beyond heuristics → true multi-signal intelligence system

---

## 🔵 GNN Upgrade (Real Utilization)

### Current Issue:

Single-node graphs → weak signal

### Tasks:

* [ ] Activate GNN only when:

  * redirects exist
  * multiple URLs detected
* [ ] Build:

  * redirect graph
  * HTML link graph
* [ ] UI:

```
Graph Depth: STRONG / WEAK
```

---

## 🔵 Threat Intelligence Integration

* [ ] Integrate APIs:

  * Google Safe Browsing
  * PhishTank
  * VirusTotal (optional)
* [ ] Cache responses
* [ ] Display:

```
Threat Intel Confidence %
```

---

## 🔵 Domain Reputation System

* [ ] Build trusted domain list (Top domains)
* [ ] Optional: WHOIS / domain age
* [ ] Add:

```
Trusted Domain Boost
```

---

## 🔵 Advanced URL Detection

* [ ] Homoglyph detection (e.g. micr0soft)
* [ ] Unicode spoof detection
* [ ] Suspicious keyword clustering
* [ ] Domain entropy scoring

---

## 🔵 Content Intelligence Upgrade

* [ ] Detect:

  * login forms
  * password fields
  * phishing keywords
* [ ] Add:

```
Credential Harvest Risk
```

---

## 🔵 Confidence Engine v2

* [ ] Move to weighted scoring system
* [ ] Include:

  * signal reliability
  * data availability
  * model agreement

---

## 🔵 Performance & Infra

* [ ] Add caching (Redis or in-memory)
* [ ] Batch scanning support
* [ ] Optimize timeouts

---

# 💎 V3 — Advanced (Optional)

## 🎯 Goal

Push toward enterprise / research-grade system

* [ ] Browser sandbox (Playwright)
* [ ] Screenshot-based phishing detection
* [ ] Logo / visual similarity detection
* [ ] Train GNN on real phishing datasets
* [ ] Chrome extension

---

# 🧭 Priority Order

1. V1.1 fixes (trust & correctness)
2. Share / demo / team integration
3. V2 intelligence upgrades
4. Advanced detection
5. Scaling & performance

---

# 🧠 Product Positioning

* **V1** → Explainable phishing detection system
* **V2** → Multi-signal intelligence engine
* **V3** → Autonomous threat analysis platform

---

# 🏁 Summary

* V1.1 → Fix trust
* V2 → Add intelligence
* V3 → Scale & differentiate

---

```

---

If you want next, I can:
- turn this into **GitHub Issues automatically**
- or write a **🔥 README that makes this look like a startup product**

Just say 👍
```
