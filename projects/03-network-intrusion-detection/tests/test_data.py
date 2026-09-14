import pandas as pd
import pytest

from src.data import ATTACK_CATEGORY, clean_raw_frame, feature_target_split


def _raw_row(label: str, protocol_type=b"tcp", service=b"http", flag=b"SF", **overrides):
    row = {
        "duration": 0,
        "protocol_type": protocol_type,
        "service": service,
        "flag": flag,
        "src_bytes": 100,
        "dst_bytes": 200,
        "labels": label.encode("utf-8") if not label.endswith(".") else label.encode("utf-8"),
    }
    row.update(overrides)
    return row


def test_all_known_raw_labels_map_to_one_of_five_categories():
    assert set(ATTACK_CATEGORY.values()) == {"normal", "DoS", "Probe", "R2L", "U2R"}
    # spot-check a few
    assert ATTACK_CATEGORY["neptune"] == "DoS"
    assert ATTACK_CATEGORY["satan"] == "Probe"
    assert ATTACK_CATEGORY["guess_passwd"] == "R2L"
    assert ATTACK_CATEGORY["buffer_overflow"] == "U2R"
    assert ATTACK_CATEGORY["normal"] == "normal"


def test_clean_raw_frame_decodes_and_maps_labels():
    raw = pd.DataFrame(
        [
            _raw_row("normal."),
            _raw_row("neptune.", src_bytes=0),
            _raw_row("satan.", src_bytes=50),
        ]
    )

    cleaned = clean_raw_frame(raw)

    assert "labels" not in cleaned.columns
    assert list(cleaned["attack_category"]) == ["normal", "DoS", "Probe"]
    # categorical byte columns should be decoded to plain strings
    assert cleaned["protocol_type"].iloc[0] == "tcp"


def test_clean_raw_frame_raises_on_unknown_label():
    raw = pd.DataFrame([_raw_row("totally_made_up_attack.")])

    with pytest.raises(ValueError, match="Unmapped attack labels"):
        clean_raw_frame(raw)


def test_clean_raw_frame_drops_exact_duplicate_rows():
    raw = pd.DataFrame([_raw_row("normal."), _raw_row("normal."), _raw_row("neptune.", src_bytes=0)])

    cleaned = clean_raw_frame(raw)

    assert len(cleaned) == 2  # one duplicate normal row removed


def test_feature_target_split_separates_target_column():
    raw = pd.DataFrame([_raw_row("normal."), _raw_row("satan.")])
    cleaned = clean_raw_frame(raw)

    X, y = feature_target_split(cleaned)

    assert "attack_category" not in X.columns
    assert list(y) == ["normal", "Probe"]
