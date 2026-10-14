#!/usr/bin/env bash
cd "$(dirname "$0")/backend/cardiovascular" || exit 1
pip install -r requirements.txt
[ -f bp_model.joblib ] || python train_model.py
python server.py
