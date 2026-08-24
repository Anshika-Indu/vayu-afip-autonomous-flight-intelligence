# Autonomous Flight Intelligence Platform (AFIP)
## Software Architecture Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Author:** Lead Software Architect (AFIP)
**Derived From:** AFIP Product Specification Document v0.2
**Scope of this document:** Software architecture only. No code, no algorithms, no data schemas, no UI. Every design decision below traces back to a specific requirement, goal, or principle in the Product Specification.

---

## 0. Architectural Framing

The Product Specification establishes AFIP as a *cognitive layer*, not a control layer: it understands, reasons, proposes, and explains — it never acts on the aircraft directly (Product Spec §1, §4, §6.1). It sits above a flight simulator that owns physical truth and, ultimately, above a flight-control layer that owns physical control (Product Spec §10, §11).

This single relationship — **AFIP proposes, an independent layer disposes** — is the organizing constraint for the entire architecture. Every structural decision in this document exists to make that relationship impossible to violate, even accidentally, even under fault, even in an emergency.

A second organizing constraint comes from Product Spec §6.4 and §6.5: judgment must be deterministic wherever possible and probabilistic only where necessary, and nothing is "understood" until raw signals have been reconciled into a confidence-scored belief. This drives a strict separation, throughout the architecture, between *evidence*, *belief*, and *decision* — three different things that are never allowed to collapse into one.

---

## 1. Architectural Principles

These principles are restatements of Product Specification commitments, translated into structural rules that the architecture must enforce mechanically, not just observe by convention.

| # | Principle | Source (Product Spec) |
|---|---|---|
| P1 | AFIP never has a code path that issues a direct actuator/control command. All influence on the aircraft is expressed as high-level proposed intent. | §4, §6.1, §9.8 |
| P2 | Every proposed intent — including emergency responses — passes through one independent check before it can take effect. No bypass path exists, ever. | §6.1, §9.9, §11 |
| P3 | Raw signals are never reasoned over directly. Everything downstream reasons over reconciled, confidence-scored belief. | §6.5, §9.1 |
| P4 | Belief (what AFIP thinks is true) and intent (what AFIP is trying to do) are architecturally separate structures that never merge. | §6.6 |
| P5 | Deterministic reasoning (health/safety thresholds, mission logic) is structurally separated from probabilistic/model-based reasoning (pattern/anomaly judgment); the latter is always advisory input to the former, never a decision in itself. | §6.4, §9.11 |
| P6 | Every decision produces its explanation as a byproduct of being made, not as a later reconstruction. | §6.3, §9.10 |
| P7 | Loss of confidence, staleness, or internal fault always results in AFIP reducing its own scope of authority — never in more aggressive autonomous action. | §6.2, §9.12 |
| P8 | Every module can be understood, tested, and degraded independently; failure of one module must not silently propagate into incorrect behavior elsewhere. | §6.7, System Goals |
| P9 | Nothing about the flight simulator's ownership of physical truth is ever duplicated or second-guessed inside AFIP. | §4, §10 |
| P10 | A human operator's input is structurally just another proposed intent — no privileged, unchecked channel exists for a person any more than for AFIP itself. | §9.15, §11 |

---

## 2. Layered Architecture

AFIP is organized into five internal layers, bounded below by the flight-control layer (outside AFIP) and above by the human-facing layer (outside AFIP's decision-making core). Information flows upward (signal → belief → decision); authority flows downward (decision → checked intent), and the two are never permitted to move through the same layer transition in the same step — a fact discovered at layer N cannot influence the aircraft without passing through every layer between N and the boundary.

```
┌───────────────────────────────────────────────────────────┐
│  Layer E — Explainability & Record                          │
│  (produces explanations and the permanent audit record       │
│   for everything below; never influences a decision)         │
├───────────────────────────────────────────────────────────┤
│  Layer D — Decision & Arbitration                            │
│  (proposes intent; independently checks intent before        │
│   it may proceed)                                             │
├───────────────────────────────────────────────────────────┤
│  Layer C — Situational Reasoning                              │
│  (health / navigation / mission judgment, cross-domain        │
│   reasoning)                                                  │
├───────────────────────────────────────────────────────────┤
│  Layer B — Belief Formation                                   │
│  (reconciles evidence into a single confidence-scored          │
│   understanding of aircraft + environment + mission)          │
├───────────────────────────────────────────────────────────┤
│  Layer A — Evidence Intake                                    │
│  (receives whatever the simulator/aircraft exposes;            │
│   performs no interpretation)                                  │
└───────────────────────────────────────────────────────────┘
        ▲ evidence flows up            authority flows down ▼
┌───────────────────────────────────────────────────────────┐
│  Flight Simulator (source of physical truth) — outside AFIP  │
│  Flight Control Layer (source of physical authority) —       │
│  outside AFIP                                                 │
└───────────────────────────────────────────────────────────┘
```

A strict no-skip rule governs both directions: a layer may only exchange information with the layer immediately adjacent to it. Layer D cannot act on Layer A's raw evidence directly, and Layer B cannot issue anything to the flight-control boundary directly. This is the architectural enforcement of P1–P3: there is no shortcut by which urgency, confidence, or good intentions can compress the path from raw signal to aircraft action.

---

## 3. Functional Areas and Responsibilities

Rather than naming implementation modules, each functional area below is defined by the single responsibility it owns, its inputs, and its outputs — the "shape" of the capability, not its construction.

### 3.1 Evidence Intake (Layer A)
**Responsibility:** Receive whatever the flight simulator (and, later, aircraft sensors) exposes, tag it with source and time, and pass it upward. Performs no interpretation, no fusion, no judgment.
**Owns:** Nothing beyond raw signal handling. Explicitly forbidden from producing anything that looks like a fact, a belief, or a decision.
**Satisfies:** Product Spec §9.1 (fuse rather than reason on raw input), §10 (simulator remains sole source of physical truth — AFIP does not reinterpret it at the point of intake).

### 3.2 Belief Formation (Layer B)
**Responsibility:** Reconcile intake evidence — including cases of multiple, possibly disagreeing signals — into a single, coherent, confidence-scored understanding of three things: the aircraft's own condition, the environment around it, and the mission currently assigned to it.
**Owns:** The single authoritative "current understanding" that everything above it reads from. Nothing above Layer B is permitted to read Layer A directly.
**Key structural property:** Every belief carries three inseparable attributes — its value, its confidence, and its freshness. A belief whose freshness has expired is not deleted; it is marked reduced-confidence and treated accordingly by everything downstream (satisfies P3, P7, Product Spec §9.2).
**Satisfies:** Product Spec §9.1, §9.2, §9.3 (mission understanding), Non-Goal boundary against reinterpreting simulator truth.

### 3.3 Situational Reasoning (Layer C)
**Responsibility:** Apply judgment to the current belief in three connected domains — **aircraft health**, **navigation status**, and **mission status** — and explicitly allow degradation in one domain to affect judgment in the others, rather than reasoning about each in isolation.
**Owns:** The classification of current conditions (nominal / degraded / critical, or the navigation/mission equivalents) and the cross-domain reasoning that connects them.
**Key structural property:** This layer is split internally into two kinds of judgment that never merge:
  - **Deterministic judgment** — threshold- and rule-based evaluation of health, navigation, and mission conditions. Exact, explainable, testable in isolation.
  - **Advisory judgment** — pattern- or model-based observations (e.g., "this looks anomalous") that are always confidence-scored and are consumed by deterministic judgment, never substituted for it (satisfies P5, Product Spec §6.4, §9.11).
**Satisfies:** Product Spec §9.4, §9.5, §9.6, §9.7 (cross-domain judgment), §9.11 (distinguish certainty from advice).

### 3.4 Decision & Arbitration (Layer D)
**Responsibility:** Split into two independent responsibilities that must never be combined into one:
  - **Proposal** — given the current situational judgment, propose what the aircraft should do next at a high level (continue, hold, adjust, divert, abort-class).
  - **Arbitration** — independently check every proposed intent (whether it came from AFIP's own proposal function or from a human operator) against a fixed set of operational constraints, and accept, modify, or reject it.
**Owns:** The only point in the architecture where a decision is allowed to be produced, and the only point where that decision is allowed to be checked. These two responsibilities are architecturally distinct specifically so that the function proposing an action is never the same function approving it (satisfies P2, P10).
**Key structural property:** Arbitration is intentionally the simplest, most conservative, most independently verifiable part of the architecture. Its job is narrower than the proposal function's — it does not need to understand *why* something was proposed, only whether it is *permitted*. This asymmetry (rich proposal reasoning, narrow strict arbitration) is what makes the safety boundary something that can be trusted even when the proposal side becomes more sophisticated over time.
**Satisfies:** Product Spec §9.8, §9.9, §11 (single narrow checked gate).

### 3.5 Explainability & Record (Layer E)
**Responsibility:** Two responsibilities that share a boundary but not a purpose:
  - **Explanation** — render every decision (accepted, modified, or rejected) into a human-understandable account of the specific facts and alternatives that produced it, generated at the moment the decision is made.
  - **Record** — preserve a permanent, unalterable account of everything AFIP believed, proposed, and was told, including what it considered and rejected.
**Owns:** Nothing that feeds back into belief, reasoning, or decision-making. This layer is read-only with respect to everything below it — it observes and renders, and its output is never permitted to influence a future decision (this prevents AFIP's self-explanation from ever shaping its own future beliefs).
**Satisfies:** Product Spec §6.3, §9.10, §9.13, Non-Goal boundary against reconstructing explanations after the fact.

### 3.6 Operator Interface Boundary (outside the decision core, adjacent to Layer D/E)
**Responsibility:** Present AFIP's current understanding, current proposed/active intent, and current explanations to a human operator; accept operator commands and route them into the same proposal path as any AFIP-originated proposal.
**Owns:** Presentation and routing only — no decision-making authority of its own, and no path into arbitration that bypasses the same check applied to every other proposal.
**Satisfies:** Product Spec §9.14, §9.15, §11 (operator as one more checked source of intent). *(No UI design is included here — only the architectural boundary and its behavior.)*

---

## 4. Information Flow

Restated as flow, independent of which functional area performs which step, to make explicit why the layering in Section 2 is enforceable rather than aspirational:

```
Evidence  →  Belief Formation  →  Situational Reasoning
                                          │
                                          ▼
                                  Proposed Intent
                                          │
                                          ▼
                                    Arbitration
                              ┌───────────┼───────────┐
                          ACCEPT      MODIFY        REJECT
                              │           │             │
                              └─────┬─────┘             │
                                    ▼                    │
                          (passed toward flight-control  │
                           boundary — outside AFIP)       │
                                    │                    │
                                    ▼                    ▼
                          Explanation + Permanent Record (always, regardless of outcome)
```

Three flow rules, each tracing to a specific principle:

1. **Evidence never reaches Situational Reasoning or Decision & Arbitration directly.** It must be reconciled into belief first (P3).
2. **A proposed intent never reaches the flight-control boundary without passing through arbitration**, regardless of which functional area or which human produced it, and regardless of how urgent the situation is judged to be (P2, P10).
3. **Every outcome of arbitration — accepted, modified, or rejected — is recorded and explained.** A rejected proposal is exactly as important to the record as an accepted one, because it is part of what makes AFIP's reasoning auditable (P6, Product Spec §9.13).

---

## 5. Decision Reasoning Structure

Product Spec §9.7 requires that degradation in one domain (health, navigation, mission) be allowed to affect judgment in the others. Architecturally, this is handled by giving Situational Reasoning (Layer C) a single evaluation structure that all three domains feed into together, rather than three independent evaluators that only meet downstream.

The evaluation structure is a strict precedence order, evaluated every reasoning cycle:

1. **Is the current belief sufficiently fresh and confident to reason about at all?**
   If not → propose a conservative fallback (e.g., hold), with the explanation being the specific insufficiency, not a general fault state. (P7)
2. **Does any health or navigation condition cross a critical threshold?**
   If so → propose an abort-class action, referencing the specific condition(s). Mission status is not consulted at this step — a critical safety condition is never weighed against mission progress.
3. **Does any health or navigation condition cross a degraded threshold, or does mission status indicate the mission is no longer achievable as planned?**
   If so → propose a conservative adjustment (reduced envelope, re-route, hold) appropriate to which condition triggered it.
4. **None of the above:**
   Propose continuation of the current mission activity.

This ordering is itself an architectural safeguard: it guarantees that a mission-status concern can never outrank a health/navigation-critical condition, and that a stale or low-confidence picture is always addressed before any other judgment is trusted (directly satisfying Product Spec §9.7 and §9.12).

Every branch of this structure produces a proposal *and* a justification reference set as a single unit — the justification is not generated afterward by Layer E; Layer E only renders what Layer D already produced as part of deciding (satisfies P6).

---

## 6. The Certainty/Advisory Boundary

Product Spec §6.4, §9.11, and §5 (Success Criteria) require AFIP to keep deterministic judgment and model/statistical judgment structurally distinct. The architecture enforces this as a one-way boundary within Layer C:

- Advisory judgment (pattern-, model-, or statistically-derived observations) may only ever produce a confidence-scored *flag* — an assertion that something may be true, with a stated confidence.
- Deterministic judgment is the only thing permitted to turn a flag into a classification (nominal/degraded/critical) or feed it into the decision structure in Section 5.
- An advisory flag can never, by itself, cause a proposed intent to be generated. It can only ever raise something for deterministic judgment to weigh.
- Every advisory flag is tagged with its origin, so that Layer E's explanations can state plainly whether a given contributing factor was a hard, deterministic fact or a confidence-scored observation — never blurring the two together in an explanation (satisfies Product Spec §5's requirement that AFIP "never present the latter as the former").

This boundary is what allows the advisory side of the architecture to become more sophisticated over time without ever changing what kind of thing a "decision" is or how it is checked.

---

## 7. Failure and Degradation Behavior

Product Spec §6.2, §6.7, and §9.12 require AFIP to have a defined response to loss of confidence at every level, and to always resolve uncertainty toward reduced authority rather than more autonomous action. The architecture assigns a specific degradation response to each layer:

| Layer | Failure condition | Architectural response |
|---|---|---|
| A — Evidence Intake | Expected evidence stops arriving | Downstream belief for the affected fact is marked reduced-confidence, not silently held at its last value |
| B — Belief Formation | Conflicting evidence, or evidence insufficient to reconcile | Confidence is reduced rather than the conflict being silently resolved by averaging or preference |
| C — Situational Reasoning | Belief confidence too low to support a domain judgment | That domain is treated as unknown, which (per Section 5, step 1) forces a conservative fallback proposal |
| D — Decision & Arbitration | Proposal function itself faults or cannot complete a cycle | A minimal, pre-defined safe proposal (hold/return) is used in its place; arbitration still applies to it |
| D — Arbitration specifically | Arbitration cannot produce a valid result | The proposal is treated as rejected by default — absence of a valid check is never treated as implicit permission (fail-closed, not fail-open) |
| E — Explainability & Record | Cannot render an explanation in real time | The decision itself is not blocked or delayed by this failure, but the gap is explicitly recorded as a gap — silence is never allowed to look like "nothing happened" |

The governing rule across every row: **a failure anywhere in AFIP results in AFIP asking for less trust, never in AFIP acting harder to compensate.** The flight-control layer and flight simulator beneath AFIP are always assumed to be the more reliable fallback in a fault condition, consistent with AFIP's subordinate position in the Product Specification (§4, §10, §11).

---

## 8. Boundary With the Flight Simulator and Flight-Control Layer

This boundary is the architecture's single most important edge, and is deliberately kept narrow and simple rather than rich or flexible.

- **Direction of trust:** The flight simulator and flight-control layer are always trusted over AFIP's own reasoning about physical state and physical safety. AFIP's belief about the aircraft is built *from* what the simulator exposes; it is never allowed to compete with or override it (Product Spec §4, §9, §10).
- **Direction of authority:** Only one thing crosses this boundary going outward from AFIP: a checked, high-level proposed intent. Nothing else — no raw belief, no unchecked judgment, no explanation — is permitted to cross this boundary in a way that could influence the aircraft.
- **Shape of the boundary:** A single, well-defined interface area, structurally isolated from the rest of AFIP, is the only part of the architecture aware that a flight-control layer exists at all. This is what allows the flight-control layer (or, eventually, a real autopilot) to change or be upgraded without requiring change anywhere else in AFIP (a scalability property required by Product Spec §12).
- **What is explicitly not architected here:** the specific protocol, message format, or command set used to communicate across this boundary. Per the Product Specification's scope, this document defines that the boundary exists, what may cross it, and in which direction — not how it is technically implemented.

---

## 9. Extensibility Points

Traced directly to Product Spec §12 (Future Scalability), the architecture provides four defined points where growth is expected without requiring structural change elsewhere:

1. **New categories of evidence** (Section 3.1) can be added without changing Belief Formation's contract with the layers above it, provided new evidence still resolves into the existing belief structure (aircraft condition / environment / mission).
2. **New advisory judgment capability** (Section 6) can be added or improved without changing how Decision & Arbitration works, because advisory output only ever enters as a confidence-scored flag into an unchanged deterministic structure.
3. **A different or upgraded flight-control layer** can be adopted without changing anything above the boundary described in Section 8, because AFIP's only awareness of that layer is confined to a single, narrow interface area.
4. **Additional human or fleet-level oversight** can be added at the Operator Interface Boundary (Section 3.6) without changing AFIP's decision core, because any such oversight is structurally just another checked source of proposed intent, exactly like a single operator today.

---

## 10. Architectural Invariants (Must Never Be Violated)

A short list, each directly traceable to the Product Specification, intended to remain true regardless of how any individual layer is eventually implemented:

1. No layer above Layer A ever reasons on raw, unreconciled evidence. *(§6.5, §9.1)*
2. No proposed intent — from AFIP or from a human operator — ever reaches the flight-control boundary without passing through arbitration. *(§6.1, §9.9, §11)*
3. Arbitration fails closed: the absence of a valid check result is treated as rejection, never as permission. *(§9.9, §6.2)*
4. Advisory (model/statistical) judgment never directly produces a proposed intent; it only ever informs deterministic judgment. *(§6.4, §9.11)*
5. Belief and intent are never the same structure. *(§6.6)*
6. Every decision — accepted, modified, or rejected — produces an explanation and a permanent record at the moment it is made. *(§6.3, §9.10, §9.13)*
7. Any loss of confidence, freshness, or internal integrity results in AFIP reducing its own authority, never increasing its own autonomous action. *(§6.2, §9.12)*
8. AFIP never duplicates, overrides, or second-guesses the flight simulator's ownership of physical truth. *(§4, §10)*

---

## Open Questions Requiring Your Input

1. Should the "minimal safe proposal" used during a Decision & Arbitration fault (Section 7) be a single fixed behavior (e.g., always hold) or should it vary by flight phase (e.g., hover vs. transition vs. cruise)? The Product Specification does not yet define flight-phase-specific behavior.
2. Does the Operator Interface Boundary need to support more than one simultaneous human operator, given the aircraft's heavy-lift cargo context? Not addressed in the Product Specification.
3. Should the architecture reserve an explicit extensibility point now for reasoning about the airframe's known aerodynamic limitations (Product Spec §2.2), or should Belief Formation and Situational Reasoning remain airframe-agnostic until that open question in the Product Specification is resolved?
