/**
 * AFIP UI :: Decision Console
 * ---------------------------------------------------------------------
 * Renders output from AFIP.DecisionEngine into its panel in the Operator
 * Control Station. Read-only with respect to simulator rendering —
 * this file never touches Three.js, the scene graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'decision-engine:decision' only.
 * Never calls AFIP.DecisionEngine.update() or reads World State
 * directly. This console displays arbitration outcomes; it does not
 * arbitrate anything itself.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function DecisionConsole(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['decision-engine:decision']);
  }
  DecisionConsole.prototype = Object.create(AFIP.UI.Panel.prototype);
  DecisionConsole.prototype.constructor = DecisionConsole;

  /**
   * Re-render this console from the latest arbitration result.
   * @param {object} data - Output of AFIP.DecisionEngine.update(worldState, missionExecutive, risk).
   */
  DecisionConsole.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Decision Console');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no decision yet', 'UNKNOWN')); return; }

    body.appendChild(AFIP.UI.row('Result', data.result, data.result));
    body.appendChild(AFIP.UI.row('Accepted proposal', data.acceptedProposal, data.acceptedProposal === 'ABORT_RTB' ? 'CRITICAL' : 'INFO'));
    body.appendChild(AFIP.UI.row('Mission state', data.missionState, data.missionState));
    body.appendChild(AFIP.UI.row('Intent type', data.intentType));
    body.appendChild(AFIP.UI.row('Confidence', AFIP.UI.formatConfidence(data.confidence)));
    body.appendChild(AFIP.UI.row('Source', data.source));

    if (data.conflicts && data.conflicts.length) {
      body.appendChild(AFIP.UI.row('Conflicts', data.conflicts.length, 'WARNING'));
      data.conflicts.forEach(function (c) { body.appendChild(AFIP.UI.row('  ·', c)); });
    }
    if (data.constraintViolations && data.constraintViolations.length) {
      body.appendChild(AFIP.UI.row('Constraint violations', data.constraintViolations.length, 'CRITICAL'));
    }
  };

  AFIP.UI.DecisionConsole = DecisionConsole;
})(typeof window !== 'undefined' ? window : globalThis);
