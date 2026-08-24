# Autonomous Flight Intelligence Platform (AFIP)
## Complete System Data Flow Document

**Document ID:** AFIP-SE-001
**Document Type:** Systems Engineering — Data Flow Specification
**Status:** Draft v0.1
**Prepared By:** Systems Engineering & Documentation Lead (AFIP)
**Derived From:** AFIP Product Specification v0.2; AFIP Software Architecture v0.1; AFIP World State Engine v0.1; AFIP Mission Executive v0.1; AFIP Navigation System v0.1; AFIP Health Monitoring System v0.1; AFIP Explainability Engine v0.1
**Scope of this document:** A complete, single-reference description of how data moves through AFIP, from raw evidence to explained, arbitrated intent. No code, no data schemas, no message formats, no UI. This document does not redesign, extend, or reinterpret the source specifications — every flow, boundary, and object described below is traceable to a specific statement in the documents listed above.

---

## 1. Purpose

This document exists to answer one question at the whole-system level: **as data moves from raw evidence to an aircraft-facing intent, exactly which system produces it, which system consumes it, in which direction, and under what discipline?**

Each individual source document already answers this question for its own boundary. This document does not replace any of them — it assembles their boundary contracts into one continuous, traceable picture, so that an engineer, reviewer, or judge can see the whole system's data flow without cross-referencing seven documents simultaneously.

---

## 2. System Context

AFIP is a cognitive layer. It does not fly the aircraft and does not simulate it (Product Spec §1). Two systems sit outside AFIP's boundary and are never redefined by it:

- **Flight Simulator** — sole source of physical truth (Product Spec §10, §11; Architecture §8, P9). Owned by the Aircraft Engineering/Simulation team.
- **Flight Control Layer** (PX4/ArduPilot-class autopilot) — sole authority for attitude control, stabilization, and low-level failsafes (Product Spec §1, §9).

One human-facing boundary also sits outside AFIP's decision core:

- **Ground Operator** — a source of proposed intent, never a privileged command channel (Product Spec §9.15, §11).

```
┌─────────────────────────────────────────────────────────────────────┐
│                                 AFIP                                 │
│   (Evidence Intake → World State Engine → Situational Reasoning →    │
│    Decision & Arbitration → Explainability & Record)                 │
└─────────────────────────────────────────────────────────────────────┘
        ▲ evidence flows up                    authority flows down │
        │                                                            ▼
┌───────────────────────┐                          ┌──────────────────────┐
│   Flight Simulator     │◄────── guidance ─────────│  Navigation System    │
│ (sole physical truth)  │        setpoints         │ (tactical/geometric)  │
└───────────────────────┘                          └──────────────────────┘
        │                                                            ▲
        └───────────── autopilot / low-level control ────────────────┘
                     (Flight Control Layer — outside AFIP)

┌───────────────────────┐
│    Ground Operator     │──── proposed intent (checked, not privileged) ───► Arbitration
└───────────────────────┘
```

---

## 3. Layered Data Flow Overview

Restated from Architecture §2 and §4, as the top-level frame every later section refines:

```
Evidence  →  World State Engine (Belief)  →  Situational Reasoning (Judgment)
                                                        │
                                                        ▼
                                                Proposed Intent
                                                        │
                                                        ▼
                                                  Arbitration
                                          ┌─────────────┼─────────────┐
                                      ACCEPT         MODIFY         REJECT
                                          │             │              │
                                          └──────┬──────┘              │
                                                  ▼                     │
                                     Accepted Intent → Navigation      │
                                     System → Flight-Control Boundary  │
                                                  │                     │
                                                  ▼                     ▼
                                     Explanation + Permanent Record (always, regardless of outcome)
```

Three flow rules govern every arrow in this diagram without exception (Architecture §4):

1. Evidence never reaches Situational Reasoning or Decision & Arbitration directly — it must be reconciled into belief first.
2. A proposed intent never reaches the flight-control boundary without passing through Arbitration, regardless of source (Mission Executive or Operator) or urgency.
3. Every Arbitration outcome — accepted, modified, or rejected — is recorded and explained, with no exception for "nothing changed."

---

## 4. Data Flow by Interface

Each interface below states: what crosses it, in which direction, what discipline governs it, and which document is authoritative for its detail.

### 4.1 Flight Simulator/Sensors → Evidence Intake (Layer A)

- **What crosses:** Raw signals — position, attitude, tilt-rotor nacelle angle, payload state, subsystem telemetry, sensor data (Product Spec §2.1).
- **Direction:** Upward only.
- **Discipline:** Evidence Intake tags each signal with source and time and performs no interpretation, no fusion, no judgment (Architecture §3.1). It produces **Evidence Records** — raw signal + source + time, nothing else (WSE §3.1).
- **Authoritative source:** Architecture §3.1; WSE §3.1.

### 4.2 Evidence Intake → World State Engine (Layer B)

- **What crosses:** Evidence Records only.
- **Direction:** Upward only.
- **Discipline:** The WSE is the *only* place in AFIP where raw evidence becomes belief (WSE §0). It reconciles Evidence Records — including disagreeing ones — into **Belief Fields**, each carrying Value, Confidence, Freshness, and Provenance (WSE §3.2). Nothing above Layer A is permitted to read Evidence Records directly (Architecture Invariant 1).
- **Authoritative source:** WSE §2, §3.1, §3.2.

### 4.3 World State Engine → Situational Reasoning (Layer C: Mission Executive, Health Monitoring System)

- **What crosses:** Exactly one object — the **World State Snapshot** — published atomically, versioned, and internally consistent (WSE §2, §3.6).
- **Direction:** Upward only, read-only.
- **Discipline:** No sub-object of the Snapshot (Aircraft State, Environment State, Mission State) is ever exposed individually (WSE §6). Both the Mission Executive and the Health Monitoring System read the *whole* Snapshot each cycle; neither reads an individual Belief Field, an Evidence Record, or the Reconciliation Record (Mission Executive §3.3; HMS §4.4). Neither system writes back into the WSE under any condition (WSE §8).
- **Authoritative source:** WSE §2, §4, §8; Mission Executive §3; HMS §4.

### 4.4 Health Monitoring System → Mission Executive

- **What crosses:** A single consolidated unit per cycle: Overall Health classification (nominal/degraded/critical), Health Score + justification reference set, and the current set of Warnings, Predicted Failures, and Recommended Actions (HMS §10.1).
- **Direction:** Upward only, into the Mission Executive's health-domain judgment.
- **Discipline:** The HMS has no proposal authority and no path to the flight-control boundary (HMS §0). Its output is consumed at Mission Executive Decision Flow step 2/3 (deterministic classification) and step 4 (advisory integration) — never as a decision in its own right (HMS §10.2; Mission Executive §2).
- **Authoritative source:** HMS §5, §10; Mission Executive §2 steps 2–4.

### 4.5 Situational Reasoning → Proposed Intent (Decision & Arbitration, Layer D — Proposal half)

- **What crosses:** A **Proposed Intent** (continue / adjust / hold / divert / abort-RTB) and its **Justification Reference Set**, generated together as one unit (Mission Executive §2 step 8, §4).
- **Direction:** Downward, into Arbitration.
- **Discipline:** Proposal and justification are never staggered — justification is not generated after the fact (Architecture P6). The Mission Executive has no further influence over the proposal once it crosses this boundary (Mission Executive §2 step 9).
- **Authoritative source:** Mission Executive §2, §4.

### 4.6 Proposed Intent → Arbitration (Layer D — Arbitration half)

- **What crosses:** The Proposed Intent, from either the Mission Executive or the Operator Interface Boundary, on equal footing (Product Spec §9.15; Mission Executive §6.4).
- **Direction:** Into the single independent check.
- **Discipline:** Arbitration is structurally distinct from Proposal specifically so the function proposing an action is never the function approving it (Architecture §3.4). Arbitration fails closed: absence of a valid check result is rejection, never permission (Architecture Invariant 3).
- **Output:** Accept / Modify / Reject.
- **Authoritative source:** Architecture §3.4, §4, Invariant 2, Invariant 3.

### 4.7 Arbitration → Navigation System (Accepted Intent)

- **What crosses:** An **Accepted Intent** — a high-level intent (continue/adjust/hold/divert-to-\<candidate\>/abort-RTB-to-\<base\>) plus any envelope constraint Arbitration attached (e.g., under a CAUTIOUS posture) (NS §3.1).
- **Direction:** Downward, out of AFIP's cognitive core.
- **Discipline:** This is the *only* channel through which strategic authority reaches the Navigation System (NS §6, flow rule 1). NS has no visibility into the pre-arbitration Proposed Intent (NS §3.3).
- **Authoritative source:** NS §0, §3.1, §6.

### 4.8 Navigation System → Flight Simulator's Guidance Interface

- **What crosses:** Desired Route, Next Waypoint, Desired Heading/Speed/Altitude (NS §4.1).
- **Direction:** Downward, to the flight-control boundary — never to actuators or control surfaces.
- **Discipline:** NS never issues an actuator or control-surface command under any condition (NS §4.3; Product Spec §4).
- **Authoritative source:** NS §4.1, §11.3.

### 4.9 Navigation System → Evidence Intake (Feedback Loop)

- **What crosses:** Route Status (nominal/deviating/locally-replanning/blocked-rerouting/unreachable), ETA and remaining distance/energy, position/route confidence, ranked candidate landing sites (NS §4.2).
- **Direction:** Upward, re-entering AFIP as ordinary evidence.
- **Discipline:** NS facts enter through the same channel any sensor would use — Evidence Intake — and are reconciled by the WSE with the same confidence/freshness discipline as any other source (NS §6, flow rule 2; NS §11.2). NS never returns a decision to the Mission Executive and never writes to or reads the WSE Snapshot directly (NS §11.1, §11.2).
- **Authoritative source:** NS §4.2, §6, §11.

### 4.10 Situational Reasoning / Arbitration → Explainability Engine (Layer E — Explanation)

- **What crosses:** The Justification Reference Set (Mission Executive §4.2) and the Arbitration outcome, captured together as a single, immutable pair per decision cycle (XE §5, Stage 1).
- **Direction:** One-way, read-only.
- **Discipline:** The XE writes nothing back into any upstream object; its output never influences a future decision (XE §0). It does not reason — it renders already-produced material using fixed templates and fixed vocabulary, with no generative or model-based component (XE §0, §5).
- **Authoritative source:** XE §0, §3, §5.

### 4.11 Operator Interface Boundary → Arbitration

- **What crosses:** Operator-issued commands, routed into the *same* proposal path Arbitration checks (Architecture §3.6).
- **Direction:** Into Arbitration, on equal footing with Mission Executive proposals.
- **Discipline:** No privileged, unchecked channel exists for a human operator any more than for AFIP itself (Architecture P10; Product Spec §9.15).
- **Authoritative source:** Architecture §3.6; Mission Executive §6.4.

### 4.12 All World Model / Snapshot Objects → Operator Interface Boundary (Situational Awareness)

- **What crosses:** Current understanding (Snapshot-derived classifications), current intent (Active Intent Register / Mission Phase State / Executive Posture), and current explanations — read-only, for display.
- **Direction:** Upward/outward, informational only.
- **Discipline:** This is a side-channel visibility property, not a decision output, and carries no authority (Mission Executive §4.3; Product Spec §9.14).
- **Authoritative source:** Mission Executive §1.1, §4.3; XE §10.

---

## 5. Consolidated Data Flow Diagram

```
                       ┌───────────────────────────┐
                       │   Flight Simulator (truth) │
                       └──────────────┬────────────┘
                                      │ raw signals
                                      ▼
                       ┌───────────────────────────┐
                       │   Evidence Intake (A)      │
                       │   (tag source+time only)   │
                       └──────────────┬────────────┘
                                      │ Evidence Records
                                      ▼
                       ┌───────────────────────────┐
                       │  World State Engine (B)    │
                       │  Aircraft / Environment /  │
                       │  Mission State → Snapshot  │
                       └──────┬───────────────┬─────┘
                    Snapshot  │               │ Snapshot
                    (read-only)               (read-only)
                              ▼               ▼
                 ┌────────────────────┐  ┌──────────────────────┐
                 │ Health Monitoring   │  │  Mission Executive     │
                 │ System (Layer C:    │─►│ (Layer C + Proposal    │
                 │ health domain)      │  │  half of Layer D)      │
                 └────────────────────┘  └───────────┬───────────┘
                                        Proposed Intent│ + Justification
                                                        ▼
                                          ┌───────────────────────┐
                        Operator ────────►│      Arbitration        │
                        Command           │  (Layer D — checked)    │
                                          └───────────┬───────────┘
                                  ACCEPT/MODIFY/REJECT │
                        ┌─────────────────────────────┼─────────────────────┐
                        ▼                                                     ▼
              ┌───────────────────┐                                ┌───────────────────┐
              │ Navigation System  │                                │ Explainability     │
              │ (tactical/geometric)│                                │ Engine (Layer E)   │
              └─────────┬─────────┘                                └───────────────────┘
        Desired Route/  │  ▲ Route Status, ETA,                     (renders explanation,
        Setpoints       │  │ candidate sites,                        no write-back)
                        ▼  │ confidence — as evidence
              ┌───────────────────┐
              │  Flight Simulator's │
              │  Guidance Interface │
              │  (Flight-Control    │
              │  Layer, outside AFIP)│
              └───────────────────┘
```

---

## 6. Data Object Catalog (Summary)

Full detail lives in each system's own document; this table exists so a reader does not have to open all seven to see what exists.

| Object | Owner (Sole Writer) | Consumed By | Authoritative Source |
|---|---|---|---|
| Evidence Record | Evidence Intake (Layer A) | World State Engine only | WSE §3.1, §4 |
| Belief Field (Value/Confidence/Freshness/Provenance) | World State Engine | WSE internal only (never exposed individually) | WSE §3.2, §4 |
| Aircraft State (Kinematic, Propulsion/Actuation, Power/Energy, Payload, Subsystem Health) | World State Engine | WSE internal (composes Snapshot) | WSE §3.3 |
| Environment State (Atmospheric, Obstacle/Traffic, Geofence, Candidate Sites) | World State Engine | WSE internal | WSE §3.4 |
| Mission State (Mission Definition, Mission Progress) | World State Engine | WSE internal | WSE §3.5 |
| World State Snapshot | World State Engine | Mission Executive, HMS (read-only) | WSE §3.6, §4 |
| Reconciliation Record | World State Engine | Explainability & Record (one-way) | WSE §3.7, §4 |
| Health Score, Warnings, Predicted Failures, Recommended Actions, Mission Readiness | Health Monitoring System | Mission Executive; Explainability Engine | HMS §5, §10 |
| Active Intent Register, Last-Cycle Outcome | Mission Executive (internal continuity state — not a belief) | Mission Executive internal only | Mission Executive §3.2 |
| Proposed Intent + Justification Reference Set | Mission Executive | Arbitration; Explainability Engine | Mission Executive §4 |
| Arbitration Outcome (Accept/Modify/Reject) | Arbitration | Mission Executive (next cycle, as continuity state); Navigation System (Accepted Intent); Explainability Engine | Architecture §3.4; Mission Executive §2 step 10 |
| Accepted Intent | Arbitration | Navigation System | NS §3.1 |
| Desired Route, Next Waypoint, Desired Heading/Speed/Altitude | Navigation System | Flight Simulator's guidance interface | NS §4.1 |
| Route Status, ETA, Position/Route Confidence, Ranked Candidate Sites | Navigation System | Evidence Intake (as ordinary evidence) | NS §4.2 |
| Rendered Explanation (Decision Summary, Reasoning, Confidence, Evidence, Alternatives, Operator Messages) | Explainability Engine | Operator Interface Boundary; permanent Record | XE §4 |

---

## 7. Ownership and Single-Writer Discipline

A single-writer rule governs every object in Section 6, without exception (WSE §4). No object above Layer A is ever written by anything above the layer that owns it. This table restates the governing rule at the whole-system level:

| Rule | Statement | Source |
|---|---|---|
| No-skip rule | A layer may only exchange information with the layer immediately adjacent to it. | Architecture §2 |
| Single writer | Every object has exactly one writer; every other system is a read-only consumer of it. | WSE §4 |
| No write-back | Layer C, D, and E have no write path into any WSE object. NS never writes to the WSE. The XE never writes back into anything it reads. | WSE §8; NS §11.2; XE §0 |
| Belief/Intent separation | Belief (WSE) and intent (Mission Executive/Arbitration) are never the same structure and are never merged. | Architecture P4, Invariant 5 |
| Fail-closed arbitration | Absence of a valid Arbitration result is treated as rejection, never as permission. | Architecture Invariant 3 |

---

## 8. Cadence Summary

Restated from WSE §5 and HMS §9 at the system level — full detail remains in the WSE document:

| Data category | Update model | Rationale |
|---|---|---|
| Kinematic/Pose belief | Continuous, essentially every reconciliation cycle | Navigation judgment depends on currency (WSE §5.2) |
| Propulsion/Actuation, Power/Energy belief | High but slightly lower rate than pose | Reflects natural rate of physical change (WSE §5.2) |
| Payload, Subsystem Health belief | Event-driven (attach/detach, sensor state change) | Changes discretely, not continuously (WSE §5.2) |
| Environment belief | Lower rate than aircraft kinematic state, except fast-changing sources (e.g., obstacle sensors) | Slower-varying by nature (WSE §5.2) |
| Mission Definition belief | On new evidence only (new/amended assignment) | Not resampled on any clock (WSE §5.2) |
| Mission Progress belief | Recomputed every time relevant Aircraft State changes | Always consistent with its Snapshot (WSE §5.2) |
| WSE Snapshot publication | Bounded, regular cycle (not on every individual reconciliation) | Prevents Layer C from observing a half-reconciled world (WSE §5.1) |
| HMS Health Score / classification | Refreshed every reasoning cycle, as a consolidated unit | Mirrors Snapshot discipline (HMS §6.7) |
| Mission Executive reasoning cycle | One per published Snapshot | Mission Executive §2 |
| XE explanation rendering | At the moment each decision is made | Architecture P6; XE §2 |

---

## 9. Governing Data Flow Invariants

Carried forward from Architecture §10 and restated as they apply to data flow specifically:

1. No layer above Layer A ever reasons on raw, unreconciled evidence.
2. No proposed intent — from AFIP or from a human operator — ever reaches the flight-control boundary without passing through Arbitration.
3. Arbitration fails closed: absence of a valid check result is rejection, never permission.
4. Advisory (model/statistical) judgment never directly produces a proposed intent; it only ever informs deterministic judgment.
5. Belief and intent are never the same structure, and no downstream system writes back into an upstream belief store.
6. Every decision — accepted, modified, or rejected — produces an explanation and a permanent record at the moment it is made.
7. Any loss of confidence, freshness, or internal integrity results in AFIP reducing its own authority, never increasing autonomous action.
8. AFIP never duplicates, overrides, or second-guesses the flight simulator's ownership of physical truth.
9. The Navigation System never substitutes a new destination on its own authority; it reports infeasibility as a fact for the Mission Executive to judge.
10. The Explainability Engine never adds a fact, a judgment, or a decision that was not already produced upstream.

---

## 10. Traceability Notes

This document introduces no new object, no new module, and no new interface beyond what is already specified in the seven source documents. Every section above cites its authoritative source document and section number so that any future revision to a source document can be mechanically traced to the corresponding section here.

Open items (unresolved questions from the source documents that materially affect data flow) are carried forward, not resolved, in this document:

- Whether Environment State reserves an explicit sub-grouping for airframe-specific aerodynamic sensitivity (WSE Open Item 1; Mission Executive Open Item 3; HMS Open Item 3) — affects the granularity of data available at the Environment State → HMS/Mission Executive interface, not the flow structure itself.
- Whether Mission Definition belief must represent multi-stop/re-taskable missions (WSE Open Item 2; Product Spec §7.4) — affects the internal structure of the Mission State object, not its flow path.
- Whether more than one simultaneous Mission Definition or Operator source must be reconcilable (WSE Open Item 3; Architecture Open Question 2) — affects fan-in at the Evidence Intake and Operator Interface Boundary, not the layering discipline.

---

**End of Document 1 — Complete System Data Flow Document**
