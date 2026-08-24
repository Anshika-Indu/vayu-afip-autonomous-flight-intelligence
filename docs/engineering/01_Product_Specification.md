# Autonomous Flight Intelligence Platform (AFIP)
## Product Specification Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.2 — supersedes v0.1, now grounded in AFIP Software Architecture (v0.1), AFIP Information Architecture, and the current airframe/CFD findings
**Owner:** Chief Systems Architect (AFIP)
**Related Systems:**
- Heavy-Lift Autonomous Cargo Drone Simulator (bi-copter tiltrotor VTOL) — owned by Aircraft Engineering/Simulation team; single source of truth for aircraft physics.
- Underlying flight controller (PX4/ArduPilot-class autopilot) — sole authority for attitude control, stabilization, and low-level failsafes; not part of AFIP.

---

## 1. Product Vision

AFIP is the cognitive layer of a heavy-lift, autonomous, bi-copter tiltrotor VTOL cargo aircraft. It does not fly the aircraft and does not simulate it. It watches the aircraft and the world it operates in, builds an understanding of what is currently true, reasons about the aircraft's health, navigation, and mission status, decides what the aircraft should do next at a high level, and explains that decision — every time, in real time, not reconstructed after the fact.

The relationship between AFIP and the systems beneath it is intentionally asymmetric: the flight simulator (and, ultimately, the flight controller) owns physical truth and physical control. AFIP owns understanding and judgment. AFIP proposes; the layer beneath it disposes. This is the same relationship a human mission commander has with an aircraft's flight control system — informed, deliberate, accountable for the reasoning, but never holding the stick.

AFIP's product identity, in one line: **it is the part of the aircraft that understands what is happening and can tell you why it did what it did — nothing more, and nothing less.**

---

## 2. Problem Statement

Two distinct but related problems motivate AFIP.

**2.1 The understanding gap.** The simulator (and eventually the real airframe) produces a continuous stream of raw signals — position, attitude, tilt-rotor angle, payload state, subsystem telemetry, sensor data. None of this, by itself, constitutes understanding. Nothing today interprets these signals in the context of an active mission, judges whether the aircraft is healthy, on course, and on-mission, decides what should happen next, or explains that decision to a human. AFIP exists to close this gap without duplicating or reaching into the systems that already own physical truth and physical control.

**2.2 The airframe is not a well-behaved aircraft.** Preliminary aerodynamic analysis of the current airframe (a large, ducted-fan bi-copter tiltrotor cargo design, roughly minivan-scaled) shows the vehicle does not behave neutrally in forward flight:

- It generates a positive pitching moment — aerodynamic forces actively push the nose up in cruise, requiring continuous correction.
- It generates negative lift (downforce) rather than positive lift as forward speed increases, meaning the rotors must work harder, not less, as the aircraft speeds up.
- Its ducted shrouds behave like airbrakes at forward-flight speeds, producing high drag that will bound both top speed and endurance.

These are airframe-engineering problems and are explicitly **not** AFIP's to solve — the aircraft's aerodynamic behavior is not something AFIP corrects, redesigns, or compensates for at the control-loop level. But AFIP does have to exist in a world where this is the airframe it is reasoning about: an aircraft whose energy consumption, achievable speed, and pitch behavior in forward flight are already known to be less favorable than a conventional design. AFIP's health, navigation, and mission reasoning must be built with the expectation that this aircraft consumes energy faster and handles differently than an idealized VTOL, not as an assumption to be corrected in software, but as a real operating condition to reason about honestly.

---

## 3. System Goals

- Perceive and continuously build an accurate, confidence-scored understanding of the aircraft's own state and the environment it is operating in.
- Understand the mission the aircraft is currently executing, and track progress against it.
- Reason about three connected but distinct domains: **aircraft health**, **navigation status**, and **mission status** — and treat degradation in any one of them as something the others must be re-evaluated against.
- Propose high-level, autonomous decisions about what the aircraft should do next (continue, adjust, hold, divert, abort), grounded in that reasoning.
- Never act unilaterally — every proposed decision must be checked against a fixed set of safety and operational constraints before it can take effect, and can be rejected or modified by that check.
- Explain every decision it proposes, in a form that traces directly back to the specific facts that produced it — including the alternatives that were considered and rejected, and why.
- Behave predictably and conservatively when its own picture of reality is incomplete, stale, or in conflict — reducing its own authority rather than acting more aggressively to compensate.
- Remain strictly subordinate to the flight simulator (and, later, the flight controller) as the sole owner of physical truth and physical control.

---

## 4. Non-Goals

- AFIP is not a flight controller. It does not perform attitude control, stabilization, motor mixing, or any low-level control-loop function. Those remain the exclusive domain of the existing autopilot layer (PX4/ArduPilot-class) beneath AFIP.
- AFIP does not issue direct actuator commands under any circumstance, including emergencies. Its authority is expressed only as high-level intent (e.g., "hold position," "return to base," "divert to alternate landing zone"), which the layer below is free to reject.
- AFIP does not rebuild, replace, duplicate, or take ownership of the flight simulator, which remains the single source of truth for aircraft physics and is owned by the aircraft engineering/simulation teammate.
- AFIP does not attempt to compensate for, correct, or mask the airframe's known aerodynamic shortcomings (pitch instability, negative lift, high drag) through more aggressive autonomous action. Those are airframe-design problems, and AFIP is designed to reason honestly about their consequences (e.g., reduced endurance, reduced speed margin), not to paper over them.
- AFIP does not include UI design or implementation. Only what AFIP is and does is defined here.
- AFIP does not include code, algorithms, data schemas, message formats, or other implementation detail. This document defines product intent and boundaries only.
- AFIP does not have final authority over any action affecting the aircraft. Every proposal it makes is subject to rejection or modification by a constraint-checking function that sits between AFIP's reasoning and the aircraft itself.

---

## 5. Success Criteria

AFIP is successful to the degree that it:

- Maintains an internal picture of the aircraft and its environment that is accurate, confidence-scored, and never silently allowed to go stale.
- Correctly distinguishes between routine operation, degraded conditions, and critical conditions across health, navigation, and mission status — and responds proportionally rather than uniformly.
- Never proposes an action that bypasses safety/constraint checking, regardless of how urgent the situation appears to be.
- Produces a decision explanation, every time, that is traceable to the specific facts that justified it — not a generic or after-the-fact summary.
- Distinguishes clearly, in its own outputs, between things it is certain of (deterministic reasoning) and things it is advising on with a confidence level (model-derived or statistical judgments) — never presenting the latter as the former.
- Degrades its own authority visibly and predictably when its inputs are missing, stale, or in conflict, rather than attempting to compensate through more autonomous action.
- Reasons about the aircraft's real operating characteristics (including known aerodynamic limitations) rather than an idealized version of the aircraft.
- Remains fully auditable — every decision, and every decision it considered and rejected, is reconstructable after the fact.

*Specific measurable thresholds (e.g., acceptable decision latency, minimum confidence floors) are not yet defined and are not assumed here.*

---

## 6. System Philosophy

AFIP is built on a small number of non-negotiable principles that shape every part of the product, regardless of how it is eventually implemented:

**6.1 Separation of authority, not just separation of function.** AFIP is the part of the system that understands and judges. It is never the part of the system that acts directly on the aircraft. Every output AFIP produces is a proposal, not a command, and every proposal passes through an independent check before it can influence the aircraft.

**6.2 Degrade gracefully; never fail silently.** AFIP always has a defined response to "I don't know" or "I've lost confidence in what I'm seeing." That response is to become more conservative and to hand authority back toward the more trustworthy layer beneath it — never to attempt a more heroic autonomous action to compensate for uncertainty.

**6.3 Explainability is a product feature, not a debugging tool.** Every decision produces its explanation at the moment it is made, as a direct byproduct of the reasoning that produced the decision — not reconstructed afterward from logs. If AFIP cannot explain a decision, it has not really made that decision in the way this product intends.

**6.4 Judgment is deterministic where it can be; probabilistic only where it must be.** Core reasoning about safety, health thresholds, and mission logic is treated as things AFIP should be able to explain exactly. Statistical or learned judgment (e.g., recognizing an unusual pattern) is confined to an advisory role — it can flag something for consideration, but a separate, explainable layer of judgment decides what to do about it.

**6.5 Nothing is understood until it has been reconciled.** Raw signals are not understanding. AFIP's picture of reality is built by reconciling multiple, sometimes conflicting, inputs into a single coherent belief — one that always carries a confidence level and an age, never a bare, unqualified fact.

**6.6 Intent is not belief.** What AFIP believes to be true about the aircraft and the world is kept strictly separate from what AFIP is currently trying to do. Conflating the two is how a system starts rationalizing its beliefs to fit what it wants to do — AFIP is designed so that cannot happen.

**6.7 Built to be trusted, not just to work.** Even though AFIP is not, today, a certified aviation system, it is designed as if it may eventually need to withstand that level of scrutiny. This shows up as a bias toward explainability, auditability, and conservative failure behavior throughout the product, not as a later add-on.

---

## 7. Scope

**7.1 In scope for AFIP (product-level):**
- Building and maintaining an understanding of the aircraft's own condition and its environment, at a confidence-scored level of fidelity.
- Understanding and tracking the mission currently assigned to the aircraft.
- Reasoning about aircraft health, navigation status, and mission status, including how degradation in one should affect judgment about the others.
- Proposing high-level autonomous decisions (continue, hold, adjust, divert, abort) based on that reasoning.
- Producing a human-understandable explanation for every decision it proposes, including what it considered and rejected.
- Behaving conservatively and predictably under uncertainty, incomplete information, or internal fault.
- Supporting a human operator's situational awareness by making its understanding, its current intent, and its reasoning available to them.

**7.2 Out of scope for AFIP:**
- Any change to the flight simulator or its ownership of physical truth.
- Any direct control of actuators, control surfaces, or motors — that authority remains with the existing flight controller layer beneath AFIP.
- Aircraft/simulation engineering, airframe design, or aerodynamic correction — owned by the aircraft engineering teammate.
- UI design and implementation.
- Code, algorithms, and other implementation detail — explicitly excluded from this document.

**7.3 Resolved from prior draft (now answered by the architecture material provided):**
- *What is a mission?* A structured objective (e.g., deliver a payload to a location by a time) that AFIP decomposes into trackable progress, without AFIP itself owning the aircraft's low-level flight execution.
- *Is AFIP's authority advisory or executed?* Advisory-with-arbitration: AFIP proposes high-level intent; a separate, independent check accepts, modifies, or rejects it before it can influence the aircraft. AFIP never has an unchecked path to the aircraft.
- *Who consumes AFIP's output?* A ground operator (via situational displays) and a permanent audit record, at minimum. AFIP's understanding, current intent, and explanations are surfaced to both.

**7.4 Still open — requires further input before deeper specification:**
- The exact boundary of what "mission" objectives look like for this specific cargo use case (e.g., single-leg vs. multi-stop delivery, real-time re-tasking).
- Whether AFIP is expected to reason about the airframe's known aerodynamic limitations (Section 2.2) as fixed operating characteristics from day one, or whether this is deferred until the airframe design matures.
- The operational concept for human override — how much latitude a ground operator has to countermand AFIP versus the underlying constraint layer.

---

## 8. User Journey

*Described at the level of what the product does and shows, not how it is built or how any UI is designed.*

1. A mission is assigned to the aircraft. AFIP builds an understanding of what that mission requires and what "successful completion" looks like.
2. Before flight, AFIP checks whether it has a sufficiently confident picture of the aircraft and its environment to proceed, and whether the mission itself is achievable given known constraints.
3. During flight, AFIP continuously updates its understanding of the aircraft's condition, position, and environment, and continuously reasons about health, navigation, and mission status.
4. Under nominal conditions, AFIP confirms the aircraft should continue its current mission activity, and this confirmation — along with its reasoning — is available to a ground operator.
5. If AFIP detects a degraded condition (in health, navigation, or mission progress), it proposes a more conservative course of action and explains what changed and why.
6. If AFIP detects a critical condition, it proposes an abort-class action (e.g., divert to a safe landing point, return to base) and explains the specific facts that drove that judgment — this proposal is still subject to the independent safety check before it can take effect.
7. A ground operator can observe AFIP's current understanding, its current intent, and its reasoning at any time, and can issue their own commands — which are treated the same way as any of AFIP's own proposals, subject to the same safety check, never as a privileged bypass.
8. After the flight, a complete, reconstructable record exists of everything AFIP believed, proposed, and was told, including anything it considered and rejected — available for review regardless of what happened in flight.

---

## 9. Functional Requirements

Stated at product-definition level — what AFIP must do, not how:

1. **Perceive and Fuse** — AFIP shall combine relevant available signals about the aircraft and its environment into a single, coherent, confidence-scored understanding, rather than reasoning on any single raw input in isolation.
2. **Track Freshness** — AFIP shall treat any part of its understanding that has not been recently updated as less trustworthy, and shall never treat stale information as current.
3. **Understand Mission** — AFIP shall maintain and track progress against the mission currently assigned to the aircraft.
4. **Reason About Health** — AFIP shall continuously assess the aircraft's condition and identify when it is nominal, degraded, or critical.
5. **Reason About Navigation** — AFIP shall continuously assess whether the aircraft is on its intended course and within operational limits.
6. **Reason About Mission Status** — AFIP shall continuously assess whether the mission is on track, at risk, or no longer achievable as planned.
7. **Cross-Domain Judgment** — AFIP shall allow degradation in health or navigation to affect its judgment about mission status, and vice versa, rather than reasoning about the three domains in isolation.
8. **Propose, Never Command** — AFIP shall express every autonomous decision as a proposed high-level intent, never as a direct instruction to an actuator or control surface.
9. **Respect Independent Arbitration** — every proposal AFIP makes shall be subject to acceptance, modification, or rejection by a function independent of AFIP's own reasoning, with no path that bypasses this check, including in emergencies.
10. **Explain Every Decision** — AFIP shall produce a human-understandable explanation for every proposal it makes, referencing the specific facts and alternatives that were considered.
11. **Distinguish Certainty from Advice** — AFIP shall clearly distinguish, in both its reasoning and its explanations, between conclusions it holds with high certainty and judgments it is advising on with a stated confidence level.
12. **Degrade Conservatively** — when AFIP's understanding is incomplete, stale, or internally inconsistent, it shall propose a more conservative course of action and shall not attempt a more aggressive autonomous response to compensate.
13. **Preserve a Complete Record** — every fact AFIP believed, every decision it proposed, and every decision it considered and rejected shall be preserved in a form that can be reviewed after the fact.
14. **Support Human Situational Awareness** — AFIP shall make its current understanding, current intent, and current reasoning available to a human operator.
15. **Accept Operator Input Without Privilege** — commands issued by a human operator shall be treated as proposals subject to the same independent check as AFIP's own proposals, never as an unchecked override.

---

## 10. Technical Constraints

Stated only as far as established by the material provided — no implementation detail is asserted beyond it.

- The aircraft is a large, real-scale, bi-copter tiltrotor VTOL cargo aircraft (fuselage roughly 2.6 m long, ~2.8 m+ arm span, dual 0.8 m ducted fans) — this is a heavy-lift vehicle, not a small consumer drone, and AFIP's reasoning must be scaled to that context.
- The aircraft transitions between vertical (hover) and horizontal (cruise) flight via tilting nacelles, meaning the aircraft passes through a distinct, less-stable transition regime that AFIP's reasoning must account for as a real flight phase, not an edge case.
- Preliminary aerodynamic analysis indicates the current airframe has a positive pitching moment, negative lift, and high drag in forward flight — these are known, current characteristics of the aircraft AFIP is reasoning about, not hypothetical failure modes.
- The flight simulator is, and will remain, the sole source of truth for aircraft physics. AFIP has no authority to override, redefine, or duplicate that truth.
- The underlying flight control authority (an autopilot layer such as PX4/ArduPilot-class software) is, and will remain, the sole authority for attitude control, stabilization, and low-level failsafes. AFIP's authority is strictly one level removed from this layer, expressed only as high-level intent.
- No decision-making capability in AFIP has direct, unchecked access to the aircraft; every proposal is subject to an independent constraint check that can reject or modify it.
- No specific sensor suite, data format, computing platform, or software framework is assumed in this document. Where the architecture material references illustrative examples of sensor types or communication protocols, those describe how the product boundary is enforced (i.e., that AFIP never bypasses the flight-control layer) — they are not commitments made by this specification.

---

## 11. Integration Philosophy

AFIP integrates with the systems around it strictly as a bounded, subordinate layer — never as a peer with equal or overriding authority.

- **With the flight simulator:** AFIP is a downstream observer. It consumes the simulator's output to build its own understanding; it never writes to, alters, or substitutes for the simulator's representation of aircraft physics.
- **With the flight control layer:** AFIP's only form of influence is a high-level, proposed intent, passed through an independent check that the flight control layer (or its equivalent arbitration function) is free to reject or modify. There is no direct, no emergency, and no privileged path from AFIP to the aircraft's actuators.
- **With the human operator:** the operator is treated as another source of proposed intent, not as a separate command channel with special privileges. Operator commands pass through the same check as AFIP's own proposals.
- **With any AI/model-based judgment used inside AFIP:** such judgment is confined to producing advisory, confidence-scored input into AFIP's reasoning. It is never treated as a decision in itself, and it never gains direct influence over the aircraft.

The unifying principle: authority only ever flows downward through a single, narrow, checked gate. Understanding can be as rich and as sophisticated as needed; the ability to act on it is deliberately kept narrow, singular, and independently verifiable.

---

## 12. Future Scalability

Based only on what has been established about the product's intent and boundaries:

- Because AFIP's understanding is organized around clearly separated domains (aircraft condition, environment, mission, health), the product is positioned to extend to new categories of understanding (e.g., new sensing capability, new mission types) without requiring change to how it reasons or how it checks and explains decisions.
- Because AFIP's authority is expressed only as bounded, checked, high-level intent — never as direct control — the product is positioned to eventually support a different or upgraded underlying aircraft/flight-control platform without changing what AFIP fundamentally is or does.
- Because every AFIP decision is explainable and auditable by design, the product is positioned to face increasing scrutiny (regulatory, operational, or certification-adjacent) as it matures, without a fundamental redesign of how it behaves.
- Because AFIP's operator-facing behavior treats the operator as one more checked source of intent, the product is positioned to extend toward multi-aircraft or fleet-level oversight in the future without changing its core relationship to any single aircraft.
- The aircraft's currently known aerodynamic limitations (Section 2.2, Section 10) may change as the airframe design matures. AFIP's reasoning about health and navigation is intended to reflect whatever the aircraft's real operating characteristics are at a given time, rather than assuming a fixed, idealized performance envelope — so future airframe revisions are expected to be an input AFIP adapts to, not a redesign of AFIP itself.

*Any scalability claims beyond what is described above (e.g., specific fleet size, specific certification pathway, specific new aircraft types) are not yet supported by the material provided and are intentionally omitted.*

---

## Open Questions Requiring Your Input

1. Should AFIP's health and navigation reasoning explicitly account for the airframe's current known aerodynamic limitations (Section 2.2) starting now, or should this be deferred until the airframe design (SCAD/CFD) matures further?
2. What does a "mission" concretely consist of for this cargo use case — single-destination delivery only, or multi-stop/re-taskable missions?
3. What latitude does a human ground operator have relative to AFIP's own proposals — is there any scenario where an operator command is treated differently from an AFIP-originated proposal?
4. Is there an existing or intended certification pathway (e.g., defense, commercial BVLOS) that should shape how conservatively this specification should be written?
