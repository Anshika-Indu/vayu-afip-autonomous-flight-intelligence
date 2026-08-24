/**
 * AFIP UI :: Mission Executive Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.MissionExecutive into its panel in the Operator
 * Control Station. Read-only with respect to simulator rendering —
 * this file never touches Three.js, the scene graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'mission-executive:proposal' only.
 * Never calls AFIP.MissionExecutive.update() or reads World State
 * directly.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function MissionPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['mission-executive:proposal']);
  }
  MissionPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  MissionPanel.prototype.constructor = MissionPanel;

  /**
   * Re-render this panel from the latest Mission Executive proposal.
   * @param {object} data - Output of AFIP.MissionExecutive.update(worldState, health, prediction).
   */
  MissionPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Mission Executive');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no proposal yet', 'UNKNOWN')); return; }

    body.appendChild(AFIP.UI.row('Mission phase', data.missionPhase, 'INFO'));
    body.appendChild(AFIP.UI.row('Executive posture', data.executivePosture, data.executivePosture));
    body.appendChild(AFIP.UI.row('Proposed intent', data.proposedIntent, data.proposedIntent === 'ABORT_RTB' ? 'CRITICAL' : data.proposedIntent === 'CONTINUE' ? 'NOMINAL' : 'CAUTION'));

    var j = data.justification;
    if (j) {
      body.appendChild(AFIP.UI.row('Precedence branch', j.branch));
      if (j.domains) {
        Object.keys(j.domains).forEach(function (key) {
          var d = j.domains[key];
          body.appendChild(AFIP.UI.row('Domain: ' + key, d.status, d.status));
        });
      }
      if (j.faulted) {
        body.appendChild(AFIP.UI.row('Fault', j.faultMessage || 'Mission Executive fault this cycle', 'CRITICAL'));
      }
    }
  };

  AFIP.UI.MissionPanel = MissionPanel;
})(typeof window !== 'undefined' ? window : globalThis);
