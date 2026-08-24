/**
 * AFIP :: Navigation Intelligence
 * ---------------------------------------------------------------------
 * Purpose
 *   Evaluate route progress and recommend navigation actions. Never executes navigation directly — the simulator retains route execution.
 *
 * Inputs
 *   - Position
 *   - Mission
 *   - Environment
 *   - Constraints
 *
 * Outputs
 *   - Route status
 *   - Diversion options
 *   - ETA
 *   - Route confidence
 *
 * Dependencies
 *   - World State
 *   - Prediction
 *
 * Display
 *   Navigation panel
 *
 * Update frequency
 *   Every simulation frame
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 10 — Navigation System).
 *
 * Design notes
 *   - This build has no lat/lon, no compass/heading sensor, and no
 *     lateral-position sensor (AFIP.AWAITING_SOURCE lists
 *     Aircraft.Position.Latitude/Longitude and
 *     Navigation.Sensor.GPSPosition/GPSQuality). True Heading and
 *     Cross-Track Error in the conventional 2D-route sense are
 *     therefore reported as UNKNOWN, not fabricated:
 *       - Heading: no compass/pose source exists to derive it from.
 *       - Cross-Track Error: the simulator is a single-track
 *         parametric visualizer with no lateral degree of freedom — it
 *         is reported as a deterministic 0 with an explicit note that
 *         this reflects the simulator's architecture (no lateral
 *         deviation is physically possible on this track), never
 *         presented as a sensed "on course" confirmation.
 *   - Distance-to-waypoint, progress percentage, ETA, waypoint
 *     arrival/advance, and mission-completion detection all derive
 *     from Navigation.Progress.DistanceTraveled/TotalDistance, which
 *     ARE real evidence in this build (see evidence-adapter.js), plus
 *     the waypoint plan Mission Planner (Phase 10) already published
 *     into Navigation.Waypoints.
 *   - Waypoint-index continuity (which waypoint is "next") is internal
 *     module state, not a Belief Field — same discipline as Mission
 *     Executive's Active Intent Register (§3.2 of the Mission
 *     Executive design doc): it is written only by this module's own
 *     update() as waypoints are crossed, never inferred fresh from the
 *     Snapshot each cycle by re-deriving progress from scratch, so
 *     "next waypoint" means something concrete cycle to cycle.
 *   - This module never writes World State directly; its footprint is
 *     Evidence Records (source: 'navigation'), same convention as the
 *     other reasoning modules. It also emits
 *     'navigation:waypoint-reached' and 'navigation:mission-complete'
 *     bus events for Mission Timeline (Phase 10) to record.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function NavigationIntelligence() {
    this._lastOutput = null;
    this._nextWaypointIndex = 0; // continuity state, not a belief
    this._missionCompleteAnnounced = false;
  }

  function routeStatusFor(distanceRemaining, totalDistance, missionComplete) {
    if (missionComplete) return 'COMPLETE';
    if (!fed(distanceRemaining) || !fed(totalDistance) || totalDistance.value <= 0) return 'UNKNOWN';
    return 'ON_ROUTE';
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [predictionAssessment] - falls back to AFIP.PredictionEngine.getLatest(), used for its ETA forecast where available.
   * @returns {object|null} Navigation Assessment.
   */
  NavigationIntelligence.prototype.update = function (worldState, predictionAssessment) {
    if (!worldState) return null;
    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    var traveled = worldState.Navigation.Progress.DistanceTraveled;
    var total = worldState.Navigation.Progress.TotalDistance;
    var remaining = worldState.Navigation.Progress.DistanceRemaining;
    var groundSpeed = worldState.Aircraft.Kinematics.GroundSpeed;
    var waypoints = worldState.Navigation.Waypoints || [];

    var haveProgress = fed(traveled) && fed(total) && total.value > 0;
    var progressPercent = haveProgress ? Math.min(100, Math.round((traveled.value / total.value) * 10000) / 100) : null;
    var missionComplete = haveProgress && traveled.value >= total.value;

    // Waypoint arrival / advance — internal continuity state.
    var waypointReachedEvents = [];
    if (haveProgress && waypoints.length) {
      while (this._nextWaypointIndex < waypoints.length && traveled.value >= waypoints[this._nextWaypointIndex].distance) {
        waypointReachedEvents.push(waypoints[this._nextWaypointIndex]);
        this._nextWaypointIndex++;
      }
    }
    var nextWaypoint = waypoints[this._nextWaypointIndex] || null;
    var distanceToWaypoint = (haveProgress && nextWaypoint) ? Math.max(0, Math.round((nextWaypoint.distance - traveled.value) * 100) / 100) : null;

    // ETA — prefer Prediction Engine's own forecast if this cycle's is available (single source of truth for forecasting, per Prediction Engine's role); else a local kinematic fallback.
    var prediction = predictionAssessment || (AFIP.PredictionEngine && AFIP.PredictionEngine.getLatest());
    var eta;
    if (prediction && prediction.etaForecast && prediction.etaForecast.available) {
      eta = { available: true, secondsRemaining: prediction.etaForecast.etaSeconds, confidence: prediction.etaForecast.confidence, source: 'prediction-engine' };
    } else if (fed(remaining) && fed(groundSpeed) && groundSpeed.value > 0) {
      // GroundSpeed is km/h; DistanceRemaining is m — convert speed to m/s, same convention as prediction-engine.js's forecastETA().
      var speedMs = groundSpeed.value * (1000 / 3600);
      eta = { available: true, secondsRemaining: Math.round(remaining.value / speedMs), confidence: 0.4, source: 'navigation-kinematic-fallback' };
    } else {
      eta = { available: false, reason: 'DistanceRemaining or GroundSpeed unavailable' };
    }

    var routeStatus = routeStatusFor(remaining, total, missionComplete);

    // Heading — no compass/pose source in this build (AWAITING_SOURCE).
    var heading = { available: false, reason: 'No compass/pose source (Aircraft.Position.Latitude/Longitude AWAITING_SOURCE)' };

    // Cross-track error — single-track simulator, no lateral degree of freedom.
    var crossTrackError = { value: 0, confidence: haveProgress ? 1.0 : 0, note: 'Single-track parametric simulator: no lateral deviation is physically possible on this route, so 0 reflects the simulator architecture, not a sensed on-course confirmation.' };

    var output = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      routeStatus: routeStatus,
      progressPercent: progressPercent,
      distanceToNextWaypoint: distanceToWaypoint,
      nextWaypoint: nextWaypoint,
      eta: eta,
      heading: heading,
      crossTrackError: crossTrackError,
      missionComplete: missionComplete,
      waypointsReachedThisCycle: waypointReachedEvents
    };

    this._lastOutput = output;

    AFIP.bus.emit('evidence:batch', [
      { source: 'navigation', field: 'Navigation.RouteStatus', value: routeStatus, timestamp: ts, frame: frame },
      { source: 'navigation', field: 'Navigation.EstimatedArrival', value: eta, timestamp: ts, frame: frame },
      { source: 'navigation', field: 'Navigation.PositionConfidence', value: haveProgress ? 0.6 : 0, timestamp: ts, frame: frame }
    ]);

    waypointReachedEvents.forEach(function (wp) {
      AFIP.bus.emit('navigation:waypoint-reached', { waypoint: wp, timestamp: ts, frame: frame, cycle: worldState.cycle });
    });
    if (missionComplete && !this._missionCompleteAnnounced) {
      this._missionCompleteAnnounced = true;
      AFIP.bus.emit('navigation:mission-complete', { timestamp: ts, frame: frame, cycle: worldState.cycle });
    }
    AFIP.bus.emit('navigation:assessment', output);

    return output;
  };

  /** @returns {object|null} the most recent Navigation Assessment. */
  NavigationIntelligence.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.NavigationIntelligence = AFIP.NavigationIntelligence || new NavigationIntelligence();
})(typeof window !== 'undefined' ? window : globalThis);
