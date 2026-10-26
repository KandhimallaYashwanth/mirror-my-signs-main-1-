"""Feature extraction shared by preprocessing, training and the API.

MUST stay identical to the browser code in src/lib/recognition.ts
(extractFeatures + resampleSequence + standardization).
"""
from __future__ import annotations

import numpy as np

FEATURE_SIZE = 126  # 2 hands x 21 points x 3
SEQ_LEN = 16  # frames after temporal resampling


def frame_features(hands: list[list[tuple[float, float, float]]], handedness: list[str]) -> list[float] | None:
    """Wrist-relative, scale-normalized landmarks; slot 0 = 'Left', slot 1 = 'Right'."""
    if not hands:
        return None
    slots: list = [None, None]
    for h, side in zip(hands, handedness):
        idx = 0 if side == "Left" else 1
        if slots[idx] is None:
            slots[idx] = h
        else:
            slots[1 - idx] = h
    out: list[float] = []
    for hand in slots:
        if hand is None:
            out.extend([0.0] * 63)
            continue
        wx, wy, wz = hand[0]
        scale = max(np.sqrt((x - wx) ** 2 + (y - wy) ** 2 + (z - wz) ** 2) for x, y, z in hand) or 1.0
        for x, y, z in hand:
            out.extend([(x - wx) / scale, (y - wy) / scale, (z - wz) / scale])
    return out


def resample_sequence(frames: np.ndarray, length: int = SEQ_LEN) -> np.ndarray:
    """Linear interpolation of a (n, 126) sequence to (length, 126). Keeps motion order."""
    n = len(frames)
    if n == 0:
        raise ValueError("empty sequence")
    if n == 1:
        return np.repeat(frames, length, axis=0)
    out = np.empty((length, frames.shape[1]), dtype=np.float32)
    for i in range(length):
        t = i * (n - 1) / (length - 1)
        lo = int(np.floor(t))
        hi = min(lo + 1, n - 1)
        a = t - lo
        out[i] = frames[lo] * (1 - a) + frames[hi] * a
    return out


def sequence_vector(frames: np.ndarray) -> np.ndarray:
    return resample_sequence(np.asarray(frames, dtype=np.float32)).reshape(-1)
