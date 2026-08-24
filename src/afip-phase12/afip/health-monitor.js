/**
 * AFIP :: Health Monitor
 * ---------------------------------------------------------------------
 * Purpose
 *   Assess aircraft operational condition from energy, propulsion, and sensor telemetry. Presents understandable engineering information — no fabricated AI terminology.
 *
 * Inputs
 *   - Energy
 *   - Propulsion
 *   - Sensors
 *   - Telemetry
 *
 * Outputs
 *   - Health score
 *   - Alerts
 *   - Fault predictions
 *
 * Dependencies
 *   - World State
 *
 * Display
 *   Health Dashboard
 *
 * Update frequency
 *   Every simulation cycle
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 4 — Health Monitor).
 *
 * Design notes (see /mnt/user-data/uploads 6__AFIP_Health_Monitoring_System.md
 * for the full engineering design document this file realizes)
 *   - Six weighted sub-domains, §7.2: Battery/Power 0.30, Propulsion 0.25,
 *     Navigation sensor integrity (GPS/IMU) 0.15, Communication 0.10,
 *     Environment 0.10, Mission/Payload readiness context 0.10. Weights
 *     are illustrative calibration starting points per §7.2, not final.
 *   - §7.4 "confidence, inherited not invented": a sub-domain with no
 *     backing telemetry is reported UNKNOWN, never defaulted to a
 *     mid-range healthy score. Per TELEMETRY_COVERAGE.md this simulator
 *     build has NO battery, GPS, IMU, motor-temperature, ESC, or
 *     communication telemetry — only structural/gyroscopic torque and
 *     payload mass exist as real signal today. Battery, Navigation
 *     (sensor), Communication, and Environment sub-domains are therefore
 *     UNKNOWN in this build. This is not a bug: closing these gaps is a
 *     Layer A / Evidence Adapter concern (add a FIELD_MAP row), and this
 *     module will pick the signal up automatically the moment
 *     Health.* / Energy.* / Environment.* / Communication.* fields carry
 *     real evidence — nothing here needs to change.
 *   - Propulsion sub-score is a genuine, if partial, signal: this
 *     airframe's known duct-mount reaction-torque behavior
 *     (Aircraft.Structural.GyroscopicTorque / TorqueClockwise /
 *     TorqueCounterClockwise) is exactly what the simulator's own
 *     "spar shear" instrumentation already tracks (see
 *     Simulator_AFIP.html: shear > 40 N·m = critical/red, > 22 N·m =
 *     warning/amber, else nominal/green — reused here verbatim so HMS
 *     and the simulator's own cockpit never disagree about the same
 *     number). It is a structural-load proxy for propulsion/duct
 *     health, not a substitute for real motor winding temperature or
 *     RPM deviation (§6.2), so its confidence is capped below 1.0.
 *   - Mission/Payload readiness context uses the one mission-context
 *     signal this build actually has: Aircraft.Payload.Mass against the
 *     simulator's documented 0–80 kg envelope. It cannot assess true
 *     energy-margin-vs-remaining-mission (§6.6) without Energy.* — that
 *     gap is surfaced honestly via Mission Readiness / Recommended
 *     Actions rather than silently ignored.
 *   - §7.1 ceiling rule: the Overall Health Score/classification can
 *     never read better than the worst known safety-critical
 *     sub-domain, regardless of weighted math.
 *   - §8 failure prediction: deterministic linear trend extrapolation
 *     only (least-squares slope over a bounded recent window) — no ML,
 *     no statistical classifiers, matching the "no machine-learning or
 *     statistical pattern-classification model" constraint in §8.
 *   - §9 alert tiers (Information / Warning / Critical / Emergency) and
 *     §10.5 ("health unknown" beats a stale optimistic default) are both
 *     implemented below.
 *   - This module never writes into the World State Engine's draft
 *     directly and never mutates the Snapshot it is given (Architecture
 *     invariant, §0 of the design doc). Its World-State-visible
 *     footprint is published the same way raw telemetry is: as Evidence
 *     Records (source: 'health-monitor') handed to the bus, which only
 *     the World State Engine consumes — one-way, additive, exactly like
 *     every other producer in this codebase.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  // ---- Calibration constants (illustrative starting points, §7.2/§7.3) ----
  var WEIGHTS = {
    battery: 0.30,
    propulsion: 0.25,
    navigation: 0.15,
    communication: 0.10,
    environment: 0.10,
    missionContext: 0.10
  };

  // Reused verbatim from the simulator's own spar-shear cockpit readout
  // so HMS and the visible instrument panel never disagree (N·m).
  var SHEAR_WARNING_NM = 22;
  var SHEAR_CRITICAL_NM = 40;

  // Simulator-documented payload envelope (kg) — see Simulator_AFIP.html
  // "PAYLOAD 0–80 kg" slider.
  var PAYLOAD_MAX_KG = 80;
  var PAYLOAD_MARGIN_WARN_FRACTION = 0.90; // start flagging near the top of the envelope

  // Bounded trend window for linear extrapolation (§8), keyed by mission
  // clock seconds, not wall-clock, so speed-multiplier playback is honest.
  var TREND_WINDOW_SAMPLES = 30;

  var PROPULSION_CONFIDENCE_CAP = 0.65; // structural proxy, not real motor telemetry

  function HealthMonitor() {
    // Bounded history of {t, shear} samples for §8 deterministic trend
    // extrapolation. This is the only internal state this module keeps —
    // it never reaches into other modules, only remembers its own past
    // inputs from World State.
    this._shearHistory = [];
    this._lastOutput = null;
  }

  /** @returns {boolean} whether a leaf carries real evidence. */
  function fed(leaf) {
    return !!leaf && leaf.value !== null && leaf.value !== undefined;
  }

  /** Least-squares slope of y over x for a bounded sample window. */
  function linearSlope(samples) {
    var n = samples.length;
    if (n < 2) return null;
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) {
      sumX += samples[i].t;
      sumY += samples[i].v;
      sumXY += samples[i].t * samples[i].v;
      sumXX += samples[i].t * samples[i].t;
    }
    var denom = (n * sumXX - sumX * sumX);
    if (Math.abs(denom) < 1e-9) return null;
    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * §6.2 / structural proxy: propulsion/duct-mount health from
   * gyroscopic reaction torque. Returns a sub-domain assessment object.
   */
  function assessPropulsion(worldState, history) {
    var g = worldState.Aircraft.Structural.GyroscopicTorque;
    var cw = worldState.Aircraft.Structural.TorqueClockwise;
    var ccw = worldState.Aircraft.Structural.TorqueCounterClockwise;

    if (!fed(g)) {
      return {
        domain: 'propulsion', status: 'UNKNOWN', score: null, confidence: 0,
        dataAvailable: false,
        justification: ['Aircraft.Structural.GyroscopicTorque: no evidence yet'],
        note: 'No structural torque telemetry this cycle.'
      };
    }

    var shear = Math.max(Math.abs(g.value), Math.abs(cw ? cw.value || 0 : 0), Math.abs(ccw ? ccw.value || 0 : 0));
    var status, score;
    if (shear > SHEAR_CRITICAL_NM) {
      status = 'CRITICAL';
      score = Math.max(0, 40 - (shear - SHEAR_CRITICAL_NM));
    } else if (shear > SHEAR_WARNING_NM) {
      status = 'WARNING';
      var frac = (shear - SHEAR_WARNING_NM) / (SHEAR_CRITICAL_NM - SHEAR_WARNING_NM);
      score = 80 - frac * 40;
    } else {
      status = 'NOMINAL';
      score = 100 - (shear / SHEAR_WARNING_NM) * 20;
    }

    // §8.2-style trend extrapolation (structural-load proxy — not motor
    // temperature, but the same deterministic method: linear slope over
    // a bounded recent window, projected to the critical threshold).
    var mission_t = worldState.Mission.Clock.value;
    if (typeof mission_t === 'number') {
      history.push({ t: mission_t, v: shear });
      while (history.length > TREND_WINDOW_SAMPLES) history.shift();
    }
    var slope = linearSlope(history);
    var prediction = null;
    if (slope !== null && slope > 1e-6 && shear < SHEAR_CRITICAL_NM) {
      var secondsToThreshold = (SHEAR_CRITICAL_NM - shear) / slope;
      if (secondsToThreshold >= 0 && secondsToThreshold < 3600) {
        prediction = {
          subsystem: 'propulsion',
          model: 'linear trend extrapolation of gyroscopic reaction torque vs. spar-shear critical threshold (40 N·m)',
          projectedSeconds: Math.round(secondsToThreshold),
          confidence: history.length >= 5 ? 0.55 : 0.3
        };
      }
    }

    return {
      domain: 'propulsion', status: status, score: Math.round(score * 10) / 10,
      confidence: PROPULSION_CONFIDENCE_CAP, dataAvailable: true,
      justification: ['Aircraft.Structural.GyroscopicTorque=' + shear.toFixed(1) + ' N·m',
        'thresholds: warning>' + SHEAR_WARNING_NM + ', critical>' + SHEAR_CRITICAL_NM],
      note: 'Structural/duct-mount reaction-torque proxy. Motor winding temperature, RPM deviation, and vibration signature (true §6.2 Motor Monitor inputs) are AWAITING_SOURCE.',
      predictedFailure: prediction
    };
  }

  /** §6.6 mission/payload readiness context — the one context signal available. */
  function assessMissionContext(worldState) {
    var mass = worldState.Aircraft.Payload.Mass;
    if (!fed(mass)) {
      return {
        domain: 'missionContext', status: 'UNKNOWN', score: null, confidence: 0,
        dataAvailable: false,
        justification: ['Aircraft.Payload.Mass: no evidence yet'],
        note: 'No payload telemetry this cycle.'
      };
    }
    var fraction = mass.value / PAYLOAD_MAX_KG;
    var status, score;
    if (fraction > 1.0) {
      status = 'CRITICAL'; score = 30;
    } else if (fraction > PAYLOAD_MARGIN_WARN_FRACTION) {
      status = 'WARNING'; score = 70;
    } else {
      status = 'NOMINAL'; score = 100 - fraction * 15;
    }
    return {
      domain: 'missionContext', status: status, score: Math.round(score * 10) / 10,
      confidence: 0.5, dataAvailable: true,
      justification: ['Aircraft.Payload.Mass=' + mass.value + ' kg', 'envelope=' + PAYLOAD_MAX_KG + ' kg'],
      note: 'Payload-load-margin proxy only. True mission-readiness context (energy margin vs. remaining distance, §6.6) requires Energy.* telemetry, which is AWAITING_SOURCE — Mission Readiness below reflects that gap explicitly rather than assuming adequate margin.'
    };
  }

  /** Unknown-by-design sub-domain (no telemetry source exists yet in this build). */
  function unknownDomain(domain, missingFields) {
    return {
      domain: domain, status: 'UNKNOWN', score: null, confidence: 0, dataAvailable: false,
      justification: missingFields.map(function (f) { return f + ': AWAITING_SOURCE'; }),
      note: 'No telemetry source for this sub-domain in the current simulator build. Reported as unknown, never defaulted to a healthy mid-range score (design doc §7.4).'
    };
  }

  /**
   * §7 Overall Health Aggregator: weighted composite with §7.1 ceiling
   * rule, computed only over sub-domains that actually have data —
   * coverage (the fraction of total weight backed by real evidence) is
   * reported alongside so the score is never mistaken for a complete
   * picture.
   */
  function aggregate(subdomains) {
    var weightedSum = 0, coveredWeight = 0;
    var worstKnownStatus = 'NOMINAL';
    var order = { NOMINAL: 0, CAUTION: 1, WARNING: 2, CRITICAL: 3 };

    Object.keys(subdomains).forEach(function (key) {
      var d = subdomains[key];
      var w = WEIGHTS[key] || 0;
      if (d.dataAvailable && typeof d.score === 'number') {
        weightedSum += d.score * w;
        coveredWeight += w;
        if (order[d.status] > order[worstKnownStatus]) worstKnownStatus = d.status;
      }
    });

    var coverage = coveredWeight; // 0..1, since weights sum to 1.0
    var overallScore = coveredWeight > 0 ? Math.round((weightedSum / coveredWeight) * 10) / 10 : null;

    // §7.1 ceiling rule: a known critical sub-domain caps overall
    // classification at CRITICAL regardless of the weighted number.
    var classification;
    if (coveredWeight === 0) {
      classification = 'UNKNOWN';
    } else if (worstKnownStatus === 'CRITICAL') {
      classification = 'CRITICAL';
    } else if (worstKnownStatus === 'WARNING') {
      classification = 'DEGRADED';
    } else {
      classification = 'NOMINAL';
    }

    return { overallScore: overallScore, classification: classification, coverage: Math.round(coverage * 100) / 100 };
  }

  /** §9 alert tiers -> WarningFlags, driven off each sub-domain's status. */
  function buildWarningFlags(subdomains) {
    var flags = [];
    Object.keys(subdomains).forEach(function (key) {
      var d = subdomains[key];
      if (d.status === 'CRITICAL' || d.status === 'WARNING') {
        flags.push({ tier: d.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING', domain: d.domain, detail: d.note, justification: d.justification });
      } else if (d.status === 'UNKNOWN') {
        // §9 Information tier: logged/visible, never affects classification.
        flags.push({ tier: 'INFORMATION', domain: d.domain, detail: 'Sub-domain unknown — insufficient telemetry.', justification: d.justification });
      }
    });
    return flags;
  }

  function buildPredictedFailures(subdomains) {
    var out = [];
    Object.keys(subdomains).forEach(function (key) {
      var d = subdomains[key];
      if (d.predictedFailure) out.push(d.predictedFailure);
    });
    // §8: AWAITING_SOURCE domains still get an explicit "insufficient
    // data" prediction entry rather than silence, per §11 (a missing
    // prediction is itself part of the auditable record).
    ['battery', 'navigation', 'communication', 'environment'].forEach(function (key) {
      var d = subdomains[key];
      if (d && !d.dataAvailable) {
        out.push({ subsystem: key, model: 'insufficient data — no telemetry source', projectedSeconds: null, confidence: 0 });
      }
    });
    return out;
  }

  function buildRecommendedActions(subdomains, classification) {
    var actions = [];
    if (subdomains.propulsion.status === 'WARNING' || subdomains.propulsion.status === 'CRITICAL') {
      actions.push({ action: 'Reduce transition rate / rotor-tilt rate to lower spar-shear reaction torque.', confidence: 0.6, basis: 'propulsion' });
    }
    if (!subdomains.battery.dataAvailable) {
      actions.push({ action: 'Integrate a battery/energy telemetry source — energy margin cannot currently be assessed for this mission.', confidence: 1.0, basis: 'battery' });
    }
    if (classification === 'CRITICAL') {
      actions.push({ action: 'Consider conservative mission posture (reduced envelope or hold) pending confirmation the condition has cleared.', confidence: 0.5, basis: 'overall' });
    }
    return actions;
  }

  /** §5 Mission Readiness: Ready / Ready with Constraints / Not Ready. */
  function assessMissionReadiness(subdomains, classification) {
    if (classification === 'CRITICAL') {
      return { state: 'NOT_READY', justification: ['A safety-critical sub-domain is CRITICAL.'] };
    }
    var constraints = [];
    if (!subdomains.battery.dataAvailable) constraints.push('Energy margin cannot be confirmed (no battery telemetry).');
    if (!subdomains.navigation.dataAvailable) constraints.push('Positioning-sensor integrity cannot be confirmed (no GPS/IMU telemetry).');
    if (!subdomains.communication.dataAvailable) constraints.push('Communication-link health cannot be confirmed.');
    if (classification === 'DEGRADED') constraints.push('At least one monitored sub-domain is degraded.');
    if (constraints.length > 0) {
      return { state: 'READY_WITH_CONSTRAINTS', justification: constraints };
    }
    return { state: 'READY', justification: ['All monitored sub-domains nominal.'] };
  }

  HealthMonitor.prototype.update = function (worldState) {
    if (!worldState) return null;

    var subdomains = {
      battery: unknownDomain('battery', ['Energy.State.BatteryPercentage', 'Energy.Telemetry.BatteryVoltage', 'Energy.Telemetry.BatteryCurrent']),
      propulsion: assessPropulsion(worldState, this._shearHistory),
      navigation: unknownDomain('navigation', ['Navigation.Sensor.GPSPosition', 'Navigation.Sensor.GPSQuality']),
      communication: unknownDomain('communication', ['Communication.LinkStatus', 'Communication.Latency', 'Communication.SignalQuality']),
      environment: unknownDomain('environment', ['Environment.Weather.WindSpeed', 'Environment.Weather.AmbientTemperature']),
      missionContext: assessMissionContext(worldState)
    };

    var agg = aggregate(subdomains);
    var warningFlags = buildWarningFlags(subdomains);
    var predictedFailures = buildPredictedFailures(subdomains);
    var recommendedActions = buildRecommendedActions(subdomains, agg.classification);
    var missionReadiness = assessMissionReadiness(subdomains, agg.classification);

    var assessment = {
      timestamp: worldState.Mission.Clock.value,
      frame: worldState.lastFrame,
      cycle: worldState.cycle,
      overallHealthScore: agg.overallScore,
      overallClassification: agg.classification,
      coverage: agg.coverage, // fraction of the §7.2 weighting model backed by real evidence
      confidence: agg.coverage > 0 ? Math.round(agg.coverage * PROPULSION_CONFIDENCE_CAP * 100) / 100 : 0,
      subsystems: subdomains,
      warningFlags: warningFlags,
      predictedFailures: predictedFailures,
      recommendedActions: recommendedActions,
      missionReadiness: missionReadiness
    };

    this._lastOutput = assessment;

    // Publish this cycle's Health.* fields as Evidence Records (source:
    // 'health-monitor') so the World State Engine — and only the World
    // State Engine — folds them into the next Snapshot. This module
    // never touches WSE's draft directly (one-way boundary, §0/§10.1).
    var ts = assessment.timestamp, frame = assessment.frame;
    var records = [
      { source: 'health-monitor', field: 'Health.OverallHealthScore', value: { score: agg.overallScore, classification: agg.classification, coverage: agg.coverage }, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.BatteryHealth', value: subdomains.battery, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.PropulsionHealth', value: subdomains.propulsion, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.SensorHealth', value: subdomains.navigation, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.ESCHealth', value: unknownDomain('esc', ['Health.Powertrain.ESCTemperature']), timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.GPSHealth', value: subdomains.navigation, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.IMUHealth', value: subdomains.navigation, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.CommunicationHealth', value: subdomains.communication, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.PayloadHealth', value: subdomains.missionContext, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.WarningFlags', value: warningFlags, timestamp: ts, frame: frame },
      { source: 'health-monitor', field: 'Health.PredictedFailures', value: predictedFailures, timestamp: ts, frame: frame }
    ];
    AFIP.bus.emit('evidence:batch', records);
    // Phase 11 addendum: dedicated event carrying the full Assessment
    // object, for UI panels to subscribe to (render-only consumers —
    // evidence:batch above remains the World State Engine's own input
    // and is unchanged).
    AFIP.bus.emit('health-monitor:assessment', assessment);

    return assessment;
  };

  /** @returns {object|null} the most recent Health Assessment this module produced. */
  HealthMonitor.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.HealthMonitor = AFIP.HealthMonitor || new HealthMonitor();
})(typeof window !== 'undefined' ? window : globalThis);
