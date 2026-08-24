# AFIP — Autonomous Flight Intelligence Platform
### System Overview
**Document 1 of 8 — Executive Summary** | AFIP Program Office | Draft v0.2

---

## What AFIP Is

AFIP is the **cognitive layer** of a heavy-lift, autonomous, bi-copter tiltrotor VTOL cargo aircraft. It does not fly the aircraft. It watches the aircraft and the world around it, builds a continuous, confidence-scored understanding of what is currently true, reasons about the aircraft's health, navigation, and mission status, proposes what the aircraft should do next, and explains every proposal in real time — not after the fact.

AFIP sits **above** the flight simulator (today) and the flight controller (ultimately a PX4/ArduPilot-class autopilot), and **below** the human operator. It never issues actuator commands, never overrides the flight-control layer, and never acts unilaterally. Every decision AFIP proposes passes through an independent check before it can take effect — including in emergencies.

> **One-line identity:** *AFIP is the part of the aircraft that understands what is happening and can tell you why it did what it did — nothing more, and nothing less.*

---

## The Problem AFIP Solves

Modern autonomous airframes generate an enormous stream of raw telemetry — position, attitude, tilt-rotor angle, battery state, payload state, sensor data. None of that, by itself, is *understanding*. Today, nothing interprets that stream in mission context, judges aircraft health, decides what should happen next, or explains that decision to a human in a form they can audit. AFIP closes that gap — without duplicating the flight simulator's ownership of physical truth or the autopilot's ownership of physical control.

This is not a hypothetical concern for this airframe. Preliminary CFD analysis of the current dual-rotor ducted airframe shows a **positive pitching moment**, **negative lift (downforce)** at cruise speed, and **high parasitic drag** from the ducted shrouds in forward flight — meaning the aircraft is measurably harder to fly efficiently than an idealized VTOL. AFIP is built to reason honestly about *that* aircraft, not an idealized one — without ever attempting to compensate for airframe aerodynamics at the control-loop level.

---

## Core Architectural Relationship

**AFIP proposes. An independent layer disposes.** Authority only ever flows downward through one narrow, checked gate — the same relationship a human mission commander has with an aircraft's flight controls: informed, deliberate, accountable for reasoning, never holding the stick.

| | Owns | Never Does |
|---|---|---|
| **Flight Simulator / Airframe** | Physical truth, aircraft physics | Reason about mission or health |
| **Flight Controller (PX4/ArduPilot-class)** | Attitude control, stabilization, low-level failsafes | Understand mission context |
| **AFIP** | Understanding, judgment, proposed intent, explanation | Issue actuator commands, act unilaterally |
| **Human Operator** | Command authority, oversight | Bypass the independent check |

---

## What Makes AFIP Different

- **Evidence → Belief → Decision are architecturally separate.** Raw signals are never reasoned over directly; everything downstream reasons over reconciled, confidence-scored belief.
- **Deterministic judgment gates probabilistic judgment.** Model-based/statistical reasoning can only ever raise a flag — never generate a decision on its own.
- **Degrade conservatively, always.** Loss of confidence, staleness, or internal fault reduces AFIP's own authority — it never triggers more aggressive autonomous action.
- **Explainability is a byproduct of deciding, not a report written afterward.** Every proposal carries its justification the instant it's made.
- **Fail-closed arbitration.** Absence of a valid safety check is treated as rejection, never as permission.

---

## Where AFIP Stands Today

AFIP is defined at the product and software-architecture level: five internal layers (Evidence Intake → Belief Formation → Situational Reasoning → Decision & Arbitration → Explainability & Record), ten architectural invariants, and a fully specified information contract with the World Model shared-state layer beneath it. Implementation of these layers is in progress on parallel engineering tracks; this document set describes the system as designed.

---

*AFIP Program Office — Internal Engineering Document Series, Document 1 of 8*
