# Autonomous Flight Intelligence Platform (AFIP)
## Mission Executive — Design Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, AFIP World State Engine v0.1
**Scope of this document:** The Mission Executive only. No code, no algorithms, no data schemas, no UI. Every design decision below traces back to a specific requirement or invariant already established in the three source documents.

---

## 0. What the Mission Executive Is

The Mission Executive (ME) is the concrete realization of **Layer C — Situational Reasoning** and the **Proposal half of Layer D — Decision & Arbitration**, as defined in the Software Architecture document. It is the part of AFIP that turns a World State Snapshot into a judgment, and a judgment into a proposed intent.

It is deliberately *not* the realization of Arbitration. The Architecture document (§3.4) requires Proposal and Arbitration to be architecturally distinct specifically so the function proposing an action is never the same function approving it. The Mission Executive is the proposer. Arbitration remains a separate, independent, narrower function sitting downstream of it, and nothing in this document alters that boundary.

Its charter, in one line: **the Mission Executive is the only place in AFIP where "what do we believe" becomes "what should happen next" — and everything it produces is still just a proposal until something outside it says otherwise.**

Three things must be true of the Mission Executive at all times, carried forward from the parent documents:

- It reads exactly one thing from below: the current World State Snapshot (WSE §3.6, §8). It has no visibility into individual Belief Fields, Evidence Records, or the Reconciliation Record.
- It never writes back into the World State Engine. If its own reasoning implies a belief might be wrong, that can only ever re-enter as new evidence through Layer A on a future cycle (WSE §8).
- Everything it outputs is a *proposed* intent. It has no path to the flight-control boundary that does not pass through Arbitration — including under fault, and including in an emergency (Architecture P2, Invariant 2).

---

## 1. State Machine

The Mission Executive tracks two state dimensions that are related but must never be collapsed into one, for the same reason belief and intent are never collapsed (Architecture P4): **what stage the mission is at**, and **how much latitude the Mission Executive currently claims for itself**. The first is derived from what AFIP believes about the world. The second is a property of the Mission Executive's own trust in its own reasoning. Conflating them would let a confident-sounding mission phase mask a genuinely degraded reasoning state, or vice versa.

### 1.1 Mission Phase State

Reflects where the mission currently stands, derived each cycle from Mission State (Mission Definition + Mission Progress) and Aircraft State (kinematic/pose) in the Snapshot. This is a *read* of the world, not a decision — the Mission Executive does not command a phase transition, it recognizes one.

`PRE-MISSION VALIDATION → ASCENT → TRANSITION (OUT) → CRUISE → TRANSITION (IN) → APPROACH/DESCENT → LANDED / MISSION COMPLETE`

Off-nominal branches, reachable from any of the above once a corresponding intent is accepted by Arbitration (never entered by the Mission Executive unilaterally):

`HOLD → (resume prior phase, or) → DIVERT → LANDED (contingency)`
`→ RETURN-TO-BASE → LANDED (contingency)`
`→ ABORT → LANDED (contingency)`

Mission Phase State is informational to the Mission Executive's own reasoning (different phases carry different risk profiles — see Section 5) but is never itself the thing being decided. It is also surfaced, read-only, to the Operator Interface Boundary for situational awareness (Product Spec §9.14).

### 1.2 Executive Posture

Reflects how much the Mission Executive currently trusts its own picture of the world and, therefore, how wide a range of proposals it is willing to generate. This is the state that governs authority, and it only ever narrows under uncertainty — it never widens to compensate for it (Product Spec §6.2, §9.12).

| Posture | Meaning | What it permits |
|---|---|---|
| **NOMINAL** | Snapshot fresh, confident, internally consistent across domains | Full proposal range: continue, adjust, hold, divert, abort |
| **CAUTIOUS** | One or more domains degraded, or confidence below the "fully trusted" threshold but above the "unusable" threshold | Continuation only with reduced envelope; adjust, hold, divert, abort remain available; new "continue as originally planned" proposals are not |
| **MINIMAL** | A domain has crossed a critical threshold, or confidence has fallen below the usable floor | Only conservative-class proposals: hold, divert, abort/RTB. "Continue" and "adjust-to-proceed" are structurally unavailable — not just discouraged |
| **SUSPENDED** | The Mission Executive's own proposal function has faulted and cannot complete a reasoning cycle | No proposal is generated by normal reasoning; a single pre-defined minimal safe proposal is substituted (Section 6) and still passes through Arbitration |

Posture transitions are one-way triggers *downward* on any qualifying condition (any domain crossing a threshold, confidence falling, a fault occurring) and can only move *upward* after a full reasoning cycle confirms the condition that caused the drop has cleared **and** the Snapshot supporting that conclusion is itself fresh and confident — recovery is never assumed from the mere absence of a new bad signal.

---

## 2. Decision Flow

The Mission Executive runs one reasoning cycle per published Snapshot. This is the concrete instantiation of the precedence order already established in the Architecture document (§5), expanded into the Mission Executive's actual internal pipeline:

1. **Ingest the Snapshot.** Read the current World State Snapshot in full, as a whole object (WSE §2). No partial reads.
2. **Freshness/confidence gate.** For each domain (health, navigation, mission), check whether the Snapshot's supporting Belief Fields are fresh and confident enough to reason about at all (Section 7). Any domain that fails this gate is marked **unknown** for this cycle, not estimated from its last known value.
3. **Deterministic classification.** For every domain that passed the gate, apply fixed, explainable thresholds to classify it as nominal, degraded, or critical.
4. **Advisory integration.** Any confidence-scored advisory flags relevant to a domain are folded in at this step — as input to the deterministic classification, never as a classification in their own right (Section 4 boundary rule, unchanged from Architecture §6).
5. **Cross-domain reconciliation.** Domain classifications are considered together, not independently. A degraded classification in one domain can move another domain's effective risk posture even if that second domain's own thresholds were not individually crossed (Product Spec §9.7) — see Section 5.
6. **Precedence evaluation.** Applied in this fixed order, every cycle, without exception:
   - Any domain unknown (failed step 2) → conservative fallback proposal, citing the specific insufficiency.
   - Any domain critical → abort-class proposal, citing the specific condition(s). Mission status is not consulted at this step.
   - Any domain degraded, or mission status no longer achievable as planned → conservative adjustment proposal appropriate to the triggering condition(s).
   - None of the above → propose continuation of current mission activity.
7. **Posture update.** Executive Posture (Section 1.2) is set or held based on the outcome of steps 2–6, *before* the proposal is finalized — the posture governs which of the candidate proposals from step 6 are structurally available to choose from.
8. **Proposal + justification generation.** The selected proposal and its justification reference set (the specific Belief Fields, classifications, and advisory flags that produced it) are generated together, as one unit, per Architecture P6. Justification is never a separate step performed after the fact.
9. **Handoff to Arbitration.** The proposal crosses out of the Mission Executive into the independent Arbitration function. The Mission Executive has no further influence over what happens to it.
10. **Outcome intake.** On the next cycle, the Mission Executive reads back Arbitration's outcome (accepted / modified / rejected) as part of its own continuity state (Section 3) — not as a belief, and not as something that can retroactively change what was believed in the cycle that produced the proposal.

---

## 3. Inputs

The Mission Executive has exactly one substantive external input, plus two pieces of internal continuity state that are explicitly *not* beliefs and must never be confused with Snapshot data.

**3.1 External input**
- **The current World State Snapshot** — the whole object, published atomically by the WSE. This is the only channel through which anything about the aircraft, the environment, or the mission enters the Mission Executive's reasoning.

**3.2 Internal continuity state (not beliefs, held by the Mission Executive itself)**
- **Active Intent Register** — a record of whichever intent Arbitration most recently accepted (unmodified or modified) and is therefore presumed to still be in effect. This exists so that "continue" means something concrete — continue *what* — without requiring the Mission Executive to infer current intent from physical state, which would blur belief and intent (Architecture P4). It is written only by the outcome-intake step (Section 2, step 10), never inferred from the Snapshot.
- **Last-cycle outcome** — whether the previous proposal was accepted, modified, or rejected, retained only long enough to inform the current cycle's justification (e.g., "the prior proposal to continue was rejected by Arbitration; re-evaluating" is a fact the explanation should be able to state). This is not a belief about the world and carries no confidence or freshness attribute of its own.

**3.3 What is explicitly not an input**
- Raw Evidence Records, individual Belief Fields, or anything from the WSE other than a whole Snapshot (WSE §8, no-skip rule).
- Operator commands. Per the Operator Interface Boundary (Architecture §3.6), an operator command is routed directly into the same proposal path Arbitration checks — it does not enter the Mission Executive's reasoning as an input, and it does not get to compete with or override what the Mission Executive currently believes. The Mission Executive may become aware, via the outcome-intake step, that an operator-originated proposal was the one Arbitration most recently accepted (this simply updates the Active Intent Register like any other accepted proposal) — but it never treats an operator command as evidence about the world.

---

## 4. Outputs

The Mission Executive produces exactly two things, generated together as required by Section 2, step 8, and nothing else.

**4.1 Proposed Intent** — one of a fixed set of high-level intent categories, never anything more specific than that (never an actuator value, never a trajectory, never a control gain):
- **Continue** — proceed with the current mission activity as reflected in the Active Intent Register.
- **Adjust** — a conservative modification to the current activity (reduced envelope, re-route, altered pace) appropriate to the specific condition that triggered it.
- **Hold** — pause forward mission progress at the current safe state.
- **Divert** — proceed to an alternate candidate site rather than the original destination.
- **Abort / Return-to-Base** — the most conservative class of proposal; terminate the current mission activity in favor of the safest available resolution.

**4.2 Justification Reference Set** — the specific Belief Fields (by domain and value/confidence/freshness), classifications, advisory flags, and precedence-evaluation branch that produced the proposal, plus (when relevant) the last-cycle outcome that informed it. This is handed to Layer E to render as a human-readable explanation; the Mission Executive does not render prose itself, it only ever produces the traceable *material* an explanation is built from (Architecture §3.5 boundary).

**4.3 What is never an output**
- Any direct instruction to an actuator, control surface, or the flight-control layer, under any condition, including Section 6 emergency behavior (Product Spec §4, Architecture P1).
- Domain classifications and Executive Posture are made available read-only to the Operator Interface Boundary for situational awareness (Product Spec §9.14), but this is a side-channel visibility property, not a decision output, and carries no authority of its own.

---

## 5. Risk Assessment

Risk, inside the Mission Executive, is not a single number — it is the outcome of the cross-domain reconciliation step (Section 2, step 5), and it is evaluated along three distinct dimensions that are kept separate so that no single dimension can quietly absorb or hide the others:

**5.1 Safety risk** — whether health or navigation conditions are approaching or have crossed a threshold. Governed entirely by deterministic classification; the highest-precedence dimension, per Section 2, step 6.

**5.2 Mission risk** — whether the mission, as currently defined, remains achievable given current margin: energy trend against remaining distance/time, schedule margin, payload status. This is where the airframe's known aerodynamic characteristics (Product Spec §2.2 — positive pitching moment, negative lift, high drag in forward flight) matter most directly: the Mission Executive reasons about the Power/Energy belief and Mission Progress belief it is actually given, never against an idealized-VTOL assumption of what energy consumption "should" look like. A mission whose margin is eroding faster than planned is a mission-risk condition even when health and navigation are both nominal.

**5.3 Compounded risk** — conditions that are individually below their own threshold but, taken together, indicate more risk than either alone would suggest (e.g., a Power/Energy belief trending downward *and* an Atmospheric belief showing headwind on the return leg). This is the concrete mechanism by which Product Spec §9.7 ("degradation in one domain must affect judgment about the others") is implemented: cross-domain reconciliation does not just pass/fail each domain independently, it checks whether the *combination* of near-threshold conditions across domains should itself be treated as a degraded or critical condition, even though no single domain individually crossed its own line.

**5.4 Confidence as a risk multiplier.** A belief with low confidence is treated as carrying more risk than the same value with high confidence, not the same risk. This is not a separate scoring step — it is enforced structurally by the freshness/confidence gate (Section 2, step 2): a low-confidence domain is never averaged into a "probably fine" classification, it is marked unknown, which forces the most conservative branch of the precedence order regardless of what the underlying value happened to be.

---

## 6. Emergency Behaviour

There is no emergency path in the Mission Executive that is faster, wider, or less checked than the normal one. This is a deliberate, structural choice, not an oversight: an "emergency shortcut" is exactly the kind of path the Product Specification and Architecture documents rule out by name (Product Spec §4, §9.9; Architecture P2, Invariant 2). What differs under emergency conditions is not the *path* an intent takes, but which intents become reachable and how fast the Mission Executive is willing to move toward the most conservative one.

**6.1 Critical-condition emergencies (normal reasoning, urgent conclusion).** A health or navigation condition crossing a critical threshold is handled by the same decision flow as everything else (Section 2), just landing on the highest-precedence branch: an abort-class proposal, generated with full justification, sent to Arbitration exactly like any other proposal. Urgency changes the *content* of the proposal, never the *process* that produces or checks it.

**6.2 Mission Executive fault (the reasoning process itself breaks).** If the proposal function cannot complete a cycle — a domain evaluation faults, reconciliation cannot resolve, or any internal fault prevents Section 2 from finishing — the Mission Executive does not retry indefinitely or fall back to its last successful proposal as if nothing changed. Executive Posture is immediately set to **SUSPENDED**, and a single, pre-defined minimal safe proposal is substituted in place of normal reasoning output. Consistent with the open question the Architecture document raised on this exact point (Architecture §7, Open Question 1), this document takes the position that the minimal safe proposal should vary by Mission Phase State rather than being a single fixed behavior: a hover-phase fault defaults to **hold**, a cruise or transition-phase fault defaults to **return-to-base**, because "hold" is not always the lower-risk option once the aircraft is already committed to forward flight on an airframe with known energy and drag disadvantages (Product Spec §2.2). This substituted proposal still passes through Arbitration in full — a fault inside the Mission Executive is never treated as license to skip the check.

**6.3 Arbitration unavailable or inconclusive.** This is outside the Mission Executive's own boundary, but governs what the Mission Executive can assume about its own proposals: if Arbitration cannot produce a valid result, the proposal is treated as rejected by default (fail-closed, Architecture §7, Invariant 3). The Mission Executive never interprets silence or an unclear outcome from Arbitration as approval to proceed.

**6.4 Operator override during an emergency.** An operator command issued during a critical condition is not given any special priority over the Mission Executive's own abort-class proposal — both are proposed intents, both go through the same Arbitration check, and Arbitration decides between or reconciles them on the merits of the constraint check alone (Product Spec §9.15, §11). The Mission Executive does not defer to, or resist, an operator command differently because the situation is urgent.

**6.5 No silent failure.** If the Mission Executive cannot produce a justification for whatever proposal it substitutes (e.g., under the fault condition in 6.2), that gap is explicitly recorded as a gap by Layer E, never presented as if a normal, fully-reasoned decision occurred (Architecture §7, row E).

---

## 7. Confidence System

Confidence inside the Mission Executive is never invented — it is inherited from the Snapshot and then aggregated in a specific, conservative way at each level of reasoning, so that a single strong belief can never mask a single weak one.

**7.1 Field-level confidence (inherited).** Each Belief Field arrives already carrying its own confidence and freshness from the WSE. The Mission Executive treats these as given facts about the WSE's certainty — it does not re-derive or second-guess them (WSE §8, one-way boundary).

**7.2 Domain-level confidence (aggregated, weakest-link).** Each domain (health, navigation, mission) draws on several Belief Fields. Domain-level confidence is set by the *least* confident field materially relevant to that domain's classification for the current cycle — not an average. Averaging would let several confident fields dilute one genuinely uncertain one; a weakest-link rule keeps the uncertainty visible exactly where the Architecture document requires it to stay visible (Architecture P3, P7).

**7.3 Decision-level confidence (distinct from domain confidence).** Separately from how confident the Mission Executive is in a domain's classification, it also tracks how confident it is that the *proposal chosen* is the right response to that classification — this matters specifically where advisory judgment contributed a flag. A proposal can be produced from a fully certain deterministic classification (e.g., a hard threshold crossed) or from a classification that leaned on a confidence-scored advisory flag; the two must never be presented identically. This is the direct implementation of Product Spec §9.11 and §5's requirement to "never present model-derived judgment as if it were deterministic certainty" — every proposal's justification reference set (Section 4.2) carries this distinction explicitly, tagging which parts of the reasoning were deterministic fact and which were confidence-scored advisory input.

**7.4 Confidence floor.** Each domain has its own minimum usable confidence, below which the domain is not "low confidence" — it is **unknown**, and step 2 of the decision flow routes it directly to the conservative-fallback branch regardless of what the underlying value suggests. This floor is a property of each domain's own sensitivity (consistent with the WSE's per-field freshness thresholds, WSE §5.3), not a single global cutoff applied uniformly.

**7.5 No confidence recovery from silence.** Confidence is never allowed to passively climb back up because no new bad evidence arrived — it only rises when a fresh, materially supporting Snapshot actively confirms the improved condition (Section 1.2, posture recovery rule).

---

## 8. Mission Logic

Mission reasoning is the Mission Executive's most distinctive responsibility, because — unlike health and navigation, which are fundamentally about the aircraft's own state — mission status is about whether an assigned objective remains achievable given everything else that is true right now.

**8.1 Achievability, not just progress.** Mission Progress belief (from the WSE) tells the Mission Executive how far along the mission is. Mission risk (Section 5.2) is a separate judgment the Mission Executive makes on top of that: given current energy trend, schedule margin, and environmental conditions, does completing the mission as currently defined remain realistic? A mission can be on-track by distance covered and still be assessed as at-risk if the margin behind that progress is thinning faster than planned.

**8.2 Mission concerns never outrank safety.** Per the fixed precedence order (Section 2, step 6), a critical health or navigation condition is evaluated and resolved *before* mission status is consulted at all. No mission-risk condition, however severe, can produce a proposal that takes precedence over an abort-class response to a critical safety condition. This is intentional and absolute (Architecture §5).

**8.3 Mission concerns can independently trigger conservative action.** The reverse is not true: a mission-risk condition does not require health or navigation to also be degraded before the Mission Executive proposes an adjustment. An eroding energy margin, on its own, with health and navigation both nominal, is sufficient grounds for an "adjust" or "divert" proposal — mission risk is a first-class trigger in the precedence order, not a tiebreaker consulted only when everything else is ambiguous.

**8.4 Re-tasking is new evidence, not an amendment.** When Mission Definition belief changes (an operator issues a new or amended mission), the Mission Executive does not carry forward the old Mission Progress calculation and simply re-point it at a new destination. A changed Mission Definition is treated as new evidence requiring the full achievability judgment (8.1) to be re-run against the current Snapshot before the Mission Executive will propose continuation under the new definition — consistent with the WSE's own treatment of Mission Definition as evidence subject to confidence and freshness discipline (WSE §3.5), and with the Product Specification's still-open question on what re-tasking concretely looks like for this cargo use case (Product Spec §7.4, Open Question 2). Until that product-level question is resolved, this document assumes re-tasking is possible but always re-validated, never assumed compatible with prior progress.

**8.5 Mission logic never edits the mission.** The Mission Executive interprets and judges the Mission Definition it is given; it has no authority to redefine the objective, extend a deadline, or invent an alternate mission. Its only available response to an unachievable mission is one of the fixed proposal categories (adjust, divert, abort) — never a silent substitution of a different goal.

---

## Open Items Carried Forward

Consistent with the practice in the parent documents, these are refinements of already-open questions, not new scope:

1. This document takes a position on Architecture Open Question 1 (minimal safe proposal should vary by Mission Phase State — Section 6.2) — this should be confirmed or overridden before further specification depends on it.
2. Mission Logic (Section 8.4) assumes re-tasking is supported but always re-validated; this remains provisional pending resolution of Product Spec §7.4, Open Question 2 (what a "mission" concretely consists of for this use case).
3. Whether Environment State should carry an explicit sub-grouping for airframe-specific aerodynamic sensitivity (WSE Open Item 1) directly affects how precisely Mission Logic (Section 8.1) can reason about energy margin under specific wind/drag conditions versus reasoning about them only generically through the existing Power/Energy and Atmospheric beliefs.
