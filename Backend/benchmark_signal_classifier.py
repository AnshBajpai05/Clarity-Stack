import random
from signal_classify import classify_signal
from collections import Counter

TECH_MESSAGES = [
    "We need to deploy the backend API to production",
    "Database connection timeout issue in staging server",
    "Fix the crash in the payment pipeline ASAP",
    "Rewrite the model training notebook for Kaggle",
    "We need to rotate API keys for security",
    "Auth token keeps expiring every 30 minutes",
    "Latency increased after we shipped the new build",
    "Need to optimize the SQL index for this table",
    "Push the docker image to ECR",
    "Restart the kubernetes pod on staging",
    "Model training crashed due to CUDA OOM",
    "CI build is failing due to dependency conflict",
    "User session invalidation isn’t working",
]

MEDIUM_MESSAGES = [
    "We should talk about the roadmap soon",
    "Can we refactor this later?",
    "Let's discuss architecture options",
    "Is there a better way to do this?",
    "What framework are we using?",
    "The UI feels slow sometimes",
    "We should document this",
]

LOW_MESSAGES = [
    "okay got it",
    "hmm makes sense",
    "sounds good",
    "that might work",
    "maybe later",
    "cool cool",
    "nice idea",
]

NOISE_MESSAGES = [
    "lol",
    "gm",
    "yo bro",
    "hahaha",
    "😂😂😂",
    "what's up",
    "ok",
    "hi",
    "hello",
    "yooo",
    "sup",
    "lmao",
]


def random_dataset(n: int):
    data = []
    for _ in range(n):
        group = random.choices(
            ["tech", "medium", "low", "noise"],
            weights=[0.35, 0.25, 0.2, 0.2]
        )[0]

        if group == "tech":
            msg = random.choice(TECH_MESSAGES)
            expected = "high"
        elif group == "medium":
            msg = random.choice(MEDIUM_MESSAGES)
            expected = "medium"
        elif group == "low":
            msg = random.choice(LOW_MESSAGES)
            expected = "low"
        else:
            msg = random.choice(NOISE_MESSAGES)
            expected = "noise"

        data.append((msg, expected))

    return data


def run_benchmark(n=500):
    dataset = random_dataset(n)

    confusion = Counter()
    totals = Counter()

    for msg, expected in dataset:
        pred = classify_signal(msg)
        key = (expected, pred)
        confusion[key] += 1
        totals[expected] += 1

    print("\n📊 RESULTS\n")

    levels = ["high", "medium", "low", "noise"]

    for exp in levels:
        print(f"\nExpected = {exp.upper()}")
        for pred in levels:
            count = confusion[(exp, pred)]
            print(f"  predicted {pred:<6} → {count}")

    print("\n🎯 ACCURACY BY CLASS\n")
    for exp in levels:
        correct = confusion[(exp, exp)]
        total = totals[exp]
        acc = (correct / total * 100) if total else 0
        print(f"{exp:<6} → {acc:5.1f}%  ({correct}/{total})")

    overall = sum(confusion[(x, x)] for x in levels) / n * 100
    print(f"\n⭐ OVERALL ACCURACY: {overall:.2f}%\n")


if __name__ == "__main__":
    run_benchmark(1000)
