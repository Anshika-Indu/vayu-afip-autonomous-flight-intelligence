# Autonomous Flight Intelligence Platform (AFIP)
## Sequence Diagrams — Mission Phase Reasoning Cycles

**Document ID:** AFIP-SE-005
**Document Type:** Systems Engineering — Sequence Diagram Specification
**Status:** Draft v0.1
**Prepared By:** Systems Engineering & Documentation Lead (AFIP)
**Derived From:** AFIP Product Specification v0.2; AFIP Software Architecture v0.1; AFIP World State Engine v0.1; AFIP Mission Executive v0.1; AFIP Navigation System v0.1; AFIP Health Monitoring System v0.1; AFIP Explainability Engine v0.1
**Related Documents:** AFIP-SE-001 (Data Flow), AFIP-SE-002 (Event Flow), AFIP-SE-003 (ICD), AFIP-SE-004 (State Machine Specification)
**Baseline vs. Implementation:** All actors, message directions, and orderings below are traced to the ICD (AFIP-SE-003) and the two state machines (AFIP-SE-004). No new participant, message, or ordering is introduced. Where the current implementation phase realizes a step under different working names (Prediction Engine, Risk Engine, Mission Timeline, Operator Commands), this is marked with a labeled **Implementation Note** at the point it first appears, per AFIP-SE-002 §3.
**Scope of this document:** One sequence diagram per Mission Phase State (AFIP-SE-004 §2), plus one per off-nominal branch, showing a single representative reasoning cycle. Each diagram is a specific instantiation of the same canonical decision cycle (Section 2) — repeated boilerplate is intentionally avoided by presenting the canonical cycle once and then annotating only what is materially different in each phase.

---

## 1. Participants

Every sequence diagram in this document uses the same fixed cast of participants, drawn directly from the ICD (AFIP-SE-003 §2). No sequence diagram introduces a participant not already defined there.

| Participant | Role | Governing Document |
|---|---|---|
| **SIM** | Flight Simulator (sole source of physical truth, outside AFIP) | Product Spec §10 |
| **EI** | Evidence Intake (Layer A) | Architecture §3.1 |
| **WSE** | World State Engine (Layer B) | WSE, all sections |
| **HMS** | Health Monitoring System | HMS, all sections |
| **ME** | Mission Executive (Proposal function) | Mission Executive §2, §4 |
| **ARB** | Arbitration (Layer D, Arbitration function) | Architecture §3.4 |
| **NS** | Navigation System | NS, all sections |
| **XE** | Explainability Engine (Layer E) | XE, all sections |
| **OP** | Operator Interface Boundary | Architecture §3.6 |

---

## 2. Canonical Reasoning Cycle (Baseline Pattern)

Every phase-specific diagram in Section 3 is a variant of this one cycle. It is shown once here in full; subsequent sections reference it and annotate only the phase-specific delta.

```
SIM      EI       WSE      HMS      ME       ARB      NS       XE       OP
 │        │        │        │        │        │        │        │        │
 │─raw───►│        │        │        │        │        │        │        │   (ICD-001)
 │signals │        │        │        │        │        │        │        │
 │        │─Evidence────────►│        │        │        │        │        │   (ICD-002)
 │        │ Record  │        │        │        │        │        │        │
 │        │        │─reconcile        │        │        │        │        │   (WSE §3.2)
 │        │        │  (belief         │        │        │        │        │
 │        │        │   formed)        │        │        │        │        │
 │        │        │─Snapshot────────►│        │        │        │        │   (ICD-003/004)
 │        │        │ (read-only)      │        │        │        │        │
 │        │        │        │─classify│        │        │        │        │   (HMS §5-§7)
 │        │        │        │ health  │        │        │        │        │
 │        │        │        │─Health Domain────►│        │        │        │   (ICD-005)
 │        │        │        │ Judgment│        │        │        │        │
 │        │        │        │        │─Decision Flow    │        │        │   (ME §2
 │        │        │        │        │ steps 1-7        │        │        │    steps 1-7)
 │        │        │        │        │─Proposed────────►│        │        │   (ICD-006)
 │        │        │        │        │ Intent +          │        │        │
 │        │        │        │        │ Justification     │        │        │
 │        │        │        │        │                  │        │        │
 │        │        │        │        │        │(check against   │        │   (ARCH §3.4)
 │        │        │        │        │        │ constraint set) │        │
 │        │        │        │        │◄─Outcome────────  │        │        │   (ICD-009)
 │        │        │        │        │ (Accept/Modify/   │        │        │
 │        │        │        │        │  Reject)          │        │        │
 │        │        │        │        │        │─Accepted─────────►│        │   (ICD-008)
 │        │        │        │        │        │ Intent   │        │        │
 │        │        │        │        │        │        │─plan────►│        │
 │        │        │        │        │        │        │ route/  │        │
 │        │        │        │        │        │        │ setpoints│        │
 │        │        │        │        │        │        │─Guidance►SIM     │   (ICD-010)
 │        │        │        │        │        │        │ Setpoints│        │
 │        │        │        │        │        │        │─Route───►│        │   (ICD-011,
 │        │        │        │        │        │        │ Status/  │        │    re-enters
 │        │        │        │        │        │        │ facts    │        │    next cycle
 │        │        │        │        │        │        │ (to EI)  │        │    via EI)
 │        │        │        │        │─Justification+Outcome──────►│        │   (ICD-012)
 │        │        │        │        │        │        │        │─render  │   (XE §5)
 │        │        │        │        │        │        │        │ explan. │
 │        │        │        │        │        │        │        │─Rendered───►│ (ICD-014)
 │        │        │        │        │        │        │        │ Explanation │
 │        │        │        │        │        │        │        │(Alert tier) │
 │        │        │        │        │        │        │        │        │
```

**Fixed properties of every instantiation of this cycle (never varied):**

1. Evidence always enters through EI → WSE before anything reasons on it (Architecture Invariant 1).
2. HMS and ME read the *same* Snapshot, never a partial or pre-release view (WSE §3.6, §6).
3. ME's Proposed Intent and Justification are generated together, never staggered (Mission Executive §2 step 8; Architecture P6).
4. Every proposal — from ME or from OP — passes through ARB before NS ever sees it (Architecture Invariant 2).
5. ARB's outcome is recorded and explained regardless of whether it was Accept, Modify, or Reject (Architecture §4 flow rule 3).
6. NS's facts re-enter through EI, never directly into WSE or ME (NS §11.2).
7. XE renders at the moment of decision, never after the fact (Architecture P6).

---

## 3. Phase-Specific Sequence Diagrams (Nominal Path)

Each diagram below shows only what is materially different from the canonical cycle (Section 2) for that Mission Phase State (AFIP-SE-004 §2.3). The canonical message pattern (SIM→EI→WSE→{HMS,ME}→ARB→{NS,XE}) is not re-drawn in full where it is unchanged.

### 3.1 PRE-MISSION VALIDATION

```
SIM/EI      WSE          HMS                    ME                      OP
  │          │             │                     │                       │
  │─raw─────►│             │                     │                       │
  │ pre-     │             │                     │                       │
  │ flight   │             │                     │                       │
  │ signals  │             │                     │                       │
  │          │─Mission Definition                │                       │
  │          │ belief accepted (new evidence)     │                       │
  │          │             │                     │                       │
  │          │─Snapshot───►│                     │                       │
  │          │            │─Mission Readiness    │                       │
  │          │            │ assessment           │                       │
  │          │            │ (Ready / Ready-with- │                       │
  │          │            │  Constraints / Not   │                       │
  │          │            │  Ready) (HMS §5,§6.6)│                       │
  │          │            │─Health Domain────────►│                       │
  │          │            │ Judgment (incl.      │                       │
  │          │            │ Mission Readiness)   │                       │
  │          │             │                     │─freshness/confidence  │
  │          │             │                     │ gate (step 1-2)       │
  │          │             │                     │─recognizes phase      │
  │          │             │                     │ transition condition  │
  │          │             │                     │ met (or not)          │
  │          │             │                     │─(situational          │
  │          │             │                     │  awareness read)──────►│  (ICD-015)
  │          │             │                     │                       │
```

**Phase-specific delta:** No Proposed Intent normally crosses to Arbitration in this phase unless Mission Readiness = Not Ready and a corresponding Abort intent is generated (AFIP-SE-004 §2.3.1, open item on proposal category). The nominal exit — recognizing readiness and transitioning to ASCENT — is a **read**, not an Arbitration-checked event (Mission Executive §1.1).

### 3.2 ASCENT

Follows the canonical cycle in full, with these phase-specific participants and inputs:

```
                          HMS                             ME
                           │                                │
                           │─Motors/ESCs sub-score          │
                           │ weighted 25% (HMS §7.2),        │
                           │ evaluated under highest         │
                           │ thermal-load flight regime      │
                           │ (hover-adjacent) (HMS §6.2)      │
                           │─Health Domain Judgment──────────►│
                           │                                │─precedence evaluation:
                           │                                │ if Critical → abort-class
                           │                                │ proposal ahead of mission
                           │                                │ status (ME §2 step 6, §8.2)
```

**Phase-specific delta:** If HMS reports a Critical-tier motor condition, ME's step 6 critical-condition branch produces an abort-class Proposed Intent regardless of Mission Progress; this proposal still flows through the unchanged canonical ARB → NS/XE path.

### 3.3 TRANSITION (OUT)

```
                          WSE                             ME                    NS
                           │                                │                     │
                           │─Kinematic/Pose belief           │                     │
                           │ (nacelle angle in transition    │                     │
                           │ range) — Product Spec §10:      │                     │
                           │ "distinct, less-stable          │                     │
                           │ transition regime,              │                     │
                           │ not an edge case"                │                     │
                           │─Snapshot──────────────────────►│                     │
                           │                                │─recognizes TRANSITION │
                           │                                │ (OUT) phase, no       │
                           │                                │ Arbitration needed     │
                           │                                │ for the recognition    │
                           │                                │ itself (ME §1.1)       │
                           │                                │                     │
                           │                                │─(if fault) minimal    │
                           │                                │ safe proposal =       │
                           │                                │ Return-to-Base        │
                           │                                │ (ME §6.2)──────────────────────►│
```

**Phase-specific delta:** This is the first phase where a Mission Executive-fault minimal safe proposal default is explicitly named in the source material (Return-to-Base, ME §6.2) — contrast with ASCENT, where this remains an open item (AFIP-SE-004 §2.3.2).

### 3.4 CRUISE

```
                          WSE                HMS                    ME
                           │                   │                      │
                           │─Power/Energy       │                      │
                           │ belief (energy     │                      │
                           │ trend against       │                      │
                           │ remaining distance) │                      │
                           │─Snapshot──────────►│                      │
                           │                    │─Battery/Power sub-   │
                           │                    │ score weighted 30%   │
                           │                    │ (highest cruise      │
                           │                    │ energy consumption,  │
                           │                    │ HMS §7.2)             │
                           │                    │─Health Domain────────►│
                           │                     │ Judgment              │
                           │                                            │─risk assessment
                           │                                            │ (mission risk,
                           │                                            │  ME §5.2, §8.3):
                           │                                            │ eroding margin
                           │                                            │ alone, health
                           │                                            │ nominal, is
                           │                                            │ sufficient grounds
                           │                                            │ for Adjust/Divert
```

**Phase-specific delta:** This is the phase in which Mission Executive §8.3's rule — that mission risk can independently justify a proposal even with health and navigation nominal — is most directly exercised, per the airframe's known cruise-phase energy and drag characteristics (Product Spec §2.2).

### 3.5 TRANSITION (IN)

```
                          WSE                             ME
                           │                                │
                           │─Kinematic/Pose belief           │
                           │ (nacelle angle reversing         │
                           │ toward hover config.)            │
                           │─Snapshot──────────────────────►│
                           │                                │─recognizes TRANSITION
                           │                                │ (IN); same "distinct,
                           │                                │ less-stable regime"
                           │                                │ treatment as OUT
                           │                                │ (Product Spec §10)
                           │                                │
                           │                                │─(if fault) minimal
                           │                                │ safe proposal =
                           │                                │ Return-to-Base
                           │                                │ (ME §6.2, same
                           │                                │  classification as
                           │                                │  TRANSITION (OUT))
```

**Phase-specific delta:** Identical fault-handling classification to TRANSITION (OUT) — both are explicitly grouped under "transition phase" in ME §6.2.

### 3.6 APPROACH/DESCENT

```
                          WSE                HMS                    ME                    NS
                           │                   │                      │                     │
                           │─Kinematic/Pose     │                      │                     │
                           │ belief (descending  │                      │                     │
                           │ toward destination)  │                      │                     │
                           │─Snapshot──────────►│                      │                     │
                           │                    │─(possible hover-      │                     │
                           │                    │  adjacent thermal     │                     │
                           │                    │  loading recurrence,  │                     │
                           │                    │  HMS §6.2)             │                     │
                           │                    │─Health Domain────────►│                     │
                           │                     │ Judgment               │                     │
                           │                                             │─final-approach       │
                           │                                             │ routing request──────►│
                           │                                             │                     │─Landing Zone
                           │                                             │                     │ Finder candidate
                           │                                             │                     │ data continuously
                           │                                             │                     │ available (NS §9)
```

**Phase-specific delta:** Landing Zone Finder candidate data is available throughout this phase regardless of whether a contingency landing is anticipated (NS §9) — a standing input, not one generated only on demand.

### 3.7 LANDED / MISSION COMPLETE

```
                          WSE                             ME                      XE
                           │                                │                       │
                           │─final Mission Progress          │                       │
                           │ belief + Kinematic/Pose belief   │                       │
                           │ confirm landed state             │                       │
                           │─Snapshot──────────────────────►│                       │
                           │                                │─confirms Health/       │
                           │                                │ Navigation/Mission all  │
                           │                                │ nominal at completion   │
                           │                                │ (XE §7.6 precondition)  │
                           │                                │─Justification+Outcome───►│
                           │                                │                       │─renders
                           │                                │                       │ "Mission
                           │                                │                       │ Completed"
                           │                                │                       │ template
                           │                                │                       │ (XE §7.6)
```

**Phase-specific delta:** This is the only phase whose XE rendering template requires **all three** domain classifications to be nominal as a precondition (XE §7.6) — any degraded/critical classification at the moment of landing routes to a contingency LANDED state instead (Section 4).

---

## 4. Off-Nominal Branch Sequence Diagrams

Each off-nominal branch shares the same trailing sequence — Arbitration acceptance → Navigation System execution → Explainability Engine rendering of the applicable template → contingency landing — shown once at the end of this section (Section 4.5) rather than repeated per branch.

### 4.1 HOLD

```
WSE            ME                          ARB                    NS
 │              │                            │                      │
 │─Snapshot────►│                            │                      │
 │             │─freshness/confidence gate    │                      │
 │             │ fails for a domain            │                      │
 │             │ (ME §2 step 1)                │                      │
 │             │─Proposed Intent: HOLD +──────►│                      │
 │             │ Justification                 │                      │
 │             │                              │─check against         │
 │             │                              │ constraint set         │
 │             │◄─Outcome: Accept─────────────│                        │
 │             │                              │─Accepted Intent:───────►│
 │             │                              │ HOLD                   │
 │             │                              │                        │─pauses forward
 │             │                              │                        │ mission progress
 │             │                              │                        │ at current safe
 │             │                              │                        │ state (NS §2)
```

**Note:** HOLD may also originate as the Mission Executive-fault minimal safe substitute during a hover-phase fault (ME §6.2) — in that case, the "freshness/confidence gate fails" step above is replaced by "ME proposal function faults; Executive Posture → SUSPENDED; minimal safe proposal substituted," with every downstream step (ARB check, NS execution) unchanged.

### 4.2 DIVERT

```
NS                          ME                          ARB                    NS
 │                            │                            │                      │
 │─ranked candidate           │                            │                      │
 │ landing sites (via EI,     │                            │                      │
 │ NS §9, continuously        │                            │                      │
 │ maintained)────────────────►│                            │                      │
 │                            │─risk assessment (degraded/  │                      │
 │                            │ mission-risk branch, or      │                      │
 │                            │ critical branch where RTB    │                      │
 │                            │ is not the safest resolution,│                      │
 │                            │ XE §7.2)                     │                      │
 │                            │─Proposed Intent: DIVERT─────►│                      │
 │                            │ (to candidate) + Justification│                      │
 │                            │                              │─check                │
 │                            │◄─Outcome: Accept─────────────│                      │
 │                            │                              │─Accepted Intent:─────►│
 │                            │                              │ DIVERT to <candidate>│
 │                            │                              │                      │─plans/executes
 │                            │                              │                      │ route to
 │                            │                              │                      │ candidate site
 │                            │◄──────────────Route Status (unreachable, if so)─────│  (re-enters
 │                            │                                                      │   via EI)
 │                            │─(if unreachable) re-evaluate against next candidate  │
```

### 4.3 RETURN-TO-BASE

```
HMS                          ME                          ARB                    NS
 │                            │                            │                      │
 │─Critical-tier health        │                            │                      │
 │ condition (HMS §9,          │                            │                      │
 │ Critical/Emergency)─────────►│                            │                      │
 │                            │─precedence evaluation:       │                      │
 │                            │ critical branch (ME §2 step  │                      │
 │                            │ 6) — mission status NOT      │                      │
 │                            │ consulted at this step        │                      │
 │                            │─Proposed Intent: RTB────────►│                      │
 │                            │ + Justification               │                      │
 │                            │                              │─check                │
 │                            │◄─Outcome: Accept─────────────│                      │
 │                            │                              │─Accepted Intent:─────►│
 │                            │                              │ RTB to <base>        │
 │                            │                              │                      │─executes route
 │                            │                              │                      │ to base
 │                            │◄──────────────Route Status (unreachable, if so)─────│
 │                            │─(if unreachable) may re-propose DIVERT (XE §7.2)      │
```

### 4.4 ABORT

```
WSE                          ME                          ARB                    NS
 │                            │                            │                      │
 │─Power/Energy belief         │                            │                      │
 │ (mission-risk condition,     │                            │                      │
 │ health & navigation nominal, │                            │                      │
 │ ME §8.3)─────────────────────►│                            │                      │
 │                            │─risk assessment: mission-    │                      │
 │                            │ risk branch (XE §7.4)         │                      │
 │                            │─Proposed Intent: ABORT───────►│                      │
 │                            │ + Justification                │                      │
 │                            │                              │─check                 │
 │                            │◄─Outcome: Accept──────────────│                      │
 │                            │                              │─Accepted Intent:──────►│
 │                            │                              │ ABORT                 │
 │                            │                              │                      │─executes toward
 │                            │                              │                      │ safest available
 │                            │                              │                      │ resolution
```

**Note:** ME has no authority to redefine the mission objective at this or any step — Abort is a fixed response category (ME §8.5), not a substitute mission.

### 4.5 Common Trailing Sequence (All Off-Nominal Branches) → LANDED (Contingency)

```
ARB                    XE                          OP
 │                       │                            │
 │─Justification+────────►│                            │
 │ Outcome                │                            │
 │                       │─renders applicable template:│
 │                       │  Return Home (XE §7.1),      │
 │                       │  Emergency Landing (XE §7.2),│
 │                       │  or Mission Abort (XE §7.4)  │
 │                       │─Rendered Explanation────────►│
 │                       │ + Alert tier (Critical/       │
 │                       │  Emergency, XE §8)             │
 │                       │                              │─operator
 │                       │                              │ acknowledges
 │                       │                              │ (if required)
                          (aircraft reaches contingency destination)
                          Mission Phase State → LANDED (contingency)
                          (AFIP-SE-004 §2.3.8)
```

---

## 5. Traceability Notes

Every message in every diagram above corresponds to a numbered interface in AFIP-SE-003 (ICD) or a numbered event in AFIP-SE-002 (Event Flow), and every phase corresponds to a state already defined in AFIP-SE-004 (State Machine Specification). No new participant, message type, or ordering has been introduced. The two open items carried forward from AFIP-SE-004 §6 (ASCENT/APPROACH-DESCENT fault classification; SUSPENDED recovery target) apply equally here and are not re-resolved by this document — where a diagram would depend on their resolution (Sections 3.2, 3.6), this is noted rather than assumed.

---

**End of Document 5 — Sequence Diagrams for Every Mission Phase**
