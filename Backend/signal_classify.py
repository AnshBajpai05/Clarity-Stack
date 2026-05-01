import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

LABELS = ["high", "medium", "low", "noise"]

MODEL_PATH = "./signal_classifier"

tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_PATH)
model = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
model.eval()


def classify_signal(text: str) -> str:
    inputs = tokenizer(
        text,
        truncation=True,
        padding=True,
        return_tensors="pt"
    ).to(device)

    with torch.no_grad():
        logits = model(**inputs).logits

    probs = torch.softmax(logits, dim=-1)[0]
    cls = torch.argmax(probs).item()

    return LABELS[cls]
