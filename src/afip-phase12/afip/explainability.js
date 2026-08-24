/**
 * AFIP :: Explainability Engine
 * ---------------------------------------------------------------------
 * Purpose
 *   Provide complete reasoning transparency. No autonomous decision may appear without an explanation: Decision -> Reason -> Evidence Used -> Confidence -> Alternative Actions -> Expected Outcome -> Operator Impact.
 *
 * Inputs
 *   - Decisions
 *   - Evidence
 *   - World State
 *   - Risk
 *
 * Outputs
 *   - Human-readable explanations
 *   - Decision audit
 *   - Traceability
 *
 * Dependencies
 *   - All reasoning modules
 *
 * Display
 *   Explainability panel
 *
 * Update frequency
 *   On every decision event
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 9 — Explainability Engine).
 *
 * Design notes (per 7__AFIP_Explainability_Engine.md)
 *   - Pure renderer, not a reasoning process (§5): every value in the
 *     rendered explanation is copied from the Mission Executive
 *     justification set / Decision Engine arbitration result, never
 *     computed fresh here. This module never introduces a judgment
 *     upstream reasoning didn't already make.
 *   - Fixed six-part output shape (§4), matching AFIP.ExplanationShape
 *     already declared in afip-core.js: decision, reason,
 *     evidenceUsed, confidence, alternativesConsidered,
 *     expectedOutcome, operatorImpact.
 *   - Template selection (§7) is a lookup keyed by (proposal category,
 *     triggering precedence branch), not a generative choice.
 *   - §5 Stage 9 gap handling: a SUSPENDED-posture / faulted cycle
 *     renders the gap itself, never a fabricated plausible reasoning.
 *   - §6: confidence is never invented — copied from the Mission
 *     Executive's already-computed domain confidences and the
 *     Decision Engine's already-computed decision confidence. An
 *     UNKNOWN domain is rendered as "unknown", never softened into a
 *     low number (§6.5).
 *   - §8 Alert System: priority derived deterministically from
 *     proposal category + Arbitration outcome, never from the XE's own
 *     judgment about operator workload. No silent downgrade; rejected
 *     and modified outcomes are never Information priority.
 *   - §9 Mission Timeline Integration: every explanation is anchored by
 *     (cycle/Snapshot version, Mission Phase State) and handed to
 *     mission-timeline.js via the bus, which is Layer E's Record
 *     function per the Architecture doc — the XE does not keep a
 *     second independent history.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  var Proposal = (AFIP.MissionExecutive && AFIP.MissionExecutive.Proposal) ||
    { CONTINUE: 'CONTINUE', ADJUST: 'ADJUST', HOLD: 'HOLD', DIVERT: 'DIVERT', ABORT_RTB: 'ABORT_RTB' };

  var ALL_PROPOSALS_BY_POSTURE = {
    NOMINAL: [Proposal.CONTINUE, Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
    CAUTIOUS: [Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
    MINIMAL: [Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB],
    SUSPENDED: []
  };

  /** §7: fixed (proposal, branch) -> template lookup. Falls back to a generic template for branches not covered by name in the design doc's five worked examples. */
  function selectTemplate(proposal, branch) {
    if (proposal === Proposal.ABORT_RTB && branch === 'CRITICAL_SAFETY') return 'RETURN_HOME_CRITICAL';
    if (proposal === Proposal.ABORT_RTB && branch === 'CRITICAL_MISSION') return 'MISSION_ABORT_RISK';
    if (proposal === Proposal.ADJUST) return 'ADJUST_DEGRADED';
    if (proposal === Proposal.HOLD && (branch === 'UNKNOWN_DOMAIN_FALLBACK' || branch === 'EXECUTIVE_FAULT_MINIMAL_SAFE')) return 'HOLD_CONSERVATIVE_FALLBACK';
    if (proposal === Proposal.DIVERT) return 'DIVERT';
    if (proposal === Proposal.CONTINUE) return 'CONTINUE_NOMINAL';
    return 'GENERIC';
  }

  /** §8 alert priority table — deterministic, no silent downgrade, rejected/modified never Information. */
  function assignPriority(proposal, branch, posture, arbitrationResult) {
    if (posture === 'SUSPENDED') return 'EMERGENCY';
    if (arbitrationResult === 'rejected' && (branch === 'CRITICAL_SAFETY' || branch === 'CRITICAL_MISSION')) return 'EMERGENCY';
    if (proposal === Proposal.DIVERT || (proposal === Proposal.ABORT_RTB && (branch === 'CRITICAL_SAFETY' || branch === 'CRITICAL_MISSION'))) return 'CRITICAL';
    if (proposal === Proposal.ADJUST || branch === 'UNKNOWN_DOMAIN_FALLBACK') return 'WARNING';
    if (arbitrationResult === 'modified' || arbitrationResult === 'rejected') return 'WARNING';
    return 'INFORMATION';
  }

  function domainConfidenceDisplay(domain) {
    if (!domain) return 'unknown';
    return domain.status === 'UNKNOWN' ? 'unknown' : domain.confidence;
  }

  /** §4.2 Reasoning — rendered strictly from the justification reference set, in evaluation order. */
  function renderReason(meJustification, template) {
    if (meJustification && meJustification.faulted) {
      return ['No standard justification available: Mission Executive posture is SUSPENDED; minimal safe proposal substituted per phase-based fallback rule (§6.2).', meJustification.faultMessage ? ('Fault: ' + meJustification.faultMessage) : null].filter(Boolean);
    }
    if (!meJustification) return ['No Mission Executive justification available this cycle.'];
    var domains = meJustification.domains || {};
    var lines = [];
    meJustification.triggeringDomains.forEach(function (key) {
      var d = domains[key];
      if (!d) return;
      (d.reasons || []).forEach(function (r) { lines.push('[' + key + '] ' + r); });
    });
    if (lines.length === 0) {
      lines.push('All domains nominal; precedence branch=' + meJustification.branch + '.');
    }
    if (meJustification.compoundedDomains && meJustification.compoundedDomains.length) {
      lines.push('Compounded risk elevated: ' + meJustification.compoundedDomains.join(', ') + ' (§5.3).');
    }
    return lines;
  }

  /** §4.4 Supporting Evidence — Belief Fields cited, each with value/confidence/freshness together, never bare. */
  function renderEvidence(meJustification) {
    if (!meJustification || !meJustification.domains) return [];
    var domains = meJustification.domains;
    return Object.keys(domains).map(function (key) {
      var d = domains[key];
      return {
        domain: key,
        status: d.status,
        confidence: domainConfidenceDisplay(d),
        classificationTag: d.compounded ? 'advisory-derived (compounded)' : 'deterministic',
        basis: d.reasons
      };
    });
  }

  /** §4.5 Alternative Actions — every category structurally reachable under current posture, each labeled why it wasn't selected. Never lists a posture-excluded option as if it competed on the merits. */
  function renderAlternatives(selected, posture, branch) {
    var reachable = ALL_PROPOSALS_BY_POSTURE[posture] || [];
    var all = [Proposal.CONTINUE, Proposal.ADJUST, Proposal.HOLD, Proposal.DIVERT, Proposal.ABORT_RTB];
    return all.filter(function (p) { return p !== selected; }).map(function (p) {
      if (reachable.indexOf(p) === -1) {
        return { proposal: p, ruledOutBy: 'not structurally available', detail: 'Executive Posture ' + posture + ' excludes this category (§1.2).' };
      }
      return { proposal: p, ruledOutBy: 'ruled out by precedence', detail: 'Precedence branch ' + branch + ' selected ' + selected + ' first (§2 step 6).' };
    });
  }

  function expectedOutcomeFor(missionState, arbitrationResult) {
    var byState = {
      CONTINUE: 'Mission activity proceeds as currently planned.', CRUISE: 'Aircraft continues cruise segment as planned.',
      TRANSITION: 'Aircraft continues through the current transition segment.', SLOW_DOWN: 'Cruise envelope reduced; mission continues at a conservative pace.',
      RE_ROUTE: 'Aircraft proceeds via the modified route / alternate site.', HOVER: 'Aircraft holds position at current safe state pending re-evaluation.',
      RETURN_HOME: 'Aircraft returns to base; current mission activity is terminated.', EMERGENCY_LAND: 'Aircraft proceeds to the nearest ranked candidate landing site.',
      MISSION_COMPLETE: 'Mission activity concluded.'
    };
    var base = byState[missionState] || 'Outcome depends on Arbitration result.';
    if (arbitrationResult === 'rejected') return 'Proposal was rejected by Arbitration — prior Active Intent remains in effect instead. ' + base;
    if (arbitrationResult === 'modified') return 'Proposal was modified by Arbitration before taking effect. ' + base;
    return base;
  }

  function operatorImpactFor(priority, template) {
    var byPriority = {
      INFORMATION: 'No operator action required; logged to timeline.',
      WARNING: 'Visible, non-blocking notification; review recommended.',
      CRITICAL: 'Requires operator acknowledgment; full reasoning shown by default.',
      EMERGENCY: 'Highest-priority interrupt; cannot be auto-dismissed. Investigate the stated gap or condition immediately.'
    };
    var msg = byPriority[priority] || byPriority.WARNING;
    if (template === 'HOLD_CONSERVATIVE_FALLBACK') msg += ' This represents AFIP explicitly not knowing, rather than knowing something specific and concerning.';
    return msg;
  }

  function ExplainabilityEngine() {
    this._lastOutput = null;
    this._history = []; // Mission Timeline anchor log (bounded)
  }

  /**
   * @param {object} worldState - Immutable World State Snapshot.
   * @param {object} [missionExecutiveOutput] - falls back to AFIP.MissionExecutive.getLatest()
   * @param {object} [decisionEngineOutput] - falls back to AFIP.DecisionEngine.getLatest()
   * @returns {object} Explanation conforming to AFIP.ExplanationShape, plus alert priority and timeline anchor.
   */
  ExplainabilityEngine.prototype.update = function (worldState, missionExecutiveOutput, decisionEngineOutput) {
    if (!worldState) return null;
    var me = missionExecutiveOutput || (AFIP.MissionExecutive && AFIP.MissionExecutive.getLatest());
    var decision = decisionEngineOutput || (AFIP.DecisionEngine && AFIP.DecisionEngine.getLatest());
    var ts = worldState.Mission.Clock.value;
    var frame = worldState.lastFrame;

    if (!me || !decision) {
      var gap = {
        decision: 'UNAVAILABLE', reason: ['No Mission Executive proposal and/or Decision Engine arbitration available this cycle — gap recorded, not fabricated (§5 Stage 9).'],
        evidenceUsed: [], confidence: 'unknown', alternativesConsidered: [], expectedOutcome: 'Unknown — no decision to project an outcome from.',
        operatorImpact: 'Investigate why the reasoning pipeline did not complete this cycle.'
      };
      var gapOutput = { timestamp: ts, frame: frame, cycle: worldState.cycle, explanation: gap, priority: 'EMERGENCY', template: 'GAP', missionPhase: null, posture: null };
      this._lastOutput = gapOutput;
      AFIP.bus.emit('evidence:batch', [{ source: 'explainability', field: 'Explainability.Gap', value: gapOutput, timestamp: ts, frame: frame }]);
      AFIP.bus.emit('explainability:explanation', gapOutput);
      return gapOutput;
    }

    var justification = me.justification || {};
    var branch = justification.branch;
    var posture = me.executivePosture;
    var template = selectTemplate(decision.acceptedProposal, branch);
    var priority = assignPriority(decision.acceptedProposal, branch, posture, decision.result);

    var decisionSummary = 'Proposed: ' + me.proposedIntent + '. Outcome: ' + decision.result + (decision.result === 'modified' ? ' (accepted as ' + decision.acceptedProposal + ')' : '') + '.';

    var explanation = {
      decision: decisionSummary,
      reason: renderReason(justification, template),
      evidenceUsed: renderEvidence(justification),
      confidence: {
        domains: justification.domains ? Object.keys(justification.domains).reduce(function (acc, k) { acc[k] = domainConfidenceDisplay(justification.domains[k]); return acc; }, {}) : {},
        decision: decision.confidence,
        distinguishesAdvisory: !!(justification.compoundedDomains && justification.compoundedDomains.length)
      },
      alternativesConsidered: renderAlternatives(decision.acceptedProposal, posture, branch),
      expectedOutcome: expectedOutcomeFor(decision.missionState, decision.result),
      operatorImpact: operatorImpactFor(priority, template)
    };

    var output = {
      timestamp: ts, frame: frame, cycle: worldState.cycle,
      explanation: explanation, priority: priority, template: template,
      missionPhase: me.missionPhase, posture: posture,
      snapshotVersion: worldState.cycle
    };

    this._lastOutput = output;
    this._history.push({ cycle: worldState.cycle, missionPhase: me.missionPhase, posture: posture, priority: priority, decision: decisionSummary, timestamp: ts });
    if (this._history.length > 500) this._history.shift();

    AFIP.bus.emit('evidence:batch', [
      { source: 'explainability', field: 'Explainability.Explanation', value: explanation, timestamp: ts, frame: frame },
      { source: 'explainability', field: 'Explainability.Priority', value: priority, timestamp: ts, frame: frame }
    ]);
    // §9: hand off to the Mission Timeline (Layer E Record function) — one-way, XE keeps no second independent history beyond this bounded local log for getHistory().
    AFIP.bus.emit('explainability:explanation', output);
    if (AFIP.MissionTimeline && typeof AFIP.MissionTimeline.record === 'function') {
      AFIP.MissionTimeline.record(output);
    }

    return output;
  };

  /** @returns {object|null} the most recent rendered explanation. */
  ExplainabilityEngine.prototype.getLatest = function () {
    return this._lastOutput;
  };

  /** @returns {object[]} bounded local timeline-anchor log, for UI/dashboard consumption ahead of full Mission Timeline integration. */
  ExplainabilityEngine.prototype.getHistory = function () {
    return this._history.slice();
  };

  AFIP.ExplainabilityEngine = AFIP.ExplainabilityEngine || new ExplainabilityEngine();
})(typeof window !== 'undefined' ? window : globalThis);
