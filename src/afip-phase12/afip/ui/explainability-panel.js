/**
 * AFIP UI :: Explainability Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.ExplainabilityEngine into its panel in the
 * Operator Control Station. Read-only with respect to simulator
 * rendering — this file never touches Three.js, the scene graph, or
 * the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'explainability:explanation' only.
 * Never calls AFIP.ExplainabilityEngine.update() or reads World State
 * directly. Renders the fixed six-part AFIP.ExplanationShape exactly as
 * produced — this panel does not re-summarize, re-rank, or otherwise
 * add judgment beyond formatting for display.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function ExplainabilityPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['explainability:explanation']);
  }
  ExplainabilityPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  ExplainabilityPanel.prototype.constructor = ExplainabilityPanel;

  /**
   * Re-render this panel from the latest rendered explanation.
   * @param {object} data - Output of AFIP.ExplainabilityEngine.update(worldState, missionExecutive, decision).
   */
  ExplainabilityPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Explainability');
    if (!body) return;
    if (!data || !data.explanation) { body.appendChild(AFIP.UI.row('Status', 'no explanation yet', 'UNKNOWN')); return; }

    var e = data.explanation;
    body.appendChild(AFIP.UI.row('Priority', data.priority, data.priority));
    body.appendChild(AFIP.UI.row('Template', data.template));
    body.appendChild(AFIP.UI.row('Decision', e.decision));

    if (e.reason && e.reason.length) {
      body.appendChild(AFIP.UI.row('Reason', e.reason.length + ' point(s)'));
      e.reason.forEach(function (r) { body.appendChild(AFIP.UI.row('  ·', r)); });
    }
    if (e.evidenceUsed && e.evidenceUsed.length) {
      e.evidenceUsed.forEach(function (ev) {
        body.appendChild(AFIP.UI.row('Evidence: ' + ev.domain, ev.status + ' (conf ' + ev.confidence + ')', ev.status));
      });
    }
    if (e.confidence) {
      body.appendChild(AFIP.UI.row('Decision confidence', AFIP.UI.formatConfidence(e.confidence.decision)));
    }
    if (e.alternativesConsidered && e.alternativesConsidered.length) {
      body.appendChild(AFIP.UI.row('Alternatives considered', e.alternativesConsidered.length));
    }
    body.appendChild(AFIP.UI.row('Expected outcome', e.expectedOutcome));
    body.appendChild(AFIP.UI.row('Operator impact', e.operatorImpact));
  };

  AFIP.UI.ExplainabilityPanel = ExplainabilityPanel;
})(typeof window !== 'undefined' ? window : globalThis);
