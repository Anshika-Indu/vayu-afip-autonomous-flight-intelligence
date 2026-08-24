# Autonomous Flight Intelligence Platform (AFIP)
## World State Engine — Architecture Document

**Document Type:** Internal Engineering Design Document
**Status:** Draft v0.1
**Author:** Lead Robotics Software Engineer (AFIP)
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1
**Scope of this document:** Architecture only. No code, no algorithms, no data schemas, no message formats, no UI. Every object, ownership rule, and frequency described below traces back to a specific requirement, principle, or invariant in the two source documents.

---

## 0. What the World State Engine Is

The World State Engine (WSE) is the concrete architectural realization of **Layer B — Belief Formation** from the Software Architecture document. It sits directly above Evidence Intake (Layer A) and directly below Situational Reasoning (Layer C), and it is the *only* place in AFIP where raw evidence is converted into something that is allowed to be called "understanding."

Its charter, in one line: **the WSE is the single authoritative owner of what AFIP currently believes to be true — never of what AFIP is doing about it, and never of what is physically true.** What is physically true remains owned by the flight simulator (Product Spec §10, §11; Architecture §8, P9). What AFIP is doing about its beliefs is owned by Layer D and is architecturally forbidden from being stored anywhere near the WSE (Architecture P4).

Everything in this document exists to make three things true simultaneously, at all times:

- Nothing above the WSE ever reasons on raw, unreconciled evidence (Architecture Invariant 1).
- Every belief the WSE holds carries its own confidence and its own age, and neither can be silently dropped (Architecture P3, P7; Product Spec §9.1, §9.2).
- The WSE is read-only from below and read-only *to* everything above it — it is written by exactly one thing, in exactly one direction (Architecture §2, "no-skip rule").

---

## 1. Design Mandate (What This Layer Is Not Allowed to Do)

Before describing objects, the constraints that shape every one of them:

- **The WSE never judges.** Classifying something as nominal, degraded, or critical is Layer C's job (Architecture §3.3). The WSE may hold a fact showing the aircraft's battery is at 9%, but it does not decide that this is "critical" — it only makes that fact available, confidently and freshly, to the layer whose job it is to judge it.
- **The WSE never decides.** It has no concept of intent, proposal, hold, divert, or abort. Those words do not appear in any WSE object (Architecture P4, Invariant 5).
- **The WSE never talks to the flight-control boundary.** It has no awareness that a flight-control layer exists. Its only external relationships are upward (to Layer C) and, in a read-only, non-influencing capacity, into the permanent record (Layer E) (Architecture §8, §3.5).
- **The WSE never reinterprets the simulator.** It reconciles *how confident it is* in what the simulator and other sources report; it never second-guesses *what physical value* the simulator reports as truth (Architecture P9, Invariant 8).
- **The WSE never silently ages out data.** A fact that stops being updated does not disappear and does not freeze as if still current — it degrades in place, visibly, in confidence (Architecture §7, row B; P7).

---

## 2. The Core Architectural Device: The Snapshot

Evidence arrives asynchronously, at different rates, from different sources, and sometimes in conflict. If Layer C were allowed to read individual belief fields as they update, it could observe AFIP's own understanding mid-update — internally inconsistent in a way no single moment in the real world ever was (e.g., a position updated for time T but a velocity still reflecting time T-1).

The WSE therefore does not expose "live" fields. It exposes a **World State Snapshot**: a single, complete, internally consistent, versioned object, published atomically. Layer C only ever reads a whole snapshot, never a field in isolation. A new snapshot fully replaces the prior one; there is no partial-write state that is ever visible outside the WSE.

This snapshot model is the WSE's implementation of Architecture P3 and the "no-skip rule": it is *structurally impossible* for Situational Reasoning to see a half-reconciled world.

---

## 3. Object Catalog

Each object below is described by what it represents, what it is composed of, and — critically — what it is *not*: the judgment or intent it must never be allowed to carry.

### 3.1 Evidence Record — *(boundary input; not owned by the WSE)*

**What it is:** The unit of information the WSE receives from Evidence Intake (Layer A). Each Evidence Record carries a raw signal, its source, and the time it was captured — nothing else.
**Why it matters to the WSE's design even though the WSE doesn't own it:** every downstream object's confidence and freshness attributes are ultimately derived from properties of the Evidence Records that fed them (how many sources agreed, how recently they arrived, whether they conflicted). The WSE is a *consumer* of Evidence Records, never their custodian — it does not retain them as its own state (Architecture §3.1, §3.2: "Nothing above Layer B is permitted to read Layer A directly," and Layer A "performs no interpretation").

### 3.2 Belief Field — *(the atomic unit of everything the WSE owns)*

**What it is:** The smallest unit of "understanding" in AFIP. Every individual fact the WSE holds — an altitude, a battery level, a wind estimate, a waypoint-progress figure — is expressed as a Belief Field, and every Belief Field is inseparably composed of four things:

| Component | What it represents |
|---|---|
| **Value** | The current reconciled best understanding of the fact |
| **Confidence** | How much the WSE trusts that value right now (never a bare fact — Architecture P3, Product Spec §6.5) |
| **Freshness (age)** | How long ago this value was last supported by evidence — tracked independently of confidence, because a value can be old and still agreed-upon, or recent and still contested |
| **Provenance** | Which evidence source(s) contributed to this value, so that Layer E can later explain *why* AFIP believed it (Architecture §3.5, P6) |

**What it is never allowed to be:** a bare number. Nothing in AFIP is permitted to read a Belief Field's value without also being able to see its confidence and freshness (Product Spec §6.5, §9.2). This is the single most load-bearing rule in the WSE's design — every higher-level object in this catalog is, structurally, just a named collection of Belief Fields.

### 3.3 Aircraft State

**What it represents:** The WSE's reconciled understanding of the aircraft itself — everything the flight simulator and onboard telemetry expose about the vehicle's own condition.
**Composed of the following sub-groupings of Belief Fields:**

- **Kinematic / Pose belief** — position, attitude, velocity, and the tilt-rotor nacelle angle (the aircraft's transition state between hover and cruise). This is the highest-scrutiny part of Aircraft State because it is what "navigation status" in Layer C is built from.
- **Propulsion & Actuation belief** — the reconciled condition of the rotors/ducted fans and the tilt actuators. The WSE does not decide whether a reading constitutes a fault; it holds the reconciled reading and its confidence, and lets Layer C's deterministic judgment decide.
- **Power / Energy belief** — remaining energy and current consumption trend. Given the Product Specification's explicit acknowledgment that this airframe consumes energy faster than an idealized VTOL (Product Spec §2.2, §10), this belief exists specifically so that Situational Reasoning always has an honest, current energy picture to reason against — the WSE holds the fact; it does not editorialize about what the fact means for endurance.
- **Payload belief** — attachment/securement status and payload mass, since payload state is part of "what is currently true about the aircraft" independent of mission progress (which is a separate object, §3.5).
- **Subsystem / Telemetry Health belief** — the reconciled status of the aircraft's own sensors and internal communication links. This exists so that a degraded sensor can itself become a fact the WSE holds — including a fact about the WSE's own inputs being untrustworthy, which is what allows Layer C to reason about *AFIP's* confidence, not just the aircraft's condition.

**Ownership boundary:** Aircraft State is entirely sourced from the flight simulator (and, later, aircraft sensors) via Evidence Intake. The WSE reconciles it; it does not originate any part of it independently.

### 3.4 Environment State

**What it represents:** The WSE's reconciled understanding of the world the aircraft is operating in, as distinct from the aircraft itself.
**Composed of:**

- **Atmospheric / weather belief** — wind and other conditions relevant to a vehicle whose forward-flight behavior is already known to be sensitive to drag and pitch (Product Spec §2.2). Again: the WSE holds the observed conditions; it is Layer C's job, not the WSE's, to reason about what those conditions mean for this particular airframe.
- **Obstacle / traffic belief** — anything sharing the operating volume with the aircraft.
- **Operational area / geofence belief** — the reconciled understanding of where the aircraft is currently permitted to be.
- **Candidate site belief** — reconciled facts about landing points and alternates (e.g., availability, suitability signals), held as fact only — the WSE does not select or recommend a diversion target; that is a Layer C/D judgment.

**Ownership boundary:** Sourced from whatever environmental sensing and off-board data feeds Evidence Intake exposes. Like Aircraft State, the WSE reconciles rather than originates this data.

### 3.5 Mission State

**What it represents:** The WSE's reconciled understanding of the mission currently assigned to the aircraft and how it is progressing. This object is architecturally split into two parts with different volatility and different ownership character:

- **Mission Definition belief** — what the mission *is* (e.g., the objective the aircraft was assigned to accomplish and by when). This is comparatively static once assigned: it changes only when a new mission or re-tasking instruction is accepted, not on every reasoning cycle. It is still represented as Belief Fields, not as a bare configuration value, because a mission assignment itself arrives as evidence (from an operator or mission-planning source) and is subject to the same confidence/freshness discipline as any other fact — this is what allows a stale or unconfirmed mission assignment to be treated honestly rather than assumed valid forever.
- **Mission Progress belief** — how far along the mission is, and how much margin exists against it, continuously re-derived from Aircraft State (position, energy) as those update. Mission Progress is *computed by* the WSE, not asserted by any single evidence source — it is the clearest example of the WSE's reconciliation role producing an understanding that no single upstream input directly stated.

**Ownership boundary:** Mission Definition originates outside AFIP (an operator or mission-planning function) and enters as evidence like any other input. Mission Progress is derived state, owned entirely by the WSE, and exists nowhere upstream of it.

### 3.6 World State Snapshot

**What it represents:** The aggregate, versioned, publish-once object described in Section 2 — the *only* thing the WSE ever exposes upward. It is composed of exactly one current instance each of Aircraft State, Environment State, and Mission State, plus a snapshot-level version marker and timestamp that lets Layer C (and, downstream, Layer E) refer unambiguously to "the world as AFIP understood it at this specific reasoning cycle."
**What it is not:** a log, a history, or a queryable database. The Snapshot is deliberately the *present tense only* — the WSE keeps no accessible notion of "what did I believe five minutes ago" available to Layer C, because Layer C's job is to reason about now, conservatively, not to relitigate the past (that capability belongs to §3.7, and it is walled off from Layer C entirely).

### 3.7 Reconciliation Record — *(feeds Layer E only)*

**What it represents:** An append-only account of how each published Snapshot came to hold the values it held — which Evidence Records were reconciled, where they agreed or conflicted, and how confidence and freshness were arrived at for each Belief Field. This is what makes Product Spec §9.13 ("every fact AFIP believed... preserved in a form that can be reviewed after the fact") true at the belief-formation level, not just at the decision level.
**Critical ownership rule:** this object flows in exactly one direction — out of the WSE, into the permanent record owned by Layer E. It is never read back by the WSE itself, by Layer C, or by Layer D. This mirrors the Architecture document's rule that Layer E "owns nothing that feeds back into belief, reasoning, or decision-making" (Architecture §3.5) — the WSE's own history is not permitted to influence the WSE's own future reconciliation, which is what prevents AFIP's belief formation from ever being biased by what it previously believed.

---

## 4. Ownership Map

A single-writer rule governs every object above. This table states, for each object, the one thing permitted to write it and everything permitted to read it.

| Object | Sole Writer | Permitted Readers |
|---|---|---|
| Evidence Record | Evidence Intake (Layer A) | World State Engine only |
| Belief Field | World State Engine | Nothing directly — only ever read as part of a Snapshot |
| Aircraft State | World State Engine | World State Engine (internally, to compose the Snapshot) |
| Environment State | World State Engine | World State Engine (internally) |
| Mission State | World State Engine | World State Engine (internally) |
| World State Snapshot | World State Engine | Situational Reasoning (Layer C) — read-only |
| Reconciliation Record | World State Engine | Explainability & Record (Layer E) — read-only, one-way |

No object in this table has more than one writer, and no object is ever written by anything above the WSE. This is the belief-formation-layer expression of Architecture Invariant 1 ("no layer above Layer A ever reasons on raw, unreconciled evidence") and Invariant 5 ("belief and intent are never the same structure") — Layer C, D, and E have no write path back into any WSE object, which is what makes it structurally impossible for a decision, an explanation, or an operator command to retroactively shape what AFIP believed.

---

## 5. Update Frequency and Cadence

The WSE separates two concepts that are easy to conflate: **how often a Belief Field's underlying evidence can change**, and **how often the WSE publishes a Snapshot**. They are governed independently.

**5.1 Reconciliation cadence (internal to the WSE).** Evidence Records arrive asynchronously and at whatever rate their source produces them. The WSE reconciles continuously as evidence arrives, but it does not expose a Snapshot on every individual reconciliation — doing so would let Layer C observe partially-updated state (Section 2). Instead, the WSE publishes complete Snapshots on a bounded, regular cycle, so that Layer C always reasons against a whole, self-consistent picture rather than a stream of individually-updating fields.

**5.2 Per-object volatility.** Not every part of the world changes at the same rate, and the WSE's design reflects that rather than forcing one cadence on everything:

- **Kinematic/Pose belief** is the fastest-moving part of Aircraft State — it is refreshed essentially continuously between Snapshots, because navigation judgment in Layer C depends on it being as current as possible.
- **Propulsion/Actuation and Power/Energy belief** update at a high but slightly lower rate than pose, consistent with how quickly those quantities can meaningfully change.
- **Payload and Subsystem Health belief** change comparatively rarely — mostly at discrete events (attach/detach, a sensor going offline) rather than continuously — and are updated when new evidence arrives rather than resampled on a fixed clock.
- **Environment belief** (weather, obstacles, geofence, candidate sites) changes more slowly than the aircraft's own kinematic state and is refreshed at a correspondingly lower rate, except where a specific evidence source (e.g., an obstacle sensor) demands faster attention.
- **Mission Definition belief** changes only on new evidence — a new or amended mission assignment — and is not resampled on any clock at all.
- **Mission Progress belief** is recomputed every time Aircraft State changes in a way relevant to it (primarily position and energy), so it is always consistent with the Snapshot it belongs to rather than lagging behind it.

**5.3 Freshness thresholds are a separate design axis from update rate.** Each Belief Field type carries its own freshness threshold — the point past which the WSE marks it reduced-confidence rather than current — set according to how quickly that specific fact can become physically wrong if unrefreshed (Architecture §7, row A/B; P7). A kinematic belief becomes stale in a very short window; a geofence belief tolerates a much longer one. This is a property of *each Belief Field's design*, not a single global timeout, and it is what allows the WSE to degrade different parts of its own understanding at different rates rather than treating all staleness as equivalent.

**5.4 What never happens.** No Belief Field is ever held at its last known value past its freshness threshold without its confidence being reduced. There is no code path in the WSE's design that treats "no new evidence" as "nothing has changed" (Architecture §7, row A).

---

## 6. Relationships Between Objects

- **Composition, not merging.** Aircraft State, Environment State, and Mission State are each composed of Belief Fields, and the Snapshot is composed of the three of them — but none of these objects ever collapse into one another. A Power/Energy belief and a Mission Progress belief may be computed from related evidence, but they remain separate Belief Fields with independent confidence and freshness, because conflating them would hide *which* fact was actually uncertain (Architecture P3, "raw signals are never reasoned over directly" — extended here to mean *reconciled beliefs are never blended into a single value that hides their separate provenance*).
- **Mission Progress depends on Aircraft State, but does not own it.** This is the WSE's clearest cross-object relationship: Mission Progress belief is derived from Kinematic and Power/Energy belief within the same Snapshot. This dependency is one-directional and internal to the WSE's reconciliation step — it happens *before* the Snapshot is published, not as a live reference Layer C would have to resolve itself. Layer C receives the already-derived Mission Progress belief; it never has to reach into Aircraft State to compute it.
- **Environment State informs, but never edits, Aircraft or Mission State.** A wind belief does not change what the WSE believes the aircraft's energy state is — the WSE holds both facts independently and lets Layer C reason about their relationship (e.g., "given this wind and this energy trend, is the mission still achievable"). This preserves the boundary described in the Product Specification: the WSE reasons about *what is true*, never about *what it means* (Product Spec §6.5 vs. §9.6–§9.7, which are explicitly Layer C's responsibility).
- **The Snapshot is the only object with a relationship to Layer C.** No sub-object (Aircraft State, Environment State, Mission State) is ever exposed individually. This guarantees the no-skip rule holds structurally: Layer C cannot selectively read "just the energy belief" mid-cycle and reason on a fragment (Architecture §2, §4).
- **The Reconciliation Record has a relationship to every other object, but only as an observer.** It references which Evidence Records and which reconciliation choices produced each field in a Snapshot, but nothing in the WSE ever reads the Reconciliation Record back into a future reconciliation (Section 3.7).
- **Evidence Records have no relationship to anything above the WSE.** They are consumed and reconciled into Belief Fields, then their individual identity ends — Layer C, D, and E never see a raw Evidence Record, only what it contributed to (Architecture §3.1, §4 flow rule 1).

---

## 7. Failure and Degradation Behavior Specific to the WSE

Extending Architecture §7 (row B — Belief Formation) to the object level defined here:

| Situation | WSE behavior |
|---|---|
| A source of evidence for a given Belief Field stops arriving | That field's confidence decays according to its freshness threshold (§5.3); its value is retained but flagged reduced-confidence, never silently held as if still fully trusted |
| Two evidence sources disagree on the same fact | The resulting Belief Field's confidence reflects the disagreement; the WSE does not silently average, silently prefer one source, or hide the conflict — the conflict itself becomes part of what the Reconciliation Record preserves |
| Evidence is insufficient to reconcile a field at all | The field is marked unknown/low-confidence rather than omitted — Situational Reasoning must be able to see that a fact is missing, not just fail to find it |
| The reconciliation process itself cannot complete a cycle | No Snapshot is published for that cycle rather than publishing a partially-reconciled one; Layer C continues reasoning against the last valid Snapshot, whose age (and therefore reduced trustworthiness) is visible to it |

The governing rule carried over from the Architecture document applies without exception at this layer too: uncertainty in the WSE always shows up as *reduced confidence made visible*, never as a gap papered over or a best guess presented as fact (Architecture §7 summary rule; Product Spec §6.2).

---

## 8. Boundary Contracts

- **Downward boundary (with Evidence Intake / Layer A):** the WSE consumes Evidence Records and nothing else from below. It has no visibility into, and no dependency on, how Layer A acquired that evidence (sensor type, protocol, or source system) — consistent with the Product Specification's statement that no specific sensor suite or data format is assumed (Product Spec §10).
- **Upward boundary (with Situational Reasoning / Layer C):** the WSE exposes exactly one thing — the current World State Snapshot — and accepts nothing back. There is no path for Layer C to write, correct, or annotate a belief; if Layer C's reasoning implies a fact might be wrong, that implication can only ever show up as new evidence entering through Layer A on a future cycle, never as a direct edit to the WSE's state.
- **Record boundary (with Layer E):** the WSE emits the Reconciliation Record outward and never reads anything back from Layer E, preserving the one-way, non-influencing relationship required by Architecture §3.5.
- **No boundary exists to Layer D or beyond.** The WSE has no relationship — direct or indirect — with the Decision & Arbitration layer or the flight-control boundary. It does not know a proposal, an arbitration outcome, or an actuator exists. This absence is itself a deliberate architectural feature, not an omission: it is what makes it structurally impossible for AFIP's belief about the world to ever be shaped by what AFIP wants to do about it (Architecture P4, Product Spec §6.6).

---

## 9. Open Items Carried Forward

These are WSE-specific refinements of the open questions already logged in the Product Specification and Software Architecture documents, not new scope:

1. Whether Environment belief should reserve an explicit sub-grouping now for the airframe's known aerodynamic sensitivities (drag, pitch behavior) so Layer C has a ready-made place to reason about them, or whether Environment State should stay airframe-agnostic until the Product Specification's open question on this point (§2.2, §7.4) is resolved.
2. Whether Mission Definition belief needs to represent multi-stop/re-taskable missions now or only a single-destination structure, pending resolution of the Product Specification's open question on what a "mission" concretely is (§7.4, Open Question 2).
3. Whether more than one simultaneous Mission Definition source (e.g., multiple ground operators) needs to be reconcilable by the WSE, pending resolution of the Architecture document's open question on multi-operator support (Architecture, Open Question 2).
