/**
 * AFIP :: Mission Timeline
 * ---------------------------------------------------------------------
 * Purpose
 *   Maintain chronological mission history: events, decisions, alerts, operator actions, phase changes. Historical backbone for Explainability and audit.
 *
 * Inputs
 *   - Events
 *   - Decisions
 *   - Alerts
 *   - Operator commands
 *
 * Outputs
 *   - Timeline entries
 *   - Mission replay
 *   - Audit trail
 *
 * Dependencies
 *   - Explainability
 *
 * Display
 *   Timeline panel
 *
 * Update frequency
 *   Event-driven
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 10 — Mission Timeline).
 *
 * Design notes
 *   - Event-driven per the spec ("Update frequency: Event-driven"):
 *     update(worldState, ...) is still called once per cycle (matches
 *     the existing loop convention) but only appends an entry when
 *     something changed this cycle — a phase transition, a waypoint
 *     reached, a Decision Engine result, or an operator command — never
 *     one entry per frame regardless of content.
 *   - record(explanationOutput) is the dedicated Explainability handoff
 *     (per Explainability Engine design doc §9, "the timeline is
 *     populated by the same handoff that feeds the Record function" —
 *     explainability.js already calls this defensively). Every
 *     Explainability output becomes exactly one DECISION_CHANGE-class
 *     timeline entry, anchored by (cycle, Mission Phase State),
 *     matching the two coordinates that doc specifies.
 *   - Immutable history: every entry is Object.freeze()'d before being
 *     pushed, and the internal array is only ever appended to, never
 *     mutated in place — getHistory() returns a shallow copy so
 *     callers cannot mutate the stored history either.
 *   - This module never writes World State directly; its footprint is
 *     an Evidence Record (source: 'mission-timeline', latest entry
 *     only, to avoid re-publishing the whole history every cycle) plus
 *     the full history available via getHistory()/getEvents().
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  var EventType = {
    TAKEOFF: 'TAKEOFF', HOVER: 'HOVER', TRANSITION: 'TRANSITION', CRUISE: 'CRUISE',
    APPROACH_DESCENT: 'APPROACH_DESCENT', WAYPOINT_REACHED: 'WAYPOINT_REACHED',
    REROUTE: 'REROUTE', DECISION_CHANGE: 'DECISION_CHANGE', OPERATOR_COMMAND: 'OPERATOR_COMMAND',
    LANDING: 'LANDING', MISSION_COMPLETE: 'MISSION_COMPLETE'
  };

  // Simulator FlightPhase index -> Mission Timeline event, mirroring
  // mission-executive.js's own SIM_PHASE_TO_ME_PHASE mapping (kept
  // independent/local per "do not reach into other modules directly").
  var PHASE_EVENT = { 0: EventType.TAKEOFF, 1: EventType.HOVER, 2: EventType.TRANSITION, 3: EventType.CRUISE, 4: EventType.TRANSITION, 5: EventType.APPROACH_DESCENT };

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function MissionTimeline() {
    this._history = [];
    this._lastPhaseIndex = null;
    this._lastDecisionResult = null;
    this._lastAcceptedProposal = null;
    this._landingAnnounced = false;
  }

  function makeEntry(type, cycle, timestamp, missionPhase, detail) {
    return Object.freeze({ type: type, cycle: cycle, timestamp: timestamp, missionPhase: missionPhase || null, detail: detail || null, recordedAt: Date.now() });
  }

  MissionTimeline.prototype._push = function (entry) {
    this._history.push(entry);
    AFIP.bus.emit('mission-timeline:entry', entry);
  };

  /**
   * Event-driven: appends timeline entries for whatever actually
   * changed this cycle (phase transition, waypoint arrival, Decision
   * Engine result, reroute). Safe to call every cycle.
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [decisionOutput] - falls back to AFIP.DecisionEngine.getLatest()
   * @param {object} [navigationOutput] - falls back to AFIP.NavigationIntelligence.getLatest()
   */
  MissionTimeline.prototype.update = function (worldState, decisionOutput, navigationOutput) {
    if (!worldState) return null;
    var ts = worldState.Mission.Clock.value;
    var cycle = worldState.cycle;
    var phaseIdxLeaf = worldState.Mission.Progress.PhaseIndex;
    var missionPhase = (decisionOutput && decisionOutput.missionState) || null;

    // Phase transitions.
    if (fed(phaseIdxLeaf) && phaseIdxLeaf.value !== this._lastPhaseIndex) {
      var eventType = PHASE_EVENT[phaseIdxLeaf.value] || EventType.CRUISE;
      this._push(makeEntry(eventType, cycle, ts, missionPhase, { phaseIndex: phaseIdxLeaf.value }));
      this._lastPhaseIndex = phaseIdxLeaf.value;
    }

    // Waypoint arrivals — read off this cycle's Navigation output.
    var nav = navigationOutput || (AFIP.NavigationIntelligence && AFIP.NavigationIntelligence.getLatest());
    if (nav && nav.waypointsReachedThisCycle && nav.waypointsReachedThisCycle.length) {
      var self = this;
      nav.waypointsReachedThisCycle.forEach(function (wp) {
        self._push(makeEntry(EventType.WAYPOINT_REACHED, cycle, ts, missionPhase, { waypoint: wp }));
      });
      if (nav.missionComplete) {
        this._push(makeEntry(EventType.MISSION_COMPLETE, cycle, ts, missionPhase, null));
      }
    }

    // Decision Engine outcome changes (accepted proposal changed, or a reroute/divert was arbitrated).
    var decision = decisionOutput || (AFIP.DecisionEngine && AFIP.DecisionEngine.getLatest());
    if (decision) {
      var Proposal = (AFIP.MissionExecutive && AFIP.MissionExecutive.Proposal) || {};
      if (decision.acceptedProposal === Proposal.DIVERT && this._lastAcceptedProposal !== Proposal.DIVERT) {
        this._push(makeEntry(EventType.REROUTE, cycle, ts, missionPhase, { conflicts: decision.conflicts }));
      }
      if (decision.result !== this._lastDecisionResult || decision.acceptedProposal !== this._lastAcceptedProposal) {
        this._push(makeEntry(EventType.DECISION_CHANGE, cycle, ts, missionPhase, { result: decision.result, acceptedProposal: decision.acceptedProposal, confidence: decision.confidence }));
      }
      this._lastDecisionResult = decision.result;
      this._lastAcceptedProposal = decision.acceptedProposal;
    }

    if (fed(phaseIdxLeaf) && phaseIdxLeaf.value === 5 && nav && nav.missionComplete && !this._landingAnnounced) {
      this._landingAnnounced = true;
      this._push(makeEntry(EventType.LANDING, cycle, ts, missionPhase, null));
    }

    var latest = this._history.length ? this._history[this._history.length - 1] : null;
    if (latest) {
      AFIP.bus.emit('evidence:batch', [{ source: 'mission-timeline', field: 'Timeline.LatestEntry', value: latest, timestamp: ts, frame: worldState.lastFrame }]);
    }
    return latest;
  };

  /**
   * Dedicated Explainability handoff (Explainability Engine design doc
   * §9) — one immutable DECISION_CHANGE-class entry per rendered
   * explanation, called by explainability.js.
   * @param {object} explanationOutput - output of ExplainabilityEngine.update()
   */
  MissionTimeline.prototype.record = function (explanationOutput) {
    if (!explanationOutput) return null;
    var entry = makeEntry('EXPLANATION', explanationOutput.cycle, explanationOutput.timestamp, explanationOutput.missionPhase, {
      decision: explanationOutput.explanation ? explanationOutput.explanation.decision : null,
      priority: explanationOutput.priority,
      posture: explanationOutput.posture
    });
    this._push(entry);
    return entry;
  };

  /** @returns {object[]} immutable copy of the full event history. */
  MissionTimeline.prototype.getHistory = function () {
    return this._history.slice();
  };

  /** Alias for getHistory(), matching the spec's "events" terminology. */
  MissionTimeline.prototype.getEvents = function () {
    return this.getHistory();
  };

  AFIP.MissionTimeline = AFIP.MissionTimeline || new MissionTimeline();
  AFIP.MissionTimeline.EventType = EventType;
})(typeof window !== 'undefined' ? window : globalThis);
