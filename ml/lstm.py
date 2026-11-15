"""Small CPU-only trainable LSTM with train-only scaling and data-only weights."""
import numpy as np
import torch
from sklearn.preprocessing import StandardScaler
from torch import nn
from lstm_inference import Network


class LSTMRegressor:
    def __init__(self, seed=42, hidden=12, epochs=12, batch_size=128, learning_rate=.005):
        self.seed, self.hidden, self.epochs = seed, hidden, epochs
        self.batch_size, self.learning_rate = batch_size, learning_rate

    def fit(self, x, y):
        torch.set_num_threads(1)
        torch.use_deterministic_algorithms(True)
        torch.manual_seed(self.seed)
        x, y = np.asarray(x, float), np.asarray(y, float)
        self.lookback = x.shape[1]
        self.scaler = StandardScaler().fit(x.reshape(-1, x.shape[-1]))
        values = self.scaler.transform(x.reshape(-1, x.shape[-1])).reshape(x.shape).astype(np.float32)
        self.target_mean, self.target_scale = float(y.mean()), max(float(y.std()), 1e-8)
        target = ((y-self.target_mean)/self.target_scale).astype(np.float32)
        self.network = Network(x.shape[-1], self.hidden).cpu()
        optimizer = torch.optim.Adam(self.network.parameters(), lr=self.learning_rate)
        self.network.train()
        for _ in range(self.epochs):
            # Fixed chronological batches; no evaluation labels or early stopping.
            for start in range(0, len(values), self.batch_size):
                batch = torch.from_numpy(values[start:start+self.batch_size])
                labels = torch.from_numpy(target[start:start+self.batch_size])
                optimizer.zero_grad()
                loss = nn.functional.mse_loss(self.network(batch), labels)
                loss.backward()
                nn.utils.clip_grad_norm_(self.network.parameters(), 1.)
                optimizer.step()
        self.network.eval()
        return self

    def predict(self, x):
        x = np.asarray(x, float)
        values = self.scaler.transform(x.reshape(-1, x.shape[-1])).reshape(x.shape).astype(np.float32)
        with torch.no_grad():
            result = self.network(torch.from_numpy(values)).numpy().astype(float)
        return result*self.target_scale+self.target_mean

    def artifact(self, features, version):
        return {'format': 'numeric-lstm-v1', 'algorithm': 'lstm', 'features': features,
                'feature_version': version, 'lookback': self.lookback, 'hidden': self.hidden,
                'mean': self.scaler.mean_.tolist(), 'scale': self.scaler.scale_.tolist(),
                'target_mean': self.target_mean, 'target_scale': self.target_scale,
                'weights': {key: value.detach().cpu().numpy().tolist() for key, value in self.network.state_dict().items()}}
