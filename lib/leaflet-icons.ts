/**
 * leaflet-icons.ts
 * Reusable custom Leaflet icons for Campus Shuttle Guidance System.
 */

export function createShuttleIcon(L: any, heading: number, zoomLevel: number = 17) {
  const size = zoomLevel >= 18 ? 48 : 40
  const half = size / 2

  // SVG representation of the green UinGO shuttle vehicle
  const svgHtml = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3));
      transform: rotate(${heading}deg);
      transform-origin: center center;
      transition: transform 0.2s ease, width 0.2s ease, height 0.2s ease;
    ">
      <svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Side mirrors -->
        <rect x="5" y="11" width="3" height="6" rx="1.5" fill="#1e293b"/>
        <rect x="32" y="11" width="3" height="6" rx="1.5" fill="#1e293b"/>
        
        <!-- Tires -->
        <rect x="6" y="8" width="4" height="8" rx="2" fill="#0f172a"/>
        <rect x="30" y="8" width="4" height="8" rx="2" fill="#0f172a"/>
        <rect x="6" y="26" width="4" height="8" rx="2" fill="#0f172a"/>
        <rect x="30" y="26" width="4" height="8" rx="2" fill="#0f172a"/>

        <!-- Bus Main Body (Green) -->
        <rect x="9" y="4" width="22" height="32" rx="5" fill="#16a34a" stroke="#15803d" stroke-width="2"/>
        
        <!-- Front windshield -->
        <path d="M12 9C12 7.89543 12.8954 7 14 7H26C27.1046 7 28 7.89543 28 9V12H12V9Z" fill="#e2e8f0"/>
        <path d="M13 8h14v1H13z" fill="#ffffff" opacity="0.4"/>

        <!-- Rear Window -->
        <path d="M12 31V33C12 34.1046 12.8954 35 14 35H26C27.1046 35 28 34.1046 28 33V31H12Z" fill="#cbd5e1"/>
        
        <!-- Side Windows -->
        <rect x="11" y="14" width="2" height="5" rx="0.5" fill="#e2e8f0"/>
        <rect x="27" y="14" width="2" height="5" rx="0.5" fill="#e2e8f0"/>
        <rect x="11" y="20" width="2" height="5" rx="0.5" fill="#e2e8f0"/>
        <rect x="27" y="20" width="2" height="5" rx="0.5" fill="#e2e8f0"/>
        <rect x="11" y="25" width="2" height="4" rx="0.5" fill="#e2e8f0"/>
        <rect x="27" y="25" width="2" height="4" rx="0.5" fill="#e2e8f0"/>

        <!-- Roof Details -->
        <rect x="14" y="14" width="12" height="15" rx="2" fill="#22c55e" stroke="#15803d" stroke-width="1"/>
        <rect x="16" y="16" width="8" height="3" rx="1" fill="#16a34a"/>
        <rect x="16" y="21" width="8" height="3" rx="1" fill="#16a34a"/>
        <rect x="16" y="25" width="8" height="2" rx="1" fill="#16a34a"/>

        <!-- Headlights -->
        <circle cx="12" cy="6" r="1.5" fill="#fff"/>
        <circle cx="28" cy="6" r="1.5" fill="#fff"/>
      </svg>
    </div>
  `

  return L.divIcon({
    className: 'shuttle-div-icon',
    html: svgHtml,
    iconSize: [size, size],
    iconAnchor: [half, half],
  })
}
