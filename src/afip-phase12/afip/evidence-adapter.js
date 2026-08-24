/**
 * AFIP :: Evidence Adapter
 * ---------------------------------------------------------------------
 * Purpose
 *   Convert raw simulator telemetry into timestamped Evidence Records
 *   before anything enters the World State. This is the ONLY module
 *   that reads simulator variables directly — every other AFIP module
 *   reads Evidence Records or the World State, never the simulator.
 *
 * Inputs
 *   - A raw telemetry object handed in once per simulator frame, by a
 *     single additive call the simulator's own loop() makes. See
 *     Simulator_AFIP.html, inside loop(), for the call site.
 *
 * Outputs
 *   - Evidence Records (AFIP.EvidenceRecordShape), pushed to
 *     AFIP.WorldStateEngine via AFIP.bus.emit('evidence:batch', ...).
 *
 * Dependencies
 *   - None (root of the AFIP pipeline; reads simulator directly).
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 2 — Evidence Integration).
 *
 * Coverage note — read before extending
 *   The attached simulator (Simulator_AFIP.html) is a deterministic,
 *   parametric transition-physics visualizer: it computes phase, tilt,
 *   velocity, altitude, and gyroscopic spar-shear torque from mission
 *   time. It does NOT produce battery, GPS, motor/ESC temperature,
 *   IMU, wind, ambient temperature, or communication-link data — those
 *   rows in the Integration Spec §4.3 Mapping Matrix have no source in
 *   this build. FIELD_MAP below lists only what is genuinely available.
 *   AWAITING_SOURCE lists what is not, so Health/Risk/Prediction
 *   modules (Phase 4) know exactly what they can and cannot reason
 *   about. Do not backfill AWAITING_SOURCE fields with synthetic or
 *   randomized values — AFIP does not fake intelligence.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  /**
   * Simulator field -> Evidence field mapping. `extract` reads the raw
   * telemetry object passed to ingest() for one frame.
   * World-state namespacing follows Integration Spec §4.3/§5.
   */
  var FIELD_MAP = [
    { field: 'Mission.Clock',            extract: function (r) { return r.t; } },
    { field: 'Mission.Progress.Phase',   extract: function (r) { return r.phaseName; } },
    { field: 'Mission.Progress.PhaseIndex', extract: function (r) { return r.phase; } },
    { field: 'Mission.Progress.PhaseFraction', extract: function (r) { return r.localX; } },
    { field: 'Mission.Status.Playing',   extract: function (r) { return r.playing; } },
    { field: 'Mission.Status.SpeedMultiplier', extract: function (r) { return r.speed; } },

    { field: 'Aircraft.Kinematics.Airspeed',   extract: function (r) { return r.vel; } },   // km/h
    { field: 'Aircraft.Kinematics.GroundSpeed',extract: function (r) { return r.vel; } },   // no separate wind model yet — see AWAITING_SOURCE
    { field: 'Aircraft.Altitude',              extract: function (r) { return r.alt; } },   // m
    { field: 'Aircraft.Configuration.RotorTiltAngle', extract: function (r) { return r.tilt; } }, // deg
    { field: 'Aircraft.Configuration.TransitionMode',
      extract: function (r) { return r.phase === 2 || r.phase === 4; } },
    { field: 'Aircraft.Payload.Mass',          extract: function (r) { return r.payload; } }, // kg

    { field: 'Navigation.Progress.DistanceTraveled', extract: function (r) { return r.distanceTraveled; } },
    { field: 'Navigation.Progress.TotalDistance',    extract: function (r) { return r.totalDist; } },
    { field: 'Navigation.Progress.DistanceRemaining',
      extract: function (r) { return Math.max(0, r.totalDist - r.distanceTraveled); } },

    { field: 'Mission.Constraints.CruiseSpeedSetting', extract: function (r) { return r.cruiseSpeedSetting; } },
    { field: 'Mission.Constraints.CruiseAltitudeSetting', extract: function (r) { return r.cruiseAltSetting; } },

    // Not in the original mapping matrix, but genuinely computed by the
    // simulator and safety-relevant — the sim's own UI already treats
    // this as a structural health signal (spar shear warning). Filed
    // under Aircraft, not Health: per Integration Spec §5.6, the Health
    // object is produced exclusively by the Health Monitor module
    // (Phase 4), which will read this raw evidence to derive
    // Health.PropulsionHealth / WarningFlags, not the other way around.
    { field: 'Aircraft.Structural.GyroscopicTorque',    extract: function (r) { return r.tauGyro; } }, // N·m
    { field: 'Aircraft.Structural.TorqueClockwise',     extract: function (r) { return r.tauCW; } },
    { field: 'Aircraft.Structural.TorqueCounterClockwise', extract: function (r) { return r.tauCCW; } }
  ];

  /**
   * World State fields the Mapping Matrix (§4.3) calls for that this
   * simulator build does not produce. Documentation only — no Evidence
   * Records are emitted for these. Populate FIELD_MAP above, not this
   * list, once a real source exists (PX4/ArduPilot/ROS2/real sensors).
   */
  AFIP.AWAITING_SOURCE = Object.freeze([
    'Aircraft.Position.Latitude', 'Aircraft.Position.Longitude',
    'Navigation.Sensor.GPSPosition', 'Navigation.Sensor.GPSQuality',
    'Energy.State.BatteryPercentage', 'Energy.Telemetry.BatteryVoltage',
    'Energy.Telemetry.BatteryCurrent', 'Energy.Remaining.EstimatedEnergy',
    'Health.Propulsion.MotorTemperature', 'Health.Propulsion.MotorRPM',
    'Health.Powertrain.ESCTemperature', 'Health.SensorIntegrity.IMUStatus',
    'Environment.Weather.WindSpeed', 'Environment.Weather.WindDirection',
    'Environment.Weather.AmbientTemperature',
    'Communication.LinkStatus', 'Communication.Latency', 'Communication.SignalQuality'
  ]);

  var frameCounter = 0;
  var lastBatch = [];

  function EvidenceAdapter() {}

  /**
   * Called once per simulator frame with the raw telemetry object.
   * Produces Evidence Records and hands them to the World State Engine
   * via the bus — this function never mutates World State directly.
   * @param {object} raw - see Simulator_AFIP.html loop() call site.
   * @returns {object[]} Evidence Records emitted this frame.
   */
  EvidenceAdapter.prototype.ingest = function (raw) {
    if (!raw) return [];
    var timestamp = (typeof raw.t === 'number') ? raw.t : 0;
    var frame = frameCounter++;

    var batch = FIELD_MAP.map(function (m) {
      return {
        source: 'simulator.telemetry',
        field: m.field,
        value: m.extract(raw),
        timestamp: timestamp,
        frame: frame
      };
    });

    lastBatch = batch;
    AFIP.bus.emit('evidence:batch', batch);
    return batch;
  };

  /** @returns {object[]} the most recent batch of Evidence Records. */
  EvidenceAdapter.prototype.latest = function () {
    return lastBatch;
  };

  AFIP.EvidenceAdapter = AFIP.EvidenceAdapter || new EvidenceAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
