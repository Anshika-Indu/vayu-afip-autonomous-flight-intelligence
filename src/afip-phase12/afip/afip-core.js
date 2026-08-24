/**
 * AFIP :: Core
 * ---------------------------------------------------------------------
 * Autonomous Flight Intelligence Platform — namespace root and shared
 * interfaces. Load this file first, before any other /afip/*.js file.
 *
 * AFIP philosophy (do not violate in any module):
 *   - AFIP never controls motors.
 *   - AFIP never computes physics.
 *   - AFIP never replaces the simulator.
 *   - AFIP observes, reasons, plans, explains, and proposes mission intent.
 *   - The simulator remains the sole source of truth for aircraft motion
 *     and the sole owner of the execution loop.
 *
 * Load order (see /afip/README.md for the full integration sequence):
 *   1. afip-core.js
 *   2. evidence-adapter.js
 *   3. world-state.js
 *   4. mission-planner.js, navigation.js, health-monitor.js,
 *      risk-engine.js, prediction-engine.js
 *   5. mission-executive.js
 *   6. decision-engine.js
 *   7. explainability.js
 *   8. mission-timeline.js
 *   9. operator-commands.js
 *  10. ui/*.js
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};

  /** Semantic version of the AFIP scaffold itself (not the mission). */
  AFIP.VERSION = '0.1.0-skeleton';

  /**
   * Mission intent AFIP may propose to the simulator. AFIP always emits
   * one of these — never a raw actuator command. See Integration Spec
   * §4.5 (Intent Mapping) for the corresponding simulator-side action.
   */
  AFIP.IntentType = Object.freeze({
    CONTINUE_MISSION: 'CONTINUE_MISSION',
    HOLD_POSITION: 'HOLD_POSITION',
    ADJUST_ROUTE: 'ADJUST_ROUTE',
    DIVERT: 'DIVERT',
    RETURN_TO_BASE: 'RETURN_TO_BASE',
    ABORT_MISSION: 'ABORT_MISSION',
    REDUCE_CRUISE_SPEED: 'REDUCE_CRUISE_SPEED',
    INCREASE_SAFETY_MARGIN: 'INCREASE_SAFETY_MARGIN'
  });

  /** Mission Executive decision states (Integration Spec Part 1). */
  AFIP.MissionState = Object.freeze({
    CONTINUE: 'CONTINUE',
    HOVER: 'HOVER',
    TRANSITION: 'TRANSITION',
    CRUISE: 'CRUISE',
    SLOW_DOWN: 'SLOW_DOWN',
    RE_ROUTE: 'RE_ROUTE',
    RETURN_HOME: 'RETURN_HOME',
    EMERGENCY_LAND: 'EMERGENCY_LAND',
    MISSION_COMPLETE: 'MISSION_COMPLETE'
  });

  /** Qualitative health/risk levels shared across Health and Risk modules. */
  AFIP.Severity = Object.freeze({
    NOMINAL: 'NOMINAL',
    CAUTION: 'CAUTION',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL'
  });

  /**
   * Shape contract for a single Evidence Record produced by the Evidence
   * Adapter. Not an enforced type (this is plain JS) — a documentation
   * contract every producer/consumer should honor.
   *
   * {
   *   source:    string,   // e.g. 'simulator.telemetry'
   *   field:     string,   // e.g. 'battery.percentage'
   *   value:     *,
   *   timestamp: number,   // ms, simulator clock
   *   frame:     number    // simulator frame index
   * }
   */
  AFIP.EvidenceRecordShape = Object.freeze([
    'source', 'field', 'value', 'timestamp', 'frame'
  ]);

  /**
   * Shape contract for a Decision Explanation, per Integration Spec §7.6.
   * Every autonomous or operator-triggered decision routed through the
   * Decision Engine must produce one of these via the Explainability
   * Engine before it reaches the Simulator Guidance Interface.
   *
   * {
   *   decision:            string,  // AFIP.MissionState / AFIP.IntentType
   *   reason:               string[],
   *   evidenceUsed:         object[], // Evidence Records cited
   *   confidence:           number,   // 0..1
   *   alternativesConsidered: string[],
   *   expectedOutcome:      string,
   *   operatorImpact:       string
   * }
   */
  AFIP.ExplanationShape = Object.freeze([
    'decision', 'reason', 'evidenceUsed', 'confidence',
    'alternativesConsidered', 'expectedOutcome', 'operatorImpact'
  ]);

  /**
   * Simple synchronous pub/sub used to wire the reasoning cycle together
   * without modules reaching into each other directly. Every module talks
   * to the World State snapshot and/or these events — nothing else.
   */
  AFIP.bus = (function () {
    var listeners = {};
    return {
      on: function (event, handler) {
        (listeners[event] = listeners[event] || []).push(handler);
      },
      emit: function (event, payload) {
        (listeners[event] || []).forEach(function (h) { h(payload); });
      }
    };
  })();

})(typeof window !== 'undefined' ? window : globalThis);
