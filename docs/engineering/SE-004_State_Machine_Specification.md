# Autonomous Flight Intelligence Platform (AFIP)
## State Machine Specification

**Document ID:** AFIP-SE-004
**Document Type:** Systems Engineering — State Machine Specification
**Status:** Draft v0.1
**Prepared By:** Systems Engineering & Documentation Lead (AFIP)
**Derived From:** AFIP Product Specification v0.2; AFIP Software Architecture v0.1; AFIP World State Engine v0.1; AFIP Mission Executive v0.1; AFIP Navigation System v0.1; AFIP Health Monitoring System v0.1; AFIP Explainability Engine v0.1
**Related Documents:** AFIP-SE-001 (Data Flow), AFIP-SE-002 (Event Flow), AFIP-SE-003 (ICD)
**Baseline vs. Implementation:** The uploaded architecture documents are the sole authority for every state, transition, and safety constraint below. No new state is introduced beyond what Mission Executive §1.1 and §1.2 already define. Where the current implementation phase realizes a transition mechanism under a different working name, this is noted in a labeled **Implementation Note**; no such note changes a state's entry/exit conditions, allowed transitions, or responsible module.
**Scope of this document:** Two state machines, as required: (A) the high-level **Mission Phase State** (mission lifecycle), and (B) the Mission Executive's internal **Executive Posture** state (decision authority). Both are specified exactly as defined in Mission Executive §1, with every transition traced to a specific triggering event or evidence update already established in the source documents. Where the source material does not specify a detail (e.g., which specific posture a recovery from SUSPENDED resumes to), this document flags it as an **open item** rather than inventing a resolution.

---

## 1. Why Two State Machines, Never One

Mission Executive §1 establishes, as a foundational design rule, that Mission Phase State and Executive Posture are **related but must never be collapsed into one**, for the same reason belief and intent are never collapsed (Architecture P4). Mission Phase State is a *read of the world* — what stage the mission is at, derived from Mission State and Aircraft State in the Snapshot. Executive Posture is a *property of the Mission Executive's own trust in its own reasoning* — how much latitude it currently claims for itself. Conflating them would let a confident-sounding mission phase mask a genuinely degraded reasoning state, or let a cautious posture be mistaken for a mission-phase condition (Mission Executive §1).

This document therefore specifies both as fully independent state machines (Sections 2 and 3), then addresses their permitted interaction explicitly in Section 4.

---

## 2. State Machine A — Mission Phase State

### 2.1 Overview

Mission Phase State reflects where the mission currently stands, derived each cycle from Mission State (Mission Definition + Mission Progress) and Aircraft State (kinematic/pose) in the Snapshot. **This is a read, not a decision** — the Mission Executive recognizes a phase transition; it does not command one (Mission Executive §1.1). This distinction governs the "Trigger Events" and "Responsible Module" fields for every nominal-path state below.

Nominal sequence (Mission Executive §1.1):

```
PRE-MISSION VALIDATION → ASCENT → TRANSITION (OUT) → CRUISE →
TRANSITION (IN) → APPROACH/DESCENT → LANDED / MISSION COMPLETE
```

Off-nominal branches, reachable from **any** of the above states, but **only** once a corresponding intent has been accepted by Arbitration — never entered unilaterally by the Mission Executive (Mission Executive §1.1):

```
HOLD → (resume prior phase, or) → DIVERT → LANDED (contingency)
     → RETURN-TO-BASE → LANDED (contingency)
     → ABORT → LANDED (contingency)
```

### 2.2 State Diagram

```
        ┌─────────────────────┐
        │ PRE-MISSION          │
        │ VALIDATION           │
        └──────────┬───────────┘
                    │ (Mission Readiness = Ready; recognized)
                    ▼
        ┌─────────────────────┐
        │ ASCENT                │◄──────────────┐
        └──────────┬───────────┘                │
                    │ (nacelle transition begins)│
                    ▼                            │
        ┌─────────────────────┐                 │  resume prior
        │ TRANSITION (OUT)      │                 │  phase after
        └──────────┬───────────┘                 │  HOLD clears
                    │ (cruise config. reached)    │
                    ▼                            │
        ┌─────────────────────┐                 │
        │ CRUISE                │                 │
        └──────────┬───────────┘                 │
                    │ (approach recognized)       │
                    ▼                            │
        ┌─────────────────────┐                 │
        │ TRANSITION (IN)       │                 │
        └──────────┬───────────┘                 │
                    │ (hover config. reached)     │
                    ▼                            │
        ┌─────────────────────┐                 │
        │ APPROACH/DESCENT      │                 │
        └──────────┬───────────┘                 │
                    │ (landed, all domains nominal)│
                    ▼                            │
        ┌─────────────────────┐                 │
        │ LANDED / MISSION      │                 │
        │ COMPLETE (terminal)   │                 │
        └─────────────────────┘                 │
                                                  │
   ══════ Off-nominal (any state above, only ═════╪══════════════════
   ══════ upon Arbitration-accepted intent) ══════╪══════════════════
                                                  │
        ┌─────────────────────┐                 │
        │ HOLD                  │─────────────────┘
        └──────────┬───────────┘
             ┌──────┼──────┐
             ▼      ▼      ▼
      ┌──────────┐ ┌──────────────┐ ┌─────────┐
      │ DIVERT    │ │ RETURN-TO-BASE│ │ ABORT   │
      └─────┬────┘ └───────┬───────┘ └────┬────┘
            └───────┬───────┴───────────────┘
                     ▼
          ┌───────────────────────┐
          │ LANDED (contingency)   │
          │ (terminal)              │
          └───────────────────────┘
```

### 2.3 Per-State Specification

#### 2.3.1 PRE-MISSION VALIDATION

| Property | Specification |
|---|---|
| **Entry Conditions** | A mission is assigned; Mission Definition belief is accepted by the WSE as evidence (WSE §3.5). AFIP begins checking whether it has a sufficiently confident picture of the aircraft and environment, and whether the mission is achievable given known constraints (Product Spec §8, user journey steps 1–2). |
| **Exit Conditions** | Mission Readiness (HMS §5) is assessed as Ready or Ready with Constraints, and Mission Executive's freshness/confidence gate (Mission Executive §2 step 2) and precedence evaluation (step 6) do not indicate a conservative-fallback or abort condition. |
| **Allowed Transitions** | → ASCENT (nominal, recognized); → ABORT (if Mission Readiness = Not Ready and a corresponding Abort intent is accepted by Arbitration). |
| **Trigger Events** | Mission Definition belief entering the Snapshot (WSE §3.5); HMS Mission Readiness classification (HMS §5, §6.6); Aircraft State confirming pre-flight readiness. |
| **Responsible Module** | Mission Executive (phase recognition, reading Mission State + Aircraft State); Health Monitoring System (supplies Mission Readiness input, HMS §5, §6.6). |
| **Safety Constraints** | No phase transition into ASCENT occurs while any domain is marked unknown by the freshness/confidence gate (Mission Executive §2 step 1–2). |
| **Failure Handling** | If Mission Readiness = Not Ready, the aircraft does not transition to ASCENT. The Not Ready classification feeds the standard precedence evaluation (Mission Executive §2) exactly as any other health-domain input would. *Open item:* the source material does not name a specific pre-launch "hold" or "no-go" proposal category distinct from the general fixed set (Continue/Adjust/Hold/Divert/Abort, Mission Executive §4.1); this document does not invent one. |

#### 2.3.2 ASCENT

| Property | Specification |
|---|---|
| **Entry Conditions** | Recognized immediately following PRE-MISSION VALIDATION exit. Aircraft State kinematic/pose belief indicates vertical climb from the ground/launch state (WSE §3.3); Mission Progress belief begins advancing (WSE §3.5). |
| **Exit Conditions** | Aircraft State kinematic/pose belief (specifically nacelle angle, WSE §3.3) indicates the aircraft has begun transitioning from hover toward forward-flight configuration. |
| **Allowed Transitions** | → TRANSITION (OUT) (nominal, recognized); → HOLD / DIVERT / RETURN-TO-BASE / ABORT (off-nominal, only upon Arbitration-accepted intent). |
| **Trigger Events** | Kinematic/Pose Belief Field crossing recognized ascent-to-transition thresholds. |
| **Responsible Module** | Mission Executive (phase recognition); Health Monitoring System (continuous health-domain input — hover places the highest thermal load on this airframe's ducted-fan motors, HMS §6.2). |
| **Safety Constraints** | Product Spec §10 establishes the tilt-rotor transition as "a real flight phase, not an edge case" that AFIP's reasoning must account for; ASCENT is the phase immediately preceding it and is subject to the same heightened HMS motor-thermal weighting (HMS §6.2, §7.2 — Motors/ESCs weighted 25%). A Critical-tier health condition at any point in ASCENT is evaluated ahead of mission status per the fixed precedence order (Mission Executive §2 step 6; §8.2). |
| **Failure Handling** | A Critical health condition (e.g., motor overheating, HMS §8.2) triggers the Mission Executive's critical-condition branch, producing an abort-class proposal (Mission Executive §2 step 6). *Open item:* Mission Executive §6.2 explicitly assigns a Mission Executive-fault minimal-safe-proposal default only for "hover phase" (→ Hold) and "cruise or transition phase" (→ Return-to-Base); ASCENT is not explicitly classified into either category in the source material. This document does not assume a classification and flags it as an item requiring confirmation before further specification depends on it (consistent with Mission Executive Open Items #1). |

#### 2.3.3 TRANSITION (OUT)

| Property | Specification |
|---|---|
| **Entry Conditions** | Recognized following ASCENT; nacelle transition from hover to cruise configuration has begun. |
| **Exit Conditions** | Kinematic/Pose belief indicates nacelle transition is complete and the aircraft is in stable forward-flight configuration. |
| **Allowed Transitions** | → CRUISE (nominal, recognized); → HOLD / DIVERT / RETURN-TO-BASE / ABORT (off-nominal, only upon Arbitration-accepted intent). |
| **Trigger Events** | Kinematic/Pose Belief Field (nacelle angle) reaching cruise-configuration range. |
| **Responsible Module** | Mission Executive (phase recognition); Navigation System (executing the geometric transition via guidance setpoints derived from the current Accepted Intent, NS §4.1); Health Monitoring System (transition load monitoring, HMS §6.2). |
| **Safety Constraints** | Explicitly identified by Product Spec §10 as "a distinct, less-stable transition regime" requiring dedicated reasoning, not treatment as an edge case. HMS §6.2 identifies transition (alongside hover) as placing the highest thermal load on the ducted-fan motors. |
| **Failure Handling** | Mission Executive §6.2 explicitly classifies a fault during the transition phase as defaulting to a **Return-to-Base** minimal safe proposal (grouped with cruise-phase faults), distinct from the hover-phase default of Hold. This substituted proposal is still arbitrated in full (Mission Executive §6.2). |

#### 2.3.4 CRUISE

| Property | Specification |
|---|---|
| **Entry Conditions** | Recognized following TRANSITION (OUT); aircraft in sustained forward-flight configuration. |
| **Exit Conditions** | Mission Progress belief and Aircraft State jointly indicate the aircraft is approaching a point requiring transition back toward hover configuration (destination or intermediate phase boundary). |
| **Allowed Transitions** | → TRANSITION (IN) (nominal, recognized); → HOLD / DIVERT / RETURN-TO-BASE / ABORT (off-nominal, only upon Arbitration-accepted intent). |
| **Trigger Events** | Mission Progress belief crossing the recognized approach threshold; Kinematic/Pose belief (nacelle angle) confirming continued cruise configuration until that point. |
| **Responsible Module** | Mission Executive (phase recognition); Navigation System (route execution, ETA computation using the airframe's known forward-flight performance characteristics, NS §7); Health Monitoring System (Battery/Power sub-domain weighted heaviest — 30% — reflecting this airframe's known higher energy consumption in cruise, HMS §7.2, Product Spec §2.2). |
| **Safety Constraints** | Product Spec §2.2 identifies CRUISE as the phase in which the airframe's known positive pitching moment, negative lift, and high drag are most consequential. Mission Executive §5.2 identifies mission risk (energy trend against remaining distance/time) as mattering most directly in this phase. |
| **Failure Handling** | Mission Executive §6.2 classifies a cruise-phase fault as defaulting to **Return-to-Base**. An eroding energy margin alone — with health and navigation both nominal — is, on its own, sufficient grounds for an Adjust or Divert proposal (Mission Executive §8.3); mission risk does not require health or navigation to also be degraded. |

#### 2.3.5 TRANSITION (IN)

| Property | Specification |
|---|---|
| **Entry Conditions** | Recognized following CRUISE; nacelle transition from cruise back toward hover configuration has begun. |
| **Exit Conditions** | Kinematic/Pose belief indicates nacelle transition to hover configuration is complete. |
| **Allowed Transitions** | → APPROACH/DESCENT (nominal, recognized); → HOLD / DIVERT / RETURN-TO-BASE / ABORT (off-nominal, only upon Arbitration-accepted intent). |
| **Trigger Events** | Kinematic/Pose Belief Field (nacelle angle) reaching hover-configuration range. |
| **Responsible Module** | Mission Executive (phase recognition); Navigation System; Health Monitoring System (transition-phase thermal weighting, HMS §6.2). |
| **Safety Constraints** | Identical to TRANSITION (OUT) — Product Spec §10's "distinct, less-stable transition regime" designation applies equally to both transition phases. |
| **Failure Handling** | Mission Executive §6.2 classifies a fault during this phase identically to TRANSITION (OUT) — defaults to **Return-to-Base**, still arbitrated in full. |

#### 2.3.6 APPROACH/DESCENT

| Property | Specification |
|---|---|
| **Entry Conditions** | Recognized following TRANSITION (IN); aircraft descending toward the destination or an alternate landing point. |
| **Exit Conditions** | Kinematic/Pose belief confirms a landed state, and Mission Progress belief confirms the destination has been reached. |
| **Allowed Transitions** | → LANDED / MISSION COMPLETE (nominal, recognized); → HOLD / DIVERT / RETURN-TO-BASE / ABORT (off-nominal, only upon Arbitration-accepted intent). |
| **Trigger Events** | Kinematic/Pose belief (altitude, vertical speed) approaching ground/landing-zone level at the Mission Progress belief's target coordinates. |
| **Responsible Module** | Mission Executive (phase recognition); Navigation System (final-approach routing; Landing Zone Finder's continuously-refreshed candidate site data is available regardless of whether a contingency landing is anticipated, NS §9). |
| **Safety Constraints** | Same category of hover-adjacent thermal loading as ASCENT may recur during final hover/landing (HMS §6.2); see Failure Handling open item below. |
| **Failure Handling** | *Open item:* as with ASCENT, the source material does not explicitly classify APPROACH/DESCENT as hover-class or cruise/transition-class for Mission Executive §6.2's fault-default purposes. This document flags this as unresolved rather than assuming a default. |

#### 2.3.7 LANDED / MISSION COMPLETE (Terminal — Nominal)

| Property | Specification |
|---|---|
| **Entry Conditions** | Mission Progress belief and Aircraft State jointly indicate the mission phase transition has occurred, with no outstanding degraded or critical domain (XE §7.6, "Mission Completed" template). |
| **Exit Conditions** | None — terminal state on the nominal path. |
| **Allowed Transitions** | None (terminal). |
| **Trigger Events** | Final Mission Progress belief; confirming Kinematic/Pose belief indicating landed state; Health/Navigation/Mission domain classifications all nominal at the moment of confirmation (XE §7.6). |
| **Responsible Module** | Mission Executive (phase recognition); Explainability Engine (renders the Mission Completed explanation, XE §7.6). |
| **Safety Constraints** | Requires all three domain classifications nominal at completion — a degraded or critical classification at the moment of landing does not qualify for this terminal state (it would instead reach LANDED via a contingency branch, Section 2.3.8). |
| **Failure Handling** | Not applicable — this is a nominal terminal state by definition. |

#### 2.3.8 Off-Nominal Branches: HOLD, DIVERT, RETURN-TO-BASE, ABORT, LANDED (Contingency)

These four branches share a common structural rule, stated once here rather than repeated per state: **none is ever entered unilaterally by the Mission Executive.** Each is reachable from any nominal-path state (or from HOLD) only once the corresponding Proposed Intent has been **accepted by Arbitration** (Mission Executive §1.1).

**HOLD**

| Property | Specification |
|---|---|
| **Entry Conditions** | Arbitration accepts a Hold proposal, generated either from the freshness/confidence gate failing for a domain (Mission Executive §2 step 1), a degraded-domain conservative-adjustment branch (step 6), or as the Mission Executive-fault minimal safe substitute during hover-phase (§6.2). |
| **Exit Conditions** | Full reasoning cycle confirms the triggering condition has cleared against a fresh, confident Snapshot (Mission Executive §7.5) → resume prior Mission Phase; or the condition persists/worsens → escalate. |
| **Allowed Transitions** | → resume prior Mission Phase (recovery); → DIVERT; → RETURN-TO-BASE; → ABORT. |
| **Trigger Events** | Arbitration acceptance of a Hold Proposed Intent. |
| **Responsible Module** | Mission Executive (proposes); Arbitration (checks); Navigation System (executes — pauses forward mission progress at the current safe state per the Accepted Intent, NS §2 responsibility, NS §4.1). |
| **Safety Constraints** | Never entered unilaterally (Mission Executive §1.1). |
| **Failure Handling** | If the triggering condition persists or worsens across subsequent cycles, the precedence evaluation (Mission Executive §2 step 6) may escalate to a higher-precedence branch on its own next cycle. |

**DIVERT**

| Property | Specification |
|---|---|
| **Entry Conditions** | Arbitration accepts a Divert proposal — from the degraded/mission-risk branch (Mission Executive §2 step 6), or from the critical-condition branch where Return-to-Base is judged not the safest available resolution (XE §7.2, "Emergency Landing" template). |
| **Exit Conditions** | Aircraft reaches the alternate candidate site → LANDED (contingency). |
| **Allowed Transitions** | → LANDED (contingency). |
| **Trigger Events** | Arbitration acceptance of a Divert Proposed Intent, targeting a candidate site from Navigation System's continuously-maintained ranked list (NS §9). |
| **Responsible Module** | Mission Executive (proposes, informed by NS-reported candidate-site facts); Arbitration (checks); Navigation System (plans and executes route to the candidate site). |
| **Safety Constraints** | The Navigation System's ranked candidate list is material only — the decision to divert remains the Mission Executive's, checked by Arbitration; NS is not authorized to divert unilaterally (NS §9, "Output discipline"). |
| **Failure Handling** | If Navigation System subsequently reports the route to the candidate site as unreachable, this is reported as fact for the Mission Executive's next-cycle judgment (NS §8, resolution step 3), which may then re-propose against a different candidate. |

**RETURN-TO-BASE**

| Property | Specification |
|---|---|
| **Entry Conditions** | Arbitration accepts an Abort/RTB proposal from the critical-condition branch (Mission Executive §2 step 6; XE §7.1, "Return Home" template); or is substituted as the Mission Executive-fault minimal safe proposal during cruise/transition-phase (§6.2). |
| **Exit Conditions** | Aircraft reaches base → LANDED (contingency). |
| **Allowed Transitions** | → LANDED (contingency). |
| **Trigger Events** | Arbitration acceptance of a Return-to-Base Proposed Intent. |
| **Responsible Module** | Mission Executive (proposes); Arbitration (checks); Navigation System (executes route to base). |
| **Safety Constraints** | When triggered by the critical-condition branch, mission status is explicitly **not consulted** at this step (Mission Executive §2 step 6) — a critical safety condition is never weighed against mission progress. |
| **Failure Handling** | If the route to base is reported unreachable by Navigation System, the Mission Executive's achievability judgment re-evaluates and may instead propose Divert to a ranked candidate site (XE §7.2). |

**ABORT**

| Property | Specification |
|---|---|
| **Entry Conditions** | Arbitration accepts an Abort proposal — from either the critical-condition branch (safety-driven) or the mission-risk branch where health and navigation remain nominal (Mission Executive §8.3; XE §7.4, "Mission Abort" template). |
| **Exit Conditions** | Aircraft reaches the safest available resolution point → LANDED (contingency). |
| **Allowed Transitions** | → LANDED (contingency). |
| **Trigger Events** | Arbitration acceptance of an Abort Proposed Intent. |
| **Responsible Module** | Mission Executive (proposes); Arbitration (checks); Navigation System (executes). |
| **Safety Constraints** | Abort is the most conservative proposal category (Mission Executive §4.1). The Mission Executive has no authority to redefine the mission objective, extend a deadline, or invent an alternate mission — Abort is a fixed response category, never a silent substitution of a different goal (Mission Executive §8.5). |
| **Failure Handling** | As with RTB/Divert, Navigation System reports route feasibility as fact each cycle; the Mission Executive re-evaluates on that basis. |

**LANDED (Contingency)**

| Property | Specification |
|---|---|
| **Entry Conditions** | Aircraft reaches a resolution point via DIVERT, RETURN-TO-BASE, or ABORT. |
| **Exit Conditions** | None — terminal state on the off-nominal path. |
| **Allowed Transitions** | None (terminal). |
| **Trigger Events** | Kinematic/Pose belief confirming landed state at the contingency destination. |
| **Responsible Module** | Mission Executive (phase recognition); Explainability Engine (renders the applicable decision template — Return Home, Emergency Landing, or Mission Abort — XE §7.1, §7.2, §7.4). |
| **Safety Constraints** | Distinct from the nominal LANDED / MISSION COMPLETE state — this terminal state does not require all three domain classifications to have been nominal; it is, by definition, reached because at least one was not. |
| **Failure Handling** | Not applicable — terminal state. |

---

## 3. State Machine B — Executive Posture

### 3.1 Overview

Executive Posture reflects how much the Mission Executive currently trusts its own picture of the world and, therefore, how wide a range of proposals it is willing to generate. Posture transitions are **one-way triggers downward** on any qualifying condition, and can only move **upward** after a full reasoning cycle confirms the triggering condition has cleared **and** the supporting Snapshot is itself fresh and confident — recovery is never assumed from the mere absence of a new bad signal (Mission Executive §1.2, §7.5).

### 3.2 State Diagram

```
        ┌───────────┐   downgrade (immediate,   ┌───────────┐
        │  NOMINAL   │──── any qualifying ──────►│ CAUTIOUS   │
        └───────────┘      condition)            └───────────┘
              ▲                                        │
              │  recovery (full cycle,                 │ downgrade
              │  fresh+confident Snapshot,              ▼
              │  condition confirmed cleared)     ┌───────────┐
              └────────────────────────────────────│  MINIMAL   │
                                                    └───────────┘
                                                          │
                                                          │ Mission Executive
                                                          │ proposal function
                                                          │ faults
                                                          ▼
                                                    ┌───────────┐
                                                    │ SUSPENDED  │
                                                    └───────────┘
```

*Note on recovery paths:* Mission Executive §1.2 establishes the general rule that recovery requires a full reasoning cycle confirming the triggering condition has cleared against a fresh, confident Snapshot. The source material does not explicitly state whether recovery must pass through each intermediate posture in sequence (e.g., MINIMAL → CAUTIOUS → NOMINAL) or may move directly to the posture the current evidence supports (e.g., MINIMAL → NOMINAL in one step, if all conditions are simultaneously confirmed cleared). This document flags this as an **open item** rather than assuming a stepwise-only recovery rule not stated in the source.

### 3.3 Per-State Specification

#### 3.3.1 NOMINAL

| Property | Specification |
|---|---|
| **Entry Conditions** | Snapshot is fresh, confident, and internally consistent across all three domains (health, navigation, mission) (Mission Executive §1.2). |
| **Exit Conditions** | Any domain crossing a threshold, confidence falling below the fully-trusted level, or any internal fault occurring — downgrade is immediate and one-way on detection (Mission Executive §1.2). |
| **Allowed Transitions** | → CAUTIOUS; → MINIMAL; → SUSPENDED (downgrade, direct to whichever posture the triggering condition warrants). |
| **Trigger Events** | Domain Classification Change event (AFIP-SE-002 §3.3); Confidence Degradation event (AFIP-SE-002 §3.2); Mission Executive Fault event (AFIP-SE-002 §3.6). |
| **Responsible Module** | Mission Executive — Executive Posture is a property of the Mission Executive's own reasoning, not a Belief Field (Mission Executive §1.2). |
| **Safety Constraints** | Full proposal range permitted: Continue, Adjust, Hold, Divert, Abort (Mission Executive §1.2, table). |
| **Failure Handling** | Not applicable — this is the fully-trusted state; any qualifying condition transitions out of it immediately. |

#### 3.3.2 CAUTIOUS

| Property | Specification |
|---|---|
| **Entry Conditions** | One or more domains degraded, or confidence below the "fully trusted" threshold but above the "unusable" floor (Mission Executive §1.2). |
| **Exit Conditions** | Downgrade to MINIMAL/SUSPENDED on a further qualifying condition; upgrade to NOMINAL only after a full reasoning cycle confirms the degrading condition has cleared against a fresh, confident Snapshot. |
| **Allowed Transitions** | → NOMINAL (recovery); → MINIMAL; → SUSPENDED. |
| **Trigger Events** | Domain Classification Change (degraded); HMS Warning-tier alert event (AFIP-SE-002 §3.4, per HMS §10.3 mapping: "Degraded/Warning → posture moves toward CAUTIOUS"). |
| **Responsible Module** | Mission Executive. |
| **Safety Constraints** | Continuation only with reduced envelope; Adjust, Hold, Divert, Abort remain available. New "continue as originally planned" proposals are **structurally not available** in this posture (Mission Executive §1.2, table). |
| **Failure Handling** | If the degrading condition worsens rather than clears, precedence evaluation on a subsequent cycle transitions posture to MINIMAL. |

#### 3.3.3 MINIMAL

| Property | Specification |
|---|---|
| **Entry Conditions** | A domain has crossed a critical threshold, or confidence has fallen below the usable floor (Mission Executive §1.2). |
| **Exit Conditions** | Downgrade to SUSPENDED if the Mission Executive's proposal function itself faults; upgrade to CAUTIOUS/NOMINAL only after a full reasoning cycle confirms the critical condition has genuinely cleared against fresh, confident belief. |
| **Allowed Transitions** | → CAUTIOUS or → NOMINAL (recovery, per the open item in §3.2); → SUSPENDED. |
| **Trigger Events** | HMS Critical-tier alert event (AFIP-SE-002 §3.4, per HMS §10.3 mapping: "Critical (single condition) → posture moves to MINIMAL"); Domain Classification Change (critical). |
| **Responsible Module** | Mission Executive. |
| **Safety Constraints** | Only conservative-class proposals are permitted: Hold, Divert, Abort/RTB. "Continue" and "adjust-to-proceed" are **structurally unavailable**, not merely discouraged (Mission Executive §1.2, table). |
| **Failure Handling** | If the Mission Executive's own proposal function faults while in this posture, it transitions to SUSPENDED (Section 3.3.4). If the HMS itself cannot complete its own aggregation cycle while a Critical/Emergency condition is present, this instead routes directly to the Mission Executive's SUSPENDED fault-handling path (HMS §10.3, table note). |

#### 3.3.4 SUSPENDED

| Property | Specification |
|---|---|
| **Entry Conditions** | The Mission Executive's own proposal function has faulted and cannot complete a reasoning cycle — a domain evaluation faults, reconciliation cannot resolve, or any internal fault prevents the decision flow (Mission Executive §2) from finishing (Mission Executive §1.2, §6.2). |
| **Exit Conditions** | *Open item:* the source material specifies the general recovery rule (full cycle, fresh and confident Snapshot, condition confirmed cleared) but does not explicitly state which specific posture a recovery from SUSPENDED resumes to, or whether the underlying fault-clearance criteria differ from the criteria governing MINIMAL/CAUTIOUS recovery. This document does not assume a resolution. |
| **Allowed Transitions** | → NOMINAL / CAUTIOUS / MINIMAL (recovery, exact target posture unresolved per the open item above). |
| **Trigger Events** | Mission Executive Fault event (AFIP-SE-002 §3.6) — proposal function cannot complete a cycle. |
| **Responsible Module** | Mission Executive. |
| **Safety Constraints** | No proposal is generated by normal reasoning. A single, pre-defined minimal safe proposal is substituted, varying by Mission Phase State: hover-phase fault defaults to **Hold**; cruise or transition-phase fault defaults to **Return-to-Base** (Mission Executive §6.2). This substituted proposal still passes through Arbitration in full — a fault inside the Mission Executive is never treated as license to skip the check (Mission Executive §6.2). |
| **Failure Handling** | If the Mission Executive cannot produce a justification for the substituted proposal, that gap is explicitly recorded by the Explainability Engine as a gap, never presented as if a normal, fully-reasoned decision occurred (Mission Executive §6.5; XE §5 Stage 9). |

---

## 4. Interaction Between the Two State Machines

Mission Phase State and Executive Posture are read together by the Mission Executive's precedence evaluation (Mission Executive §2 step 7) but are never merged into a single value. A given moment in the mission is always described by **both** coordinates simultaneously — for example, "CRUISE / CAUTIOUS" is a materially different situation from "CRUISE / NOMINAL," even though the Mission Phase State is identical in both.

Two governing rules apply:

1. **Posture governs which proposals are structurally reachable; Mission Phase governs which minimal-safe-proposal default applies under a Mission Executive fault.** These are genuinely separate functions of the two state machines — Posture answers "how much do I trust myself right now," while Phase answers "what would 'safe' concretely mean for the aircraft right now" (Mission Executive §1, §6.2).
2. **Neither state machine infers a value for the other.** A CRUISE Mission Phase does not imply NOMINAL posture, and a NOMINAL posture does not imply any particular Mission Phase — each is derived independently each cycle from its own governing inputs (Mission Executive §1).

The Explainability Engine anchors every rendered explanation to both coordinates together — the Snapshot version and the Mission Phase State in effect at the time of the decision (XE §9) — and separately carries Executive Posture alongside each timeline entry, so an operator can see a posture's downward transition and later recovery as a visible arc, distinct from the mission's phase-driven progress (XE §9).

---

## 5. Supporting State-Like Constructs (Out of Scope for This Document)

The source specifications define additional state-like structures that are not part of either state machine specified above and are not expanded here, to avoid introducing states beyond what this document's scope requires. Each is fully specified in its own document and is cross-referenced, not restated:

- **HMS Alert Tier** (Information / Warning / Critical / Emergency) — HMS §9; catalogued as events in AFIP-SE-002 §3.4.
- **Navigation System Route Status** (nominal / deviating / locally-replanning / blocked-rerouting / unreachable) — NS §4.2, §8; catalogued as events in AFIP-SE-002 §3.7.
- **Arbitration Outcome** (Accept / Modify / Reject) — Architecture §3.4; catalogued as events in AFIP-SE-002 §3.6.

These constructs feed the two state machines above as trigger events (Section 2 and 3, "Trigger Events" rows) but are not themselves independent phase/posture state machines within AFIP's architecture as specified.

---

## 6. Traceability and Open Items

Every state, transition, and safety constraint in this document is sourced directly from Mission Executive §1.1 and §1.2, cross-referenced against HMS §6.2, §9, §10.3; Navigation System §7, §9; and Explainability Engine §7, §9 where a state's behavior depends on their output. No state has been introduced beyond the fixed set already defined in the Mission Executive document.

**Open items requiring confirmation before further specification depends on them:**

1. Whether ASCENT and APPROACH/DESCENT are hover-class or cruise/transition-class for the purposes of Mission Executive §6.2's fault-handling default (Sections 2.3.2, 2.3.6).
2. Whether recovery from SUSPENDED resumes directly to a specific posture (NOMINAL/CAUTIOUS/MINIMAL) or is determined by the same general recovery rule governing CAUTIOUS/MINIMAL recovery (Section 3.3.4), and whether posture recovery generally must pass through each intermediate posture in sequence or may transition directly to the posture current evidence supports (Section 3.2).

These are carried forward, not resolved, consistent with the practice already established in the source documents' own "Open Items" sections.

---

**End of Document 4 — State Machine Specification**
