"""Flask app serving the trained intrusion classifier.

    python -m src.serve

POST /predict with a JSON body of the 41 raw KDD99 traffic features (see
data/examples.json for real examples) and get back a predicted attack
category plus per-class probabilities.
"""

import json
import os
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, render_template, request

from .data import ALL_FEATURE_COLUMNS

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
EXAMPLES_PATH = PROJECT_ROOT / "data" / "examples.json"


def load_artifacts(models_dir: Path = MODELS_DIR):
    model = joblib.load(models_dir / "model.joblib")
    label_encoder = joblib.load(models_dir / "label_encoder.joblib")
    return model, label_encoder


def create_app(model=None, label_encoder=None) -> Flask:
    """Model/label_encoder are injectable so tests can use a tiny fitted
    dummy pipeline instead of requiring the real trained artifacts on disk.
    """
    app = Flask(__name__, template_folder=str(PROJECT_ROOT / "templates"))

    if model is None or label_encoder is None:
        model, label_encoder = load_artifacts()

    examples = {}
    if EXAMPLES_PATH.exists():
        examples = json.loads(EXAMPLES_PATH.read_text())

    @app.get("/")
    def index():
        return render_template("index.html", examples=json.dumps(examples, indent=2))

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.post("/predict")
    def predict():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Request body must be a JSON object"}), 400

        missing = [c for c in ALL_FEATURE_COLUMNS if c not in payload]
        if missing:
            return jsonify({"error": f"Missing required fields: {missing}"}), 400

        try:
            row = {col: payload[col] for col in ALL_FEATURE_COLUMNS}
            X = pd.DataFrame([row], columns=ALL_FEATURE_COLUMNS)
            prediction_encoded = model.predict(X)[0]
            prediction = label_encoder.inverse_transform([prediction_encoded])[0]

            response = {"prediction": prediction}
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(X)[0]
                response["probabilities"] = {
                    label: round(float(p), 4)
                    for label, p in zip(label_encoder.classes_, proba)
                }
            return jsonify(response)
        except (ValueError, TypeError) as err:
            return jsonify({"error": f"Invalid feature values: {err}"}), 400

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    create_app().run(debug=True, port=port)
