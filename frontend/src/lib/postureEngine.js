// =========================================================
//  POSTURE DECISION ENGINE  -  multi-factor fall logic
// =========================================================
//  A tilt ANGLE alone is never enough to call a fall (bending down,
//  sitting, reaching for something all tilt the body). So every level
//  combines three kinds of evidence from the wearable sensor:
//
//     1. ANGLE            how far the body is from upright (0° upright)
//     2. MOVEMENT         angular velocity, how fast the tilt changes,
//                         how steady / unsteady the movement is
//     3. WHAT HAPPENS AFTER   does the person get back up, or stay down
//
//  LEVEL  RESPONSE             CONDITION
//   0     Upright              tilt < 10°
//   1     Slight Tilt          10°–25° + normal (steady) movement
//   2     Losing Balance       25°+ and UNSTABLE movement
//   3     Early Fall Warning   FAST tilting + HIGH angular velocity (any angle)
//   4     Potential Fall       45°+ with fast downward movement and a
//                              sudden posture change
//   5     Fall Confirmed       after level 3/4: stays down (tilted) and
//                              still for `confirmMs`
//
//  The AI model (Random Forest) is extra evidence: a "*_fall" prediction
//  (>= mlMinConf) can replace the "fast movement" evidence, but the AI
//  alone never raises an alert.
//
//  Every threshold below was checked against the recorded dataset
//  (361 sessions, see backend/activity-recognition/FallDetection).
//  The device smooths its signal (ALPHA = 0.1), so angular velocities
//  are small numbers: walking peaks at < 10 °/s, real falls at 11-30 °/s.
// =========================================================

export const DEFAULT_LOGIC = {
  // ---- angle bands (degrees from upright) ----
  slightTilt: 10, // below = upright
  losingTilt: 25, // 25°+ with unstable movement = losing balance
  fallTilt: 45, // 45°+ (with fast posture change) = potential fall

  // ---- movement evidence (all in °/s) ----
  earlyMinTilt: 10, // "any angle" still needs at least this much tilt (ignores sensor bumps)
  fastTiltRate: 12, // how fast the tilt angle grows (over ~0.4 s)
  highGyro: 11, // angular velocity about the tilt axes (gx, gz)
  unstableGyro: 6, // average angular velocity over 1 s = unstable
  postureChangeDeg: 15, // tilt grew by this much within 2 s = posture change

  // ---- after the fall ----
  downTilt: 30, // still tilted at least this much = "stayed down"
  stillGyro: 3, // below this angular velocity = "still"
  confirmMs: 3000, // down + still this long = FALL CONFIRMED (use 5000+ in a care home)
  recoverTilt: 15, // back below this ...
  recoverMs: 1500, // ... for this long = recovered, event cancelled
  clearTilt: 20, // to clear a confirmed fall: upright below this ...
  clearMs: 1000, // ... for this long ...
  holdMs: 3000, // ... and at least this long after the alert

  // ---- misc ----
  mlMinConf: 0.6, // AI "*_fall" prediction counts above this confidence
  dwell: 2 // consecutive samples a trigger must hold (ignores 1-sample spikes)
};

// Set to false if the 3D avatar leans the wrong way left/right.
export const MIRROR_LR = true;

export const LEVELS = [
  { name: "UPRIGHT", hex: "#00ff88" },
  { name: "SLIGHT TILT", hex: "#4db8ff" },
  { name: "LOSING BALANCE", hex: "#a66bff" },
  { name: "EARLY FALL WARNING", hex: "#ff7a1a" },
  { name: "POTENTIAL FALL", hex: "#ff4d4d" },
  { name: "FALL CONFIRMED", hex: "#ff1f1f" }
];

const RAD2DEG = 180 / Math.PI;

// Only the four real fall classes end with "_fall".
// (A plain .includes("fall") would also match "near_fall_recovered".)
export function isFallLabel(label) {
  return typeof label === "string" && label.endsWith("_fall");
}

export function prettyLabel(label) {
  if (!label) return "—";
  return String(label).replace(/_/g, " ");
}

// Pitch / roll in degrees for the HUD and the avatar.
//   pitch > 0 → leaning forward,  pitch < 0 → backward
//   roll  > 0 → leaning right,    roll  < 0 → left
export function orientation(imu) {
  const ax = imu?.ax ?? 0,
    ay = imu?.ay ?? 1,
    az = imu?.az ?? 0;
  const pitch = Math.atan2(-az, Math.hypot(ax, ay));
  const roll = Math.atan2(ax, ay);
  return { pitchRad: pitch, rollRad: roll, pitchDeg: pitch * RAD2DEG, rollDeg: roll * RAD2DEG };
}

// calculate tilt and direction
export function readPosture(imu) {
  const ax = imu?.ax ?? 0,
    ay = imu?.ay ?? 1,
    az = imu?.az ?? 0;
  const n = Math.hypot(ax, ay, az) || 1;
  const tilt = Math.acos(Math.max(-1, Math.min(1, ay / n))) * RAD2DEG;
  const sx = ax / n; // +x = right
  const sz = az / n; // +z = backward
  let dir = "none";
  if (Math.hypot(sx, sz) > 0.05) {
    const side = sx > 0 ? "right" : "left";
    const fb = sz > 0 ? "backward" : "forward";
    const a = Math.abs(sx),
      b = Math.abs(sz);
    dir = Math.min(a, b) / Math.max(a, b) > 0.6 ? `${fb}-${side}` : a > b ? side : fb;
  }
  return { tilt, dir };
}

export function createPostureEngine(L = DEFAULT_LOGIC) {
  let hist = []; // {t, tilt, gl, rate}
  let ewRun = 0,
    potRun = 0;
  let event = null; // {t0, peak, dir, level, stillSince, recoverSince}
  let confirmed = null; // {t, dir, peak}
  let clearSince = null;

  function reset() {
    hist = [];
    ewRun = potRun = 0;
    event = null;
    confirmed = null;
    clearSince = null;
  }

  // helpers over the recent history ------------------------------------
  const since = (now, ms) => hist.filter((h) => h.t >= now - ms);
  const peak = (arr, key) => arr.reduce((m, h) => Math.max(m, h[key] ?? 0), 0);
  const mean = (arr, key) =>
    arr.length ? arr.reduce((s, h) => s + (h[key] ?? 0), 0) / arr.length : 0;

  // sample:     {ax, ay, az, gx, gy, gz}
  // prediction: latest /predict response (with .receivedAt) or null
  // opts:       { now: ms, isNew: false when the same sample is seen again }
  function update(sample, prediction, opts = {}) {
    const now = opts.now ?? Date.now();
    const isNew = opts.isNew ?? true;
    const p = readPosture(sample);

    if (isNew) {
      const gl = Math.hypot(sample?.gx ?? 0, sample?.gz ?? 0); // rotation about the tilt axes (yaw gy ignored)
      let rate = 0;
      // tilt speed: change of angle over the last ~0.4 s
      for (let i = hist.length - 1; i >= 0; i--) {
        if (now - hist[i].t >= 350) {
          rate = (p.tilt - hist[i].tilt) / ((now - hist[i].t) / 1000);
          break;
        }
      }
      hist.push({ t: now, tilt: p.tilt, gl, rate });
      hist = hist.filter((h) => h.t >= now - 4000);
    }

    // ---- evidence ----
    const fastTilt = peak(since(now, 600), "rate") >= L.fastTiltRate;
    const gyroPeak = peak(since(now, 600), "gl");
    const highGyro = gyroPeak >= L.highGyro;
    const gyroMean = mean(since(now, 1000), "gl");
    const unstable = gyroMean >= L.unstableGyro;
    const tiltRate = peak(since(now, 600), "rate");
    const minTilt2s = since(now, 2000).reduce((m, h) => Math.min(m, h.tilt), p.tilt);
    const postureChange = p.tilt - minTilt2s >= L.postureChangeDeg;
    const aiFresh = prediction && (!prediction.receivedAt || now - prediction.receivedAt < 3000);
    const aiFall =
      !!aiFresh && isFallLabel(prediction.label) && prediction.confidence >= L.mlMinConf;

    // ---- triggers (must hold for `dwell` new samples) ----
    const earlyNow = (p.tilt >= L.earlyMinTilt && fastTilt && highGyro) || (aiFall && p.tilt >= L.losingTilt);
    const potentialNow =
      p.tilt >= L.fallTilt &&
      postureChange &&
      (peak(since(now, 1500), "rate") >= L.fastTiltRate || aiFall);
    if (isNew) {
      ewRun = earlyNow ? ewRun + 1 : 0;
      potRun = potentialNow ? potRun + 1 : 0;
    }

    // ---- fall event (level 3/4) → confirmation / recovery ----
    if (!event && !confirmed && (ewRun >= L.dwell || potRun >= L.dwell)) {
      event = {
        t0: now,
        peak: p.tilt,
        dir: p.dir,
        level: potRun >= L.dwell ? 4 : 3,
        stillSince: null,
        recoverSince: null
      };
    }
    if (event) {
      if (potRun >= L.dwell) event.level = 4;
      if (p.tilt >= event.peak) {
        event.peak = p.tilt;
        if (p.dir !== "none") event.dir = p.dir;
      }
      // recovered → cancel
      if (p.tilt < L.recoverTilt) {
        event.recoverSince ??= now;
        if (now - event.recoverSince >= L.recoverMs) event = null;
      } else {
        event.recoverSince = null;
      }
    }
    if (event) {
      // stayed down AND still
      const down = p.tilt >= L.downTilt;
      const still = mean(since(now, 800), "gl") < L.stillGyro;
      if (down && still) event.stillSince ??= now;
      else event.stillSince = null;
      if (event.stillSince && now - event.stillSince >= L.confirmMs) {
        confirmed = { t: now, dir: event.dir, peak: event.peak };
        event = null;
        clearSince = null;
      }
    }
    // ---- clear a confirmed fall once the person is upright again ----
    if (confirmed) {
      if (p.tilt < L.clearTilt) {
        clearSince ??= now;
        if (now - clearSince >= L.clearMs && now - confirmed.t >= L.holdMs) {
          confirmed = null;
          clearSince = null;
        }
      } else {
        clearSince = null;
      }
    }

    // ---- final level ----
    let level;
    if (confirmed) level = 5;
    else if (event) level = event.level;
    else if (p.tilt >= L.losingTilt && unstable) level = 2;
    else if (p.tilt >= L.slightTilt) level = 1;
    else level = 0;

    // ---- text - why message ----
    const t = p.tilt.toFixed(0);
    const act =
      prediction?.context?.previous_activity && prediction.context.previous_activity !== "unknown"
        ? prettyLabel(prediction.context.previous_activity)
        : "";
    const actTxt = act ? ` while ${act}` : "";
    const dirOf = (d) => (d && d !== "none" ? d : "");
    const stillSec = event?.stillSince ? (now - event.stillSince) / 1000 : 0;
    const confirmPct = event?.stillSince
      ? Math.min(100, ((now - event.stillSince) / L.confirmMs) * 100)
      : 0;

    let title, why;
    if (level === 5) {
      const d = dirOf(confirmed.dir);
      title = "FALL CONFIRMED" + (d ? " · " + d.toUpperCase() : "");
      why = `User fell ${d}${actTxt}. The body tilted up to ${confirmed.peak.toFixed(
        0
      )}° and has stayed down and still. Now at ${t}°.`;
    } else if (level === 4) {
      const d = dirOf(event.dir);
      title = "POTENTIAL FALL" + (d ? " · " + d.toUpperCase() : "");
      why =
        `Body went past ${L.fallTilt}° (now ${t}°) ${d ? "toward the " + d : ""} with a fast downward movement and a sudden posture change.` +
        (event.stillSince
          ? ` Staying down — confirming (${stillSec.toFixed(1)} / ${(L.confirmMs / 1000).toFixed(0)} s).`
          : " Waiting to see if the person gets back up.");
    } else if (level === 3) {
      const d = dirOf(event.dir);
      title = "EARLY FALL WARNING" + (d ? " · " + d.toUpperCase() : "");
      why =
        `Fast tilting (${tiltRate.toFixed(0)}°/s) with high angular velocity (${gyroPeak.toFixed(
          0
        )}°/s)${d ? " toward the " + d : ""}, now at ${t}°. A fall may be starting.` +
        (aiFall ? ` The AI model also predicts "${prettyLabel(prediction.label)}".` : "") +
        (event.stillSince
          ? ` Staying down — confirming (${stillSec.toFixed(1)} / ${(L.confirmMs / 1000).toFixed(0)} s).`
          : "");
    } else if (level === 2) {
      title = "LOSING BALANCE" + (dirOf(p.dir) ? " · " + p.dir.toUpperCase() : "");
      why = `Leaning ${dirOf(p.dir)} by ${t}° with unstable movement (${gyroMean.toFixed(
        0
      )}°/s average). Balance is being lost, but the tilt is not fast enough to be a fall.`;
    } else if (level === 1) {
      if (p.tilt < L.losingTilt) {
        title = (dirOf(p.dir) ? p.dir.toUpperCase() + " " : "") + "TILT";
        title = "SLIGHT TILT" + (dirOf(p.dir) ? " · " + p.dir.toUpperCase() : "");
        why = `Leaning slightly ${dirOf(p.dir)} (${t}°) with normal movement. Not a fall.`;
      } else {
        title = "STEADY LEAN" + (dirOf(p.dir) ? " · " + p.dir.toUpperCase() : "");
        why = `Leaning ${dirOf(p.dir)} by ${t}° but steadily — slow, controlled movement (like bending or reaching). Angle alone is not a fall.`;
      }
    } else {
      title = "UPRIGHT";
      why = "Upright and stable.";
    }

    const note =
      aiFall && level < 3
        ? `AI says "${prettyLabel(prediction.label)}" but the sensor shows ${t}° and no fast tilting yet → not counted as a fall.`
        : "";

    return {
      level,
      title,
      why,
      note,
      hex: LEVELS[level].hex,
      tilt: p.tilt,
      dir: level >= 3 ? (event?.dir ?? confirmed?.dir ?? p.dir) : p.dir,
      evidence: {
        tilt: p.tilt,
        gyro: gyroPeak,
        tiltRate,
        unstable,
        gyroMean,
        stillSec,
        confirmPct,
        confirming: level === 3 || level === 4 ? !!event?.stillSince : false
      }
    };
  }

  return { update, reset };
}
