/**
 * AFIP :: Decision Engine
 * ---------------------------------------------------------------------
 * Purpose
 *   Convert mission state into executable, advisory mission intent (Continue, Hold, Divert, Abort, Return, Re-plan). AFIP never issues actuator commands — only high-level intent that the simulator's existing control logic executes.
 *
 * Inputs
 *   - Mission Executive
 *   - Risk
 *   - Prediction
 *   - Health
 *
 * Outputs
 *   - Continue
 *   - Hold
 *   - Divert
 *   - Abort
 *   - Return
 *   - Re-plan
 *
 * Dependencies
 *   - Mission Executive
 *
 * Display
 *   Decision Console
 *
 * Update frequency
 *   Continuous
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 8 — Decision Engine).
 *   Phase 10 addendum: operatorProposal() now prefers a structured
 *   AFIP.OperatorCommands request when one is pending (see that
 *   function's own comment below) — additive integration only, no
 *   other logic in this file changed.
 *
 * Design notes
 *   - This module is the ARBITRATION half described in
 *     4__AFIP_Mission_Executive.md §0/§3.3: architecturally distinct
 *     from the Mission Executive (the proposer) so the function
 *     proposing an action is never the same function approving it.
 *     It never generates its own proposal from scratch — it only
 *     accepts, modifies, or rejects what Mission Executive proposed,
 *     against deterministic constraint checks and Risk Engine output.
 *   - Rule-based only. No ML, no LLM inference, no randomness.
 *   - Candidate intents: the Mission Executive's proposal, and (per
 *     §6.4) any current operator command, treated as competing
 *     proposals decided "on the merits of the constraint check alone"
 *     — neither is given automatic priority because the situation is
 *     urgent. Where both pass every constraint check, this
 *     implementation deterministically prefers the more conservative
 *     of the two (documented tie-break; the source docs leave the
 *     exact tie-break rule open, see Mission Executive doc §6.4).
 *   - Fail-closed (§6.3): if the Mission Executive's proposal or the
 *     World State needed to arbitrate it is unavailable, the proposal
 *     is treated as rejected by default and the safest constrained
 *     fallback is substituted.
 *   - Confidence propagation: decision confidence is the weakest-link
 *     of (a) the Mission Executive's own justification confidence and
 *     (b) this cycle's Risk Engine overall confidence — mirroring the
 *     weakest-link discipline already used by Health/Mission Executive,
 *     never averaged.
 *   - After arbitrating, calls
 *     AFIP.MissionExecutive.recordArbitrationOutcome(...) so the next
 *     Mission Executive cycle's Active Intent Register and
 *     last-cycle-outcome continuity state (§3.2, §2 step 10) are kept
 *     current — this is the one place Decision Engine is allowed to
 *     write back into Mission Executive, and it is continuity state,
 *     never a Belief Field.
 *   - Publishes AFIP.MissionState (Mission Executive panel /
 *     simulator-facing state machine label) and AFIP.IntentType (the
 *     advisory intent handed toward the Simulator Guidance Interface),
 *     both already declared as shared enums in afip-core.js.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  var Proposal = (AFIP.MissionExecutive && AFIP.MissionExecutive.Proposal) ||
    { CONTINUE: 'CONTINUE', ADJUST: 'ADJUST', HOLD: 'HOLD', DIVERT: 'DIVERT', ABORT_RTB: 'ABORT_RTB' };
  var Phase = (AFIP.MissionExecutive && AFIP.MissionExecutive.Phase) || {};

  var CONSERVATISM_ORDER = [Proposal.CONTINUE, Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB];
  function conservatismRank(p) { var i = CONSERVATISM_ORDER.indexOf(p); return i === -1 ? 0 : i; }
  function moreConservative(a, b) { return conservatismRank(a) >= conservatismRank(b) ? a : b; }

  function fed(leaf) { return !!leaf && leaf.value !== null && leaf.value !== undefined; }

  /** Map an operator RUN/PAUSE command onto the same fixed proposal categories the Mission Executive uses, so both are comparable (§6.4). */
  function operatorProposalFromWorldState(worldState) {
    var cmd = worldState.Operator && worldState.Operator.CurrentCommand;
    if (!cmd || cmd.value === null) return null;
    return cmd.value === 'PAUSE' ? Proposal.HOLD : Proposal.CONTINUE;
  }

  /**
   * Phase 10 integration point: a structured request submitted via
   * AFIP.OperatorCommands.submit() is a more specific, explicit
   * expression of operator intent than the coarse RUN/PAUSE signal
   * WorldState derives from Mission.Status.Playing, so it takes
   * precedence when one is pending — but both still enter arbitration
   * on equal footing exactly as before (§6.4); this only changes which
   * candidate is offered, never how it is checked or arbitrated. Falls
   * back to the original WorldState-derived signal unchanged when no
   * structured request is pending, so existing behavior is preserved.
   */
  function operatorProposal(worldState) {
    var pending = AFIP.OperatorCommands && AFIP.OperatorCommands.getLatest && AFIP.OperatorCommands.getLatest();
    if (pending && pending.mappedProposal) return pending.mappedProposal;
    return operatorProposalFromWorldState(worldState);
  }

  /**
   * Deterministic constraint check: does this proposal have what it
   * needs in the World State to be executable at all? Never a fresh
   * judgment about risk (that belongs to Mission Executive/Risk Engine)
   * — purely "is this candidate structurally executable right now".
   */
  function constraintCheck(proposal, worldState) {
    var violations = [];
    if (proposal === Proposal.DIVERT) {
      var sites = worldState.Navigation.AlternateLandingSites;
      if (!sites || sites.length === 0) {
        violations.push('DIVERT requires Navigation.AlternateLandingSites, none available');
      }
    }
    if (proposal === Proposal.CONTINUE || proposal === Proposal.ADJUST) {
      var geofence = worldState.Navigation.Geofence;
      if (fed(geofence) && geofence.value && geofence.value.breached === true) {
        violations.push('Navigation.Geofence breached — CONTINUE/ADJUST not permitted');
      }
    }
    return { valid: violations.length === 0, violations: violations };
  }

  /** If a candidate fails its constraint check, step down the conservatism ladder until one passes (ABORT_RTB always passes — it has no positive-data requirement). */
  function downgradeUntilValid(proposal, worldState) {
    var idx = conservatismRank(proposal);
    for (var i = idx; i < CONSERVATISM_ORDER.length; i++) {
      var candidate = CONSERVATISM_ORDER[i] === proposal ? proposal : moreConservative(proposal, CONSERVATISM_ORDER[i]);
      candidate = CONSERVATISM_ORDER[i];
      var check = constraintCheck(candidate, worldState);
      if (check.valid) return { proposal: candidate, downgraded: candidate !== proposal, violations: [] };
    }
    return { proposal: Proposal.ABORT_RTB, downgraded: true, violations: ['No candidate passed constraint check; forced to most conservative fallback'] };
  }

  /** Map a §4.1 proposal + current Mission Phase onto the shared AFIP.MissionState enum (simulator/panel-facing). */
  function toMissionState(proposal, missionPhase, riskTier) {
    switch (proposal) {
      case Proposal.CONTINUE:
        if (missionPhase === Phase.CRUISE) return AFIP.MissionState.CRUISE;
        if (missionPhase === Phase.TRANSITION_OUT || missionPhase === Phase.TRANSITION_IN) return AFIP.MissionState.TRANSITION;
        if (missionPhase === Phase.MISSION_COMPLETE) return AFIP.MissionState.MISSION_COMPLETE;
        return AFIP.MissionState.CONTINUE;
      case Proposal.ADJUST:
        return AFIP.MissionState.SLOW_DOWN;
      case Proposal.HOLD:
        return AFIP.MissionState.HOVER;
      case Proposal.DIVERT:
        return AFIP.MissionState.RE_ROUTE;
      case Proposal.ABORT_RTB:
        return riskTier === 'CRITICAL' ? AFIP.MissionState.EMERGENCY_LAND : AFIP.MissionState.RETURN_HOME;
      default:
        return AFIP.MissionState.HOVER;
    }
  }

  /** Map a §4.1 proposal onto the shared AFIP.IntentType enum (advisory intent toward the Simulator Guidance Interface). */
  function toIntentType(proposal, triggeringDomains) {
    switch (proposal) {
      case Proposal.CONTINUE: return AFIP.IntentType.CONTINUE_MISSION;
      case Proposal.ADJUST:
        return (triggeringDomains && triggeringDomains.indexOf('navigation') !== -1) ? AFIP.IntentType.ADJUST_ROUTE : AFIP.IntentType.REDUCE_CRUISE_SPEED;
      case Proposal.HOLD: return AFIP.IntentType.HOLD_POSITION;
      case Proposal.DIVERT: return AFIP.IntentType.DIVERT;
      case Proposal.ABORT_RTB: return AFIP.IntentType.RETURN_TO_BASE;
      default: return AFIP.IntentType.HOLD_POSITION;
    }
  }

  function DecisionEngine() {
    this._lastOutput = null;
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [missionExecutiveOutput] - falls back to AFIP.MissionExecutive.getLatest()
   * @param {object} [riskAssessment] - falls back to AFIP.RiskEngine.getLatest()
   * @returns {object} Arbitration result — the only path a Mission Executive proposal has to the Simulator Guidance Interface (Mission Executive doc §0, §9).
   */
  DecisionEngine.prototype.update = function (worldState, missionExecutiveOutput, riskAssessment) {
    if (!worldState) return null;
    var me = missionExecutiveOutput || (AFIP.MissionExecutive && AFIP.MissionExecutive.getLatest());
    var risk = riskAssessment || (AFIP.RiskEngine && AFIP.RiskEngine.getLatest());
    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    // Fail-closed: no Mission Executive proposal this cycle -> treated as rejected by default (§6.3).
    if (!me || !me.proposedIntent) {
      var fallback = { proposal: Proposal.HOLD, branch: 'ME_PROPOSAL_UNAVAILABLE_FAIL_CLOSED', triggeringDomains: [] };
      var missionState0 = toMissionState(fallback.proposal, null, risk && risk.overallRisk && risk.overallRisk.tier);
      var result0 = {
        timestamp: ts, frame: frame, cycle: worldState.cycle,
        result: 'rejected', acceptedProposal: fallback.proposal,
        missionState: missionState0, intentType: toIntentType(fallback.proposal, []),
        confidence: 0, conflicts: ['Mission Executive proposal unavailable this cycle'],
        source: 'FAIL_CLOSED'
      };
      this._lastOutput = result0;
      if (AFIP.MissionExecutive) AFIP.MissionExecutive.recordArbitrationOutcome(fallback.proposal, 'rejected', worldState.cycle);
      AFIP.bus.emit('evidence:batch', [{ source: 'decision-engine', field: 'Decision.Arbitration', value: result0, timestamp: ts, frame: frame }]);
      AFIP.bus.emit('decision-engine:decision', result0);
      return result0;
    }

    var mePropCheck = downgradeUntilValid(me.proposedIntent, worldState);

    var opProp = operatorProposal(worldState);
    var finalProposal = mePropCheck.proposal;
    var conflicts = [];
    if (mePropCheck.downgraded) conflicts.push('Mission Executive proposal (' + me.proposedIntent + ') failed constraint check; downgraded to ' + mePropCheck.proposal);

    if (opProp && opProp !== me.proposedIntent) {
      var opCheck = downgradeUntilValid(opProp, worldState);
      conflicts.push('Operator command implies ' + opProp + '; Mission Executive proposed ' + me.proposedIntent);
      // Neither is given automatic priority (§6.4) — deterministic
      // conservative tie-break between the two constraint-valid candidates.
      finalProposal = moreConservative(mePropCheck.proposal, opCheck.proposal);
    }

    var result;
    if (finalProposal === me.proposedIntent && !mePropCheck.downgraded) result = 'accepted';
    else result = 'modified';

    // Weakest-link confidence propagation: ME justification confidence x Risk Engine confidence.
    var meDomains = me.justification && me.justification.domains;
    var meConfidences = meDomains ? Object.keys(meDomains).map(function (k) { return meDomains[k].confidence || 0; }) : [0];
    var meConfidence = Math.min.apply(null, meConfidences);
    var riskConfidence = (risk && typeof risk.confidence === 'number') ? risk.confidence : 0.3;
    var decisionConfidence = Math.round(Math.min(meConfidence, riskConfidence) * 100) / 100;

    var missionState = toMissionState(finalProposal, me.missionPhase, risk && risk.overallRisk && risk.overallRisk.tier);
    var intentType = toIntentType(finalProposal, me.justification && me.justification.triggeringDomains);

    var output = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      proposedByMissionExecutive: me.proposedIntent,
      result: result,
      acceptedProposal: finalProposal,
      missionState: missionState,
      intentType: intentType,
      confidence: decisionConfidence,
      conflicts: conflicts,
      constraintViolations: mePropCheck.violations,
      source: opProp && opProp !== me.proposedIntent ? 'ME_AND_OPERATOR_ARBITRATED' : 'MISSION_EXECUTIVE'
    };

    this._lastOutput = output;

    if (AFIP.MissionExecutive) {
      AFIP.MissionExecutive.recordArbitrationOutcome(finalProposal, result, worldState.cycle);
    }
    // Phase 10: consume the structured Operator Commands request (if this
    // cycle's opProp came from one) so it is arbitrated exactly once.
    if (AFIP.OperatorCommands && AFIP.OperatorCommands.getLatest && AFIP.OperatorCommands.getLatest()) {
      AFIP.OperatorCommands.acknowledge(finalProposal === opProp ? 'ACCEPTED' : 'ARBITRATED');
    }

    AFIP.bus.emit('evidence:batch', [
      { source: 'decision-engine', field: 'Decision.MissionState', value: missionState, timestamp: ts, frame: frame },
      { source: 'decision-engine', field: 'Decision.IntentType', value: intentType, timestamp: ts, frame: frame },
      { source: 'decision-engine', field: 'Decision.Confidence', value: decisionConfidence, timestamp: ts, frame: frame },
      { source: 'decision-engine', field: 'Decision.Arbitration', value: output, timestamp: ts, frame: frame }
    ]);
    AFIP.bus.emit('decision-engine:decision', output);

    return output;
  };

  /** @returns {object|null} the most recent arbitration result. */
  DecisionEngine.prototype.getLatest = function () {
    return this._lastOutput;
  };

  AFIP.DecisionEngine = AFIP.DecisionEngine || new DecisionEngine();
})(typeof window !== 'undefined' ? window : globalThis);
