import asyncio
from app import run_prediction, startup_load_model

async def test_variability():
    await startup_load_model()
    targets = [
        "http://amajan.com",
        "http://paypa1.com",
        "http://faceb00k-verify.com"
    ]
    print("\n--- ML SCORE VARIABILITY TEST ---")
    for t in targets:
        res = await run_prediction(t)
        gnn = res['scores']['gnn_score']
        llm = res['scores']['llm_score']
        fusion = res['scores']['fusion_score']
        risk = res['risk_score']
        print(f"URL: {t}")
        print(f"  GNN: {gnn:.4f} | LLM: {llm:.4f} | Fusion: {fusion:.4f} | Final Risk: {risk}")
        print(f"  Reasons: {res['reasons']}")
        print("-" * 30)

if __name__ == "__main__":
    asyncio.run(test_variability())
