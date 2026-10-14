#!/usr/bin/env bash
cd "$(dirname "$0")/backend/activity-recognition" && pip install -r requirements.txt && python server.py
