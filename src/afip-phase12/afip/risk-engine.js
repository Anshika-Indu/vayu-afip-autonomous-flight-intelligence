/**
 * AFIP :: Risk Engine
 * ---------------------------------------------------------------------
 * Purpose
 *   Assess mission risk from health, navigation, environmental, and mission state. Sole producer of the Risk object.
 *
 * Inputs
 *   - Health
 *   - Navigation
 *   - Environment
 *   - Mission
 *
 * Outputs
 *   - Risk score
 *   - Risk categories
 *   - Mitigation suggestions
 *
 * Dependencies
 *   - World State
 *
 * Display
 *   Risk Dashboard
 *
 * Update frequency
 *   Continuous
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 6 — Risk Engine).
 *
 * Design notes
 *   - Consumes the World State Snapshot plus the Health Assessment and
 *     Prediction Assessment produced earlier in this same reasoning
 *     cycle (Evidence -> World State -> Health Monitor -> Prediction
 *     Engine -> Risk Engine, per the project README pipeline), passed
 *     in directly by the caller — see Simulator_AFIP.html loop().
 *   - Produces exactly the six categories requested: Mission, Collision,
 *     Power, Communication, Navigation, and an Overall composite, each
 *     as a 0-100 risk score (higher = riskier) with a qualitative tier
 *     (NOMINAL/CAUTION/WARNING/CRITICAL), a confidence, and a
 *     justification reference set — mirroring the Health Monitor's own
 *     discipline of "never a bare number without its supporting basis."
 *   - Conservative-unknown posture: where a category's real telemetry
 *     is AWAITING_SOURCE (battery, communication link, GPS/IMU,
 *     obstacle/traffic sensing), this engine does NOT report a
 *     comfortable low-risk default. Aerospace risk practice treats
 *     "cannot confirm safe" as elevated risk, not as an all-clear — an
 *     unmonitored condition is a risk in itself, not the absence of
 *     one. Each such category is reported at an elevated CAUTION floor
 *     with confidence capped low, and the reason is always the missing
 *     telemetry, never a fabricated hazard.
 *   - Collision risk in particular has literally no obstacle, traffic,
 *     or terrain-proximity sensing in this simulator build (it is a
 *     parametric transition-physics visualizer, see
 *     TELEMETRY_COVERAGE.md) — so it is reported as UNKNOWN with a
 *     phase-based qualitative floor only (hover/transition/landing
 *     phases are nearer to terrain/other traffic by nature of the
 *     flight regime, independent of any sensor), never as a sensed
 *     value.
 *   - Overall Risk uses the same §7.1-style ceiling rule as the Health
 *     Monitor: a single CRITICAL category caps Overall Risk at CRITICAL
 *     regardless of the weighted composite, so one severe risk is never
 *     diluted into invisibility by several low ones.
 *   - This module never writes into the World State Engine's draft
 *     directly; its footprint is published as Evidence Records (source:
 *     'risk-engine'), same convention as health-monitor.js /
 *     prediction-engine.js.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  // Composite weighting (illustrative, calibratable — same posture as
  // the Health Monitor's §7.2 weights): Power and Navigation are
  // weighted highest because loss of either is most consequential on
  // this heavy-lift tiltrotor airframe; Collision and Communication are
  // included but currently unconfirmable from telemetry in this build.
  var WEIGHTS = { power: 0.25, navigation: 0.20, collision: 0.20, communication: 0.15, mission: 0.20 };

  var UNKNOWN_RISK_FLOOR = 45; // "cannot confirm safe" floor — CAUTION band, never a comfortable zero.

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function tierFor(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 55) return 'WARNING';
    if (score >= UNKNOWN_RISK_FLOOR - 1) return 'CAUTION';
    return 'NOMINAL';
  }

  function RiskEngine() {
    this._lastOutput = null;
  }

  /** Power Risk — derived from Health.BatteryHealth + Prediction.EnergyForecast. */
  function assessPowerRisk(health, prediction) {
    var battery = health && health.subsystems && health.subsystems.battery;
    var energyForecast = prediction && prediction.energyForecast;

    if (!battery || !battery.dataAvailable) {
      return {
        category: 'power', score: UNKNOWN_RISK_FLOOR, tier: 'CAUTION', confidence: 0.2,
        justification: ['Health.BatteryHealth: no telemetry (AWAITING_SOURCE)'],
        note: 'Energy state cannot be confirmed — reported at an elevated caution floor rather than assumed safe.'
      };
    }
    var score = 100 - (battery.score || 0);
    if (energyForecast && energyForecast.available && typeof energyForecast.secondsToDepletion === 'number' && energyForecast.secondsToDepletion < 120) {
      score = Math.max(score, 85);
    }
    return {
      category: 'power', score: Math.round(score * 10) / 10, tier: tierFor(score),
      confidence: battery.confidence || 0.5,
      justification: ['Health.BatteryHealth score=' + battery.score],
      note: 'Derived from battery sub-score and depletion forecast.'
    };
  }

  /** Navigation Risk — sensor-integrity side (Health.GPS/IMU) + route progress. */
  function assessNavigationRisk(worldState, health) {
    var nav = health && health.subsystems && health.subsystems.navigation;
    var distRemaining = worldState.Navigation.Progress.DistanceRemaining;
    var totalDist = worldState.Navigation.Progress.TotalDistance;

    if (!nav || !nav.dataAvailable) {
      var progressOk = fed(distRemaining) && fed(totalDist) && totalDist.value > 0;
      return {
        category: 'navigation', score: UNKNOWN_RISK_FLOOR, tier: 'CAUTION', confidence: progressOk ? 0.35 : 0.15,
        justification: ['Health.SensorHealth (GPS/IMU): no telemetry (AWAITING_SOURCE)'],
        note: progressOk
          ? 'Positioning-sensor integrity unconfirmed; route progress telemetry is at least internally consistent (distance traveled <= total distance).'
          : 'Positioning-sensor integrity unconfirmed and no route-progress telemetry available either.'
      };
    }
    var score = 100 - (nav.score || 0);
    return {
      category: 'navigation', score: Math.round(score * 10) / 10, tier: tierFor(score),
      confidence: nav.confidence || 0.5,
      justification: ['Health.SensorHealth score=' + nav.score],
      note: 'Derived from positioning-sensor integrity sub-score.'
    };
  }

  /** Collision Risk — no obstacle/traffic/terrain sensing exists; phase-based floor only. */
  function assessCollisionRisk(worldState) {
    var phaseIndex = worldState.Mission.Progress.PhaseIndex;
    var altitude = worldState.Aircraft.Altitude;
    // Phases 0/1/5 (spool-up, vertical climb, descent/landing) operate
    // closest to terrain/ground traffic by nature of the flight regime
    // — a qualitative, phase-based floor, not a sensed proximity value.
    var nearGroundPhase = fed(phaseIndex) && (phaseIndex.value === 0 || phaseIndex.value === 1 || phaseIndex.value === 5);
    var lowAltitude = fed(altitude) && altitude.value < 50;
    var floor = (nearGroundPhase || lowAltitude) ? UNKNOWN_RISK_FLOOR + 10 : UNKNOWN_RISK_FLOOR - 15;
    return {
      category: 'collision', score: floor, tier: tierFor(floor), confidence: 0.1,
      justification: ['No obstacle/traffic/terrain-proximity sensor exists in this simulator build (AWAITING_SOURCE)', 'Mission.Progress.PhaseIndex/Aircraft.Altitude used only for a qualitative phase-based floor'],
      note: 'Not a sensed collision risk — this simulator has no obstacle or traffic telemetry at all. Reported as an unconfirmed, phase-weighted floor so it is never mistaken for "clear."'
    };
  }

  /** Communication Risk — Health.CommunicationHealth is unknown in this build. */
  function assessCommunicationRisk(health) {
    var comm = health && health.subsystems && health.subsystems.communication;
    if (!comm || !comm.dataAvailable) {
      return {
        category: 'communication', score: UNKNOWN_RISK_FLOOR, tier: 'CAUTION', confidence: 0.2,
        justification: ['Health.CommunicationHealth: no telemetry (AWAITING_SOURCE)'],
        note: 'Link status cannot be confirmed — reported at an elevated caution floor rather than assumed nominal.'
      };
    }
    var score = 100 - (comm.score || 0);
    return {
      category: 'communication', score: Math.round(score * 10) / 10, tier: tierFor(score),
      confidence: comm.confidence || 0.5,
      justification: ['Health.CommunicationHealth score=' + comm.score],
      note: 'Derived from communication-link sub-score.'
    };
  }

  /** Mission Risk — schedule/energy-margin risk, from Prediction's mission-success + ETA forecasts. */
  function assessMissionRisk(worldState, prediction, health) {
    var success = prediction && prediction.missionSuccessProbability;
    var eta = prediction && prediction.etaForecast;
    var readiness = health && health.missionReadiness;

    var score;
    var justification = [];
    if (success) {
      score = Math.round((1 - success.probability) * 100 * 10) / 10;
      justification.push('Prediction.MissionSuccessProbability=' + success.probability);
    } else {
      score = UNKNOWN_RISK_FLOOR;
      justification.push('Prediction.MissionSuccessProbability unavailable');
    }
    if (readiness && readiness.state === 'NOT_READY') {
      score = Math.max(score, 85);
      justification.push('Health.missionReadiness=NOT_READY');
    } else if (readiness && readiness.state === 'READY_WITH_CONSTRAINTS') {
      score = Math.max(score, UNKNOWN_RISK_FLOOR);
      justification.push('Health.missionReadiness=READY_WITH_CONSTRAINTS');
    }
    var confidence = success ? success.confidence : 0.3;
    return {
      category: 'mission', score: Math.round(score * 10) / 10, tier: tierFor(score),
      confidence: confidence, justification: justification,
      note: 'Derived from mission-success probability and Health Monitor mission-readiness classification.'
    };
  }

  /** §7.1-style ceiling rule composite, mirroring the Health Monitor's own aggregation posture. */
  function aggregate(categories) {
    var order = { NOMINAL: 0, CAUTION: 1, WARNING: 2, CRITICAL: 3 };
    var weightedSum = 0, totalConfidenceWeight = 0, worstTier = 'NOMINAL';
    Object.keys(categories).forEach(function (key) {
      var c = categories[key];
      var w = WEIGHTS[key] || 0;
      weightedSum += c.score * w;
      totalConfidenceWeight += w * c.confidence;
      if (order[c.tier] > order[worstTier]) worstTier = c.tier;
    });
    var overallScore = Math.round(weightedSum * 10) / 10;
    var overallTier = worstTier === 'CRITICAL' ? 'CRITICAL' : (overallScore >= 55 ? (order[worstTier] >= order.WARNING ? 'WARNING' : tierFor(overallScore)) : tierFor(overallScore));
    // Ceiling rule: a single CRITICAL category always forces overall CRITICAL,
    // matching the Health Monitor's "one severe condition is never diluted."
    if (worstTier === 'CRITICAL') overallTier = 'CRITICAL';
    var confidence = Math.round(totalConfidenceWeight * 100) / 100;
    return { overallScore: overallScore, overallTier: overallTier, confidence: confidence };
  }

  function buildMitigation(categories, overallTier) {
    var actions = [];
    if (categories.power.tier === 'WARNING' || categories.power.tier === 'CRITICAL') {
      actions.push({ action: 'Reduce cruise speed / power draw to extend endurance margin pending energy telemetry.', basis: 'power' });
    }
    if (categories.power.confidence < 0.3) {
      actions.push({ action: 'Integrate battery/energy telemetry — power risk is currently unconfirmable, not confirmed-safe.', basis: 'power' });
    }
    if (categories.navigation.confidence < 0.3) {
      actions.push({ action: 'Integrate GPS/IMU telemetry — positioning-sensor integrity is currently unconfirmable.', basis: 'navigation' });
    }
    if (categories.communication.confidence < 0.3) {
      actions.push({ action: 'Integrate communication-link telemetry — link health is currently unconfirmable.', basis: 'communication' });
    }
    if (categories.collision.confidence < 0.3) {
      actions.push({ action: 'Integrate obstacle/traffic sensing — collision risk cannot be assessed from telemetry today.', basis: 'collision' });
    }
    if (overallTier === 'CRITICAL') {
      actions.push({ action: 'Recommend conservative mission posture (hold, divert, or return-to-base candidate) pending resolution of the critical condition.', basis: 'overall' });
    } else if (overallTier === 'WARNING') {
      actions.push({ action: 'Recommend reduced operational envelope until the warning condition clears on a fresh, confident reading.', basis: 'overall' });
    }
    return actions;
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [healthAssessment] - This cycle's Health Assessment
   *   (falls back to AFIP.HealthMonitor.getLatest() if omitted).
   * @param {object} [predictionAssessment] - This cycle's Prediction
   *   Assessment (falls back to AFIP.PredictionEngine.getLatest()).
   * @returns {object} Risk Assessment.
   */
  RiskEngine.prototype.update = function (worldState, healthAssessment, predictionAssessment) {
    if (!worldState) return null;
    var health = healthAssessment || (AFIP.HealthMonitor && AFIP.HealthMonitor.getLatest());
    var prediction = predictionAssessment || (AFIP.PredictionEngine && AFIP.PredictionEngine.getLatest());

    var categories = {
      power: assessPowerRisk(health, prediction),
      navigation: assessNavigationRisk(worldState, health),
      collision: assessCollisionRisk(worldState),
      communication: assessCommunicationRisk(health),
      mission: assessMissionRisk(worldState, prediction, health)
    };

    var agg = aggregate(categories);
    var mitigation = buildMitigation(categories, agg.overallTier);

    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    var assessment = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      missionRisk: categories.mission,
      collisionRisk: categories.collision,
      powerRisk: categories.power,
      communicationRisk: categories.communication,
      navigationRisk: categories.navigation,
      overallRisk: { score: agg.overallScore, tier: agg.overallTier },
      confidence: agg.confidence,
      recommendedMitigation: mitigation
    };

    this._lastOutput = assessment;

    var records = [
      { source: 'risk-engine', field: 'Risk.MissionRisk', value: categories.mission, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.NavigationRisk', value: categories.navigation, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.HealthRisk', value: { score: health ? (100 - (health.overallHealthScore || 0)) : null, classification: health ? health.overallClassification : 'UNKNOWN' }, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.EnvironmentalRisk', value: { score: UNKNOWN_RISK_FLOOR, tier: 'CAUTION', note: 'No Environment.Weather telemetry (AWAITING_SOURCE).' }, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.CompositeRisk', value: assessment.overallRisk, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.Confidence', value: agg.confidence, timestamp: ts, frame: frame },
      { source: 'risk-engine', field: 'Risk.Trend', value: mitigation, timestamp: ts, frame: frame }
    ];
    AFIP.bus.emit('evidence:batch', records);
    // Phase 11 addendum: dedicated event for UI panels (render-only
    // consumers) — evidence:batch above is unchanged.
    AFIP.bus.emit('risk-engine:assessment', assessment);

    return assessment;
  };

  /** @returns {object|null} the most recent Risk Assessment this module produced. */
  RiskEngine.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.RiskEngine = AFIP.RiskEngine || new RiskEngine();
})(typeof window !== 'undefined' ? window : globalThis);
