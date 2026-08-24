# VAYU — Intelligent Mission Autonomy for Autonomous Aerial Logistics

**A heavy-lift autonomous tiltrotor cargo drone, built by Team VAYU for the NST Vanguards "Build in Public" program.**

Conventional logistics infrastructure is saturated, and today's multirotor drones don't have the range or payload capacity to help — they spend an entire flight hovering, which is extremely power-intensive. VAYU's answer is a heavy-lift tiltrotor airframe that transitions from hover into forward cruise (letting the body itself generate lift instead of the motors), paired with an AI decision-making layer — **AFIP** — that plans missions, monitors aircraft health, adapts to changing conditions, and explains every autonomous decision in real time.

**Target specs:** 20 kg payload · 30–40 km range · +30% hover thrust (ducts down) · 64% lower cruise power (ducts forward)

## Team VAYU

| Member | Role |
|---|---|
| Ayush Kumar Mahato | Researcher & Coordinator |
| **Anshika Indu** | **Lead Engineer, AI Pilot (AFIP)** |
| Vedish Bansal | Lead Simulation Engineer |
| Abhijay Anoopkumar Pillai | AI Engineer |
| Dhairya Dev Singh | CFD Engineer |
| Armaan Saxena | Simulation Developer |
| Tvesha | Marketing Manager |

## My role: AFIP — the AI Pilot

I led the design of **AFIP (Autonomous Flight Intelligence Platform)** — VAYU's cognitive reasoning layer. AFIP does not fly the aircraft; it sits above the flight controller and simulator, builds a continuous confidence-scored understanding of the aircraft's state, reasons about health/navigation/mission status, proposes what the aircraft should do next, and explains every decision it makes in real time. Everything under `docs/engineering/` and `docs/program-overview/` in this repo is my work on that architecture — 24+ technical documents across 12 iterative versions, covering:

- A strict five-layer pipeline (Evidence Intake → World State Engine → Situational Reasoning → Decision & Arbitration → Explainability & Record), where evidence, belief, and intent are never the same structure.
- Ten architectural invariants — including fail-closed arbitration (a proposal with no valid safety check is always rejected, never permitted, even in emergencies) and a strict deterministic/probabilistic boundary (ML judgment can only ever raise a flag, never itself decide).
- A full systems-engineering suite: interface control document, state machine spec, sequence diagrams, failure-mode matrix, data dictionary, and a formal requirements traceability matrix tracing every requirement to a design element and a verification method.
- Reasoning grounded in real airframe physics (CFD-derived drag/lift/pitching-moment coefficients for VAYU's actual ducted-fan tiltrotor), not an idealized aircraft.
- A telemetry dashboard concept (`src/flight-intelligence-dashboard.zip`) — live map, 3D drone telemetry, LiDAR/world-model view, operator CLI console.

## What's in this repo

- **`docs/team/`** — the team pitch deck (problem statement, aircraft concept, specs, engineering workflow).
- **`docs/engineering/`** — the rigorous AFIP specification set: Product Specification, Software Architecture, World State Engine, Mission Executive, Navigation System, Health Monitoring System, Explainability Engine, the full SE-001–014 systems-engineering suite, a 100-question judge Q&A handbook, and a verification & validation report.
- **`docs/program-overview/`** — a reader-friendly AFIP documentation suite: whitepaper, system design report, engineering analysis, decision records, technical handbook, deployment guide, operator manual, and future roadmap.
- **`docs/reference/`** — early AFIP design exploration and the industry-autonomy-stack research (Tesla, Waymo, Skydio, Shield AI, Anduril, Zipline) that informed the architecture.
- **`src/`** — the telemetry dashboard prototype and an early implementation pass on AFIP's core logic.

## Status

VAYU is a design-stage systems engineering program from an intensive team build week: the aircraft concept, specs, and AFIP's architecture, interfaces, state machines, and failure modes are fully specified; a UI/telemetry dashboard prototype exists; hardware integration and flight testing are next.

---

*Built during the NST Vanguards "Build in Public" program. This repository focuses on AFIP, the AI Pilot module I led within Team VAYU.*
