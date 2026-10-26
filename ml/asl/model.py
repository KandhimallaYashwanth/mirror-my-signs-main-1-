"""Reconstruction of the ASL Citizen BiGRU + Attention classifier
(huggingface.co/SharoonArshad/asl-citizen-bigru-attention-encoder-200) from its checkpoint keys.
Activations were confirmed by reproducing the published test accuracy on the published test shards."""
import torch
import torch.nn as nn


class AttentionPool(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.attention = nn.Sequential(nn.Linear(d, 256), nn.Tanh(), nn.Linear(256, 1))

    def forward(self, h):
        w = torch.softmax(self.attention(h), dim=1)
        return (w * h).sum(1)


class BiGRUAttention(nn.Module):
    def __init__(self, act=nn.GELU, input_dim=450, proj=256, hidden=256, classes=200):
        super().__init__()
        self.input_norm = nn.LayerNorm(input_dim)
        self.projection = nn.Sequential(nn.Linear(input_dim, proj), nn.LayerNorm(proj), act(), nn.Dropout(0.35))
        self.gru = nn.GRU(proj, hidden, num_layers=2, batch_first=True, bidirectional=True, dropout=0.35)
        self.attention_pool = AttentionPool(hidden * 2)
        self.embedding = nn.Sequential(nn.Linear(hidden * 2, 512), nn.LayerNorm(512), act(), nn.Dropout(0.35))
        self.classifier = nn.Linear(512, classes)

    def forward(self, x):
        h, _ = self.gru(self.projection(self.input_norm(x)))
        return self.classifier(self.embedding(self.attention_pool(h)))
