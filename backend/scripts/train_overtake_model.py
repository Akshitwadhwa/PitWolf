"""Train the PitWolf overtake-feasibility classifier.

Reads decision-point JSONs from data/f1-cache/decision-points/, keeps rows
that represent genuine on-track battles, engineers features, applies a strict
temporal split (train on earlier seasons, test on later ones — 2026 is held
out entirely per the competition methodology), and fits a RandomForest.

Artifacts written under data/f1-cache/models/:
- overtake_rf.joblib      (fitted model + feature names)
- overtake_report.json    (metrics, feature importances, class priors —
                           consumed by the dashboard)
"""

import argparse
import json
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

from car_mass import car_mass_kg
from fetch_f1_session import CACHE_DIR

ROOT = pathlib.Path(CACHE_DIR).parent
MODELS = ROOT / 'models'

FEATURES = [
    'gapS', 'closingRateS', 'speedDeltaKph', 'tyreAgeDiff', 'lapFraction',
    'position', 'raceMeanSpeedKph', 'attackerCompoundOrd', 'defenderCompoundOrd',
    'drsEligible', 'attackerMassKg', 'massDeltaKg',
]
LABELS = ['SAVE', 'DELAY', 'ATTACK']

COMPOUND_ORDINAL = {'SOFT': 0, 'MEDIUM': 1, 'HARD': 2, 'INTERMEDIATE': 3, 'WET': 4}


def load_rows():
    records = []
    for path in sorted(ROOT.glob('decision-points/*/*.json')):
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            continue
        records.extend(payload.get('rows', []))
    return records


def to_frame(records):
    df = pd.DataFrame(records)
    if df.empty:
        return df
    keep = (~df['pitDistorted']) & df['defenderActive'] & df['gapS'].notna()
    df = df[keep].copy()
    df['closingRateS'] = df['closingRateS'].fillna(0.0)
    df['speedDeltaKph'] = df['speedDeltaKph'].fillna(0.0)
    df['tyreAgeDiff'] = df['tyreAgeDiff'].fillna(0.0)
    df['raceMeanSpeedKph'] = df['raceMeanSpeedKph'].fillna(df['raceMeanSpeedKph'].mean())
    df['attackerCompoundOrd'] = df['attackerCompound'].map(COMPOUND_ORDINAL).fillna(1.0)
    df['defenderCompoundOrd'] = df['defenderCompound'].map(COMPOUND_ORDINAL).fillna(1.0)
    df['drsEligible'] = (df['gapS'] <= 1.0).astype(float)
    df['attackerMassKg'] = [
        car_mass_kg(y, drv, lf) for y, drv, lf in
        zip(df['year'], df['driver'], df['lapFraction'])]
    df['massDeltaKg'] = [
        car_mass_kg(y, drv, lf) - car_mass_kg(y, dfd, lf)
        for y, drv, dfd, lf in
        zip(df['year'], df['driver'], df['defender'], df['lapFraction'])]
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--test-from', type=int, default=2025,
                        help='first year held out as test (strict temporal split)')
    parser.add_argument('--max-train-year', type=int, default=None)
    args = parser.parse_args()

    df = to_frame(load_rows())
    if len(df) < 50:
        raise SystemExit(json.dumps({'error': 'not enough decision points yet', 'rows': len(df)}))

    train_df = df[df['year'] < args.test_from]
    test_df = df[df['year'] >= args.test_from]
    if args.max_train_year is not None:
        train_df = train_df[train_df['year'] <= args.max_train_year]
    if train_df.empty or test_df.empty:
        raise SystemExit(json.dumps({
            'error': 'temporal split produced an empty side',
            'trainRows': len(train_df), 'testRows': len(test_df),
            'years': sorted(df['year'].unique().tolist()),
        }))

    X_train, y_train = train_df[FEATURES].to_numpy(), train_df['label'].to_numpy()
    X_test, y_test = test_df[FEATURES].to_numpy(), test_df['label'].to_numpy()

    model = RandomForestClassifier(
        n_estimators=400, max_depth=8, min_samples_leaf=20,
        class_weight='balanced', random_state=7, n_jobs=-1)
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    proba = model.predict_proba(X_test)
    attack_idx = list(model.classes_).index('ATTACK') if 'ATTACK' in model.classes_ else None

    report = {
        'modelType': 'RandomForestClassifier',
        'temporalSplit': {'trainYears': sorted(train_df['year'].unique().tolist()),
                          'testYears': sorted(test_df['year'].unique().tolist())},
        'rows': {'train': len(train_df), 'test': len(test_df)},
        'classCounts': {'train': train_df['label'].value_counts().to_dict(),
                        'test': test_df['label'].value_counts().to_dict()},
        'testAccuracy': round(float(accuracy_score(y_test, pred)), 4),
        'testReport': classification_report(y_test, pred, zero_division=0, output_dict=True),
        'featureImportances': {name: round(float(v), 4) for name, v in
                               zip(FEATURES, model.feature_importances_)},
        'features': FEATURES,
        'labels': LABELS,
        'note': 'Outcome labels: ATTACK = pass made and held 6 laps; DELAY = durable pass within 6 laps; SAVE = none. Modelled, not measured.',
    }

    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({'model': model, 'features': FEATURES, 'classes': list(model.classes_)},
                MODELS / 'overtake_rf.joblib')
    (MODELS / 'overtake_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('rows', 'temporalSplit', 'testAccuracy', 'featureImportances')}, indent=2))


if __name__ == '__main__':
    main()
