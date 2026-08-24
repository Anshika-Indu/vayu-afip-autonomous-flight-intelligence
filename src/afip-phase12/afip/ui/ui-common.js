/**
 * AFIP UI :: Shared rendering helpers
 * ---------------------------------------------------------------------
 * Purpose
 *   Small, dependency-free DOM-building and formatting helpers shared by
 *   every panel in ui/*.js, so each panel file stays a thin render layer
 *   instead of re-implementing element construction and status-color
 *   logic. Contains NO reasoning of any kind — it does not read World
 *   State, does not compute health/risk/mission judgments, and does not
 *   subscribe to the bus itself. It is pure presentation plumbing.
 *
 * Status
 *   IMPLEMENTED (Roadmap Phase 11 — UI Integration).
 *
 * Visual language (shared by all panels)
 *   Neutral dark background, white primary text, and exactly four status
 *   colors — green/amber/red for AFIP.Severity, plus blue for
 *   informational/neutral emphasis. No glow, no gradients, no
 *   cyberpunk styling, per every panel skeleton's own render() comment.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AFIP = global.AFIP = global.AFIP || {};
  AFIP.UI = AFIP.UI || {};

  AFIP.UI.Colors = Object.freeze({
    BACKGROUND: '#14161a',
    PANEL_BACKGROUND: '#1c1f24',
    BORDER: '#2c3038',
    TEXT_PRIMARY: '#f2f2f2',
    TEXT_SECONDARY: '#9aa0a8',
    NOMINAL: '#4caf50',
    CAUTION: '#ffb300',
    WARNING: '#ff9800',
    CRITICAL: '#f44336',
    UNKNOWN: '#6b7280',
    INFO: '#2196f3'
  });

  /** Map AFIP.Severity / common status strings onto the shared palette. Pure lookup — never invents a judgment. */
  AFIP.UI.colorForStatus = function (status) {
    var C = AFIP.UI.Colors;
    switch (String(status || '').toUpperCase()) {
      case 'NOMINAL': case 'CONTINUE': case 'ACCEPTED': case 'COMPLETE': case 'ON_ROUTE': return C.NOMINAL;
      case 'CAUTION': case 'CAUTIOUS': return C.CAUTION;
      case 'WARNING': case 'DEGRADED': case 'MINIMAL': case 'MODIFIED': return C.WARNING;
      case 'CRITICAL': case 'SUSPENDED': case 'REJECTED': case 'EMERGENCY': return C.CRITICAL;
      case 'UNKNOWN': case 'AWAITING_SOURCE': return C.UNKNOWN;
      default: return C.INFO;
    }
  };

  /** Minimal DOM builder: el('div', {class:'x'}, ['text', childEl]). Attributes starting with 'style:' set inline style properties. No framework dependency. */
  AFIP.UI.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.keys(attrs[k]).forEach(function (sk) { node.style[sk] = attrs[k][sk]; });
      } else if (k === 'class') {
        node.className = attrs[k];
      } else {
        node.setAttribute(k, attrs[k]);
      }
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  /** Remove all children of a root element. No-op if root is missing. */
  AFIP.UI.clear = function (root) {
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
  };

  /** A single label/value row with an optional status dot — the most common panel building block. */
  AFIP.UI.row = function (label, value, status) {
    var C = AFIP.UI.Colors;
    var dot = status ? AFIP.UI.el('span', { style: {
      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
      background: AFIP.UI.colorForStatus(status), marginRight: '6px'
    } }, []) : null;
    return AFIP.UI.el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px', color: C.TEXT_PRIMARY } }, [
      AFIP.UI.el('span', { style: { color: C.TEXT_SECONDARY } }, [dot, label].filter(Boolean)),
      AFIP.UI.el('span', {}, [value === null || value === undefined ? '—' : String(value)])
    ]);
  };

  /** Standard panel shell: title bar + body container. Returns the body element to append rows into. */
  AFIP.UI.panelShell = function (root, title) {
    if (!root) return null;
    AFIP.UI.clear(root);
    var C = AFIP.UI.Colors;
    root.style.background = C.PANEL_BACKGROUND;
    root.style.border = '1px solid ' + C.BORDER;
    root.style.borderRadius = '4px';
    root.style.padding = '8px 10px';
    root.style.fontFamily = 'system-ui, sans-serif';
    var body = AFIP.UI.el('div', {}, []);
    root.appendChild(AFIP.UI.el('div', { style: { fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em', color: C.TEXT_SECONDARY, textTransform: 'uppercase', marginBottom: '6px' } }, [title]));
    root.appendChild(body);
    return body;
  };

  /** Format a 0..1 confidence value, or "unknown" if not a number — never silently coerces "unknown" to 0. */
  AFIP.UI.formatConfidence = function (c) {
    return (typeof c === 'number') ? Math.round(c * 100) + '%' : 'unknown';
  };

  /**
   * Base class every panel extends: handles the render-only contract
   * (subscribe to one or more bus events, call this own render() with
   * the freshest payload, never call back into any AFIP.* reasoning
   * module). Panels never mutate AFIP state — this base class provides
   * no method that could.
   */
  AFIP.UI.Panel = function (rootEl) {
    this.root = rootEl || null;
  };
  AFIP.UI.Panel.prototype.render = function (data) { /* overridden per panel */ };
  /**
   * Subscribe this panel's render() to one or more bus events. Purely
   * additive wiring — does not read World State or call any module.
   * @param {string[]} events
   */
  AFIP.UI.Panel.prototype.subscribe = function (events) {
    var self = this;
    if (!AFIP.bus) return;
    (events || []).forEach(function (evt) {
      AFIP.bus.on(evt, function (payload) { self.render(payload); });
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
