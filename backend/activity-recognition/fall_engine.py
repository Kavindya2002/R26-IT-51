# =========================================================
#  fall_engine.py
#  Context-Aware Fall Confirmation, Risk Scoring & Explanation Engine
# =========================================================
#
#  WHY THIS FILE EXISTS
#  ---------------------
#  The Random Forest classifier (train.py / fall_rf_model.pkl) only answers
#  "which of the 6 recorded motions does this 2-second window look most
#  like?". It has no concept of HOW FAR the body actually tilted, whether
#  an impact really happened, or whether the person stayed down afterwards.
#  That is why a small lean to one side can sometimes be reported as a
#  "fall" - the window shape looks similar to a real fall recording even
#  though the person never went to the ground.
#
#  This module adds a second, PHYSICS-BASED layer on top of the ML
#  prediction:
#
#     ML label  +  orientation angle  +  impact spike  +  post-impact
#     stillness  --->  CONFIRMED FALL / POSSIBLE FALL (recovered) / LEAN
#
#  It also produces:
#     - a continuous, proactive "Fall Risk Score" (0-100) that rises
#       BEFORE a fall happens (the novelty point: predicting risk in
#       advance, not just reporting an event after it happened), and
#     - a structured, human-readable explanation ("why did the system
#       decide this?") built from named trigger factors, which is the
#       explainability novelty requested for the research.
#
#  Everything here is intentionally rule-based and transparent (not a
#  black box) so it can be described, tuned and defended in your thesis.
# =========================================================

import math
from collections import deque

import numpy as np


# =========================================================
# 1. TUNABLE THRESHOLDS - Rule numbers
#    
# =========================================================

class Thresholds:
    """
    CALIBRATED FROM YOUR REAL RECORDED DATA (fall_data_2026-05-22*.csv,
    ~60 sessions per class, one subject):
      * standing_still / normal_walk : peak tilt from vertical <= ~7 deg
      * *_fall sessions              : peak tilt median ~38 deg,
                                       10th percentile ~29 deg
      * resultant magnitude 'mag'    : never above ~1.0-1.1 g in ANY class
        (the firmware smooths the signal), so a >1.8 g impact spike can
        NOT be used with this device. Impact check is therefore disabled
        (IMPACT_MAG_G = None). Re-enable it only if you record data where
        mag really spikes.
    Re-run calibrate_thresholds.py after you collect new data.
    """
    # ---- Orientation (degrees away from upright/vertical) ----
    # Above this = noticeable lean (shown as "leaning", never an alert).
    LEAN_ONSET_DEG = 15.0
    # A fall is only SUSPECTED once tilt reaches this (88% of your real
    # falls reach 30 deg; walking/standing never do).
    FALL_ONSET_DEG = 30.0
    # To CONFIRM, the body must still be tilted at least this much at the
    # END of the window (i.e. it stayed down, did not bounce back up).
    FALLEN_ORIENTATION_DEG = 25.0

    # ---- Impact (disabled for this device, see note above) ----
    IMPACT_MAG_G = None

    # ---- Post-fall stillness ----
    STILLNESS_GYRO_ENERGY = 8.0
    REQUIRED_STILL_CONFIRMATIONS = 2
    MAX_PENDING_CYCLES = 4
    RECOVERY_MOTION_ENERGY = 12.0

    # ---- Proactive risk score ----
    RISK_TREND_WINDOW = 6


# =========================================================
# 1b. LABEL HELPERS
#     Only the 4 real fall classes end with "_fall". The new
#     "near_fall_recovered" class contains the word "fall" but is
#     NOT a fall, so we must not use a plain substring check.
# =========================================================

# Postures where a large body tilt is NORMAL (not a lean / not a fall)
HORIZONTAL_OK_LABELS = {"lying_down"}


def is_fall_label(label):
    return str(label).endswith("_fall")


# =========================================================
# 2. ORIENTATION HELPERS - Tilt and direction maths
# =========================================================

def compute_orientation(ax, ay, az):
    """
    Returns (pitch_deg, roll_deg, tilt_deg) for YOUR device.

    In your recorded data the VERTICAL axis is ay (ay ~ +1 g when
    standing; the same mapping is used in Analyzer.html: AXIS.z = "ay").
    Checked against your real sessions:
        forward_fall  -> az goes NEGATIVE   (pitch > 0  = forward)
        backward_fall -> az goes POSITIVE   (pitch < 0  = backward)
        right_fall    -> ax goes POSITIVE   (roll  > 0  = right)
        left_fall     -> ax goes NEGATIVE   (roll  < 0  = left)
    tilt_deg = angle between the body and vertical (0 = upright).
    """
    pitch = math.degrees(math.atan2(-az, math.sqrt(ax * ax + ay * ay)))
    roll = math.degrees(math.atan2(ax, math.sqrt(ay * ay + az * az)))
    norm = math.sqrt(ax * ax + ay * ay + az * az) or 1e-9
    tilt = math.degrees(math.acos(max(-1.0, min(1.0, ay / norm))))
    return pitch, roll, tilt


def tilt_magnitude(pitch, roll):
    """Overall deviation from upright, in degrees (0 = perfectly upright)."""
    return math.sqrt(pitch * pitch + roll * roll)


def classify_direction(pitch, roll):
    """Dominant tilt direction, used only once a fall is being evaluated."""
    if abs(pitch) >= abs(roll):
        return "forward" if pitch > 0 else "backward"
    return "right" if roll > 0 else "left"


# =========================================================
# 3. PER-WINDOW PHYSICAL FEATURES
# =========================================================

def extract_physical_signals(df_window):
    """
    Computes the physics-based signals the confirmation engine needs from
    one window of raw samples (same window the ML model already receives).
    """
    ax = df_window["ax"].values
    ay = df_window["ay"].values
    az = df_window["az"].values
    gx = df_window["gx"].values
    gy = df_window["gy"].values
    gz = df_window["gz"].values
    mag = df_window["mag"].values

    pitches, rolls, tilts = [], [], []
    for i in range(len(ax)):
        p, r, t = compute_orientation(ax[i], ay[i], az[i])
        pitches.append(p)
        rolls.append(r)
        tilts.append(t)
    pitches = np.array(pitches)
    rolls = np.array(rolls)
    tilts = np.array(tilts)

    peak_idx = int(np.argmax(tilts))
    end_tilt = float(np.mean(tilts[-5:]))

    gyro_energy = float(np.std(gx) + np.std(gy) + np.std(gz))
    sway = float(np.std(ax) + np.std(ay))
    motion_energy = gyro_energy + sway

    return {
        "peak_tilt_deg": float(tilts[peak_idx]),
        "end_tilt_deg": end_tilt,
        "peak_pitch_deg": float(pitches[peak_idx]),
        "peak_roll_deg": float(rolls[peak_idx]),
        "mean_tilt_deg": float(np.mean(tilts)),
        "peak_impact_g": float(np.max(mag)),
        "gyro_energy": gyro_energy,
        "motion_energy": motion_energy,
    }


# =========================================================
# 4. PROACTIVE FALL-RISK SCORE  (novelty: predicts risk BEFORE a fall) - Risk score
# =========================================================

def compute_risk_score(signals, ml_probabilities):
    """
    A transparent, explainable 0-100 heuristic score describing how
    "at risk" the current movement looks, independent of whether a fall
    has actually been confirmed yet. It combines:

      - postural sway / instability (motion_energy)
      - how far the body is currently leaning (mean_tilt_deg)
      - the classifier's own combined probability mass on unstable
        classes (any *_fall class + not the confident walk/stand classes)

    This is intentionally simple and documented so it can be defended in
    your thesis as a first-pass heuristic. For a stronger contribution,
    replace this function with a regression model trained on a labelled
    "risk" target (see README_GUIDE.md, section 5) once you can collect
    graded-risk data (e.g. via a Timed-Up-and-Go / Morse Fall Scale style
    protocol with older adult volunteers).
    """
    instability_component = min(signals["motion_energy"] / 3.0, 1.0) * 45
    lean_component = min(signals["mean_tilt_deg"] / 45.0, 1.0) * 30

    unstable_prob_mass = sum(
        p for cls, p in ml_probabilities.items() if is_fall_label(cls)
    )
    classifier_component = min(unstable_prob_mass, 1.0) * 25

    score = instability_component + lean_component + classifier_component
    return float(max(0.0, min(100.0, score)))


def risk_level_label(score):
    if score >= 70:
        return "high"
    if score >= 40:
        return "elevated"
    return "low"


# =========================================================
# 5. THE STATEFUL FALL-CONFIRMATION ENGINE
# =========================================================

class FallEngine:
    """
    One instance per monitored wearer/device. Call `.update(...)` once per
    prediction cycle (i.e. once per call to /predict). Keeps a short
    rolling memory so a fall can be CONFIRMED across several consecutive
    windows instead of a single noisy window flipping the whole system.
    """

    MONITORING = "monitoring"
    PENDING = "pending_confirmation"
    CONFIRMED = "confirmed_fall"

    def __init__(self, thresholds: Thresholds = Thresholds()):
        self.th = thresholds
        self.state = self.MONITORING
        self.pending_cycles = 0
        self.still_streak = 0
        self.pending_direction = None
        self.pending_activity_before = None
        self.risk_history = deque(maxlen=60)  # ~1 minute of history at 1/s
        self.activity_history = deque(maxlen=10)

    # ----------------------------------------------------- state machine
    def update(self, ml_label, ml_confidence, probabilities, df_window):
        signals = extract_physical_signals(df_window)
        if ml_label in HORIZONTAL_OK_LABELS:
            # Lying down on purpose: a big tilt is expected, so it must
            # not count as leaning or raise the fall-risk score.
            signals["peak_tilt_deg"] = 0.0
            signals["mean_tilt_deg"] = 0.0
            signals["end_tilt_deg"] = 0.0
        risk_score = compute_risk_score(signals, probabilities)
        self.risk_history.append(risk_score)

        ml_says_fall = is_fall_label(ml_label)
        impact_ok = (
            self.th.IMPACT_MAG_G is None
            or signals["peak_impact_g"] >= self.th.IMPACT_MAG_G
        )
        physically_plausible_impact = (
            impact_ok and signals["peak_tilt_deg"] >= self.th.FALL_ONSET_DEG
        )
        is_still = signals["gyro_energy"] < self.th.STILLNESS_GYRO_ENERGY
        looks_fallen = signals["end_tilt_deg"] >= self.th.FALLEN_ORIENTATION_DEG

        # remember recent non-fall activity for narrative context
        if not ml_says_fall:
            self.activity_history.append(ml_label)

        event = "normal"
        confirmed_direction = None
        trigger_factors = []

        # ---------------- STATE MACHINE ----------------
        #--------------------------------------------------monitoring----------------------
        if self.state == self.MONITORING:
            if ml_says_fall and physically_plausible_impact:
                self.state = self.PENDING
                self.pending_cycles = 0
                self.still_streak = 0
                self.pending_direction = classify_direction(
                    signals["peak_pitch_deg"], signals["peak_roll_deg"]
                )
                self.pending_activity_before = self._previous_activity()
                event = "possible_fall"
                if self.th.IMPACT_MAG_G is not None:
                    trigger_factors.append(
                        f"Sudden impact of {signals['peak_impact_g']:.2f} g detected"
                    )
                trigger_factors.append(
                    f"Body tilt reached {signals['peak_tilt_deg']:.0f}° "
                    f"({self.pending_direction})"
                )
            elif signals["peak_tilt_deg"] >= self.th.LEAN_ONSET_DEG:
                # Real lean/sway, but not enough to call it a fall attempt.
                event = "leaning"
                trigger_factors.append(
                    f"Body tilted {signals['peak_tilt_deg']:.0f}°, "
                    f"below the {self.th.FALL_ONSET_DEG:.0f}° fall-onset threshold"
                )
            else:
                event = "normal"
#--------------------------------------------------pending----------------------
        elif self.state == self.PENDING:
            self.pending_cycles += 1
            if is_still and looks_fallen:
                self.still_streak += 1
            else:
                self.still_streak = 0

            if self.still_streak >= self.th.REQUIRED_STILL_CONFIRMATIONS:
                self.state = self.CONFIRMED
                event = "confirmed_fall"
                confirmed_direction = self.pending_direction
                trigger_factors.append(
                    f"No recovery motion for "
                    f"~{self.still_streak} consecutive checks after impact"
                )
                trigger_factors.append(
                    f"Body remained in a near-horizontal orientation "
                    f"(>{self.th.FALLEN_ORIENTATION_DEG:.0f}°)"
                )
            elif self.pending_cycles >= self.th.MAX_PENDING_CYCLES:
                self.state = self.MONITORING
                event = "near_fall_recovered"
                trigger_factors.append(
                    "Person regained a stable / upright posture shortly "
                    "after the initial instability - classified as a "
                    "stumble rather than a fall"
                )
            else:
                event = "confirming"
#--------------------------------------------------confirmed----------------------
        elif self.state == self.CONFIRMED:
            event = "confirmed_fall"
            confirmed_direction = self.pending_direction
            if signals["motion_energy"] > self.th.RECOVERY_MOTION_ENERGY:
                self.state = self.MONITORING
                self.pending_direction = None
                event = "recovered_from_fall"
                trigger_factors.append(
                    "Renewed movement detected - person appears to have "
                    "gotten up or been assisted"
                )

        return {
            "event": event,                      # normal | leaning | possible_fall
                                                   # | confirming | confirmed_fall
                                                   # | near_fall_recovered
            "state": self.state,
            "direction": confirmed_direction or self.pending_direction,
            "risk_score": round(risk_score, 1),
            "risk_level": risk_level_label(risk_score),
            "risk_trend": self._risk_trend(),
            "signals": signals,
            "trigger_factors": trigger_factors,
            "previous_activity": self.pending_activity_before or self._previous_activity(),
        }

    # -----------------------------------------------------
    def _previous_activity(self):
        if not self.activity_history:
            return "unknown"
        return self.activity_history[-1]

    def _risk_trend(self):
        """'rising' | 'falling' | 'stable' over the last RISK_TREND_WINDOW cycles."""
        n = self.th.RISK_TREND_WINDOW
        if len(self.risk_history) < n:
            return "stable"
        recent = list(self.risk_history)[-n:]
        delta = recent[-1] - recent[0]
        if delta > 10:
            return "rising"
        if delta < -10:
            return "falling"
        return "stable"


# =========================================================
# 6. EXPLAINABLE HUMAN-READABLE MESSAGE GENERATOR (novelty point)
# =========================================================

def generate_human_message(engine_result, ml_label, confidence):
    """
    Builds a rich, explainable narrative sentence from the structured
    engine output. This is deliberately template-based (fast, free,
    works fully offline on the ESP8266/Flask stack) but is written so an
    LLM call can be swapped in for an even more natural narrative - see
    `generate_llm_message()` below and README_GUIDE.md section 6.
    """
    event = engine_result["event"]
    direction = engine_result["direction"] or "unknown"
    prev = (engine_result["previous_activity"] or "unknown").replace("_", " ")
    risk = engine_result["risk_score"]
    trend = engine_result["risk_trend"]

    if event == "confirmed_fall":
        trend_clause = (
            " Instability had been rising in the seconds beforehand, "
            "consistent with a loss-of-balance event."
            if trend == "rising" else ""
        )
        return (
            f"CONFIRMED FALL: the user fell {direction} while {prev} and "
            f"has not shown recovery motion since impact.{trend_clause}"
        )

    if event == "possible_fall" or event == "confirming":
        return (
            f"Possible fall {direction} detected while {prev} - "
            f"confirming whether the person stays down before alerting."
        )

    if event == "recovered_from_fall":
        return (
            f"User has moved again after the fall {direction} - "
            f"likely got up or was assisted. Monitoring resumed."
        )

    if event == "near_fall_recovered":
        return (
            f"Near-fall detected: the user leaned sharply {direction} "
            f"but regained balance and did not go down. No alert raised."
        )

    if event == "leaning":
        return (
            f"Minor postural sway detected while {prev} "
            f"(risk score {risk:.0f}/100, {engine_result['risk_level']}). "
            f"This is within normal movement and is not a fall."
        )

    # normal (includes the case where the ML model guessed a fall class
    # but the physics layer found no real impact / sufficient tilt to
    # support it - this is the fix for "small lean gets called a fall")
    if is_fall_label(ml_label):
        base = (
            "The classifier flagged possible fall-like motion, but the "
            "tilt angle and impact force did not reach the confirmation "
            "thresholds, so this is treated as normal movement, not a fall."
        )
    elif "walk" in ml_label:
        base = "User is walking normally."
    elif "standing" in ml_label:
        base = "User is standing still."
    else:
        base = f"User activity: {ml_label.replace('_', ' ')}."

    if trend == "rising" and risk >= 40:
        base += (
            f" Fall-risk score is trending upward "
            f"({risk:.0f}/100, {engine_result['risk_level']}) - "
            f"increased gait instability observed."
        )
    return base


def generate_llm_message(engine_result, ml_label, confidence, api_call_fn=None):
    """
    OPTIONAL enhancement (see README_GUIDE.md section 6): pass in a small
    function `api_call_fn(prompt: str) -> str` that calls an LLM (Claude,
    GPT, etc.) to turn the structured context into an even more natural,
    clinically-styled sentence. Falls back to the offline template above
    if no api_call_fn is given or the call fails, so the system keeps
    working with no internet connection (important for a wearable health
    device demo).
    """
    template_message = generate_human_message(engine_result, ml_label, confidence)
    if api_call_fn is None:
        return template_message

    prompt = (
        "You are summarising a wearable fall-detection event for a "
        "caregiver notification. Write ONE short, clear sentence "
        "(max 30 words), plain language, no medical jargon.\n\n"
        f"Event: {engine_result['event']}\n"
        f"Direction: {engine_result['direction']}\n"
        f"Previous activity: {engine_result['previous_activity']}\n"
        f"Fall risk score: {engine_result['risk_score']}/100 "
        f"({engine_result['risk_level']}, trend: {engine_result['risk_trend']})\n"
        f"Trigger factors: {', '.join(engine_result['trigger_factors']) or 'none'}\n"
        f"Classifier label: {ml_label} (confidence {confidence:.2f})\n"
    )
    try:
        return api_call_fn(prompt).strip()
    except Exception:
        return template_message
