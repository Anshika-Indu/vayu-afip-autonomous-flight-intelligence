/**
 * AFIP :: Mission Executive
 * ---------------------------------------------------------------------
 * Purpose
 *   The brain: continuously evaluates the World State and determines mission progression — Continue, Hover, Transition, Cruise, Slow Down, Re-route, Return Home, Emergency Land, Mission Complete. Every decision must be explainable.
 *
 * Inputs
 *   - World State
 *   - Health
 *   - Navigation
 *   - Risk
 *   - Operator intent
 *
 * Outputs
 *   - Mission state
 *   - Current objective
 *   - Requested intent
 *
 * Dependencies
 *   - All operational modules
 *
 * Display
 *   Mission Executive panel
 *
 * Update frequency
 *   Continuous
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 7 — Mission Executive).
 *
 * Design notes (per 4__AFIP_Mission_Executive.md)
 *   - This module is the PROPOSER only (§0). It never arbitrates its own
 *     proposal and never writes back into World State — its footprint
 *     is an evidence record + the object returned from update(), which
 *     the Decision Engine (Phase 8) treats as an unapproved proposal.
 *   - Tracks two independent state dimensions (§1): Mission Phase State
 *     (a *read* of the world, never commanded by this module) and
 *     Executive Posture (this module's own trust in its reasoning,
 *     which only ever narrows under uncertainty and never self-recovers
 *     from mere absence of bad evidence — §1.2, §7.5).
 *   - Decision Flow (§2) implemented as a step pipeline per cycle:
 *     ingest -> freshness/confidence gate -> deterministic classification
 *     -> advisory integration -> cross-domain reconciliation -> fixed
 *     precedence evaluation -> posture update -> proposal+justification
 *     (generated together, §2.8) -> emit for Arbitration -> outcome
 *     intake next cycle.
 *   - Confidence is weakest-link per domain (§7.2), never averaged.
 *     Each domain has its own confidence floor (§7.4); below it the
 *     domain is UNKNOWN, not "low confidence".
 *   - Active Intent Register + last-cycle outcome are internal
 *     continuity state, not beliefs (§3.2) — populated by
 *     recordArbitrationOutcome(), which the Decision Engine calls after
 *     it resolves each cycle's proposal.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  /** §1.2 Executive Posture. */
  var Posture = { NOMINAL: 'NOMINAL', CAUTIOUS: 'CAUTIOUS', MINIMAL: 'MINIMAL', SUSPENDED: 'SUSPENDED' };
  var POSTURE_ORDER = { NOMINAL: 0, CAUTIOUS: 1, MINIMAL: 2, SUSPENDED: 3 };

  /** §1.1 Mission Phase State — read from World State, never commanded. */
  var Phase = {
    PRE_MISSION: 'PRE-MISSION VALIDATION', ASCENT: 'ASCENT', TRANSITION_OUT: 'TRANSITION (OUT)',
    CRUISE: 'CRUISE', TRANSITION_IN: 'TRANSITION (IN)', APPROACH_DESCENT: 'APPROACH/DESCENT',
    LANDED: 'LANDED', MISSION_COMPLETE: 'MISSION COMPLETE',
    HOLD: 'HOLD', DIVERT: 'DIVERT', RETURN_TO_BASE: 'RETURN-TO-BASE', ABORT: 'ABORT'
  };

  /** §4.1 fixed proposed-intent categories — never anything more specific. */
  var Proposal = { CONTINUE: 'CONTINUE', ADJUST: 'ADJUST', HOLD: 'HOLD', DIVERT: 'DIVERT', ABORT_RTB: 'ABORT_RTB' };

  /** §7.4 per-domain confidence floors (not a single global cutoff). */
  var CONFIDENCE_FLOOR = { health: 0.3, navigation: 0.3, mission: 0.25 };

  // Simulator FlightPhase index -> §1.1 Mission Phase State label. This
  // simulator's own phase enumeration (see PHASE_NAMES in
  // Simulator_AFIP.html / world-state.js Aircraft.FlightPhase) drives
  // this read-only mapping; the Mission Executive never invents phases.
  var SIM_PHASE_TO_ME_PHASE = {
    0: Phase.ASCENT, 1: Phase.ASCENT, 2: Phase.TRANSITION_OUT,
    3: Phase.CRUISE, 4: Phase.TRANSITION_IN, 5: Phase.APPROACH_DESCENT
  };

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  function MissionExecutive() {
    this._lastOutput = null;
    this._posture = Posture.NOMINAL;
    // §3.2 internal continuity state — not beliefs.
    this._activeIntentRegister = { intent: Proposal.CONTINUE, source: 'INITIAL', setAtCycle: 0 };
    this._lastCycleOutcome = null; // { proposal, result: 'accepted'|'modified'|'rejected', cycle }
  }

  /** §2 step 1-2: read Mission Phase State off the Snapshot (never commanded). */
  function readMissionPhase(worldState) {
    var idx = worldState.Mission.Progress.PhaseIndex;
    if (!fed(idx)) return { phase: Phase.PRE_MISSION, dataAvailable: false };
    var label = SIM_PHASE_TO_ME_PHASE[idx.value] || Phase.PRE_MISSION;
    return { phase: label, dataAvailable: true };
  }

  /**
   * §2 step 2 + §7: freshness/confidence gate + weakest-link domain
   * confidence. Returns { status: 'UNKNOWN'|'NOMINAL'|'DEGRADED'|'CRITICAL', confidence, reasons[] }.
   */
  function classifyHealthDomain(health) {
    if (!health) return { status: 'UNKNOWN', confidence: 0, reasons: ['Health Assessment unavailable this cycle'] };
    var conf = health.confidence || 0;
    if (conf < CONFIDENCE_FLOOR.health) {
      return { status: 'UNKNOWN', confidence: conf, reasons: ['Health.confidence=' + conf + ' below floor ' + CONFIDENCE_FLOOR.health] };
    }
    var cls = health.overallClassification;
    var status = (cls === 'CRITICAL') ? 'CRITICAL' : (cls === 'WARNING' || cls === 'DEGRADED') ? 'DEGRADED' : 'NOMINAL';
    return { status: status, confidence: conf, reasons: ['Health.OverallHealthScore=' + health.overallHealthScore + ' classification=' + cls] };
  }

  function classifyNavigationDomain(worldState, health) {
    var nav = health && health.subsystems && health.subsystems.navigation;
    var routeStatus = worldState.Navigation.RouteStatus;
    if (!nav || !nav.dataAvailable) {
      // No positioning-sensor telemetry — per Risk Engine's own posture,
      // this is unconfirmed, not "probably fine". Weakest link -> UNKNOWN
      // unless route-progress evidence is at least internally consistent.
      var distRemaining = worldState.Navigation.Progress.DistanceRemaining;
      var totalDist = worldState.Navigation.Progress.TotalDistance;
      var consistent = fed(distRemaining) && fed(totalDist) && totalDist.value > 0;
      return {
        status: consistent ? 'DEGRADED' : 'UNKNOWN',
        confidence: consistent ? 0.35 : 0.15,
        reasons: ['Health.SensorHealth(navigation): AWAITING_SOURCE', consistent ? 'Route-progress telemetry internally consistent' : 'No route-progress telemetry either']
      };
    }
    var conf = nav.confidence || 0;
    if (conf < CONFIDENCE_FLOOR.navigation) {
      return { status: 'UNKNOWN', confidence: conf, reasons: ['navigation confidence=' + conf + ' below floor'] };
    }
    var status = nav.status === 'CRITICAL' ? 'CRITICAL' : (nav.status === 'WARNING' ? 'DEGRADED' : 'NOMINAL');
    return { status: status, confidence: conf, reasons: ['Health.SensorHealth(navigation) score=' + nav.score, 'Navigation.RouteStatus=' + (fed(routeStatus) ? routeStatus.value : 'n/a')] };
  }

  /** §8: mission achievability, not just progress. Uses Prediction's own forecasts. */
  function classifyMissionDomain(worldState, prediction, health) {
    if (!prediction) {
      return { status: 'UNKNOWN', confidence: 0, reasons: ['Prediction Assessment unavailable this cycle'] };
    }
    var success = prediction.missionSuccessProbability;
    var conf = success ? success.confidence : 0;
    if (!success || conf < CONFIDENCE_FLOOR.mission) {
      return { status: 'UNKNOWN', confidence: conf || 0, reasons: ['Prediction.MissionSuccessProbability unavailable or confidence below floor'] };
    }
    var readiness = health && health.missionReadiness;
    var status;
    if (success.probability < 0.4 || (readiness && readiness.state === 'NOT_READY')) status = 'CRITICAL';
    else if (success.probability < 0.7 || (readiness && readiness.state === 'READY_WITH_CONSTRAINTS')) status = 'DEGRADED';
    else status = 'NOMINAL';
    return {
      status: status, confidence: conf,
      reasons: ['Prediction.MissionSuccessProbability=' + success.probability, 'Health.missionReadiness=' + (readiness ? readiness.state : 'n/a')]
    };
  }

  /**
   * §2 step 5: cross-domain reconciliation / §5.3 compounded risk. A
   * domain individually below threshold can still be pushed to
   * DEGRADED if two or more other domains are already DEGRADED or worse
   * — the combination is treated as riskier than any single domain
   * alone, without inventing a new deterministic threshold per domain.
   */
  function reconcile(domains) {
    var order = { NOMINAL: 0, DEGRADED: 1, CRITICAL: 2, UNKNOWN: 3 };
    var keys = Object.keys(domains);
    var degradedOrWorseCount = keys.filter(function (k) { return order[domains[k].status] >= 1; }).length;
    var compounded = [];
    if (degradedOrWorseCount >= 2) {
      keys.forEach(function (k) {
        if (domains[k].status === 'NOMINAL') {
          domains[k] = {
            status: 'DEGRADED', confidence: domains[k].confidence,
            reasons: domains[k].reasons.concat(['Compounded risk: ' + degradedOrWorseCount + ' other domains degraded-or-worse this cycle (§5.3)']),
            compounded: true
          };
          compounded.push(k);
        }
      });
    }
    return compounded;
  }

  /** §2 step 6: fixed precedence order, no exceptions. */
  function evaluatePrecedence(domains) {
    var keys = ['health', 'navigation', 'mission'];
    var unknown = keys.filter(function (k) { return domains[k].status === 'UNKNOWN'; });
    if (unknown.length) {
      return { proposal: Proposal.HOLD, branch: 'UNKNOWN_DOMAIN_FALLBACK', triggeringDomains: unknown };
    }
    // Mission status is NOT consulted at this step for critical safety domains (§8.2).
    var criticalSafety = ['health', 'navigation'].filter(function (k) { return domains[k].status === 'CRITICAL'; });
    if (criticalSafety.length) {
      return { proposal: Proposal.ABORT_RTB, branch: 'CRITICAL_SAFETY', triggeringDomains: criticalSafety };
    }
    if (domains.mission.status === 'CRITICAL') {
      return { proposal: Proposal.ABORT_RTB, branch: 'CRITICAL_MISSION', triggeringDomains: ['mission'] };
    }
    var degraded = keys.filter(function (k) { return domains[k].status === 'DEGRADED'; });
    if (degraded.length) {
      // Mission risk alone is sufficient grounds for adjust/divert (§8.3).
      return { proposal: Proposal.ADJUST, branch: 'DEGRADED_CONDITION', triggeringDomains: degraded };
    }
    return { proposal: Proposal.CONTINUE, branch: 'NOMINAL_CONTINUE', triggeringDomains: [] };
  }

  /** §2 step 7: posture is set BEFORE the proposal is finalized and governs what's structurally available. */
  function updatePosture(currentPosture, domains, faulted) {
    if (faulted) return Posture.SUSPENDED;
    var anyUnknown = Object.keys(domains).some(function (k) { return domains[k].status === 'UNKNOWN'; });
    var anyCritical = Object.keys(domains).some(function (k) { return domains[k].status === 'CRITICAL'; });
    var anyDegraded = Object.keys(domains).some(function (k) { return domains[k].status === 'DEGRADED'; });
    var next;
    if (anyUnknown || anyCritical) next = Posture.MINIMAL;
    else if (anyDegraded) next = Posture.CAUTIOUS;
    else next = Posture.NOMINAL;
    // §1.2 / §7.5: `next` is always derived fresh from this cycle's own
    // gated, confident domains — so both narrowing (immediate) and
    // widening (only when this cycle's reconciliation itself supports
    // it) are evidence-backed by construction. Nothing here carries the
    // old posture forward on mere absence of new bad evidence.
    return next;
  }

  /** §1.2: which proposals a posture structurally permits. */
  function constrainToPosture(precedence, posture) {
    var allowedByPosture = {
      NOMINAL: [Proposal.CONTINUE, Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
      CAUTIOUS: [Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
      MINIMAL: [Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
      SUSPENDED: [] // substituted proposal only, handled separately
    };
    var allowed = allowedByPosture[posture] || [];
    if (allowed.length && allowed.indexOf(precedence.proposal) === -1) {
      // Precedence chose something the posture no longer structurally
      // permits (e.g. CONTINUE while CAUTIOUS) — fall back to the most
      // conservative allowed option consistent with the same branch.
      return { proposal: allowed[0], branch: precedence.branch + '_POSTURE_CONSTRAINED', triggeringDomains: precedence.triggeringDomains };
    }
    return precedence;
  }

  /** §6.2: minimal safe proposal on Mission Executive fault, varies by Mission Phase State. */
  function minimalSafeProposal(missionPhase) {
    var forwardFlight = [Phase.TRANSITION_OUT, Phase.CRUISE, Phase.TRANSITION_IN, Phase.APPROACH_DESCENT];
    var proposal = forwardFlight.indexOf(missionPhase) !== -1 ? Proposal.ABORT_RTB : Proposal.HOLD;
    return {
      proposal: proposal, branch: 'EXECUTIVE_FAULT_MINIMAL_SAFE', triggeringDomains: [],
      note: 'Mission Executive reasoning cycle faulted; substituting fixed minimal-safe proposal per §6.2 (no justification available — recorded as a gap, not a normal decision).'
    };
  }

  /**
   * @param {object} worldState
   * @param {object} [healthAssessment] - falls back to AFIP.HealthMonitor.getLatest()
   * @param {object} [predictionAssessment] - falls back to AFIP.PredictionEngine.getLatest()
   * @returns {object} Mission Executive proposal + justification (unapproved until Decision Engine/Arbitration acts on it).
   */
  MissionExecutive.prototype.update = function (worldState, healthAssessment, predictionAssessment) {
    if (!worldState) return null;
    var health = healthAssessment || (AFIP.HealthMonitor && AFIP.HealthMonitor.getLatest());
    var prediction = predictionAssessment || (AFIP.PredictionEngine && AFIP.PredictionEngine.getLatest());
    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    var missionPhaseInfo, domains, reconciledCompound, precedence, posture, finalDecision, faulted = false, faultMessage = null;

    try {
      missionPhaseInfo = readMissionPhase(worldState);
      domains = {
        health: classifyHealthDomain(health),
        navigation: classifyNavigationDomain(worldState, health),
        mission: classifyMissionDomain(worldState, prediction, health)
      };
      reconciledCompound = reconcile(domains);
      precedence = evaluatePrecedence(domains);
      posture = updatePosture(this._posture, domains, false);
      finalDecision = constrainToPosture(precedence, posture);
    } catch (err) {
      faulted = true;
      faultMessage = err && err.message ? err.message : String(err);
      missionPhaseInfo = missionPhaseInfo || { phase: Phase.PRE_MISSION, dataAvailable: false };
      posture = Posture.SUSPENDED;
      finalDecision = minimalSafeProposal(missionPhaseInfo.phase);
      domains = domains || {
        health: { status: 'UNKNOWN', confidence: 0, reasons: ['fault'] },
        navigation: { status: 'UNKNOWN', confidence: 0, reasons: ['fault'] },
        mission: { status: 'UNKNOWN', confidence: 0, reasons: ['fault'] }
      };
    }

    this._posture = posture;

    var justification = {
      domains: domains,
      compoundedDomains: reconciledCompound || [],
      branch: finalDecision.branch,
      triggeringDomains: finalDecision.triggeringDomains,
      missionPhase: missionPhaseInfo.phase,
      posture: posture,
      activeIntentRegister: this._activeIntentRegister,
      lastCycleOutcome: this._lastCycleOutcome,
      faulted: faulted,
      faultMessage: faultMessage
    };

    var output = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      missionPhase: missionPhaseInfo.phase,
      executivePosture: posture,
      proposedIntent: finalDecision.proposal,
      justification: justification
    };

    this._lastOutput = output;

    AFIP.bus.emit('evidence:batch', [
      { source: 'mission-executive', field: 'MissionExecutive.Phase', value: missionPhaseInfo.phase, timestamp: ts, frame: frame },
      { source: 'mission-executive', field: 'MissionExecutive.Posture', value: posture, timestamp: ts, frame: frame },
      { source: 'mission-executive', field: 'MissionExecutive.ProposedIntent', value: finalDecision.proposal, timestamp: ts, frame: frame },
      { source: 'mission-executive', field: 'MissionExecutive.Justification', value: justification, timestamp: ts, frame: frame }
    ]);
    AFIP.bus.emit('mission-executive:proposal', output);

    return output;
  };

  /**
   * §3.2 / §2 step 10: Decision Engine calls this after Arbitration
   * resolves the proposal, so the next cycle's "continue" means
   * something concrete and the justification can state whether the
   * prior proposal was accepted/modified/rejected.
   * @param {string} intent - the intent now in effect (may differ from
   *   the proposal if Arbitration modified it).
   * @param {'accepted'|'modified'|'rejected'} result
   * @param {number} cycle
   */
  MissionExecutive.prototype.recordArbitrationOutcome = function (intent, result, cycle) {
    this._lastCycleOutcome = { proposal: this._lastOutput ? this._lastOutput.proposedIntent : null, result: result, cycle: cycle };
    if (result === 'accepted' || result === 'modified') {
      this._activeIntentRegister = { intent: intent, source: result === 'modified' ? 'ARBITRATION_MODIFIED' : 'ARBITRATION_ACCEPTED', setAtCycle: cycle };
    }
    // Fail-closed (§6.3): a rejected or inconclusive outcome never
    // updates the Active Intent Register — the previously active intent
    // is presumed to still be in effect.
  };

  /** @returns {object|null} the most recent Mission Executive output. */
  MissionExecutive.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.MissionExecutive = AFIP.MissionExecutive || new MissionExecutive();
  AFIP.MissionExecutive.Posture = Posture;
  AFIP.MissionExecutive.Phase = Phase;
  AFIP.MissionExecutive.Proposal = Proposal;
})(typeof window !== 'undefined' ? window : globalThis);
