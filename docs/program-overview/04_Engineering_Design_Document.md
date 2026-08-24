# Autonomous Flight Intelligence Platform (AFIP)
## Engineering Design Document

**Document Series:** AFIP Professional Documentation Suite — 3 of 8
**Classification:** Internal / Program Reference
**Derived From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, Airframe CFD Report, Airframe Parametric Model
**Status:** Design-stage engineering analysis

---

## 1. Purpose

This document records the engineering analysis behind AFIP's reasoning design — specifically, how the actual, measured behavior of the airframe (not an idealized one) shapes what AFIP's health and navigation reasoning must account for. It is an engineering analysis document, not an architecture specification; it does not redefine layers, modules, or data ownership, all of which are recorded in the Software Architecture Document.

---

## 2. Airframe Configuration Under Analysis

The current airframe is a dual-rotor (bi-copter) tiltrotor VTOL cargo configuration, parametrically modeled at the following scale:

| Parameter | Value |
|---|---|
| Fuselage length | 2,600 mm |
| Fuselage width | 750 mm |
| Fuselage height | 600 mm |
| Arm span (wingtip to wingtip) | 2,800 mm |
| Wing chord | 650 mm |
| Wing dihedral | 400 mm rise |
| Ducted fan outer diameter | 800 mm |
| Ducted fan inner diameter | 720 mm |
| Nacelle tilt range | 0° (cruise) – 90° (hover) |

This is a heavy-lift, real-scale airframe — every reasoning threshold, timing assumption, and failure-mode response designed into AFIP is scaled to an aircraft of this class, not a small consumer multirotor.

---

## 3. Aerodynamic Analysis (CFD-Derived)

### 3.1 Test Configuration

CFD analysis was performed using OpenFOAM's `simpleFoam` steady-state incompressible solver, at a 15 m/s (54 km/h) forward-flight inlet velocity, on a ~180,000-cell hexahedral mesh with dual-level surface refinement. The simulation converged over 500 iterations.

### 3.2 Converged Force Coefficients

| Coefficient | Value | Note |
|---|---|---|
| Drag coefficient (C_D) | 6.58 | High in absolute terms; the report attributes the magnitude partly to an estimated reference area (0.05 m²) smaller than the true frontal silhouette — the underlying raw drag force remains valid |
| Lift coefficient (C_L) | -2.64 | Airframe produces net downforce in cruise, not lift |
| Pitching moment (C_M) | +1.36 | Persistent nose-up moment in forward flight |

### 3.3 Engineering Interpretation

- **Pitch instability:** The positive pitching moment means aerodynamic forces continuously push the nose up during cruise. This requires continuous corrective control effort, which AFIP's health/energy reasoning must treat as an ongoing power draw, not a transient.
- **Negative lift (downforce):** As forward speed increases, the airframe is pushed toward the ground rather than lifted. Rotors must work harder — not less — as cruise speed increases, directly increasing power consumption at exactly the flight regime where efficiency would normally be expected to improve.
- **High parasitic drag:** The ducted shrouds function as airbrakes at forward-flight speed due to stagnation at the forward duct lips and flat fuselage face, and a turbulent separation wake at the untapered fuselage tail. This bounds top speed and constrains achievable range independent of battery state.

### 3.4 Engineering Recommendations on Record (Airframe Team, Not AFIP Scope)

The CFD report identifies three airframe-level mitigations for a future revision: tapering the fuselage tail to a teardrop profile to eliminate wake separation, tilting the ducted-fan nacelles 10–15° forward to reduce flat-surface drag while preserving thrust vectoring, and filleting the duct leading edges to reduce stagnation drag. **These are airframe engineering changes and are explicitly out of AFIP's scope** — AFIP does not correct, compensate for, or mask aerodynamic behavior at the control-loop level (Product Spec §4). They are recorded here only because AFIP's reasoning must be re-validated, not redesigned, if and when the airframe changes.

---

## 4. Design Consequence: How CFD Findings Constrain AFIP's Reasoning

| CFD Finding | Consequence for AFIP Design |
|---|---|
| High cruise-phase power draw (downforce + drag) | Health/energy reasoning must not assume cruise is the low-power flight phase; endurance and range judgments must be built against the aircraft's actual, higher power draw in forward flight |
| Persistent pitch-correction load | Any anomaly-detection judgment concerning control effort or actuator load must treat sustained nose-up correction in cruise as expected behavior for this airframe, not as an anomaly in itself |
| Distinct, less-stable transition regime (tilt 0°–90°) | Transition is treated as its own flight phase in health and navigation reasoning, with its own thresholds — not interpolated between hover and cruise assumptions |
| Airframe-specific, not idealized, performance envelope | Belief Formation and Situational Reasoning are designed to remain airframe-agnostic in structure, so that a future airframe revision is an input AFIP adapts to, not a redesign of AFIP itself (Product Spec §12) |

---

## 5. Open Engineering Question

The Software Architecture Document (Open Questions, item 3) leaves unresolved whether an explicit extensibility point for airframe-specific aerodynamic reasoning should be reserved now, or whether Belief Formation and Situational Reasoning should remain fully airframe-agnostic until the airframe design matures further. This document does not resolve that question — it is recorded here as a live engineering decision pending airframe maturity, and is carried forward into the Systems Engineering Decision Record (Document 4).

---

*AFIP Program Office — Professional Documentation Suite, Document 3 of 8: Engineering Design Document*
