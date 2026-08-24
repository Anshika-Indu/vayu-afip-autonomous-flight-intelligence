# AFIP — Autonomous Flight Intelligence Platform

**Status: Phase 1 through Phase 12 (Final System Integration) done.**
Every reasoning module and every operator-facing panel is implemented,
load order and bus event wiring are verified end-to-end (see "Load
order" and the bus event list below), and the full pipeline —
evidence in, panels rendered — has been integration-tested with zero
runtime errors. What remains is out of scope by design: an Intent
Adapter back to the simulator's own guidance layer, and any real
telemetry sources this simulator build doesn't have (energy, GPS/lat-
lon) — see "What's intentionally NOT built yet" below.

- **Phase 11 (`ui/*.js`)** implements every panel as a strict render
  layer: each panel subscribes to one bus event in its constructor
  (via the shared `AFIP.UI.Panel.subscribe()` base in
  `ui/ui-common.js`) and renders whatever payload arrives — no panel
  reads World State, calls any reasoning module's `update()`, or
  mutates AFIP state. The one documented exception is
  `operator-console.js`, which relays button clicks into
  `AFIP.OperatorCommands.submit()` — the one call that module exists
  to receive, and which itself only generates a request (see that
  module's own Phase 10 design notes). Three completed modules
  (`health-monitor.js`, `prediction-engine.js`, `risk-engine.js`)
  received one additive line each — a dedicated
  `<module>:assessment` bus event alongside their existing
  `evidence:batch` emission — since they previously had no per-cycle
  event a panel could subscribe to; no other logic in those files
  changed. Two panels beyond the original skeleton set were added to
  cover Phase 10 modules that had none:
  `mission-planner-panel.js` and `navigation-panel.js`.
  `ui-common.js` is new: shared DOM-building/formatting helpers with
  no reasoning of any kind, so individual panel files stay thin.
  Mounted into `Simulator_AFIP.html`'s new "AFIP Operator Control
  Station" section (10 panel roots) right before the render loop
  starts.
- Integration-tested with a minimal in-memory DOM stand-in (no browser
  required) across the same 200-cycle scenario as Phase 10, confirming
  every panel renders content from live bus events — including a
  simulated Operator Console button click producing a real, correctly
  mapped `AFIP.OperatorCommands` request — with zero runtime errors.

- **Phase 10 (`mission-planner.js`, `navigation.js`,
  `mission-timeline.js`, `operator-commands.js`)** completes the
  reasoning stack. `mission-planner.js` turns
  `Navigation.Progress.TotalDistance` into a Mission Definition
  (6 phase-boundary waypoints, deterministic duration estimate,
  honestly-UNKNOWN energy-requirement estimate since this build has no
  energy telemetry, and the mission's own origin/destination pads as
  the only alternate landing sites it can assert without a real
  site database). `navigation.js` tracks route progress, waypoint
  arrival/advance, ETA (preferring the Prediction Engine's own forecast
  when available), and mission-completion detection off that plan —
  Heading is reported UNKNOWN (no compass/pose source exists) and
  Cross-Track Error is a deterministic 0 with an explicit note that
  this reflects the simulator's single-track architecture, not a
  sensed on-course confirmation. `mission-timeline.js` is an
  event-driven, immutable (`Object.freeze()`-per-entry) history of
  phase transitions, waypoint arrivals, reroutes, and Decision Engine
  outcome changes, plus a dedicated `record()` handoff that
  `explainability.js` already calls defensively — every rendered
  explanation now becomes exactly one timeline entry.
  `operator-commands.js` normalizes the seven named operator actions
  (Start/Pause/Resume/Abort/Return-To-Launch/Hold/Emergency-Land) into
  structured, timestamped requests on a single-slot queue — it never
  touches aircraft or World State directly. `decision-engine.js`
  received one small, additive integration point (its
  `operatorProposal()` helper) so a pending structured request takes
  precedence over the coarser RUN/PAUSE signal already derived from
  `Operator.CurrentCommand`; nothing else in that file changed.
- Integration-tested over a 200-cycle synthetic run exercising the full
  chain — `afip-core.js` → … → `mission-timeline.js` — including a
  submitted Start Mission command, a mid-mission Hold/Resume pair, and
  a run to full mission completion (`Navigation.progressPercent`
  reaching 100, `routeStatus` reaching `COMPLETE`, exactly one
  `LANDING` timeline entry) with zero runtime errors.

- **Phase 7 (`mission-executive.js`)** is the sole proposer of mission
  intent (per `4__AFIP_Mission_Executive.md`). Each cycle it reads the
  Snapshot plus this cycle's Health/Prediction Assessments, runs the
  §2 decision flow (freshness/confidence gate → deterministic
  classification → cross-domain reconciliation/compounded risk →
  fixed precedence evaluation → posture update → proposal +
  justification generated together), and emits a proposed intent from
  the fixed §4.1 set (Continue/Adjust/Hold/Divert/Abort-RTB) — never an
  actuator value. It tracks Executive Posture (NOMINAL → CAUTIOUS →
  MINIMAL → SUSPENDED, §1.2), which only narrows immediately and only
  widens on fresh, confident evidence, and Mission Phase State, which
  it reads from the Snapshot but never commands. On its own internal
  fault it substitutes the §6.2 phase-appropriate minimal safe
  proposal (HOLD in hover-class phases, ABORT_RTB once committed to
  forward flight) rather than retrying or reusing a stale result.
- **Phase 8 (`decision-engine.js`)** is Arbitration — architecturally
  distinct from the Mission Executive's proposal step, so the function
  proposing an action is never the function approving it. It runs a
  deterministic constraint check against the proposal (e.g. DIVERT
  requires a non-empty `Navigation.AlternateLandingSites`), arbitrates
  between the Mission Executive's proposal and any current operator
  command on equal footing per §6.4 (conservative deterministic
  tie-break where both are constraint-valid), and reports
  accepted/modified/rejected back to the Mission Executive's
  continuity state via `recordArbitrationOutcome()`. It is fail-closed:
  no proposal this cycle is treated as rejected by default, never as
  silent approval. It publishes the shared `AFIP.MissionState` and
  `AFIP.IntentType` enums already declared in `afip-core.js`, and
  propagates decision confidence as the weakest-link of the Mission
  Executive's domain confidences and the Risk Engine's overall
  confidence.
- **Phase 9 (`explainability.js`)** is a pure renderer (per
  `7__AFIP_Explainability_Engine.md` §5) — it introduces no judgment
  that Phase 7/8 didn't already make. It produces the fixed six-part
  `AFIP.ExplanationShape` output (decision, reason, evidenceUsed,
  confidence, alternativesConsidered, expectedOutcome, operatorImpact),
  selects one of the §7 Decision Templates by (proposal category,
  triggering precedence branch), enumerates only the alternatives that
  were *structurally reachable* under the cycle's Executive Posture
  (never listing a posture-excluded option as if it competed on the
  merits), and assigns a deterministic §8 alert priority
  (Information/Warning/Critical/Emergency) with no silent downgrades —
  a SUSPENDED-posture cycle is always Emergency, and a rejected or
  modified Arbitration outcome is never Information. Where the Mission
  Executive's own justification set is a fault-substituted gap, the XE
  renders the gap itself rather than fabricating a plausible-looking
  reasoning (§5 Stage 9).
- Phases 7–9 follow the same evidence-record discipline as Phases 4–6:
  each publishes its footprint via `AFIP.bus.emit('evidence:batch', …)`
  with `source: 'mission-executive' | 'decision-engine' |
  'explainability'`, and each also returns its assessment directly so
  the next stage in the same cycle always sees the freshest output
  rather than last cycle's World State copy. `mission-executive.js`
  additionally emits `mission-executive:proposal`, `decision-engine.js`
  emits `decision-engine:decision`, and `explainability.js` emits
  `explainability:explanation` on the bus for any future UI panel to
  subscribe to directly.
- Integration-tested over a 200-cycle synthetic run
  (`afip-core.js` → … → `explainability.js`) with zero runtime errors;
  see the design notes in each file's header comment for the specific
  spec sections implemented.

- Phase 1 introduced this module layout with zero behavioral change to
  the simulator — nothing wired in, no reasoning logic.
- Phase 2 (`evidence-adapter.js`) is a real, working implementation,
  wired into a copy of the simulator (`Simulator_AFIP.html`, alongside
  this folder) through one additive hook inside its existing `loop()`.
  Rendering, physics, and controls are untouched.
- Phase 3 (`world-state.js`) replaced the flat evidence bucket with the
  full §5.2–5.13 schema: all 12 top-level objects (Aircraft, Mission,
  Navigation, Health, Energy, Environment, Communication, Operator,
  Risk, Prediction, Timeline) are present with every documented
  sub-field from cycle one, even before evidence arrives — a field is
  `{ value: null, timestamp: null, frame: null }`, never simply
  missing. Each top-level object also gets a `_meta: { dataAvailable,
  freshness, leafCount }` block, so a module can tell "this object has
  never been fed" apart from "this object is fresh."
- **Phase 4 (`health-monitor.js`)** is a real, working implementation of
  the Health Monitoring System design doc: six weighted sub-domains
  (Battery 30%, Propulsion 25%, Navigation-sensor 15%, Communication
  10%, Environment 10%, Mission/Payload context 10%), a §7.1 ceiling
  rule, §8 deterministic linear-trend failure prediction, §9 four-tier
  alerting, and a Ready/Ready-with-Constraints/Not-Ready Mission
  Readiness classification. It scores what this simulator build can
  honestly support today (propulsion via structural gyroscopic torque,
  reusing the simulator's own spar-shear thresholds; payload via
  Aircraft.Payload.Mass) and reports Battery, Navigation-sensor,
  Communication, and Environment as `UNKNOWN` rather than fabricating a
  score — see `TELEMETRY_COVERAGE.md`, still accurate.
- **Phase 5 (`prediction-engine.js`)** forecasts ETA (kinematic:
  distance-remaining / ground-speed), Health-Score trend degradation
  (same bounded linear-slope method as Phase 4), and a deterministic
  weighted mission-success-probability heuristic (health × 0.5 +
  progress × 0.3 + kinematic consistency × 0.2). Battery-depletion
  forecasting is fully modeled but gated on `Energy.*` telemetry that
  doesn't exist yet in this build — it reports "insufficient data"
  today and will activate automatically the moment a real energy
  source is added to `evidence-adapter.js`, with no code changes here.
- **Phase 6 (`risk-engine.js`)** is the sole producer of the Risk
  object: Mission, Collision, Power, Communication, and Navigation risk
  categories plus an Overall composite (same ceiling-rule posture as
  Phase 4) and advisory Recommended Mitigation. Where telemetry is
  missing (power, communication, navigation-sensor, and — most
  starkly — collision, since this simulator has **no** obstacle/traffic
  sensing at all) risk is reported at an elevated caution floor, never
  a comfortable low-risk default: "cannot confirm safe" is itself
  treated as risk, consistent with standard aerospace risk practice.
- Phase 4/5/6 modules publish their outputs into the World State the
  same way Phase 2's Evidence Adapter does: as Evidence Records (with
  `source: 'health-monitor' | 'prediction-engine' | 'risk-engine'`)
  handed to `AFIP.bus`, which only `world-state.js` consumes. None of
  the three reasoning modules ever touches the WSE's draft directly, in
  keeping with the one-way Evidence → World State boundary.
- **Read `TELEMETRY_COVERAGE.md` before writing any further reasoning
  logic.** This simulator build only produces phase/tilt/velocity/
  altitude/spar-shear-torque/payload-mass telemetry — no battery, GPS,
  motor temp, IMU, wind, or comms data exist yet. The Evidence Adapter
  emits only what's real; Phases 4–6 do not fabricate the rest, they
  report it as unknown/insufficient data.

## What's here

```
afip/
├── afip-core.js            Namespace, shared enums, evidence/explanation
│                            shape contracts, pub/sub bus
├── evidence-adapter.js      Simulator telemetry → Evidence Records
├── world-state.js           Evidence Records → immutable World State
├── mission-planner.js       Mission Definition: waypoints, duration/energy estimate, alternate sites — IMPLEMENTED
├── navigation.js            Route progress, waypoint arrival, ETA, mission-complete detection — IMPLEMENTED
├── health-monitor.js        Health Score, warnings, predicted failures — IMPLEMENTED
├── prediction-engine.js     ETA, health-trend, mission-success forecasts — IMPLEMENTED
├── risk-engine.js           Mission/Collision/Power/Comms/Navigation/Overall risk — IMPLEMENTED
├── mission-executive.js     Proposes mission intent (Continue/Adjust/Hold/Divert/Abort-RTB) — IMPLEMENTED
├── decision-engine.js       Arbitrates the proposal into MissionState/IntentType — IMPLEMENTED
├── explainability.js        Renders Decision→Reason→Evidence→Confidence→Alternatives→Outcome→Impact — IMPLEMENTED
├── operator-commands.js     UI actions → structured command requests — IMPLEMENTED
├── mission-timeline.js      Chronological event/decision log — IMPLEMENTED
└── ui/
    ├── ui-common.js            Shared render-only DOM/formatting helpers — IMPLEMENTED
    ├── health-panel.js         — IMPLEMENTED
    ├── prediction-panel.js     — IMPLEMENTED
    ├── risk-panel.js           — IMPLEMENTED
    ├── mission-planner-panel.js — IMPLEMENTED (new in Phase 11)
    ├── navigation-panel.js     — IMPLEMENTED (new in Phase 11)
    ├── mission-panel.js        — IMPLEMENTED
    ├── decision-console.js     — IMPLEMENTED
    ├── explainability-panel.js — IMPLEMENTED
    ├── operator-console.js     — IMPLEMENTED (new in Phase 11)
    └── timeline-panel.js       — IMPLEMENTED
```

Every file is a self-contained script that attaches to a shared global
`AFIP` namespace (`AFIP.WorldStateEngine`, `AFIP.HealthMonitor`, …),
matching how `Simulator_latest_.html` is already written — a single
inline `<script>` with no module bundler. Each module has one `update()`
entry point that takes the current World State snapshot and returns its
contribution to the next one, and each file's header comment carries its
purpose, inputs, outputs, dependencies, and display target straight from
the spec, so nothing here drifts from the source-of-truth documents.

## Load order

`Simulator_AFIP.html` already does this — use it as the reference.
Script tags go after Three.js/OrbitControls and before the simulator's
own inline `<script>`, in this order (later files assume earlier ones
exist on `window.AFIP`):

1. `afip-core.js`
2. `evidence-adapter.js`
3. `world-state.js`  ← wired and live as of Phase 2
4. `health-monitor.js` ← wired and live as of Phase 4
5. `prediction-engine.js` ← wired and live as of Phase 5 (reads Health output)
6. `risk-engine.js` ← wired and live as of Phase 6 (reads Health + Prediction output)
7. `mission-planner.js` ← wired and live as of Phase 10 (must load before `navigation.js`)
8. `navigation.js` ← wired and live as of Phase 10 (reads the waypoint plan `mission-planner.js` publishes, and Prediction's ETA forecast when available)
9. `operator-commands.js` ← wired and live as of Phase 10 (load order relative to `decision-engine.js` doesn't matter — `decision-engine.js` only calls it inside `update()`, not at load time)
10. `mission-executive.js` ← wired and live as of Phase 7 (reads Health + Prediction output)
11. `decision-engine.js` ← wired and live as of Phase 8 (reads Mission Executive + Risk output; must load after `mission-executive.js`)
12. `explainability.js` ← wired and live as of Phase 9 (reads Mission Executive + Decision Engine output; must load after both)
13. `mission-timeline.js` ← wired and live as of Phase 10 (`explainability.js` calls `AFIP.MissionTimeline.record()`; load order relative to `explainability.js` doesn't matter — that call happens inside `update()`, not at load time)
14. `ui/*.js`

**Within `loop()`**, the reasoning pipeline runs in this fixed order
every frame, each stage re-publishing the World State so the next stage
(and the UI) sees a complete, consistent snapshot for the cycle:

```
EvidenceAdapter.ingest(raw) → WorldStateEngine.publish()
  → HealthMonitor.update(snapshot)                    → WorldStateEngine.publish()
  → PredictionEngine.update(snapshot, health)         → WorldStateEngine.publish()
  → RiskEngine.update(snapshot, health, prediction)   → WorldStateEngine.publish()
  → OperatorCommands.update(snapshot)                 (read-only; real entry point is submit())
  → MissionPlanner.update(snapshot)                   → WorldStateEngine.publish()
  → NavigationIntelligence.update(snapshot, prediction) → WorldStateEngine.publish()
  → MissionExecutive.update(snapshot, health, prediction)     → WorldStateEngine.publish()
  → DecisionEngine.update(snapshot, missionExecutive, risk)   → WorldStateEngine.publish()
  → ExplainabilityEngine.update(snapshot, missionExecutive, decision) → WorldStateEngine.publish()
  → MissionTimeline.update(snapshot, decision, navigation)    → WorldStateEngine.publish()
```

Health/Prediction/Risk/MissionExecutive/Decision Assessments are passed
to the next stage directly as return values (freshest-available data),
*and* separately folded into the World State as Evidence Records for
history/UI/audit purposes — see each module's header comment for why
both paths exist. Note the Decision Engine also writes back into the
Mission Executive's own continuity state via
`AFIP.MissionExecutive.recordArbitrationOutcome(...)` — the one
sanctioned exception to "reasoning modules never reach into each other
directly", since this is Arbitration outcome intake (§2 step 10 of the
Mission Executive design doc), not a Belief Field write. Phase 10 adds
one more such exception, same rationale: Decision Engine's
`operatorProposal()` reads `AFIP.OperatorCommands.getLatest()` directly
(a pending structured command request), and calls
`AFIP.OperatorCommands.acknowledge(...)` once it has been arbitrated —
consuming operator intent, not a Belief Field.

## What's intentionally NOT built yet

- A real 2D route/geofence model. This simulator build has no lat/lon
  or lateral-position telemetry (see `evidence-adapter.js`'s
  `AFIP.AWAITING_SOURCE`), so `navigation.js` correctly reports Heading
  as unavailable and Cross-Track Error as a fixed 0 with an explanatory
  note rather than fabricating either — see that file's design notes.
- A real energy-consumption model. `mission-planner.js`'s estimated
  energy requirement is reported as unavailable for the same reason
  (`Energy.ConsumptionRate`/`Energy.Remaining` are `AWAITING_SOURCE`).
- An Intent Adapter translating `AFIP.IntentType` back into simulator
  guidance calls — AFIP remains fully advisory; nothing it produces is
  wired to actually steer the simulator.

To confirm data is flowing, open `Simulator_AFIP.html` in a browser,
open devtools, and run `AFIP.WorldStateEngine.getSnapshot()` — it
updates every frame while the mission is playing. Run
`AFIP.HealthMonitor.getLatest()`, `AFIP.PredictionEngine.getLatest()`,
or `AFIP.RiskEngine.getLatest()` to see each module's most recent full
Assessment object directly.

## Architectural invariants (enforced by convention, not code, at this stage)

- **AFIP never controls motors, never computes physics, never replaces
  the simulator.** Every `update()` method is read-World-State-in,
  advisory-output-out.
- **World State is immutable per reasoning cycle.** All modules must
  consume the *same* snapshot; none may mutate it in place.
- **Evidence precedes belief.** Only `evidence-adapter.js` touches raw
  simulator variables. Everything downstream reads Evidence Records or
  the World State — never the simulator directly.
- **Every decision is explainable.** No output from `decision-engine.js`
  may reach the simulator without a matching entry from
  `explainability.js`.

## What's intentionally NOT built yet (recap)

- Every reasoning module (Phases 4–10) and every `ui/*.js` panel
  (Phase 11) is now a real implementation.
- No Intent Adapter translating `AFIP.IntentType` back into simulator
  guidance calls (later phase) — AFIP remains fully advisory.
  work done here).

These follow once each prior phase is confirmed correct.
