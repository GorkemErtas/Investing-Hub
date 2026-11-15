"""CPU LSTM network and numeric-weight inference, independent of fitting/scalers."""
import numpy as np
import torch
from torch import nn


class Network(nn.Module):
    def __init__(self, features, hidden):
        super().__init__()
        self.lstm = nn.LSTM(features, hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x):
        values, _ = self.lstm(x)
        return self.head(values[:, -1]).squeeze(-1)


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
