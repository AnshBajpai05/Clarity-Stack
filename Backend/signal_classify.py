"""
Signal classifier — ML path (DistilBERT fine-tuned) with keyword-heuristic fallback.

The fine-tuned model weights may not be committed to the repo.  If loading fails
the module transparently falls back to a lightweight rule-based classifier so the
backend still boots and runs correctly.  Add the model weights to Signal_Classifier/
to re-enable the ML path automatically.
"""

import os
import re

LABELS = ["high", "medium", "low", "noise"]
MODEL_PATH = "./Signal_Classifier"

# ── Try to load the ML model ──────────────────────────────────────────────────
_model = None
_tokenizer = None
_device = "cpu"

def _try_load_model():
    global _model, _tokenizer, _device
    weights = os.path.join(MODEL_PATH, "model.safetensors")
    pt_weights = os.path.join(MODEL_PATH, "pytorch_model.bin")
    if not (os.path.exists(weights) or os.path.exists(pt_weights)):
        return False
    try:
        import torch
        from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
        _tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_PATH)
        _model = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        _model.to(_device)
        _model.eval()
        print("[SignalClassifier] ✅ ML model loaded from", MODEL_PATH)
        return True
    except Exception as e:
        print(f"[SignalClassifier] ⚠️  ML model load failed ({e}), using heuristic fallback.")
        _model = None
        return False

_ML_AVAILABLE = _try_load_model()


# ── Heuristic fallback ────────────────────────────────────────────────────────
_NOISE_PATTERNS = re.compile(
    r"^\s*(ok|okay|sure|thanks|thank you|lol|haha|yes|no|k|got it|noted|cool|nice|bye|hello|hi)\s*[!.?]*\s*$",
    re.IGNORECASE
)

_HIGH_KEYWORDS = [
    "requirement", "decision", "deadline", "blocker", "constraint", "must", "shall",
    "critical", "architecture", "spec", "design", "api", "contract", "risk",
    "tradeoff", "conflict", "budget", "milestone", "scope", "deliverable",
]

_MEDIUM_KEYWORDS = [
    "idea", "suggest", "consider", "might", "could", "option", "alternative",
    "issue", "problem", "question", "discuss", "review", "feedback", "concern",
]

def _heuristic_classify(text: str) -> str:
    text_lower = text.lower()
    if _NOISE_PATTERNS.match(text) or len(text.split()) < 3:
        return "noise"
    score_high = sum(1 for kw in _HIGH_KEYWORDS if kw in text_lower)
    score_medium = sum(1 for kw in _MEDIUM_KEYWORDS if kw in text_lower)
    if score_high >= 2:
        return "high"
    if score_high == 1 or score_medium >= 2:
        return "medium"
    if len(text.split()) > 10:
        return "medium"
    return "low"


# ── Public API ────────────────────────────────────────────────────────────────
def classify_signal(text: str) -> str:
    if _ML_AVAILABLE and _model is not None:
        import torch
        inputs = _tokenizer(
            text, truncation=True, padding=True, return_tensors="pt"
        ).to(_device)
        with torch.no_grad():
            logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        cls = torch.argmax(probs).item()
        return LABELS[cls]
    return _heuristic_classify(text)
