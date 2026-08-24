/**
 * worldmodel.js
 * Renders the World Model LiDAR visualization on a 2D canvas.
 * Simulates a real-time vector point cloud mapping terrain,
 * identifying obstacle bounding boxes, and displaying the safety corridor.
 */

const WorldModel = (function() {
  let canvas, ctx;
  let animId;
  let obstacles = [];
  let terrainPoints = [];
  let sweepAngle = 0;
  let flightSpeedFactor = 1.0;
  let isNormal = true;
  
  // Coordinate displacement to simulate forward flight
  let distanceTraveled = 0;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    
    // Set appropriate pixel ratio for crisp text/lines
    resize();
    window.addEventListener('resize', resize);

    // Initialize static features
    generateInitialTerrain();
    generateObstacles();

    // Start rendering loop
    animate();
  }

  function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    
    // Use device pixel ratio for sharp vector lines
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    canvas.style.width = parent.clientWidth + 'px';
    canvas.style.height = parent.clientHeight + 'px';
    
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }

  function generateInitialTerrain() {
    terrainPoints = [];
    const count = 120;
    // Generate scattered points that outline a ground plane in perspective
    for (let i = 0; i < count; i++) {
      terrainPoints.push({
        x: (Math.random() - 0.5) * 400,     // Lateral offset
        z: Math.random() * 300,              // Distance ahead
        y: -30 + (Math.random() - 0.5) * 5   // Height variance
      });
    }
  }

  function generateObstacles() {
    // Dynamic array of obstacles (X, Z, width, height, label)
    obstacles = [
      { x: -55, z: 80, w: 12, h: 45, label: "OBSTACLE: CELL_TOWER", id: 1 },
      { x: 40, z: 180, w: 18, h: 55, label: "OBSTACLE: POWER_LINE_PYLON", id: 2 },
      { x: -80, z: 240, w: 25, h: 70, label: "OBSTACLE: TALL_TREE_CLUSTER", id: 3 },
      { x: 10, z: 320, w: 30, h: 60, label: "OBSTACLE: HIGH_RISE_CRANE", id: 4 }
    ];
  }

  function project(x, y, z, viewWidth, viewHeight) {
    // Simple 3D to 2D perspective projection
    // Eye position coordinate system where Z goes forward, Y is up, X is lateral
    const focalLength = 180;
    const scale = focalLength / (z + focalLength);
    
    // Center the projection on the upper-middle of the screen to view ahead
    const screenX = viewWidth / 2 + x * scale;
    const screenY = viewHeight / 2 - y * scale - 15; // Shift down slightly

    return {
      x: screenX,
      y: screenY,
      scale: scale,
      visible: z > -focalLength
    };
  }

  function setFlightSpeed(speedKnots) {
    // Update flight simulation movement rate
    flightSpeedFactor = speedKnots / 48; // Baseline speed is 48 knots
  }

  function setSystemState(nominal) {
    isNormal = nominal;
  }

  function triggerObstacleAlert(active) {
    // If active, inject a close obstacle directly in the corridor path
    const alertObstacleIdx = obstacles.findIndex(o => o.id === 99);
    
    if (active && alertObstacleIdx === -1) {
      // Add alert obstacle (close and central)
      obstacles.push({
        x: -5,
        z: 95,
        w: 16,
        h: 50,
        label: "COLLISION RISK: STRUCTURAL_CRANE",
        id: 99
      });
    } else if (!active && alertObstacleIdx !== -1) {
      // Remove it
      obstacles.splice(alertObstacleIdx, 1);
    }
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    // Clear with tactical background
    ctx.fillStyle = '#080a0d';
    ctx.fillRect(0, 0, w, h);

    // Draw coordinate grids (tactical radar lines)
    ctx.strokeStyle = 'rgba(32, 38, 48, 0.5)';
    ctx.lineWidth = 1;
    
    // Horizontal perspective grid lines
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const zVal = (i * 50) - (distanceTraveled % 50);
      const pLeft = project(-180, -30, zVal, w, h);
      const pRight = project(180, -30, zVal, w, h);
      if (pLeft.visible && pRight.visible) {
        ctx.beginPath();
        ctx.moveTo(pLeft.x, pLeft.y);
        ctx.lineTo(pRight.x, pRight.y);
        ctx.stroke();
      }
    }

    // Vertical grid lines extending to horizon
    const lineSpacing = 60;
    for (let xVal = -180; xVal <= 180; xVal += lineSpacing) {
      const pStart = project(xVal, -30, 0, w, h);
      const pEnd = project(xVal, -30, 300, w, h);
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
    }

    // Update simulation positions based on speed
    const step = 0.5 * flightSpeedFactor;
    distanceTraveled += step;

    // --- 1. Update & Render Terrain Point Cloud ---
    ctx.fillStyle = 'rgba(6, 182, 212, 0.4)'; // Cyan point cloud
    terrainPoints.forEach(pt => {
      pt.z -= step;
      // Wrap points back to the horizon when passed
      if (pt.z < 2) {
        pt.z = 300;
        pt.x = (Math.random() - 0.5) * 400;
      }

      const p = project(pt.x, pt.y, pt.z, w, h);
      if (p.visible) {
        const size = Math.max(1, p.scale * 2.5);
        ctx.fillRect(p.x, p.y, size, size);
      }
    });

    // --- 2. Render Flight Planner Corridor (Safe Zone) ---
    // A series of polygons representing the safety corridor extending forward
    const corridorPoints = [];
    const corridorWidth = 24;
    const corridorHeight = 15;
    const corridorSegmentCount = 10;
    
    // Adjust corridor shape based on status (e.g. curve corridor to show path planning)
    const curveAmount = Math.sin(Date.now() * 0.001) * 15;

    for (let idx = 0; idx <= corridorSegmentCount; idx++) {
      const zPos = idx * 28;
      // Slight bending path for aesthetics
      const xOffset = Math.sin(idx * 0.4 + Date.now() * 0.0005) * curveAmount;
      corridorPoints.push({
        left: project(xOffset - corridorWidth, -25, zPos, w, h),
        right: project(xOffset + corridorWidth, -25, zPos, w, h),
        topL: project(xOffset - corridorWidth, -25 + corridorHeight, zPos, w, h),
        topR: project(xOffset + corridorWidth, -25 + corridorHeight, zPos, w, h),
        z: zPos
      });
    }

    // Draw safety envelope bottom ribbon
    ctx.fillStyle = isNormal ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.03)';
    ctx.strokeStyle = isNormal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(corridorPoints[0].left.x, corridorPoints[0].left.y);
    for (let i = 1; i < corridorPoints.length; i++) {
      ctx.lineTo(corridorPoints[i].left.x, corridorPoints[i].left.y);
    }
    for (let i = corridorPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(corridorPoints[i].right.x, corridorPoints[i].right.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw safety corridor side lines (guideways)
    ctx.strokeStyle = isNormal ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    ctx.beginPath();
    ctx.moveTo(corridorPoints[0].left.x, corridorPoints[0].left.y);
    for (let i = 1; i < corridorPoints.length; i++) {
      ctx.lineTo(corridorPoints[i].left.x, corridorPoints[i].left.y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(corridorPoints[0].right.x, corridorPoints[0].right.y);
    for (let i = 1; i < corridorPoints.length; i++) {
      ctx.lineTo(corridorPoints[i].right.x, corridorPoints[i].right.y);
    }
    ctx.stroke();

    // --- 3. Draw Sweeping Scanner cone on LiDAR canvas ---
    sweepAngle = (sweepAngle + 0.015) % (Math.PI * 2);
    const sweepZ = 150 + Math.sin(sweepAngle) * 120;
    const sweepX = Math.cos(sweepAngle) * 120;
    const pCenter = project(0, 0, 0, w, h);
    const pSweepEnd = project(sweepX, -30, sweepZ, w, h);
    
    if (pSweepEnd.visible) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.beginPath();
      ctx.moveTo(pCenter.x, pCenter.y - 10);
      ctx.lineTo(pSweepEnd.x, pSweepEnd.y);
      ctx.stroke();
    }

    // --- 4. Update & Render Obstacles ---
    obstacles.forEach(obs => {
      obs.z -= step;
      // Reset obstacle to far horizon
      if (obs.z < -40) {
        obs.z = 320;
        obs.x = (Math.random() - 0.5) * 180;
        // Don't spawn alert obstacle again if reset
        if (obs.id === 99) {
          obs.z = -100; // Keep offscreen
        }
      }

      // Check if this obstacle is close and represents a crash threat
      const isDangerous = obs.id === 99 || (Math.abs(obs.x) < 20 && obs.z < 120 && obs.z > 0);

      // Bounding box wireframe projection
      const basePoints = [
        project(obs.x - obs.w/2, -30, obs.z - obs.w/2, w, h), // Front Left
        project(obs.x + obs.w/2, -30, obs.z - obs.w/2, w, h), // Front Right
        project(obs.x + obs.w/2, -30, obs.z + obs.w/2, w, h), // Rear Right
        project(obs.x - obs.w/2, -30, obs.z + obs.w/2, w, h)  // Rear Left
      ];

      const topPoints = [
        project(obs.x - obs.w/2, -30 + obs.h, obs.z - obs.w/2, w, h),
        project(obs.x + obs.w/2, -30 + obs.h, obs.z - obs.w/2, w, h),
        project(obs.x + obs.w/2, -30 + obs.h, obs.z + obs.w/2, w, h),
        project(obs.x - obs.w/2, -30 + obs.h, obs.z + obs.w/2, w, h)
      ];

      // Draw obstacle wireframe box
      if (basePoints[0].visible) {
        ctx.strokeStyle = isDangerous ? 'rgba(239, 68, 68, 0.85)' : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = isDangerous ? 1.5 : 1;
        ctx.fillStyle = isDangerous ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.02)';

        // Draw bottom plane
        ctx.beginPath();
        ctx.moveTo(basePoints[0].x, basePoints[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(basePoints[i].x, basePoints[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw top plane
        ctx.beginPath();
        ctx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(topPoints[i].x, topPoints[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw vertical columns
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(basePoints[i].x, basePoints[i].y);
          ctx.lineTo(topPoints[i].x, topPoints[i].y);
          ctx.stroke();
        }

        // Draw tag text label above obstacle
        if (obs.z < 200) {
          ctx.fillStyle = isDangerous ? '#ef4444' : '#f59e0b';
          ctx.font = '8px "JetBrains Mono"';
          ctx.fillText(obs.label, topPoints[0].x - 10, topPoints[0].y - 6);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillText(`DIST: ${Math.round(obs.z)}m | AZ: ${Math.round(obs.x)}m`, topPoints[0].x - 10, topPoints[0].y - 15);
        }
      }
    });

    // --- 5. Draw HUD telemetry overlays inside Canvas ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '8.5px "JetBrains Mono"';
    
    // Bottom right metadata overlay
    ctx.fillText("VOXEL GRID SCANNER ACTIVE", w - 150, h - 35);
    ctx.fillText("LIDAR SWEEP: 360° @ 25Hz", w - 150, h - 24);
    ctx.fillText(`OBSTACLES DETECTED: ${obstacles.filter(o => o.z > 0 && o.z < 300).length}`, w - 150, h - 13);

    // Top-left status
    ctx.fillStyle = isNormal ? 'var(--status-nominal)' : 'var(--status-critical)';
    ctx.fillRect(10, 10, 5, 5);
    ctx.fillStyle = '#64748b';
    ctx.fillText("COLLISION INTERCEPT MATRIX", 20, 15);

    // Scale reference scale-bar
    ctx.strokeStyle = '#202630';
    ctx.beginPath();
    ctx.moveTo(10, h - 20);
    ctx.lineTo(10, h - 15);
    ctx.lineTo(90, h - 15);
    ctx.lineTo(90, h - 20);
    ctx.stroke();
    ctx.fillText("SCALE: 1:50m", 15, h - 25);
  }

  return {
    init: init,
    setFlightSpeed: setFlightSpeed,
    setSystemState: setSystemState,
    triggerObstacleAlert: triggerObstacleAlert
  };
})();

// Export globally
window.WorldModel = WorldModel;
