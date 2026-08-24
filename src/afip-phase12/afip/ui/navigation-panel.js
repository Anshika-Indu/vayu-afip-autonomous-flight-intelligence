/**
 * AFIP UI :: Navigation Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.NavigationIntelligence into its panel in the
 * Operator Control Station. Read-only with respect to simulator
 * rendering — this file never touches Three.js, the scene graph, or
 * the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'navigation:assessment' only.
 * Never calls AFIP.NavigationIntelligence.update() or reads World
 * State directly. Displays Heading/Cross-Track Error exactly as
 * reported (including "unavailable"/the architectural-zero note) —
 * never backfills a plausible-looking value for display polish.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function NavigationPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['navigation:assessment']);
  }
  NavigationPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  NavigationPanel.prototype.constructor = NavigationPanel;

  /**
   * Re-render this panel from the latest Navigation Assessment.
   * @param {object} data - Output of AFIP.NavigationIntelligence.update(worldState, prediction).
   */
  NavigationPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Navigation');
    if (!body) return;
    if (!data) { body.appendChild(AFIP.UI.row('Status', 'no assessment yet', 'UNKNOWN')); return; }

    body.appendChild(AFIP.UI.row('Route status', data.routeStatus, data.routeStatus));
    body.appendChild(AFIP.UI.row('Progress', data.progressPercent != null ? data.progressPercent + '%' : 'unknown'));
    body.appendChild(AFIP.UI.row('Next waypoint', data.nextWaypoint ? data.nextWaypoint.label : 'none'));
    body.appendChild(AFIP.UI.row('Distance to waypoint', data.distanceToNextWaypoint != null ? data.distanceToNextWaypoint + ' m' : 'unknown'));
    body.appendChild(AFIP.UI.row('ETA', data.eta && data.eta.available ? data.eta.secondsRemaining + ' s (' + data.eta.source + ')' : 'unavailable', data.eta && data.eta.available ? 'NOMINAL' : 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('Heading', data.heading && data.heading.available ? data.heading.value : 'unavailable', 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('Cross-track error', data.crossTrackError ? data.crossTrackError.value + ' (architectural)' : 'unknown'));
    body.appendChild(AFIP.UI.row('Mission complete', data.missionComplete ? 'yes' : 'no', data.missionComplete ? 'NOMINAL' : 'INFO'));
  };

  AFIP.UI.NavigationPanel = NavigationPanel;
})(typeof window !== 'undefined' ? window : globalThis);
