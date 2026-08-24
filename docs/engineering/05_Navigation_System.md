# Autonomous Flight Intelligence Platform (AFIP)
## Navigation System — Engineering Design Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Author:** Lead Robotics Navigation Engineer (AFIP)
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, AFIP World State Engine v0.1, AFIP Mission Executive v0.1
**Scope of this document:** The Navigation System only. No code, no aircraft physics, no simulator changes. The flight simulator remains the sole source of physical truth and the sole executor of low-level control (Product Spec §10, §11). This document does not redesign AFIP's cognitive core (WSE, Mission Executive, Arbitration) — it defines the subordinate system that turns an *already-checked* high-level intent into an actual flight path, and that reports back what actually happened as ordinary evidence.

---

## 0. Where the Navigation System Sits

AFIP's own documents already define a "navigation" concern — it is one of the three judgment domains (health, navigation, mission) inside Situational Reasoning / the Mission Executive (Architecture §3.3; Mission Executive §5.1). That domain judges *whether* the aircraft's navigation status is nominal, degraded, or critical. It does not compute a route, a waypoint, or a heading — nothing in the WSE or Mission Executive is permitted to hold or produce those (WSE §1: "the WSE never decides"; Mission Executive §4.3: never a trajectory).

The **Navigation System (NS)** described here is a different, separate system: it is the thing that actually plans and flies the geometry. It sits at the same architectural height as the "Flight Control Layer" referenced in the Architecture document (§0, §2, §8) — outside AFIP's cognitive core, below the Decision & Arbitration boundary, and above the simulator/autopilot's low-level control loop. Concretely:

- **Upstream of NS:** AFIP's Arbitration function. NS consumes only an **Accepted Intent** — a high-level intent (continue / adjust / hold / divert / abort-RTB) that has already passed the single independent check (Architecture P2, Invariant 2). NS has no visibility into, and no path to, AFIP's Proposed (pre-arbitration) intent.
- **Downstream of NS:** the flight simulator's autopilot-equivalent guidance interface. NS issues only guidance setpoints (target position/heading/altitude/speed); it never issues an actuator or control-surface command, and it never alters aircraft physics (Product Spec §4, §10).
- **Feedback path:** NS reports facts — route status, ETA, position confidence, candidate landing sites — back into AFIP the same way any other sensor does: as new Evidence Records entering Layer A, reconciled by the WSE like anything else. NS never writes to a WSE object directly, and never reads the WSE Snapshot directly (that object is Layer C-only, per the WSE's ownership map, WSE §4).

This placement means NS can be built, tested, and changed without touching the Mission Executive, Arbitration, or the WSE, and without AFIP's cognitive core ever needing to know NS's internal planning method.

---

## 1. Purpose

The Navigation System exists to answer one question, continuously and deterministically: **given where the aircraft is now, and given what AFIP has already decided it should be doing, what is the specific geometric and temporal path that gets it there safely?**

It owns "where to fly and how to get there." It does not own "whether to keep going" — that remains AFIP's Mission Executive, checked by Arbitration, exactly as already specified. NS's authority is strictly tactical and geometric, never strategic.

---

## 2. Responsibilities

NS is responsible for:

1. Translating an Accepted Intent (with its associated target — a destination, a hold position, an alternate site, or a base) into a concrete, flyable route.
2. Maintaining that route's validity cycle-to-cycle as the aircraft moves and the environment changes.
3. Detecting obstacles and geofence conditions that threaten the current route, within a bounded look-ahead horizon.
4. Resolving those threats deterministically wherever a safe resolution exists inside the bounds of the current Accepted Intent (a reroute that still reaches the same sanctioned target).
5. Recognizing, and reporting rather than resolving, any situation that would require a *different* intent (a new target, or abandoning the current one) — that judgment belongs to AFIP, not to NS.
6. Continuously maintaining a ranked set of viable emergency landing candidates, independent of whether a landing is currently anticipated.
7. Producing the concrete guidance setpoints the simulator's autopilot needs to actually fly the current route.
8. Reporting route status, ETA, and navigation-relevant facts upward as ordinary evidence, never as a decision.

NS is explicitly **not** responsible for: classifying navigation status as nominal/degraded/critical (Mission Executive's domain judgment), deciding to hold/divert/abort (Mission Executive + Arbitration), aircraft attitude control or motor mixing (the simulator/autopilot), or anything about mission achievability, energy-margin risk, or schedule risk (Mission Executive §5.2, §8).

---

## 3. Inputs

**3.1 From AFIP (the only channel through which strategic authority reaches NS)**
- **Accepted Intent** — the Arbitration-checked high-level intent currently in force (continue / adjust / hold / divert-to-\<candidate\> / abort-RTB-to-\<base\>), plus whatever target and envelope constraints Arbitration attached to it (e.g., a reduced-envelope constraint under a CAUTIOUS posture). NS treats this as the whole of its strategic authority for the current cycle — it does not infer intent from anything else.

**3.2 From the simulator / onboard sensing (the same class of source Evidence Intake also taps — NS runs its own independent perception pipeline; it does not read AFIP's WSE Snapshot)**
- **Current Position, Attitude, Velocity, Nacelle State** — the aircraft's own kinematic/pose picture.
- **Aircraft State (navigation-relevant subset)** — energy trend, propulsion/actuation health, as far as they affect achievable speed, climb rate, or range for planning purposes.
- **Wind / Atmospheric conditions.**
- **Obstacle / traffic returns.**
- **Geofence / operational-area boundary.**
- **Candidate landing-site data** (where available: size, surface, obstruction, currency of the data itself).
- **Destination and waypoint structure implied by the current Mission Definition**, as far as it is exposed to NS through the Accepted Intent's target (NS does not read Mission Definition directly out of the WSE; it only ever knows the destination that AFIP's checked intent names).

**3.3 What is explicitly not an input**
- The WSE Snapshot, any individual Belief Field, or the Reconciliation Record (Layer C/WSE-internal objects; WSE §4).
- AFIP's pre-arbitration Proposed Intent.
- Operator commands directly — an operator's intent reaches NS only after it has been folded into an Accepted Intent through the same Operator Interface Boundary and Arbitration check as any other proposal (Architecture §3.6, P10).

---

## 4. Outputs

**4.1 Downward, to the simulator's guidance interface (never to actuators or control surfaces):**
- **Desired Route** — the full ordered sequence of waypoints/legs currently planned to the Accepted Intent's target.
- **Next Waypoint** — the immediate guidance target for this cycle.
- **Desired Heading / Desired Speed / Desired Altitude** — the setpoints derived from Next Waypoint and current position, handed to the simulator's autopilot-equivalent guidance layer for low-level execution.

**4.2 Upward, into AFIP's Evidence Intake (as facts, not decisions — reconciled by the WSE like any other evidence source):**
- **Route Status** — nominal / deviating / locally-replanning / blocked-rerouting / unreachable. A statement of tactical fact, never a proposal.
- **Estimated Time of Arrival (ETA)** and remaining distance/energy-to-target.
- **Position/route confidence** (e.g., degraded during GPS loss) — feeds the same freshness/confidence discipline every other Belief Field observes (WSE §3.2).
- **Ranked candidate landing sites** and their current suitability facts — material for Mission Executive's own divert/abort reasoning, never a recommendation NS is authorized to act on unilaterally.

**4.3 What NS never outputs**
- A proposed intent of any kind (continue/hold/divert/abort). NS has no proposal authority; that channel belongs exclusively to the Mission Executive (Mission Executive §4).
- A direct actuator or control-surface command (Product Spec §4, non-negotiable regardless of urgency).
- A unilateral change of destination. If NS determines the current target is unreachable, it reports that fact upward; it does not substitute a different target on its own authority.

---

## 5. Internal Modules

| Module | Responsibility |
|---|---|
| **Route Planner** | Computes the Desired Route from current position to the Accepted Intent's target over the current obstacle/geofence picture, using deterministic search (Section 7). |
| **Waypoint Manager** | Tracks progress along the Desired Route, advances the Next Waypoint, computes cross-track/along-track deviation, and generates the setpoints handed to the simulator each cycle. |
| **Obstacle Detection** | Monitors the look-ahead segment of the current route each cycle against obstacle/traffic and geofence data; classifies an intrusion as known (already accounted for in the last plan) or unknown (newly detected). Purely deterministic geometric/threshold checks — no learned classifiers. |
| **Obstacle Avoidance** | Generates a bounded, local, deterministic maneuver (a standoff offset or a short detour insertion) when an unknown intrusion is detected inside the look-ahead horizon and a local fix is geometrically sufficient. |
| **Dynamic Rerouting** | Invoked when a local avoidance maneuver is not sufficient, or when the route is found blocked outright. Reruns Route Planner over the updated obstacle/geofence picture, still targeting the same Accepted Intent destination. If no feasible path exists, reports Route Status = unreachable rather than picking a new destination itself. |
| **Landing Zone Finder** | Continuously maintains a ranked list of candidate emergency/landing sites against fixed criteria (Section 9), refreshed as candidate-site data updates, independent of whether a landing is currently intended. |
| **ETA Calculator** | Deterministically computes ETA and remaining-energy-to-target from remaining route geometry, current groundspeed/wind, and the airframe's known forward-flight performance characteristics (Section 7). |

Each module can fail or degrade independently without silently corrupting another's output (mirroring Architecture P8) — for example, a stale candidate-site feed degrades only the Landing Zone Finder's confidence, never the Route Planner's.

---

## 6. Data Flow

```
Simulator / Sensors ─────────────┐
                                  ▼
                        NS Perception (independent
                        of AFIP's WSE; own position,
                        obstacle, wind, geofence,
                        candidate-site picture)
                                  │
Accepted Intent (from  ──────────┤
AFIP Arbitration)                │
                                  ▼
                          Route Planner
                                  │
                                  ▼
                          Waypoint Manager ──► Desired Route,
                                  │             Next Waypoint,
                                  │             Desired Heading/
                                  │             Speed/Altitude
                                  │                   │
                    Obstacle Detection                ▼
                          │        (each cycle)   Simulator's
                          ▼                       Guidance/Autopilot
                  Obstacle Avoidance                  Interface
                          │  (if insufficient)
                          ▼
                  Dynamic Rerouting ──► (loops back into Route Planner,
                          │              or reports Route Status = unreachable)
                          ▼
                  Route Status, ETA, position confidence,
                  ranked candidate sites
                          │
                          ▼
              AFIP Evidence Intake (Layer A) ──► WSE reconciliation
              (NS is one more evidence source,   (next AFIP cycle)
               tagged with source + time, like
               any sensor)
```

Two rules govern this flow, mirroring the discipline already established for AFIP itself:

1. **Strategic authority only ever enters NS through one channel** — the Accepted Intent. NS's own detection/avoidance/rerouting logic never overrides or reinterprets that intent; it only ever finds a way to satisfy it, or reports that it cannot.
2. **Facts only ever leave NS through one channel upward** — ordinary evidence into Layer A. NS has no side-channel into Mission Executive, Arbitration, or the WSE's internal objects. This keeps NS's own more sophisticated internals (planning heuristics, local-avoidance logic) free to evolve without ever changing what AFIP's cognitive core is or how it decides.

---

## 7. Route Planning Logic

Routes are computed over a graph/grid representation of navigable airspace: nodes represent reachable positions (or lattice cells at a resolution appropriate to a heavy-lift, minivan-scaled airframe — not a consumer-drone resolution), edges represent feasible transitions, and each edge carries a deterministic cost.

- **Primary algorithm: A\*.** Used for the global Desired Route from current position to the Accepted Intent's target. A* is the right default here because it is complete, optimal under an admissible heuristic, deterministic, and fully explainable after the fact — every edge and every cost term in a chosen route can be cited, which matters for a system built to eventually withstand certification-level scrutiny (Product Spec §6.7).
- **Refinement: Theta\* (any-angle search) over the same graph**, applied when a smoother, less lattice-jagged path materially reduces the number of heading changes on the route. This matters specifically for this airframe: given its known positive pitching moment and high drag in forward flight (Product Spec §2.2), every unnecessary heading change costs more energy and stability margin than it would on a conventional airframe. Theta* is used as a refinement pass on top of A*'s result, not a replacement for it — it never changes which nodes are reachable, only how directly the route moves between them.
- **Fallback: Dijkstra**, used in two cases: (a) when no reliable heuristic exists for a given region (e.g., an irregular, densely obstructed area where a distance-to-goal estimate would not be admissible), and (b) for the Landing Zone Finder's multi-target case, where a single-source shortest-path computation to *several* candidate sites simultaneously is a more natural fit than repeated single-target A* runs.

**Cost function terms** (all deterministic, all explainable):
- Path distance.
- Altitude change (climbs/descents cost more than level flight).
- Headwind exposure per leg — penalized more heavily than for a conventional airframe, consistent with the airframe's known high-drag characteristic (Product Spec §2.2, §10). This is a cost weighting, not a correction of the airframe's behavior — NS reasons about the aircraft's real performance envelope, it does not compensate for the underlying aerodynamic issue itself (Product Spec §4 non-goal).
- Obstacle clearance margin (a soft cost near the minimum standoff distance; not a hard block until the standoff itself is violated).
- Geofence compliance — a **hard constraint**, not a cost term. Nodes/edges outside the operational area are simply excluded from the graph, never merely penalized.

No AI or neural-network component participates in route planning. Every edge cost and every accept/reject decision in the search is a fixed, inspectable rule.

---

## 8. Obstacle Handling

**Representation.** Obstacles are represented as geometric exclusion (or cost-penalty) regions in the same spatial graph the Route Planner already uses:
- **Static/known obstacles** (terrain, structures, permanent no-fly areas) are incorporated into the graph before a route is ever computed, so the Route Planner avoids them by construction.
- **Dynamic obstacles** (traffic, moving objects) are represented as a bounded exclusion volume around the last known position, inflated by the obstacle's own position uncertainty and its closing speed relative to the aircraft — a wider margin for a fast-closing, poorly-tracked contact than for a slow, well-tracked one. This inflation is a fixed, deterministic function of the tracked confidence and closing rate, not a learned estimate.

**Classification.** Each cycle, Obstacle Detection checks the look-ahead segment of the current route against this picture:
- **Known and already planned around** → no action; the existing route already avoids it.
- **Newly detected within the look-ahead horizon** → escalates to Obstacle Avoidance.

**Resolution order:**
1. **Local avoidance first.** If a bounded, local, deterministic maneuver (a standoff offset or a short detour waypoint) clears the intrusion while remaining on course toward the same target, Obstacle Avoidance applies it directly — no full replan is needed for a single, geometrically simple intrusion.
2. **Dynamic rerouting if local avoidance is insufficient**, or if multiple intrusions/a persistent obstruction make a local fix impossible. Route Planner is rerun over the updated picture, still targeting the same Accepted Intent destination.
3. **Escalation if no feasible path exists.** If Dynamic Rerouting cannot find any path to the current target that respects geofence and minimum clearance, NS does not choose a different destination on its own authority. It reports **Route Status = unreachable** upward as a fact. This is exactly the trigger the Mission Executive's own achievability judgment (Mission Executive §8.1) already exists to consume — NS supplies the fact; the Mission Executive supplies the judgment about what to do next.

---

## 9. Landing Site Selection

The Landing Zone Finder maintains a continuously refreshed, ranked list of candidate emergency/landing sites, independent of whether a landing is currently anticipated — so that a ranked answer is already available the moment AFIP's Mission Executive needs one, rather than being computed from scratch under time pressure.

**Fixed, explainable evaluation criteria** (deterministic scoring, not a learned model):
- **Clear-area sufficiency** — available clear dimensions versus the aircraft's footprint plus a fixed safety margin.
- **Obstruction/slope clearance** at and immediately around the site.
- **Reachability cost** — distance/energy required to reach the site from current position, computed using the same cost function as Route Planner (Section 7), so a nearer-but-more-exposed site and a farther-but-cleaner site are compared on a consistent basis.
- **Wind alignment at the site** relative to the airframe's known handling characteristics.
- **Currency/confidence of the site data itself** — a site whose supporting data has gone stale is down-ranked or excluded, never treated as if it were current (mirroring the WSE's own never-hold-stale-as-current rule, WSE §1, §5.4).
- **Hard exclusions** — anything inside a no-fly/geofenced area, or below a minimum data-confidence floor, is removed from consideration entirely rather than merely down-scored.

**Output discipline.** The ranked list (and the current best default) is made available as evidence/material to AFIP — it is explicitly *not* a recommendation NS is authorized to act on by itself. The decision to divert to a candidate site remains the Mission Executive's, checked by Arbitration, exactly as already specified (Mission Executive §4.1). NS's role ends at "here is what is currently viable, and why."

---

## 10. Failure Handling

| Condition | NS Behavior |
|---|---|
| **GPS / position loss** | Position confidence degrades according to a fixed freshness rule; NS falls back to deterministic dead-reckoning (integrating last known velocity/heading) with visibly decaying confidence — it never treats a stale position as current. If confidence falls below NS's own usable floor, NS holds the last commanded track/altitude rather than attempting new maneuvers, and reports "navigation degraded" upward. NS does not decide to hold/divert/abort on its own — that call remains the Mission Executive's, informed by this fact on its next cycle. |
| **Communication loss (Accepted Intent channel from AFIP)** | NS never invents a new strategic intent. It continues executing the last Accepted Intent's route to its already-sanctioned target (or holds at the current waypoint, if the intent was already "hold"). It reports the comm loss as a fact; it does not autonomously decide to divert or abort, since that authority was never NS's to begin with — this mirrors the Product Specification's rule that there is no faster, less-checked "emergency" path (Product Spec §4, §9.9; Mission Executive §6). |
| **Blocked route** | Handled per Section 8's resolution order: local avoidance → dynamic reroute → escalate as "unreachable" if no path exists. NS never substitutes a new destination itself. |
| **Unknown obstacle** | Handled per Section 8: classified, then resolved by local avoidance or reroute; if resolution would itself violate geofence or minimum clearance, it is treated identically to a blocked route. |
| **NS internal fault (a module cannot complete a planning cycle)** | NS holds the last known-good Desired Route and setpoints rather than commanding an unvalidated new one, and reports the fault as a Route Status condition — consistent with the same "reduce authority, never compensate more aggressively" principle already governing every other layer of AFIP (Architecture P7, §7). |

In every case, NS's own failure response is to **narrow what it will do on its own authority and report the gap honestly** — never to make a strategic call that belongs to the Mission Executive, and never to present a degraded picture as if it were still fully trustworthy.

---

## 11. Interfaces

**11.1 With the Mission Executive.** NS consumes only the Accepted Intent — the output of Arbitration, never the Mission Executive's pre-arbitration proposal (Section 0, Section 3.1). NS never returns a decision to the Mission Executive; everything it reports (route status, ETA, candidate sites) re-enters AFIP as ordinary evidence on a future reasoning cycle, through the same channel any sensor would use — never as a privileged or out-of-band input (consistent with Mission Executive §3.3's rule on what is, and is not, a legitimate input).

**11.2 With the World State (WSE).** NS neither reads the WSE Snapshot nor writes to any WSE object directly. The Snapshot remains Layer C-only (WSE §4, Ownership Map); NS's facts enter through Evidence Intake, tagged with source and time, and are reconciled into Belief Fields by the WSE using the same confidence/freshness discipline applied to every other evidence source (WSE §3.2, §5.3). This preserves the WSE's single-writer rule without exception.

**11.3 With the Simulator.** NS treats the simulator exactly as AFIP does: the sole source of physical truth, never to be second-guessed or duplicated. NS's only outbound channel to the simulator is a guidance setpoint interface (target waypoint/heading/speed/altitude); it has no path to an actuator or control-surface command, and no path that bypasses whatever autopilot layer (today, the simulator's internal control loop; eventually, a PX4/ArduPilot-class autopilot) performs low-level stabilization (Product Spec §4, §10; Architecture §8).

---

## 12. Future Scalability

- **Terrain maps.** Terrain is simply a richer static-obstacle input to the same graph representation Route Planner already uses (Section 8) — incorporating a real terrain model changes what populates the graph, not the planning structure itself.
- **Live weather.** The wind/atmospheric term in the cost function (Section 7) already exists as a first-class input; a live weather feed replaces a simpler estimate with a richer one without changing how the cost function uses it.
- **Geofencing.** Already a first-class hard constraint (Section 7, Section 9). Dynamic or temporary geofences (e.g., a newly declared restricted area) can be added by updating the excluded-region set the Route Planner already consults, with no structural change.
- **Real PX4/ArduPilot integration.** NS's downward interface is already expressed at guidance-setpoint level (target position/heading/speed/altitude) rather than at the actuator level — the same level a real PX4-class autopilot's mission/offboard interface expects. Replacing the simulator's control loop with a real autopilot changes only what NS's setpoint interface is bound to, not NS's internal structure, mirroring the extensibility point already reserved for the flight-control boundary in the Architecture document (Architecture §9, Extensibility Point 3).

---

## Open Items Carried Forward

1. The exact look-ahead horizon for Obstacle Detection, and the exact minimum standoff/clearance margins, are airframe- and mission-specific tuning values not yet established by the source material and are left for a follow-on specification.
2. Whether NS should maintain its own independent perception pipeline entirely separate from Evidence Intake's, or share sensor tap points with it while keeping reconciliation logic separate, is an implementation choice this document intentionally leaves open — either satisfies the architectural boundary (NS never reads the WSE Snapshot) equally well.
3. Consistent with the Mission Executive's own open item on airframe-specific aerodynamic sensitivity (Mission Executive, Open Items #3), the exact weighting of headwind/drag penalties in NS's cost function should be revisited once the airframe's CFD data matures.
