# Trains the blood-pressure model and saves it as bp_model.joblib (next to this file).
#   python train_model.py
# Input : collected_data.csv  (Red_Raw, IR_Raw, BPM, PulseInterval_ms -> Systolic_BP, Diastolic_BP)
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

BASE = Path(__file__).resolve().parent

# Data load
df = pd.read_csv(BASE / "collected_data.csv")

# Input features and target columns
X = df[["Red_Raw", "IR_Raw", "BPM", "PulseInterval_ms"]]
y = df[["Systolic_BP", "Diastolic_BP"]]

# Train / test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Model training
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Save -> bp_model.joblib
joblib.dump(model, BASE / "bp_model.joblib")
print("Model saved successfully as 'bp_model.joblib'")

# Accuracy on the test split
y_pred = model.predict(X_test)
r2 = r2_score(y_test, y_pred)
mae_sys = mean_absolute_error(y_test["Systolic_BP"], y_pred[:, 0])
mae_dia = mean_absolute_error(y_test["Diastolic_BP"], y_pred[:, 1])

print("=" * 40)
print(f"Overall Model Accuracy (R2 Score): {r2 * 100:.2f}%")
print("=" * 40)
print(f"Systolic BP Error (MAE) : {mae_sys:.2f} mmHg")
print(f"Diastolic BP Error (MAE): {mae_dia:.2f} mmHg")
print("=" * 40)
