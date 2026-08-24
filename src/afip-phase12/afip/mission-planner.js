/**
 * AFIP :: Mission Planner
 * ---------------------------------------------------------------------
 * Purpose
 *   Define and modify mission objectives from operator commands and mission templates.
 *
 * Inputs
 *   - Operator commands
 *   - Mission templates
 *   - Waypoints
 *   - Constraints
 *
 * Outputs
 *   - Mission definition
 *   - Updated objectives
 *   - Route requests
 *
 * Dependencies
 *   - World State
 *   - Navigation
 *
 * Display
 *   Objectives, Waypoints, Constraints, Mission status
 *
 * Update frequency
 *   On operator interaction or mission modification
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 10 — Mission Planner).
 *
 * Design notes
 *   - This simulator build (see evidence-adapter.js coverage note) is a
 *     deterministic, parametric single-track visualizer: one origin,
 *     one destination, one continuous DistanceTraveled/TotalDistance
 *     axis, no lat/lon telemetry (AFIP.AWAITING_SOURCE lists
 *     Aircraft.Position.Latitude/Longitude). The Mission Planner does
 *     not invent 2D geography it cannot source — its "waypoint
 *     sequence" is a set of distance markers along that one axis, tied
 *     to the six flight phases the simulator itself already computes
 *     (Mission.Progress.PhaseIndex 0-5), which is genuinely planned
 *     mission structure, not fabricated telemetry.
 *   - Energy requirement: Energy.ConsumptionRate/Remaining are
 *     AWAITING_SOURCE in this build (see evidence-adapter.js). Per
 *     project discipline ("do not fabricate telemetry"), the Mission
 *     Planner reports the energy-requirement estimate as UNKNOWN with
 *     an explicit reason, exactly like Health Monitor treats
 *     Battery Health — it does not invent a consumption-rate model to
 *     fill the gap.
 *   - Alternate landing sites: no obstacle/landing-site sensing exists
 *     in this build either (risk-engine.js's own collision-risk note).
 *     The two sites this module *can* honestly assert are the mission's
 *     own defined origin and destination pads (distance 0 and
 *     TotalDistance) — that is mission-definition data the Planner
 *     itself owns, not sensed telemetry, so asserting them is
 *     consistent with "never fake intelligence."
 *   - This module never writes World State directly; its footprint is
 *     Evidence Records (source: 'mission-planner'), same convention as
 *     every other reasoning module.
 *   - update() is safe to call every cycle (matches the existing loop
 *     convention) but only recomputes the plan when TotalDistance
 *     changes or a new goal is explicitly set via setMissionGoal() —
 *     "On operator interaction or mission modification" per the spec.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  // Distance-fraction markers for each simulator flight phase boundary,
  // used to place waypoints along the single DistanceTraveled axis.
  // Phase 0/1 = ascent (origin area), 2 = transition-out, 3 = cruise,
  // 4 = transition-in, 5 = approach/descent (destination area).
  var PHASE_BOUNDARY_FRACTIONS = [0, 0.05, 0.15, 0.85, 0.95, 1.0];
  var PHASE_BOUNDARY_LABELS = ['ORIGIN_PAD', 'ASCENT_COMPLETE', 'CRUISE_START', 'CRUISE_END', 'TRANSITION_IN_COMPLETE', 'DESTINATION_PAD'];

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function MissionPlanner() {
    this._lastOutput = null;
    this._goal = null; // { id, description, cruiseSpeedHint } — operator/template-supplied, not a Belief Field
    this._planForTotalDistance = null; // cache key: plan only rebuilt when TotalDistance changes or goal changes
  }

  /**
   * Operator- or template-supplied Mission Goal. This is intent, not
   * sensed data — mirrors how Mission Executive treats operator input
   * (never a Belief Field). Safe to call at any time; takes effect on
   * the next update().
   * @param {object} goal - { id, description, cruiseSpeedHint }
   */
  MissionPlanner.prototype.setMissionGoal = function (goal) {
    this._goal = goal || null;
    this._planForTotalDistance = null; // force replan
  };

  function buildWaypoints(totalDistance) {
    return PHASE_BOUNDARY_FRACTIONS.map(function (frac, i) {
      return {
        id: 'WP' + i,
        label: PHASE_BOUNDARY_LABELS[i],
        distance: Math.round(totalDistance * frac * 100) / 100,
        phaseIndex: i === 0 ? 0 : (i === PHASE_BOUNDARY_FRACTIONS.length - 1 ? 5 : i)
      };
    });
  }

  function estimateDuration(totalDistance, cruiseSpeedSetting) {
    if (!totalDistance || !cruiseSpeedSetting || cruiseSpeedSetting <= 0) {
      return { available: false, reason: 'Missing TotalDistance or Mission.Constraints.CruiseSpeedSetting' };
    }
    // Deterministic estimate only, same discipline and unit convention as
    // prediction-engine.js's forecastETA(): TotalDistance is meters,
    // CruiseSpeedSetting is km/h — convert speed to m/s before dividing.
    // Does not model ascent/transition/descent segment-speed
    // differences — flagged as an approximation, not a precise forecast.
    var speedMs = cruiseSpeedSetting * (1000 / 3600);
    var estimatedSeconds = speedMs > 0 ? totalDistance / speedMs : null;
    return { available: true, estimatedSeconds: estimatedSeconds !== null ? Math.round(estimatedSeconds) : null, confidence: 0.5, note: 'Kinematic estimate (TotalDistance / CruiseSpeedSetting); does not model phase-specific speed.' };
  }

  function estimateEnergyRequirement() {
    // Energy.ConsumptionRate has no telemetry source in this build
    // (see evidence-adapter.js AWAITING_SOURCE) — reported honestly as
    // unknown rather than modeled from an invented consumption curve.
    return {
      available: false,
      reason: 'Energy.ConsumptionRate / Energy.Remaining: no telemetry source in this simulator build (AWAITING_SOURCE)',
      note: 'Energy requirement cannot be estimated until a real energy telemetry source is integrated.'
    };
  }

  function buildAlternateLandingSites(totalDistance) {
    // The only two sites this module can honestly assert without an
    // obstacle/landing-site database: the mission's own origin and
    // destination pads. This is mission-definition data, not a sensed
    // telemetry value.
    return [
      { id: 'ORIGIN_PAD', distance: 0, source: 'mission-definition', note: 'Point of departure, assumed prepared for landing.' },
      { id: 'DESTINATION_PAD', distance: totalDistance, source: 'mission-definition', note: 'Assigned destination, assumed prepared for landing.' }
    ];
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @returns {object|null} Mission Definition (waypoints, distance, duration/energy estimates, alternate sites, constraints), or null if TotalDistance isn't available yet.
   */
  MissionPlanner.prototype.update = function (worldState) {
    if (!worldState) return null;
    var totalDistLeaf = worldState.Navigation.Progress.TotalDistance;
    if (!fed(totalDistLeaf)) return this._lastOutput; // nothing to plan against yet — hold last plan

    var totalDistance = totalDistLeaf.value;
    var cruiseSpeed = worldState.Mission.Constraints.CruiseSpeedSetting;
    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    var cacheKey = totalDistance + '|' + (this._goal ? this._goal.id : 'default');
    if (this._planForTotalDistance === cacheKey && this._lastOutput) {
      return this._lastOutput; // no mission modification this cycle — hold prior plan (spec: recompute on modification, not every frame)
    }

    var waypoints = buildWaypoints(totalDistance);
    var duration = estimateDuration(totalDistance, fed(cruiseSpeed) ? cruiseSpeed.value : null);
    var energy = estimateEnergyRequirement();
    var alternateSites = buildAlternateLandingSites(totalDistance);
    var constraints = {
      cruiseSpeedSetting: fed(cruiseSpeed) ? cruiseSpeed.value : null,
      cruiseAltitudeSetting: fed(worldState.Mission.Constraints.CruiseAltitudeSetting) ? worldState.Mission.Constraints.CruiseAltitudeSetting.value : null,
      operationalBoundaries: fed(worldState.Mission.OperationalBoundaries) ? worldState.Mission.OperationalBoundaries.value : null
    };

    var definition = {
      goal: this._goal || { id: 'DEFAULT', description: 'Point-to-point cargo delivery, origin to destination pad.' },
      totalDistance: totalDistance,
      waypoints: waypoints,
      estimatedDuration: duration,
      estimatedEnergyRequirement: energy,
      alternateLandingSites: alternateSites,
      constraints: constraints
    };

    var output = { timestamp: ts, frame: frame, cycle: worldState.cycle, definition: definition };
    this._lastOutput = output;
    this._planForTotalDistance = cacheKey;

    AFIP.bus.emit('evidence:batch', [
      { source: 'mission-planner', field: 'Mission.Definition', value: definition, timestamp: ts, frame: frame },
      { source: 'mission-planner', field: 'Mission.Objectives', value: waypoints, timestamp: ts, frame: frame },
      { source: 'mission-planner', field: 'Navigation.Waypoints', value: waypoints, timestamp: ts, frame: frame },
      { source: 'mission-planner', field: 'Navigation.AlternateLandingSites', value: alternateSites, timestamp: ts, frame: frame },
      { source: 'mission-planner', field: 'Mission.Constraints', value: constraints, timestamp: ts, frame: frame }
    ]);
    AFIP.bus.emit('mission-planner:definition', output);

    return output;
  };

  /** @returns {object|null} the most recent Mission Definition. */
  MissionPlanner.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.MissionPlanner = AFIP.MissionPlanner || new MissionPlanner();
})(typeof window !== 'undefined' ? window : globalThis);
