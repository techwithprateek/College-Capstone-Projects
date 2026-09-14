"""Evaluation metrics for the intrusion detector.

The headline metric is NOT accuracy. With ~57% of this dataset being a
single attack type (`smurf`), a classifier that just learns to predict the
majority classes well can post 95%+ accuracy while still missing most rare
attacks (U2R, R2L) — exactly the ones a security team cares most about
catching, because they represent an attacker who got further in (a
privilege escalation, a successful login) rather than a blunt flood attack.

`attack_recall` instead measures: of all the traffic that was actually an
attack (any category, not "normal"), what fraction did the model correctly
flag as an attack of *some* kind? A missed attack (false negative) is a
security incident; a normal request incorrectly flagged (false positive) is
an analyst's wasted five minutes. That asymmetry is why recall on the
attack classes, not accuracy, is what should decide which model ships.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless: no display needed to save PNGs
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix


def attack_recall(y_true: pd.Series, y_pred: np.ndarray) -> float:
    """Fraction of actual attacks (any non-'normal' label) correctly
    predicted as *some* attack category (not necessarily the right one)."""
    y_true = pd.Series(y_true).reset_index(drop=True)
    y_pred = pd.Series(y_pred).reset_index(drop=True)

    is_attack = y_true != "normal"
    if is_attack.sum() == 0:
        return float("nan")

    correctly_flagged = is_attack & (y_pred != "normal")
    return correctly_flagged.sum() / is_attack.sum()


def evaluation_report(y_true: pd.Series, y_pred: np.ndarray, labels: list[str]) -> str:
    return classification_report(y_true, y_pred, labels=labels, zero_division=0)


def save_confusion_matrix(
    y_true: pd.Series, y_pred: np.ndarray, labels: list[str], out_path: str | Path
) -> None:
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    fig, ax = plt.subplots(figsize=(6, 5))
    display = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    display.plot(ax=ax, cmap="Blues", colorbar=False, values_format="d")
    plt.title("Confusion Matrix")
    plt.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def save_feature_importances(
    importances: np.ndarray, feature_names: list[str], out_path: str | Path, top_n: int = 15
) -> None:
    order = np.argsort(importances)[::-1][:top_n]
    top_features = [feature_names[i] for i in order]
    top_values = importances[order]

    fig, ax = plt.subplots(figsize=(7, 5))
    sns.barplot(x=top_values, y=top_features, ax=ax, color="steelblue")
    ax.set_xlabel("Importance")
    ax.set_title(f"Top {top_n} Features")
    plt.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
