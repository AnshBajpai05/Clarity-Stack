from signal_classify import classify_signal

tests = [
    "We need to deploy the backend API to production",
    "Database connection timeout issue in staging server",
    "Fix the crash in the payment pipeline ASAP",
    "Rewrite the model training notebook for Kaggle",
    "good morning",
    "lol this is funny haha",
    "what's up bro",
    "ok",
]

for t in tests:
    print("\nTEXT:", t)
    print("SIGNAL:", classify_signal(t))
