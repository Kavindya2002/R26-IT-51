#!/usr/bin/env bash
cd "$(dirname "$0")/backend/environmental-risk" && pip install -r requirements.txt && python server.py
