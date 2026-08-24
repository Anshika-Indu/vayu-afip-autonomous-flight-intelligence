/**
 * AFIP :: World State Engine
 * ---------------------------------------------------------------------
 * Purpose
 *   Maintain AFIP's single authoritative, immutable understanding of
 *   the aircraft and mission. Nothing bypasses it; every AFIP module
 *   reads the same snapshot per reasoning cycle.
 *
 * Inputs
 *   - Evidence Records from AFIP.EvidenceAdapter, via
 *     AFIP.bus.on('evidence:batch', ...).
 *
 * Outputs
 *   - Immutable World State Snapshot via getSnapshot(), and
 *     AFIP.bus.emit('worldstate:updated', snapshot) each cycle.
 *
 * Dependencies
 *   - Evidence Adapter.
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 3 — World State).
 *
 * What Phase 3 adds over Phase 2
 *   - The full §5.2–5.13 shape is declared up front (SCHEMA below), so
 *     every module gets an identical, predictable structure from cycle
 *     one — a field that's never been fed by evidence is still present,
 *     just with value: null, not missing.
 *   - Each top-level object (Aircraft, Mission, Navigation, Health, …)
 *     gets a `_meta` block: { dataAvailable, freshness, leafCount }.
 *     `freshness` is "seconds since the most recently updated leaf in
 *     this object, relative to the current cycle's mission clock" —
 *     null if nothing in the object has ever been fed. This is the
 *     concrete form of the "Telemetry Freshness" / "Pose Confidence"
 *     concepts from §5.3, generalized to every object rather than only
 *     Aircraft, since Mission/Navigation need the same honesty check.
 *   - Operator.CurrentCommand is derived (not raw evidence) from
 *     Mission.Status.Playing, matching §5.10: "This object represents
 *     human intent, not aircraft state." It is computed at publish
 *     time from whatever the operator most recently did in the sim UI.
 *
 * What's still NOT here (later phases)
 *   - Health, Energy, Environment, Communication, Risk, Prediction stay
 *     structurally present but empty (`_meta.dataAvailable: false`)
 *     until their owning module (Phase 4) or a real telemetry source
 *     exists. WSE does not synthesize their values — see §5.6 ("Health
 *     ... produced exclusively by the Health Monitoring System") and
 *     §5.11 ("Risk ... generated only by the Risk Engine").
 *   - No reconciliation across conflicting sources — there is only one
 *     evidence source (the simulator) right now.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  /**
   * Explicit §5 schema. Every leaf is a placeholder object the shape of
   * an Evidence Record's payload: { value, timestamp, frame }, all null
   * until evidence fills it in. Arrays start empty. This function is
   * called once at load and whenever ingest() encounters a brand new
   * cycle 0 draft — it is the canonical shape every consumer can rely on.
   */
  function leaf() { return { value: null, timestamp: null, frame: null }; }

  function buildSchema() {
    return {
      // §5.3 Aircraft — owner: World State Engine
      Aircraft: {
        Position: { Latitude: leaf(), Longitude: leaf() },
        Velocity: leaf(),
        Attitude: { Roll: leaf(), Pitch: leaf(), Yaw: leaf() },
        Heading: leaf(),
        Kinematics: { Airspeed: leaf(), GroundSpeed: leaf(), VerticalSpeed: leaf() },
        Altitude: leaf(),
        Configuration: { RotorTiltAngle: leaf(), TransitionMode: leaf() },
        Payload: { Mass: leaf(), Status: leaf() },
        FlightPhase: leaf(),
        PoseConfidence: leaf(),
        // Extension beyond §5.3, documented in evidence-adapter.js: raw
        // structural telemetry the Health Monitor (Phase 4) will read.
        Structural: { GyroscopicTorque: leaf(), TorqueClockwise: leaf(), TorqueCounterClockwise: leaf() }
      },

      // §5.4 Mission — consumed by Mission Planner, Mission Executive, Explainability
      Mission: {
        Definition: leaf(),
        Objectives: [],
        ActiveGoal: leaf(),
        CompletedGoals: [],
        Status: { Playing: leaf(), SpeedMultiplier: leaf() },
        Progress: { Phase: leaf(), PhaseIndex: leaf(), PhaseFraction: leaf() },
        ETA: leaf(),
        RemainingDistance: leaf(),
        Constraints: { CruiseSpeedSetting: leaf(), CruiseAltitudeSetting: leaf() },
        OperationalBoundaries: leaf(),
        Clock: leaf()
      },

      // §5.5 Navigation — consumed by Navigation, Risk, Mission Executive
      Navigation: {
        CurrentPosition: leaf(),
        TargetPosition: leaf(),
        Route: leaf(),
        Waypoints: [],
        Geofence: leaf(),
        RouteStatus: leaf(),
        PositionConfidence: leaf(),
        AlternateLandingSites: [],
        EstimatedArrival: leaf(),
        Progress: { DistanceTraveled: leaf(), TotalDistance: leaf(), DistanceRemaining: leaf() },
        Sensor: { GPSPosition: leaf(), GPSQuality: leaf() }
      },

      // §5.6 Health — produced exclusively by the Health Monitor (Phase 4)
      Health: {
        OverallHealthScore: leaf(),
        BatteryHealth: leaf(),
        PropulsionHealth: leaf(),
        SensorHealth: leaf(),
        ESCHealth: leaf(),
        GPSHealth: leaf(),
        IMUHealth: leaf(),
        CommunicationHealth: leaf(),
        PayloadHealth: leaf(),
        WarningFlags: [],
        PredictedFailures: []
      },

      // §5.7 Energy — consumed by Prediction, Health, Mission Executive
      Energy: {
        Remaining: leaf(),
        ConsumptionRate: leaf(),
        PredictedEndurance: leaf(),
        ReserveMargin: leaf(),
        Confidence: leaf(),
        State: { BatteryPercentage: leaf() },
        Telemetry: { BatteryVoltage: leaf(), BatteryCurrent: leaf() }
      },

      // §5.8 Environment — read by Navigation, Risk, Prediction
      Environment: {
        Wind: leaf(),
        Temperature: leaf(),
        Atmospheric: leaf(),
        Terrain: leaf(),
        OperationalArea: leaf(),
        Weather: { WindSpeed: leaf(), WindDirection: leaf(), AmbientTemperature: leaf() }
      },

      // Communication — consumed by Risk, Mission Executive
      Communication: {
        LinkStatus: leaf(),
        Latency: leaf(),
        SignalQuality: leaf(),
        LastOperatorContact: leaf(),
        DataFreshness: leaf()
      },

      // §5.10 Operator — represents human intent, not aircraft state
      Operator: {
        CurrentCommand: leaf(),      // derived at publish time, see below
        ManualOverrides: leaf(),
        MissionApprovalState: leaf(),
        OperatorNotes: leaf(),
        OperatorConfidence: leaf()
      },

      // §5.11 Risk — generated only by the Risk Engine (Phase 4)
      Risk: {
        MissionRisk: leaf(), NavigationRisk: leaf(), HealthRisk: leaf(),
        EnvironmentalRisk: leaf(), CompositeRisk: leaf(), Confidence: leaf(), Trend: leaf()
      },

      // §5.12 Prediction — consumed by Mission Executive, Explainability
      Prediction: {
        EnergyForecast: leaf(), FailureForecast: leaf(), ETAForecast: leaf(),
        MissionSuccessProbability: leaf(), LandingPrediction: leaf(), TrendAnalysis: leaf()
      },

      // §5.13 Mission Timeline — historical backbone for Explainability/Audit
      Timeline: {
        Events: [], Decisions: [], Alerts: [], OperatorActions: [], PhaseChanges: [], Markers: []
      }
    };
  }

  var TOP_LEVEL_KEYS = [
    'Aircraft', 'Mission', 'Navigation', 'Health', 'Energy', 'Environment',
    'Communication', 'Operator', 'Risk', 'Prediction', 'Timeline'
  ];

  var draft = { cycle: 0, lastUpdated: null, lastFrame: null };
  TOP_LEVEL_KEYS.forEach(function (k) { draft[k] = buildSchema()[k]; });
  var cycle = 0;
  var lastPublished = null;

  /** Write a value at a dotted path, e.g. 'Aircraft.Kinematics.Airspeed'. */
  function setPath(root, path, value, meta) {
    var parts = path.split('.');
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]] = node[parts[i]] || {};
    }
    node[parts[parts.length - 1]] = { value: value, timestamp: meta.timestamp, frame: meta.frame };
  }

  /** Collect every {timestamp} leaf under a node, recursively. */
  function collectTimestamps(node, acc) {
    if (!node || typeof node !== 'object') return;
    if ('timestamp' in node && 'value' in node) {
      if (node.timestamp !== null) acc.push(node.timestamp);
      return;
    }
    Object.keys(node).forEach(function (k) { collectTimestamps(node[k], acc); });
  }

  /**
   * Compute { dataAvailable, freshness, leafCount } for one top-level
   * object relative to the current mission clock.
   */
  function computeMeta(node, currentClock) {
    var timestamps = [];
    collectTimestamps(node, timestamps);
    if (timestamps.length === 0) {
      return { dataAvailable: false, freshness: null, leafCount: 0 };
    }
    var mostRecent = Math.max.apply(null, timestamps);
    var freshness = (typeof currentClock === 'number') ? Math.max(0, currentClock - mostRecent) : null;
    return { dataAvailable: true, freshness: freshness, leafCount: timestamps.length };
  }

  function WorldStateEngine() {}

  /**
   * Apply one batch of Evidence Records to the working draft. Call
   * publish() to seal it into an immutable snapshot for this cycle.
   * @param {object[]} evidenceRecords
   */
  WorldStateEngine.prototype.ingest = function (evidenceRecords) {
    (evidenceRecords || []).forEach(function (rec) {
      setPath(draft, rec.field, rec.value, rec);
      draft.lastUpdated = rec.timestamp;
      draft.lastFrame = rec.frame;
    });
  };

  /**
   * Seal the current draft into an immutable snapshot, increment the
   * cycle counter, attach per-object freshness metadata, and notify
   * subscribers. All AFIP reasoning modules for this cycle must use the
   * returned object so they see the same data.
   *
   * Freezes a CLONE of the draft, not the draft itself — the draft
   * keeps accumulating evidence across cycles, so freezing it in place
   * would make the very next ingest() throw.
   * @returns {object} frozen World State Snapshot
   */
  WorldStateEngine.prototype.publish = function () {
    draft.cycle = ++cycle;

    // §5.10 Operator.CurrentCommand — derived human-intent signal, not
    // raw evidence. Computed fresh each cycle from the mission clock's
    // Playing flag rather than written by the Evidence Adapter.
    var playingLeaf = draft.Mission.Status.Playing;
    draft.Operator.CurrentCommand = {
      value: playingLeaf.value === null ? null : (playingLeaf.value ? 'RUN' : 'PAUSE'),
      timestamp: playingLeaf.timestamp,
      frame: playingLeaf.frame
    };

    var clone = JSON.parse(JSON.stringify(draft));
    var currentClock = clone.Mission.Clock.value;

    TOP_LEVEL_KEYS.forEach(function (key) {
      clone[key]._meta = computeMeta(draft[key], currentClock);
    });

    var snapshot = deepFreeze(clone);
    lastPublished = snapshot;
    AFIP.bus.emit('worldstate:updated', snapshot);
    return snapshot;
  };

  /** @returns {object|null} the most recently published immutable snapshot, or null before the first publish() call. */
  WorldStateEngine.prototype.getSnapshot = function () {
    return lastPublished;
  };

  function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    Object.getOwnPropertyNames(obj).forEach(function (name) {
      var val = obj[name];
      if (val && typeof val === 'object') deepFreeze(val);
    });
    return Object.freeze(obj);
  }

  // Wire automatically: every evidence batch updates the draft. The
  // simulator loop calls publish() once per frame after ingest, so
  // every module downstream sees one consistent snapshot per cycle.
  AFIP.bus.on('evidence:batch', function (batch) {
    AFIP.WorldStateEngine.ingest(batch);
  });

  AFIP.WorldStateEngine = AFIP.WorldStateEngine || new WorldStateEngine();
})(typeof window !== 'undefined' ? window : globalThis);
