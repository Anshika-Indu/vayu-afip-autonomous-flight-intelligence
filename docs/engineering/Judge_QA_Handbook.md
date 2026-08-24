# Autonomous Flight Intelligence Platform (AFIP)
## Judge Question & Answer Handbook

**Classification:** Internal / Program Reference — Presentation Support
**Purpose:** 100 anticipated technical questions, organized by domain, each with a concise spoken answer (30–120 seconds), the technical justification, and honest tradeoffs.
**Grounding:** Every answer is traceable to the Product Specification, Software Architecture Document, CFD Report, First Principles document, or the parametric airframe model. Where a question asks about something not yet defined or implemented, the answer says so directly rather than inventing a capability.

---

## Section 1 — System Architecture (10)

**Q1. What is AFIP, in one sentence?**
**A:** AFIP is the cognitive layer of a heavy-lift autonomous cargo VTOL — it perceives, reasons about health/navigation/mission status, proposes what the aircraft should do next, and explains every proposal, but never issues a flight-control command itself.
**Why correct:** This is the Product Specification's own one-line identity statement (§1).
**Tradeoff:** Being this narrowly scoped means AFIP is useless without a capable flight controller beneath it — it's a force multiplier, not a standalone autopilot.

**Q2. Why separate cognition from control instead of building one integrated system?**
**A:** Because a fault in reasoning should never be able to produce a bad actuator command. By making AFIP structurally incapable of issuing direct control output, its reasoning can grow more sophisticated over time without re-certifying flight-control safety every time.
**Why correct:** This is the explicit engineering rationale in the Whitepaper and Software Architecture §0.
**Tradeoff:** The cost is latency — AFIP can never react faster than its proposal can be arbitrated, so the flight controller must retain its own independent, faster-acting failsafes.

**Q3. What are AFIP's five layers?**
**A:** Evidence Intake, Belief Formation, Situational Reasoning, Decision & Arbitration, and Explainability & Record. Evidence flows up through them; authority flows back down only as far as a checked proposal.
**Why correct:** Directly enumerated in Software Architecture §2.
**Tradeoff:** Five strict layers add architectural discipline but also add latency versus a flatter design that let urgent signals skip layers.

**Q4. What is the "no-skip rule"?**
**A:** A layer may only exchange information with the layer immediately adjacent to it. Layer D can't act on Layer A's raw evidence directly, and Layer B can't issue anything to the flight-control boundary directly.
**Why correct:** Stated explicitly in Software Architecture §2 as the mechanism that prevents urgency from compressing the path from signal to action.
**Tradeoff:** This guarantees traceability but means even a high-confidence, urgent signal must traverse the full pipeline before it can influence anything.

**Q5. What is the World Model?**
**A:** A shared, temporally coherent, multi-resolution representation of reality with explicit uncertainty — not a database. Every object in it answers what we believe, how certain we are, and when we last updated that belief.
**Why correct:** Verbatim framing from the First Principles: Information-Centric Architecture document.
**Tradeoff:** Maintaining confidence and freshness metadata on every field is more engineering overhead than a plain state store, but it's what makes staleness detection possible at all.

**Q6. How many objects make up the World Model, and who owns them?**
**A:** Eleven — AircraftState, MissionState, EnvironmentState, NavigationState, BatteryState, HealthState, CargoState, TrafficState, CommunicationState, WeatherState, and OperatorState — each with exactly one authorized writer.
**Why correct:** Documented in full in the Software Architecture Document's World Model Objects section.
**Tradeoff:** The single-writer rule prevents race conditions but means every new capability needs a clear answer to "who owns this field" before it can be added.

**Q7. Why is the Safety Monitor read-only on the World Model?**
**A:** Because if a safety-critical subsystem could write to shared state, a bug in its own logic could corrupt what every other subsystem depends on. Instead, it reads the World Model and commands the flight controller directly through a separate emergency channel.
**Why correct:** Stated as "non-negotiable" in the First Principles document's Critical Architectural Decisions section.
**Tradeoff:** This keeps the World Model trustworthy, but means the Safety Monitor's emergency path must be engineered and verified completely separately from normal World Model consumers.

**Q8. What happens if two subsystems try to write the same field?**
**A:** That's precisely what the architecture is designed to prevent — every object has exactly one authorized writer, by design, not by runtime arbitration. There is no dual-writer case to resolve because it isn't allowed to occur.
**Why correct:** The "rule of one writer" is stated directly in the First Principles document.
**Tradeoff:** This requires upfront ownership decisions for every new data field, which is more design work than a shared-mutable-state approach.

**Q9. How does AFIP guarantee a reader never sees inconsistent state — like new position paired with old velocity?**
**A:** Object updates are atomic. When the State Estimator publishes a new AircraftState, the whole object swaps at once via double-buffering or read-copy-update semantics, so readers never see a partial update.
**Why correct:** Explicitly specified in Software Architecture §5 (Critical Architectural Decision 5).
**Tradeoff:** Atomic whole-object swaps are simpler to reason about than field-level locking but can mean a reader occasionally waits one more cycle for a fully consistent object.

**Q10. What's the boundary between AFIP and the flight simulator today, versus a real aircraft later?**
**A:** Structurally identical. AFIP is a downstream observer of whatever exposes telemetry — simulator now, real sensors later — and its only outward influence is the same checked, high-level proposed intent either way.
**Why correct:** Product Spec §11 and §12 state this boundary is deliberately kept narrow so the layer beneath it can be swapped without changing AFIP.
**Tradeoff:** Keeping the boundary abstract now means some simulator-specific quirks may need to be handled at that boundary later rather than assumed away today.

---

## Section 2 — AI & Reasoning (10)

**Q11. Where does machine learning or statistical modeling fit into AFIP?**
**A:** Only as advisory input. Model-based judgment can raise a confidence-scored flag — "this might be true" — but it can never, by itself, generate a proposed intent. A flag only becomes a decision after deterministic judgment weighs it.
**Why correct:** This is the Certainty/Advisory Boundary, Software Architecture §6, and Architectural Invariant 4.
**Tradeoff:** This keeps decisions auditable and traceable to hard facts, at the cost of not letting a highly-confident model act immediately on its own judgment.

**Q12. Why not let a sufficiently confident AI model make the decision directly?**
**A:** Because that would make deterministic and probabilistic reasoning the same thing, and the architecture treats keeping them separate as non-negotiable — deterministic judgment is the only thing allowed to turn a flag into a classification.
**Why correct:** Software Architecture §1 (P5) states this separation explicitly.
**Tradeoff:** The tradeoff is response latency for genuinely correct high-confidence model insights, accepted in exchange for never letting an unverifiable model output directly control the aircraft's intent.

**Q13. What's the difference between "belief" and "evidence" in AFIP's design?**
**A:** Evidence is raw, untagged signal exactly as received — no interpretation. Belief is what Layer B produces after reconciling evidence into a single, confidence-scored understanding. Nothing above Layer A is allowed to reason on raw evidence directly.
**Why correct:** Product Spec §6.5 and Software Architecture §0 draw this line explicitly.
**Tradeoff:** Requiring reconciliation before reasoning adds a processing step, but prevents any downstream layer from silently trusting a single noisy sensor.

**Q14. What's the difference between "belief" and "intent"?**
**A:** Belief is what AFIP thinks is true. Intent is what AFIP is trying to do. They are architecturally separate structures that are never allowed to merge — a decision references belief, but is not the same object as the belief itself.
**Why correct:** Architectural Invariant 5 states this directly.
**Tradeoff:** Keeping them separate structures adds bookkeeping overhead but prevents a belief update from silently becoming a decision without going through arbitration.

**Q15. How does AFIP treat conflicting sensor evidence?**
**A:** It reduces confidence rather than silently resolving the conflict by averaging or picking a preferred source. A low-confidence belief then forces Layer C into a conservative fallback.
**Why correct:** Software Architecture §7 specifies this exact response for Layer B under conflicting evidence.
**Tradeoff:** This avoids masking a real disagreement between sensors, but means genuinely resolvable conflicts still trigger conservative behavior rather than a smarter reconciliation.

**Q16. Is AFIP's reasoning deterministic or probabilistic?**
**A:** Both, deliberately separated. Health/safety thresholds and mission logic are deterministic. Pattern and anomaly judgment is probabilistic, but it's always advisory input to the deterministic side, never a decision in itself.
**Why correct:** Product Spec §6.4 and Software Architecture §1 (P5) establish this split as an organizing constraint.
**Tradeoff:** This is more conservative than a pure ML-driven decision system, trading some responsiveness for auditability.

**Q17. How does AFIP avoid "hallucinating" a fact about the aircraft?**
**A:** It can't present an advisory judgment as a hard fact — every advisory flag is tagged with its origin, so downstream reasoning and explanation always know whether a factor was a deterministic fact or a confidence-scored observation.
**Why correct:** Software Architecture §6 requires this tagging explicitly, satisfying Product Spec §9.11 and §5.
**Tradeoff:** This adds bookkeeping to every advisory input but is what makes the certainty/advisory distinction enforceable rather than just a policy statement.

**Q18. What happens if AFIP's confidence in a belief drops mid-mission?**
**A:** The affected domain is treated as unknown rather than assumed nominal, which forces Layer C into a conservative fallback proposal per the decision structure's first evaluation step.
**Why correct:** Software Architecture §5 and §7 both specify this — staleness or low confidence is checked before any other judgment is trusted.
**Tradeoff:** This can trigger conservative behavior even when the underlying condition later turns out to have been fine — an accepted cost of never trusting stale or low-confidence belief.

**Q19. Does AFIP learn or adapt over time?**
**A:** The architecture reserves room for advisory/model-based judgment to improve over time as an extensibility point, but no specific learning mechanism, training pipeline, or adaptation process is defined in the current specifications.
**Why correct:** Software Architecture §9 names "new advisory judgment capability" as an extensibility point, without specifying a mechanism.
**Tradeoff:** This is honest but non-committal — a real answer requires design work not yet done, and this report will not invent one.

**Q20. Why is cross-domain reasoning (health × navigation × mission) important?**
**A:** Because a degradation in one domain can invalidate assumptions in another — a battery issue changes what "on track" means for the mission, for instance. AFIP is required to let degradation in any one domain force re-evaluation of the other two, rather than reasoning about them in isolation.
**Why correct:** Product Spec §9.7 states this requirement directly.
**Tradeoff:** Cross-domain re-evaluation costs more computation per cycle than siloed reasoning, but prevents a mission-status judgment from silently ignoring a developing health problem.

---

## Section 3 — Navigation (8)

**Q21. What does the Navigator own, and what does it read?**
**A:** The Navigator owns NavigationState — path geometry, cross-track error, and geofence status. It reads AircraftState.pose, MissionState.active_mission, EnvironmentState (obstacles and terrain), TrafficState, WeatherState.wind, and BatteryState for range-constrained planning.
**Why correct:** Directly from the Software Architecture Document's Information Flow Topology for the Navigator.
**Tradeoff:** Reading from six other objects makes the Navigator's output only as good as the freshest of those inputs — a stale wind estimate degrades path-following quality even if navigation logic itself is correct.

**Q22. How does AFIP handle geofence enforcement?**
**A:** The Navigator computes geofence_status (INSIDE/WARNING/BREACH) as part of NavigationState. The Safety Monitor reads this status independently for boundary enforcement, separate from normal guidance.
**Why correct:** Documented in NavigationState's spatial_awareness fields and the Safety Monitor's read list.
**Tradeoff:** Having two consumers of the same status field (Navigator for guidance, Safety Monitor for enforcement) requires strict single-writer discipline so the two never disagree about ground truth.

**Q23. What is "glide range estimate" and why does it matter for a VTOL cargo aircraft?**
**A:** It's a documented NavigationState field estimating how far the aircraft could glide from its current position and which safe landing sites fall within that range — relevant because engine-out or major power loss still needs a landing option.
**Why correct:** Directly specified in NavigationState's spatial_awareness section.
**Tradeoff:** For a ducted-fan tiltrotor with high measured drag, unpowered glide performance is likely poor — this is a field the architecture defines, but real glide range values depend on airframe data not yet measured for unpowered flight.

**Q24. How is obstacle avoidance handled?**
**A:** EnvironmentState.dynamic_obstacles tracks detected objects with position, velocity, class, and confidence. The Navigator reads this for path replanning, and it's explicitly event-driven — new obstacle detection or obstacle-lost events trigger a replan.
**Why correct:** Documented in EnvironmentState and confirmed in the Navigator's description as "event-driven (obstacle detected → replan)."
**Tradeoff:** Event-driven replanning is efficient but depends entirely on the freshness and confidence of the underlying detection — a stale detected_objects entry could delay an accurate replan.

**Q25. How does the Navigator account for wind?**
**A:** It reads WeatherState.wind for compensation as part of guidance, and the State Estimator separately reads wind for airspeed/groundspeed reconciliation.
**Why correct:** Both read relationships are explicitly listed in the Information Flow Topology.
**Tradeoff:** Wind estimates are continuous but only updated at roughly 1 Hz per WeatherState's specified rate — fast-changing gusts between updates aren't reflected until the next cycle.
</br>

**Q26. Does the Navigator use terrain data for terrain-following?**
**A:** Yes — it reads EnvironmentState.terrain (elevation model, interpolated height at the aircraft, slope) explicitly for terrain following and avoidance.
**Why correct:** Listed directly in the Navigator's read relationships.
**Tradeoff:** Terrain data quality depends on the loaded digital elevation model's resolution, which isn't specified at this design stage.

**Q27. How does path-following performance get measured?**
**A:** Through NavigationState's cross_track_error, vertical_track_error, and convergence_status (CONVERGED/CONVERGING/DIVERGED), updated at 50–100 Hz.
**Why correct:** Directly documented fields and update rate in NavigationState.
**Tradeoff:** No specific numeric acceptance threshold for "converged" is defined in the current specifications — that's an implementation-level tuning decision, not yet made.

**Q28. Can the Navigator override the Mission Manager's waypoints?**
**A:** No. The Navigator reads MissionState.active_mission as a reference — it does not own or write mission waypoints. It can only propose adjustments through Layer D, the same as any other domain judgment.
**Why correct:** MissionState's sole writer is the Mission Manager per the architecture's ownership rules; the Navigator's owns/writes list is limited to NavigationState.
**Tradeoff:** This ownership separation is architecturally clean but means a navigation-driven reroute still has to go through the full decision and arbitration pipeline rather than being applied directly.

---

## Section 4 — Explainability (8)

**Q29. How does AFIP explain a decision?**
**A:** Every proposal Layer D produces includes its justification — the specific facts and rejected alternatives — as a single unit generated at decision time. Layer E only renders that justification into human-readable form; it doesn't create new reasoning.
**Why correct:** Architectural Invariant 6 / P6 states explanation is a byproduct of deciding, not a later reconstruction.
**Tradeoff:** This guarantees the explanation matches what actually happened, but it also means Layer E can't produce a "better" or more polished explanation than what Layer D actually reasoned through.

**Q30. What happens if AFIP can't render an explanation in real time?**
**A:** The decision is not blocked or delayed by that failure — but the gap is explicitly recorded as a gap, so silence is never mistaken for "nothing happened."
**Why correct:** Software Architecture §7 specifies this exact response for Layer E failures.
**Tradeoff:** This prioritizes decision timeliness over guaranteed real-time explanation, accepting a recorded gap as the honest alternative to blocking flight-relevant action.

**Q31. Does AFIP's explanation distinguish facts from guesses?**
**A:** Yes — every advisory flag is tagged with its origin, so an explanation can state plainly whether a contributing factor was a hard deterministic fact or a confidence-scored observation, never blurring the two.
**Why correct:** Required directly by Software Architecture §6 to satisfy Product Spec §5 and §9.11.
**Tradeoff:** This requires disciplined tagging throughout the pipeline — any advisory input that isn't properly tagged at its origin would break this guarantee.

**Q32. Can a human review a rejected proposal after the fact?**
**A:** Yes — every proposal, whether accepted, modified, or rejected, produces a permanent record at the moment it's decided, preserving the full set of considered and rejected alternatives.
**Why correct:** Product Spec §9.13 and Architectural Invariant 6 both require this.
**Tradeoff:** Preserving every rejected alternative, not just the chosen action, increases the volume of the audit record but is what makes the system genuinely auditable rather than only showing its final choice.

**Q33. Is AFIP's explanation the same as a debug log?**
**A:** No — a debug log is typically a raw trace for engineers; AFIP's explanation is specifically designed to be human-understandable, referencing the facts and alternatives that produced a decision in a form an operator can read and question.
**Why correct:** Product Spec §9.10 requires the explanation be human-understandable, not a raw internal trace.
**Tradeoff:** A human-readable explanation necessarily abstracts away some internal detail that a full debug log would retain — the two serve different audiences.

**Q34. How would a judge verify AFIP's explanations aren't just plausible-sounding text generated after the fact?**
**A:** By checking that Layer E has no reasoning capability of its own — architecturally, it renders exactly what Layer D already produced as a justification reference set, and cannot influence or embellish a decision.
**Why correct:** This is Architectural Invariant 6, phrased specifically to make post-hoc rationalization structurally impossible.
**Tradeoff:** Verifying this in practice requires inspecting that Layer E genuinely has no independent reasoning path — a code-level guarantee, not just a design intention, which is why it's called out as an invariant rather than a preference.

**Q35. What does an explanation actually reference — raw sensor values, or higher-level judgments?**
**A:** Higher-level judgments and the specific facts that fed them — the decision structure's evaluation order (staleness check, health/nav threshold, mission achievability) means the explanation can point to exactly which check triggered the proposal.
**Why correct:** Software Architecture §5 ties each proposal branch to a specific triggering condition.
**Tradeoff:** This is clearer for a human than a raw sensor dump, but requires the operator to trust that Layer B's reconciliation into belief was itself accurate.

**Q36. Does AFIP explain rejected operator commands the same way it explains its own proposals?**
**A:** Yes — operator commands are treated as proposed intent subject to the same arbitration and the same explanation standard as any AFIP-originated proposal.
**Why correct:** Product Spec §9.15 and Architectural Invariant 10 require equal treatment.
**Tradeoff:** This can mean an operator receives a rejection with justification, which may be less satisfying in the moment than an unconditional command acceptance — but it's the same fail-closed guarantee that protects AFIP's own proposals.

---

## Section 5 — Risk Assessment (8)

**Q37. How does AFIP assess mission risk?**
**A:** Layer C continuously classifies mission status as on track, at risk, or no longer achievable as planned, cross-referenced against health and navigation judgments, before that classification reaches Decision & Arbitration.
**Why correct:** This is the literal language of Product Spec §9.6.
**Tradeoff:** A three-state classification is simple to reason about and explain, but coarser than a continuous risk score would be.

**Q38. What's the order in which AFIP evaluates risk factors?**
**A:** First, whether belief itself is stale or low-confidence — if so, conservative fallback regardless of anything else. Second, whether health or navigation crosses a degraded/critical threshold. Third, whether mission status is no longer achievable. Only if none apply does AFIP propose continuing.
**Why correct:** This exact order is specified in Software Architecture §5 and is designed so mission concerns can never outrank a health/navigation-critical condition.
**Tradeoff:** This strict ordering is safer but means a genuinely low-risk mission concern can't "jump the queue" ahead of addressing stale data, even if the mission concern feels more urgent to an observer.

**Q39. Can a model-based anomaly detector directly flag a mission as high-risk?**
**A:** It can raise a confidence-scored flag, but only deterministic judgment can turn that flag into an actual risk classification that reaches the decision structure.
**Why correct:** Software Architecture §6, Architectural Invariant 4.
**Tradeoff:** This prevents an unverified model output from single-handedly triggering a mission abort, at the cost of some responsiveness to a genuinely correct anomaly signal.

**Q40. How does battery risk factor into mission-status judgment?**
**A:** BatteryState's margin_percent, predicted_rtl_trigger_time, and safety.status feed Mission Manager's RTL-vs-continue decisions and Layer C's health judgment, which can independently push mission status toward "at risk."
**Why correct:** Documented in BatteryState's consumer relationships and the Mission Manager's read list.
**Tradeoff:** Battery prediction accuracy depends on the consumption model's assumptions, which for this airframe must account for the CFD-identified higher cruise-phase power draw — an accepted source of estimation uncertainty.

**Q41. Does AFIP consider traffic conflicts as a risk factor?**
**A:** Yes — TrafficState's conflict_assessment (cpa_distance_m, cpa_time_s, threat_level) is read by the Navigator for deconfliction and the Safety Monitor for collision avoidance, and can influence mission-status risk classification.
**Why correct:** Directly documented in TrafficState and its consumer list.
**Tradeoff:** Conflict assessment quality depends on cooperative traffic source freshness (ADS-B/UTM at roughly 1 Hz) versus non-cooperative sensor tracks (10–20 Hz) — a slower-updating cooperative track could lag a fast-closing encounter.

**Q42. What's the difference between a "degraded" health status and a mission "at risk" status?**
**A:** Degraded health is a judgment about the aircraft's own condition (HealthState.overall_status). At-risk mission status is a judgment about whether the current mission plan is still achievable — the two are cross-referenced but distinct judgments, deliberately not collapsed into one.
**Why correct:** Product Spec §9.7 requires the three reasoning domains be cross-referenced, not merged into a single output.
**Tradeoff:** Keeping them distinct is more explainable but requires the operator to understand both dimensions rather than a single combined risk number.

**Q43. How conservative is "conservative" — does AFIP always abort at the first sign of risk?**
**A:** No — the decision structure's second and third steps propose a conservative adjustment (reduced envelope, re-route, or hold) appropriate to the triggering condition, not necessarily a full abort. Abort is one possible MissionState status, not the default response.
**Why correct:** Software Architecture §5 explicitly scales the response to which condition triggered it.
**Tradeoff:** This nuance is safer and more useful than a binary go/abort system, but requires more design work to correctly match response severity to each condition.

**Q44. Is there a numeric risk threshold (e.g., a specific battery percentage) that triggers a conservative response?**
**A:** The architecture defines the fields (margin_percent, predicted_rtl_trigger_time, reserve_requirement fields) needed to compute such a threshold, but no specific numeric threshold value is fixed in the current Product Specification or Software Architecture Document.
**Why correct:** This is honest — the fields exist, but tuning them to specific numeric thresholds is an implementation-level decision not yet documented.
**Tradeoff:** Leaving thresholds undefined at this stage keeps the architecture airframe-agnostic, but means a specific number can't be quoted today without inventing one.

---

## Section 6 — Flight Dynamics (8)

**Q45. What type of aircraft is this?**
**A:** A large, real-scale, heavy-lift bi-copter tiltrotor VTOL cargo aircraft — roughly a 2.6-meter fuselage with a 2.8-meter arm span and dual 0.8-meter ducted fans, transitioning between hover and cruise via tilting nacelles.
**Why correct:** These figures are directly from the parametric airframe model and repeated in the Product Specification's Technical Constraints.
**Tradeoff:** This scale means AFIP's reasoning thresholds are tuned for a heavy-lift platform and would need re-validation, not just re-tuning, for a smaller airframe.

**Q46. What are the three documented aerodynamic issues with the current airframe?**
**A:** A positive pitching moment (persistent nose-up force in cruise), negative lift or downforce at cruise speed, and high parasitic drag from the ducted shrouds acting like airbrakes in forward flight.
**Why correct:** These are the three converged CFD findings — C_M +1.36, C_L -2.64, C_D 6.58.
**Tradeoff:** These are real, measured (simulated) characteristics of the current airframe, not hypothetical edge cases — AFIP's reasoning has to treat them as the normal operating condition, which is more conservative than assuming an idealized aircraft.

**Q47. Does AFIP correct for the aircraft's pitch instability?**
**A:** No — that's an explicit non-goal. AFIP does not perform attitude control or compensate for airframe aerodynamics at the control-loop level; that remains entirely the flight controller's job.
**Why correct:** Product Spec §4 states this as a non-goal directly.
**Tradeoff:** This keeps AFIP's scope clean, but means fixing the actual pitch instability requires airframe redesign (e.g., nacelle tilt, fuselage taper) — not a software update to AFIP.
</br>

**Q48. Why does negative lift matter for a VTOL cargo aircraft specifically?**
**A:** Because it means the rotors must work harder, not less, as forward speed increases — the opposite of a conventional wing's behavior — which directly increases power draw exactly where efficiency would normally improve.
**Why correct:** This is the CFD report's stated interpretation of C_L = -2.64.
**Tradeoff:** This is a real efficiency penalty that AFIP's battery/endurance reasoning must account for honestly, rather than assume away.

**Q49. How does AFIP treat the tiltrotor transition phase (0°–90°)?**
**A:** As its own distinct flight phase with its own reasoning thresholds — not interpolated between hover and cruise assumptions — because the Product Specification explicitly identifies transition as a real, less-stable regime, not an edge case.
**Why correct:** Product Spec §10 states this directly.
**Tradeoff:** Treating transition as a first-class flight phase means more design and testing surface area than assuming a smooth blend between hover and cruise behavior.

**Q50. What's the source of the aerodynamic data AFIP's reasoning is built on?**
**A:** A CFD analysis using OpenFOAM's simpleFoam solver at 15 m/s cruise, on an approximately 180,000-cell mesh, converged over 500 iterations.
**Why correct:** Directly stated in the CFD Report's Computational Setup section.
**Tradeoff:** This is a single-speed, steady-state analysis — it doesn't capture unsteady transition aerodynamics or a range of cruise speeds, which is a known limitation (see Section 10).

**Q51. Does a C_D of 6.58 mean this aircraft is unusually draggy compared to conventional aircraft?**
**A:** The coefficient's magnitude is inflated by an estimated (not measured) reference area of 0.05 m², smaller than the true frontal silhouette — but the report states the underlying raw drag force remains accurate even though the dimensionless coefficient scales artificially high.
**Why correct:** This caveat is stated directly in the CFD Report itself.
**Tradeoff:** This means the coefficient shouldn't be quoted in isolation as a cross-aircraft comparison without noting the reference-area caveat.

**Q52. How does the airframe's known aerodynamic penalty affect achievable top speed?**
**A:** The CFD report identifies the ducted shrouds as the dominant limiting factor — they behave like airbrakes at forward-flight speed, so achievable top speed is bounded by shroud drag independent of battery state.
**Why correct:** Stated directly in the CFD Report's "Speed Bottleneck" finding.
**Tradeoff:** No specific numeric top-speed figure is provided in the CFD report — this report will not invent one.

---

## Section 7 — CFD & Aircraft Design (8)

**Q53. What solver was used for the CFD analysis, and why?**
**A:** OpenFOAM's simpleFoam — a steady-state, incompressible solver appropriate for a 15 m/s cruise condition, which is well below compressible flow regimes.
**Why correct:** Directly stated in the CFD Report.
**Tradeoff:** A steady-state solver captures converged cruise behavior well but doesn't model unsteady, transient effects such as gusts or the transition maneuver itself.

**Q54. What mesh resolution was used, and is it sufficient?**
**A:** Approximately 180,000 cells with dual-level surface refinement, converged over 500 iterations. The report presents this as sufficient for extracting force coefficients, but does not include a mesh-independence study.
**Why correct:** Stated directly in the CFD Report's Computational Setup.
**Tradeoff:** Without a documented mesh-independence study, some sensitivity of the coefficients to mesh resolution can't be ruled out — an honest limitation, not a claim of full convergence certainty.

**Q55. What design changes does the CFD report recommend for a future airframe revision?**
**A:** Three specific changes: taper the fuselage tail to a teardrop profile to eliminate the turbulent wake, tilt the ducted-fan nacelles 10–15 degrees forward to reduce flat-surface drag while preserving thrust vectoring, and fillet the duct leading edges to reduce stagnation drag.
**Why correct:** These are the three explicit "Engineering Recommendations for Version 2.0" in the CFD report.
**Tradeoff:** These are airframe engineering changes, explicitly outside AFIP's own scope — AFIP adapts to whatever airframe exists, it doesn't drive airframe redesign.

**Q56. What is the pitching moment's engineering cause?**
**A:** The report attributes it to the combination of the flat fuselage face and forward-facing duct lips creating stagnation-driven lift asymmetry along the fuselage length, producing a nose-up moment in forward flight.
**Why correct:** This follows from the CFD report's surface pressure map findings — stagnation hotspots concentrated at the forward duct lips and flat fuselage face.
**Tradeoff:** The report identifies where the pressure hotspots are, but doesn't provide a full moment-arm breakdown by component — a more detailed structural/aero decomposition would require further analysis.

**Q57. How does the airframe's ducted-fan design help and hurt performance?**
**A:** Ducted fans are effective and safer for static hover thrust, but the CFD report shows they are inherently poor for high-speed forward flight — the same ducts that help in hover act as airbrakes in cruise.
**Why correct:** This dual characterization is explicit in the CFD Report's Executive Summary.
**Tradeoff:** This is a fundamental tradeoff of ducted-fan VTOL design, not something correctable by control software — it's a first-principles airframe choice with known consequences in both flight regimes.

**Q58. What are the fuselage and wing dimensions?**
**A:** Fuselage 2,600 mm long, 750 mm wide, 600 mm tall; arm span 2,800 mm; wing chord 650 mm with a 400 mm dihedral rise; ducted fan outer diameter 800 mm.
**Why correct:** Directly from the parametric OpenSCAD model's defined parameters.
**Tradeoff:** These are the current parametric model's values — any physical prototype could deviate from the CAD parameters during fabrication, which isn't addressed by the model itself.

**Q59. Why does the CFD report note the reference area was "estimated" rather than measured?**
**A:** Because the true frontal silhouette of the airframe wasn't independently measured for this analysis — 0.05 m² was used as a working estimate, which the report itself flags as smaller than the actual frontal area, explaining the inflated drag coefficient.
**Why correct:** This caveat appears directly in the CFD Report under "Important Note on C_D."
**Tradeoff:** This is a transparency strength of the report, but it also means the coefficient values shouldn't be treated as final until a measured reference area is used in a follow-up analysis.

**Q60. Has this airframe been validated in a physical wind tunnel or flight test?**
**A:** No — the analysis described in the available documentation is a computational (CFD) simulation only. No physical wind-tunnel or flight-test data is present in the reviewed material.
**Why correct:** The CFD Report itself is explicitly a computational analysis; no physical test report exists in the uploaded material.
**Tradeoff:** CFD gives useful early design insight at low cost, but carries the inherent uncertainty of any simulation not yet cross-validated against physical measurement.

---

## Section 8 — Software Engineering (8)

**Q61. What prevents a race condition on a shared field in the World Model?**
**A:** The single-writer rule — every object has exactly one authorized writer, enforced by design rather than by runtime locking, plus atomic whole-object swaps so readers never see a partially updated object.
**Why correct:** Directly from the First Principles document and Software Architecture §5 (Critical Architectural Decision 5).
**Tradeoff:** This avoids lock contention entirely, at the cost of requiring every new capability to have an unambiguous single owner decided in advance.

**Q62. How is staleness detected and enforced in code-level terms?**
**A:** Every object carries a valid_until timestamp; subsystems are required to check `now > valid_until` before acting on that object's data, and the architecture treats stale data as worse than no data.
**Why correct:** Directly documented with a pseudocode example in Software Architecture §4 (Temporal Validity and Staleness).
**Tradeoff:** This requires every consumer to actually perform the staleness check — the guarantee is only as strong as consistent enforcement across every subsystem.

**Q63. What's immutable in the World Model, and why?**
**A:** Append-only logs — state history ring buffers, mission logs, completed waypoints, battery/abuse history, health anomaly history, cargo/comm/command logs, traffic encounters, weather history, and operator action logs. These can be shared and transmitted freely without synchronization concerns because they're never modified after being written.
**Why correct:** Enumerated explicitly in Software Architecture §3 (Immutability Boundaries).
**Tradeoff:** Immutable logs simplify concurrency but grow unbounded over time — retention and storage policy for these logs isn't specified at this design stage.

**Q64. How would you unit test a module like the Navigator in isolation?**
**A:** Against a mocked World Model — since every subsystem's contract is a defined set of reads and writes to specific objects, any subsystem can be exercised with synthetic AircraftState, MissionState, EnvironmentState, and so on, without a running simulator.
**Why correct:** "Testability: any subsystem can be tested against a mocked World Model" is listed directly as a design benefit in the First Principles document.
**Tradeoff:** Mocked testing verifies the subsystem's logic in isolation but doesn't validate real integration timing or simulator-specific data quirks — that requires the integration and simulation-level testing described in the V&V Report.

**Q65. Why do failure modes propagate as reduced confidence instead of exceptions or crashes?**
**A:** Because the architecture treats every layer's fault differently by design — evidence gaps mark reduced confidence, belief conflicts reduce confidence, reasoning faults force conservative fallback — so a fault degrades behavior predictably rather than halting the system or triggering undefined behavior.
**Why correct:** This is the full per-layer degradation table from Software Architecture §7.
**Tradeoff:** This is safer for a flight system than a crash-and-restart model, but requires every layer to be explicitly engineered with its own degradation response rather than relying on generic exception handling.

**Q66. What does "fail-closed" mean at the code level for arbitration?**
**A:** If arbitration cannot produce a valid check result — for any reason, including an internal fault — the proposal is treated as rejected by default. There's no code path where an absent result is interpreted as implicit permission.
**Why correct:** Architectural Invariant 3 and Software Architecture §7 state this explicitly.
**Tradeoff:** Fail-closed is safer but means an arbitration bug could cause AFIP to become overly conservative (rejecting everything) rather than overly permissive — an intentional asymmetry.

**Q67. How does the architecture support future extensibility without a redesign?**
**A:** Four defined extensibility points: new evidence categories (as long as they resolve into the existing belief structure), new advisory judgment capability (since it only ever enters as a flag), a different flight-control layer (isolated behind one narrow interface), and additional human/fleet oversight (entering as one more checked source of intent).
**Why correct:** Directly enumerated in Software Architecture §9.
**Tradeoff:** These extensibility points are structurally sound but untested — no extension has actually been implemented and verified yet, per the V&V Report's known limitations.

**Q68. What data format or communication protocol does AFIP use at its interface boundaries?**
**A:** None is specified yet — the Product Specification explicitly reserves protocol, message format, and computing platform decisions for implementation-level engineering, not the current specification documents.
**Why correct:** Product Spec §10 states this directly as out of scope.
**Tradeoff:** This keeps the architecture platform-agnostic for now, but means protocol-level performance questions (bandwidth, latency budgets) genuinely can't be answered yet.

---

## Section 9 — Human Factors (8)

**Q69. Does the human operator have override authority over AFIP?**
**A:** An operator command is treated as a proposed intent, exactly like one AFIP generates itself — it passes through the same independent arbitration, with no privileged bypass channel, even in an emergency.
**Why correct:** Product Spec §9.15 and Architectural Invariant 10.
**Tradeoff:** This means an operator command can be rejected by the same safety check that governs AFIP's own proposals — a deliberate design choice to prevent either party from bypassing the one safety gate.

**Q70. What does AFIP show the operator at all times?**
**A:** Three things: current understanding (belief, with confidence and freshness), current intent (the active proposal and its arbitration outcome), and current reasoning (the specific facts and rejected alternatives behind it).
**Why correct:** This is the operator-facing design intent described in the Operator/User Manual, grounded in Product Spec §9.14.
**Tradeoff:** Surfacing this much reasoning requires the operator interface to present potentially dense information without overwhelming the operator — an interface design challenge not addressed by the current specifications.

**Q71. How does AFIP track operator cognitive workload?**
**A:** OperatorState includes a cognitive_state block — workload_estimate, attention_focus, and alertness_score — but the specification notes this is only populated "if supported by GCS biometrics," meaning it depends on hardware/sensing not guaranteed to exist.
**Why correct:** Directly from OperatorState's documented fields, including the conditional note in the Software Architecture Document.
**Tradeoff:** Without biometric sensing hardware, these fields would remain unpopulated — this is a designed field, not a guaranteed capability.

**Q72. What happens to an alert the operator hasn't acknowledged?**
**A:** It stays in alerts_unacknowledged, and AFIP does not treat an unacknowledged critical alert as handled — silence from the operator is never interpreted as agreement.
**Why correct:** Documented in OperatorState's situational_awareness fields and reinforced in the Operator/User Manual.
**Tradeoff:** This is protective but means a genuinely low-priority alert that the operator simply hasn't gotten to yet is treated with the same "not handled" status as a critical one they may be actively ignoring.

**Q73. Can multiple operators supervise the same aircraft simultaneously?**
**A:** This isn't resolved in the current specifications — it's an explicitly open question in the Software Architecture Document, given the aircraft's heavy-lift cargo context.
**Why correct:** Listed directly as Open Question #2 in the Software Architecture Document.
**Tradeoff:** Answering "yes" prematurely would be inventing a capability; the honest answer is that it's a recognized gap awaiting a design decision.

**Q74. How does an operator's RC stick override interact with AFIP's reasoning?**
**A:** OperatorState.override_state tracks whether RC override is active and in what mode (position/velocity/attitude/rate), updated at 50 Hz when active — but this is still information AFIP reasons about, not a channel that bypasses its arbitration.
**Why correct:** Directly documented in OperatorState's override_state fields and continuous update rate.
**Tradeoff:** Even with manual stick input active, AFIP's proposals and arbitration continue running in parallel — this dual-authority situation requires careful operator understanding of what's actually in control.

**Q75. Why does AFIP log every operator click and command?**
**A:** Because operator_action_log is an immutable, append-only record — the same auditability standard applied to AFIP's own decisions is applied to every human action, supporting after-the-fact review.
**Why correct:** Directly documented as an immutable field in OperatorState.
**Tradeoff:** Comprehensive logging supports accountability and audit but raises data volume and retention questions not addressed at this design stage.

**Q76. How does AFIP avoid overwhelming an operator with information during a crisis?**
**A:** The specifications don't define a specific UI or information-prioritization scheme — the Product Specification explicitly excludes UI design from AFIP's scope, so this remains an open design question for the interface layer, not something AFIP's reasoning core addresses directly.
**Why correct:** Product Spec §4 states UI design is out of scope.
**Tradeoff:** This is an honest gap — a good answer requires interface design work that hasn't happened yet, and this report won't claim otherwise.

---

## Section 10 — Limitations (8)

**Q77. What is AFIP's biggest current limitation?**
**A:** No source code, build, or executable artifact has been verified against the specification yet — every module is currently at the "designed but awaiting implementation" stage, per the V&V Report.
**Why correct:** This is the central finding of the AFIP Verification & Validation Report.
**Tradeoff:** Being honest about this is a credibility strength in front of judges, even though it means no performance claim can be made yet.

**Q78. Is the CFD analysis final?**
**A:** No — it's preliminary: a single-speed, 500-iteration convergence on an estimated (not measured) reference area, without a documented mesh-independence study.
**Why correct:** These caveats are stated directly in the CFD Report and repeated in the V&V Report's Known Limitations.
**Tradeoff:** Preliminary CFD is normal and useful at this design stage, but any claim built on these coefficients should be understood as provisional.

**Q79. Are there unresolved open questions in the specifications themselves?**
**A:** Yes — four in the Product Specification (mission granularity, operator latitude, certification pathway, and timing of airframe-specific reasoning) and two in the Software Architecture Document (flight-phase-specific minimal safe proposal, multi-operator support).
**Why correct:** These are explicitly listed as "Open Questions Requiring Your Input" in both source documents.
**Tradeoff:** Leaving these open keeps the current documents honest about what's decided versus undecided, rather than presenting a false sense of completeness.

**Q80. Does AFIP have a defined sensor suite?**
**A:** No — the Product Specification explicitly states no specific sensor suite, data format, or computing platform is assumed at this stage.
**Why correct:** Directly from Product Spec §10.
**Tradeoff:** This keeps AFIP's design sensor-agnostic, but means any sensor-specific performance question can't be answered until that decision is made.

**Q81. Can AFIP currently compensate for the airframe's aerodynamic issues?**
**A:** No, and it's explicitly designed not to try — compensating for airframe aerodynamics at the control-loop level is a stated non-goal.
**Why correct:** Product Spec §4.
**Tradeoff:** This is a deliberate scope limitation, not an oversight — fixing the aerodynamics is an airframe engineering problem, not a software one.

**Q82. Has AFIP been tested against real telemetry or a live simulator run?**
**A:** No simulator run log or telemetry capture was available for the most recent V&V review — simulation-level validation has not yet occurred based on the material reviewed.
**Why correct:** Stated directly in the V&V Report's Evidence Basis Statement.
**Tradeoff:** This means claims about actual runtime behavior can't be made yet — only design-level conformance has been checked.

**Q83. Do all ten (or more) implementation module names match the architecture documents exactly?**
**A:** Not entirely — three requested implementation module names (Prediction Engine, Risk Engine, Mission Planner) don't have an unambiguous one-to-one match in the current architecture documents and were flagged for clarification in the V&V Report.
**Why correct:** Directly documented in the V&V Report's Module Verification section.
**Tradeoff:** This is a genuine open coordination item between the architecture and implementation tracks, not yet resolved.

**Q84. What's missing before AFIP could be flight-tested?**
**A:** A defined sensor suite and communication protocol, a completed implementation of all five layers, integration and simulation-level test execution, and resolution of the six open questions across both specification documents.
**Why correct:** This synthesizes the V&V Report's Future Validation Plan and Known Limitations sections.
**Tradeoff:** This is a substantial list, but each item is a concrete, named gap rather than a vague "more work needed" — which is itself a strength when presenting to technical judges.

---

## Section 11 — Future Work (8)

**Q85. What's the next concrete step for AFIP?**
**A:** Resolving the open module-naming ambiguity between the architecture documents and the implementation track, then beginning inspection-level closure of the requirements traceability matrix as code is written.
**Why correct:** This is the first two steps of the V&V Report's Future Validation Plan.
**Tradeoff:** This is unglamorous but necessary groundwork before any test result can be trusted.

**Q86. How would AFIP scale to a fleet of aircraft?**
**A:** The Operator Interface Boundary already treats a human operator as one more checked source of proposed intent — extending to fleet-level oversight is expected to enter at that same boundary without changing AFIP's core relationship to any single aircraft.
**Why correct:** Product Spec §12 states this extensibility claim directly.
**Tradeoff:** This is a structural claim about how extension *would* work, not evidence that fleet-level oversight has been built or tested.

**Q87. Could AFIP work with a different flight controller than PX4 or ArduPilot?**
**A:** Yes, by design — AFIP's only awareness of the flight-control layer is confined to one narrow, well-defined interface boundary, specifically so that layer can be swapped without requiring any change elsewhere in AFIP.
**Why correct:** Software Architecture §8 and §9, Extensibility Point 3.
**Tradeoff:** This is an architectural guarantee, not a demonstrated one — no actual flight-controller swap has been tested yet.

**Q88. What happens as the airframe design matures and the aerodynamic issues get fixed?**
**A:** AFIP's reasoning is designed to adapt to whatever the aircraft's real operating characteristics are at the time — a future airframe revision is meant to be an input AFIP adapts to, not an occasion to redesign AFIP itself.
**Why correct:** Product Spec §12 states this directly.
**Tradeoff:** This claim depends on Belief Formation and Situational Reasoning actually remaining airframe-agnostic in implementation — an open question (SEDR-007) not yet resolved.

**Q89. Is there a plan for certification (e.g., defense or commercial BVLOS)?**
**A:** No certification pathway is defined yet — it's an open question in the Product Specification whether an existing or intended certification pathway should shape how conservatively the specification is written.
**Why correct:** Directly listed as Open Question #4 in the Product Specification.
**Tradeoff:** This is honest but means certification-specific claims can't be made — this is a genuine program-level decision still pending.

**Q90. Will AFIP eventually support real sensors instead of the simulator?**
**A:** Yes — the architecture's boundary with the "physical truth" layer is designed to be identical whether that layer is the current simulator or, later, real aircraft sensors, so the transition doesn't require redesigning AFIP.
**Why correct:** Product Spec §11 and §12 both describe this transition as a structural non-event by design.
**Tradeoff:** This is a design intention verified only on paper — no real-sensor integration has been attempted yet.

**Q91. What's the plan for resolving the six open questions across both documents?**
**A:** They remain live program decisions requiring Program Office input — items like the flight-phase-specific minimal safe proposal and multi-operator support directly affect what future test scenarios should even look like, so they're recommended for resolution before further V&V execution.
**Why correct:** This synthesizes the V&V Report's Future Validation Plan, step 8.
**Tradeoff:** Several of these questions can't be answered by engineering analysis alone — they require product/business decisions outside AFIP's technical scope.

**Q92. What would "done" look like for AFIP's V&V process?**
**A:** All modules moved from "designed" to "implemented and validated" or "simulated and validated" with actual test logs and simulator run evidence, all six open questions resolved, and updated performance figures replacing the currently unavailable measured rates.
**Why correct:** This directly follows the V&V Report's own status categories and Future Validation Plan.
**Tradeoff:** This is a substantial bar — reaching it honestly will take real engineering time, which is exactly why the current report doesn't claim to have already cleared it.

---

## Section 12 — Competition Questions (8)

**Q93. Why should this project stand out compared to other autonomy projects at this competition?**
**A:** Most competing projects likely demonstrate flight or perception capability. AFIP demonstrates a different, less commonly attempted engineering discipline: a fully specified, auditable reasoning layer with hard authority boundaries — proposal-only, fail-closed, explainable by construction — built honestly against a real, non-ideal airframe rather than an idealized one.
**Why correct:** This reflects the actual documented scope and honesty of the specification set, not an exaggerated claim.
**Tradeoff:** This is a design and rigor story, not yet a flight-performance story — judges looking specifically for flight demonstration results won't find one here yet.

**Q94. Isn't this just a fancy wrapper around PX4/ArduPilot failsafes?**
**A:** No — PX4/ArduPilot failsafes are threshold-based safety triggers with no cross-domain reasoning and no human-readable explanation. AFIP adds continuous, confidence-scored, cross-domain judgment and a structural explainability guarantee that a conventional autopilot's failsafe logic doesn't provide, while deliberately never taking over what the autopilot already does well.
**Why correct:** This is the exact distinction drawn in the Technical Feature Matrix's comparison table.
**Tradeoff:** This means AFIP genuinely can't do anything without a capable autopilot underneath it — it's additive, not a replacement, and shouldn't be pitched as one.

**Q95. What would you say to a judge who thinks proposal-only authority makes AFIP "less autonomous"?**
**A:** That's the point, not a shortcoming — AFIP's autonomy is in its judgment and explanation, not in unchecked actuator authority. The architecture treats "propose, never command" as the property that makes growing AFIP's sophistication safe over time.
**Why correct:** This directly reflects the stated engineering rationale in the Whitepaper §4.
**Tradeoff:** This is a genuine philosophical tradeoff some judges may disagree with — a fair, honest answer acknowledges it as a deliberate choice rather than arguing there's no cost to it.

**Q96. How is this different from DJI's or Shield AI's autonomy stacks?**
**A:** Both are closed, vertically-integrated systems whose internal reasoning (if any) is not independently auditable outside the vendor. AFIP is designed from the ground up to be explainable and auditable by an outside party, with every decision's justification preserved in a permanent record.
**Why correct:** This is the exact distinction drawn in the Technical Feature Matrix.
**Tradeoff:** This is a comparison of design philosophy and openness, not of flight-proven maturity — DJI and Shield AI have far more operational flight hours behind their systems today.

**Q97. What's the most technically defensible claim you can make about AFIP right now?**
**A:** That its documented architecture is internally consistent — every functional requirement traces to a named design element, and no architectural invariant contradicts another, as confirmed in the V&V Report's design-level review.
**Why correct:** This is exactly what the V&V Report verified and nothing more.
**Tradeoff:** This is a claim about design soundness, explicitly not a claim about implementation correctness or flight performance — an important distinction to hold in front of technical judges.

**Q98. If you had one more month before this competition, what would you prioritize?**
**A:** Resolving the module-naming ambiguity with the implementation track, then executing the Layer A/B unit tests already scoped in the Future Validation Plan, since bring-up order requires those two layers verified before anything above them can be meaningfully tested.
**Why correct:** This follows directly from the V&V Report's Future Validation Plan, steps 1 and 3.
**Tradeoff:** A month isn't enough to close the full plan — this answer prioritizes the highest-leverage, foundational step rather than overpromising full V&V closure.

**Q99. What is AFIP not trying to be?**
**A:** Not a flight controller, not a replacement autopilot, not a UI product, and not a system that claims a specific fleet size, certification pathway, or aircraft type beyond what's currently documented.
**Why correct:** This directly mirrors the Product Specification's Non-Goals (§4) and the Future Roadmap's explicit scope exclusions.
**Tradeoff:** Being this disciplined about scope means AFIP's demo may look narrower than a judge expects from an "autonomy platform" — a fair tradeoff for staying honest about what's actually built.

**Q100. In one sentence, why does AFIP matter?**
**A:** Because an autonomous aircraft that can't explain, in real time and in human terms, why it did what it did — grounded in an honest accounting of its actual condition — isn't ready to be trusted with cargo, people, or airspace, and AFIP is built specifically to close that gap without ever taking the stick.
**Why correct:** This synthesizes the Whitepaper's Conclusion and Product Specification's core identity statement.
**Tradeoff:** This is a values statement about why the problem matters — it's not, by itself, evidence that AFIP has already solved it; the rest of this handbook exists to keep that distinction honest.

---

*AFIP Program Office — Judge Question & Answer Handbook. Every answer above is traceable to the Product Specification, Software Architecture Document, CFD Report, First Principles document, parametric airframe model, or the previously issued V&V Report. No capability, test result, or performance figure not present in that material has been introduced.*
