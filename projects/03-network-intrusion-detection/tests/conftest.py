import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

from src.data import ALL_FEATURE_COLUMNS, CATEGORICAL_FEATURES
from src.features import build_pipeline


def _synthetic_row(is_attack: bool) -> dict:
    row = {}
    for col in ALL_FEATURE_COLUMNS:
        if col in CATEGORICAL_FEATURES:
            row[col] = {"protocol_type": "tcp", "service": "http", "flag": "S0" if is_attack else "SF"}[col]
        else:
            row[col] = 500 if is_attack else 0
    return row


@pytest.fixture
def tiny_model_and_encoder():
    """A real (tiny, fast) fitted pipeline — not the full trained model —
    so serve.py's request/response plumbing can be tested without needing
    the large trained artifact on disk.
    """
    rows = [_synthetic_row(is_attack=False) for _ in range(10)] + [
        _synthetic_row(is_attack=True) for _ in range(10)
    ]
    X = pd.DataFrame(rows, columns=ALL_FEATURE_COLUMNS)
    y = ["normal"] * 10 + ["DoS"] * 10

    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)

    pipeline = build_pipeline(RandomForestClassifier(n_estimators=10, random_state=0), X)
    pipeline.fit(X, y_encoded)

    return pipeline, label_encoder
