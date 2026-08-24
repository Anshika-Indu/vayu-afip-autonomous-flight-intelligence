/**
 * AFIP :: Operator Commands
 * ---------------------------------------------------------------------
 * Purpose
 *   Normalize operator UI interactions into structured mission intent requests. Operator commands follow the same validation pipeline as autonomous decisions.
 *
 * Inputs
 *   - UI actions
 *
 * Outputs
 *   - Structured command requests
 *
 * Dependencies
 *   - Mission Planner
 *
 * Display
 *   Implicit, via existing controls and decision history
 *
 * Update frequency
 *   On user interaction
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 10 — Operator Commands).
 *
 * Design notes
 *   - Deterministic handling for the seven named commands (Start,
 *     Pause, Resume, Abort, Return To Launch, Hold Position, Emergency
 *     Land). Each is mapped onto the Mission Executive's own fixed
 *     §4.1 proposal categories (Continue/Adjust/Hold/Divert/Abort-RTB)
 *     — the only categories the rest of the pipeline knows how to
 *     arbitrate — never a new, uncoordinated category invented here.
 *     Abort/Return-To-Launch/Emergency-Land all map to ABORT_RTB: per
 *     the Mission Executive design doc §4.1 there is exactly one
 *     abort-class proposal, and Decision Engine (Phase 8) is what
 *     already discriminates RETURN_HOME vs EMERGENCY_LAND downstream,
 *     from risk tier, not from operator label — this module does not
 *     override that.
 *   - submit() ONLY produces a structured, timestamped request object
 *     and puts it on a single-slot queue. It never mutates World
 *     State, aircraft state, or any other module's state directly —
 *     it is consumed exactly like the existing operator-intent signal
 *     already was: decision-engine.js's operatorProposal() reads it
 *     (preferring a submitted command over the coarser
 *     Operator.CurrentCommand RUN/PAUSE derivation when one is
 *     pending), then decision-engine.js's existing constraint-check /
 *     arbitration path handles it exactly as it already handles any
 *     other candidate proposal — no new bypass is introduced.
 *   - update() is a no-op read (matches the existing per-cycle loop
 *     convention) — the module's real entry point is submit(), called
 *     "on user interaction" per the spec.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  var Command = {
    START_MISSION: 'START_MISSION', PAUSE_MISSION: 'PAUSE_MISSION', RESUME_MISSION: 'RESUME_MISSION',
    ABORT_MISSION: 'ABORT_MISSION', RETURN_TO_LAUNCH: 'RETURN_TO_LAUNCH',
    HOLD_POSITION: 'HOLD_POSITION', EMERGENCY_LAND: 'EMERGENCY_LAND'
  };

  function proposalFor(command) {
    var Proposal = (AFIP.MissionExecutive && AFIP.MissionExecutive.Proposal) ||
      { CONTINUE: 'CONTINUE', ADJUST: 'ADJUST', HOLD: 'HOLD', DIVERT: 'DIVERT', ABORT_RTB: 'ABORT_RTB' };
    switch (command) {
      case Command.START_MISSION: return Proposal.CONTINUE;
      case Command.RESUME_MISSION: return Proposal.CONTINUE;
      case Command.PAUSE_MISSION: return Proposal.HOLD;
      case Command.HOLD_POSITION: return Proposal.HOLD;
      case Command.ABORT_MISSION: return Proposal.ABORT_RTB;
      case Command.RETURN_TO_LAUNCH: return Proposal.ABORT_RTB;
      case Command.EMERGENCY_LAND: return Proposal.ABORT_RTB;
      default: return null;
    }
  }

  function OperatorCommands() {
    this._pending = null;   // single-slot structured request, consumed by Decision Engine
    this._history = [];
  }

  /**
   * Normalize a UI action into a structured, timestamped command
   * request. Generates a request only — never changes aircraft or
   * World State directly.
   * @param {string} command - one of AFIP.OperatorCommands.Command
   * @param {number} [cycle] - current World State cycle, for traceability
   * @returns {object|null} the structured request, or null if the command name is invalid.
   */
  OperatorCommands.prototype.submit = function (command, cycle) {
    var proposal = proposalFor(command);
    if (!proposal) {
      return null; // invalid/unknown command name — no request generated, no silent guess.
    }
    var request = {
      command: command,
      mappedProposal: proposal,
      cycle: typeof cycle === 'number' ? cycle : null,
      timestamp: Date.now(),
      status: 'PENDING'
    };
    this._pending = request;
    this._history.push(request);
    AFIP.bus.emit('operator-commands:request', request);
    return request;
  };

  /**
   * Read-only per-cycle hook, matching the other modules' update()
   * convention. This module's real entry point is submit(); update()
   * never changes state on its own.
   * @param {object} worldState - Immutable World State Snapshot.
   * @returns {object|null} the currently pending request, if any.
   */
  OperatorCommands.prototype.update = function (worldState) {
    return this._pending;
  };

  /** Called by the Decision Engine (or any consumer) once a pending request has been arbitrated, so the same request is not re-submitted every cycle. */
  OperatorCommands.prototype.acknowledge = function (result) {
    if (this._pending) {
      this._pending.status = result || 'CONSUMED';
      this._pending = null;
    }
  };

  /** @returns {object|null} the currently pending request without consuming it. */
  OperatorCommands.prototype.getLatest = function () {
    return this._pending;
  };

  /** @returns {object[]} full submitted-command history (immutable snapshot). */
  OperatorCommands.prototype.getHistory = function () {
    return this._history.slice();
  };

  AFIP.OperatorCommands = AFIP.OperatorCommands || new OperatorCommands();
  AFIP.OperatorCommands.Command = Command;
})(typeof window !== 'undefined' ? window : globalThis);
