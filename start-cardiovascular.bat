@echo off
cd /d "%~dp0backend\cardiovascular"
pip install -r requirements.txt
if not exist bp_model.joblib python train_model.py
python server.py
pause
