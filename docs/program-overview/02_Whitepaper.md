# Autonomous Flight Intelligence Platform (AFIP)
## Whitepaper

**Document Series:** AFIP Professional Documentation Suite — 1 of 8
**Classification:** Internal / Program Reference
**Prepared by:** AFIP Program Office
**Status:** Reflects current Product Specification v0.2, Software Architecture v0.1, and airframe CFD findings

---

## Abstract

The Autonomous Flight Intelligence Platform (AFIP) is a cognitive reasoning layer for a heavy-lift, autonomous, bi-copter tiltrotor VTOL cargo aircraft. AFIP does not fly the aircraft. It observes the aircraft and its environment, forms a confidence-scored understanding of the current situation, reasons about aircraft health, navigation, and mission status, proposes high-level operational decisions, and produces a human-auditable explanation for every decision it proposes — in real time, as the decision is made. This whitepaper introduces AFIP's purpose, its position relative to the flight simulator and flight-control layer beneath it, and the engineering rationale for treating autonomous reasoning as a discipline separate from flight control.

---

## 1. Introduction

Autonomous aircraft — particularly heavy-lift cargo VTOL platforms operating beyond visual line of sight — generate telemetry volumes and mission complexity that exceed what a low-level flight controller was ever designed to interpret. A flight controller such as a PX4- or ArduPilot-class autopilot is built to keep an aircraft stable and airborne; it is not built to ask whether the mission is still achievable, whether a developing pattern across battery, navigation, and health signals constitutes a real risk, or why a particular course of action was chosen over the alternatives.

AFIP exists to answer those questions, and only those questions. It is deliberately scoped as a **cognitive layer**, architecturally and operationally distinct from the flight-control layer it sits above. This separation of concerns — control versus cognition — is the central engineering thesis of this whitepaper.

---

## 2. The Problem

Two distinct engineering problems motivate AFIP's existence.

### 2.1 The Understanding Gap

Raw telemetry — position, attitude, tilt-rotor angle, battery state, payload state, sensor returns — is not, by itself, understanding. No component in a conventional autonomy stack today reconciles this telemetry into a single, coherent, confidence-scored picture of the aircraft's condition, judges that condition against an active mission, or explains its reasoning to a human operator in an auditable form. AFIP is built specifically to close this gap without re-implementing or second-guessing the systems that already own physical truth (the flight simulator, and eventually onboard sensors) or physical control (the flight controller).

### 2.2 A Non-Ideal Airframe

AFIP's reasoning is grounded in the real, current behavior of the airframe it flies with — not an idealized aircraft. Computational fluid dynamics analysis of the current dual-ducted-fan tiltrotor airframe (OpenFOAM, `simpleFoam`, 15 m/s cruise, ~180,000-cell mesh) produced the following converged force coefficients:

| Coefficient | Value | Engineering implication |
|---|---|---|
| Drag coefficient (C_D) | 6.58 | Ducted shrouds behave as airbrakes in forward flight |
| Lift coefficient (C_L) | -2.64 | Airframe produces net downforce, not lift, at cruise |
| Pitching moment (C_M) | +1.36 | Persistent nose-up moment requiring continuous correction |

These are not hypothetical failure modes; they are established characteristics of the airframe AFIP reasons about today. Consistent with AFIP's non-goals, **AFIP does not compensate for these aerodynamic properties at the control-loop level.** It reasons honestly about their consequences — reduced endurance, reduced achievable speed, and a persistent pitch-correction burden — as real operating conditions, not defects to be masked in software.

---

## 3. What AFIP Is

AFIP's identity, stated at product-definition level: **AFIP is the part of the aircraft that understands what is happening and can explain why it did what it did — nothing more, and nothing less.**

AFIP:
- Perceives and fuses available signals into a single, confidence-scored understanding of aircraft state, environment, and mission.
- Reasons across three connected domains — **health**, **navigation**, and **mission status** — treating degradation in any one as something the others must be re-evaluated against.
- Proposes high-level operational intent (continue, adjust, hold, divert, abort) grounded in that reasoning.
- Produces an explanation for every proposal at the moment the proposal is made, referencing the specific facts and rejected alternatives behind it.
- Degrades conservatively — loss of confidence, staleness, or internal fault always reduces AFIP's own authority, never increases its autonomous aggressiveness.

AFIP does **not**: perform attitude control, stabilization, or motor mixing; issue direct actuator commands under any circumstance, including emergencies; duplicate or override the flight simulator's ownership of physical truth; or hold final authority over any action affecting the aircraft.

---

## 4. Engineering Rationale: Why Cognition Must Be Separate From Control

The relationship AFIP maintains with the systems beneath it — **AFIP proposes, an independent layer disposes** — mirrors the relationship a human mission commander has with an aircraft's flight controls: informed and accountable for judgment, but never holding the stick. This is not a stylistic choice; it is the engineering property that makes AFIP's growing sophistication safe to add to a real airframe:

- A fault or bad judgment inside AFIP's reasoning can, at worst, produce a poor *proposal*. It cannot, by construction, produce a bad actuator command, because no code path in AFIP is capable of issuing one.
- The flight controller and flight simulator can be upgraded, replaced, or hardened independently of AFIP, because AFIP's only awareness of them is a single, narrow, well-defined interface boundary.
- As AFIP's reasoning grows more capable — new sensors, new advisory models, new mission types — the checked, narrow path by which it can influence the aircraft never has to change.

This is the same design discipline long applied in flight-critical avionics: keep the part of the system that must never be wrong (control) structurally isolated from the part of the system that is expected to grow, learn, and be revised (cognition).

---

## 5. Positioning Statement

AFIP is not a flight controller, a replacement autopilot, or a competitor to PX4- or ArduPilot-class systems. It is the reasoning layer that any such system currently lacks: continuous, cross-domain, confidence-aware judgment about whether the mission and the aircraft are still on track — expressed only as checked, explainable, high-level intent, never as control.

---

## 6. Conclusion

AFIP addresses a real and currently unmet need in autonomous cargo aviation: the need for an aircraft to explain, in real time and in human terms, why it is doing what it is doing — grounded in an honest accounting of the aircraft's actual condition, including a non-ideal airframe with known aerodynamic penalties. By keeping its authority strictly proposal-only and subordinate to independent arbitration, AFIP is designed to add reasoning capability to an aircraft without ever adding risk to how that aircraft is controlled.

---

*AFIP Program Office — Professional Documentation Suite, Document 1 of 8: Whitepaper*
