import pandas as pd
from sklearn.dummy import DummyClassifier

from src.features import build_pipeline


def test_pipeline_fits_and_predicts_on_mixed_categorical_and_numeric_data():
    X = pd.DataFrame(
        {
            "protocol_type": ["tcp", "udp", "tcp", "icmp"],
            "service": ["http", "domain_u", "http", "ecr_i"],
            "flag": ["SF", "SF", "S0", "SF"],
            "src_bytes": [100, 0, 500, 0],
            "duration": [0, 1, 0, 0],
        }
    )
    y = ["normal", "normal", "DoS", "DoS"]

    pipeline = build_pipeline(DummyClassifier(strategy="most_frequent"), X)
    pipeline.fit(X, y)
    preds = pipeline.predict(X)

    assert len(preds) == len(X)


def test_pipeline_handles_unseen_categories_at_predict_time():
    X_train = pd.DataFrame(
        {"protocol_type": ["tcp", "udp"], "service": ["http", "domain_u"], "flag": ["SF", "SF"], "src_bytes": [1, 2]}
    )
    y_train = ["normal", "DoS"]
    X_new = pd.DataFrame(
        {"protocol_type": ["icmp"], "service": ["never_seen_before"], "flag": ["REJ"], "src_bytes": [0]}
    )

    pipeline = build_pipeline(DummyClassifier(strategy="most_frequent"), X_train)
    pipeline.fit(X_train, y_train)

    # should not raise, thanks to OneHotEncoder(handle_unknown="ignore")
    preds = pipeline.predict(X_new)
    assert len(preds) == 1
