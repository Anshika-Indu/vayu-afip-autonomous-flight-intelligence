# Autonomous Flight Intelligence Platform (AFIP)
## Technical Handbook

**Document Series:** AFIP Professional Documentation Suite — 5 of 8
**Classification:** Internal / Program Reference
**Purpose:** Quick-reference handbook for engineers working with or around AFIP. Not a substitute for the Product Specification or Software Architecture Document — this is a condensed field reference.

---

## 1. Glossary

| Term | Definition |
|---|---|
| **AFIP** | Autonomous Flight Intelligence Platform — the cognitive reasoning layer described in this handbook |
| **World Model** | The shared, temporally coherent, confidence-scored representation of aircraft, environment, and mission state that all subsystems read from and write to |
| **Belief** | AFIP's reconciled, confidence-scored understanding of what is currently true — never raw evidence |
| **Evidence** | Unreconciled, raw signal as received from the simulator/aircraft, before any interpretation |
| **Proposed intent** | The only form of output AFIP can produce toward the aircraft — a high-level suggestion (e.g., "hold," "divert"), never a control command |
| **Arbitration** | The single independent check every proposed intent must pass before it can take effect |
| **Advisory flag** | A confidence-scored observation from model/statistical judgment; cannot by itself become a decision |
| **Fail-closed** | The rule that an absent or invalid check result is always treated as rejection, never as permission |
| **Valid_until** | The timestamp field on every World Model object marking when it is considered stale |

---

## 2. Layer Quick Reference

| Layer | Reads From | Writes To | Never Does |
|---|---|---|---|
| A — Evidence Intake | Simulator / aircraft | Layer B only | Interpret or fuse anything |
| B — Belief Formation | Layer A | Layer C only | Reason about health/nav/mission directly |
| C — Situational Reasoning | Layer B | Layer D only | Issue a proposal directly |
| D — Decision & Arbitration | Layer C | Flight-control boundary (checked) + Layer E | Skip arbitration for any reason |
| E — Explainability & Record | Layer D's output | Human-facing layer / permanent record | Influence any decision |

---

## 3. World Model Objects — Ownership at a Glance

| Object | Sole Owner | Typical Update Rate |
|---|---|---|
| AircraftState | State Estimator | 100–400 Hz |
| MissionState | Mission Manager | 10 Hz (progress), event-driven (waypoints) |
| EnvironmentState | Mapping/Perception | 1 Hz (weather), 10–20 Hz (obstacles) |
| NavigationState | Navigator | 50–100 Hz |
| BatteryState | Battery Manager | 10 Hz |
| HealthState | Health Monitor | 1 Hz (sensors), 100 Hz (motors) |
| CargoState | Cargo/Payload Manager | 50 Hz (gimbal), 1 Hz (tank) |
| TrafficState | Traffic Monitor | 1 Hz (cooperative), 10–20 Hz (non-cooperative) |
| CommunicationState | Comms Manager | 1–10 Hz |
| WeatherState | Weather Service | 1 Hz (wind), 15 min (forecast poll) |
| OperatorState | Operator Interface / GCS Proxy | 50 Hz (if RC override active) |

**Rule of one writer:** Every object above has exactly one subsystem authorized to write it. Any other subsystem may only read.

---

## 4. The Ten Architectural Invariants (Condensed)

1. No layer above A reasons on raw, unreconciled evidence.
2. No proposed intent reaches the aircraft without arbitration — no exceptions, ever.
3. Arbitration fails closed.
4. Advisory judgment never directly produces a proposal.
5. Belief and intent are never the same structure.
6. Every decision produces its explanation and record at the moment it is made.
7. Loss of confidence, freshness, or integrity always reduces authority.
8. AFIP never duplicates or overrides the simulator's ownership of physical truth.
9. The Safety Monitor is read-only on the World Model.
10. Operator commands are checked exactly like AFIP's own proposals — no privileged bypass.

---

## 5. Airframe Reference Data (Current Configuration)

| Parameter | Value |
|---|---|
| Configuration | Bi-copter tiltrotor VTOL, dual ducted fans |
| Fuselage length / width / height | 2,600 / 750 / 600 mm |
| Arm span | 2,800 mm |
| Ducted fan diameter (outer) | 800 mm |
| Nacelle tilt range | 0° (cruise) – 90° (hover) |
| Cruise C_D / C_L / C_M (15 m/s CFD) | 6.58 / -2.64 / +1.36 |
| Known aerodynamic penalty | High drag, net downforce, persistent nose-up moment in cruise |

---

## 6. Decision Structure — Order of Evaluation (Layer C → D)

Situational Reasoning evaluates in strict order; a later check can never outrank an earlier one:

1. Is any part of the current belief stale or below confidence threshold? → conservative fallback.
2. Does any health or navigation condition cross a degraded/critical threshold? → conservative adjustment (reduced envelope, re-route, hold), matched to which condition triggered it.
3. Does mission status indicate the mission is no longer achievable as planned? → conservative adjustment.
4. None of the above → propose continuation of current mission activity.

---

## 7. Acronyms

| Acronym | Expansion |
|---|---|
| AFIP | Autonomous Flight Intelligence Platform |
| VTOL | Vertical Take-Off and Landing |
| CFD | Computational Fluid Dynamics |
| EKF / INS | Extended Kalman Filter / Inertial Navigation System |
| RTL | Return to Launch |
| BVLOS | Beyond Visual Line of Sight |
| GCS | Ground Control Station |
| ADS-B | Automatic Dependent Surveillance–Broadcast |
| UTM | Unmanned Traffic Management |

---

*AFIP Program Office — Professional Documentation Suite, Document 5 of 8: Technical Handbook*
