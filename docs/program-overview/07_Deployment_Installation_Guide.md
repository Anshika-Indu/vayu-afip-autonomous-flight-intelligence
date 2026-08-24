# Autonomous Flight Intelligence Platform (AFIP)
## Deployment & Installation Guide

**Document Series:** AFIP Professional Documentation Suite — 6 of 8
**Classification:** Internal / Program Reference
**Scope Note:** This guide covers deployment at the level currently defined by the Product Specification and Software Architecture Document — system prerequisites, integration boundaries, and bring-up sequencing. Specific protocols, message formats, and installation tooling are implementation detail explicitly reserved for other engineering tracks (Product Spec §10) and are not defined here.

---

## 1. Prerequisites

Before AFIP can be brought online in any environment (simulated or, eventually, real), the following must already exist and be operating independently:

| Prerequisite | Why It Is Required |
|---|---|
| A functioning flight simulator (or, later, real aircraft + sensors) exposing telemetry | AFIP is a downstream observer with no ability to synthesize physical state on its own |
| A flight-control layer (PX4/ArduPilot-class) already capable of independent stabilization and low-level failsafe behavior | AFIP's proposed intent is meaningless without a control layer capable of receiving and independently arbitrating it |
| A defined interface boundary beneath Layer A (Evidence Intake) | AFIP performs no interpretation at intake — it requires evidence already tagged with source and time |
| A defined interface boundary beneath Layer D (Decision & Arbitration) | This is the only path by which AFIP may influence the aircraft; it must exist and be independently checked before AFIP is enabled |

AFIP must never be brought online against a simulator or flight-control layer that cannot independently guarantee physical safety without AFIP's involvement — this is a direct consequence of AFIP's subordinate, proposal-only design (Product Spec §4, §11).

---

## 2. Deployment Topology

AFIP occupies a fixed position in the system topology and does not vary by deployment environment:

```
 Human Operator / GCS  ← reads AFIP's belief, intent, and reasoning
        ▲
        │ (checked, no privilege)
 ┌──────────────────────────────┐
 │   AFIP (five internal layers) │
 └──────────────────────────────┘
        │ evidence in ▲   checked intent out ▼
 Flight Simulator  /  Flight-Control Layer
 (physical truth)     (physical control)
```

This topology is identical whether AFIP is deployed against the simulator (current stage) or, eventually, a real aircraft — the boundary contract does not change, only what sits beneath it.

---

## 3. Bring-Up Sequence

AFIP's internal layers have a strict dependency order, and bring-up must respect it — a layer must not be brought online before the layer it depends on is verified operating correctly:

1. **Verify the Evidence Intake boundary** is receiving tagged, timestamped evidence from the simulator before enabling any layer above it.
2. **Bring up Belief Formation** and confirm it is producing confidence-scored belief (not passing raw evidence through) before enabling Situational Reasoning.
3. **Bring up Situational Reasoning** and confirm health, navigation, and mission judgments are each independently observable before enabling Decision & Arbitration.
4. **Bring up Decision & Arbitration** in a mode where proposals are logged but not yet passed to the flight-control boundary, to confirm arbitration behavior (including fail-closed behavior) before granting AFIP any live influence.
5. **Enable the checked path to the flight-control boundary** only after arbitration has been confirmed to fail closed under simulated fault conditions.
6. **Bring up Explainability & Record** last, and confirm every proposal in step 4–5 has a corresponding explanation and permanent record before considering AFIP fully deployed.

This sequence directly enforces the no-skip rule between layers (Software Architecture §2) during commissioning, not only during runtime.

---

## 4. Pre-Enablement Verification Checklist

Before AFIP is granted a live (non-logging-only) path to the flight-control boundary, the following must be confirmed:

- [ ] Every World Model object has exactly one verified writer (no dual-writer condition observed).
- [ ] Staleness (`valid_until`) is being enforced — a deliberately stale test input results in reduced confidence, not silent reuse of the last known value.
- [ ] A deliberately faulted arbitration cycle results in the proposal being rejected, not passed through.
- [ ] A deliberately induced low-confidence belief state results in a conservative fallback proposal, not a continuation of the prior action.
- [ ] An operator-issued command is observed passing through the same arbitration path as an AFIP-originated proposal, with no privileged shortcut.
- [ ] Every proposal generated during verification has a corresponding, simultaneously-produced explanation in the permanent record.

---

## 5. What This Guide Does Not Cover

Consistent with the Product Specification's stated scope (§10), this guide does not define: the specific data protocol or message format used at either interface boundary, the specific computing platform or software framework AFIP runs on, or any sensor-suite-specific configuration. Those are implementation decisions for the engineering tracks building the Evidence Intake and Decision & Arbitration boundary interfaces, and will be documented separately as they are finalized.

---

*AFIP Program Office — Professional Documentation Suite, Document 6 of 8: Deployment & Installation Guide*
