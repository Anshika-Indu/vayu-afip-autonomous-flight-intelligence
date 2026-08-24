/**
 * app.js
 * Central coordinator for the Flight Intelligence Dashboard.
 * Manages simulation state machine, binds console CLI, captures keyboard override flight mechanics,
 * handles fault injection, and syncs updates to TacticalMap, Drone3D, and WorldModel.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- A. Global State ---
  const state = {
    droneId: "ARES-V2 // TAIL-88",
    systemMode: "AUTONOMOUS", // AUTONOMOUS, MANUAL_OVERRIDE, RTL, LANDING, CRASHING
    gpsStatus: "RTK FIXED (31 SV)",
    commsStatus: "SAT-LINK: 98ms",
    batteryPct: 68.0,
    powerDraw: 165.2, // Amperes
    speedKnots: 48.2,
    altitudeAgl: 328.0,
    verticalSpeed: 0.5, // m/s
    attitude: { pitch: 1.5, roll: -2.1, yaw: 45.0 },
    windSpeed: 12.4, // knots
    windDir: 280,   // degrees
    tempC: 16.8,
    precipMm: 0.0,
    aiConfidence: 98.4,
    currentWaypointIndex: 2, // Transit between WP2 and WP3
    waypointProgress: 0.74, // percentage completion between current and next WP
    explainText: "Maintaining standard trajectory corridor. Correcting roll matrix for 12kt crosswind from 280° (bearing West). Altitude compensation set to +2.4% throttle output to account for localized thermals. Obstacle scan returns safe margins within 300m cylinder.",
    motorStatus: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], // 1 = Nom, 0.5 = Warn, 0 = Fail
    motorRPMs: [95, 94, 96, 95, 95, 96, 94, 95], // percentages
    cellTemps: [34.2, 34.5, 33.8, 34.1, 35.0, 34.6, 34.2, 34.4, 33.9, 34.0, 34.5, 34.2],
    clampingForce: "100% SECURE",
    cargoHydraulics: "3,120 psi",
    simulationTickRate: 100, // milliseconds
    startTime: Date.now() - 34 * 60 * 1000 - 12 * 1000 // Offset by 34m 12s
  };

  // Coordinates tracker
  let currentCoords = [37.8100, -122.3300];

  // Keyboard override variables
  let keysPressed = {};

  // --- B. Initializations ---
  // Initialize Leaflet Tactical Map
  TacticalMap.init('leaflet-map');
  
  // Initialize Three.js Drone Visualizer
  Drone3D.init('three-drone-container');
  Drone3D.updateDroneAttitude(state.attitude.pitch, state.attitude.roll, state.attitude.yaw);
  
  // Initialize World Model LiDAR Canvas
  WorldModel.init('lidar-canvas');
  WorldModel.setFlightSpeed(state.speedKnots);

  // Bind Console Elements
  const consoleLogs = document.getElementById('console-logs');
  const consoleInput = document.getElementById('console-input');
  
  // --- C. Simulation Logic ---
  function updateSimulation() {
    if (state.systemMode === "CRASHING") {
      simulateCrashStep();
      return;
    }

    // 1. Time updates
    updateClocks();

    // 2. Position Navigation simulation along waypoints path
    simulatePositionStep();

    // 3. Telemetry oscillations (make it feel alive and raw)
    simulateAttitudeOscillations();

    // 4. Power Matrix decay
    simulateBatteryDecay();

    // 5. Update UI readouts
    updateUIElements();

    // 6. Send telemetry vectors to components
    TacticalMap.updateDronePosition(currentCoords, state.attitude.yaw);
    Drone3D.updateDroneAttitude(state.attitude.pitch, state.attitude.roll, state.attitude.yaw);
  }

  function updateClocks() {
    // Current UTC time
    const now = new Date();
    document.getElementById('time-utc').textContent = now.toISOString().slice(11, 19);

    // Elapsed mission duration
    const diffMs = Date.now() - state.startTime;
    const hrs = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    document.getElementById('mission-elapsed').textContent = `${hrs}:${mins}:${secs}`;
  }

  function simulatePositionStep() {
    if (state.systemMode === "MANUAL_OVERRIDE") {
      // Manual control updates position based on keyboard pitch/roll
      processKeyboardFlightControls();
      return;
    }

    const currentWP = TacticalMap.waypoints[state.currentWaypointIndex];
    let nextWPIndex = state.currentWaypointIndex + 1;
    
    if (state.systemMode === "RTL") {
      // Heading towards Base Alpha (index 0)
      nextWPIndex = 0;
    }

    // Safe bounds check
    if (nextWPIndex >= TacticalMap.waypoints.length) {
      // Landing phase simulation at final terminal destination
      state.systemMode = "LANDING";
      state.speedKnots = Math.max(0, state.speedKnots - 1.2);
      state.altitudeAgl = Math.max(0, state.altitudeAgl - 4.5);
      state.verticalSpeed = -1.8;
      if (state.altitudeAgl === 0) {
        state.speedKnots = 0;
        state.verticalSpeed = 0;
        state.systemMode = "LANDED";
        logConsole("INFO", "ARES-V2 COMPLETED AUTONOMOUS CARGO DELIVERY. AUTOPILOT IDLE.");
      }
      return;
    }

    const targetWP = TacticalMap.waypoints[nextWPIndex];
    
    // Increment waypoint track progress
    state.waypointProgress += 0.0008 * (state.speedKnots / 48.0);
    if (state.waypointProgress >= 1.0) {
      state.waypointProgress = 0.0;
      state.currentWaypointIndex = nextWPIndex;
      logConsole("INFO", `AUTOPILOT TRANSIT REACHED: ${targetWP.name}`);
      
      // Update decision log table
      addDecisionHistoryRow(
        new Date().toISOString().slice(11, 16),
        "WAYPOINT_REACHED",
        `Arrived at waypoint index ${nextWPIndex}. Switching corridor alignment.`,
        "OK"
      );
    }

    // Calculate heading vector
    const startLat = currentWP.coords[0];
    const startLng = currentWP.coords[1];
    const targetLat = targetWP.coords[0];
    const targetLng = targetWP.coords[1];

    // Linear interpolation
    const lat = startLat + (targetLat - startLat) * state.waypointProgress;
    const lng = startLng + (targetLng - startLng) * state.waypointProgress;
    currentCoords = [lat, lng];

    // Compute heading angle (degrees bearing)
    const y = Math.sin(targetLng - startLng) * Math.cos(targetLat);
    const x = Math.cos(startLat) * Math.sin(targetLat) - Math.sin(startLat) * Math.cos(targetLat) * Math.cos(targetLng - startLng);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    
    state.attitude.yaw = bearing;
  }

  function simulateAttitudeOscillations() {
    // Add noise to attitude representation based on wind
    const turbulence = state.windSpeed / 12.0; // Base reference
    state.attitude.pitch += (Math.random() - 0.5) * 0.3 * turbulence;
    state.attitude.roll += (Math.random() - 0.5) * 0.4 * turbulence;

    // Dampen back to equilibrium targets
    const targetPitch = 1.5;
    const targetRoll = -2.1;
    state.attitude.pitch += (targetPitch - state.attitude.pitch) * 0.05;
    state.attitude.roll += (targetRoll - state.attitude.roll) * 0.05;

    // Normal motor speeds oscillation
    for (let i = 0; i < 8; i++) {
      if (state.motorStatus[i] === 1.0) {
        state.motorRPMs[i] = Math.round(95 + (Math.random() - 0.5) * 2);
      } else if (state.motorStatus[i] === 0.5) {
        state.motorRPMs[i] = Math.round(62 + (Math.random() - 0.5) * 6);
      } else {
        state.motorRPMs[i] = 0;
      }
    }
  }

  function simulateBatteryDecay() {
    // Slow battery drainage
    state.batteryPct = Math.max(0, state.batteryPct - 0.005);
    state.powerDraw = 165.2 + (Math.random() - 0.5) * 5;
    
    // Update simple fuel remaining time logic (18.4 min baseline)
    const remainingTimeMin = ((state.batteryPct / 68.0) * 18.4).toFixed(1);
    document.getElementById('val-power-remaining').innerHTML = `${remainingTimeMin} <span class="unit">min</span>`;

    // Cell temperature fluctuations
    for (let i = 0; i < 12; i++) {
      const isMotorFaulted = state.motorStatus.some(s => s < 1.0);
      const cellHeatOffset = isMotorFaulted ? 4.2 : 0; // Fault increases thermal stress
      state.cellTemps[i] = parseFloat((34.0 + cellHeatOffset + (Math.random() - 0.5) * 0.6).toFixed(1));
    }
  }

  function simulateCrashStep() {
    // Drone loses altitude rapidly, tumbles erratically
    state.altitudeAgl = Math.max(0, state.altitudeAgl - 15);
    state.attitude.pitch += (Math.random() - 0.5) * 25;
    state.attitude.roll += (Math.random() - 0.5) * 25;
    state.attitude.yaw += (Math.random() - 0.5) * 10;
    state.speedKnots = Math.max(0, state.speedKnots - 1.5);
    state.verticalSpeed = -25.0;

    // Stop propellers
    Drone3D.updateThrottle(0);

    // Update UI elements
    updateUIElements();

    // Telemetry send
    Drone3D.updateDroneAttitude(state.attitude.pitch, state.attitude.roll, state.attitude.yaw);

    if (state.altitudeAgl === 0) {
      state.systemMode = "CRASHED";
      state.verticalSpeed = 0;
      state.speedKnots = 0;
      logConsole("ERROR", "CRITICAL IMPACT DETECTED. ALL SIGNAL LINK DYNAMICS DEGRADED.");
      
      // Update modules indicator
      document.querySelectorAll('.module-status-item').forEach(el => {
        el.className = "module-status-item red";
        el.querySelector('.status').textContent = "FAIL";
      });

      state.aiConfidence = 0.0;
      updateUIElements();
    }
  }

  // --- D. Keyboard Override (Arrow keys easter egg) ---
  window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
  });

  function processKeyboardFlightControls() {
    if (state.systemMode !== "MANUAL_OVERRIDE") return;

    let thrustInput = 0;
    let pitchInput = 0;
    let rollInput = 0;
    let yawInput = 0;

    // Up/Down arrows: change pitch (forward/back)
    if (keysPressed['ArrowUp']) pitchInput = 4.0;
    if (keysPressed['ArrowDown']) pitchInput = -4.0;

    // Left/Right arrows: change roll (lateral slide)
    if (keysPressed['ArrowLeft']) rollInput = -4.0;
    if (keysPressed['ArrowRight']) rollInput = 4.0;

    // W/S keys: altitude adjustment
    if (keysPressed['w'] || keysPressed['W']) thrustInput = 1.5;
    if (keysPressed['s'] || keysPressed['S']) thrustInput = -1.5;

    // A/D keys: yaw adjustment
    if (keysPressed['a'] || keysPressed['A']) yawInput = -3.0;
    if (keysPressed['d'] || keysPressed['D']) yawInput = 3.0;

    // Apply manual flight input changes
    state.attitude.pitch = 1.5 + pitchInput;
    state.attitude.roll = -2.1 + rollInput;
    state.attitude.yaw = (state.attitude.yaw + yawInput + 360) % 360;

    state.altitudeAgl = Math.max(0, state.altitudeAgl + thrustInput);
    state.verticalSpeed = thrustInput;

    // Move drone GPS coords based on pitch/roll vectors
    const pitchRad = (state.attitude.pitch * Math.PI) / 180;
    const rollRad = (state.attitude.roll * Math.PI) / 180;
    const yawRad = (state.attitude.yaw * Math.PI) / 180;

    // Simple flight vector projection onto lat/lng coordinates
    const latDelta = (Math.cos(yawRad) * pitchInput + Math.sin(yawRad) * rollInput) * 0.00001;
    const lngDelta = (Math.sin(yawRad) * pitchInput - Math.cos(yawRad) * rollInput) * 0.00001;
    
    currentCoords[0] += latDelta;
    currentCoords[1] += lngDelta;

    state.speedKnots = (pitchInput !== 0 || rollInput !== 0) ? 54.8 : 0;
  }

  // --- E. UI Update Syncer ---
  function updateUIElements() {
    // 1. Text telemetry updates
    document.getElementById('val-speed').innerHTML = `${state.speedKnots.toFixed(1)} <span class="unit">kt</span>`;
    document.getElementById('val-alt').innerHTML = `${Math.round(state.altitudeAgl)} <span class="unit">ft</span>`;
    
    const sign = state.verticalSpeed >= 0 ? '+' : '';
    document.getElementById('val-vspeed').innerHTML = `${sign}${state.verticalSpeed.toFixed(1)} <span class="unit">m/s</span>`;
    
    document.getElementById('val-attitude').textContent = `${state.attitude.pitch.toFixed(1)}° / ${state.attitude.roll.toFixed(1)}°`;
    document.getElementById('val-pitch').textContent = `${state.attitude.pitch.toFixed(1)}°`;
    document.getElementById('val-roll').textContent = `${state.attitude.roll.toFixed(1)}°`;
    document.getElementById('val-yaw').textContent = `${state.attitude.yaw.toFixed(1)}°`;

    // 2. Battery fluid bar & percentage
    document.getElementById('val-battery-pct').textContent = `${Math.round(state.batteryPct)}%`;
    const fluidBar = document.getElementById('battery-fluid-level');
    if (fluidBar) {
      fluidBar.style.width = `${state.batteryPct}%`;
      // Turn battery fluid bar amber/red if levels drop
      if (state.batteryPct < 20) {
        fluidBar.style.backgroundColor = 'var(--status-critical)';
      } else if (state.batteryPct < 40) {
        fluidBar.style.backgroundColor = 'var(--status-warning)';
      } else {
        fluidBar.style.backgroundColor = 'var(--status-nominal)';
      }
    }
    
    document.getElementById('val-power-draw').innerHTML = `${state.powerDraw.toFixed(1)} <span class="unit">A</span>`;

    // 3. AI Confidence Badge
    const confBadge = document.querySelector('.confidence-badge');
    document.getElementById('val-confidence').textContent = `${state.aiConfidence.toFixed(1)}%`;
    if (state.aiConfidence < 85) {
      confBadge.classList.add('low-conf');
    } else {
      confBadge.classList.remove('low-conf');
    }

    // 4. Progress Bar
    const progressFill = document.getElementById('mission-progress-bar');
    if (progressFill) {
      const pct = Math.round(state.waypointProgress * 100);
      progressFill.style.width = `${pct}%`;
      document.getElementById('mission-pct-label').textContent = `${pct}%`;
    }

    // 5. Compass arrows
    const compassArrow = document.getElementById('wind-arrow');
    if (compassArrow) {
      compassArrow.style.transform = `rotate(${state.windDir}deg)`;
    }
    document.getElementById('val-wind').innerHTML = `${state.windSpeed.toFixed(1)} <span class="unit">kts / ${state.windDir}°</span>`;

    // 6. Motor overlays & BMS cell blocks
    updateMotorHUDOverlay();
    updateCellBlocksUI();
    
    // 7. Explainability update
    document.getElementById('explain-message').textContent = state.explainText;
  }

  function updateMotorHUDOverlay() {
    for (let i = 0; i < 8; i++) {
      const indicator = document.getElementById(`motor-${i + 1}`);
      if (!indicator) continue;
      
      const health = state.motorStatus[i];
      const rpm = state.motorRPMs[i];
      
      const valSpan = indicator.querySelector('.val');
      
      if (health === 1.0) {
        valSpan.className = "val green";
        valSpan.textContent = `${rpm}%`;
      } else if (health === 0.5) {
        valSpan.className = "val amber";
        valSpan.textContent = `WARN (${rpm}%)`;
      } else {
        valSpan.className = "val red";
        valSpan.textContent = "FAIL";
      }
    }
  }

  function updateCellBlocksUI() {
    const cellBlocks = document.querySelectorAll('.cell-block');
    cellBlocks.forEach((block, idx) => {
      if (idx >= state.cellTemps.length) return;
      const temp = state.cellTemps[idx];
      block.textContent = `C${idx + 1}: ${temp.toFixed(1)}`;
      
      // Dynamic block highlights
      if (temp > 42) {
        block.className = "cell-block red";
      } else if (temp > 38) {
        block.className = "cell-block amber";
      } else {
        block.className = "cell-block green";
      }
    });
  }

  // --- F. Operator Console Logging CLI ---
  function logConsole(level, text) {
    const timeStr = new Date().toISOString().slice(11, 19);
    let cssClass = "system-line";
    
    if (level === "SUCCESS") cssClass = "success-line";
    else if (level === "INFO") cssClass = "info-line";
    else if (level === "WARN") cssClass = "warning-line";
    else if (level === "ERROR") cssClass = "error-line";

    const line = document.createElement('div');
    line.className = `log-line ${cssClass}`;
    line.textContent = `[${timeStr}] ${text}`;
    
    consoleLogs.appendChild(line);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  // Bind key inputs inside terminal console
  consoleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const command = consoleInput.value.trim();
      consoleInput.value = '';
      if (command) {
        processConsoleCommand(command);
      }
    }
  });

  function processConsoleCommand(rawCmd) {
    // Echo command back in log list
    const line = document.createElement('div');
    line.className = 'log-line';
    line.style.color = '#fff';
    line.innerHTML = `<span style="color:var(--status-info)">ares_v2_cmd::></span> ${rawCmd}`;
    consoleLogs.appendChild(line);

    const tokens = rawCmd.split(' ');
    const cmd = tokens[0].toLowerCase();
    const arg = tokens[1];

    switch (cmd) {
      case 'help':
        logConsole("INFO", "AVAILABLE COMMANDS:");
        logConsole("SYSTEM", " - status: Run comprehensive diagnostic verify sequence");
        logConsole("SYSTEM", " - wind [kts]: Simulate custom crosswind load matrix");
        logConsole("SYSTEM", " - fault [1-8]: Inject simulated rotor thermal degradation");
        logConsole("SYSTEM", " - clear: Wipe console buffer");
        logConsole("SYSTEM", " - wp [0-4]: Jump navigation track to specific waypoint");
        logConsole("SYSTEM", " - override: Toggles operator keyboard flight override");
        break;

      case 'status':
        logConsole("INFO", "COMPILING DIAGNOSTIC SHIELD CHECKLIST...");
        setTimeout(() => {
          logConsole("SUCCESS", `CELL MATRIX BMS TEMPS: NOMINAL (AVG: ${calculateAvgTemp()}°C)`);
          logConsole("SUCCESS", `RTK POSITION LOCK: SUCCESS (${state.gpsStatus})`);
          logConsole("SUCCESS", "STARLINK COMMS ANTENNA GAIN: 92%");
          logConsole("SUCCESS", `HYDRAULIC CLAMP PRESSURE: ${state.cargoHydraulics}`);
          logConsole("INFO", `ACTIVE PLATFORM MODE: ${state.systemMode}`);
        }, 300);
        break;

      case 'wind':
        const wVal = parseFloat(arg);
        if (isNaN(wVal)) {
          logConsole("ERROR", "INVALID ARGUMENT. FORMAT: 'wind [speed_in_knots]'");
        } else {
          state.windSpeed = wVal;
          if (wVal >= 25) {
            logConsole("WARN", `CAUTION: HIGH CROSSWIND INTENSE VECTOR DETECTED (${wVal} kts)`);
            state.explainText = `Flight core detected severe crosswinds of ${wVal}kts from 280°. Applying aggressive side-slip yaw vector offset. Pitch trim adjusted to +4.8% power throttle density.`;
            state.aiConfidence = 89.2;
          } else {
            logConsole("SUCCESS", `CROSSWIND LOAD TARGET ADJUSTED TO ${wVal} kts`);
            state.explainText = `Crosswind load shifted to ${wVal}kts. Auto-trim matrices compensating. Flight path within nominal corridors.`;
            state.aiConfidence = 98.4;
          }
        }
        break;

      case 'fault':
        const fIdx = parseInt(arg) - 1;
        if (isNaN(fIdx) || fIdx < 0 || fIdx >= 8) {
          logConsole("ERROR", "INVALID MOTOR INDEX. FORMAT: 'fault [1-8]'");
        } else {
          injectMotorFault(fIdx);
        }
        break;

      case 'clear':
        consoleLogs.innerHTML = '';
        break;

      case 'wp':
        const wpIdx = parseInt(arg);
        if (isNaN(wpIdx) || wpIdx < 0 || wpIdx >= TacticalMap.waypoints.length) {
          logConsole("ERROR", `INVALID WP. TARGETS AVAILABLE: 0 to ${TacticalMap.waypoints.length - 1}`);
        } else {
          state.currentWaypointIndex = wpIdx;
          state.waypointProgress = 0.0;
          currentCoords = [...TacticalMap.waypoints[wpIdx].coords];
          logConsole("SUCCESS", `AUTOPILOT FORCED INTERCEPT TO WAYPOINT ${wpIdx}`);
          TacticalMap.panToCoords(currentCoords);
        }
        break;

      case 'override':
        toggleOperatorOverride();
        break;

      default:
        logConsole("ERROR", `COMMAND NOT RECOGNIZED: '${cmd}'. TYPE 'help' FOR LIST.`);
    }

    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function calculateAvgTemp() {
    const sum = state.cellTemps.reduce((a, b) => a + b, 0);
    return (sum / state.cellTemps.length).toFixed(1);
  }

  function injectMotorFault(idx) {
    state.motorStatus[idx] = 0.0; // Fail propeller completely
    state.motorRPMs[idx] = 0;
    Drone3D.updateMotorStatus(idx, 0.0);
    
    logConsole("ERROR", `CRITICAL PROPULSION EVENT: MOTOR ${idx + 1} INDUCTION STALL / MOTOR KILL ACTIVE`);
    
    // Lower system confidence
    state.aiConfidence = 74.2;

    // Trigger alert banner
    const alertBanner = document.getElementById('global-alert-banner');
    document.getElementById('alert-banner-text').textContent = `MOTOR ${idx + 1} PROPULSION SYSTEM DISRUPTED - ROTOR FAILURE DETECTED`;
    alertBanner.classList.remove('hidden');

    state.explainText = `CRITICAL DETECTED FAILURE: Propulsion loss on Motor ${idx + 1}. Auto-attutide compensator adjusting load balance vectors. Re-routing +14.2% power to surrounding quad rotors. Mission speed capped at 32kts.`;

    // Visual Panel highlight
    document.getElementById('panel-drone-3d').classList.add('alarm-state');
    document.getElementById('panel-ai-explain').classList.add('warning-state');

    // Add decision history log
    addDecisionHistoryRow(
      new Date().toISOString().slice(11, 16),
      `ROTOR_${idx + 1}_FAIL_RECUP`,
      `Loss of RPM on motor ${idx + 1}. Attained roll stability trim. Redundant torque distribution active.`,
      "COMPENSATING"
    );
  }

  function addDecisionHistoryRow(time, code, reason, result) {
    const tableBody = document.getElementById('decision-history-rows');
    const row = document.createElement('tr');
    
    let badgeClass = "badge-success";
    if (result === "ACTIVE" || result === "COMPENSATING") badgeClass = "badge-warning";
    else if (result === "FAIL") badgeClass = "badge-danger";

    row.innerHTML = `
      <td>${time}</td>
      <td class="code">${code}</td>
      <td>${reason}</td>
      <td><span class="badge ${badgeClass}">${result}</span></td>
    `;
    
    // Insert at front
    tableBody.insertBefore(row, tableBody.firstChild);
  }

  function toggleOperatorOverride() {
    if (state.systemMode !== "MANUAL_OVERRIDE") {
      state.systemMode = "MANUAL_OVERRIDE";
      logConsole("WARN", "OPERATOR REQUESTED FLIGHT CONTROL. AUTOPILOT SUSPENDED.");
      logConsole("INFO", "MANUAL FLIGHT OVERRIDE INTERFACE ENGAGED. USE ARROW KEYS FOR TELEMETRY ATTITUDE (PITCH/ROLL). W/S THRUST. A/D YAW.");
      
      // Top status dot update
      const modeInd = document.getElementById('ind-mode');
      modeInd.querySelector('.dot').className = "dot amber";
      modeInd.querySelector('.text').textContent = "MANUAL OVERRIDE";
      
      addDecisionHistoryRow(
        new Date().toISOString().slice(11, 16),
        "MANUAL_ENGAGEMENT",
        "Operator assumed telemetry vector control overrides.",
        "ACTIVE"
      );
    } else {
      state.systemMode = "AUTONOMOUS";
      logConsole("SUCCESS", "AUTOPILOT REACTIVATED. RESTORING TACTICAL FLIGHT ROUTE.");
      
      const modeInd = document.getElementById('ind-mode');
      modeInd.querySelector('.dot').className = "dot pulse-green";
      modeInd.querySelector('.text').textContent = "AI AUTONOMOUS";
    }
  }

  // --- G. Emergency Button Panel Handlers ---
  document.getElementById('btn-rtl').addEventListener('click', () => {
    state.systemMode = "RTL";
    logConsole("WARN", "TACTICAL ABORT: RETURN TO LAUNCH (RTL) SEQUENCE ENGAGED.");
    state.explainText = "Abort instruction recognized. Rerouting mission tracking coordinates 180° back to Base Alpha runway. Ground speed adjusted to energy conservation parameters.";
    
    const modeInd = document.getElementById('ind-mode');
    modeInd.querySelector('.dot').className = "dot amber";
    modeInd.querySelector('.text').textContent = "RTL TRANSIT";

    addDecisionHistoryRow(
      new Date().toISOString().slice(11, 16),
      "RTL_ACTUATION",
      "Immediate Return to Launch commanded by ground station operator.",
      "ACTIVE"
    );
  });

  document.getElementById('btn-loiter').addEventListener('click', () => {
    state.systemMode = "LOITER";
    state.speedKnots = 0;
    state.verticalSpeed = 0;
    logConsole("WARN", "FLIGHT COMMAND: ENGAGED STATION-KEEPING HOVER / LOITER.");
    state.explainText = "Loiter hold activated. Drone maintaining current GPS coordinates via dynamic hover trim. Holding altitude constant.";
    
    addDecisionHistoryRow(
      new Date().toISOString().slice(11, 16),
      "LOITER_HOLD",
      "Autopilot holding station position. Ground speed set to zero.",
      "OK"
    );
  });

  document.getElementById('btn-land').addEventListener('click', () => {
    state.systemMode = "LANDING";
    logConsole("WARN", "IMMEDIATE DOWN-HOOK LAND SEQ ENGAGED.");
    state.explainText = "Autonomous immediate landing initiated. Scanning terrain profile beneath aircraft using LiDAR matrix sensor loops. Initiating vertical descent.";
  });

  document.getElementById('btn-kill').addEventListener('click', () => {
    state.systemMode = "CRASHING";
    state.motorStatus = [0, 0, 0, 0, 0, 0, 0, 0];
    state.motorRPMs = [0, 0, 0, 0, 0, 0, 0, 0];
    
    logConsole("ERROR", "EMERGENCY POWER DISCONNECT: PROPULSION SYSTEMS TERMINATED!");
    
    const modeInd = document.getElementById('ind-mode');
    modeInd.querySelector('.dot').className = "dot red";
    modeInd.querySelector('.text').textContent = "CRITICAL DESCENT";

    // Flash global alert
    const alertBanner = document.getElementById('global-alert-banner');
    document.getElementById('alert-banner-text').textContent = "EMERGENCY MOTOR CUT ACTUATED - SYSTEM DESCENT UNCONTROLLED";
    alertBanner.classList.remove('hidden');

    addDecisionHistoryRow(
      new Date().toISOString().slice(11, 16),
      "MOTOR_KILL_ENG",
      "Hard motor cut commanded. Aerodynamic drag descent in progress.",
      "FAIL"
    );
  });

  document.getElementById('btn-override').addEventListener('click', () => {
    // Toggle manual override button states
    toggleOperatorOverride();
    const btn = document.getElementById('btn-override');
    if (state.systemMode === "MANUAL_OVERRIDE") {
      btn.classList.add('btn-active');
    } else {
      btn.classList.remove('btn-active');
    }
  });

  // Map Toggles Link
  document.getElementById('btn-toggle-radar').addEventListener('click', (e) => {
    const active = TacticalMap.toggleRadarLayer();
    e.target.classList.toggle('active', active);
    logConsole("SYSTEM", `WEATHER RADAR MATRIX LAYER: ${active ? 'ENABLED' : 'DISABLED'}`);
  });

  document.getElementById('btn-toggle-geofence').addEventListener('click', (e) => {
    const active = TacticalMap.toggleGeofenceLayer();
    e.target.classList.toggle('active', active);
    logConsole("SYSTEM", `GEOFENCE BOUNDARY ENVELOPE: ${active ? 'VISIBLE' : 'HIDDEN'}`);
  });

  // --- H. Run Loops ---
  setInterval(updateSimulation, state.simulationTickRate);

  // Initial console welcomes
  logConsole("SUCCESS", "ARES-V2 INTEGRATED AUTONOMOUS FLIGHT ENVIRONMENT CONNECTED.");
  logConsole("INFO", "READY FOR OPERATOR OVERWATCH. TYPE 'help' IN CLI FOR COMMAND MATRIX.");

});
