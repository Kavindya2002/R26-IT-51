import os
import joblib
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import LabelEncoder

try:
    from xgboost import XGBClassifier
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

# ============================================================
# CONFIGURATION
# ============================================================

DATASET_PATH = "eldercare_training_dataset.csv"
MODEL_SAVE_PATH = "risk_classifier_rf.joblib"
LABEL_ENCODER_PATH = "label_encoder.joblib"

# ============================================================
# FEATURE ENGINEERING & PREPROCESSING
# ============================================================

def preprocess_features(df: pd.DataFrame):
    """
    Extract raw sensors and derive physical composite features:
    - Total Acceleration Magnitude: sqrt(accX^2 + accY^2 + accZ^2)
    - Total Gyro Angular Velocity Magnitude: sqrt(gyroX^2 + gyroY^2 + gyroZ^2)
    - Tilt Angle from Vertical (Z-axis): arccos(accZ / total_acc)
    """
    # Raw feature columns
    raw_numeric_features = [
        
        "light",
        "moisture",
        "motion",
        "distance",
        "accX",
        "accY",
        "accZ",
        "gyroX",
        "gyroY",
        "gyroZ"
    ]
    
    # Fill any null values if present
    X = df[raw_numeric_features].copy()
    X.fillna(0, inplace=True)

    # Derived kinematic metrics
    total_acc = np.sqrt(X["accX"]**2 + X["accY"]**2 + X["accZ"]**2)
    total_gyro = np.sqrt(X["gyroX"]**2 + X["gyroY"]**2 + X["gyroZ"]**2)
    
    # Avoid division by zero for tilt calculation
    clipped_acc_z = np.clip(X["accZ"] / (total_acc + 1e-6), -1.0, 1.0)
    tilt_angle = np.degrees(np.arccos(clipped_acc_z))

    X["total_acc"] = total_acc
    X["total_gyro"] = total_gyro
    X["tilt_angle"] = tilt_angle

    return X

# ============================================================
# TRAINING PIPELINE
# ============================================================

def train():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Could not find dataset at '{DATASET_PATH}'. Generate it first.")

    print(f"[*] Loading dataset: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH)

    # Encode categorical target labels (LOW -> 0, MEDIUM -> 1, HIGH -> 2)
    le = LabelEncoder()
    y = le.fit_transform(df["label"].str.upper())

    # Build feature matrix
    X = preprocess_features(df)
    feature_names = X.columns.tolist()

    # Stratified Train/Test Split (80% Train, 20% Test)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.20,
        random_state=42,
        stratify=y
    )

    print(f"[*] Training samples: {len(X_train)} | Test samples: {len(X_test)}")
    print(f"[*] Features used ({len(feature_names)}): {feature_names}\n")

    # 1. Random Forest Classifier
    rf_model = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(rf_model, X_train, y_train, cv=cv, scoring="accuracy")
    print(f"[*] 5-Fold Cross Validation Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    # Train Random Forest
    rf_model.fit(X_train, y_train)
    y_pred_rf = rf_model.predict(X_test)

    print("\n" + "=" * 55)
    print("RANDOM FOREST EVALUATION REPORT")
    print("=" * 55)
    print(classification_report(y_test, y_pred_rf, target_names=le.classes_))

    # 2. XGBoost Classifier (if installed)
    if XGB_AVAILABLE:
        xgb_model = XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
            eval_metric="mlogloss"
        )
        xgb_model.fit(X_train, y_train)
        y_pred_xgb = xgb_model.predict(X_test)
        print("=" * 55)
        print("XGBOOST EVALUATION REPORT")
        print("=" * 55)
        print(classification_report(y_test, y_pred_xgb, target_names=le.classes_))

    # Save artifacts for real-time inference
    joblib.dump(rf_model, MODEL_SAVE_PATH)
    joblib.dump(le, LABEL_ENCODER_PATH)
    print(f"[+] Model saved to: {MODEL_SAVE_PATH}")
    print(f"[+] Label encoder saved to: {LABEL_ENCODER_PATH}")

    # Feature Importance Plot
    importances = rf_model.feature_importances_
    indices = np.argsort(importances)[::-1]

    plt.figure(figsize=(10, 5))
    plt.title("Random Forest - Feature Importances")
    plt.bar(range(len(importances)), importances[indices], align="center")
    plt.xticks(range(len(importances)), [feature_names[i] for i in indices], rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig("feature_importance.png", dpi=300)
    print("[+] Feature importance plot saved to 'feature_importance.png'")

    # Confusion Matrix Plot
    cm = confusion_matrix(y_test, y_pred_rf)
    plt.figure(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=le.classes_, yticklabels=le.classes_)
    plt.xlabel("Predicted")
    plt.ylabel("Ground Truth")
    plt.title("Confusion Matrix (Random Forest)")
    plt.tight_layout()
    plt.savefig("confusion_matrix.png", dpi=300)
    print("[+] Confusion matrix saved to 'confusion_matrix.png'")

if __name__ == "__main__":
    train()