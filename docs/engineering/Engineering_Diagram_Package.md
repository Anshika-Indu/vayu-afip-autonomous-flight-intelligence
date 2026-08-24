# Autonomous Flight Intelligence Platform (AFIP)
## Engineering Diagram Package

**Classification:** Internal / Program Reference
**Notation:** Mermaid (primary), ASCII (where structural/layered notation is clearer)
**Derived Strictly From:** AFIP Product Specification v0.2, AFIP Software Architecture v0.1, First Principles: Information-Centric Architecture
**Scope Note:** Every node, object, enum value, and subsystem name below is taken verbatim from the uploaded specifications. No module, interface, or capability is introduced that is not already named in source material.

---

## 1. Overall AFIP Architecture

ASCII — layered structure per Software Architecture §2:

```
┌───────────────────────────────────────────────────────────┐
│  Layer E — Explainability & Record                         │
│  (renders explanation + permanent record; never feeds back  │
│   into a decision)                                          │
├───────────────────────────────────────────────────────────┤
│  Layer D — Decision & Arbitration                            │
│  (proposes intent; independently checks intent before        │
│   it may proceed; fail-closed)                                │
├───────────────────────────────────────────────────────────┤
│  Layer C — Situational Reasoning                              │
│  (health / navigation / mission judgment, cross-domain        │
│   reasoning)                                                  │
├───────────────────────────────────────────────────────────┤
│  Layer B — Belief Formation                                   │
│  (reconciles evidence into confidence-scored understanding)   │
├───────────────────────────────────────────────────────────┤
│  Layer A — Evidence Intake                                    │
│  (receives whatever simulator/aircraft exposes; no             │
│   interpretation)                                              │
└───────────────────────────────────────────────────────────┘
        ▲ evidence flows up            authority flows down ▼
┌───────────────────────────────────────────────────────────┐
│  Flight Simulator (source of physical truth) — outside AFIP  │
│  Flight Control Layer (PX4/ArduPilot-class) — outside AFIP    │
└───────────────────────────────────────────────────────────┘
```

Mermaid equivalent:

```mermaid
flowchart TB
    subgraph AFIP["AFIP — Cognitive Layer"]
        direction TB
        E["Layer E: Explainability and Record"]
        D["Layer D: Decision and Arbitration"]
        C["Layer C: Situational Reasoning"]
        B["Layer B: Belief Formation"]
        A["Layer A: Evidence Intake"]
        A --> B --> C --> D --> E
    end
    OP["Human Operator / GCS Proxy"]
    SIM["Flight Simulator (physical truth)"]
    FC["Flight Control Layer (PX4/ArduPilot-class)"]

    SIM -- "evidence" --> A
    D -- "checked proposed intent" --> FC
    FC -- "actuator authority (outside AFIP)" --> SIM
    OP <-- "belief, intent, explanation" --> E
    OP -- "operator command as proposed intent" --> D
```

**No-skip rule (Software Architecture §2):** a layer exchanges information only with the layer immediately adjacent to it. Layer D never acts on Layer A's raw evidence; Layer B never issues anything to the flight-control boundary.

---

## 2. Data Flow Diagram

```mermaid
flowchart LR
    SIM["Flight Simulator / Aircraft Sensors"] -->|"raw signals"| A["Layer A: Evidence Intake\n(tag source + time, no interpretation)"]
    A -->|"tagged evidence"| B["Layer B: Belief Formation\n(reconciled, confidence-scored belief)"]
    B -->|"belief"| C["Layer C: Situational Reasoning\n(health / navigation / mission)"]
    C -->|"domain judgments"| D["Layer D: Decision and Arbitration\n(propose + arbitrate)"]
    D -->|"checked proposed intent"| FC["Flight Control Layer\n(PX4/ArduPilot-class)"]
    FC -->|"actuator commands"| AC["Aircraft"]
    D -->|"decision + justification reference set"| E["Layer E: Explainability and Record"]
    E -->|"explanation, permanent record"| OP["Human Operator"]
```

This traces directly to Product Spec §6.5 ("nothing is understood until raw signals have been reconciled") and the evidence/belief/decision separation that Software Architecture §0 establishes as never permitted to collapse into one structure.

---

## 3. Event Flow Diagram

Event-driven triggers, per subsystem, as documented in the Software Architecture's Information Flow Topology:

```mermaid
flowchart TD
    subgraph Mission["Mission Manager"]
        E1["waypoint arrival"]
        E2["mission completion"]
        E3["diversion trigger"]
        E4["abort"]
    end
    subgraph Nav["Navigator"]
        E5["geofence breach"]
        E6["path convergence/divergence"]
        E7["glide range critical"]
    end
    subgraph Batt["Battery Manager"]
        E8["status change to DEGRADED/CRITICAL"]
        E9["RTL trigger prediction crossed"]
        E10["cell imbalance detected"]
    end
    subgraph Health["Health Monitor"]
        E11["any status change"]
        E12["anomaly detection"]
        E13["predicted failure horizon crossed"]
    end
    subgraph Traffic["Traffic Monitor"]
        E14["new traffic detection"]
        E15["CPA threshold crossed"]
        E16["resolution advisory issued"]
    end
    subgraph Comms["Comms Manager"]
        E17["link lost/regained"]
        E18["operator heartbeat timeout"]
        E19["encryption failure"]
    end
    subgraph Weather["Weather Service"]
        E20["hazard alert issued"]
        E21["wind shear alert"]
    end

    Mission --> WM["World Model"]
    Nav --> WM
    Batt --> WM
    Health --> WM
    Traffic --> WM
    Comms --> WM
    Weather --> WM
    WM --> C["Layer C: Situational Reasoning"]
```

Continuous (non-event-driven) channels documented alongside these events: AircraftState pose/velocity at 100–400 Hz, BatteryState voltage/current/SoC at 10 Hz, WeatherState wind at 1 Hz, MissionState progress at 10 Hz, TrafficState cooperative tracks at 1 Hz / non-cooperative at 10–20 Hz.

---

## 4. Module Dependency Graph

Per the Information Flow Topology tables (Software Architecture, "Information Flow Topology" section):

```mermaid
flowchart LR
    SE["State Estimator"] -->|"owns/writes"| AS["AircraftState"]
    MM["Mission Manager"] -->|"owns/writes"| MS["MissionState"]
    PM["Mapping/Perception"] -->|"owns/writes"| ES["EnvironmentState"]
    NAV["Navigator"] -->|"owns/writes"| NS["NavigationState"]
    BM["Battery Manager"] -->|"owns/writes"| BS["BatteryState"]
    HM["Health Monitor"] -->|"owns/writes"| HS["HealthState"]
    CM["Cargo/Payload Manager"] -->|"owns/writes"| CS["CargoState"]
    TM["Traffic Monitor"] -->|"owns/writes"| TS["TrafficState"]
    COM["Comms Manager"] -->|"owns/writes"| COMS["CommunicationState"]
    WS_["Weather Service"] -->|"owns/writes"| WS["WeatherState"]
    OI["Operator Interface / GCS Proxy"] -->|"owns/writes"| OS["OperatorState"]

    AS -.->|"reads"| MM
    ES -.->|"reads: wind"| SE
    HS -.->|"reads: avionics.sensors"| SE
    WS -.->|"reads: current_conditions"| SE

    AS -.->|"reads"| NAV
    MS -.->|"reads: active_mission"| NAV
    ES -.->|"reads: obstacles, terrain"| NAV
    TS -.->|"reads"| NAV
    WS -.->|"reads: wind"| NAV
    BS -.->|"reads"| NAV

    AS -.->|"reads"| MM
    BS -.->|"reads"| MM
    HS -.->|"reads: overall_status"| MM
    WS -.->|"reads: hazards"| MM
    TS -.->|"reads"| MM
    COMS -.->|"reads: operator_presence"| MM
    CS -.->|"reads"| MM

    AS -.->|"reads"| SafetyM["Safety Monitor (read-only)"]
    NS -.->|"reads: geofence_status"| SafetyM
    BS -.->|"reads: status"| SafetyM
    HS -.->|"reads"| SafetyM
    TS -.->|"reads: conflict_assessment"| SafetyM
    COMS -.->|"reads: links"| SafetyM
    WS -.->|"reads: hazards"| SafetyM
```

**Special case — Safety Monitor:** owns no World Model object; it is a consumer-only guardian that commands the flight-control layer (PX4) directly through a separate emergency channel, never through the World Model.

**Special case — Health Monitor:** the only subsystem that reads ALL other World Model objects, plus raw sensor streams directly from drivers, to detect cross-object inconsistencies (e.g., AircraftState reports motion while GPS reports stationary).

---

## 5. World State Hierarchy

```mermaid
flowchart TD
    WM["World Model\n(shared, temporally coherent, confidence-scored state)"]
    WM --> AS["AircraftState\nowner: State Estimator"]
    WM --> MS["MissionState\nowner: Mission Manager"]
    WM --> ES["EnvironmentState\nowner: Mapping/Perception"]
    WM --> NS["NavigationState\nowner: Navigator"]
    WM --> BS["BatteryState\nowner: Battery Manager"]
    WM --> HS["HealthState\nowner: Health Monitor"]
    WM --> CS["CargoState\nowner: Cargo/Payload Manager"]
    WM --> TS["TrafficState\nowner: Traffic Monitor"]
    WM --> COMS["CommunicationState\nowner: Comms Manager"]
    WM --> WS["WeatherState\nowner: Weather Service"]
    WM --> OS["OperatorState\nowner: Operator Interface / GCS Proxy"]

    AS --> AS1["pose, velocity, acceleration"]
    AS --> AS2["dynamic_mode, flight_phase"]
    AS --> AS3["state_history_ringbuffer (immutable)"]

    MS --> MS1["active_mission.waypoints[]"]
    MS --> MS2["progress, divergence"]
    MS --> MS3["mission_log (immutable)"]

    HS --> HS1["subsystems: propulsion, avionics, communication, payload"]
    HS --> HS2["anomalies.active[] / history[] (immutable)"]
    HS --> HS3["prognostics"]
```

**Rule of one writer (First Principles document):** every object has exactly one authorized writer. Multiple writers to the same field would produce race conditions and undefined behavior.

---

## 6. Mission Lifecycle State Machine

Built from the literal enums documented in `AircraftState.flight_phase`, `AircraftState.dynamic_mode`, and `MissionState.status`:

```mermaid
stateDiagram-v2
    [*] --> PREFLIGHT
    PREFLIGHT --> TAKEOFF
    TAKEOFF --> MISSION
    MISSION --> RTL: diversion_reason set\n(WEATHER, TRAFFIC, BATTERY,\nOPERATOR, SYSTEM_FAULT)
    MISSION --> LAND
    RTL --> LAND
    LAND --> POSTFLIGHT
    POSTFLIGHT --> [*]

    state MISSION {
        [*] --> HOVER
        HOVER --> TRANSITION
        TRANSITION --> CRUISE
        CRUISE --> TRANSITION
        TRANSITION --> HOVER
        CRUISE --> [*]
        HOVER --> [*]
    }
```

MissionState.status enum, tracked in parallel with flight_phase:

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> LOADED
    LOADED --> ARMED
    ARMED --> ACTIVE
    ACTIVE --> PAUSED
    PAUSED --> ACTIVE
    ACTIVE --> ABORTED
    ACTIVE --> COMPLETED
    PAUSED --> ABORTED
    ABORTED --> [*]
    COMPLETED --> [*]
```

**Divergence is a documented field, not an inferred state:** `MissionState.divergence.is_diverted`, `.diversion_reason` (WEATHER, TRAFFIC, BATTERY, OPERATOR, SYSTEM_FAULT), and `.original_mission_id` are the only documented mechanism for re-routing away from the committed mission plan.

---

## 7. Decision Pipeline

Per Software Architecture §5 (decision structure, strict evaluation order) and §6 (certainty/advisory boundary):

```mermaid
flowchart TD
    C["Layer C output:\nhealth / navigation / mission judgments"] --> Q1{"Is belief stale or\nbelow confidence threshold?"}
    Q1 -- yes --> R1["Propose conservative fallback"]
    Q1 -- no --> Q2{"Health or navigation condition\ncrosses degraded/critical threshold?"}
    Q2 -- yes --> R2["Propose conservative adjustment\n(reduced envelope, re-route, hold)"]
    Q2 -- no --> Q3{"Mission status indicates mission\nno longer achievable as planned?"}
    Q3 -- yes --> R3["Propose conservative adjustment"]
    Q3 -- no --> R4["Propose continuation of\ncurrent mission activity"]

    ADV["Advisory judgment\n(model/statistical, confidence-scored flag)"] -.->|"can only ever raise a flag"| Q2
    ADV -.->|"never generates a proposal directly"| R2

    R1 --> ARB["Arbitration\n(independent check, fail-closed)"]
    R2 --> ARB
    R3 --> ARB
    R4 --> ARB
    OPCMD["Operator command\n(treated as proposed intent, no privilege)"] --> ARB

    ARB -- "accepted / modified" --> FC["Flight Control Boundary"]
    ARB -- "rejected\n(no valid check result = rejection)" --> LOG["Rejected, logged\nno action taken"]
```

This ordering guarantees a mission-status concern can never outrank a health/navigation-critical condition, and that stale or low-confidence belief is always addressed before any other judgment is trusted (Product Spec §9.7, §9.12).

---

## 8. Explainability Pipeline

Per Software Architecture §1 (P6) and the Layer E description:

```mermaid
flowchart TD
    D["Layer D: Decision and Arbitration"] -->|"proposal + justification\nreference set, as one unit"| E["Layer E: Explainability and Record"]
    E --> REND{"Can Layer E render\nan explanation in real time?"}
    REND -- yes --> EXP["Human-understandable explanation:\nfacts referenced + alternatives\nconsidered and rejected"]
    REND -- no --> GAP["Decision is NOT blocked or delayed.\nGap is explicitly recorded as a gap\n(silence is never allowed to look\nlike 'nothing happened')"]
    EXP --> REC["Permanent record\n(accepted, modified, or rejected —\nall three preserved)"]
    GAP --> REC
    REC --> OP["Human Operator\n(situational awareness)"]
```

**Invariant (P6, Architectural Invariant 6):** the justification is not generated afterward by Layer E — Layer E only renders what Layer D already produced as part of deciding. Explanation is never a reconstruction.

---

## 9. Health Monitoring Flow

Per the HealthState specification and the Health Monitor's documented ownership/consumer relationships:

```mermaid
flowchart TD
    SENS["Raw sensor streams\n(direct from drivers)"] --> HM["Health Monitor"]
    AS["AircraftState"] --> HM
    MS["MissionState"] --> HM
    ES["EnvironmentState"] --> HM
    NS["NavigationState"] --> HM
    BS["BatteryState"] --> HM
    CS["CargoState"] --> HM
    TS["TrafficState"] --> HM
    COMS["CommunicationState"] --> HM
    WS["WeatherState"] --> HM
    OS["OperatorState"] --> HM

    HM --> HS["HealthState (sole write)"]
    HS --> SUB["subsystems:\npropulsion, avionics,\ncommunication, payload"]
    HS --> ANOM["anomalies:\nactive[], history[] (immutable)"]
    HS --> PROG["prognostics:\ntime_to_maintenance_hrs,\ncomponent_remaining_life[]"]
    HS --> STATUS["overall_status:\nNOMINAL, DEGRADED,\nRESTRICTED, EMERGENCY, GROUNDED"]

    STATUS --> ALL["EVERY subsystem\n(reads overall_status)"]
    STATUS --> MM["Mission Manager\n(go/no-go)"]
    STATUS --> SM["Safety Monitor\n(emergency downgrade)"]
    STATUS --> OP["Operator\n(situational awareness)"]
```

**Cross-consistency check documented for Health Monitor:** it looks for inconsistencies such as AircraftState reporting motion while GPS reports stationary — the only subsystem architecturally permitted to read every World Model object for this purpose.

---

## 10. Risk Assessment Flow

Product Spec §9.6 requires AFIP to "continuously assess whether the mission is on track, at risk, or no longer achievable as planned" — this is the literal source language for risk classification, evaluated inside Layer C (Situational Reasoning) using the certainty/advisory boundary from Software Architecture §6:

```mermaid
flowchart TD
    BEL["Layer B: reconciled, confidence-scored belief"] --> C["Layer C: Situational Reasoning"]

    subgraph C
        H["Health judgment:\nNOMINAL / DEGRADED / CRITICAL"]
        N["Navigation judgment:\non course / within limits / breach"]
        MSN["Mission judgment:\non track / AT RISK / no longer achievable"]
        H <--> N
        N <--> MSN
        H <--> MSN
    end

    ADVF["Advisory flag\n(model/statistical, confidence-scored)"] -->|"raises for deterministic\njudgment to weigh only"| H
    ADVF -->|"can never itself classify"| MSN

    C --> XCHECK["Cross-domain judgment:\ndegradation in ANY one domain\nmust re-evaluate the other two\n(Product Spec §9.7)"]
    XCHECK --> D["Layer D: Decision and Arbitration\n(see Decision Pipeline, Section 7)"]
```

**Invariant governing this flow:** an advisory flag can never, by itself, cause a proposed intent to be generated (Software Architecture §6, Architectural Invariant 4) — it can only ever raise something for deterministic judgment in Layer C to weigh before the classification reaches Layer D.

---

*AFIP Program Office — Engineering Diagram Package. All node names, enum values, and subsystem labels are sourced verbatim from the Product Specification, Software Architecture Document, and First Principles: Information-Centric Architecture. No module, interface, or diagram element beyond those documented sources has been introduced.*
