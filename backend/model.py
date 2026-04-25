import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple
import logging
import networkx as nx
import numpy as np
from sklearn.preprocessing import StandardScaler
import os
from datetime import datetime

logger = logging.getLogger(__name__)

# --- PyG import with fallback ---
try:
    from torch_geometric.nn import GATConv
    HAS_PYG = True
except ImportError:
    HAS_PYG = False
    logger.warning("torch_geometric not installed. Using MLP fallback for GNN.")


class URLGraphBuilder:
    """Builds and manages the URL knowledge graph."""
    
    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.scaler = StandardScaler()
    
    # Removed 4-dim scalar encoding; now using 5-dim one-hot directly in get_node_features

    def add_url(self, url_data: Dict):
        """Build a multi-node graph from URL + browser behavioral data.

        Node types: url, domain, redirect, script_host, ip
        Edges:      url→domain, url→redirect, url→script_host, domain→ip
        """
        from urllib.parse import urlparse
        try:
            import tldextract
        except ImportError:
            tldextract = None

        url = url_data.get('url', '')
        if not url:
            return

        # --- Node 1: Root URL ---
        if url not in self.graph:
            self.graph.add_node(url, type='url')

        # --- Node 2: Registered Domain ---
        domain = ''
        if tldextract:
            ext = tldextract.extract(url)
            domain = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain
        else:
            domain = urlparse(url).netloc
        if domain and domain not in self.graph:
            self.graph.add_node(domain, type='domain')
        if domain:
            self.graph.add_edge(url, domain, type='url_to_domain')

        # --- Nodes 3+: Browser behavioral data (Playwright) ---
        browser = url_data.get('browser', {})

        # Redirect hops
        for hop in browser.get('redirect_chain', []):
            if hop and hop != url:
                if hop not in self.graph:
                    self.graph.add_node(hop, type='redirect')
                self.graph.add_edge(url, hop, type='redirects_to')

        # External script hosts
        for src in browser.get('external_scripts', []):
            if not src:
                continue
            if src.startswith('//'):
                src = 'https:' + src
            script_host = urlparse(src).netloc
            if script_host and script_host != urlparse(url).netloc:
                if script_host not in self.graph:
                    self.graph.add_node(script_host, type='script_host')
                self.graph.add_edge(url, script_host, type='loads_script')

        # Resolved IP
        ip = url_data.get('ip') or browser.get('ip')
        if ip and domain:
            if ip not in self.graph:
                self.graph.add_node(ip, type='ip')
            self.graph.add_edge(domain, ip, type='resolves_to')

        # Legacy: metadata domain_info fallback (keeps non-browser path working)
        if not browser and not domain:
            metadata = url_data.get('metadata')
            if metadata:
                domain_info = getattr(metadata, 'domain_info', None) or (metadata.get('domain_info', {}) if isinstance(metadata, dict) else {})
                fb_domain = (domain_info.get('domain', '') if isinstance(domain_info, dict) else getattr(domain_info, 'domain', ''))
                if fb_domain and fb_domain not in self.graph:
                    self.graph.add_node(fb_domain, type='domain')
    
    def get_node_features(self, node: str) -> torch.Tensor:
        """Extract 5-dim one-hot feature vector for a graph node.
        
        Features: [is_url, is_domain, is_redirect, is_script_host, is_ip]
        """
        node_type = self.graph.nodes[node].get('type', 'url')
        features = [
            1.0 if node_type == 'url' else 0.0,
            1.0 if node_type == 'domain' else 0.0,
            1.0 if node_type == 'redirect' else 0.0,
            1.0 if node_type == 'script_host' else 0.0,
            1.0 if node_type == 'ip' else 0.0,
        ]
        return torch.tensor(features, dtype=torch.float)
    
    def build_graph_tensors(self) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Build tensors for graph neural network input."""
        num_nodes = len(self.graph.nodes())
        num_edges = len(self.graph.edges())
        num_scripts = sum(1 for n, d in self.graph.nodes(data=True) if d.get('type') == 'script_host')
        num_redirects = sum(1 for n, d in self.graph.nodes(data=True) if d.get('type') == 'redirect')
        graph_features = torch.tensor([[num_nodes, num_edges, num_scripts, num_redirects]], dtype=torch.float)

        if num_nodes == 0:
            return (
                torch.zeros((1, 5), dtype=torch.float),
                torch.zeros((2, 0), dtype=torch.long),
                graph_features
            )
        
        node_features = []
        for node in self.graph.nodes():
            node_features.append(self.get_node_features(node))
        x = torch.stack(node_features)
        
        edge_indices = []
        node_list = list(self.graph.nodes())
        for u, v, _ in self.graph.edges(data=True):
            edge_indices.append([node_list.index(u), node_list.index(v)])
        
        if edge_indices:
            edge_index = torch.tensor(edge_indices, dtype=torch.long).t()
        else:
            edge_index = torch.zeros((2, 0), dtype=torch.long)
        
        return x, edge_index, graph_features


# --- GNN with PyG or MLP fallback ---

if HAS_PYG:
    class PhishingGAT(nn.Module):
        """Graph Attention Network for phishing detection."""
        
        def __init__(self, in_channels: int, hidden_channels: int, out_channels: int, heads: int = 4):
            super().__init__()
            self.conv1 = GATConv(in_channels, hidden_channels, heads=heads)
            self.conv2 = GATConv(hidden_channels * heads, hidden_channels, heads=heads)
            self.conv3 = GATConv(hidden_channels * heads, hidden_channels, heads=1)
            self.classifier = nn.Linear(hidden_channels + 4, out_channels)
        
        def forward(self, x: torch.Tensor, edge_index: torch.Tensor, graph_features: torch.Tensor, batch: Optional[torch.Tensor] = None) -> torch.Tensor:
            x = F.relu(self.conv1(x, edge_index))
            x = F.dropout(x, p=0.2, training=self.training)
            x = F.relu(self.conv2(x, edge_index))
            x = F.dropout(x, p=0.2, training=self.training)
            x = self.conv3(x, edge_index)
            
            if batch is not None:
                from torch_geometric.nn import global_mean_pool
                x = global_mean_pool(x, batch)
            else:
                x = x.mean(dim=0, keepdim=True)
                
            x = torch.cat([x, graph_features], dim=-1)
            return self.classifier(x)
else:
    class PhishingGAT(nn.Module):
        """MLP fallback when PyG is not installed."""
        
        def __init__(self, in_channels: int, hidden_channels: int, out_channels: int, heads: int = 4):
            super().__init__()
            self.mlp = nn.Sequential(
                nn.Linear(in_channels, hidden_channels),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(hidden_channels, hidden_channels),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(hidden_channels, hidden_channels),
            )
            self.classifier = nn.Linear(hidden_channels + 4, out_channels)
        
        def forward(self, x: torch.Tensor, edge_index: torch.Tensor, graph_features: torch.Tensor, batch: Optional[torch.Tensor] = None) -> torch.Tensor:
            x = self.mlp(x)
            if batch is not None:
                pass # Unused in MLP fallback
            else:
                x = x.mean(dim=0, keepdim=True)
            x = torch.cat([x, graph_features], dim=-1)
            return self.classifier(x)


class TextEncoder:
    """Encodes text using a pretrained transformer model."""
    
    def __init__(self, model_name: str = "distilbert-base-uncased"):
        from transformers import AutoTokenizer, AutoModel
        logger.info(f"Loading text encoder: {model_name}")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name)
        self.model.eval()
        self.embed_dim = self.model.config.hidden_size  # 768
        logger.info(f"Text encoder loaded. Embedding dim: {self.embed_dim}")
    
    @torch.no_grad()
    def encode(self, text: str) -> torch.Tensor:
        """Encode text into transformer embeddings. Returns [1, 768]."""
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            max_length=512,
            truncation=True,
            padding=True,
        )
        outputs = self.model(**inputs)
        return outputs.last_hidden_state.mean(dim=1)  # [1, hidden_size]


class TemporalWeighting(nn.Module):
    """Implements temporal weighting for threat knowledge."""
    
    def __init__(self, decay_factor: float = 0.1):
        super().__init__()
        self.decay_factor = decay_factor
    
    def calculate_time_weight(self, timestamp: str) -> float:
        try:
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp)
            time_diff = (datetime.now() - timestamp).days
            weight = np.exp(-self.decay_factor * time_diff)
            return float(weight)
        except Exception as e:
            logger.error(f"Error calculating time weight: {str(e)}")
            return 0.5
    
    def forward(self, edge_weights: torch.Tensor, timestamps: list) -> torch.Tensor:
        time_weights = torch.tensor(
            [self.calculate_time_weight(ts) for ts in timestamps],
            device=edge_weights.device,
            dtype=edge_weights.dtype,
        )
        return edge_weights * time_weights


class PSSA(nn.Module):
    """Phishing Score Semantic Alignment module.
    
    Aligns GNN node features with LLM embeddings via cross-attention,
    then fuses them into a single phishing score.
    """
    
    def __init__(self, gnn_dim: int, llm_dim: int, hidden_dim: int = 256, dropout: float = 0.1):
        super().__init__()
        
        self.gnn_projection = nn.Sequential(
            nn.Linear(gnn_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        self.llm_projection = nn.Sequential(
            nn.Linear(llm_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=4,
            dropout=dropout,
            batch_first=True,
        )
        
        self.fusion = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid(),
        )
    
    def forward(
        self,
        gnn_embeddings: torch.Tensor,
        llm_embeddings: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
        gnn_mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        # Project both to hidden_dim
        gnn_proj = self.gnn_projection(gnn_embeddings)  # [N, hidden_dim]
        llm_proj = self.llm_projection(llm_embeddings)  # [N, hidden_dim]
        
        # Add batch dim for attention (batch_first=True)
        gnn_proj = gnn_proj.unsqueeze(0)  # [1, N, hidden_dim]
        llm_proj = llm_proj.unsqueeze(0)  # [1, N, hidden_dim]
        
        # Cross-attention: GNN attends to LLM
        attended_gnn, attention_weights = self.attention(
            gnn_proj, llm_proj, llm_proj,
        )
        
        attended_gnn = attended_gnn.squeeze(0)  # [N, hidden_dim]
        llm_proj = llm_proj.squeeze(0)          # [N, hidden_dim]
        
        # Concatenate and fuse
        combined = torch.cat([attended_gnn, llm_proj], dim=-1)  # [N, hidden_dim*2]
        score = self.fusion(combined)  # [N, 1]
        
        # Pool to single score
        if gnn_mask is not None and gnn_mask.any():
            final_score = (score[gnn_mask].sum(dim=0)) / gnn_mask.sum()
        else:
            final_score = score.mean(dim=0)  # [1]
        
        return final_score, attention_weights


class PhishingScoreFusion(nn.Module):
    """Combines GNN and LLM outputs with temporal weighting and PSSA."""
    
    def __init__(
        self,
        gnn_dim: int = 5,
        llm_dim: int = 768,
        hidden_dim: int = 256,
        dropout: float = 0.1,
        temporal_decay: float = 0.1,
    ):
        super().__init__()
        self.temporal_weighting = TemporalWeighting(decay_factor=temporal_decay)
        self.pssa = PSSA(
            gnn_dim=gnn_dim,
            llm_dim=llm_dim,
            hidden_dim=hidden_dim,
            dropout=dropout,
        )
    
    def forward(
        self,
        gnn_output: Dict[str, torch.Tensor],
        llm_output: Dict[str, torch.Tensor],
        metadata: Dict,
        gnn_mask: Optional[torch.Tensor] = None,
    ) -> Dict[str, torch.Tensor]:
        # Temporal weighting
        temporal_weights = self.temporal_weighting(
            gnn_output['edge_weights'],
            metadata['timestamps'],
        )
        
        # Apply temporal weights to GNN embeddings
        gnn_embeddings = gnn_output['embeddings'] * temporal_weights.unsqueeze(-1)
        
        # PSSA fusion (handles all projections internally)
        final_score, attention_weights = self.pssa(
            gnn_embeddings,
            llm_output['embeddings'],
            llm_output.get('attention_mask'),
            gnn_mask=gnn_mask,
        )
        
        return {
            'final_score': final_score,
            'attention_weights': attention_weights,
            'temporal_weights': temporal_weights,
        }


# --- Padding constant ---
PAD_NODES = 128


class PhishingDetector:
    """Main phishing detection model with GNN + LLM fusion."""
    
    def __init__(self, model_path: Optional[str] = None, load_bert: bool = True):
        self.graph_builder = URLGraphBuilder()
        self.gat = PhishingGAT(
            in_channels=5,
            hidden_channels=64,
            out_channels=1,
            heads=4,
        )
        self.fusion = PhishingScoreFusion(
            gnn_dim=5,
            llm_dim=768,
            hidden_dim=256,
        )
        
        # Load text encoder (BERT)
        self.text_encoder = None
        if load_bert:
            try:
                self.text_encoder = TextEncoder()
            except Exception as e:
                logger.warning(f"Could not load text encoder: {e}")
        
        # Load saved weights
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
    
    # --- Text encoding ---
    
    def _extract_text(self, url_data: Dict) -> str:
        """Extract text from URL data for BERT encoding."""
        parts = []
        
        url = url_data.get('url', '')
        if url:
            parts.append(str(url))
        
        metadata = url_data.get('metadata')
        if metadata:
            if hasattr(metadata, 'page_title'):
                if metadata.page_title:
                    parts.append(str(metadata.page_title))
                if metadata.text_content:
                    parts.append(str(metadata.text_content)[:500])
            elif isinstance(metadata, dict):
                if metadata.get('page_title'):
                    parts.append(metadata['page_title'])
                if metadata.get('text_content'):
                    parts.append(metadata['text_content'][:500])
        
        return " ".join(parts) if parts else "unknown url"
    
    def encode_text(self, url_data: Dict) -> Dict[str, torch.Tensor]:
        """Get LLM embeddings for URL data. Returns dict with 'embeddings' [128, 768]."""
        if self.text_encoder is None:
            return {
                'embeddings': torch.zeros((PAD_NODES, 768), dtype=torch.float),
                'attention_mask': None,
            }
        
        text = self._extract_text(url_data)
        embedding = self.text_encoder.encode(text)       # [1, 768]
        embedding = embedding.expand(PAD_NODES, -1)      # [128, 768]
        
        return {
            'embeddings': embedding,
            'attention_mask': None,
        }
    
    # --- Graph preprocessing ---
    
    def preprocess_url(self, url_data: Dict) -> Dict[str, torch.Tensor]:
        """Preprocess URL data for GNN input. Returns dict with 'embeddings' [128, 4]."""
        try:
            self.graph_builder = URLGraphBuilder()  # Fresh graph per URL
            self.graph_builder.add_url(url_data)
            x, edge_index, graph_features = self.graph_builder.build_graph_tensors()
            
            # Pad or truncate to PAD_NODES
            if x.size(0) < PAD_NODES:
                padding = torch.zeros((PAD_NODES - x.size(0), 5), dtype=torch.float)
                x = torch.cat([x, padding], dim=0)
            else:
                x = x[:PAD_NODES]
            
            return {
                'embeddings': x,
                'edge_index': edge_index,
                'graph_features': graph_features,
                'edge_weights': torch.ones(PAD_NODES, dtype=torch.float),
            }
        except Exception as e:
            logger.error(f"Error preprocessing URL: {str(e)}")
            return {
                'embeddings': torch.zeros((PAD_NODES, 5), dtype=torch.float),
                'edge_index': torch.zeros((2, 0), dtype=torch.long),
                'graph_features': torch.zeros((1, 4), dtype=torch.float),
                'edge_weights': torch.ones(PAD_NODES, dtype=torch.float),
            }
    
    # --- Prediction ---
    
    def predict(self, url_data: Dict) -> Dict[str, float]:
        """
        Predict phishing probability for a URL.
        
        Returns dict with:
            fusion_score: float (0-1, combined GNN+LLM score)
            gnn_score: float (0-1, GNN-only score)
            llm_score: float (0-1, derived from fusion)
        """
        gnn_output = self.preprocess_url(url_data)
        llm_output = self.encode_text(url_data)
        
        metadata = {
            'timestamps': [url_data.get('verified_at', datetime.now().isoformat())]
        }
        
        self.gat.eval()
        self.fusion.eval()
        
        with torch.no_grad():
            # Only process non-padded nodes for the GNN score
            # A node is padded if its features are all zero
            mask = (gnn_output['embeddings'].abs().sum(dim=-1) > 0)
            num_nodes = mask.sum().item()
            
            if num_nodes > 0:
                gat_output = self.gat(
                    gnn_output['embeddings'][mask], 
                    gnn_output['edge_index'], 
                    gnn_output['graph_features']
                )
                gnn_score = torch.sigmoid(gat_output).item()
            else:
                gnn_score = 0.5

            # Fusion score (GNN + LLM through PSSA)
            fusion_result = self.fusion(gnn_output, llm_output, metadata, gnn_mask=mask)
            fusion_score = fusion_result['final_score'].item()
        
        return {
            'fusion_score': fusion_score,
            'gnn_score': gnn_score,
            'llm_score': fusion_score,  # simplified for now
            'graph_node_count': num_nodes,
            'graph_signal': 'weak' if num_nodes <= 1 else 'strong',
        }
    
    # --- Save / Load ---
    
    def save_model(self, path: str):
        """Save model weights to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        torch.save({
            'gat_state_dict': self.gat.state_dict(),
            'fusion_state_dict': self.fusion.state_dict(),
        }, path)
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """Load model weights from disk."""
        try:
            checkpoint = torch.load(path, map_location='cpu', weights_only=False)
            
            # Load GAT weights
            for key in ['gat_state_dict', 'detector_state_dict', 'model_state_dict']:
                if key in checkpoint:
                    try:
                        self.gat.load_state_dict(checkpoint[key], strict=False)
                        logger.info(f"Loaded GAT weights from '{key}'")
                        break
                    except Exception:
                        continue
            
            # Load fusion weights
            if 'fusion_state_dict' in checkpoint:
                try:
                    self.fusion.load_state_dict(checkpoint['fusion_state_dict'], strict=False)
                    logger.info("Loaded fusion weights")
                except Exception as e:
                    logger.warning(f"Could not load fusion weights: {e}")
            
            logger.info(f"Model loaded from {path}")
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            logger.info("Using randomly initialized model")