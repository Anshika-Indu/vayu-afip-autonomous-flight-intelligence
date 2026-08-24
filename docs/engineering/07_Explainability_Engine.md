# Autonomous Flight Intelligence Platform (AFIP)
## Explainability Engine — Engineering Design Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, AFIP World State Engine v0.1, AFIP Mission Executive v0.1, AFIP Navigation System v0.1
**Scope of this document:** The Explainability Engine only — the concrete realization of the *Explanation* half of **Layer E — Explainability & Record** (the Record/audit half is out of scope here and is assumed to already exist alongside it, sharing the same input boundary). No code, no algorithms, no data schemas, no UI. The flight simulator is not touched or redesigned; nothing here changes what the Mission Executive, Arbitration, the WSE, or the Navigation System (NS) do — this document only defines how what they already produce becomes something a human can understand.

---

## 0. What the Explainability Engine Is — and Is Not

The Explainability Engine (XE) is the concrete architectural realization of the **Explanation** responsibility assigned to Layer E in the Software Architecture document (§3.5): *"render every decision (accepted, modified, or rejected) into a human-understandable account of the specific facts and alternatives that produced it, generated at the moment the decision is made."*

Its charter, in one line: **the XE turns material that already exists — Belief Fields, classifications, justification reference sets, and Arbitration outcomes — into language and structure a human operator can read, at the moment a decision is made, without ever adding a new fact, a new judgment, or a new decision of its own.**

Three boundary properties are carried forward unchanged from the Architecture and Mission Executive documents, and nothing in this design may violate them:

- **Read-only, one-way.** The XE reads from Layer C/D outputs, the WSE Snapshot, and NS-reported facts. It writes nothing back into any of them. Its output is never permitted to influence a future decision (Architecture §3.5) — an explanation that could shape belief would let AFIP's self-narrative bias its own future reasoning, which is precisely what the one-way boundary exists to prevent.
- **Rendering, not reasoning.** The Mission Executive already produces the proposal *and* its justification reference set together, as one unit, per Architecture P6 and Mission Executive §2 step 8. The XE does not decide *why* something happened — that has already been decided and recorded. The XE's only job is to render the *already-produced* justification faithfully and legibly.
- **No LLMs, no generative reasoning.** Consistent with the deterministic/advisory boundary that governs the rest of AFIP (Architecture P5, §6), the XE is a deterministic rendering system: fixed templates, fixed vocabulary, fixed structural rules mapped onto structured input. It is exactly as explainable and testable as the Mission Executive's own classification logic, for the same reason — a black-box language model standing between a safety decision and the human who must trust it would reintroduce the exact "presented judgment as if it were certainty" problem Product Spec §5 and §9.11 already forbid for advisory flags. See Section 5 for how this is achieved without one.

**What the XE is not responsible for:** classifying health/navigation/mission conditions (Mission Executive), deciding what should happen next (Mission Executive + Arbitration), checking a proposal against constraints (Arbitration), planning a route (NS), or storing the permanent audit trail (the Record half of Layer E, addressed only at its input boundary here). The XE's entire authority begins and ends at "take what was already decided and say it clearly."

---

## 1. Purpose

The Explainability Engine exists to ensure that, for every autonomous decision AFIP proposes and every outcome Arbitration produces, the operator can always answer four questions without needing to inspect raw telemetry, without needing engineering support, and without delay:

1. **What happened** — which proposal was generated, and what became of it (accepted / modified / rejected).
2. **Why it happened** — the specific Belief Fields, classifications, and precedence branch that produced it.
3. **How confident AFIP is** — separately, in the underlying domain classifications and in the proposal chosen as the right response to them.
4. **What alternatives were considered** — which other proposal categories existed at that point in the precedence order, and why they were not the one selected.

This is a direct implementation of Product Spec §6.3 ("explainability is a product feature, not a debugging tool") and §9.10/§9.13/§9.14, translated into an engine rather than a promise: if AFIP cannot answer all four questions for a given decision, by design it has not actually finished making that decision (Product Spec §6.3).

---

## 2. Responsibilities

The XE is responsible for:

1. **Ingesting** the Justification Reference Set produced by the Mission Executive (Mission Executive §4.2, §2 step 8) and the Arbitration outcome that follows it (accepted / modified / rejected), for every reasoning cycle in which a proposal is generated — not only the cycles that produce a change.
2. **Rendering** that material into the four output categories defined in Section 4, generated at the moment the decision is made (Architecture P6), never reconstructed afterward from a log.
3. **Preserving the deterministic/advisory distinction** in every rendered explanation — never presenting a confidence-scored advisory flag's contribution as if it were a deterministic threshold crossing, and vice versa (Product Spec §5, §9.11; Architecture §6).
4. **Computing and surfacing confidence** at each of the levels defined in Section 6, using only the confidence and freshness values already carried by the Belief Fields in the Snapshot and by the Mission Executive's own classifications — never inventing a new confidence value from nothing.
5. **Enumerating alternatives** that were structurally available at the point of decision (per the current Executive Posture and precedence order) and stating why each was not selected, without ever presenting an alternative that was not actually reachable given the posture at that time.
6. **Surfacing a gap honestly** whenever the material it receives is itself incomplete — e.g., a SUSPENDED-posture minimal safe proposal with no normal justification behind it (Mission Executive §6.2, §6.5) — rather than filling the gap with invented reasoning or presenting it as a normal, fully-reasoned decision.
7. **Prioritizing and routing** each rendered explanation to the operator through the Alert System (Section 8), so the manner of presentation matches the severity of what is being explained.
8. **Maintaining continuity** with the mission timeline (Section 9), so every explanation is anchored to a specific point in the mission and a specific Snapshot version, never presented as a free-floating statement.
9. **Never blocking a decision.** Exactly as specified in Architecture §7 (row E): if the XE cannot render an explanation in real time, the decision itself proceeds unaffected, and the rendering gap is recorded explicitly as a gap, not hidden.

---

## 3. Inputs

The XE has no independent channel into the aircraft, the WSE, or Arbitration's internal logic. Everything it reads is material that Layer C/D and the WSE have already produced for their own purposes; the XE strictly consumes, never queries or triggers new computation.

| Input | Source | What it provides |
|---|---|---|
| **Mission Executive Decisions** | Mission Executive §4 (Proposed Intent + Justification Reference Set) | The proposal category selected (continue/adjust/hold/divert/abort-RTB), the precedence branch it landed on, and the specific Belief Fields, classifications, and advisory flags that produced it |
| **Arbitration Outcome** | Decision & Arbitration (Layer D) | Accepted / modified / rejected, and — for modified — what was changed (e.g., an envelope constraint attached); the XE never sees Arbitration's internal constraint-check logic, only its outcome, consistent with Arbitration remaining the narrow, independently verifiable function it is designed to be (Architecture §3.4) |
| **Navigation Events** | Navigation System (Section 8, 9, 10, 11 of the NS document) reported as ordinary evidence through Layer A → WSE | Route status (nominal/rerouted/unreachable), obstacle resolution taken, candidate landing site rankings, position-confidence degradation — all as reconciled Belief Fields by the time the XE sees them, never read directly from NS |
| **Health Events** | WSE Aircraft State (Propulsion/Actuation, Power/Energy, Subsystem/Telemetry Health belief fields) as classified by the Mission Executive's health domain | The specific field(s) and classification that triggered or contributed to a decision |
| **Risk Assessments** | Mission Executive §5 (Safety risk, Mission risk, Compounded risk) | Which of the three risk dimensions was active, and whether the trigger was a single-domain threshold crossing or a cross-domain compounded condition |
| **World State** | The current World State Snapshot (WSE §3.6), read exactly as published — Aircraft State, Environment State, Mission State, each Belief Field's value/confidence/freshness/provenance | The raw material for "supporting evidence" — the XE reads the whole Snapshot referenced by the justification set, never a field in isolation, preserving the no-skip rule (WSE §2, §8) |
| **Mission State** | Mission Definition and Mission Progress belief, plus Mission Phase State and Executive Posture (Mission Executive §1) | The mission context an explanation must be anchored to — what phase the mission is in, and how much latitude the Mission Executive currently claims for itself |

**What is explicitly not an input.** The XE has no visibility into raw Evidence Records or the Reconciliation Record (that record feeds the audit/Record half of Layer E, not the Explanation half addressed here), and no path back into the Mission Executive, WSE, or Arbitration. It also never receives an operator command as an input to *what* it explains — operator commands are explained the same way any other proposed intent is (they enter Arbitration through the same checked path, Architecture P10), but the XE does not treat "operator asked for X" as a reason to explain differently or more leniently than an AFIP-originated proposal.

---

## 4. Outputs

Every rendered explanation is composed of the same six parts, generated together as a single unit for a given decision — never staggered, never partially available while the rest is "still coming":

**4.1 Decision Summary** — a one-line, plain-language statement of what was decided and what happened to it: the proposal category, and the Arbitration outcome. E.g., *"Proposed: Divert to Candidate Site B. Outcome: Accepted."*

**4.2 Reasoning** — the specific chain from Snapshot facts to classification to precedence branch to proposal, stated in the order the Mission Executive actually evaluated it (Section 5). This is a rendering of the Justification Reference Set, not a new narrative — every sentence in the Reasoning output must be traceable to a specific Belief Field, classification, or precedence branch that was actually part of the justification set.

**4.3 Confidence** — reported at multiple levels, never collapsed into one number (Section 6): domain-level confidence (health/navigation/mission), and decision-level confidence (how confident AFIP is that the *proposal chosen* is the correct response, distinguishing deterministic from advisory-influenced conclusions per Mission Executive §7.3).

**4.4 Supporting Evidence** — the specific Belief Fields cited in the Reasoning, each shown with its value, confidence, and freshness together (never a bare value, mirroring the WSE's own rule that a Belief Field is never read without its confidence and freshness, WSE §3.2) — plus provenance, so an operator can see which source the fact traces back to.

**4.5 Alternative Actions** — every proposal category that was structurally reachable under the current Executive Posture at the time of decision (Mission Executive §1.2), each labeled with why it was not the one selected — either "ruled out by precedence" (a higher-precedence condition preempted it) or "not structurally available" (the current posture excludes it, e.g., "Continue" is unavailable under MINIMAL posture). The XE never lists an alternative that posture made structurally unreachable as if it had been a live option that lost on the merits — that would misrepresent the posture system itself.

**4.6 Operator Messages** — the alert-routed, severity-tagged natural-language message actually surfaced to the operator (Section 8), derived from 4.1–4.5 but trimmed to what the operator needs at a glance, with the full explanation available on demand (Section 10).

---

## 5. The Explainability Pipeline

The pipeline is a fixed rendering sequence, not a reasoning process. Each stage consumes structured material that already exists and produces structured or textual output; no stage introduces a judgment that was not already made upstream.

**Stage 1 — Capture.** At the moment the Mission Executive completes step 8 of its decision flow (proposal + justification reference set generated together, Mission Executive §2) and Arbitration returns its outcome, the XE captures both as a single, immutable pair, tagged with the Snapshot version and timestamp they belong to. This is the same discipline the WSE applies to its own Snapshot (WSE §2) — the XE never operates on a partial or evolving picture of a decision.

**Stage 2 — Classification tagging.** Every element of the justification reference set is tagged, using the tag it already carries from Layer C (Architecture §6): **deterministic fact** (a threshold crossing, a hard rule) or **advisory-derived** (a confidence-scored flag that informed but did not by itself decide). This tag is carried through to every later stage and must appear in the final Reasoning output — it is never dropped or merged away.

**Stage 3 — Template selection.** Based on the proposal category and the precedence branch that produced it, the XE selects one of a fixed set of Decision Templates (Section 7). Template selection is a lookup, not a generative choice — the same (proposal category, triggering branch) pair always selects the same template structure.

**Stage 4 — Slot-filling.** The selected template's fixed slots (Reason, Evidence, Confidence, Recommended Operator Action) are filled directly from the captured justification reference set and Snapshot data. Slot-filling uses fixed sentence frames with variable substitution (field name, value, confidence, threshold) — e.g., *"Power/Energy belief has fallen to {value} against a mission-risk threshold of {threshold}, with {confidence} confidence, last refreshed {freshness} ago."* No slot is ever filled from a value the XE computed itself; every substituted value is copied from the Snapshot or the justification set as-is.

**Stage 5 — Alternative enumeration.** The XE reads the current Executive Posture and the precedence-evaluation branch actually taken, and derives the full set of proposal categories that were structurally reachable at that posture (a fixed lookup table, Mission Executive §1.2), then labels each non-selected one per Section 4.5's rule.

**Stage 6 — Confidence aggregation.** Domain and decision-level confidence values are computed per the rules in Section 6, using only the confidence/freshness values already present in the Snapshot and the classification step. No confidence value is invented; every one is either copied or aggregated by a fixed, documented rule.

**Stage 7 — Alert assignment.** The rendered explanation is assigned a priority level (Section 8) based on the proposal category and Arbitration outcome, then routed to the operator interface.

**Stage 8 — Timeline anchoring and handoff.** The completed explanation, with its Snapshot version and timestamp, is attached to the Mission Timeline (Section 9) and made available to the operator (Section 10) and to the Record function for permanent audit. This handoff is one-way; nothing about how the explanation was received or acted on flows back into Stages 1–7 for this decision.

**Stage 9 — Gap handling.** If any stage cannot complete (e.g., a justification reference set is incomplete because the proposal was the SUSPENDED-posture minimal safe substitute, Mission Executive §6.2/§6.5), the XE does not fabricate a plausible-sounding Reasoning to fill the gap. It renders the gap itself as the explanation — e.g., *"No standard justification available: Mission Executive posture is SUSPENDED; minimal safe proposal substituted per phase-based fallback rule"* — and this gap is what gets recorded, per Architecture §7 row E.

---

## 6. Confidence System

Confidence in the XE is never invented — every value it reports is either read directly from the WSE/Mission Executive or aggregated from those values by one of the fixed rules below. This mirrors, and never contradicts, Mission Executive §7.

**6.1 Navigation Confidence.** The weakest-link confidence among the Belief Fields the navigation domain classification actually drew on for the current cycle (principally Kinematic/Pose belief, and — where a route or obstacle event is involved — the relevant NS-reported fact once reconciled into a Belief Field). If Kinematic/Pose confidence has degraded (e.g., GPS loss handled per NS §10) below the domain's own usable floor, Navigation Confidence is reported as **unknown**, not as a low number — consistent with Mission Executive §7.4's floor rule.

**6.2 Health Confidence.** The weakest-link confidence among the Belief Fields the health domain classification drew on (Propulsion/Actuation, Power/Energy, Subsystem/Telemetry Health). A single degraded-confidence field pulls the whole domain's reported confidence down to its level; other, more-confident fields in the same domain never dilute it (Mission Executive §7.2).

**6.3 Mission Confidence.** The weakest-link confidence among Mission Definition and Mission Progress belief, combined with whether the achievability judgment (Mission Executive §8.1) itself relied on any advisory-derived input. If it did, Mission Confidence is reported alongside an explicit note distinguishing the deterministic portion (e.g., a hard energy-margin threshold) from the advisory portion (e.g., a pattern-based anomaly flag on energy trend).

**6.4 Overall Decision Confidence.** Reported as two separate values, never merged into one, per Mission Executive §7.3:

- **Domain confidence floor** — the lowest of Navigation, Health, and Mission Confidence for the cycle that produced the decision (weakest-link across domains, same principle as within a domain).
- **Proposal-fit confidence** — how much of the reasoning that selected *this specific proposal* (as opposed to a different one at the same precedence branch) rested on deterministic fact versus advisory-derived flag. A proposal produced entirely from a hard threshold crossing is reported as deterministic; a proposal where an advisory flag contributed to which specific adjustment was chosen is reported as advisory-influenced, with the advisory flag's own stated confidence shown alongside it — never presented with the same certainty language as a deterministic conclusion (Product Spec §5, §9.11).

**6.5 Confidence floor and "unknown."** Each domain's own minimum usable confidence (Mission Executive §7.4) is respected exactly as computed upstream — the XE does not soften an "unknown" domain into a numeric low-confidence value for display purposes, because doing so would misrepresent a structurally different condition (insufficient basis to judge at all) as if it were merely "somewhat uncertain."

**6.6 No confidence recovery from silence.** If a domain's confidence has not been actively re-confirmed by a fresh Snapshot, the XE never reports it as recovering — it continues to reflect whatever the Mission Executive's own posture-recovery rule (Mission Executive §1.2, §7.5) has actually determined, never an independent XE inference that "nothing new happened, so it's probably fine now."

---

## 7. Decision Templates

Each template below is a fixed structure with five slots. The XE selects among these by (proposal category, triggering precedence branch) — it does not compose novel templates.

**7.1 Return Home (Abort/RTB — critical-condition branch)**
- **Decision:** Abort current mission activity; return to base.
- **Reason:** [Deterministic] A health or navigation domain has crossed a critical threshold ({specific field}, value {value} vs. threshold {threshold}); per fixed precedence, mission status was not consulted at this step.
- **Evidence:** The triggering Belief Field(s) with value/confidence/freshness/provenance; the domain classification that resulted; Mission Phase State at time of trigger (governs which minimal-safe fallback would apply if this were instead a fault case, Mission Executive §6.2).
- **Confidence:** Domain confidence floor for the triggering domain; proposal-fit confidence (typically deterministic — critical-threshold branches are rule-based by design).
- **Recommended Operator Action:** Monitor RTB progress; no operator action required unless Arbitration modifies or rejects the proposal, in which case escalate per Section 8.

**7.2 Emergency Landing (Abort-class — critical condition, RTB not viable)**
- **Decision:** Divert to nearest ranked candidate landing site rather than return to base.
- **Reason:** [Deterministic] Critical condition present, and Mission Executive's achievability judgment (informed by NS-reported reachability facts) indicates RTB does not represent the safest available resolution given current position/energy.
- **Evidence:** Triggering health/navigation field(s); Landing Zone Finder's current top-ranked candidate site and the specific criteria (clear-area sufficiency, obstruction/slope, reachability cost, wind alignment, data currency) that produced its ranking (NS §9).
- **Confidence:** Domain confidence floor; site-ranking confidence shown separately since site suitability itself carries its own data-currency confidence (NS §9), never blended into the health/navigation confidence figure.
- **Recommended Operator Action:** Acknowledge; confirm no conflicting operator command is pending, since an operator command would be arbitrated on equal footing (Mission Executive §6.4).

**7.3 Obstacle Avoidance (Adjust-class — navigation degraded branch, tactical)**
- **Decision:** Continue toward the same target via a modified route (local avoidance or reroute).
- **Reason:** [Deterministic] NS detected an obstacle/geofence intrusion within the look-ahead horizon (NS §8) and resolved it via {local avoidance / dynamic reroute} while remaining within the current Accepted Intent's target — this is a tactical NS resolution reported as evidence, not a new Mission Executive decision, unless it triggered a mission-domain classification change.
- **Evidence:** Route Status field, the specific obstacle/geofence fact and its confidence/freshness, resolution type taken.
- **Confidence:** Navigation Confidence for the cycle; proposal-fit confidence is deterministic (fixed resolution-order rule, NS §8).
- **Recommended Operator Action:** Informational only — no action expected unless Route Status escalates to "unreachable."

**7.4 Mission Abort (Abort-class — mission-risk branch, health/navigation nominal)**
- **Decision:** Terminate current mission activity in favor of the safest available resolution, though health and navigation are nominal.
- **Reason:** [Deterministic + possibly advisory-influenced] Mission risk assessment (Mission Executive §5.2, §8.1) determined the mission is no longer achievable as planned — e.g., energy margin eroding faster than schedule allows — independent of any safety-domain trigger (Mission Executive §8.3).
- **Evidence:** Power/Energy belief trend, Mission Progress belief, relevant Environment State fields (e.g., headwind) if compounded risk (Mission Executive §5.3) contributed; any advisory flag that contributed to the risk judgment, tagged explicitly as advisory.
- **Confidence:** Mission Confidence; proposal-fit confidence explicitly flagged as advisory-influenced if a pattern-based flag contributed to the trend judgment.
- **Recommended Operator Action:** Review mission-risk trend before acknowledging; this is the one template class where operator judgment on trend severity is most likely to differ from AFIP's.

**7.5 Hold Position (Conservative fallback — unknown-domain or fault branch)**
- **Decision:** Pause forward mission progress at current safe state.
- **Reason:** [Structural, not deterministic-classification] Either a domain failed the freshness/confidence gate and is marked unknown (Mission Executive §2 step 2), or the Mission Executive's own proposal function faulted (SUSPENDED posture, Mission Executive §6.2) and Mission Phase State indicated hold as the phase-appropriate minimal safe default.
- **Evidence:** The specific insufficiency (which field failed the gate, or the fault condition itself) — never a generic "fault occurred" statement (Mission Executive §2 step 2, §6.5).
- **Confidence:** Reported as **unknown**, not as a low number, for the domain(s) that failed the gate; if this is a SUSPENDED-posture substitution, the XE explicitly states that no standard justification exists (Section 5, Stage 9).
- **Recommended Operator Action:** Investigate the specific insufficiency named in Evidence; this template carries the highest operator-attention weight among non-critical templates because it represents AFIP explicitly not knowing, rather than AFIP knowing something concerning.

**7.6 Mission Completed (Continue branch — terminal)**
- **Decision:** Mission activity concluded; Mission Phase State has reached LANDED / MISSION COMPLETE.
- **Reason:** [Deterministic] Mission Progress belief and Aircraft State jointly indicate the mission phase transition has occurred (Mission Executive §1.1) with no outstanding degraded or critical domain.
- **Evidence:** Final Mission Progress belief; confirming Kinematic/Pose belief indicating landed state; final Health/Navigation/Mission domain classifications, all nominal.
- **Confidence:** Domain confidence floor across all three domains at completion; typically high given phase-transition Belief Fields are recomputed on every cycle (WSE §5.2).
- **Recommended Operator Action:** None required; available for post-flight review (Section 11).

---

## 8. Alert System

Alert priority is derived deterministically from the proposal category and the Arbitration outcome — never from the XE's own assessment of how the operator might feel about it.

| Priority | Triggering condition | Behavior |
|---|---|---|
| **Information** | Continue proposals; Obstacle Avoidance resolved by local avoidance with no domain classification change; Mission Completed | Logged and available on the timeline; no interruption of operator attention |
| **Warning** | Adjust-class proposals (Mission Executive §4.1); Hold triggered by a single domain failing the freshness/confidence gate; dynamic reroute (NS §8 resolution step 2) | Surfaced to the operator display as a visible, non-blocking notification; Decision Summary + Reason shown by default, full detail on demand |
| **Critical** | Divert proposals; Abort/RTB proposals from the critical-condition branch (Mission Executive §6.1); Route Status = unreachable (NS §8 escalation) | Surfaced prominently, requires acknowledgment; full Reasoning and Evidence shown by default, not just the summary |
| **Emergency** | Any proposal generated under SUSPENDED Executive Posture (Mission Executive §6.2); Arbitration outcome = rejected on a proposal from the critical-condition branch; Arbitration itself unavailable/inconclusive (fail-closed, Mission Executive §6.3) | Highest-priority interrupt; explicitly states the gap if standard justification is unavailable (Section 5, Stage 9); never allowed to be missed or auto-dismissed |

Two structural rules govern this table regardless of priority level:

- **No silent downgrade.** A condition that qualifies for Critical or Emergency is never displayed at a lower priority to reduce operator interruption. Alert priority reflects the actual severity already determined by the Mission Executive's precedence order and Arbitration's outcome, not a separate XE judgment about operator workload.
- **Rejected and modified outcomes are never quiet.** Per Architecture §4 flow rule 3, a rejected proposal is exactly as important to the record — and to the operator — as an accepted one. A rejection is never demoted to Information priority merely because "nothing changed as a result"; the fact that AFIP proposed something and was told no is itself operator-relevant information.

---

## 9. Mission Timeline Integration

Every rendered explanation is anchored to the Mission Timeline by exactly two coordinates: the **Snapshot version** it was reasoned from (WSE §3.6) and the **Mission Phase State** in effect at that moment (Mission Executive §1.1). This gives the timeline three properties:

- **Chronological fidelity without reconstruction.** Because each explanation is generated at the moment of decision (Architecture P6) and immediately anchored, the timeline is a direct sequence of already-produced explanations, not a summary assembled later from logs.
- **Phase-relative context for every entry.** An operator reviewing the timeline sees not just "what was decided" but "what stage of the mission it was decided in" — so an Adjust proposal during CRUISE reads differently from the same category of proposal during APPROACH/DESCENT, without the XE needing to restate the mission phase in every Reason slot.
- **Continuity across postures.** Because Executive Posture (Mission Executive §1.2) is carried alongside each timeline entry, an operator can see a posture's downward transition and its later, evidence-confirmed recovery (Mission Executive §1.2, §7.5) as a visible arc on the timeline, rather than as two disconnected events.

The timeline itself is populated by the same handoff (Stage 8, Section 5) that feeds the Record function — the XE does not maintain a second, independent history. This avoids the two ever drifting apart, which would otherwise create exactly the kind of "explained one way, recorded another" inconsistency the Product Specification's auditability commitment (§9.13) is meant to rule out.

---

## 10. Operator Experience

The XE is designed around a single governing rule: **an operator should never have to search for an explanation, and should never be shown more of one than the moment calls for.**

- **Progressive disclosure, not a wall of text.** Every explanation is available at three depths, all drawn from the same rendered material (never separately generated): the Decision Summary alone (always visible), Reason + Confidence + top Evidence item (the default expanded view for Warning and above), and the full Reasoning + complete Evidence + Alternative Actions (available on demand, one interaction away).
- **Priority governs intrusiveness, not content richness.** An Information-priority entry is quiet, not incomplete — the full explanation exists and is one click away even for a Continue proposal. What changes with priority is how insistently the XE asks for operator attention, never how much of the truth it is willing to show.
- **Consistent vocabulary.** The same fixed set of proposal-category names, domain names, and confidence terms (nominal/degraded/critical/unknown; deterministic/advisory-influenced) is used everywhere — timeline, alert, and on-demand detail — so an operator never has to re-learn terminology between views.
- **The gap is shown, not hidden, and shown plainly.** When Section 5 Stage 9 applies, the operator sees a clearly labeled "no standard justification available" state rather than a normal-looking explanation with thin content — silence about a gap is exactly what Architecture §7 row E forbids.
- **Alternatives are shown as a structural fact, not a debate.** The Alternative Actions view is framed as "these were the other proposal categories reachable at this posture, and here is why each was not chosen" — never as "AFIP considered but rejected these," which would misattribute the Mission Executive's precedence logic to something resembling deliberation it did not actually perform.

---

## 11. Future Extensions

None of the following change the XE's core contract (deterministic rendering of already-produced material, one-way, non-influencing) — each is an additional presentation surface over the same underlying pipeline.

- **Voice explanations.** A text-to-speech rendering of the Decision Summary and Reason slots for Critical/Emergency alerts, read from the same fixed sentence frames already used in Stage 4 (Section 5) — not a separate generative process, so the same "no invented content" guarantee holds for spoken output as for displayed output.
- **Natural language summaries.** A rolling, human-readable digest across multiple timeline entries (e.g., "over the last 10 minutes, mission risk rose from nominal to degraded due to eroding energy margin, and one Adjust proposal was accepted") — composed by concatenating and lightly connecting already-rendered per-decision summaries, not by re-reasoning over the underlying Snapshots.
- **Mission replay.** A step-through of the Mission Timeline (Section 9) that replays each Snapshot-anchored explanation in sequence, letting an operator or reviewer move forward/backward through exactly what AFIP believed, proposed, and was told at each point — sourced entirely from the same timeline-anchored explanations already produced, never recomputed differently for replay.
- **Post-flight reports.** A structured export compiling every Decision Summary, Reasoning, Confidence, Evidence, Alternative Actions, and Arbitration outcome for a completed mission, organized by Mission Phase State — effectively the Mission Timeline rendered as a fixed document rather than an interactive view, satisfying Product Spec §9.13's after-the-fact review requirement without introducing any reconstruction step the live explanations did not already go through.

---

## Open Items Carried Forward

Consistent with the practice in the parent documents, these are refinements of already-open questions, not new scope:

1. This document assumes the Record half of Layer E (permanent audit storage) exists as a sibling consumer of the same Stage 8 handoff (Section 5) rather than as something the XE itself owns; this should be confirmed against however the Record function is ultimately specified.
2. Alert System priority (Section 8) assumes a single operator interface; whether multi-operator or fleet-level oversight (Architecture Open Question 2) requires per-operator alert routing rather than a single shared stream is left open pending resolution of that question.
3. Mission Confidence's treatment of re-tasking (Mission Executive §8.4 — a changed Mission Definition triggers full re-validation) means a Mission Abort or Continue explanation immediately following re-tasking should explicitly state that prior Mission Progress was not carried forward; the exact wording convention for this is left for a follow-on specification pending resolution of Product Spec §7.4, Open Question 2.
