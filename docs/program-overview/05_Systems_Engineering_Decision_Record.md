# Autonomous Flight Intelligence Platform (AFIP)
## Systems Engineering Decision Record

**Document Series:** AFIP Professional Documentation Suite — 4 of 8
**Classification:** Internal / Program Reference
**Format:** One record per major design decision — Context / Decision / Consequences / Status
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1

---

## SEDR-001: AFIP Never Issues Direct Actuator Commands

**Context:** AFIP's reasoning will grow more sophisticated over time as new sensing and advisory capability is added. A direct path from AFIP to the aircraft's actuators would mean every future increase in reasoning sophistication also increases direct flight risk.

**Decision:** No code path in AFIP, under any circumstance including emergencies, issues a direct actuator or control-surface command. All influence on the aircraft is expressed as proposed high-level intent (Product Spec §4, §6.1, §9.8).

**Consequences:** AFIP can be extended indefinitely on the reasoning side without re-certifying flight-control safety. The tradeoff is that AFIP can never respond to an emergency faster than its proposal can be arbitrated — this is treated as acceptable because the flight-control layer retains its own independent, faster-acting failsafes.

**Status:** Adopted — architectural invariant (Software Architecture, Invariant 2).

---

## SEDR-002: Every Proposal Passes Through One Independent, Fail-Closed Check

**Context:** A system that can bypass its own safety check under "urgent enough" circumstances effectively has no safety check.

**Decision:** Every proposed intent — from AFIP or from a human operator — passes through exactly one independent arbitration function before it may reach the flight-control boundary. If arbitration cannot produce a valid result, the proposal is treated as rejected by default (Product Spec §9.9; Software Architecture, Invariant 3).

**Consequences:** No emergency scenario, however severe, creates a justification to skip the check. This means arbitration itself must be engineered to fail closed, and its own fault modes must be explicitly designed for (see SEDR-005).

**Status:** Adopted — architectural invariant.

---

## SEDR-003: The Safety Monitor Is Read-Only on the World Model

**Context:** If a safety-critical subsystem could write to the shared World Model, a bug in its own logic could corrupt the state every other subsystem depends on.

**Decision:** The Safety Monitor reads AircraftState, NavigationState.geofence_status, BatteryState.status, HealthState, TrafficState.conflict_assessment, WeatherState.hazards, and CommunicationState.links, but owns no World Model object. It acts on the aircraft only through a separate emergency command path to the flight-control layer, never by writing to shared state (First Principles: Information-Centric Architecture, §"Critical Architectural Decisions").

**Consequences:** The World Model remains a single-source-of-truth with unambiguous per-object ownership. The Safety Monitor's authority is real and can bypass normal guidance, but it cannot corrupt what other subsystems believe to be true.

**Status:** Adopted — non-negotiable per source architecture.

---

## SEDR-004: Deterministic Judgment Gates All Advisory (Model-Based) Judgment

**Context:** Statistical or model-based judgment is valuable for pattern and anomaly detection, but if it can independently trigger a decision, AFIP's decisions stop being traceable to hard facts.

**Decision:** Advisory judgment may only ever produce a confidence-scored flag. Only deterministic judgment can turn a flag into a classification (nominal/degraded/critical) or feed it into the decision structure. An advisory flag can never, by itself, generate a proposed intent (Product Spec §6.4, §9.11; Software Architecture §6).

**Consequences:** The advisory/model-based side of AFIP can be improved or replaced over time without changing what kind of thing a "decision" is or how it is checked — a deliberate extensibility property. The tradeoff is that a genuinely correct model-based insight cannot act until deterministic judgment has weighed it, which is an accepted latency cost in exchange for auditability.

**Status:** Adopted — architectural invariant.

---

## SEDR-005: Failure Anywhere in AFIP Reduces Authority, Never Increases Autonomous Action

**Context:** The default failure behavior of many autonomous systems is to "try harder" when confidence drops — exactly the wrong response when the system's own picture of reality may be wrong.

**Decision:** Each layer has an assigned degradation response (Software Architecture §7): stale evidence marks the affected belief reduced-confidence rather than holding a stale value silently; irreconcilable evidence reduces confidence rather than being silently averaged; low-confidence belief forces a conservative fallback proposal; a faulted Decision & Arbitration layer falls back to a minimal, pre-defined safe proposal that is still arbitrated; and a failure to render an explanation never blocks or delays the decision itself, but is explicitly recorded as a gap.

**Consequences:** AFIP is designed to be "boring" under fault conditions — its behavior narrows, not widens. This depends on the flight-control layer and flight simulator remaining the more reliable fallback in a fault condition, which is treated as a standing assumption of AFIP's subordinate position (Product Spec §4, §10, §11).

**Status:** Adopted — architectural invariant.

---

## SEDR-006: Explanation Is Produced As a Byproduct of Deciding, Not Reconstructed Afterward

**Context:** Post-hoc explanations generated after a decision has already taken effect can misrepresent what actually drove the decision, and cannot be trusted for audit or certification purposes.

**Decision:** Every branch of Decision & Arbitration's reasoning produces a proposal and its justification reference set as a single unit. Layer E (Explainability & Record) only renders what Layer D already produced — it does not generate justification independently (Software Architecture §5, §"Layer E").

**Consequences:** Explanation can never drift from the actual facts that produced a decision, because it is not a separate reasoning step. This constrains Layer E to a rendering role rather than an interpretive one — a deliberate limitation.

**Status:** Adopted — architectural invariant.

---

## SEDR-007 (Open): Should Airframe-Specific Aerodynamic Behavior Be an Explicit Reasoning Input Now, or Deferred?

**Context:** CFD analysis has established that the current airframe has a positive pitching moment, negative lift, and high drag in forward flight (Airframe CFD Report). The Software Architecture Document's open questions leave unresolved whether Belief Formation and Situational Reasoning should reserve an explicit extensibility point for these characteristics now, or remain fully airframe-agnostic until the airframe design matures further.

**Decision:** Not yet made. Recorded here as a live decision pending airframe design maturity and Program Office input.

**Consequences (of either path):** Reserving the point now costs some design complexity today but avoids a structural change later if the airframe's known limitations turn out to be long-lived. Deferring keeps the reasoning core simpler now but risks a non-trivial architectural change if resolved late.

**Status:** Open — carried forward from Product Specification and Software Architecture open questions.

---

*AFIP Program Office — Professional Documentation Suite, Document 4 of 8: Systems Engineering Decision Record*
