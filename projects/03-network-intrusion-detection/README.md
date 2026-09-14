# Network Intrusion Detection System

A multi-class classifier that labels network traffic as normal or as one of
four attack categories (DoS, Probe, R2L, U2R), trained on the KDD Cup 1999
dataset, compared against a second model on the metric that actually
matters for security, and served live behind a Flask app.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # includes requirements.txt + pytest
```

**macOS only:** XGBoost needs the OpenMP runtime, which isn't installed by
default and isn't a Python package — `pip install` will succeed but
`import xgboost` will fail with a `libomp.dylib` load error until you run:

```bash
brew install libomp
```

## Train it

```bash
python -m src.train
```

This fetches the dataset (via scikit-learn's official `fetch_kddcup99`,
~10s, cached locally after the first run — see
[Where the data comes from](#where-the-data-comes-from-and-why-not-nsl-kdd-directly)),
trains a Random Forest and an XGBoost model, evaluates both, and saves
whichever one wins to `models/`. On a real run here:

```
Deduplicated 348,436 of 494,021 rows (70.5%) — the NSL-KDD fix.
145,585 rows, 5 attack categories: ['DoS', 'Probe', 'R2L', 'U2R', 'normal']

model              accuracy   attack_recall
random_forest        0.9996          0.9996
xgboost               0.9996          0.9997  <- shipped
```

Both models land in the same ballpark (see
[why accuracy is misleadingly high here](#a-limitation-worth-knowing-about)),
so the deciding factor was `attack_recall` — see
[How models are compared](#how-models-are-compared-not-by-accuracy) below.
Full per-class breakdown is in `reports/classification_report_*.txt`; the
one worth actually reading is U2R, the rarest class in the dataset (10
examples in the test set):

```
         U2R       0.77      1.00      0.87        10   (xgboost)
         U2R       0.83      1.00      0.91        10   (random_forest)
```

**100% recall** on the rarest, highest-stakes class, for both models — at
the cost of some precision (some false alarms). That's the class-imbalance
handling (`sample_weight="balanced"` in `src/train.py`) working as intended:
a false alarm costs an analyst a few minutes; a missed privilege-escalation
attempt doesn't.

## Serve it

```bash
python -m src.serve
```

Open `http://localhost:5000` — there's a page with buttons to load three
**real** traffic records (normal, a `neptune` DoS attack, a `guess_passwd`
R2L attack — pulled straight from the dataset, not invented) and classify
them. Or hit the API directly:

```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d @<(python3 -c "import json; print(json.dumps(json.load(open('data/examples.json'))['neptune_dos_attack']))")
# -> {"prediction": "DoS", "probabilities": {"DoS": 0.999, "normal": 0.0008, ...}}
```

## Run the tests

```bash
pytest
```

16 tests, all offline and fast (~0.5s) — no dataset download or trained
model required. They cover the label taxonomy mapping and deduplication
logic (`test_data.py`), the preprocessing pipeline including unseen
categories at serve time (`test_features.py`), the `attack_recall` metric
itself (`test_evaluate.py`), and the Flask API's request validation and
response shape (`test_serve.py`) — using a tiny model trained on synthetic
data in `tests/conftest.py`, not the real multi-hundred-KB trained
artifact, so tests run in under a second.

## How models are compared (not by accuracy)

With this dataset ~60% normal / ~37% DoS and the remaining three categories
making up ~2%, a model can score 95%+ accuracy while barely detecting Probe,
R2L, or U2R attacks at all — it only has to get the two big categories
right. `src/evaluate.py`'s `attack_recall` instead asks: **of all the
traffic that was actually an attack, what fraction did the model flag as
an attack of some kind?** A missed attack (false negative) is a security
incident; a false alarm on normal traffic is an analyst's wasted five
minutes — that asymmetry is why this, not accuracy, decides which model
`src/train.py` ships.

## Where the data comes from (and why not NSL-KDD directly)

NSL-KDD is a cleaned-up version of the original 1999 KDD Cup dataset — its
main fix was removing duplicate records, which badly bias a classifier
trained on raw KDD99 toward whatever traffic pattern happens to be
duplicated most. Rather than depend on a third-party NSL-KDD file mirror,
`src/data.py` fetches the underlying data through scikit-learn's own
official, versioned `fetch_kddcup99()` and applies that same deduplication
step directly (`clean_raw_frame()`) — you get NSL-KDD's key property
without trusting an unofficial download link. On the 10%-subset data used
here, that removes **70.5%** of rows, consistent with the duplication rate
widely reported in the NSL-KDD literature.

## A limitation worth knowing about

99.96% accuracy looks almost too good — and it partly is. This project
uses a random stratified split of one dataset, so train and test traffic
come from the same underlying distribution. The **official** NSL-KDD test
set is deliberately harder: it includes attack *types* that never appear
in the training set at all, specifically to measure whether a model
generalizes to genuinely novel attacks rather than memorizing patterns
it's already seen — and published results on that harder split are
meaningfully lower (many methods land around 75-85%, not 99%+).

This project doesn't use that harder split, so treat 99.96% as "this model
is very good at recognizing attack types it's seen examples of," not as "this
model would catch a brand-new attack technique." That gap — and how you'd
close it — is good material for "what's a limitation of your approach?" in
an interview.

## Project layout

```
src/
  data.py           dataset loading, label taxonomy, dedup (the NSL-KDD fix)
  features.py         ColumnTransformer: scale numeric, one-hot categorical
  train.py               trains + compares Random Forest vs XGBoost, saves the winner
  evaluate.py               attack_recall metric, confusion matrix + feature importance plots
  serve.py                    Flask app: / (demo UI) and POST /predict
data/examples.json    3 real traffic records (normal, DoS, R2L) for the demo UI
models/                the trained pipeline + label encoder (gitignored — run train.py)
reports/                 classification reports, confusion matrices, feature importances (committed, from a real run)
tests/                     offline unit tests + tests/conftest.py's tiny synthetic model
```

## Where this is intentionally scoped down

- **No SHAP / deep explainability.** `reports/feature_importances.png` uses
  each model's built-in `feature_importances_` — free, but coarser than a
  proper SHAP analysis of individual predictions.
- **No live traffic streaming.** `/predict` classifies one record at a
  time on request; simulating a live packet stream is a natural extension.
- **No SMOTE/oversampling.** Class imbalance is handled via
  `sample_weight="balanced"` at training time rather than resampling the
  data itself — simpler, and it worked (100% U2R recall), so the added
  complexity of synthetic oversampling wasn't justified here.
