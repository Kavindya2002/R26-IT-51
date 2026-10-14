"""
===================================================
  Fall Detection Model Trainer
  RF  vs  Decision Tree  vs  KNN comparison
===================================================
  Usage:
      python train_fall_detector.py --csv fall_data.csv --output_dir ./output

  Outputs:
      [output_dir]/models/fall_rf_model.pkl       - Random Forest model
      [output_dir]/models/fall_dt_model.pkl       - Decision Tree model
      [output_dir]/models/fall_knn_model.pkl      - KNN model
      [output_dir]/models/label_encoder.pkl       - LabelEncoder for inference
      [output_dir]/models/scaler.pkl              - StandardScaler for inference
      [output_dir]/plots/confusion_rf.png         - RF confusion matrix
      [output_dir]/plots/confusion_dt.png         - DT confusion matrix
      [output_dir]/plots/confusion_knn.png        - KNN confusion matrix
      [output_dir]/plots/model_comparison.png     - Bar chart comparing all 3 models
      [output_dir]/plots/feature_importance_rf.png - RF Feature importance plot
===================================================
"""

import argparse
import os
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pickle

from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score
)

# ─────────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────────

WINDOW_SIZE   = 20      # samples per window
STEP_SIZE     = 10      # sliding window step (50% overlap)
FEATURES      = ["ax","ay","az","gx","gy","gz","mag"]
RANDOM_SEED   = 42

# ─────────────────────────────────────────────────
#  1.  LOAD DATA
# ─────────────────────────────────────────────────

def load_data(csv_path):
    df = pd.read_csv(csv_path)
    print(f"\n{'='*50}")
    print(f"  Loaded  {len(df)} rows  |  {df['label'].nunique()} classes")
    print(f"{'='*50}")
    print(df["label"].value_counts().to_string())
    print()
    return df

# ─────────────────────────────────────────────────
#  2.  SLIDING WINDOW → FEATURE EXTRACTION
# ─────────────────────────────────────────────────

def extract_features_from_window(window):
    feats = []
    data = window[FEATURES].values   # (WINDOW_SIZE, 7)

    for i, col in enumerate(FEATURES):
        col_data = data[:, i]
        feats.append(np.mean(col_data))
        feats.append(np.std(col_data))
        feats.append(np.min(col_data))
        feats.append(np.max(col_data))
        feats.append(np.max(col_data) - np.min(col_data))
        feats.append(np.sqrt(np.mean(col_data**2)))           # RMS
        feats.append(np.percentile(col_data, 75) -
                     np.percentile(col_data, 25))              # IQR

    # Cross-axis correlations (accel only)
    ax = data[:, 0]; ay = data[:, 1]; az = data[:, 2]
    feats.append(np.corrcoef(ax, ay)[0, 1])
    feats.append(np.corrcoef(ax, az)[0, 1])
    feats.append(np.corrcoef(ay, az)[0, 1])

    return np.array(feats, dtype=np.float32)


def build_windows(df):
    X_feats   = []   
    y_labels  = []

    sessions = df.groupby(["label","session_id"])

    for (label, sid), group in sessions:
        group = group.sort_values("sample_index").reset_index(drop=True)
        data  = group[FEATURES].values
        n     = len(data)

        if n < WINDOW_SIZE:
            pad = np.zeros((WINDOW_SIZE - n, len(FEATURES)))
            seq = np.vstack([data, pad])
            feats = extract_features_from_window(
                pd.DataFrame(seq, columns=FEATURES)
            )
            X_feats.append(feats)
            y_labels.append(label)
            continue

        for start in range(0, n - WINDOW_SIZE + 1, STEP_SIZE):
            window_df = group.iloc[start:start + WINDOW_SIZE]
            feats     = extract_features_from_window(window_df)
            X_feats.append(feats)
            y_labels.append(label)

    X_feats  = np.array(X_feats,  dtype=np.float32)
    y_labels = np.array(y_labels)

    print(f"Windows created  : {len(y_labels)}")
    print(f"Feature shape    : {X_feats.shape}")
    print()

    return X_feats, y_labels

# ─────────────────────────────────────────────────
#  3.  ENCODE LABELS
# ─────────────────────────────────────────────────

def encode_labels(y):
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    print("Classes:", list(le.classes_))
    return y_enc, le

# ─────────────────────────────────────────────────
#  4.  MODEL TRAINING FUNCTIONS
# ─────────────────────────────────────────────────

def train_model(model, name, X_tr, X_te, y_train, y_test, le, plots_dir):
    print("\n" + "="*50)
    print(f"  {name.upper()}")
    print("="*50)

    model.fit(X_tr, y_train)

    y_pred = model.predict(X_te)
    acc    = accuracy_score(y_test, y_pred)
    f1     = f1_score(y_test, y_pred, average="weighted")

    print(f"\nAccuracy : {acc*100:.2f}%")
    print(f"F1 Score : {f1*100:.2f}%  (weighted)")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # confusion matrix setup
    cm = confusion_matrix(y_test, y_pred)
    confusion_filename = os.path.join(plots_dir, f"confusion_{name.lower().replace(' ', '_')}.png")
    plot_confusion(cm, le.classes_, name, confusion_filename)

    return model, acc, f1

# ─────────────────────────────────────────────────
#  5.  PLOTS
# ─────────────────────────────────────────────────

def plot_confusion(cm, classes, title, filename):
    fig, ax = plt.subplots(figsize=(7, 5))
    sns.heatmap(
        cm, annot=True, fmt="d",
        cmap="Blues", ax=ax,
        xticklabels=classes,
        yticklabels=classes
    )
    ax.set_title(f"Confusion Matrix — {title}", fontsize=13, pad=12)
    ax.set_xlabel("Predicted", fontsize=11)
    ax.set_ylabel("Actual",    fontsize=11)
    plt.xticks(rotation=30, ha="right", fontsize=9)
    plt.yticks(rotation=0,  fontsize=9)
    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    plt.close()
    print(f"  Saved: {filename}")


def plot_feature_importance(rf, filename):
    importances = rf.feature_importances_
    idx         = np.argsort(importances)[-20:][::-1]
    fig, ax     = plt.subplots(figsize=(8, 4))
    ax.bar(range(len(idx)), importances[idx], color="#1a6aff")
    ax.set_title("Top-20 Feature Importances (Random Forest)", fontsize=12)
    ax.set_xticks(range(len(idx)))
    ax.set_xticklabels([f"f{i}" for i in idx], fontsize=8)
    ax.set_ylabel("Importance")
    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    plt.close()
    print(f"  Saved: {filename}")


def plot_comparison(metrics_dict, filename):
    models  = list(metrics_dict.keys())
    accs    = [m["acc"] * 100 for m in metrics_dict.values()]
    f1s     = [m["f1"]  * 100 for m in metrics_dict.values()]
    colors  = ["#00cc66", "#1a6aff", "#ff9933"]

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, vals, ylabel in zip(
        axes,
        [accs, f1s],
        ["Accuracy (%)", "F1 Score (%)"]
    ):
        bars = ax.bar(models, vals, color=colors, width=0.4)
        ax.set_ylim(0, 110)
        ax.set_ylabel(ylabel)
        for bar, v in zip(bars, vals):
            ax.text(
                bar.get_x() + bar.get_width()/2,
                bar.get_height() + 1,
                f"{v:.1f}%",
                ha="center", va="bottom", fontsize=10, fontweight="bold"
            )

    axes[0].set_title("Accuracy Comparison")
    axes[1].set_title("F1 Score Comparison")
    plt.suptitle("Model Evaluation Summary", fontsize=13)
    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    plt.close()
    print(f"  Saved: {filename}")

# ─────────────────────────────────────────────────
#  6.  SAVE ARTIFACTS
# ─────────────────────────────────────────────────

def save_artifacts(models_dict, scaler, le, models_dir):
    for model_name, model in models_dict.items():
        filename = os.path.join(models_dir, f"fall_{model_name}_model.pkl")
        with open(filename, "wb") as f:
            pickle.dump(model, f)
        print(f"  Saved: {filename}")
        
    scaler_path = os.path.join(models_dir, "scaler.pkl")
    le_path = os.path.join(models_dir, "label_encoder.pkl")
    
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    with open(le_path, "wb") as f:
        pickle.dump(le, f)
    print(f"  Saved: {scaler_path}")
    print(f"  Saved: {le_path}")


# ─────────────────────────────────────────────────
#  7.  INFERENCE SNIPPET
# ─────────────────────────────────────────────────

INFERENCE_SNIPPET = '''
# ── HOW TO USE THE TRAINED MODELS ─────────────────────────

import pickle, numpy as np, os

models_dir = "./output/models"

# Load core pre-processing objects
with open(os.path.join(models_dir, "scaler.pkl"), "rb")        as f: scaler = pickle.load(f)
with open(os.path.join(models_dir, "label_encoder.pkl"), "rb") as f: le = pickle.load(f)

# Load selected model: rf, dt, or knn
with open(os.path.join(models_dir, "fall_rf_model.pkl"), "rb") as f: model = pickle.load(f)

# Extract your feature vector from data window 
# feats   = extract_features_from_window(pd.DataFrame(window, columns=FEATURES))
# feats_s = scaler.transform([feats])
# pred    = le.inverse_transform(model.predict(feats_s))[0]
'''

# ─────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train fall detection models")
    parser.add_argument("--csv", default="fall_data_2026-05-23T03-47-30.csv",
                        help="Path to your CSV file")
    parser.add_argument("--output_dir", default="./output",
                        help="Base folder to save models/ and plots/")
    args = parser.parse_args()

    np.random.seed(RANDOM_SEED)

    # Resolve output directories dynamically
    models_dir = os.path.join(args.output_dir, "models")
    plots_dir = os.path.join(args.output_dir, "plots")
    os.makedirs(models_dir, exist_ok=True)
    os.makedirs(plots_dir, exist_ok=True)

    # 1. Load Data
    df = load_data(args.csv)

    # 2. Build Feature Windows
    X_feats, y = build_windows(df)

    # 3. Encode Labels
    y_enc, le = encode_labels(y)

    # 4. Split Data
    X_train, X_test, y_train, y_test = train_test_split(
        X_feats, y_enc,
        test_size    = 0.2,
        random_state = RANDOM_SEED,
        stratify     = y_enc
    )

    print(f"Train windows: {len(y_train)}  |  Test windows: {len(y_test)}\n")

    # Scale Features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # 5. Define Models
    rf_clf = RandomForestClassifier(n_estimators=200, random_state=RANDOM_SEED, n_jobs=-1)
    dt_clf = DecisionTreeClassifier(max_depth=None, random_state=RANDOM_SEED)
    knn_clf = KNeighborsClassifier(n_neighbors=5, weights="distance", n_jobs=-1)

    # 6. Train & Evaluate Models
    rf_model, rf_acc, rf_f1 = train_model(
        rf_clf, "Random Forest", X_train_scaled, X_test_scaled, y_train, y_test, le, plots_dir
    )
    plot_feature_importance(rf_model, os.path.join(plots_dir, "feature_importance_rf.png"))

    dt_model, dt_acc, dt_f1 = train_model(
        dt_clf, "Decision Tree", X_train_scaled, X_test_scaled, y_train, y_test, le, plots_dir
    )

    knn_model, knn_acc, knn_f1 = train_model(
        knn_clf, "KNN", X_train_scaled, X_test_scaled, y_train, y_test, le, plots_dir
    )

    # 7. Comparison Visualizations
    metrics = {
        "Random Forest": {"acc": rf_acc, "f1": rf_f1},
        "Decision Tree": {"acc": dt_acc, "f1": dt_f1},
        "KNN":           {"acc": knn_acc, "f1": knn_f1}
    }
    plot_comparison(metrics, os.path.join(plots_dir, "model_comparison.png"))

    # 8. Save
    models_to_save = {
        "rf": rf_model,
        "dt": dt_model,
        "knn": knn_model
    }
    save_artifacts(models_to_save, scaler, le, models_dir)

    # 9. Summary Printouts
    print("\n" + "="*50)
    print("  FINAL COMPARISON")
    print("="*50)
    for model_name, score in metrics.items():
        print(f"  {model_name.ljust(15)} —  Acc: {score['acc']*100:.2f}%   F1: {score['f1']*100:.2f}%")
        
    winner = max(metrics, key=lambda k: metrics[k]["acc"])
    print(f"\n  ✓  Best model based on Accuracy: {winner}")
    print("="*50)
    print(INFERENCE_SNIPPET)

if __name__ == "__main__":
    main()