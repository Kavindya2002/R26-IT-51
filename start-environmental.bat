@echo off
cd /d "%~dp0backend\environmental-risk"
pip install -r requirements.txt
python server.py
pause
