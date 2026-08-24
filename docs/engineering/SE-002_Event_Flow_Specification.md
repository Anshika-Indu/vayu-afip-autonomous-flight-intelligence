# Autonomous Flight Intelligence Platform (AFIP)
## Event Flow Specification

**Document ID:** AFIP-SE-002
**Document Type:** Systems Engineering — Event Flow Specification
**Status:** Draft v0.1
**Prepared By:** Systems Engineering & Documentation Lead (AFIP)
**Derived From:** AFIP Product Specification v0.2; AFIP Software Architecture v0.1; AFIP World State Engine v0.1; AFIP Mission Executive v0.1; AFIP Navigation System v0.1; AFIP Health Monitoring System v0.1; AFIP Explainability Engine v0.1
**Baseline vs. Implementation:** The uploaded architecture documents are the design baseline for this document. Where the current implementation phase realizes a baseline concept under a different working name (e.g., "Prediction Engine," "Risk Engine," "Mission Timeline," "Operator Commands"), that realization is documented in a clearly marked **Implementation Note** alongside the baseline description. Implementation Notes never override, replace, or conflict with the baseline architecture — they describe how the current build instantiates it.
**Scope of this document:** Every discrete, triggerable event in AFIP — what causes it, what it carries, who consumes it, and how it propagates. This document does not introduce new events, new triggers, or new escalation rules beyond what the source specifications already establish.

---

## 1. Purpose

The data flow document (AFIP-SE-001) describes what data exists and which system produces/consumes it continuously. This document describes the other half of AFIP's behavior: **discrete events** — things that happen at a moment in time, trigger a state change, and must be tracked, escalated, and recorded as identifiable occurrences rather than as continuously-updating values.

This distinction is not new terminology invented for this document — it is a first-class design axis in the source material itself: the Information-Centric Architecture reference explicitly separates **event-driven** data ("mode changes, waypoint arrivals, failures, comms events") from **continuous** data ("state estimates, battery SoC, wind vectors, traffic positions"), and the WSE document applies the same split to every Belief Field (WSE §5.2). This document is the single place that catalogs every event-driven occurrence across AFIP end to end.

---

## 2. Event vs. Continuous Data — Governing Rule

| Property | Continuous Data | Event |
|---|---|---|
| Nature | A value that is always current and is re-read every cycle | A discrete occurrence at a specific moment, tied to a specific Snapshot version |
| Examples | Kinematic/Pose belief, Power/Energy belief, wind estimate | Posture transition, alert tier crossing, Arbitration outcome, route status change |
| Governing discipline | Freshness/confidence discipline (WSE §5.3) | Escalation and recording discipline (this document) |
| Never happens | Held at last value without confidence decay (WSE §5.4) | Silently dropped, downgraded for convenience, or auto-dismissed (XE §8) |

Every event in this document is anchored to the Snapshot version and (where applicable) the Mission Phase State in effect when it occurred (XE §9) — an event is never a free-floating occurrence.

---

## 3. Event Taxonomy

Events in AFIP fall into eight categories, ordered by where they originate in the layered architecture (Architecture §2).

### 3.1 Evidence Events (Layer A)

| Event | Trigger | Consumed By |
|---|---|---|
| Evidence Arrival | A new Evidence Record is received from the simulator, a sensor, or the Navigation System | World State Engine (reconciliation) |
| Evidence Loss | Expected evidence for a given fact stops arriving | World State Engine (marks affected Belief Field reduced-confidence, WSE §7 row A) |

**Discipline:** Evidence Intake performs no interpretation and produces no event beyond "evidence arrived" or "evidence stopped arriving" — it never classifies what the evidence means (Architecture §3.1).

### 3.2 Belief Events (Layer B — World State Engine)

| Event | Trigger | Consumed By |
|---|---|---|
| Snapshot Published | The WSE completes a reconciliation cycle and publishes a new, complete, internally consistent Snapshot | Mission Executive; Health Monitoring System (WSE §2, §5.1) |
| Snapshot Withheld | The reconciliation process cannot complete a cycle | No new Snapshot is published; Layer C continues reasoning against the last valid (aging) Snapshot (WSE §7) |
| Confidence Degradation | A Belief Field's supporting evidence source stops arriving, or two sources disagree | The affected field's confidence is reduced and visibly flagged (WSE §7 rows 1–2) |
| Field Marked Unknown | Evidence is insufficient to reconcile a field at all | Field is marked unknown/low-confidence, never omitted (WSE §7 row 3) |

**Discipline:** No Belief Event ever "resolves" a conflict by averaging or silent preference — the conflict itself is preserved as part of the Reconciliation Record (WSE §7 row 2).

### 3.3 Domain Classification Events (Layer C)

| Event | Trigger | Consumed By |
|---|---|---|
| Domain Classification Change | A domain (health, navigation, mission) crosses from nominal → degraded, degraded → critical, or the reverse (only on confirmed fresh evidence) | Mission Executive precedence evaluation (Mission Executive §2 step 6) |
| Domain Marked Unknown | Confidence for a domain's supporting fields falls below that domain's own confidence floor | Precedence evaluation step 1 (conservative fallback), Mission Executive §7.4 |
| Cross-Domain Compounded Condition | Two or more near-threshold conditions across domains are evaluated together and found to indicate more risk than either alone | Mission Executive risk assessment (Mission Executive §5.3) |

**Implementation Note — "Risk Engine."** The uploaded Mission Executive specification does not define a separate "Risk Engine" module; risk assessment (Safety risk, Mission risk, Compounded risk) is an internal reasoning function of the Mission Executive itself (Mission Executive §5). Where the current implementation phase names this function the "Risk Engine," that name refers to the same cross-domain reconciliation and precedence-evaluation logic already specified in Mission Executive §2 (steps 5–6) and §5 — it is a realization of an existing function, not an additional architectural layer, and it produces no output or authority beyond what Mission Executive §4 already permits (Proposed Intent + Justification Reference Set).

### 3.4 Health Alert Events (Health Monitoring System)

| Event (Tier) | Trigger | Effect |
|---|---|---|
| Information | A subsystem sub-score moves outside its nominal band but remains well clear of operational concern | Logged; visible to operator; does not affect Health Score classification (HMS §9) |
| Warning | A subsystem sub-score, or a Predicted Failure's projected time-to-threshold, crosses the degraded boundary | Overall Health classification → degraded; Recommended Action generated; Mission Executive posture affected (HMS §9, §10.3) |
| Critical | A subsystem sub-score crosses the unsafe-without-response threshold, or a Predicted Failure's time-to-threshold falls inside a bounded, mission-relevant horizon | Overall Health classification → critical; evaluated ahead of mission status; can drive abort-class proposal on its own (HMS §9; Mission Executive §2 step 2, §8.2) |
| Emergency | A subsystem fails outright, or two or more Critical conditions are concurrent | Overall Health classification forced to critical regardless of weighted score (ceiling rule); justification explicitly names the concurrent conditions (HMS §9, §7.1) |

Escalation is one-way and immediate on any qualifying condition. De-escalation requires a full reasoning cycle confirming the condition has genuinely cleared against fresh, confident belief — never merely the absence of a new bad reading (HMS §9, mirroring Mission Executive §1.2).

**Implementation Note — "Prediction Engine."** The uploaded HMS specification does not define a separate "Prediction Engine" module. Failure prediction (battery depletion, motor overheating, communication degradation, GPS degradation, high wind risk, sensor inconsistency) is a specified function of the HMS itself (HMS §8), using deterministic engineering models only — no machine learning or statistical pattern-classification model is used anywhere in this function (HMS §8, opening statement). Where the current implementation phase names this function the "Prediction Engine," that name refers to the same six deterministic projection models already specified in HMS §8.1–§8.6, each of which produces a **Predicted Failure event** (subsystem, model/threshold, projected time/distance-to-threshold, confidence) per the common structure in HMS §8.7. This is a realization of an existing HMS responsibility, not a new advisory or model-based reasoning path, and it remains subject to the same deterministic/advisory boundary as every other part of Layer C (Architecture §6, P5).

### 3.5 Posture and Phase Events (Mission Executive)

| Event | Trigger | Direction of Travel |
|---|---|---|
| Executive Posture Downgrade | Any domain crossing a threshold, confidence falling, or a fault occurring | One-way, immediate (Mission Executive §1.2) |
| Executive Posture Recovery | A full reasoning cycle confirms the triggering condition has cleared **and** the supporting Snapshot is itself fresh and confident | Never assumed from absence of a new bad signal (Mission Executive §1.2, §7.5) |
| Mission Phase Transition | Mission State + Aircraft State jointly indicate a phase change (e.g., CRUISE → TRANSITION (IN)) | Recognized, never commanded, by the Mission Executive (Mission Executive §1.1) |
| Off-Nominal Branch Entry (HOLD / DIVERT / RETURN-TO-BASE / ABORT) | A corresponding intent is *accepted by Arbitration* | Never entered unilaterally by the Mission Executive (Mission Executive §1.1) |

### 3.6 Proposal and Arbitration Events (Layer D)

| Event | Trigger | Consumed By |
|---|---|---|
| Proposed Intent Generated | Mission Executive completes Decision Flow step 8 | Arbitration; Explainability Engine (captured as a pair, XE §5 Stage 1) |
| Arbitration Outcome — Accepted | Proposal passes the independent constraint check unmodified | Navigation System (as Accepted Intent); Mission Executive (next-cycle continuity state); Explainability Engine |
| Arbitration Outcome — Modified | Proposal passes with an attached constraint (e.g., reduced envelope) | Same as above, with modification detail |
| Arbitration Outcome — Rejected | Proposal fails the constraint check, or Arbitration cannot produce a valid result (fail-closed) | Mission Executive (next-cycle continuity state); Explainability Engine — recorded with equal weight to an accepted proposal (Architecture §4 flow rule 3) |
| Mission Executive Fault | The proposal function cannot complete a cycle | Executive Posture → SUSPENDED; minimal safe proposal substituted per Mission Phase State (Mission Executive §6.2) |
| Arbitration Unavailable/Inconclusive | Arbitration cannot produce a valid result | Proposal treated as rejected by default (Architecture Invariant 3) |

### 3.7 Navigation Events (Navigation System)

| Event | Trigger | Consumed By |
|---|---|---|
| Route Status Change | nominal → deviating → locally-replanning → blocked-rerouting → unreachable | Evidence Intake, as ordinary evidence (NS §4.2) |
| Obstacle Classified — Known | Intrusion already accounted for in the last plan | No action; existing route already avoids it (NS §8) |
| Obstacle Classified — Unknown | Newly detected within look-ahead horizon | Escalates to Obstacle Avoidance (NS §8) |
| Local Avoidance Applied | A bounded, local maneuver clears the intrusion while remaining on course | Reported as Route Status fact (NS §8, resolution step 1) |
| Dynamic Reroute Invoked | Local avoidance insufficient, or route found blocked outright | Route Planner rerun over updated picture (NS §8, resolution step 2) |
| Route Unreachable | Dynamic Rerouting finds no feasible path to current target | Reported upward as fact; Mission Executive's achievability judgment consumes it (NS §8, resolution step 3; Mission Executive §8.1) |
| Position/GPS Degradation | Position confidence falls per fixed freshness rule | Confidence-tagged fact reported upward (NS §10) |
| Communication Loss (Accepted Intent channel) | AFIP → NS channel interrupted | NS continues executing last Accepted Intent; reports comm loss as fact; never invents new strategic intent (NS §10) |
| NS Internal Fault | A module cannot complete a planning cycle | NS holds last known-good route/setpoints; reports fault as a Route Status condition (NS §10) |

### 3.8 Explanation and Alert Events (Layer E)

| Event | Trigger | Consumed By |
|---|---|---|
| Explanation Rendered | Mission Executive step 8 output + Arbitration outcome captured (XE §5 Stage 1–8) | Operator Interface; permanent Record |
| Alert Assigned — Information | Continue proposals; locally-resolved obstacle avoidance with no classification change; Mission Completed | Logged, non-interrupting (XE §8) |
| Alert Assigned — Warning | Adjust-class proposals; Hold triggered by a single domain failing the freshness/confidence gate; dynamic reroute | Visible, non-blocking notification (XE §8) |
| Alert Assigned — Critical | Divert proposals; Abort/RTB from the critical-condition branch; Route Status = unreachable | Prominent, requires acknowledgment (XE §8) |
| Alert Assigned — Emergency | Any proposal generated under SUSPENDED posture; Arbitration rejects a critical-branch proposal; Arbitration itself unavailable | Highest-priority interrupt, never auto-dismissed (XE §8) |
| Explanation Gap Recorded | Any XE pipeline stage cannot complete (e.g., a SUSPENDED-posture minimal safe proposal with no normal justification) | Recorded explicitly as a gap, never filled with invented reasoning (XE §5 Stage 9) |

**Implementation Note — "Mission Timeline."** The uploaded Explainability Engine specification does not define "Mission Timeline" as a separate system; Mission Timeline Integration is a specified function of the XE itself (XE §9), anchoring every rendered explanation to its Snapshot version and Mission Phase State. Where the current implementation phase surfaces this function under the name "Mission Timeline," it refers to the same anchoring mechanism already specified in XE §9 — the timeline is populated by the same Stage 8 handoff that feeds the permanent Record (XE §9, §5), not a second, independently maintained history. No new event type is introduced by this realization; the Mission Timeline is a presentation view over events already defined in Sections 3.5–3.8 of this document.

### 3.9 Operator Events (Operator Interface Boundary)

| Event | Trigger | Consumed By |
|---|---|---|
| Operator Command Issued | Operator submits a proposed intent | Routed into the same proposal path as any Mission Executive proposal; passes through Arbitration identically (Architecture §3.6, P10) |
| Operator Command Outcome | Arbitration accepts/modifies/rejects the operator's command | Same recording and explanation discipline as an AFIP-originated proposal — never treated as a privileged bypass, including during an emergency (Mission Executive §6.4) |
| Alert Acknowledged | Operator acknowledges a Critical/Emergency alert | Logged as part of Operator situational-awareness record |

**Implementation Note — "Operator Commands."** The uploaded Architecture and Product Specification documents define this function as the **Operator Interface Boundary** (Architecture §3.6) — presentation and routing only, with no decision-making authority of its own and no path into Arbitration that bypasses the check applied to every other proposal (Architecture §3.6; Product Spec §9.15). Where the current implementation phase labels this surface "Operator Commands," it refers to the same routing boundary already specified — an operator command is, and remains, structurally just another proposed intent (Architecture P10).

---

## 4. Event Propagation Rules

These rules govern every event category in Section 3 without exception, restated from the Architecture document's flow rules (§4) and invariants (§10):

1. **No event skips a layer.** An event produced at Layer A can only be consumed by Layer B; an event produced by Situational Reasoning can only reach Arbitration through the Mission Executive's own proposal path — never directly to the flight-control boundary (Architecture §2, "no-skip rule").
2. **Escalation is one-way and immediate; recovery is never assumed.** Every escalating event (posture downgrade, alert tier increase, domain classification worsening) takes effect the cycle it is detected. Every recovering event requires a full reasoning cycle against a fresh, confident Snapshot — absence of new bad evidence is never treated as confirmation of recovery (Mission Executive §1.2, §7.5; HMS §9).
3. **No event is silently dropped.** A rejected proposal, a recorded fault, a gap in justification — each is exactly as important to the record as a normal, successful event (Architecture §4 flow rule 3; XE §5 Stage 9).
4. **No event bypasses Arbitration.** This applies to every proposal-class event regardless of source (Mission Executive or Operator) or urgency (Architecture P2, Invariant 2; Mission Executive §6.1, §6.4).
5. **Every event that reaches a decision is recorded and explained at the moment it occurs.** Not reconstructed afterward (Architecture P6; XE §2).

---

## 5. Event Sequence — Representative Escalation Path

The following illustrates how a single real-world condition propagates as a chain of events across every layer, using the pattern already specified across the source documents (not a new scenario-specific mechanism):

```
1. Evidence Loss / New Evidence Arrival         (Layer A)
        │
        ▼
2. Confidence Degradation on a Belief Field     (WSE, Layer B)
        │
        ▼
3. Domain Classification Change (e.g., Health:
   nominal → degraded)                          (HMS → Mission Executive, Layer C)
        │
        ▼
4. Executive Posture Downgrade (NOMINAL → CAUTIOUS)  (Mission Executive §1.2)
        │
        ▼
5. Proposed Intent Generated (e.g., Adjust)     (Mission Executive §2 step 8)
        │
        ▼
6. Arbitration Outcome (Accept/Modify/Reject)   (Layer D)
        │
        ├──► 7a. Accepted Intent → Navigation System (route/setpoint update)
        │
        └──► 7b. Explanation Rendered + Alert Assigned (Warning tier)  (Layer E)
                        │
                        ▼
              8. Event anchored to Mission Timeline, made available
                 to Operator Interface and permanent Record          (XE §8, §9)
```

If the underlying condition worsens further (e.g., Health → critical), steps 3–8 repeat with the higher-precedence branch (Mission Executive §2 step 6), the posture moves to MINIMAL, and the Alert tier moves to Critical — never bypassing any step in this chain, regardless of urgency (Section 4, Rule 4).

---

## 6. Fault Events — Cross-System Summary

Restated from Architecture §7 and extended per-system, as a single event reference:

| Layer/System | Fault Event | Response |
|---|---|---|
| Evidence Intake | Expected evidence stops arriving | Downstream belief marked reduced-confidence (Architecture §7 row A) |
| World State Engine | Conflicting or insufficient evidence; reconciliation cannot complete | Confidence reduced, not silently resolved; no Snapshot published for that cycle (Architecture §7 row B; WSE §7) |
| Situational Reasoning (Mission Executive/HMS) | Belief confidence too low to support a domain judgment; HMS aggregation cannot complete | Domain treated as unknown → conservative fallback (Architecture §7 row C; HMS §10.5) |
| Decision & Arbitration — Proposal | Proposal function faults, cannot complete a cycle | Minimal pre-defined safe proposal substituted, varying by Mission Phase State; still arbitrated (Architecture §7 row D; Mission Executive §6.2) |
| Decision & Arbitration — Arbitration | Cannot produce a valid result | Proposal treated as rejected by default (fail-closed) (Architecture §7 row D-Arbitration; Invariant 3) |
| Navigation System | Internal fault, cannot complete a planning cycle | Holds last known-good Desired Route/setpoints; reports fault as Route Status condition (NS §10) |
| Explainability & Record | Cannot render an explanation in real time | Decision proceeds unaffected; gap explicitly recorded, never hidden (Architecture §7 row E; XE §5 Stage 9) |

**Governing rule across every row:** a failure anywhere in AFIP results in AFIP asking for less trust, never in AFIP acting harder to compensate (Architecture §7).

---

## 7. Traceability Notes

This document catalogs events; it does not create them. Every event type in Section 3 is sourced directly from the cited section of its parent document. The four Implementation Notes in this document (Risk Engine, Prediction Engine, Mission Timeline, Operator Commands) document current implementation-phase naming for functions already specified in the baseline architecture — they do not add new authority, new output types, or new decision paths beyond what the baseline already permits. If a future revision of the implementation introduces genuinely new event types not traceable to the baseline documents, those must be proposed as amendments to the relevant baseline specification (Mission Executive, HMS, XE, or Architecture) before being reflected here, consistent with this document's instruction to preserve the original architecture rather than rewrite it to match the implementation.

Open items carried forward unchanged from AFIP-SE-001 §10 continue to apply and are not restated here.

---

**End of Document 2 — AFIP Event Flow Specification**
