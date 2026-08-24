/**
 * AFIP UI :: Operator Console
 * ---------------------------------------------------------------------
 * Renders output from AFIP.OperatorCommands into its panel in the
 * Operator Control Station, and provides the command buttons that call
 * AFIP.OperatorCommands.submit() directly. Read-only with respect to
 * simulator rendering — this file never touches Three.js, the scene
 * graph, or the renderer.
 *
 * Status: IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Render-only contract, with one narrow exception documented here: this
 * console is the UI action surface for the seven named operator
 * commands, so unlike every other panel it does call ONE method on its
 * module — AFIP.OperatorCommands.submit(command) — which per that
 * module's own design notes "generates a request only" and "never
 * mutates aircraft or World State directly." That is the normalize-a-
 * UI-action responsibility Operator Commands (Phase 10) was built for;
 * this console performs no arbitration, reasoning, or state mutation of
 * its own — it only relays a button click into the one call the module
 * exists to receive, then displays the resulting request via the
 * 'operator-commands:request' subscription like every other panel.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  var BUTTON_LABELS = [
    ['START_MISSION', 'Start Mission'], ['PAUSE_MISSION', 'Pause Mission'], ['RESUME_MISSION', 'Resume Mission'],
    ['HOLD_POSITION', 'Hold Position'], ['ABORT_MISSION', 'Abort Mission'],
    ['RETURN_TO_LAUNCH', 'Return To Launch'], ['EMERGENCY_LAND', 'Emergency Land']
  ];

  function OperatorConsole(rootEl) {
    AFIP.UI.Panel.call(this, rootEl);
    this._lastRequest = null;
    this.subscribe(['operator-commands:request']);
  }
  OperatorConsole.prototype = Object.create(AFIP.UI.Panel.prototype);
  OperatorConsole.prototype.constructor = OperatorConsole;

  /**
   * Re-render this console from the latest submitted command request.
   * @param {object} data - Output of AFIP.OperatorCommands.submit(command).
   */
  OperatorConsole.prototype.render = function (data) {
    if (data) this._lastRequest = data;
    var C = AFIP.UI.Colors;
    var body = AFIP.UI.panelShell(this.root, 'Operator Console');
    if (!body) return;

    var self = this;
    var buttonRow = AFIP.UI.el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' } }, []);
    BUTTON_LABELS.forEach(function (pair) {
      var known = AFIP.OperatorCommands && AFIP.OperatorCommands.Command && AFIP.OperatorCommands.Command[pair[0]];
      var btn = AFIP.UI.el('button', { style: {
        background: C.PANEL_BACKGROUND, border: '1px solid ' + C.BORDER, color: C.TEXT_PRIMARY,
        fontSize: '11px', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer'
      } }, [pair[1]]);
      if (known) {
        btn.addEventListener('click', function () {
          AFIP.OperatorCommands.submit(pair[0]);
        });
      } else {
        btn.disabled = true;
      }
      buttonRow.appendChild(btn);
    });
    body.appendChild(buttonRow);

    var req = this._lastRequest;
    if (!req) { body.appendChild(AFIP.UI.row('Status', 'no command submitted yet', 'UNKNOWN')); return; }
    body.appendChild(AFIP.UI.row('Last command', req.command));
    body.appendChild(AFIP.UI.row('Mapped proposal', req.mappedProposal, req.mappedProposal === 'ABORT_RTB' ? 'CRITICAL' : 'INFO'));
    body.appendChild(AFIP.UI.row('Request status', req.status, req.status));
  };

  AFIP.UI.OperatorConsole = OperatorConsole;
})(typeof window !== 'undefined' ? window : globalThis);
