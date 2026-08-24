/**
 * AFIP UI :: Health Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.HealthMonitor into its panel in the Operator
 * Control Station. Read-only with respect to simulator rendering —
 * this file never touches Three.js, the scene graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: this file never calls AFIP.HealthMonitor.update(),
 * never reads World State directly, and never mutates any AFIP.* module
 * state. It only subscribes to 'health-monitor:assessment' (see the
 * Phase 11 addendum in health-monitor.js) and renders whatever payload
 * arrives.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function HealthPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['health-monitor:assessment']);
  }
  HealthPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  HealthPanel.prototype.constructor = HealthPanel;

  /**
   * Re-render this panel from the latest Health Assessment.
   * @param {object} data - Output of AFIP.HealthMonitor.update(worldState).
   */
  HealthPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Health Monitor');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no assessment yet', 'UNKNOWN')); return; }

    body.appendChild(AFIP.UI.row('Overall score', data.overallHealthScore != null ? data.overallHealthScore : 'unknown', data.overallClassification));
    body.appendChild(AFIP.UI.row('Classification', data.overallClassification, data.overallClassification));
    body.appendChild(AFIP.UI.row('Confidence', AFIP.UI.formatConfidence(data.confidence)));

    if (data.subsystems) {
      Object.keys(data.subsystems).forEach(function (key) {
        var s = data.subsystems[key];
        body.appendChild(AFIP.UI.row(key, s && s.dataAvailable ? (s.score != null ? s.score : s.status) : 'AWAITING_SOURCE', s ? (s.status || 'UNKNOWN') : 'UNKNOWN'));
      });
    }
    if (data.missionReadiness) {
      body.appendChild(AFIP.UI.row('Mission readiness', data.missionReadiness.state, data.missionReadiness.state));
    }
    if (data.warningFlags && data.warningFlags.length) {
      body.appendChild(AFIP.UI.row('Warnings', data.warningFlags.length, 'WARNING'));
    }
  };

  AFIP.UI.HealthPanel = HealthPanel;
})(typeof window !== 'undefined' ? window : globalThis);
