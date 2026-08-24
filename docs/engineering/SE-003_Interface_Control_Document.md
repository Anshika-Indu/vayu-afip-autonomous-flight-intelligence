# Autonomous Flight Intelligence Platform (AFIP)
## Interface Control Document (ICD)

**Document ID:** AFIP-SE-003
**Document Type:** Systems Engineering — Interface Control Document
**Status:** Draft v0.1
**Prepared By:** Systems Engineering & Documentation Lead (AFIP)
**Derived From:** AFIP Product Specification v0.2; AFIP Software Architecture v0.1; AFIP World State Engine v0.1; AFIP Mission Executive v0.1; AFIP Navigation System v0.1; AFIP Health Monitoring System v0.1; AFIP Explainability Engine v0.1
**Related Documents:** AFIP-SE-001 (Complete System Data Flow Document); AFIP-SE-002 (Event Flow Specification)
**Baseline vs. Implementation:** The uploaded architecture documents are the authoritative baseline for every interface below. Where the current implementation phase realizes an interface under different working names or additional presentation surfaces, this is recorded in a labeled **Implementation Note** within the affected interface entry. No Implementation Note in this document changes producer, consumer, ownership, authority, or data contract as established by the baseline — each is a naming/realization clarification only. Any change to authority, ownership, or data flow direction is explicitly out of scope for this document and would require a **Future Proposal** entry (Section 6), never a silent edit here.
**Scope of this document:** Every interface that crosses a system boundary inside or at the edge of AFIP. This document is implementation-agnostic by design — no protocol, message format, wire schema, or transport mechanism is specified, consistent with the Product Specification's explicit exclusion of implementation detail (Product Spec §10) and the Architecture document's statement that the flight-control boundary's specific protocol is deliberately not architected (Architecture §8).

---

## 1. Purpose and Conventions

This ICD defines, for every interface in AFIP, the seven properties required for deterministic, testable, and auditable integration:

1. **Producer** — the sole system that originates the data crossing this interface.
2. **Consumer** — the system(s) permitted to read it.
3. **Update Frequency / Cadence** — how often the interface carries new data.
4. **Ownership** — which document and section is authoritative for this interface's existence and behavior.
5. **Data Contract** — what the interface carries, described at the conceptual/object level (never a wire schema).
6. **Confidence Propagation** — how confidence, freshness, and provenance are carried (or deliberately not carried) across the interface.
7. **Failure Behavior** — what happens when the interface's data is late, missing, degraded, or in conflict.

**Numbering convention:** Interfaces are numbered `ICD-AFIP-###` in the order data would traverse them from evidence to actuation (Section 3), followed by feedback and side-channel interfaces (Section 4).

**What this ICD is not:** It is not a data schema, message catalog, or protocol specification. Per every source document's own scope statement, no such detail is asserted here (Product Spec §10; Architecture, all sections; WSE, Mission Executive, NS, HMS, XE — each explicitly excludes schemas, code, and message formats from its own scope).

---

## 2. Interface Summary Table

| ID | Producer | Consumer | Interface Name |
|---|---|---|---|
| ICD-AFIP-001 | Flight Simulator / Sensors | Evidence Intake (Layer A) | Raw Signal Ingestion |
| ICD-AFIP-002 | Evidence Intake (Layer A) | World State Engine (Layer B) | Evidence Record Delivery |
| ICD-AFIP-003 | World State Engine (Layer B) | Mission Executive (Layer C) | World State Snapshot — Mission Executive |
| ICD-AFIP-004 | World State Engine (Layer B) | Health Monitoring System (Layer C) | World State Snapshot — HMS |
| ICD-AFIP-005 | Health Monitoring System | Mission Executive | Health Domain Judgment Handoff |
| ICD-AFIP-006 | Mission Executive (Proposal) | Arbitration (Layer D) | Proposed Intent + Justification |
| ICD-AFIP-007 | Operator Interface Boundary | Arbitration (Layer D) | Operator-Originated Proposed Intent |
| ICD-AFIP-008 | Arbitration (Layer D) | Navigation System | Accepted Intent |
| ICD-AFIP-009 | Arbitration (Layer D) | Mission Executive | Arbitration Outcome (Continuity Feedback) |
| ICD-AFIP-010 | Navigation System | Flight Simulator's Guidance Interface | Guidance Setpoints |
| ICD-AFIP-011 | Navigation System | Evidence Intake (Layer A) | Navigation Fact Feedback |
| ICD-AFIP-012 | Mission Executive + Arbitration | Explainability Engine (Layer E) | Decision + Outcome Capture |
| ICD-AFIP-013 | World State Engine | Explainability & Record (Layer E) | Reconciliation Record Feed |
| ICD-AFIP-014 | Explainability Engine (Layer E) | Operator Interface Boundary | Rendered Explanation / Alert |
| ICD-AFIP-015 | World State Engine / Mission Executive | Operator Interface Boundary | Situational Awareness Read Channel |

---

## 3. Primary (Evidence-to-Actuation) Interfaces

### ICD-AFIP-001 — Raw Signal Ingestion

| Property | Specification |
|---|---|
| **Producer** | Flight Simulator (sole source of physical truth) and, later, aircraft sensors |
| **Consumer** | Evidence Intake (Layer A) — exclusively |
| **Update Frequency** | As fast as the source produces signals; no fixed AFIP-imposed rate (Architecture §3.1) |
| **Ownership** | Architecture §3.1; Product Spec §10 |
| **Data Contract** | Raw signals: position, attitude, tilt-rotor nacelle angle, payload state, subsystem telemetry, sensor data (Product Spec §2.1). No interpretation, fusion, or judgment is applied at this interface. |
| **Confidence Propagation** | None carried at this interface — confidence does not yet exist for raw signals. Evidence Intake tags each signal only with **source** and **time** (Architecture §3.1; WSE §3.1); confidence is first computed one interface downstream, at ICD-AFIP-002/WSE reconciliation. |
| **Failure Behavior** | If expected evidence stops arriving, this interface itself has no failure state to report — the absence is detected and handled one layer up, at the WSE (WSE §7 row A; Architecture §7 row A). AFIP asserts no authority over, and performs no correction of, this interface's source. |

---

### ICD-AFIP-002 — Evidence Record Delivery

| Property | Specification |
|---|---|
| **Producer** | Evidence Intake (Layer A) |
| **Consumer** | World State Engine (Layer B) — exclusively; no layer above the WSE is permitted to read Evidence Records directly (Architecture Invariant 1) |
| **Update Frequency** | Continuous, asynchronous, as evidence arrives; not resampled or batched by Evidence Intake (WSE §5.1) |
| **Ownership** | WSE §3.1; Architecture §3.1, §4 flow rule 1 |
| **Data Contract** | Evidence Record: a raw signal, its source, and the time it was captured — nothing else (WSE §3.1) |
| **Confidence Propagation** | An Evidence Record itself carries no confidence value. Confidence is a property the WSE computes during reconciliation (WSE §3.2), derived from how many sources agreed, how recently they arrived, and whether they conflicted (WSE §3.2). |
| **Failure Behavior** | Evidence Intake performs no interpretation and therefore has no independent failure mode of its own beyond non-delivery, which the WSE detects and handles per its own freshness discipline (WSE §7 row A). |

---

### ICD-AFIP-003 — World State Snapshot (to Mission Executive)

| Property | Specification |
|---|---|
| **Producer** | World State Engine (Layer B) — sole writer |
| **Consumer** | Mission Executive (Layer C) — read-only |
| **Update Frequency** | Published on a bounded, regular cycle, distinct from the (faster, continuous) internal reconciliation cadence (WSE §5.1). Per-object volatility within the Snapshot varies (WSE §5.2): Kinematic/Pose belief refreshed essentially continuously between Snapshots; Propulsion/Actuation and Power/Energy at a high but slightly lower rate; Payload and Subsystem Health event-driven; Environment State at a lower rate except where a specific source demands faster attention; Mission Definition on new evidence only; Mission Progress recomputed whenever relevant Aircraft State changes. |
| **Ownership** | WSE §2, §3.6, §4, §5 |
| **Data Contract** | Exactly one object: the World State Snapshot, composed of one current instance each of Aircraft State, Environment State, and Mission State, plus a version marker and timestamp (WSE §3.6). No sub-object is ever exposed individually (WSE §6, §8). |
| **Confidence Propagation** | Every Belief Field composing the Snapshot carries Value, Confidence, Freshness, and Provenance inseparably (WSE §3.2). The Mission Executive inherits these as given facts and does not re-derive or second-guess them (Mission Executive §7.1). |
| **Failure Behavior** | If the WSE's reconciliation process cannot complete a cycle, no new Snapshot is published; the Mission Executive continues reasoning against the last valid Snapshot, whose age (and reduced trustworthiness) is visible to it (WSE §7 row 4; Architecture §7 row B). The Mission Executive has no path to request, correct, or annotate a Snapshot — any implied correction can only re-enter as new evidence on a future cycle (WSE §8). |

---

### ICD-AFIP-004 — World State Snapshot (to Health Monitoring System)

| Property | Specification |
|---|---|
| **Producer** | World State Engine (Layer B) — sole writer, same instance as ICD-AFIP-003 |
| **Consumer** | Health Monitoring System (Layer C, health domain) — read-only |
| **Update Frequency** | Identical publication cadence to ICD-AFIP-003; both consumers read the same Snapshot object (WSE §3.6) |
| **Ownership** | WSE §2, §3.6, §8; HMS §4.1–§4.4 |
| **Data Contract** | The HMS draws specifically on: Aircraft State (Power/Energy, Propulsion/Actuation, Payload, Subsystem Health Belief Fields), Environment State (Atmospheric/weather Belief Fields relevant to airframe loading and thermal margin), and Mission State (read only for context weighting — remaining distance/duration — never for achievability judgment, which stays exclusively with the Mission Executive) (HMS §4.1, §4.3). |
| **Confidence Propagation** | Identical discipline to ICD-AFIP-003: confidence and freshness are inherited exactly as computed by the WSE, never re-derived by the HMS (HMS §7.4). If confidence is too low to trust, the sub-domain is marked unknown rather than assigned an optimistic default score (HMS §7.4). |
| **Failure Behavior** | If no Snapshot is published for a cycle (WSE-side fault), the HMS reasons against the last valid Snapshot exactly as the Mission Executive does. If the HMS's own aggregation cannot complete a cycle, it reports "health unknown" for that cycle rather than a stale score presented as current (HMS §10.5). |

---

### ICD-AFIP-005 — Health Domain Judgment Handoff

| Property | Specification |
|---|---|
| **Producer** | Health Monitoring System |
| **Consumer** | Mission Executive — health-domain input only |
| **Update Frequency** | Once per reasoning cycle, as a single consolidated unit — never a partially-updated health picture (HMS §6.7, mirroring WSE Snapshot discipline) |
| **Ownership** | HMS §5, §10.1–§10.5; Mission Executive §2 steps 2–4 |
| **Data Contract** | Exactly three things, as one unit: Overall Health classification (nominal/degraded/critical), Health Score + justification reference set, and the current set of Warnings, Predicted Failures, and Recommended Actions (HMS §10.1). Nothing else crosses this boundary, and nothing crosses it in the reverse direction — the HMS has no visibility into the Mission Executive's Proposed or Accepted Intent (HMS §10.1). |
| **Confidence Propagation** | Health Score and classification each carry their own confidence, computed per HMS §7 (weighted composite + ceiling rule) from Snapshot-inherited confidence values (HMS §7.4). Predicted Failures each carry an explicit confidence and time horizon, never a bare prediction (HMS §8.7). Recommended Actions are confidence-tagged advisory suggestions that carry no authority of their own (HMS §5). |
| **Failure Behavior** | Consumed by the Mission Executive's precedence evaluation at step 2/3 (deterministic classification) and step 4 (advisory integration) (Mission Executive §2). A "health unknown" report (HMS §10.5) is treated by the Mission Executive's own gate (step 1) as insufficient confidence to reason about at all, driving a conservative fallback (Mission Executive §2 step 1). The HMS's classification can, on its own, drive an abort-class proposal ahead of mission status being consulted (HMS §10.2; Mission Executive §8.2) — but the HMS never chooses which specific proposal category results (HMS §10.4). |

**Implementation Note.** Where the current implementation phase computes health classification using functions labeled "Prediction Engine" internally (per AFIP-SE-002 §3.4), this interface's data contract is unchanged — the Prediction Engine's outputs are folded into the same three deliverables (classification, Health Score + justification, Warnings/Predicted Failures/Recommended Actions) already specified in HMS §5 and §10.1, not delivered as a separate interface.

---

### ICD-AFIP-006 — Proposed Intent + Justification (Mission Executive → Arbitration)

| Property | Specification |
|---|---|
| **Producer** | Mission Executive (Proposal function only) |
| **Consumer** | Arbitration (Layer D, Arbitration function only) |
| **Update Frequency** | Once per Mission Executive reasoning cycle (Mission Executive §2) |
| **Ownership** | Mission Executive §2 step 8–9, §4; Architecture §3.4, P2 |
| **Data Contract** | A Proposed Intent — one of a fixed set (Continue, Adjust, Hold, Divert, Abort/Return-to-Base) (Mission Executive §4.1) — and its Justification Reference Set (the specific Belief Fields, classifications, advisory flags, and precedence-evaluation branch that produced it), generated together as one unit (Mission Executive §2 step 8, §4.2). Never anything more specific than a high-level intent category — never an actuator value, trajectory, or control gain (Mission Executive §4.1). |
| **Confidence Propagation** | The Justification Reference Set carries domain-level confidence (weakest-link aggregation, Mission Executive §7.2) and decision-level (proposal-fit) confidence, tagged as deterministic or advisory-influenced (Mission Executive §7.3). Confidence is never invented at this interface — only inherited and aggregated per fixed rules (Mission Executive §7.1–§7.5). |
| **Failure Behavior** | If the Mission Executive's proposal function faults and cannot complete a cycle, Executive Posture is set to SUSPENDED and a single, pre-defined minimal safe proposal (varying by Mission Phase State) is substituted — this substituted proposal still crosses this interface and is still arbitrated in full (Mission Executive §6.2). The Mission Executive has no further influence over the proposal once it crosses this interface (Mission Executive §2 step 9). |

---

### ICD-AFIP-007 — Operator-Originated Proposed Intent

| Property | Specification |
|---|---|
| **Producer** | Operator Interface Boundary (routing an operator command, not originating judgment of its own) |
| **Consumer** | Arbitration (Layer D) — the same function, same check, as ICD-AFIP-006 |
| **Update Frequency** | Event-driven, on operator command issuance (Architecture §3.6) |
| **Ownership** | Architecture §3.6, P10; Product Spec §9.15, §11; Mission Executive §6.4 |
| **Data Contract** | A proposed intent from a human operator, structurally identical in kind to a Mission Executive proposal — no additional privilege, priority marker, or bypass flag is attached (Architecture §3.6). |
| **Confidence Propagation** | Not applicable in the same sense as a Mission Executive proposal — an operator command does not carry a Belief-derived confidence value. It is arbitrated purely against the fixed constraint set, on equal footing with an AFIP-originated proposal (Product Spec §9.15, §11). |
| **Failure Behavior** | An operator command issued during a critical condition is given no special priority over the Mission Executive's own abort-class proposal — both are proposed intents, both pass through the identical Arbitration check, and Arbitration decides between or reconciles them on the merits of the constraint check alone (Mission Executive §6.4). |

**Implementation Note.** Where the current implementation phase presents this boundary as "Operator Commands," the interface's ownership, authority, and non-privileged status are unchanged from Architecture §3.6 (see AFIP-SE-002 §3.9).

---

### ICD-AFIP-008 — Accepted Intent (Arbitration → Navigation System)

| Property | Specification |
|---|---|
| **Producer** | Arbitration (Layer D) |
| **Consumer** | Navigation System — the only channel through which strategic authority reaches NS (NS §6 flow rule 1) |
| **Update Frequency** | Once per Arbitration cycle that produces an accept/modify outcome; NS continues executing the last Accepted Intent between updates (NS §10) |
| **Ownership** | NS §0, §3.1, §6; Architecture §3.4 |
| **Data Contract** | A high-level intent (continue/adjust/hold/divert-to-\<candidate\>/abort-RTB-to-\<base\>), plus whatever target and envelope constraints Arbitration attached (e.g., a reduced-envelope constraint under CAUTIOUS posture) (NS §3.1). NS has no visibility into, and no path to, the pre-arbitration Proposed Intent (NS §3.3). |
| **Confidence Propagation** | The Accepted Intent itself does not carry a Belief-style confidence value — it is a checked, binary-in-force instruction. Any confidence relevant to NS's own execution (e.g., position confidence) is separately computed within NS's own independent perception pipeline (NS §3.2, §7), not inherited from this interface. |
| **Failure Behavior** | If the Accepted Intent channel is lost (communication loss), NS never invents a new strategic intent — it continues executing the last Accepted Intent's route to its already-sanctioned target, or holds if the intent was already "hold," and reports the comm loss as a fact (NS §10). There is no faster, less-checked emergency substitute for this interface (Product Spec §4, §9.9; Mission Executive §6). |

---

### ICD-AFIP-009 — Arbitration Outcome (Continuity Feedback to Mission Executive)

| Property | Specification |
|---|---|
| **Producer** | Arbitration (Layer D) |
| **Consumer** | Mission Executive — read as internal continuity state only, never as a belief |
| **Update Frequency** | Once per cycle, read back on the Mission Executive's next reasoning cycle (Mission Executive §2 step 10) |
| **Ownership** | Mission Executive §2 step 10, §3.2 |
| **Data Contract** | Accepted / Modified / Rejected, updating the Mission Executive's **Active Intent Register** (whichever intent Arbitration most recently accepted, unmodified or modified) and **Last-Cycle Outcome** (Mission Executive §3.2). This is explicitly not a belief and carries no confidence or freshness attribute of its own (Mission Executive §3.2). |
| **Confidence Propagation** | None — this interface is continuity state, architecturally distinct from belief, by design (Architecture P4; Mission Executive §3.2). |
| **Failure Behavior** | If Arbitration cannot produce a valid result, the proposal is treated as rejected by default, and the Mission Executive never interprets silence or an unclear outcome as approval to proceed (Architecture Invariant 3; Mission Executive §6.3). |

---

### ICD-AFIP-010 — Guidance Setpoints (Navigation System → Flight Simulator's Guidance Interface)

| Property | Specification |
|---|---|
| **Producer** | Navigation System |
| **Consumer** | Flight Simulator's autopilot-equivalent guidance layer (outside AFIP) |
| **Update Frequency** | Each NS planning/execution cycle, driven by Waypoint Manager's continuous progress tracking (NS §5) |
| **Ownership** | NS §4.1, §11.3; Product Spec §4, §10 |
| **Data Contract** | Desired Route (full ordered waypoint/leg sequence), Next Waypoint, Desired Heading/Speed/Altitude (NS §4.1). Never an actuator or control-surface command under any condition (NS §4.3; Product Spec §4). |
| **Confidence Propagation** | Not applicable in Belief-Field terms — these are deterministic guidance setpoints computed by NS's own deterministic route planning (NS §7), not confidence-scored beliefs. |
| **Failure Behavior** | If NS suffers an internal fault and cannot complete a planning cycle, it holds the last known-good Desired Route and setpoints rather than commanding an unvalidated new one, and reports the fault as a Route Status condition (NS §10). The flight-control layer (or simulator's control loop) beneath this interface remains the sole authority for low-level stabilization regardless of NS's own state (Product Spec §4, §10; Architecture §8). |

---

### ICD-AFIP-011 — Navigation Fact Feedback (Navigation System → Evidence Intake)

| Property | Specification |
|---|---|
| **Producer** | Navigation System |
| **Consumer** | Evidence Intake (Layer A) — NS is one more evidence source, tagged with source and time like any sensor (NS §6) |
| **Update Frequency** | Continuous/event-driven per Route Status change, ETA recomputation, and candidate-site refresh (NS §4.2, §5) |
| **Ownership** | NS §4.2, §6, §11.2 |
| **Data Contract** | Route Status (nominal/deviating/locally-replanning/blocked-rerouting/unreachable), ETA and remaining distance/energy-to-target, position/route confidence, ranked candidate landing sites and their suitability facts (NS §4.2). Stated as fact, never as a recommendation or a proposal (NS §4.2, §9 "Output discipline"). |
| **Confidence Propagation** | NS-reported facts enter Evidence Intake exactly as any other evidence source would, then are reconciled by the WSE into Belief Fields using the same confidence/freshness discipline applied to every other input (NS §11.2, WSE §3.2, §5.3) — NS does not pre-assign a WSE-style confidence value itself; it reports its own internally computed confidence (e.g., degraded during GPS loss) as one more fact for the WSE to reconcile. |
| **Failure Behavior** | NS never writes to the WSE directly and never reads the WSE Snapshot (NS §11.2, WSE §4 Ownership Map) — this interface is strictly one-way, upward, through Evidence Intake, preserving the WSE's single-writer rule without exception. |

---

## 4. Secondary (Explanation, Record, and Situational Awareness) Interfaces

### ICD-AFIP-012 — Decision + Outcome Capture (Mission Executive + Arbitration → Explainability Engine)

| Property | Specification |
|---|---|
| **Producer** | Mission Executive (Justification Reference Set) and Arbitration (Outcome), captured together |
| **Consumer** | Explainability Engine (Layer E — Explanation half) |
| **Update Frequency** | At the moment the Mission Executive completes step 8 of its decision flow and Arbitration returns its outcome — captured as a single, immutable pair, tagged with Snapshot version and timestamp (XE §5 Stage 1) |
| **Ownership** | XE §3, §5 Stage 1; Architecture P6 |
| **Data Contract** | The full Justification Reference Set (Belief Fields, classifications, advisory flags, precedence branch) plus the Arbitration outcome (accepted/modified/rejected, and for modified, what was changed) (XE §3 table). The XE never sees Arbitration's internal constraint-check logic, only its outcome (XE §3). |
| **Confidence Propagation** | Every element of the justification set is tagged deterministic fact or advisory-derived (XE §5 Stage 2) and this tag is carried through to the final rendered output without being dropped or merged away (XE §5 Stage 2). Confidence values are never invented by the XE — only read or aggregated by fixed rule (XE §6). |
| **Failure Behavior** | If any pipeline stage cannot complete (e.g., a SUSPENDED-posture minimal safe proposal with no normal justification), the XE renders the gap itself as the explanation rather than fabricating plausible-sounding reasoning (XE §5 Stage 9). This never blocks or delays the underlying decision (Architecture §7 row E; XE §2 item 9). |

---

### ICD-AFIP-013 — Reconciliation Record Feed (World State Engine → Explainability & Record)

| Property | Specification |
|---|---|
| **Producer** | World State Engine |
| **Consumer** | Explainability & Record (Layer E) — one-way |
| **Update Frequency** | Appended continuously, alongside each Snapshot's publication (WSE §3.7) |
| **Ownership** | WSE §3.7, §8 |
| **Data Contract** | An append-only account of how each published Snapshot came to hold the values it held — which Evidence Records were reconciled, where they agreed or conflicted, how confidence and freshness were arrived at for each Belief Field (WSE §3.7). |
| **Confidence Propagation** | This record preserves, rather than resolves, disagreement — conflicting evidence is retained as part of the record, never silently averaged (WSE §3.7, §7). |
| **Failure Behavior** | This object flows in exactly one direction — out of the WSE, into Layer E. It is never read back by the WSE, Mission Executive, or HMS (WSE §3.7), which is what prevents AFIP's own history from biasing its future belief formation. |

---

### ICD-AFIP-014 — Rendered Explanation / Alert (Explainability Engine → Operator Interface Boundary)

| Property | Specification |
|---|---|
| **Producer** | Explainability Engine |
| **Consumer** | Operator Interface Boundary; permanent Record |
| **Update Frequency** | Generated at the moment each decision is made (Architecture P6; XE §2 item 2), not reconstructed later |
| **Ownership** | XE §4, §8, §10 |
| **Data Contract** | Six parts generated together as a single unit: Decision Summary, Reasoning, Confidence, Supporting Evidence, Alternative Actions, Operator Messages (XE §4). Presented at three progressive-disclosure depths (Summary / Reason+Confidence+top Evidence / full detail) (XE §10). |
| **Confidence Propagation** | Confidence reported at multiple, never-collapsed levels: domain-level (Navigation/Health/Mission) and decision-level (domain confidence floor + proposal-fit confidence, tagged deterministic vs. advisory-influenced) (XE §6). An "unknown" domain is never displayed as a numeric low-confidence value (XE §6.5). |
| **Failure Behavior** | Alert priority (Information/Warning/Critical/Emergency) is derived deterministically from proposal category and Arbitration outcome — never from the XE's own assessment of operator workload (XE §8). A qualifying Critical/Emergency condition is never displayed at a lower priority, and a rejected or modified outcome is never demoted to reduce interruption (XE §8, two structural rules). |

---

### ICD-AFIP-015 — Situational Awareness Read Channel (World State / Mission Executive → Operator Interface Boundary)

| Property | Specification |
|---|---|
| **Producer** | World State Engine (via Mission Executive's read of the Snapshot) and Mission Executive (Mission Phase State, Executive Posture, domain classifications) |
| **Consumer** | Operator Interface Boundary — for display only |
| **Update Frequency** | Continuously reflects current Snapshot and Mission Executive state; not a decision output and not gated by the Arbitration cycle |
| **Ownership** | Mission Executive §1.1, §4.3; Product Spec §9.14 |
| **Data Contract** | Domain classifications and Executive Posture are made available read-only for situational awareness — this is a side-channel visibility property, carrying no authority of its own (Mission Executive §4.3). |
| **Confidence Propagation** | Identical to the underlying Snapshot/classification confidence — nothing is re-derived for display purposes. |
| **Failure Behavior** | This channel has no write path back into any AFIP object; it is read-only in both the technical and authority sense (Product Spec §9.14; Architecture §3.6). |

---

## 5. Cross-Interface Confidence Propagation Rule

A single confidence-propagation discipline governs every interface in this ICD, restated here as a global rule rather than repeated at each entry:

1. **Confidence is created exactly once** — at the WSE, during reconciliation (WSE §3.2). No interface downstream of the WSE invents a new confidence value; every downstream system either inherits it as-is or aggregates it by a fixed, documented rule (Mission Executive §7.1; HMS §7.4; XE §6).
2. **Aggregation is always weakest-link, never averaged**, at every level it occurs (domain-level in the Mission Executive, Mission Executive §7.2; Health Score sub-domain ceiling rule in the HMS, HMS §7.1; domain confidence floor in the XE, XE §6.4).
3. **"Unknown" is a distinct state from "low confidence"** and is never collapsed into a numeric value at any interface (Mission Executive §7.4; HMS §7.4; XE §6.5).
4. **Confidence never recovers from silence** — at every interface in this document, a value's confidence only rises when a fresh, materially supporting Snapshot actively confirms improvement, never merely because no new bad evidence arrived (Mission Executive §7.5; XE §6.6).
5. **Deterministic and advisory-derived confidence are never blended** into one indistinguishable figure at any interface — the tag applied at the WSE/HMS/Mission Executive is carried through unchanged to the XE's rendered output (Architecture §6; Mission Executive §7.3; XE §5 Stage 2, §6.4).

---

## 6. Future Proposals (Explicitly Out of Scope for This ICD)

Per the governing instruction for this document, no authority, ownership, or data-flow direction is changed here. The following are noted as candidate topics for a **future proposal**, requiring amendment of the relevant baseline document before any ICD entry could reflect them — they are not adopted, implied, or partially implemented by anything above:

- A direct interface between the Health Monitoring System and the Explainability Engine (bypassing the Mission Executive's Justification Reference Set) is not specified in any baseline document and is not implied by ICD-AFIP-012; today, HMS-originated facts reach the XE only via the Mission Executive's Justification Reference Set (HMS §10.1; XE §3 table, "Health Events" row).
- Multi-operator or fleet-level interface fan-in at ICD-AFIP-007 and ICD-AFIP-015 remains an open question in the Architecture document (Architecture Open Question 2) and is not resolved by this ICD.
- Any interface representing a "Mission Planner" as a system distinct from Mission Definition belief ingestion (WSE §3.5) is not specified in the baseline and would require a new architectural section, not an ICD entry, if introduced.

---

## 7. Traceability Notes

Every interface above traces to a specific section of its producing and consuming system's own document. No interface in this ICD introduces a data element, confidence rule, or failure behavior not already stated in the baseline. Implementation Notes in Sections 3–4 mark where current implementation-phase naming (Prediction Engine, Operator Commands, etc., per AFIP-SE-002) applies to an existing interface; none of them alter this document's Producer, Consumer, Ownership, Data Contract, Confidence Propagation, or Failure Behavior fields.

---

**End of Document 3 — Interface Control Document (ICD)**
