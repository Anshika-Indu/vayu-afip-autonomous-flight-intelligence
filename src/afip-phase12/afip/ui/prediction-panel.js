/**
 * AFIP UI :: Prediction Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.PredictionEngine into its panel in the Operator
 * Control Station. Read-only with respect to simulator rendering —
 * this file never touches Three.js, the scene graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'prediction-engine:assessment'
 * (Phase 11 addendum in prediction-engine.js) only. Never calls
 * AFIP.PredictionEngine.update() or reads World State directly.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function PredictionPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['prediction-engine:assessment']);
  }
  PredictionPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  PredictionPanel.prototype.constructor = PredictionPanel;

  function fmtSeconds(s) {
    if (typeof s !== 'number') return 'unknown';
    var m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m + 'm ' + sec + 's';
  }

  /**
   * Re-render this panel from the latest Prediction Assessment.
   * @param {object} data - Output of AFIP.PredictionEngine.update(worldState, health).
   */
  PredictionPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Prediction Engine');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no assessment yet', 'UNKNOWN')); return; }

    var eta = data.etaForecast;
    body.appendChild(AFIP.UI.row('ETA', eta && eta.available ? fmtSeconds(eta.etaSeconds) : 'unavailable', eta && eta.available ? 'NOMINAL' : 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('ETA confidence', eta && eta.available ? AFIP.UI.formatConfidence(eta.confidence) : 'unknown'));

    var energy = data.energyForecast;
    body.appendChild(AFIP.UI.row('Energy endurance', energy && energy.available ? fmtSeconds(energy.secondsToDepletion) : 'unavailable', energy && energy.available ? 'NOMINAL' : 'UNKNOWN'));

    var success = data.missionSuccessProbability;
    body.appendChild(AFIP.UI.row('Mission success probability', success ? Math.round(success.probability * 100) + '%' : 'unknown', success && success.probability < 0.4 ? 'CRITICAL' : success && success.probability < 0.7 ? 'WARNING' : 'NOMINAL'));
    body.appendChild(AFIP.UI.row('Success-probability confidence', success ? AFIP.UI.formatConfidence(success.confidence) : 'unknown'));

    var degradation = data.healthDegradation;
    if (degradation) {
      body.appendChild(AFIP.UI.row('Time to warning band', degradation.available ? (typeof degradation.secondsToWarningBand === 'number' ? fmtSeconds(degradation.secondsToWarningBand) : 'stable/improving') : 'unavailable', degradation.available ? 'NOMINAL' : 'UNKNOWN'));
    }
  };

  AFIP.UI.PredictionPanel = PredictionPanel;
})(typeof window !== 'undefined' ? window : globalThis);
