# Autonomous Flight Intelligence Platform (AFIP)
## Health Monitoring System — Engineering Design Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Author:** Lead Aerospace Systems Reliability Engineer (AFIP)
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, AFIP World State Engine v0.1, AFIP Mission Executive v0.1, AFIP Navigation System v0.1
**Scope of this document:** The Health Monitoring System (HMS) only. No code, no algorithms expressed as implementation, no data schemas, no message formats, no UI, and no changes to the flight simulator. The simulator remains the sole source of physical truth (Product Spec §10; Architecture P9); the HMS does not simulate the aircraft, it interprets what the simulator (and, eventually, real sensors) already reports. Every design decision below traces to a specific requirement or invariant already established in the five source documents.

---

## 0. What the Health Monitoring System Is

The Health Monitoring System is the concrete realization of the **aircraft health domain** inside **Layer C — Situational Reasoning** (Architecture §3.3). Where the Mission Executive owns the overall decision structure that weighs health, navigation, and mission judgment together (Mission Executive §0, §2), the HMS is the specific subsystem that *produces* the health half of that judgment: it converts reconciled belief about the aircraft's subsystems into a classification (nominal / degraded / critical), a continuous health score, a set of predicted-failure flags, and a set of advisory recommendations — all handed to the Mission Executive as input, never issued to the aircraft directly.

Its charter, in one line: **the HMS is the only place in AFIP where "what is true about the aircraft's condition" becomes "how healthy is the aircraft, and what is it likely to do next if nothing changes" — and everything it produces is advisory input to a decision made elsewhere.**

Three things are true of the HMS at all times, carried forward from the parent documents and non-negotiable:

- It reads exactly one thing from below: the current World State Snapshot published by the World State Engine (WSE §3.6, §8). It has no visibility into raw Evidence Records, individual sensor feeds, or the Reconciliation Record, and it never reaches around the WSE to read simulator telemetry directly.
- It never writes back into the World State Engine, the Mission Executive's internal state, or Arbitration. If HMS reasoning implies a belief is wrong, that can only re-enter AFIP as new evidence through Layer A on a future cycle (WSE §8, one-way boundary).
- It has no proposal authority and no path to the flight-control boundary. Everything the HMS produces — health score, warnings, predicted failures, recommended actions — is a classification or an advisory flag consumed by the Mission Executive's decision structure (Mission Executive §2, §6). It never becomes an intent until the Mission Executive proposes one, and that proposal is still subject to Arbitration exactly like any other (Architecture P2, Invariant 2).

---

## 1. Purpose

The Health Monitoring System exists to answer one question, continuously and deterministically: **given everything currently believed about the aircraft's subsystems, how healthy is the aircraft right now, and how much longer can it remain healthy enough to continue the mission as currently defined?**

It owns "how well is the aircraft holding together." It does not own "what should we do about it" — that judgment, integrated with navigation and mission status, remains the Mission Executive's (Mission Executive §2, §8), checked by Arbitration (Architecture §3.4). The HMS's authority is strictly diagnostic and predictive, never decisional.

This purpose is scoped deliberately to the airframe this platform actually is: a large, heavy-lift, bi-copter tiltrotor VTOL cargo aircraft with a known positive pitching moment, negative lift in forward flight, and high drag from its ducted shrouds (Product Spec §2.2, §10). These are not hypothetical failure modes the HMS watches for — they are known, current operating characteristics that make certain health conditions (energy depletion in cruise, motor thermal load during high-power hover, unfavorable wind loading on the shrouds) materially more likely and more consequential than they would be on a conventional airframe. The HMS's thresholds and models are built to reason honestly about this airframe, not an idealized one (Product Spec §2.2).

---

## 2. Responsibilities

The HMS is responsible for:

1. Continuously evaluating the condition of every monitored aircraft subsystem against deterministic engineering models and thresholds, using only belief already reconciled and confidence-scored by the WSE.
2. Producing a single, weighted, explainable **Health Score** for the aircraft, along with a per-subsystem breakdown that shows what is driving that score.
3. Detecting and classifying **Warnings** — conditions that are degraded but not yet unsafe — before they become critical.
4. Producing **Predicted Failures**: deterministic, model-based projections of when a currently-degrading condition will cross a critical threshold if the current trend continues, expressed with an explicit confidence and time horizon, never as a bare prediction.
5. Producing **Recommended Actions** — advisory, confidence-tagged suggestions (e.g., "reduce cruise speed to extend endurance margin") that the Mission Executive may weigh, but which carry no authority of their own.
6. Producing a **Mission Readiness** assessment: whether the aircraft's current condition supports beginning or continuing the mission as defined, independent of navigation or mission-progress judgment (which remain the Mission Executive's domains).
7. Surfacing every health classification, warning, predicted failure, and recommendation with a justification reference set — the specific Belief Fields and thresholds that produced it — so that Layer E can render an explanation without reconstruction (Architecture P6, Product Spec §6.3).
8. Never producing a proposed intent, never writing to the WSE, and never reaching the flight-control boundary, directly or indirectly.

The HMS is explicitly **not** responsible for: navigation-status judgment such as course deviation, geofence compliance, or route feasibility (Navigation System's and the Mission Executive's navigation domain); mission-achievability judgment such as schedule or energy-margin-versus-destination risk (Mission Executive §8); proposing or arbitrating any intent (Mission Executive §0, Architecture §3.4); or issuing any actuator, control-surface, or guidance setpoint command (Product Spec §4, Non-Goals).

---

## 3. Aircraft Components to Monitor

Each component below is monitored as a distinct sub-domain with its own thresholds, because collapsing them into one figure too early would hide which specific subsystem is actually degraded — the same principle the WSE applies to Belief Fields (WSE §6, "composition, not merging").

| Component | What "health" means for this component |
|---|---|
| **Battery / Power** | Remaining usable energy, discharge-rate trend, cell/pack temperature, voltage sag under load, relative to the airframe's known higher energy consumption in cruise (Product Spec §2.2). |
| **Motors** | Winding/case temperature, RPM-versus-commanded deviation, vibration signature, duty-cycle load relative to thermal limits — particularly under sustained hover or high-power transition, where the ducted-fan design demands the most from the motors. |
| **ESCs (Electronic Speed Controllers)** | Controller temperature, current draw versus commanded throttle, fault/error-flag state, response-latency drift. |
| **GPS** | Satellite count, dilution-of-precision (DOP) trend, signal continuity, position-fix age, agreement with dead-reckoned position. |
| **IMU** | Internal consistency across axes, drift-rate trend since last external correction, agreement with GPS-derived kinematics, and (where more than one IMU exists) inter-unit agreement. |
| **Communication** | Link margin, packet loss/latency trend, time since last confirmed uplink/downlink, degradation relative to known range/terrain expectations for the current position. |
| **Payload** | Attach-state confirmation, weight-shift or imbalance indication, restraint/latch status, any payload-reported fault (e.g., a powered or instrumented payload signaling its own condition). |
| **Weather (as it bears on airframe health)** | Wind speed/gust loading against the airframe's known drag and pitching-moment sensitivity, temperature extremes affecting battery and motor thermal margins, precipitation/icing risk to exposed surfaces. This is health-relevant weather interpretation, distinct from the Navigation System's use of wind for route planning (Navigation System §3.2). |
| **Navigation Health** | *Sensor and estimator integrity*, not navigational judgment: whether the position/attitude estimate the aircraft depends on is itself trustworthy right now (GPS/IMU agreement, fix quality, estimator confidence). This is deliberately narrower than the Mission Executive's "navigation status" domain, which judges course and route — the HMS only judges whether the sensors feeding that judgment are healthy. |
| **Overall Aircraft Health** | The aggregated, weighted composite of all of the above — the single Health Score described in Section 7 — representing the aircraft's total condition, not any one subsystem in isolation. |

---

## 4. Inputs

**4.1 World State Snapshot (the primary and structurally required input).** Consistent with the WSE's "no-skip rule" (Architecture §2; WSE §8), the HMS reads exactly one object from below: the current World State Snapshot. Within it, the HMS draws on:
- **Aircraft State** — specifically Power/Energy, Propulsion/Actuation, Payload, and Subsystem Health Belief Fields (WSE §3, §5.2), each already carrying its own confidence and freshness.
- **Environment State** — specifically the Atmospheric/weather Belief Fields relevant to airframe loading and thermal margin (WSE §3, §5.2).
- **Mission State** — read only for context weighting (e.g., how much energy margin the current mission still requires), never as an input the HMS is permitted to judge or alter; mission achievability itself remains the Mission Executive's judgment (Mission Executive §8).

**4.2 "Simulator Telemetry" and "Environmental Conditions" as evidence, not as direct inputs.** The Product Specification and Architecture require that nothing above Layer A ever reason on raw, unreconciled evidence (Architecture P3, Invariant 1). The HMS therefore never taps the simulator directly — what the HMS treats as "simulator telemetry" and "environmental conditions" always arrives pre-reconciled into the relevant Belief Fields of the Snapshot described in 4.1. This is a deliberate architectural constraint, not an omission: it guarantees the HMS is judging the same confidence-scored picture of reality that the rest of Situational Reasoning judges, never a fresher or different one obtained by bypassing the WSE.

**4.3 Mission State (for context only).** The HMS reads Mission Definition and Mission Progress belief only to know what the mission currently demands of the aircraft (e.g., remaining distance, expected duration) so that Mission Readiness (Section 5) can be assessed against the mission actually assigned — not to judge whether that mission is achievable, which remains exclusively the Mission Executive's responsibility (Mission Executive §8.1).

**4.4 What is explicitly not an input.** Raw Evidence Records, the Reconciliation Record, any individual live sensor feed, the Mission Executive's Proposed or Accepted Intent, Arbitration's constraint set, or Navigation System's internal route/obstacle state. The HMS's picture of the world is exactly as wide as the Snapshot and no wider.

---

## 5. Outputs

All HMS outputs are directed upward into the Mission Executive's health-domain judgment (Architecture §3.3) and into Layer E for explanation and record (Architecture §3.5) — never toward the flight-control boundary.

| Output | What it is |
|---|---|
| **Health Score** | A single weighted, 0–100 composite score (Section 7) plus its per-subsystem breakdown, refreshed every reasoning cycle. |
| **Warnings** | Discrete, named conditions where a subsystem has crossed its Information or Warning threshold (Section 9) but not yet a Critical or Emergency one. |
| **Predicted Failures** | Deterministic, model-based projections (Section 8) of which subsystem is trending toward a critical threshold, the estimated time/distance-to-threshold, and the confidence of that projection. |
| **Recommended Actions** | Confidence-tagged, advisory suggestions consumed by the Mission Executive's proposal function — never a command, and never something the HMS can act on itself (Section 10). |
| **Mission Readiness** | A single classification — Ready / Ready with Constraints / Not Ready — of whether the aircraft's current condition supports beginning or continuing the mission as defined, independent of navigation and mission-progress judgment. |

Every one of these outputs carries the same discipline the WSE and Mission Executive already require of belief and proposals: a value, a confidence, and a justification reference set (WSE §3.2; Mission Executive §7). None of them is ever presented as a bare number or a bare flag without that context.

---

## 6. Internal Modules

Each module below owns one sub-domain of health judgment and produces its result independently, so that a fault or degradation in one module cannot silently distort another (Architecture P8).

### 6.1 Battery Monitor
**Owns:** Power/Energy health. Evaluates remaining usable energy against projected consumption for the remainder of the current mission phase, discharge-rate trend, and cell/pack temperature, using the airframe's known higher cruise energy demand (Product Spec §2.2) as a standing assumption rather than an idealized baseline.
**Produces:** Battery sub-score, battery-specific warnings, and the battery-depletion failure prediction (Section 8.1).

### 6.2 Motor Monitor
**Owns:** Motor and duct-fan propulsion health. Evaluates winding/case temperature against thermal limits, RPM-versus-commanded deviation, and vibration signature, weighted by current flight phase (hover and transition place the highest thermal load on this airframe's ducted fans).
**Produces:** Motor sub-score, motor-specific warnings, and the motor-overheating failure prediction (Section 8.2).

### 6.3 Communication Monitor
**Owns:** Uplink/downlink health. Evaluates link margin, packet loss and latency trend, and time-since-last-confirmed-contact.
**Produces:** Communication sub-score, link warnings, and the communication-degradation failure prediction (Section 8.3).

### 6.4 GPS Monitor
**Owns:** Positioning-sensor health (not navigational judgment — see Section 3). Evaluates satellite count, DOP trend, fix continuity, and agreement between GPS-derived and dead-reckoned position.
**Produces:** GPS sub-score, GPS-specific warnings, and the GPS-degradation failure prediction (Section 8.4).

### 6.5 Environmental Monitor
**Owns:** Weather and atmospheric conditions as they bear on airframe and subsystem health — wind loading against known drag/pitching-moment sensitivity, temperature extremes affecting thermal margins, precipitation/icing exposure.
**Produces:** Environmental sub-score, weather-related warnings, and the high-wind-risk failure prediction (Section 8.5).

### 6.6 Mission Health
**Owns:** The context-weighting function described in Section 4.3 — translating "what the mission currently demands" into the specific thresholds the other monitors should apply right now (e.g., how much energy margin is required given remaining distance). This module does not judge mission achievability itself (that remains the Mission Executive's, Mission Executive §8) — it only tells the other monitors what "enough" currently means.
**Produces:** The context inputs consumed by Sections 6.1–6.5, and the Mission Readiness classification (Section 5).

### 6.7 Overall Health Aggregator
**Owns:** Combining every sub-score into the single Health Score (Section 7), applying the weighting model, and producing the final health-domain classification (nominal / degraded / critical) that the Mission Executive consumes as its health-domain input (Mission Executive §2, step 2 and step 3).
**Produces:** Health Score, overall classification, and the consolidated set of Warnings, Predicted Failures, and Recommended Actions passed upward as a single unit per cycle — mirroring the WSE's Snapshot discipline (WSE §2): the Mission Executive never sees a partially-updated health picture, only a complete one.

---

## 7. Health Score

**7.1 Design principle.** The Health Score is a weighted composite, not a simple average, for the same reason the Mission Executive uses a weakest-link rule for domain confidence rather than averaging (Mission Executive §7.2): a single severely degraded subsystem must never be diluted into invisibility by several healthy ones. The Health Score therefore combines two mechanisms:
- **Weighted contribution** — each subsystem contributes to the score in proportion to how much its failure would endanger the aircraft or the mission, reflecting engineering judgment about this specific airframe.
- **A ceiling rule** — regardless of weighted contribution, the Overall Health Score can never exceed what the single lowest-scoring safety-critical subsystem would justify. A critical battery condition caps the Overall Score at "critical," no matter how healthy the communication link is.

**7.2 Illustrative weighting.** The following weights are illustrative starting points for calibration, not a final specification — they exist to show how the model behaves, and would be tuned against real subsystem failure-rate and consequence data as the airframe design matures (an open item, Section 13):

| Sub-domain | Illustrative weight | Rationale |
|---|---|---|
| Battery / Power | 30% | This airframe is already known to consume energy faster than an idealized VTOL in cruise (Product Spec §2.2); energy depletion is the most consequential and most likely-to-bind health condition. |
| Motors / ESCs (Propulsion) | 25% | Loss of propulsion authority on a heavy-lift tiltrotor is immediately flight-critical, particularly in hover and transition. |
| Navigation (GPS/IMU sensor health) | 15% | Positioning-sensor integrity underlies every other domain's ability to reason correctly; is weighted below propulsion/power because a degraded-but-not-lost estimate is often survivable with a conservative response. |
| Communication | 10% | Loss of link degrades human oversight and operator-command capability but does not, by itself, prevent the aircraft from continuing to reason and act autonomously. |
| Environment (weather) | 10% | Weighted as a health factor only insofar as it stresses the airframe (wind loading against known drag/pitch sensitivity, thermal extremes); it is not weighted as a navigation-routing factor here (that is the Navigation System's concern). |
| Mission (readiness context) | 10% | Reflects whether current subsystem margins are adequate for what remains of the assigned mission, not mission achievability itself. |

**7.3 How each subsystem contributes.** Each module in Section 6 produces a 0–100 sub-score using its own deterministic model (thresholds, trend slope, margin-to-limit). The Overall Health Aggregator (Section 6.7) combines these sub-scores using the weights above, then applies the ceiling rule in 7.1. The result is a single number that is always traceable back to which specific sub-score and which specific Belief Fields produced it — satisfying the same explainability-by-construction requirement the rest of AFIP is held to (Architecture P6).

**7.4 Confidence, inherited not invented.** Exactly as the Mission Executive treats WSE-supplied confidence as given (Mission Executive §7.1), the HMS never re-derives or second-guesses the confidence already attached to a Belief Field. If the confidence underlying a sub-score is too low to trust, that sub-domain is marked **unknown** rather than assigned an optimistic default score — an unknown battery reading is never silently scored as if it were mid-range healthy.

---

## 8. Failure Prediction

Per explicit design direction, all failure prediction in the HMS uses **deterministic engineering models** — threshold projection, trend/rate-of-change extrapolation, margin analysis, and redundancy/consistency checking. No machine-learning or statistical pattern-classification model is used anywhere in this subsystem; where AFIP's architecture elsewhere reserves a place for advisory, model-based judgment (Architecture §6, P5), the HMS's contribution to that advisory channel — if any — is limited to deterministic outputs tagged as deterministic, never as a learned inference (Architecture §6: "an advisory flag is tagged with its origin").

**8.1 Battery depletion.** Deterministic linear (or airframe-characterized non-linear) extrapolation of the current discharge-rate trend against remaining usable energy, cross-checked against the energy the Mission Health context (Section 6.6) indicates is required for the remainder of the mission. Produces a time/distance-to-critical-margin figure with an explicit confidence band derived from how stable the discharge trend has been over the recent reconciliation window.

**8.2 Motor overheating.** Deterministic thermal-margin projection: current temperature, its rate of rise under the present duty cycle, and the manufacturer/design thermal limit, projected forward assuming the current flight-phase load continues. A tightening margin under sustained hover or transition load is flagged well before the limit is reached, not only once it is crossed.

**8.3 Communication degradation.** Deterministic trend analysis of link margin, packet loss, and latency over a bounded recent window, projected forward to estimate time-to-loss-of-link, cross-referenced against known range/terrain expectations for the aircraft's current position (not a general-purpose anomaly model).

**8.4 GPS degradation.** Deterministic evaluation of satellite count and DOP trend, cross-checked against the divergence between GPS-derived position and the IMU-based dead-reckoned position. A widening divergence, or a DOP trend crossing a defined threshold, produces a predicted-degradation flag with a confidence tied to how much independent cross-checking data is available.

**8.5 High wind risk.** Deterministic comparison of current and short-horizon forecast wind/gust conditions (as reconciled Environment State belief) against the airframe's known drag and pitching-moment sensitivity at the current or planned airspeed (Product Spec §2.2). This is a margin calculation — how close current conditions are to the point where the airframe's known aerodynamic disadvantages would materially erode control margin or endurance — not a generic weather-severity score.

**8.6 Sensor inconsistency.** Deterministic cross-check/voting logic among available redundant sensors (e.g., multiple IMUs, GPS versus dead-reckoning) — when two or more independent sources materially disagree beyond a defined tolerance, this is flagged directly as a sensor-inconsistency condition, without attempting to silently resolve which source is "right." This mirrors the WSE's own rule that disagreement is preserved and surfaced, never silently averaged away (WSE §7).

**8.7 Common structure.** Every Predicted Failure output states: the subsystem, the specific model/threshold that produced it, the projected time or distance to the threshold, and a confidence level reflecting the stability and completeness of the underlying trend data — never a bare prediction without its supporting basis (Architecture P6).

---

## 9. Alert Logic

Alerts escalate through four tiers, each with a defined trigger condition and a defined effect on downstream reasoning. Escalation is one-way and immediate on any qualifying condition; de-escalation requires a full reasoning cycle confirming the condition has genuinely cleared against fresh, confident belief — never merely the absence of a new bad reading (mirroring the Mission Executive's posture-recovery rule, Mission Executive §1.2).

| Tier | Trigger | Effect |
|---|---|---|
| **Information** | A subsystem's sub-score has moved outside its nominal band but remains well clear of any operational concern (e.g., battery at 60% on a short mission). | Logged; visible to the operator (Operator Interface Boundary, Architecture §3.6); does not affect Health Score classification. |
| **Warning** | A subsystem sub-score or a Predicted Failure's projected time-to-threshold has crossed the "degraded" boundary — the condition is not yet unsafe but requires attention or a conservative adjustment if the trend continues. | Overall Health classification moves to **degraded**; a Recommended Action is generated (Section 10); Mission Executive posture is affected per Section 10's mapping. |
| **Critical** | A subsystem sub-score has crossed a threshold at which continued operation without a conservative response is unsafe, or a Predicted Failure's time-to-threshold has fallen inside a bounded, mission-relevant horizon. | Overall Health classification moves to **critical**; per the Mission Executive's fixed precedence order, this is evaluated ahead of mission status and can, on its own, drive an abort-class proposal (Mission Executive §2, step 2; §8.2). |
| **Emergency** | A subsystem has failed outright, or two or more Critical conditions are concurrent (e.g., a critical battery condition together with a critical motor condition). | Overall Health classification is forced to **critical** regardless of the weighted score (the ceiling rule, Section 7.1); the justification reference set explicitly names the concurrent conditions so Layer E's explanation reflects the compounding, not just the worse of the two. |

Each tier's threshold is a property of that specific subsystem's own sensitivity — consistent with the WSE's per-field freshness-threshold model (WSE §5.3) — not a single global cutoff applied uniformly across battery, motors, GPS, and communication alike.

---

## 10. Mission Executive Integration

**10.1 What crosses the boundary.** The HMS hands the Mission Executive exactly three things each cycle, as a single consolidated unit (Section 6.7): the Overall Health classification (nominal/degraded/critical), the Health Score and its justification reference set, and the current set of Warnings, Predicted Failures, and Recommended Actions. Nothing else crosses this boundary, and nothing crosses it in the other direction — the HMS has no visibility into the Mission Executive's Proposed or Accepted Intent, exactly as the WSE has none (WSE §8, §9.6 analog).

**10.2 How it is consumed.** The Mission Executive's fixed precedence order (Mission Executive §2) consults the HMS's health classification directly at its second step — "does any health or navigation condition cross a critical threshold" — before mission status is consulted at all (Mission Executive §8.2, "mission concerns never outrank safety"). The HMS's classification is the deterministic fact that step operates on; the HMS's Recommended Actions are advisory input the Mission Executive's proposal function may weigh when choosing *which* conservative response to propose, never a substitute for that choice.

**10.3 Illustrative mapping (advisory, not authoritative).** The following shows how HMS outputs typically inform — but never dictate — the Mission Executive's resulting proposal, which remains subject to Arbitration in every case:

| HMS Overall Classification / Alert Tier | Typical influence on Mission Executive posture | Proposal category the Mission Executive may generate |
|---|---|---|
| Nominal / Information | No effect on posture. | Continue. |
| Degraded / Warning | Posture moves toward CAUTIOUS (Mission Executive §1.2). | Reduce Speed, or continue with reduced envelope. |
| Critical (single condition) | Posture moves to MINIMAL. | Return Home, or Divert to a Recommended Action's suggested candidate, depending on flight phase and remaining margin. |
| Critical (concurrent/Emergency) | Posture moves to MINIMAL; if the HMS itself cannot complete a cycle, this instead maps to the Mission Executive's own SUSPENDED fault-handling path (Mission Executive §6.2). | Emergency Landing, or Abort Mission. |

**10.4 The HMS never chooses between these.** Which specific proposal category the Mission Executive generates depends on flight phase, navigation status, and mission status together, not on the HMS's output alone (Mission Executive §2, §8.3) — the HMS's role ends at producing an honest, well-justified classification and a set of advisory suggestions. Every proposal the Mission Executive ultimately generates from this input still passes through Arbitration exactly like any other, with no path that treats a Critical or Emergency HMS classification as license to bypass that check (Architecture P2, Invariant 2).

**10.5 HMS internal fault.** If the HMS's own aggregation cannot complete a cycle (Section 6.7), it does not report a stale score as if current. Consistent with the WSE's rule that no Snapshot is published rather than a partially-reconciled one (WSE §7), the HMS instead reports "health unknown" for the affected cycle, which the Mission Executive's own precedence order treats as insufficient confidence to reason about at all (Mission Executive §2, step 1) — driving a conservative fallback rather than an optimistic default.

---

## 11. Mission Reports

Consistent with Layer E's responsibility to preserve a permanent, unalterable record of everything AFIP believed, proposed, and was told (Architecture §3.5, Product Spec §9.13), the HMS supplies the following into that record every cycle, without exception:

- The Health Score and its full per-subsystem breakdown, timestamped, for the complete mission duration (a continuous time series, not just threshold-crossing events).
- Every threshold crossing (Information, Warning, Critical, Emergency) with the specific Belief Fields, values, and models that produced it.
- Every Predicted Failure generated, including ones whose projected threshold was never actually reached — a "false alarm" prediction is exactly as important to the record as one that resolved into a real event, because it is part of what makes the HMS's own performance auditable over time (Product Spec §9.13 analog).
- Every Recommended Action generated, and — via the Mission Executive/Arbitration record, referenced but not owned by the HMS — whether it was reflected in the proposal ultimately accepted, modified, or rejected.
- Every sensor-inconsistency condition detected (Section 8.6), including which sources disagreed and by how much, preserved rather than resolved into a single "corrected" value.
- Any cycle in which the HMS could not complete its aggregation (Section 10.5), recorded explicitly as a gap — never allowed to look like "nothing happened" (Architecture §7, row E).

This record is what supports Mission Readiness review, post-mission maintenance analysis, and any future certification-adjacent scrutiny (Product Spec §12), without requiring the HMS to hold any authority beyond what is already described above.

---

## 12. Future Scalability

Based only on what has been established about the HMS's intent and boundaries:

- **Predictive maintenance.** Because every Predicted Failure already carries a model, a threshold, and a confidence (Section 8), the same deterministic outputs that inform in-mission decisions can be aggregated across missions to support scheduled maintenance planning, without changing what the HMS fundamentally computes in-flight.
- **Real sensor integration.** Because the HMS only ever reads reconciled Belief Fields from the WSE Snapshot (Section 4) and never the simulator directly, replacing simulated telemetry with real sensor data is entirely an Evidence Intake (Layer A) and WSE concern (WSE §8, Architecture §9 extensibility point 1) — the HMS's contract with the Snapshot does not change.
- **PX4 telemetry.** A real autopilot's telemetry stream would enter AFIP the same way simulator telemetry does today — as Evidence Records reconciled by the WSE into the same Power/Energy, Propulsion/Actuation, and Subsystem Health Belief Fields the HMS already consumes (Architecture §8, §9 extensibility point 3) — requiring no change to the HMS's modules, weighting model, or alert logic.
- **Fleet management.** Because each aircraft's HMS produces a self-contained, per-aircraft Health Score and record (Section 11), a fleet-level view is an aggregation built on top of multiple independent HMS instances, not a redesign of any single aircraft's health reasoning — consistent with the Product Specification's fleet-scalability point that operator/oversight extension should not change AFIP's core relationship to any single aircraft (Product Spec §12).

*Any scalability claims beyond what is described above (e.g., a specific maintenance-scheduling algorithm, a specific fleet dashboard, a specific certification pathway) are not yet supported by the material provided and are intentionally omitted.*

---

## 13. Open Items Carried Forward

Consistent with the practice in the parent documents, these are refinements of already-open questions, not new scope:

1. The illustrative weighting in Section 7.2 requires calibration against real subsystem failure-rate and consequence data as the airframe design (SCAD/CFD) matures — this document takes a provisional position, not a final one, pending the same open question the Product Specification raises about when airframe-specific reasoning should be formalized (Product Spec §2.2, Open Question 1).
2. Whether "Navigation Health" (Section 3) should be formally split out as its own weighted sub-domain distinct from Propulsion/Power, or remain a lower-weighted contributor as shown here, depends in part on how the Navigation System's own confidence model (Navigation System, forthcoming sections on confidence) matures.
3. Whether Environment State should carry an explicit sub-grouping for airframe-specific aerodynamic sensitivity (WSE Open Item 1) directly affects how precisely the Environmental Monitor (Section 6.5) can calculate wind-loading margin versus reasoning about it only generically through existing Atmospheric belief.
4. The exact bounded time horizon used for "mission-relevant" Predicted Failure windows (Section 9, Critical tier) is not yet fixed and should be set once typical mission durations and re-tasking behavior (Mission Executive Open Item 2) are resolved.
