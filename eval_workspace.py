import json
import logging
import torch
import time
from model import PhishingDetector
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

def evaluate_workspace():
    model = PhishingDetector(model_path="models/threatlens_v1.pt", load_bert=True)
    model.gat.eval()
    model.fusion.eval()

    with open("backend/data/workspace_dataset.json", "r") as f:
        data = json.load(f)

    logger.info(f"Loaded {len(data)} URLs from workspace dataset.")
    
    tp, fp, fn, tn = 0, 0, 0, 0
    failures = []

    for item in data:
        url = item['url']
        label = item['label'] # 1 is phishing, 0 is benign
        
        # Build mock metadata format the model requires
        # In the future we use scrape_url but doing fast simulation here
        sample = {
            'url': url,
            'metadata': {
                'domain_info': {'domain': url}, 
                'text_content': url,
                'page_title': "Web Page"
            },
            'verified_at': datetime.now().isoformat()
        }
        
        score_dict = model.predict(sample)
        fusion_score = score_dict['fusion_score']
        
        pred = 1 if fusion_score > 0.65 else 0
        
        if pred == 1 and label == 1:
            tp += 1
        elif pred == 1 and label == 0:
            fp += 1
            failures.append(('FP', url, fusion_score))
        elif pred == 0 and label == 1:
            fn += 1
            failures.append(('FN', url, fusion_score))
        else:
            tn += 1

    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    
    logger.info("====================================")
    logger.info("WORKSPACE DATASET METRICS")
    logger.info("====================================")
    logger.info(f"Recall (Catch rate): {recall*100:.2f}%")
    logger.info(f"False Positive Rate: {fpr*100:.2f}%")
    logger.info(f"TP: {tp} | FP: {fp}")
    logger.info(f"FN: {fn}  | TN: {tn}")
    logger.info("====================================")
    
    logger.info("\nTOP 5 FALSE POSITIVES (Model thought it was phishing but it was benign):")
    fps = [x for x in failures if x[0] == 'FP']
    for _, u, s in sorted(fps, key=lambda x: -x[2])[:5]:
        logger.info(f"[{s:.2f}] {u}")
        
    logger.info("\nTOP 5 FALSE NEGATIVES (Model thought it was safe but it was phishing):")
    fns = [x for x in failures if x[0] == 'FN']
    for _, u, s in sorted(fns, key=lambda x: x[2])[:5]:
        logger.info(f"[{s:.2f}] {u}")


if __name__ == "__main__":
    evaluate_workspace()
