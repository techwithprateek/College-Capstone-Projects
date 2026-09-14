from src.serve import create_app
from tests.conftest import _synthetic_row


def _client(tiny_model_and_encoder):
    model, label_encoder = tiny_model_and_encoder
    app = create_app(model=model, label_encoder=label_encoder)
    return app.test_client()


def test_index_page_renders(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)
    res = client.get("/")
    assert res.status_code == 200
    assert b"Network Intrusion Detection" in res.data


def test_health(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"ok": True}


def test_predict_returns_prediction_and_probabilities(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)
    payload = _synthetic_row(is_attack=True)

    res = client.post("/predict", json=payload)

    assert res.status_code == 200
    body = res.get_json()
    assert body["prediction"] in {"normal", "DoS"}
    assert set(body["probabilities"].keys()) == {"normal", "DoS"}
    assert abs(sum(body["probabilities"].values()) - 1.0) < 1e-6


def test_predict_rejects_missing_fields(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)
    incomplete_payload = {"duration": 0, "protocol_type": "tcp"}

    res = client.post("/predict", json=incomplete_payload)

    assert res.status_code == 400
    assert "Missing required fields" in res.get_json()["error"]


def test_predict_rejects_non_object_body(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)

    res = client.post("/predict", json=[1, 2, 3])

    assert res.status_code == 400


def test_predict_ignores_extra_unknown_fields(tiny_model_and_encoder):
    client = _client(tiny_model_and_encoder)
    payload = _synthetic_row(is_attack=False)
    payload["some_field_the_model_does_not_know_about"] = "whatever"

    res = client.post("/predict", json=payload)

    assert res.status_code == 200
