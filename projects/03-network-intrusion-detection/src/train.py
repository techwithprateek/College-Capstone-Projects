"""Trains and compares two classifiers on the intrusion-detection task, then
saves whichever one catches more actual attacks — not whichever scores
higher on plain accuracy (see src/evaluate.py for why).

    python -m src.train
"""

import time
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from .data import feature_target_split, load_dataset
from .evaluate import attack_recall, evaluation_report, save_confusion_matrix, save_feature_importances
from .features import build_pipeline

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"

CANDIDATES = {
    "random_forest": lambda: RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1),
    "xgboost": lambda: XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.3,
        random_state=42,
        eval_metric="mlogloss",
        n_jobs=-1,
    ),
}


def main() -> None:
    MODELS_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)

    print("Loading dataset...")
    df = load_dataset(percent10=True)
    X, y = feature_target_split(df)
    print(f"{len(X):,} rows, {y.nunique()} attack categories: {sorted(y.unique())}")
    print(y.value_counts(normalize=True).round(4).to_string())

    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)
    class_names = list(label_encoder.classes_)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )
    # Rebalances the loss to weight rare classes (U2R, R2L) as heavily as
    # common ones (DoS, normal), rather than letting the model get away
    # with ignoring rare classes to minimize overall loss.
    sample_weight = compute_sample_weight("balanced", y_train)

    results = {}
    for name, make_estimator in CANDIDATES.items():
        print(f"\nTraining {name}...")
        t0 = time.time()
        pipeline = build_pipeline(make_estimator(), X_train)
        pipeline.fit(X_train, y_train, model__sample_weight=sample_weight)
        train_seconds = time.time() - t0

        y_pred_encoded = pipeline.predict(X_test)
        y_pred = label_encoder.inverse_transform(y_pred_encoded)
        y_test_labels = label_encoder.inverse_transform(y_test)

        recall = attack_recall(y_test_labels, y_pred)
        accuracy = (y_pred_encoded == y_test).mean()
        report = evaluation_report(y_test_labels, y_pred, labels=class_names)

        print(f"  trained in {train_seconds:.1f}s | accuracy={accuracy:.4f} | attack_recall={recall:.4f}")
        (REPORTS_DIR / f"classification_report_{name}.txt").write_text(report)
        save_confusion_matrix(y_test_labels, y_pred, class_names, REPORTS_DIR / f"confusion_matrix_{name}.png")

        results[name] = {
            "pipeline": pipeline,
            "accuracy": accuracy,
            "attack_recall": recall,
        }

    winner_name = max(results, key=lambda n: (results[n]["attack_recall"], results[n]["accuracy"]))
    winner = results[winner_name]

    summary_lines = [
        "Model comparison (selection metric: attack_recall, not accuracy — see src/evaluate.py)",
        "",
        f"{'model':<15}{'accuracy':>12}{'attack_recall':>16}",
    ]
    for name, r in results.items():
        marker = "  <- shipped" if name == winner_name else ""
        summary_lines.append(f"{name:<15}{r['accuracy']:>12.4f}{r['attack_recall']:>16.4f}{marker}")
    summary = "\n".join(summary_lines)
    print("\n" + summary)
    (REPORTS_DIR / "summary.txt").write_text(summary + "\n")

    joblib.dump(winner["pipeline"], MODELS_DIR / "model.joblib")
    joblib.dump(label_encoder, MODELS_DIR / "label_encoder.joblib")
    (MODELS_DIR / "model_name.txt").write_text(winner_name)

    model_step = winner["pipeline"].named_steps["model"]
    feature_names = winner["pipeline"].named_steps["preprocess"].get_feature_names_out().tolist()
    save_feature_importances(model_step.feature_importances_, feature_names, REPORTS_DIR / "feature_importances.png")

    print(f"\nSaved {winner_name} to {MODELS_DIR}/")


if __name__ == "__main__":
    main()
