/**
 * drone3d.js
 * 3D Telemetry and Attitude visualizer using Three.js.
 * Renders a coaxial octocopter cargo drone with real-time attitude adjustments,
 * spinning propellers, sensor sweeps, and motor failure representations.
 */

const Drone3D = (function() {
  let scene, camera, renderer;
  let droneGroup, sceneRotationGroup;
  let propellers = [];
  let motorIndicators = [];
  let lidarBeam;
  
  // Mouse interaction state
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0.2, y: -0.6 }; // Initial isometric view angle
  
  // Drone state variables
  let droneAttitude = { pitch: 0, roll: 0, yaw: 45 };
  let motorStatus = [1, 1, 1, 1, 1, 1, 1, 1]; // 1 = OK, 0.5 = Warning, 0 = Failed
  let throttle = 0.65;
  
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0f13); // Match dashboard background
    scene.fog = new THREE.FogExp2(0x0c0f13, 0.05);

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 4, 11);
    camera.lookAt(0, 0, 0);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x223344, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x3b82f6, 1.2); // Cool blue light
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 0.5); // Subtle green fill
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // 5. Grid Helper (NASA tactical reference grid)
    const gridHelper = new THREE.GridHelper(30, 30, 0x3b485d, 0x1f2937);
    gridHelper.position.y = -2.5;
    scene.add(gridHelper);

    // 6. Build the Drone model
    buildDrone();

    // 7. Mouse Listeners for orbit rotation
    setupInteraction(container);

    // 8. Handle Window Resize
    window.addEventListener('resize', onWindowResize);

    // 9. Start Loop
    animate();

    // 10. Delayed resize to resolve initial layout width/height dimension mismatch
    setTimeout(onWindowResize, 150);
  }

  function buildDrone() {
    // Rotation group representing the view orientation (controlled by drag)
    sceneRotationGroup = new THREE.Group();
    sceneRotationGroup.rotation.x = targetRotation.x;
    sceneRotationGroup.rotation.y = targetRotation.y;
    scene.add(sceneRotationGroup);

    // Drone group representing the physical drone and its pitch/roll/yaw telemetry
    droneGroup = new THREE.Group();
    sceneRotationGroup.add(droneGroup);

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.5,
      metalness: 0.8,
      flatShading: true
    });
    
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x0f1115,
      roughness: 0.7,
      metalness: 0.9,
      flatShading: true
    });

    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });

    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.3,
      metalness: 0.7
    });

    const cargoMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.6,
      metalness: 0.5,
      flatShading: true
    });

    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });

    // --- A. Main Fuselage ---
    const fuselageGeom = new THREE.BoxGeometry(3.6, 0.7, 1.3);
    const fuselage = new THREE.Mesh(fuselageGeom, bodyMat);
    droneGroup.add(fuselage);

    // Overlay wireframe to give that "tactical system model" look
    const fuselageWire = new THREE.Mesh(fuselageGeom, wireframeMat);
    fuselageWire.scale.set(1.01, 1.01, 1.01);
    fuselage.add(fuselageWire);

    // --- B. Cargo Bay Pod ---
    const cargoGeom = new THREE.BoxGeometry(2.0, 0.8, 1.1);
    const cargoPod = new THREE.Mesh(cargoGeom, cargoMat);
    cargoPod.position.set(0, -0.65, 0);
    droneGroup.add(cargoPod);
    
    // Cargo indicator straps / brackets
    const strapGeom = new THREE.BoxGeometry(0.1, 0.9, 1.15);
    const strapL = new THREE.Mesh(strapGeom, bodyMat);
    strapL.position.set(-0.7, -0.65, 0);
    const strapR = new THREE.Mesh(strapGeom, bodyMat);
    strapR.position.set(0.7, -0.65, 0);
    droneGroup.add(strapL);
    droneGroup.add(strapR);

    // --- C. Booms (Coaxial Octocopter arms in X layout) ---
    const armLength = 2.4;
    const armAngle = Math.PI / 4; // 45 degrees
    const armOffset = 0.3; // Offset from center
    const armPositions = [
      { x: Math.cos(armAngle), z: Math.sin(armAngle), rot: -armAngle }, // Front Right
      { x: -Math.cos(armAngle), z: Math.sin(armAngle), rot: armAngle },  // Front Left
      { x: -Math.cos(armAngle), z: -Math.sin(armAngle), rot: -armAngle }, // Rear Left
      { x: Math.cos(armAngle), z: -Math.sin(armAngle), rot: armAngle }   // Rear Right
    ];

    armPositions.forEach((pos, idx) => {
      const armGeom = new THREE.CylinderGeometry(0.08, 0.08, armLength, 8);
      const arm = new THREE.Mesh(armGeom, carbonMat);
      
      // Orient arm horizontally outward
      arm.rotation.x = Math.PI / 2;
      arm.rotation.z = pos.rot;
      arm.position.set(pos.x * (armLength/2 + armOffset), 0, pos.z * (armLength/2 + armOffset));
      droneGroup.add(arm);

      // --- D. Coaxial Motor Pods (One Top, One Bottom at end of each arm) ---
      const motorEndPosX = pos.x * (armLength + armOffset);
      const motorEndPosZ = pos.z * (armLength + armOffset);

      // We have 8 motors total. 4 arms * 2 motors per arm (coaxial configuration).
      // Top motor indexes: 0, 2, 4, 6. Bottom motor indexes: 1, 3, 5, 7.
      createMotorPod(motorEndPosX, 0.3, motorEndPosZ, idx * 2);     // Top Motor
      createMotorPod(motorEndPosX, -0.3, motorEndPosZ, idx * 2 + 1); // Bottom Motor
    });

    // --- E. LiDAR Spinner (Top Sensor Pod) ---
    const lidarPodGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 12);
    const lidarPod = new THREE.Mesh(lidarPodGeom, bodyMat);
    lidarPod.position.set(0, 0.45, 0);
    droneGroup.add(lidarPod);

    // Dynamic LiDAR laser projection cone
    const lidarBeamGeom = new THREE.ConeGeometry(3.5, 2.5, 32, 1, true);
    lidarBeam = new THREE.Mesh(lidarBeamGeom, laserMat);
    lidarBeam.position.set(0, -0.8, 0);
    lidarBeam.rotation.x = Math.PI;
    lidarPod.add(lidarBeam);

    // --- F. Camera Gimbal Nose Pod ---
    const gimbalGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const gimbal = new THREE.Mesh(gimbalGeom, bodyMat);
    gimbal.position.set(1.9, -0.2, 0);
    droneGroup.add(gimbal);
    
    const lensGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12);
    const lens = new THREE.Mesh(lensGeom, new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.15, 0, 0);
    gimbal.add(lens);
  }

  function createMotorPod(x, y, z, motorIdx) {
    const motorPodGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 12);
    
    // Status-colored material (Green nominal, Amber warn, Red critical)
    const motorStatusMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.5,
      metalness: 0.5
    });
    
    const pod = new THREE.Mesh(motorPodGeom, motorStatusMat);
    pod.position.set(x, y, z);
    droneGroup.add(pod);

    // Store reference to dynamically color motors later
    motorIndicators[motorIdx] = pod;

    // --- Propeller (Rotor) ---
    const propGroup = new THREE.Group();
    propGroup.position.set(x, y + (y > 0 ? 0.2 : -0.2), z);
    droneGroup.add(propGroup);

    const propBladeGeom = new THREE.BoxGeometry(1.2, 0.015, 0.07);
    const blade1 = new THREE.Mesh(propBladeGeom, new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      transparent: true,
      opacity: 0.85
    }));
    propGroup.add(blade1);

    // Hub center cap
    const hubGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
    const hub = new THREE.Mesh(hubGeom, new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    hub.position.y = 0.01;
    propGroup.add(hub);

    // Save propeller group and its index to animate spinning
    propellers.push({
      group: propGroup,
      index: motorIdx,
      direction: motorIdx % 2 === 0 ? 1 : -1 // Clockwise vs Counter-clockwise pairing
    });
  }

  function setupInteraction(container) {
    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    container.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y
      };

      targetRotation.y += deltaMove.x * 0.007;
      targetRotation.x += deltaMove.y * 0.007;

      // Limit pitch drag so user doesn't flip completely upside down
      targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 2, targetRotation.x));

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Zoom listener (mouse wheel)
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.position.z += e.deltaY * 0.005;
      camera.position.z = Math.max(5, Math.min(22, camera.position.z));
      camera.position.y = camera.position.z * 0.36; // Keep isometric perspective angle
    }, { passive: false });
  }

  function onWindowResize() {
    const container = document.getElementById('three-drone-container');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function updateDroneAttitude(pitch, roll, yaw) {
    droneAttitude.pitch = pitch;
    droneAttitude.roll = roll;
    droneAttitude.yaw = yaw;
  }

  function updateMotorStatus(index, status) {
    if (index >= 0 && index < motorStatus.length) {
      motorStatus[index] = status;
    }
  }

  function updateThrottle(t) {
    throttle = Math.max(0, Math.min(1.2, t));
  }

  function animate() {
    requestAnimationFrame(animate);

    // 1. Smoothly interpolate view rotation to match user dragging target
    if (sceneRotationGroup) {
      sceneRotationGroup.rotation.y += (targetRotation.y - sceneRotationGroup.rotation.y) * 0.1;
      sceneRotationGroup.rotation.x += (targetRotation.x - sceneRotationGroup.rotation.x) * 0.1;
    }

    // 2. Apply Telemetry Attitude Rotation to Drone (pitch, roll, yaw)
    // Converts pitch/roll/yaw from degrees to radians and applies
    if (droneGroup) {
      // Roll (X), Yaw (Y), Pitch (Z) in drone coordinate frame
      const pitchRad = (droneAttitude.pitch * Math.PI) / 180;
      const rollRad = (droneAttitude.roll * Math.PI) / 180;
      const yawRad = ((droneAttitude.yaw - 45) * Math.PI) / 180; //Offset initial 45 deg visual angle

      droneGroup.rotation.set(rollRad, yawRad, pitchRad);
    }

    // 3. Spin Propellers based on throttle and individual motor health status
    propellers.forEach(prop => {
      const health = motorStatus[prop.index];
      const speed = throttle * health * 0.4 * prop.direction;
      prop.group.rotation.y += speed;

      // Make rotor look transparent when spinning fast
      prop.group.children[0].material.opacity = Math.max(0.15, 0.9 - Math.abs(speed * 3.5));
    });

    // 4. Update Motor Pod colors dynamically based on simulation health
    motorStatus.forEach((health, idx) => {
      const pod = motorIndicators[idx];
      if (pod) {
        if (health === 1) {
          pod.material.color.setHex(0x10b981); // Emerald Green
        } else if (health === 0.5) {
          // Warning pulsing orange
          const pulse = (Math.sin(Date.now() * 0.01) + 1) / 2;
          pod.material.color.setHSL(0.08, 0.9, 0.3 + pulse * 0.3); 
        } else {
          // Fault flashing red
          const flash = Math.floor(Date.now() * 0.007) % 2;
          pod.material.color.setHex(flash ? 0xef4444 : 0x2d0505);
        }
      }
    });

    // 5. Sweep LiDAR Scan cone
    if (lidarBeam) {
      lidarBeam.rotation.y += 0.02;
    }

    renderer.render(scene, camera);
  }

  return {
    init: init,
    updateDroneAttitude: updateDroneAttitude,
    updateMotorStatus: updateMotorStatus,
    updateThrottle: updateThrottle
  };
})();

// Export global variable so other scripts can access
window.Drone3D = Drone3D;
