# AFIP — Technical Feature Matrix
### Document 2 of 8 — Competitive Positioning

---

## The One Distinction That Matters

Every system in this comparison sits at a **different layer of the autonomy stack**. AFIP is not competing to fly the aircraft better — it is the only system in this table whose entire job is understanding, reasoning, and explaining, sitting strictly above the flight controller rather than replacing it.

```
 ┌─────────────────────────────────────────────┐
 │   COGNITIVE LAYER  — understands, reasons,   │
 │   decides (proposes), explains               │   ← AFIP lives here
 ├─────────────────────────────────────────────┤
 │   AUTONOMY / MISSION LAYER — waypoints,      │
 │   obstacle avoidance, fleet coordination     │   ← DJI Autonomy, Hivemind
 ├─────────────────────────────────────────────┤
 │   FLIGHT CONTROL LAYER — attitude control,   │
 │   stabilization, motor mixing, failsafes     │   ← PX4, ArduPilot
 └─────────────────────────────────────────────┘
```

---

## Feature Matrix

| Capability | **AFIP** | PX4 | ArduPilot | DJI Autonomy | Shield AI Hivemind |
|---|---|---|---|---|---|
| Attitude control / stabilization | ❌ Not in scope | ✅ Core function | ✅ Core function | ✅ Core function | ✅ Via onboard autopilot |
| Actuator / motor commands | ❌ Never issues these | ✅ | ✅ | ✅ | ✅ |
| Confidence-scored world understanding | ✅ Core function | ⚠️ Limited (EKF only) | ⚠️ Limited (EKF only) | ⚠️ Partial (perception stack) | ✅ Partial (mission autonomy) |
| Cross-domain reasoning (health × nav × mission) | ✅ Core function | ❌ | ❌ | ⚠️ Siloed subsystems | ⚠️ Partial, not exposed |
| Independent decision arbitration (fail-closed) | ✅ Architectural invariant | ⚠️ Basic failsafe thresholds | ⚠️ Basic failsafe thresholds | ⚠️ Vendor-defined, opaque | ⚠️ Internal, not externally auditable |
| Human-readable decision explanations | ✅ Produced at decision time, every time | ❌ | ❌ | ❌ | ⚠️ Limited, post-mission only |
| Deterministic / probabilistic reasoning separation | ✅ Architectural invariant | ❌ N/A | ❌ N/A | ❌ Not disclosed | ⚠️ Not disclosed |
| Conservative degradation under uncertainty | ✅ Explicit design rule | ⚠️ RTL/failsafe only | ⚠️ RTL/failsafe only | ⚠️ Vendor-controlled | ✅ (claimed, not open) |
| Auditable decision record | ✅ Every proposal permanently logged | ⚠️ Flight logs only | ⚠️ Flight logs only | ⚠️ Limited telemetry | ⚠️ Proprietary |
| Airframe-agnostic by design | ✅ Explicit extensibility point | ❌ Tuned per airframe | ❌ Tuned per airframe | ❌ DJI hardware only | ❌ Proprietary hardware |
| Open architecture / auditable by outside party | ✅ | ✅ Open source | ✅ Open source | ❌ Closed | ❌ Closed / defense-restricted |
| Operator command privilege | Checked — no bypass | Elevated / trusted | Elevated / trusted | Elevated / trusted | Elevated / trusted |

**Legend:** ✅ full capability · ⚠️ partial, implicit, or vendor-opaque · ❌ out of scope or not present

---

## Who Owns What — AFIP vs. the Flight Controller

| | **AFIP** | **Flight Controller (PX4 / ArduPilot-class)** |
|---|---|---|
| Physical truth | Consumes it, never redefines it | **Owns it** |
| Attitude & stabilization | Not in scope | **Owns it** |
| Low-level failsafes | Not in scope | **Owns it** |
| Mission-level judgment | **Owns it** | Not in scope |
| Health / navigation reasoning | **Owns it** | Basic thresholds only |
| Decision explanation | **Owns it** | Not in scope |
| Final authority to act | **Never** — proposes only | **Always** — sole actuator authority |

---

## Why This Comparison Is Deliberately Unfair to AFIP

PX4 and ArduPilot are mature, flight-proven, safety-critical control systems with over a decade of hardening — they are not trying to do what AFIP does, and AFIP could not exist without a control layer like them underneath it. DJI Autonomy and Shield AI Hivemind are closed, vertically-integrated systems whose reasoning (if any) is invisible outside the vendor. **AFIP is not a competitor to any of these — it is the missing, auditable reasoning layer that could sit above any of them.**

---

*AFIP Program Office — Internal Engineering Document Series, Document 2 of 8*
