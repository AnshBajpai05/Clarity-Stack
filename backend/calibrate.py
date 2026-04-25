import csv
import asyncio
import numpy as np
import os
from sklearn.linear_model import LogisticRegression

# Import the prediction logic from app.py
from app import run_prediction, startup_load_model
import app as app_mod

DATA_PATH = "backend/data/urls.csv"
WEIGHTS_FILE = "backend/data/weights.txt"
CONCURRENCY = 50  # Increased to 50 for faster dead URL processing

# -----------------------------
# Extract signals
# -----------------------------
async def process_url(url, label, semaphore):
    async with semaphore:
        try:
            # 15s timeout for deep scans
            result = await asyncio.wait_for(run_prediction(url), timeout=15.0)
            signals = result.get("signals", {})
            feature_vector = [
                signals.get("namespace_risk", 0),
                signals.get("access_friction", 0),
                signals.get("structural_anomaly", 0),
                signals.get("uncertainty", 0),
                signals.get("is_shortener", 0),
                signals.get("is_ip", 0),
                signals.get("is_unreachable", 0),
                signals.get("gnn_score", 0.5),
                signals.get("nlp_score", 0.5),
                signals.get("visual_score", 0),
                signals.get("redirect_depth", 0),
                signals.get("brand_mismatch", 0),
                signals.get("redirect_trust", 1.0),
            ]
            return feature_vector, label
        except Exception:
            return None, None

async def extract_signals():
    print("[+] Initializing system globals (Models + Intel)...")
    await startup_load_model()
    
    if not os.path.exists(DATA_PATH):
        print(f"[!] Dataset not found at {DATA_PATH}")
        return None, None

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        print(f"[+] Running on FULL dataset ({len(rows)} URLs). Fluid Parallel mode (C={CONCURRENCY}).")

    semaphore = asyncio.Semaphore(CONCURRENCY)
    X = []
    y = []
    
    feature_names = [
        "namespace", "access", "struct", "uncert", "short", "is_ip", "dead",
        "gnn", "nlp", "visual", "depth", "brand_m", "trust"
    ]

    async def wrapped_process(row):
        fv, lbl = await process_url(row["url"], int(row["label"]), semaphore)
        if fv:
            X.append(fv)
            y.append(lbl)
            
            # Progress tracking
            count = len(X)
            if count % 50 == 0:
                print(f"[+] Progress: {count} extracted.")
            
            # Diversity check every 200
            if count >= 200 and count % 200 == 0:
                data = np.array(X)
                means = np.mean(data, axis=0)
                stds = np.std(data, axis=0)
                print("\n--- [SIGNAL DIVERSITY CHECK] ---")
                print(f"{'Signal':<12} | {'Mean':<8} | {'Std':<8}")
                print("-" * 35)
                for idx, name in enumerate(feature_names):
                    print(f"{name:<12} | {means[idx]:<8.4f} | {stds[idx]:<8.4f}")
                print("--------------------------------\n")

    # Run everything in a single gather but limited by semaphore
    await asyncio.gather(*[wrapped_process(row) for row in rows])

    return np.array(X), np.array(y)

# -----------------------------
# Train Logistic Regression
# -----------------------------
def train_model(X, y):
    print(f"[+] Training Logistic Regression on {len(X)} samples...")
    model = LogisticRegression(max_iter=2000, class_weight='balanced')
    model.fit(X, y)

    weights = model.coef_[0]
    bias = model.intercept_[0]

    feature_names = [
        "namespace_risk", "access_friction", "structural_anomaly", 
        "uncertainty", "is_shortener", "is_ip", "is_unreachable", 
        "gnn_score", "nlp_score", "visual_score", "redirect_depth",
        "brand_mismatch", "redirect_trust"
    ]

    print("\nLearned Weights:")
    for name, w in zip(feature_names, weights):
        print(f"{name:<20}: {w:.4f}")
    print(f"\nBias: {bias:.4f}")
    print(f"[+] Training Accuracy: {model.score(X, y):.4f}")

    return weights, bias

# -----------------------------
# Save weights
# -----------------------------
def save_weights(weights, bias):
    os.makedirs(os.path.dirname(WEIGHTS_FILE), exist_ok=True)
    with open(WEIGHTS_FILE, "w") as f:
        f.write("# ThreatLens Learned Weights (Full 10k Calibration)\n")
        f.write("weights = [\n")
        for w in weights:
            f.write(f"    {w:.6f},\n")
        f.write("]\n")
        f.write(f"bias = {bias:.6f}\n")
    print(f"[+] Saved to {WEIGHTS_FILE}")

async def main():
    X, y = await extract_signals()
    if X is not None and len(X) > 0:
        weights, bias = train_model(X, y)
        save_weights(weights, bias)
        print("\n[SUCCESS] Full calibration complete.")
    else:
        print("[ERROR] Calibration failed.")

if __name__ == "__main__":
    asyncio.run(main())
