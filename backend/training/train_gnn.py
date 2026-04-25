import os
import torch
import torch.nn as nn
from torch_geometric.loader import DataLoader
from sklearn.metrics import f1_score
from model import PhishingGAT

DATA_PATH = "data/dataset.pt"
MODEL_SAVE_PATH = "models/new_weights.pth"

def train():
    if not os.path.exists(DATA_PATH):
        print(f"Dataset {DATA_PATH} not found. Run generate_dataset.py first.")
        return

    dataset = torch.load(DATA_PATH, weights_only=False)
    print(f"Loaded {len(dataset)} graphs.")
    
    # 70/30 split for validation
    train_size = int(0.7 * len(dataset))
    train_dataset = dataset[:train_size]
    val_dataset = dataset[train_size:]

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False)

    model = PhishingGAT(in_channels=5, hidden_channels=64, out_channels=1, heads=4)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.BCEWithLogitsLoss()

    epochs = 20
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        for batch in train_loader:
            optimizer.zero_grad()
            out = model(batch.x, batch.edge_index, batch.graph_features, batch.batch)
            loss = criterion(out.squeeze(), batch.y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        model.eval()
        all_preds = []
        all_labels = []
        with torch.no_grad():
            for batch in val_loader:
                out = model(batch.x, batch.edge_index, batch.graph_features, batch.batch)
                preds = (torch.sigmoid(out.squeeze()) > 0.5).float()
                all_preds.extend(preds.cpu().numpy())
                all_labels.extend(batch.y.cpu().numpy())
                
        f1 = f1_score(all_labels, all_preds, zero_division=0)
        print(f"Epoch {epoch+1:02d} | Loss: {total_loss/len(train_loader):.4f} | Val F1: {f1:.4f}")

    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)
    torch.save({'gat_state_dict': model.state_dict()}, MODEL_SAVE_PATH)
    print(f"Saved calibrated weights to {MODEL_SAVE_PATH}")

if __name__ == "__main__":
    train()
