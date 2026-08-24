# Autonomous Flight Intelligence Platform (AFIP)
## System Design Report

**Document Series:** AFIP Professional Documentation Suite — 2 of 8
**Classification:** Internal / Program Reference
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, Airframe CFD Report
**Status:** Design-stage; implementation of the layers described below is in progress on separate engineering tracks

---

## 1. Purpose and Scope

This report describes AFIP's system-level design: its system context, subsystem decomposition, interface boundaries, and the design decisions that connect stated requirements to the architecture that satisfies them. It is written at the level of a system design review (SDR) package and does not restate implementation-level detail owned by the Software Architecture Document — it summarizes and cross-references that detail for traceability.

---

## 2. System Context

AFIP is one of three systems in the current program, each with a distinct and non-overlapping scope:

| System | Owns | Relationship to AFIP |
|---|---|---|
| Heavy-Lift Autonomous Cargo Drone Simulator | Aircraft physics; sole source of physical truth | AFIP is a downstream observer only |
| Flight Control Layer (PX4/ArduPilot-class) | Attitude control, stabilization, low-level failsafes | AFIP's only outward influence is a checked, high-level proposed intent |
| AFIP | Understanding, cross-domain reasoning, decision proposal, explanation | Strictly subordinate to both systems above |

AFIP has no authority that bypasses this context under any operating condition, including emergencies (Product Spec §4, §11).

---

## 3. System-Level Design Drivers

Three design drivers, established in the Product Specification and confirmed by the CFD report, shape every subsystem decision in this report:

1. **The aircraft is a heavy-lift, real-scale bi-copter tiltrotor VTOL** — fuselage ~2.6 m, arm span ~2.8 m, dual 0.8 m ducted fans — not a small consumer platform. Reasoning scale and mission timeframes are designed accordingly.
2. **The aircraft transitions through a distinct, less-stable regime** between hover and cruise via tilting nacelles. This transition is treated as a real flight phase in AFIP's reasoning, not an edge case.
3. **The current airframe is aerodynamically non-ideal in forward flight** — CFD analysis (OpenFOAM `simpleFoam`, 15 m/s, ~180,000 cells) shows C_D = 6.58, C_L = -2.64, and C_M = +1.36, indicating high drag, net downforce, and a persistent nose-up moment. AFIP's health and mission reasoning is designed to operate honestly under these real, known operating conditions rather than an idealized performance envelope.

---

## 4. System Decomposition

AFIP is decomposed into five internal layers, bounded below by the flight-control layer and above by the human-facing layer (both outside AFIP's decision core):

| Layer | Responsibility (single-sentence) |
|---|---|
| A — Evidence Intake | Receive and timestamp whatever the simulator/aircraft exposes; no interpretation |
| B — Belief Formation | Reconcile evidence into one confidence-scored understanding |
| C — Situational Reasoning | Judge health, navigation, and mission status, cross-referenced against one another |
| D — Decision & Arbitration | Propose intent; independently check every proposal before it may proceed |
| E — Explainability & Record | Render explanation and permanent record; never feeds back into a decision |

Information flows upward (signal → belief → decision); authority flows downward (decision → checked intent). A strict no-skip rule prevents any layer from exchanging information with a non-adjacent layer — this is the structural mechanism that prevents urgency or confidence from ever compressing the path from raw signal to aircraft action.

---

## 5. Requirements-to-Design Traceability

A representative sample of the full traceability set maintained against the Product Specification's 15 functional requirements (§9):

| Requirement (Product Spec §9) | Design Element Satisfying It |
|---|---|
| §9.1 Perceive and Fuse | Layer B, Belief Formation — sole point where evidence becomes belief |
| §9.4–9.6 Reason about health, navigation, mission | Layer C, Situational Reasoning — cross-domain judgment structure |
| §9.8 Propose, Never Command | P1 — no code path in AFIP issues an actuator command |
| §9.9 Respect Independent Arbitration | P2 — one independent check, no bypass, including emergencies |
| §9.10 Explain Every Decision | Layer E — explanation produced as a byproduct of the decision, not reconstructed afterward |
| §9.11 Distinguish Certainty from Advice | The Certainty/Advisory Boundary — advisory judgment can only ever raise a flag, never a decision |
| §9.12 Degrade Conservatively | Per-layer degradation table — every failure mode reduces authority, never increases autonomous action |
| §9.13 Preserve a Complete Record | Layer E — permanent record of every proposal, accepted or rejected |
| §9.15 Accept Operator Input Without Privilege | Operator Interface Boundary — operator commands pass through the same arbitration as AFIP's own proposals |

---

## 6. Interface Boundaries

AFIP maintains exactly two external interface boundaries, both deliberately narrow:

- **Simulator/Aircraft Boundary (below Layer A):** One-directional evidence intake. AFIP never writes to this boundary.
- **Flight-Control Boundary (below Layer D):** One-directional checked intent, passed through independent arbitration. This is the only boundary across which AFIP can influence the aircraft, and it is structurally isolated from the rest of AFIP so the flight-control layer beneath it can be changed or upgraded without requiring any change elsewhere in AFIP.

No specific protocol, message format, or command set is defined at this design level — per Product Specification scope (§10), that detail belongs to implementation-level engineering documentation.

---

## 7. Verification Approach

Because AFIP's authority is expressed only as checked, high-level proposed intent, system-level verification is structured around three questions, each independently testable against a mocked World Model:

1. Does every proposal pass through arbitration with no bypass path, under nominal and fault conditions?
2. Does every documented failure mode (Software Architecture §7) produce a reduction in authority rather than an increase in autonomous action?
3. Does every accepted, modified, or rejected proposal produce a corresponding explanation and permanent record at the moment it is decided?

---

## 8. Summary

AFIP's system design translates the Product Specification's proposal-only authority model into a five-layer decomposition with two narrow, one-directional interface boundaries. Every design element in this report traces to a specific product requirement or a physical characteristic of the actual airframe established by CFD analysis — no design element in this report assumes an idealized aircraft or an unimplemented capability.

---

*AFIP Program Office — Professional Documentation Suite, Document 2 of 8: System Design Report*
