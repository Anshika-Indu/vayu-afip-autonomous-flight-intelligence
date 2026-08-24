/**
 * AFIP UI :: Mission Planner Panel
 * ---------------------------------------------------------------------
 * Renders output from AFIP.MissionPlanner into its panel in the
 * Operator Control Station. Read-only with respect to simulator
 * rendering — this file never touches Three.js, the scene graph, or
 * the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract: subscribes to 'mission-planner:definition'
 * only. Never calls AFIP.MissionPlanner.update()/setMissionGoal() or
 * reads World State directly.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  function MissionPlannerPanel(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this.subscribe(['mission-planner:definition']);
  }
  MissionPlannerPanel.prototype = Object.create(AFIP.UI.Panel.prototype);
  MissionPlannerPanel.prototype.constructor = MissionPlannerPanel;

  /**
   * Re-render this panel from the latest Mission Definition.
   * @param {object} data - Output of AFIP.MissionPlanner.update(worldState).
   */
  MissionPlannerPanel.prototype.render = function (data) {
    var body = AFIP.UI.panelShell(this.root, 'Mission Planner');
    if (!body) return;
    if (!data || !data.definition) { body.appendChild(AFIP.UI.row('Status', 'no plan yet', 'UNKNOWN')); return; }

    var d = data.definition;
    body.appendChild(AFIP.UI.row('Goal', d.goal ? d.goal.description : 'unknown'));
    body.appendChild(AFIP.UI.row('Total distance', d.totalDistance != null ? d.totalDistance + ' m' : 'unknown'));
    body.appendChild(AFIP.UI.row('Waypoints', d.waypoints ? d.waypoints.length : 0));
    body.appendChild(AFIP.UI.row('Estimated duration', d.estimatedDuration && d.estimatedDuration.available ? d.estimatedDuration.estimatedSeconds + ' s' : 'unavailable', d.estimatedDuration && d.estimatedDuration.available ? 'NOMINAL' : 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('Energy requirement', d.estimatedEnergyRequirement && d.estimatedEnergyRequirement.available ? 'available' : 'unavailable', 'UNKNOWN'));
    body.appendChild(AFIP.UI.row('Alternate landing sites', d.alternateLandingSites ? d.alternateLandingSites.length : 0));
    if (d.constraints) {
      body.appendChild(AFIP.UI.row('Cruise speed', d.constraints.cruiseSpeedSetting != null ? d.constraints.cruiseSpeedSetting + ' km/h' : 'unset'));
      body.appendChild(AFIP.UI.row('Cruise altitude', d.constraints.cruiseAltitudeSetting != null ? d.constraints.cruiseAltitudeSetting + ' m' : 'unset'));
    }
  };

  AFIP.UI.MissionPlannerPanel = MissionPlannerPanel;
})(typeof window !== 'undefined' ? window : globalThis);
