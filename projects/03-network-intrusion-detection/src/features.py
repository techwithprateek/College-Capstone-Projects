"""Preprocessing: turn raw KDD99 columns into a model-ready feature matrix."""

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .data import CATEGORICAL_FEATURES


def build_preprocessor(X: pd.DataFrame) -> ColumnTransformer:
    numeric_features = [c for c in X.columns if c not in CATEGORICAL_FEATURES]

    return ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), numeric_features),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
        ]
    )


def build_pipeline(estimator, X: pd.DataFrame) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_preprocessor(X)),
            ("model", estimator),
        ]
    )
