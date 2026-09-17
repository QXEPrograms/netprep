// ---- Inline SVG diagrams referenced by objective.diagram ----

function svgOSI(){
  const layers = [
    ['7','Application','HTTP &middot; FTP &middot; DNS'],
    ['6','Presentation','Encryption &middot; Compression'],
    ['5','Session','Session mgmt'],
    ['4','Transport','TCP &middot; UDP'],
    ['3','Network','IP &middot; Routing'],
    ['2','Data Link','MAC &middot; Switching'],
    ['1','Physical','Cables &middot; Signals'],
  ];
  const w = 560, rowH = 40, gap = 6, top = 8;
  const rows = layers.map((l,i) => {
    const y = top + i * (rowH + gap);
    return `<g>
      <rect x="0" y="${y}" width="${w}" height="${rowH}" rx="9" fill="rgba(255,255,255,0.04)" stroke="var(--border,#252329)"/>
      <rect x="0" y="${y}" width="34" height="${rowH}" rx="9" fill="var(--primary,#c893ff)" opacity="0.85"/>
      <rect x="18" y="${y}" width="16" height="${rowH}" fill="var(--primary,#c893ff)" opacity="0.85"/>
      <text x="17" y="${y + rowH/2 + 5}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="var(--on-primary,#3b1a52)" font-weight="700">${l[0]}</text>
      <text x="46" y="${y + rowH/2 - 2}" font-family="JetBrains Mono, monospace" font-size="13.5" fill="#f0eef4" font-weight="600">${l[1]}</text>
      <text x="46" y="${y + rowH/2 + 14}" font-family="Inter, sans-serif" font-size="11" fill="#8f8d96">${l[2]}</text>
    </g>`;
  }).join('');
  const h = top*2 + layers.length*(rowH+gap) - gap;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OSI model, seven layers from Application down to Physical">${rows}</svg>`;
}

function svgTopology(){
  const cell = (cx, cy, label, nodes) => {
    let inner = '';
    if(label === 'Bus'){
      inner = `<line x1="${cx-45}" y1="${cy}" x2="${cx+45}" y2="${cy}" stroke="#c893ff" stroke-width="3"/>`;
      [-45,-15,15,45].forEach(dx => { inner += `<circle cx="${cx+dx}" cy="${cy}" r="6" fill="#a78bfa"/>`; });
    } else if(label === 'Ring'){
      inner = `<circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="#c893ff" stroke-width="3"/>`;
      for(let i=0;i<5;i++){ const a = (i/5)*2*Math.PI - Math.PI/2; inner += `<circle cx="${cx+40*Math.cos(a)}" cy="${cy+40*Math.sin(a)}" r="6" fill="#a78bfa"/>`; }
    } else if(label === 'Star'){
      inner = '';
      const pts = [];
      for(let i=0;i<5;i++){ const a=(i/5)*2*Math.PI - Math.PI/2; pts.push([cx+42*Math.cos(a), cy+42*Math.sin(a)]); }
      pts.forEach(p => { inner += `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#c893ff" stroke-width="2.5"/>`; });
      inner += `<circle cx="${cx}" cy="${cy}" r="8" fill="#c893ff"/>`;
      pts.forEach(p => { inner += `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#a78bfa"/>`; });
    } else if(label === 'Mesh'){
      const pts = [];
      for(let i=0;i<5;i++){ const a=(i/5)*2*Math.PI - Math.PI/2; pts.push([cx+42*Math.cos(a), cy+42*Math.sin(a)]); }
      for(let i=0;i<pts.length;i++){ for(let j=i+1;j<pts.length;j++){ inner += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[j][0]}" y2="${pts[j][1]}" stroke="#c893ff" stroke-width="1.6" opacity="0.65"/>`; } }
      pts.forEach(p => { inner += `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#a78bfa"/>`; });
    }
    return `<g>${inner}<text x="${cx}" y="${cy+68}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" font-weight="600" fill="#f0eef4">${label}</text></g>`;
  };
  const w = 560, h = 200;
  const centers = [[80,90],[220,90],[360,90],[500,90]];
  const labels = ['Bus','Ring','Star','Mesh'];
  const cells = labels.map((l,i) => cell(centers[i][0], centers[i][1], l)).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four network topology diagrams: bus, ring, star, and mesh">${cells}</svg>`;
}

function svgCables(){
  const w = 560, h = 180;
  const utp = `<g transform="translate(20,20)">
    <rect x="0" y="0" width="150" height="90" rx="10" fill="rgba(255,255,255,0.03)" stroke="#252329"/>
    <circle cx="45" cy="45" r="26" fill="none" stroke="#f87171" stroke-width="2.5"/>
    <circle cx="70" cy="45" r="26" fill="none" stroke="#c893ff" stroke-width="2.5"/>
    <text x="75" y="80" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" font-weight="600" fill="#f0eef4">UTP</text>
  </g>`;
  const stp = `<g transform="translate(205,20)">
    <rect x="0" y="0" width="150" height="90" rx="10" fill="rgba(255,255,255,0.03)" stroke="#252329"/>
    <circle cx="75" cy="42" r="32" fill="none" stroke="#8f8d96" stroke-width="2.5" stroke-dasharray="3 3"/>
    <circle cx="60" cy="42" r="20" fill="none" stroke="#f87171" stroke-width="2.5"/>
    <circle cx="85" cy="42" r="20" fill="none" stroke="#c893ff" stroke-width="2.5"/>
    <text x="75" y="80" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" font-weight="600" fill="#f0eef4">STP (shielded)</text>
  </g>`;
  const coax = `<g transform="translate(390,20)">
    <rect x="0" y="0" width="150" height="90" rx="10" fill="rgba(255,255,255,0.03)" stroke="#252329"/>
    <circle cx="75" cy="42" r="32" fill="none" stroke="#8f8d96" stroke-width="2.5"/>
    <circle cx="75" cy="42" r="21" fill="none" stroke="#57555d" stroke-width="2"/>
    <circle cx="75" cy="42" r="6" fill="#a78bfa"/>
    <text x="75" y="80" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" font-weight="600" fill="#f0eef4">Coaxial</text>
  </g>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cross-section comparison of UTP, STP, and coaxial cable">${utp}${stp}${coax}</svg>`;
}

const DIAGRAMS = { osi: svgOSI, topology: svgTopology, cables: svgCables };

function iconSvg(name){
  const icons = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    flame: '<path d="M12 2c2 3-1 4-1 7a4 4 0 1 0 8 0c0-1-1-2-1-2 1 4-1 6-3 7 3-1 5-4 5-8 0-5-4-8-8-9 1 2 1 4 0 5z"/>',
    flag: '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5" fill="currentColor"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5"/><path d="M4 4.5v16A2.5 2.5 0 0 0 6.5 20H20"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 1.7-2.3 3.5"/><line x1="12" y1="17" x2="12" y2="17"/>',
    replay: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    stopCircle: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="19"/><line x1="8" y1="19" x2="8" y2="19"/><line x1="12" y1="19" x2="12" y2="19"/>',
    dice: '<path d="M20 12 12 3 4 12l8 9z"/><path d="M12 3v18"/><path d="M4 12h16"/>',
    cards: '<rect x="7" y="3" width="14" height="10" rx="2" transform="rotate(6 14 8)"/><rect x="3" y="7" width="14" height="14" rx="2"/>',
  };
  return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;">${icons[name] || ''}</svg>`;
}
