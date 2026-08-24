/**
 * AFIP :: Prediction Engine
 * ---------------------------------------------------------------------
 * Purpose
 *   Forecast future aircraft and mission state using deterministic engineering logic — never random outputs.
 *
 * Inputs
 *   - Navigation
 *   - Energy
 *   - Health
 *   - Mission
 *
 * Outputs
 *   - ETA
 *   - Endurance
 *   - Failure forecasts
 *   - Mission success probability
 *
 * Dependencies
 *   - Health
 *   - Navigation
 *
 * Display
 *   Prediction panel
 *
 * Update frequency
 *   Continuous
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 5 — Prediction Engine).
 *
 * Design notes
 *   - Consumes the immutable World State Snapshot plus the Health
 *     Assessment produced this same cycle by AFIP.HealthMonitor
 *     (passed in directly by the caller — see Simulator_AFIP.html's
 *     loop() for the call sequence: Health -> Prediction -> Risk,
 *     matching the architecture pipeline in the project README).
 *   - Every forecast below is a deterministic engineering model
 *     (kinematic projection or bounded linear-trend extrapolation) —
 *     no machine learning, no statistical classifiers, no randomness.
 *   - Exactly like the Health Monitor, a forecast this build cannot
 *     honestly support (battery depletion — no Energy.* telemetry
 *     exists yet, see TELEMETRY_COVERAGE.md) is reported as
 *     "insufficient data" with confidence 0, never a fabricated number.
 *     The model is still fully implemented below, gated on data
 *     availability, so it activates with zero code changes the moment
 *     a real energy source is wired into evidence-adapter.js.
 *   - This module never writes into the World State Engine's draft
 *     directly; its World-State-visible footprint is published as
 *     Evidence Records (source: 'prediction-engine'), same convention
 *     as health-monitor.js.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  var TREND_WINDOW_SAMPLES = 30;

  // Mission-success heuristic weights (illustrative, calibratable —
  // mirrors the "illustrative starting point" posture the Health
  // Monitor design doc takes toward its own weights, §7.2).
  var SUCCESS_WEIGHTS = { health: 0.5, progress: 0.3, kinematics: 0.2 };

  function PredictionEngine() {
    this._healthScoreHistory = []; // {t, score} for §8-style trend extrapolation
    this._lastOutput = null;
  }

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function linearSlope(samples) {
    var n = samples.length;
    if (n < 2) return null;
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) {
      sumX += samples[i].t; sumY += samples[i].v;
      sumXY += samples[i].t * samples[i].v; sumXX += samples[i].t * samples[i].t;
    }
    var denom = (n * sumXX - sumX * sumX);
    if (Math.abs(denom) < 1e-9) return null;
    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * Battery depletion forecast. Deterministic linear discharge-rate
   * extrapolation against remaining usable energy (design doc §8.1),
   * gated on Energy.* telemetry actually existing.
   */
  function forecastEnergy(worldState) {
    var pct = worldState.Energy.State.BatteryPercentage;
    var rate = worldState.Energy.ConsumptionRate;
    if (!fed(pct)) {
      return {
        available: false, secondsToDepletion: null, confidence: 0,
        note: 'No Energy.State.BatteryPercentage telemetry (AWAITING_SOURCE) — battery depletion cannot be forecast in this build.'
      };
    }
    // Model is fully specified even though currently unreachable: given
    // a battery percentage and a consumption rate (%/s), project time
    // to a conservative reserve floor (10%) rather than to 0%.
    var reserveFloor = 10;
    var ratePerSecond = fed(rate) ? rate.value : null;
    if (!ratePerSecond || ratePerSecond <= 0) {
      return { available: true, secondsToDepletion: null, confidence: 0.2, note: 'Battery percentage known but discharge-rate trend not yet established.' };
    }
    var secondsToDepletion = (pct.value - reserveFloor) / ratePerSecond;
    return {
      available: true,
      secondsToDepletion: secondsToDepletion > 0 ? Math.round(secondsToDepletion) : 0,
      reserveFloorPercent: reserveFloor,
      confidence: 0.7,
      note: 'Linear discharge-rate extrapolation to a ' + reserveFloor + '% reserve floor.'
    };
  }

  /**
   * ETA / distance-remaining forecast — purely kinematic, uses only
   * live Navigation/Aircraft fields (real in this build).
   */
  function forecastETA(worldState) {
    var distRemaining = worldState.Navigation.Progress.DistanceRemaining;
    var groundSpeed = worldState.Aircraft.Kinematics.GroundSpeed;
    if (!fed(distRemaining) || !fed(groundSpeed) || groundSpeed.value <= 0) {
      return { available: false, etaSeconds: null, confidence: 0, note: 'Distance-remaining or ground-speed not yet available.' };
    }
    // GroundSpeed is km/h; DistanceRemaining is m — convert speed to m/s.
    var speedMs = groundSpeed.value * (1000 / 3600);
    var etaSeconds = speedMs > 0 ? distRemaining.value / speedMs : null;
    return {
      available: true,
      etaSeconds: etaSeconds !== null ? Math.round(etaSeconds) : null,
      confidence: 0.8,
      note: 'Kinematic projection: distance remaining / current ground speed. Assumes current speed holds; does not model wind (no independent wind source yet).'
    };
  }

  /**
   * Health-degradation trend: linear extrapolation of the Health
   * Monitor's Overall Health Score toward the DEGRADED/CRITICAL
   * boundary, mirroring the Health Monitor's own §8 trend method so
   * the two modules never use inconsistent math for the same concept.
   */
  function forecastHealthDegradation(healthAssessment, history) {
    if (!healthAssessment || typeof healthAssessment.overallHealthScore !== 'number') {
      return { available: false, secondsToWarningBand: null, confidence: 0, note: 'No numeric Overall Health Score this cycle (insufficient sub-domain coverage).' };
    }
    history.push({ t: healthAssessment.timestamp, v: healthAssessment.overallHealthScore });
    while (history.length > TREND_WINDOW_SAMPLES) history.shift();
    var slope = linearSlope(history);
    if (slope === null || slope >= 0) {
      return { available: true, secondsToWarningBand: null, confidence: history.length >= 5 ? 0.5 : 0.2, note: 'Health score stable or improving — no degradation trend to extrapolate.' };
    }
    // Degraded/critical boundary tracks Health Monitor's own classification
    // bands: a score below ~70 is the DEGRADED region for this weighting model.
    var warningBoundary = 70;
    var current = healthAssessment.overallHealthScore;
    if (current <= warningBoundary) {
      return { available: true, secondsToWarningBand: 0, confidence: 0.5, note: 'Already at or below the degraded boundary.' };
    }
    var seconds = (current - warningBoundary) / (-slope);
    return {
      available: true,
      secondsToWarningBand: seconds < 3600 ? Math.round(seconds) : null,
      confidence: history.length >= 5 ? 0.55 : 0.3,
      note: 'Linear extrapolation of Overall Health Score trend toward the degraded boundary (' + warningBoundary + ').'
    };
  }

  /**
   * Mission completion probability + confidence: deterministic weighted
   * heuristic combining current Health classification, mission progress
   * fraction, and whether current kinematics are consistent with the
   * mission's own cruise/altitude constraints. This is an engineering
   * scoring function, not a statistical or learned model.
   */
  function forecastMissionSuccess(worldState, healthAssessment) {
    var healthComponent;
    if (healthAssessment && healthAssessment.overallClassification === 'CRITICAL') healthComponent = 0.1;
    else if (healthAssessment && healthAssessment.overallClassification === 'DEGRADED') healthComponent = 0.65;
    else if (healthAssessment && healthAssessment.overallClassification === 'NOMINAL') healthComponent = 1.0;
    else healthComponent = 0.5; // UNKNOWN health — neither optimistic nor alarmist default

    var phaseFraction = worldState.Mission.Progress.PhaseFraction;
    var progressComponent = fed(phaseFraction) ? Math.min(1, Math.max(0, phaseFraction.value)) : 0.5;

    var speed = worldState.Aircraft.Kinematics.GroundSpeed;
    var cruiseSetting = worldState.Mission.Constraints.CruiseSpeedSetting;
    var kinematicsComponent = 0.5;
    if (fed(speed) && fed(cruiseSetting) && cruiseSetting.value > 0) {
      var ratio = speed.value / cruiseSetting.value;
      // Within +/-20% of the cruise setting is treated as fully consistent.
      kinematicsComponent = Math.max(0, 1 - Math.max(0, Math.abs(ratio - 1) - 0.2) * 2);
    }

    var probability = SUCCESS_WEIGHTS.health * healthComponent +
      SUCCESS_WEIGHTS.progress * progressComponent +
      SUCCESS_WEIGHTS.kinematics * kinematicsComponent;

    var confidence = (healthAssessment ? Math.max(0.3, healthAssessment.confidence) : 0.3);

    return {
      probability: Math.round(probability * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      components: { healthComponent: healthComponent, progressComponent: progressComponent, kinematicsComponent: kinematicsComponent },
      note: 'Deterministic weighted heuristic (health ' + SUCCESS_WEIGHTS.health + ', mission progress ' + SUCCESS_WEIGHTS.progress + ', kinematic consistency ' + SUCCESS_WEIGHTS.kinematics + '). Not a statistical or learned model.'
    };
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [healthAssessment] - This cycle's output of
   *   AFIP.HealthMonitor.update(worldState); if omitted, falls back to
   *   AFIP.HealthMonitor.getLatest() so this module can still run
   *   standalone (e.g. from a test harness) without a hard dependency.
   * @returns {object} Prediction Assessment.
   */
  PredictionEngine.prototype.update = function (worldState, healthAssessment) {
    if (!worldState) return null;
    var health = healthAssessment || (AFIP.HealthMonitor && AFIP.HealthMonitor.getLatest());

    var energyForecast = forecastEnergy(worldState);
    var etaForecast = forecastETA(worldState);
    var healthDegradation = forecastHealthDegradation(health, this._healthScoreHistory);
    var missionSuccess = forecastMissionSuccess(worldState, health);

    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    var assessment = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      energyForecast: energyForecast,
      etaForecast: etaForecast,
      healthDegradation: healthDegradation,
      missionSuccessProbability: missionSuccess,
      // Estimated-time-to-threshold, generalized: the nearest of the
      // known projected thresholds across sub-forecasts, so downstream
      // consumers (e.g. Risk Engine) have one summary figure without
      // re-deriving it themselves.
      estimatedTimeToThreshold: (function () {
        var candidates = [];
        if (energyForecast.available && typeof energyForecast.secondsToDepletion === 'number') candidates.push({ subsystem: 'battery', seconds: energyForecast.secondsToDepletion });
        if (typeof healthDegradation.secondsToWarningBand === 'number') candidates.push({ subsystem: 'health', seconds: healthDegradation.secondsToWarningBand });
        if (health && health.predictedFailures) {
          health.predictedFailures.forEach(function (p) {
            if (typeof p.projectedSeconds === 'number') candidates.push({ subsystem: p.subsystem, seconds: p.projectedSeconds });
          });
        }
        if (candidates.length === 0) return null;
        return candidates.reduce(function (a, b) { return (a.seconds <= b.seconds) ? a : b; });
      })()
    };

    this._lastOutput = assessment;

    var records = [
      { source: 'prediction-engine', field: 'Prediction.EnergyForecast', value: energyForecast, timestamp: ts, frame: frame },
      { source: 'prediction-engine', field: 'Prediction.ETAForecast', value: etaForecast, timestamp: ts, frame: frame },
      { source: 'prediction-engine', field: 'Prediction.FailureForecast', value: healthDegradation, timestamp: ts, frame: frame },
      { source: 'prediction-engine', field: 'Prediction.MissionSuccessProbability', value: missionSuccess, timestamp: ts, frame: frame },
      { source: 'prediction-engine', field: 'Prediction.TrendAnalysis', value: assessment.estimatedTimeToThreshold, timestamp: ts, frame: frame }
    ];
    AFIP.bus.emit('evidence:batch', records);
    // Phase 11 addendum: dedicated event for UI panels (render-only
    // consumers) — evidence:batch above is unchanged.
    AFIP.bus.emit('prediction-engine:assessment', assessment);

    return assessment;
  };

  /** @returns {object|null} the most recent Prediction Assessment this module produced. */
  PredictionEngine.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.PredictionEngine = AFIP.PredictionEngine || new PredictionEngine();
})(typeof window !== 'undefined' ? window : globalThis);
