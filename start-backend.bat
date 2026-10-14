@echo off
cd /d "%~dp0backend\activity-recognition"
pip install -r requirements.txt
python server.py
pause
