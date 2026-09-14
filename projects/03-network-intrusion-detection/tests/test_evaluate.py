import pandas as pd
import pytest

from src.evaluate import attack_recall


def test_attack_recall_perfect_when_every_attack_flagged_as_some_attack():
    y_true = pd.Series(["normal", "DoS", "Probe", "DoS"])
    y_pred = ["normal", "DoS", "R2L", "DoS"]  # wrong category, but still "an attack"

    assert attack_recall(y_true, y_pred) == 1.0


def test_attack_recall_penalizes_attacks_missed_as_normal():
    y_true = pd.Series(["DoS", "DoS", "Probe", "normal"])
    y_pred = ["normal", "DoS", "normal", "normal"]  # 2 of 3 attacks missed

    assert attack_recall(y_true, y_pred) == pytest.approx(1 / 3)


def test_attack_recall_ignores_false_positives_on_normal_traffic():
    # A normal request incorrectly flagged as an attack doesn't affect this
    # metric — attack_recall only measures whether actual attacks were caught.
    y_true = pd.Series(["normal", "DoS"])
    y_pred = ["DoS", "DoS"]

    assert attack_recall(y_true, y_pred) == 1.0
