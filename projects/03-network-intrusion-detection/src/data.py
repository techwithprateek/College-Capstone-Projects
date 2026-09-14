"""Loads the KDD Cup 1999 network traffic dataset and maps its 23 raw attack
labels down to the standard 5-category taxonomy (normal, DoS, Probe, R2L,
U2R) used throughout the intrusion-detection literature, including NSL-KDD.

Why KDD Cup 99 instead of downloading NSL-KDD directly: scikit-learn ships
an official, reliable fetcher for the underlying KDD99 data
(`sklearn.datasets.fetch_kddcup99`), so nothing here depends on a
third-party file mirror that could move or disappear. NSL-KDD's actual
contribution over raw KDD99 was removing duplicate records (which badly
bias a classifier trained on raw KDD99 toward whatever attack types happen
to be duplicated most). `load_dataset()` applies that same deduplication
step directly, so the result has NSL-KDD's key property without a
third-party download.
"""

import pandas as pd
from sklearn.datasets import fetch_kddcup99

# Standard 5-category mapping used across the NSL-KDD / KDD99 literature.
ATTACK_CATEGORY = {
    "normal": "normal",
    "back": "DoS",
    "land": "DoS",
    "neptune": "DoS",
    "pod": "DoS",
    "smurf": "DoS",
    "teardrop": "DoS",
    "ipsweep": "Probe",
    "nmap": "Probe",
    "portsweep": "Probe",
    "satan": "Probe",
    "ftp_write": "R2L",
    "guess_passwd": "R2L",
    "imap": "R2L",
    "multihop": "R2L",
    "phf": "R2L",
    "spy": "R2L",
    "warezclient": "R2L",
    "warezmaster": "R2L",
    "buffer_overflow": "U2R",
    "loadmodule": "U2R",
    "perl": "U2R",
    "rootkit": "U2R",
}

CATEGORICAL_FEATURES = ["protocol_type", "service", "flag"]
TARGET_COLUMN = "attack_category"

# The 41 raw KDD99 traffic-record features, in the order the Flask API
# expects them. Kept as an explicit constant (rather than derived from a
# freshly fetched DataFrame) so src/serve.py can validate request bodies
# without needing the dataset loaded.
ALL_FEATURE_COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in",
    "num_compromised", "root_shell", "su_attempted", "num_root", "num_file_creations",
    "num_shells", "num_access_files", "num_outbound_cmds", "is_host_login",
    "is_guest_login", "count", "srv_count", "serror_rate", "srv_serror_rate",
    "rerror_rate", "srv_rerror_rate", "same_srv_rate", "diff_srv_rate",
    "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
    "dst_host_srv_diff_host_rate", "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate",
]


def _decode_label(raw) -> str:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return raw.rstrip(".")


def _decode_bytes_column(series: pd.Series) -> pd.Series:
    return series.apply(lambda v: v.decode("utf-8") if isinstance(v, bytes) else v)


def clean_raw_frame(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Pure transform: raw KDD99 frame (as sklearn's fetcher returns it) ->
    mapped 5-category target + decoded categoricals + deduplicated rows.
    Separated from load_dataset() so this logic is unit-testable on a small
    synthetic frame without needing the real ~500k-row dataset or network
    access.
    """
    df = raw_df.copy()

    df["attack_category"] = df["labels"].apply(_decode_label).map(ATTACK_CATEGORY)
    unmapped = df["attack_category"].isna()
    if unmapped.any():
        unknown_labels = sorted(df.loc[unmapped, "labels"].unique())
        raise ValueError(f"Unmapped attack labels found: {unknown_labels}")
    df = df.drop(columns=["labels"])

    for col in CATEGORICAL_FEATURES:
        df[col] = _decode_bytes_column(df[col])

    before = len(df)
    df = df.drop_duplicates().reset_index(drop=True)
    removed = before - len(df)
    if before:
        print(f"Deduplicated {removed:,} of {before:,} rows ({removed / before:.1%}) — the NSL-KDD fix.")

    return df


def load_dataset(percent10: bool = True) -> pd.DataFrame:
    """Returns a DataFrame of KDD99 traffic records with a 5-category
    `attack_category` target column, deduplicated (the NSL-KDD fix)."""
    bunch = fetch_kddcup99(subset=None, percent10=percent10, as_frame=True)
    return clean_raw_frame(bunch.frame)


def feature_target_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    X = df.drop(columns=[TARGET_COLUMN])
    y = df[TARGET_COLUMN]
    return X, y
