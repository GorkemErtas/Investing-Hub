"""Small CPU-only trainable LSTM with train-only scaling and data-only weights."""
import numpy as np
import torch
from sklearn.preprocessing import StandardScaler
from torch import nn


class Network(nn.Module):
    def __init__(self, features, hidden):
        super().__init__()
        self.lstm = nn.LSTM(features, hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x):
        values, _ = self.lstm(x)
        return self.head(values[:, -1]).squeeze(-1)


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


def predict_artifact(artifact, x):
    from features import FEATURES
    from artifact import vector
    hidden, lookback = artifact['hidden'], artifact['lookback']
    if not isinstance(hidden, int) or not 1 <= hidden <= 64 or not isinstance(lookback, int) or not 1 <= lookback <= 64:
        raise ValueError('Invalid LSTM dimensions')
    x = np.asarray(x, float)
    if x.ndim != 3 or x.shape[1:] != (lookback, len(FEATURES)) or not np.isfinite(x).all():
        raise ValueError('Invalid LSTM inference sequence')
    mean, scale = (vector(artifact[key], len(FEATURES)) for key in ('mean', 'scale'))
    target = vector([artifact['target_mean'], artifact['target_scale']], 2)
    if (scale <= 0).any() or target[1] <= 0:
        raise ValueError('Invalid LSTM scaler')
    network = Network(len(FEATURES), hidden).cpu()
    expected = network.state_dict()
    if set(artifact['weights']) != set(expected):
        raise ValueError('Invalid LSTM weight manifest')
    weights = {}
    for key, tensor in expected.items():
        value = np.asarray(artifact['weights'][key], dtype=np.float32)
        if value.shape != tuple(tensor.shape) or not np.isfinite(value).all():
            raise ValueError('Invalid LSTM weights')
        weights[key] = torch.from_numpy(value)
    network.load_state_dict(weights, strict=True)
    network.eval()
    values = ((x-mean)/scale).astype(np.float32)
    with torch.no_grad():
        result = network(torch.from_numpy(values)).numpy().astype(float)*target[1]+target[0]
    if not np.isfinite(result).all():
        raise ValueError('Nonfinite LSTM output')
    return result
