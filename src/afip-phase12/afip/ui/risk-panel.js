/**
 * AFIP UI :: Risk Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.RiskEngine into its panel in the Operator
 * Control Station. Read-only with respect to simulator rendering —
 * this file never touches Three.js, the scene graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'risk-engine:assessment' (Phase
 * 11 addendum in risk-engine.js) only. Never calls
 * AFIP.RiskEngine.update() or reads World State directly.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function RiskPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['risk-engine:assessment']);
  }
  RiskPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  RiskPanel.prototype.constructor = RiskPanel;

  var CATEGORIES = [
    ['missionRisk', 'Mission'], ['collisionRisk', 'Collision'], ['powerRisk', 'Power'],
    ['communicationRisk', 'Communication'], ['navigationRisk', 'Navigation']
  ];

  /**
   * Re-render this panel from the latest Risk Assessment.
   * @param {object} data - Output of AFIP.RiskEngine.update(worldState, health, prediction).
   */
  RiskPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Risk Engine');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no assessment yet', 'UNKNOWN')); return; }

    body.appendChild(AFIP.UI.row('Overall risk', data.overallRisk ? data.overallRisk.tier : 'unknown', data.overallRisk ? data.overallRisk.tier : 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('Overall score', data.overallRisk && typeof data.overallRisk.score === 'number' ? data.overallRisk.score : 'unknown'));
    body.appendChild(AFIP.UI.row('Confidence', AFIP.UI.formatConfidence(data.confidence)));

    CATEGORIES.forEach(function (pair) {
      var cat = data[pair[0]];
      body.appendChild(AFIP.UI.row(pair[1], cat ? cat.tier + ' (' + cat.score + ')' : 'unknown', cat ? cat.tier : 'UNKNOWN'));
    });

    if (data.recommendedMitigation && data.recommendedMitigation.length) {
      body.appendChild(AFIP.UI.row('Mitigation', data.recommendedMitigation.length + ' recommendation(s)', 'WARNING'));
      data.recommendedMitigation.forEach(function (m) {
        body.appendChild(AFIP.UI.row('  · ' + (m.basis || ''), m.action || ''));
      });
    }
  };

  AFIP.UI.RiskPanel = RiskPanel;
})(typeof window !== 'undefined' ? window : globalThis);
