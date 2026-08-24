/**
 * map.js
 * Tactical Live Map module using Leaflet.js.
 * Displays real-time GPS positioning, planned flight track, geofencing,
 * active waypoint tracking, and dynamic weather overlays with a dark military aesthetic.
 */

const TacticalMap = (function() {
  let map;
  let droneMarker;
  let plannedPathLine;
  let actualPathLine;
  let geofencePolygon;
  let weatherRadarCircle;
  let waypointMarkers = [];
  
  // Custom flight corridor coordinates (Silicon Valley Bay transit from SF base to Oakland cargo port)
  const baseAlpha = [37.7749, -122.4194]; // SF Base
  const waypoints = [
    { coords: [37.7749, -122.4194], name: "WP0: BASE ALPHA (SF)" },
    { coords: [37.7895, -122.3852], name: "WP1: CHANNELS TRANSIT" },
    { coords: [37.8052, -122.3481], name: "WP2: ALAMEDA ANCHORAGE" },
    { coords: [37.8188, -122.3162], name: "WP3: INTERCEPT MID-BAY" },
    { coords: [37.8295, -122.2910], name: "WP4: BASE TERMINAL (OAK)" }
  ];

  let actualFlightPathCoords = [];

  function init(mapId) {
    // 1. Initialize Leaflet Map
    map = L.map(mapId, {
      center: [37.802, -122.355],
      zoom: 12,
      zoomControl: true,
      attributionControl: true
    });

    // 2. Add CartoDB Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 3. Draw Planned Path (Teal dashed line representing planned mission corridor)
    const plannedCoords = waypoints.map(wp => wp.coords);
    plannedPathLine = L.polyline(plannedCoords, {
      color: '#06b6d4',
      weight: 2,
      dashArray: '5, 8',
      opacity: 0.75
    }).addTo(map);

    // 4. Draw Geofence Boundary (Red warning outline around corridor)
    drawGeofence();

    // 5. Draw Weather Radar Overlay (Amber hazard circle for wind/thermal warning)
    drawWeatherOverlay();

    // 6. Draw Waypoint Markers
    drawWaypoints();

    // 7. Initialize Drone Marker (Custom SVG icon representing heavy cargo drone)
    initDroneMarker();

    // 8. Start actual flight path tracker
    actualPathLine = L.polyline([], {
      color: '#10b981', // Solid Emerald Green for completed path
      weight: 3,
      opacity: 0.9
    }).addTo(map);

    // 9. Force size recalculation to resolve startup hidden container dimensions
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 250);
  }

  function drawGeofence() {
    // Defines a safe flight envelope corridor around the flight path
    const geofenceCoords = [
      [37.7650, -122.4280],
      [37.7850, -122.3980],
      [37.8000, -122.3620],
      [37.8120, -122.3300],
      [37.8220, -122.3020],
      [37.8380, -122.2800], // End corner
      [37.8240, -122.2700], // Back width
      [37.8100, -122.2980],
      [37.7980, -122.3250],
      [37.7880, -122.3520],
      [37.7700, -122.3780],
      [37.7600, -122.4080]
    ];

    geofencePolygon = L.polygon(geofenceCoords, {
      color: '#ef4444',
      weight: 1,
      dashArray: '3, 6',
      fillColor: '#ef4444',
      fillOpacity: 0.03
    }).addTo(map);
  }

  function drawWeatherOverlay() {
    // Simulates an amber METAR weather warning circle (e.g. 24kt wind gusts zone)
    // Located near mid-bay WP2
    weatherRadarCircle = L.circle([37.8040, -122.3520], {
      radius: 1200, // 1.2km
      color: '#f59e0b',
      weight: 1,
      fillColor: '#f59e0b',
      fillOpacity: 0.12
    }).addTo(map);

    // Bind tooltip/popup
    weatherRadarCircle.bindTooltip("TACTICAL MSG: HIGH THERMAL INVERSION & GUSTS ZONE (22kts)", {
      permanent: false,
      direction: 'top',
      className: 'weather-tooltip'
    });
  }

  function drawWaypoints() {
    // Custom icon for base stations
    const baseIcon = L.divIcon({
      html: `<div class="base-marker-svg"><svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" fill="none" stroke="#06b6d4" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="#06b6d4"/></svg></div>`,
      className: 'custom-div-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const nodeIcon = L.divIcon({
      html: `<div class="node-marker-svg"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#1e293b" stroke="#06b6d4" stroke-width="1.5"/></svg></div>`,
      className: 'custom-div-icon',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });

    waypoints.forEach((wp, idx) => {
      const isTerminal = (idx === 0 || idx === waypoints.length - 1);
      const marker = L.marker(wp.coords, {
        icon: isTerminal ? baseIcon : nodeIcon
      }).addTo(map);

      marker.bindPopup(`<b>${wp.name}</b><br/>LAT: ${wp.coords[0].toFixed(5)}<br/>LNG: ${wp.coords[1].toFixed(5)}`);
      waypointMarkers.push(marker);
    });
  }

  function initDroneMarker() {
    // Custom SVG arrow marker that rotates with the drone's heading (yaw)
    const droneSVG = `
      <div id="drone-map-svg" style="transform: rotate(45deg); transition: transform 0.2s ease;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Drone fuselage shape -->
          <path d="M12 2L4 21L12 17L20 21L12 2Z" fill="#11141a" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="12" cy="11" r="2" fill="#10b981"/>
        </svg>
      </div>
    `;

    const icon = L.divIcon({
      html: droneSVG,
      className: 'custom-div-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    droneMarker = L.marker(baseAlpha, { icon: icon }).addTo(map);
  }

  function updateDronePosition(coords, heading) {
    if (!droneMarker) return;

    // 1. Move drone marker to new coordinates
    droneMarker.setLatLng(coords);

    // 2. Rotate the SVG icon to match aircraft heading
    const svgElement = document.getElementById('drone-map-svg');
    if (svgElement) {
      svgElement.style.transform = `rotate(${heading}deg)`;
    }

    // 3. Append to actual flight path record and update trail line
    actualFlightPathCoords.push(coords);
    actualPathLine.setLatLngs(actualFlightPathCoords);
  }

  function toggleRadarLayer() {
    if (map.hasLayer(weatherRadarCircle)) {
      map.removeLayer(weatherRadarCircle);
      return false;
    } else {
      weatherRadarCircle.addTo(map);
      return true;
    }
  }

  function toggleGeofenceLayer() {
    if (map.hasLayer(geofencePolygon)) {
      map.removeLayer(geofencePolygon);
      return false;
    } else {
      geofencePolygon.addTo(map);
      return true;
    }
  }

  function panToCoords(coords) {
    if (map) {
      map.panTo(coords);
    }
  }

  return {
    init: init,
    updateDronePosition: updateDronePosition,
    toggleRadarLayer: toggleRadarLayer,
    toggleGeofenceLayer: toggleGeofenceLayer,
    panToCoords: panToCoords,
    waypoints: waypoints
  };
})();

// Export globally
window.TacticalMap = TacticalMap;
