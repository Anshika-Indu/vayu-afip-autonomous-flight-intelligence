/**
 * AFIP UI :: Mission Timeline Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.MissionTimeline into its panel in the
 * Operator Control Station. Read-only with respect to simulator
 * rendering — this file never touches Three.js, the scene graph, or
 * the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'mission-timeline:entry' and
 * appends to its own bounded local display list. Never calls
 * AFIP.MissionTimeline.update()/record() or mutates the timeline's own
 * immutable history — it only reads what the bus hands it.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  var MAX_VISIBLE = 25;

  function TimelinePanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this._entries = [];
    this.subscribe(['mission-timeline:entry']);
  }
  TimelinePanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  TimelinePanel.prototype.constructor = TimelinePanel;

  /**
   * Append one timeline entry to the panel's display list and re-render.
   * @param {object} entry - one immutable entry from AFIP.MissionTimeline.
   */
  TimelinePanel.prototype.render = function (entry) {
    if (entry) {
      this._entries.push(entry);
      if (this._entries.length > MAX_VISIBLE) this._entries.shift();
    }
    var body = AFIP.UI.panelShell(this.root, 'Mission Timeline');
    if (!body) return;
    if (!this._entries.length) { body.appendChild(AFIP.UI.row('Status', 'no events yet', 'UNKNOWN')); return; }

    this._entries.slice().reverse().forEach(function (e) {
      var status = (e.type === 'DECISION_CHANGE' || e.type === 'REROUTE') ? 'WARNING' : (e.type === 'MISSION_COMPLETE' || e.type === 'LANDING') ? 'NOMINAL' : 'INFO';
      body.appendChild(AFIP.UI.row('t=' + (typeof e.timestamp === 'number' ? e.timestamp.toFixed(1) : e.timestamp) + ' ' + e.type, e.missionPhase || '', status));
    });
  };

  AFIP.UI.TimelinePanel = TimelinePanel;
})(typeof window !== 'undefined' ? window : globalThis);
