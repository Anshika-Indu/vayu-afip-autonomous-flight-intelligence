# Telemetry Coverage — Phase 2

`Simulator_AFIP.html` is a deterministic, parametric transition-physics
visualizer (time → phase/tilt/velocity/altitude/spar-shear torque). It
is **not** yet a telemetry-rich flight sim, so it cannot honestly supply
every row the Integration Spec §4.3 Mapping Matrix expects. This file is
the ground truth for what's real right now — read it before writing any
Phase 4 reasoning logic that assumes a field exists.

## Live (Evidence Adapter emits these every frame)

| World State field | Source in simulator | Unit |
|---|---|---|
| `Mission.Clock` | `state.t` | s |
| `Mission.Progress.Phase` / `.PhaseIndex` / `.PhaseFraction` | `computeState().phase`, `PHASE_NAMES`, `.localX` | — |
| `Mission.Status.Playing` / `.SpeedMultiplier` | `state.playing`, `state.speed` | — |
| `Aircraft.Kinematics.Airspeed` / `.GroundSpeed` | `computeState().vel` | km/h |
| `Aircraft.Altitude` | `computeState().alt` | m |
| `Aircraft.Configuration.RotorTiltAngle` | `computeState().tilt` | deg |
| `Aircraft.Configuration.TransitionMode` | derived: phase ∈ {2,4} | bool |
| `Aircraft.Payload.Mass` | `els.payload` | kg |
| `Navigation.Progress.DistanceTraveled` / `.TotalDistance` / `.DistanceRemaining` | `getXForTime()`, `totalDist` | m |
| `Mission.Constraints.CruiseSpeedSetting` / `.CruiseAltitudeSetting` | `els.cruisespeed`, `els.cruisealt` | km/h, m |
| `Aircraft.Structural.GyroscopicTorque` / `.TorqueClockwise` / `.TorqueCounterClockwise` | `computeState().tauGyro/tauCW/tauCCW` | N·m |

`Airspeed` and `GroundSpeed` currently carry the same value — there is
no independent wind model yet, so there is no true air-relative vs.
ground-relative distinction. Treat them as one signal until Environment
gets a real source.

## AWAITING_SOURCE (no data — do not fabricate)

Exposed as `AFIP.AWAITING_SOURCE` for any module to check at runtime.

- Position: `Aircraft.Position.Latitude/Longitude`, `Navigation.Sensor.GPSPosition/GPSQuality`
- Energy: `Energy.State.BatteryPercentage`, `Energy.Telemetry.BatteryVoltage/BatteryCurrent`, `Energy.Remaining.EstimatedEnergy`
- Propulsion/health: `Health.Propulsion.MotorTemperature/MotorRPM`, `Health.Powertrain.ESCTemperature`, `Health.SensorIntegrity.IMUStatus`
- Environment: `Environment.Weather.WindSpeed/WindDirection/AmbientTemperature`
- Communication: `Communication.LinkStatus/Latency/SignalQuality`

## What this means for later phases

- **Health Monitor (Phase 4)** can score structural/propulsion load from
  `Aircraft.Structural.GyroscopicTorque` today, but cannot score
  battery, motor temperature, or IMU health until a source exists.
  It reads this raw evidence and produces `Health.*` — WSE never
  writes into `Health.*` directly (§5.6).
- **Risk Engine (Phase 4)** can compute navigation/mission risk from
  what's live, but environmental and communication risk terms should
  report "insufficient data" rather than a silent default value.
- **Prediction Engine (Phase 4)** can forecast ETA/distance from
  kinematics, but cannot forecast endurance without `Energy.*`.

Closing these gaps means adding a real source (PX4/ArduPilot/ROS2 bridge
or extending the simulator itself) and adding rows to `FIELD_MAP` in
`evidence-adapter.js` — never inventing values downstream.

## Phase 10 addendum

Mission Planner, Navigation, Mission Timeline, and Operator Commands
(Phase 10) introduce no new evidence sources — this file's Live and
AWAITING_SOURCE lists above are unchanged. They derive everything from
what was already live: `Navigation.Progress.DistanceTraveled/.TotalDistance`
drive Mission Planner's waypoint plan and Navigation's progress/ETA/
waypoint-arrival logic. Because `Aircraft.Position.Latitude/Longitude`
and `Navigation.Sensor.GPSPosition/GPSQuality` remain AWAITING_SOURCE,
Navigation reports Heading as unavailable and Cross-Track Error as a
fixed 0 (single-track simulator, no lateral degree of freedom) rather
than inventing either. Because `Energy.*` remains AWAITING_SOURCE,
Mission Planner reports its energy-requirement estimate as unavailable
rather than modeling a consumption rate it has no telemetry for.
