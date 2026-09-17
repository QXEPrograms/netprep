// ---- Friendly, colorful illustrations for lesson objectives ----
// Shared shape kit so each scene stays short. viewBox is always 0 0 320 190.
const IC = { blue:'var(--primary)', violet:'var(--accent)', green:'var(--success)', amber:'var(--warning)', red:'var(--danger)', sky:'#38bdf8', orange:'#fb923c', yellow:'#facc15', pink:'#f472b6', ink:'#f0eef4', mute:'#57555d' };

function wrap(inner){ return `<svg viewBox="0 0 320 190" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }
function label(x,y,text,size){ return `<text x="${x}" y="${y}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="${size||12}" font-weight="700" fill="${IC.ink}">${text}</text>`; }
function sublabel(x,y,text){ return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="${IC.mute}">${text}</text>`; }

function ilComputer(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-24" y="-18" width="48" height="32" rx="4" fill="${color}"/>
  <rect x="-18" y="-12" width="36" height="21" rx="2" fill="rgba(10,14,26,0.4)"/>
  <rect x="-9" y="15" width="18" height="5" rx="2" fill="${color}"/>
  <rect x="-16" y="21" width="32" height="4" rx="2" fill="${color}" opacity="0.55"/>
</g>`; }

function ilServer(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-16" y="-24" width="32" height="48" rx="4" fill="${color}"/>
  <circle cx="-8" cy="-16" r="2.4" fill="rgba(255,255,255,0.9)"/>
  <rect x="-9" y="-8" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
  <rect x="-9" y="0" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
  <rect x="-9" y="8" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
</g>`; }

function ilRouter(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-26" y="-8" width="52" height="24" rx="6" fill="${color}"/>
  <line x1="-14" y1="-8" x2="-20" y2="-24" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  <line x1="14" y1="-8" x2="20" y2="-24" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="-16" cy="4" r="2.2" fill="rgba(255,255,255,0.85)"/>
  <circle cx="-6" cy="4" r="2.2" fill="rgba(255,255,255,0.85)"/>
  <circle cx="4" cy="4" r="2.2" fill="rgba(255,255,255,0.85)"/>
</g>`; }

function ilCloud(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <path d="M-30 8 a16 16 0 0 1 6-31 a20 20 0 0 1 38-4 a15 15 0 0 1 4 29 a15 15 0 0 1-3 6z" fill="${color}"/>
</g>`; }

function ilHouse(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <polygon points="0,-26 -22,-4 22,-4" fill="${color}"/>
  <rect x="-16" y="-4" width="32" height="24" rx="2" fill="${color}" opacity="0.85"/>
  <rect x="-5" y="6" width="10" height="14" fill="rgba(10,14,26,0.4)"/>
</g>`; }

function ilPerson(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <circle cx="0" cy="-14" r="8" fill="${color}"/>
  <path d="M-13 16c0-11 6-18 13-18s13 7 13 18" fill="${color}"/>
</g>`; }

function ilLock(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <path d="M-10-4v-6a10 10 0 0 1 20 0v6" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
  <rect x="-14" y="-4" width="28" height="22" rx="5" fill="${color}"/>
  <circle cx="0" cy="7" r="3" fill="rgba(10,14,26,0.5)"/>
</g>`; }

function ilShield(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <path d="M0-22 18-15v14c0 12-8 20-18 24-10-4-18-12-18-24v-14z" fill="${color}"/>
</g>`; }

function ilWifi(x,y,s,color,n){ n=n||3; let g=''; for(let i=0;i<n;i++){ const r=10+i*9; g+=`<path d="M${x-r} ${y} a${r} ${r} 0 0 1 ${r*2} 0" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" opacity="${1-i*0.22}"/>`; } return g + `<circle cx="${x}" cy="${y+2}" r="3" fill="${color}"/>`; }

function ilEnvelope(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-16" y="-11" width="32" height="22" rx="3" fill="${color}"/>
  <polyline points="-16,-11 0,2 16,-11" fill="none" stroke="rgba(10,14,26,0.4)" stroke-width="2.4"/>
</g>`; }

function ilArrow(x1,y1,x2,y2,color){ return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.6" stroke-linecap="round" marker-end="url(#arrowhead)"/>`; }
const ARROW_DEFS = `<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--text-faint)"/></marker></defs>`;

function ilBug(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <ellipse cx="0" cy="0" rx="10" ry="14" fill="${color}"/>
  <line x1="-10" y1="-8" x2="-18" y2="-14" stroke="${color}" stroke-width="2.4"/>
  <line x1="10" y1="-8" x2="18" y2="-14" stroke="${color}" stroke-width="2.4"/>
  <line x1="-11" y1="0" x2="-19" y2="0" stroke="${color}" stroke-width="2.4"/>
  <line x1="11" y1="0" x2="19" y2="0" stroke="${color}" stroke-width="2.4"/>
  <line x1="-10" y1="8" x2="-18" y2="14" stroke="${color}" stroke-width="2.4"/>
  <line x1="10" y1="8" x2="18" y2="14" stroke="${color}" stroke-width="2.4"/>
</g>`; }

function ilKey(x,y,s,color){ return `<g transform="translate(${x},${y}) scale(${s})">
  <circle cx="-12" cy="0" r="9" fill="none" stroke="${color}" stroke-width="4.5"/>
  <line x1="-4" y1="0" x2="18" y2="0" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="10" y1="0" x2="10" y2="8" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="16" y1="0" x2="16" y2="7" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
</g>`; }

// ---- Networking Basics ----
function ilLanTypes(){ return wrap(`
  ${ilHouse(70,120,1,IC.sky)}${ilComputer(70,80,0.7,IC.sky)}
  ${ilHouse(160,120,1.3,IC.blue)}${ilComputer(140,75,0.8,IC.blue)}${ilComputer(180,75,0.8,IC.blue)}
  ${ilServer(255,110,1.1,IC.violet)}${ilServer(280,110,1.1,IC.violet)}
  ${sublabel(70,155,'Home')}${sublabel(160,168,'Office')}${sublabel(267,155,'Datacenter')}
`); }

function ilOsiStack(){ const rows=[['7 Application',IC.blue],['6 Presentation',IC.violet],['5 Session',IC.sky],['4 Transport',IC.green],['3 Network',IC.amber],['2 Data Link',IC.orange],['1 Physical',IC.red]];
  let g=''; rows.forEach((r,i)=>{ const y=20+i*22; g+=`<rect x="60" y="${y}" width="200" height="18" rx="6" fill="${r[1]}"/>${label(160,y+13,r[0],11)}`; });
  return wrap(g); }

function ilDataRoad(){ return wrap(`
  ${ilComputer(40,140,0.9,IC.sky)}
  <path d="M70 140 h180" stroke="${IC.mute}" stroke-width="6" stroke-dasharray="10 8" stroke-linecap="round"/>
  ${ilRouter(160,140,0.9,IC.blue)}
  ${ilEnvelope(105,105,1,IC.violet)}${ilEnvelope(215,105,1,IC.green)}
  ${ilComputer(280,140,0.9,IC.sky)}
  ${sublabel(160,175,'packets hop router to router')}
`); }

function ilInternetChain(){ return wrap(`
  ${ilHouse(40,120,0.9,IC.sky)}
  ${ilArrow(65,120,105,120,IC.mute)}
  <rect x="105" y="108" width="36" height="24" rx="5" fill="${IC.amber}"/>${sublabel(123,150,'modem')}
  ${ilArrow(145,120,180,120,IC.mute)}
  ${ilRouter(200,120,0.85,IC.blue)}${sublabel(200,150,'router')}
  ${ilArrow(225,110,255,90,IC.mute)}
  ${ilCloud(275,70,1,IC.violet)}${sublabel(275,105,'internet')}
`); }

function ilAddressTag(){ return wrap(`
  ${ilComputer(120,95,1.3,IC.blue)}
  <rect x="185" y="80" width="90" height="34" rx="8" fill="${IC.yellow}"/>
  <circle cx="196" cy="97" r="4" fill="#7a5b00"/>
  ${label(233,92,'192.168.1.10',11)}${sublabel(233,106,'IP address')}
  ${sublabel(120,140,'MAC: burned into the card')}
`); }

function ilIpVersions(){ return wrap(`
  <rect x="30" y="70" width="90" height="40" rx="8" fill="${IC.sky}"/>${label(75,88,'IPv4',13)}${sublabel(75,102,'~4.3 billion')}
  <rect x="150" y="40" width="150" height="100" rx="10" fill="${IC.violet}"/>${label(225,90,'IPv6',15)}${sublabel(225,108,'a LOT more room')}
`); }

// ---- Topologies & Architecture ----
function ilP2pVsServer(){ return wrap(`
  ${ilComputer(45,60,0.75,IC.sky)}${ilArrow(65,60,105,60,IC.mute)}${ilComputer(125,60,0.75,IC.sky)}
  ${sublabel(85,30,'peer-to-peer')}
  ${ilServer(160,150,0.9,IC.violet)}
  ${ilComputer(220,120,0.7,IC.blue)}${ilComputer(260,150,0.7,IC.blue)}${ilComputer(220,175,0.55,IC.blue)}
  ${ilArrow(178,145,212,128,IC.mute)}${ilArrow(178,152,250,150,IC.mute)}
  ${sublabel(220,30,'client-server')}
`); }

function ilLanManWan(){ return wrap(`
  <circle cx="70" cy="100" r="34" fill="none" stroke="${IC.sky}" stroke-width="4"/>${label(70,105,'LAN',13)}
  <circle cx="160" cy="100" r="55" fill="none" stroke="${IC.blue}" stroke-width="4"/>${label(160,50,'MAN',13)}
  <circle cx="160" cy="100" r="80" fill="none" stroke="${IC.violet}" stroke-width="4"/>${label(160,26,'WAN',13)}
`); }

function ilNetworkShapes(){ const cx=160,cy=100;
  let spokes=''; for(let i=0;i<5;i++){ const a=(i/5)*2*Math.PI-Math.PI/2; const px=cx+55*Math.cos(a), py=cy+55*Math.sin(a); spokes+=`<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${IC.blue}" stroke-width="3"/><circle cx="${px}" cy="${py}" r="8" fill="${IC.violet}"/>`; }
  return wrap(`${spokes}<circle cx="${cx}" cy="${cy}" r="12" fill="${IC.blue}"/>${sublabel(cx,175,'star: one hub, easy to fix')}`); }

function ilWifiCoverage(){ return wrap(`
  ${ilHouse(60,130,0.8,IC.sky)}${ilWifi(60,95,1,IC.sky,2)}
  <rect x="180" y="60" width="90" height="90" rx="8" fill="${IC.violet}" opacity="0.85"/>
  ${ilWifi(200,60,0.8,IC.blue,2)}${ilWifi(255,60,0.8,IC.blue,2)}${ilWifi(200,150,0.8,IC.blue,2)}${ilWifi(255,150,0.8,IC.blue,2)}
  ${sublabel(60,155,'1 router')}${sublabel(225,168,'many access points')}
`); }

function ilCloudLayers(){ return wrap(`
  ${ilCloud(160,45,1.4,IC.violet)}
  <rect x="90" y="90" width="140" height="20" rx="6" fill="${IC.sky}"/>${label(160,104,'IaaS',11)}
  <rect x="90" y="115" width="140" height="20" rx="6" fill="${IC.blue}"/>${label(160,129,'PaaS',11)}
  <rect x="90" y="140" width="140" height="20" rx="6" fill="${IC.green}"/>${label(160,154,'SaaS',11)}
`); }

function ilCloudScale(){ return wrap(`
  <line x1="160" y1="40" x2="160" y2="70" stroke="${IC.mute}" stroke-width="4"/>
  <line x1="80" y1="70" x2="240" y2="70" stroke="${IC.mute}" stroke-width="4"/>
  <line x1="80" y1="70" x2="80" y2="105" stroke="${IC.mute}" stroke-width="3"/>
  <line x1="240" y1="70" x2="240" y2="105" stroke="${IC.mute}" stroke-width="3"/>
  ${ilCloud(80,120,0.9,IC.violet)}${sublabel(80,150,'save money, flexible')}
  ${ilLock(240,115,1,IC.amber)}${sublabel(240,150,'less direct control')}
`); }

function ilWifiWaves(){ return wrap(`
  ${ilRouter(70,100,1,IC.blue)}${ilWifi(70,65,1.1,IC.blue,3)}
  <rect x="150" y="50" width="14" height="110" fill="${IC.mute}"/>${sublabel(157,45,'wall')}
  ${ilComputer(250,100,0.8,IC.sky)}
  ${sublabel(160,175,'walls and distance weaken the signal')}
`); }

function ilTowerSpeed(){ return wrap(`
  <line x1="160" y1="40" x2="160" y2="130" stroke="${IC.mute}" stroke-width="5"/>
  <line x1="130" y1="60" x2="190" y2="60" stroke="${IC.mute}" stroke-width="4"/>
  <line x1="140" y1="85" x2="180" y2="85" stroke="${IC.mute}" stroke-width="4"/>
  <polygon points="160,90 172,120 163,120 170,150 148,115 158,115" fill="${IC.yellow}"/>
  ${sublabel(160,170,'5G: fast + low lag')}
`); }

// ---- Network Security ----
function ilDoorLock(){ return wrap(`
  <rect x="90" y="40" width="70" height="120" rx="4" fill="${IC.mute}"/>
  <rect x="94" y="44" width="62" height="112" rx="3" fill="${IC.sky}" opacity="0.15"/>
  ${ilLock(160,100,1.1,IC.amber)}
  ${ilPerson(250,120,0.9,IC.red)}
  ${sublabel(125,175,'open door = vulnerability')}${sublabel(250,150,'threat')}
`); }

function ilInsideOutside(){ return wrap(`
  <rect x="20" y="30" width="160" height="130" rx="8" fill="${IC.sky}" opacity="0.18"/>
  <line x1="180" y1="30" x2="180" y2="160" stroke="${IC.mute}" stroke-width="4" stroke-dasharray="8 6"/>
  ${ilPerson(90,110,0.9,IC.blue)}${sublabel(90,150,'inside: employees')}
  ${ilPerson(250,110,0.9,IC.red)}${sublabel(250,150,'outside: hackers')}
`); }

function ilSecurityLayers(){ return wrap(`
  ${ilShield(160,90,1.9,IC.blue)}
  ${ilLock(160,90,0.9,IC.ink)}
  ${sublabel(160,165,'users + permissions + encryption + login checks')}
`); }

function ilShieldBug(){ return wrap(`
  ${ilShield(120,95,1.7,IC.green)}
  ${ilBug(210,95,1.1,IC.red)}
  <line x1="150" y1="95" x2="185" y2="95" stroke="${IC.mute}" stroke-width="3" stroke-dasharray="4 5"/>
  ${sublabel(160,165,'antivirus + updates keep malware out')}
`); }

function ilFloodWave(){ let bots=''; for(let i=0;i<6;i++){ bots+=ilComputer(40+i*42,60,0.45,IC.red); }
  return wrap(`${bots}${sublabel(160,90,'a botnet floods one target')}${ilServer(160,145,1.2,IC.mute)}`); }

function ilFishingHook(){ return wrap(`
  <line x1="160" y1="30" x2="160" y2="90" stroke="${IC.mute}" stroke-width="3"/>
  <path d="M160 90 q0 22 20 20" fill="none" stroke="${IC.mute}" stroke-width="3"/>
  ${ilEnvelope(180,112,1.1,IC.amber)}
  ${ilPerson(100,140,0.9,IC.blue)}
  ${sublabel(160,170,'phishing: bait made to look trustworthy')}
`); }

function ilCiaTriangle(){ return wrap(`
  <polygon points="160,35 260,150 60,150" fill="none" stroke="${IC.violet}" stroke-width="4"/>
  ${ilLock(160,50,0.8,IC.sky)}${sublabel(160,25,'Confidentiality')}
  <path d="M235 130 l10 10 18-20" fill="none" stroke="${IC.green}" stroke-width="5" stroke-linecap="round"/>${sublabel(255,160,'Integrity')}
  <circle cx="80" cy="135" r="12" fill="none" stroke="${IC.amber}" stroke-width="4"/><path d="M80 128v9l6 4" stroke="${IC.amber}" stroke-width="3" fill="none"/>${sublabel(70,160,'Availability')}
`); }

function ilClosedDoors(){ return wrap(`
  ${[40,110,180,250].map((x,i)=>`<rect x="${x}" y="60" width="46" height="90" rx="4" fill="${i===1?IC.red:IC.green}" opacity="${i===1?0.9:0.85}"/>${i!==1?`<circle cx="${x+38}" cy="105" r="3" fill="rgba(10,14,26,.5)"/>`:''}`).join('')}
  ${sublabel(160,168,'close unused ports, keep the rest patched')}
`); }

function ilFingerprintSeal(){ return wrap(`
  ${[0,1,2,3].map(i=>`<path d="M120 ${60+i*10} a${40-i*8} ${40-i*8} 0 0 1 ${(40-i*8)*2} 0" fill="none" stroke="${IC.blue}" stroke-width="3"/>`).join('')}
  <circle cx="230" cy="100" r="30" fill="${IC.amber}"/><path d="M215 100l10 10 18-20" fill="none" stroke="#3a2600" stroke-width="4" stroke-linecap="round"/>
  ${sublabel(120,170,'hash = fingerprint')}${sublabel(230,145,'certificate = seal of trust')}
`); }

function ilKeyPhoneFingerprint(){ return wrap(`
  ${ilKey(70,100,1.1,IC.blue)}${sublabel(70,140,'password')}
  <rect x="150" y="60" width="34" height="60" rx="6" fill="${IC.violet}"/><circle cx="167" cy="110" r="3" fill="rgba(255,255,255,.7)"/>${sublabel(167,140,'phone code')}
  <circle cx="250" cy="90" r="22" fill="${IC.sky}"/>${sublabel(250,140,'fingerprint')}
`); }

// ---- Network Protocols & Standards ----
function ilTruckDelivery(){ return wrap(`
  ${ilComputer(50,100,0.9,IC.sky)}
  <rect x="120" y="90" width="60" height="34" rx="4" fill="${IC.amber}"/><circle cx="132" cy="128" r="7" fill="${IC.mute}"/><circle cx="168" cy="128" r="7" fill="${IC.mute}"/>
  ${ilEnvelope(150,80,0.8,IC.green)}
  ${ilServer(250,100,1,IC.violet)}
  ${sublabel(160,150,'FTP/SFTP move files, SMTP moves mail')}
`); }

function ilPhonebookBadge(){ return wrap(`
  <rect x="60" y="50" width="70" height="95" rx="6" fill="${IC.blue}"/>${label(95,90,'DNS',13)}${sublabel(95,105,'name → address')}
  <rect x="190" y="50" width="70" height="95" rx="6" fill="${IC.violet}"/>${label(225,90,'DHCP',12)}${sublabel(225,105,'hands out address')}
`); }

function ilWifiAntenna(){ return wrap(`
  <line x1="160" y1="60" x2="160" y2="150" stroke="${IC.mute}" stroke-width="5"/>
  ${ilWifi(160,50,1.3,IC.sky,3)}
  ${sublabel(160,170,'802.11 = the Wi-Fi rulebook')}
`); }

function ilEthernetCable(){ return wrap(`
  <rect x="40" y="80" width="50" height="36" rx="4" fill="${IC.mute}"/>
  <path d="M90 98 h130" stroke="${IC.blue}" stroke-width="6" stroke-linecap="round"/>
  <rect x="220" y="70" width="40" height="56" rx="4" fill="${IC.mute}"/>
  ${sublabel(160,140,'802.3 = the wired Ethernet rulebook')}
`); }

function ilRaceCars(){ return wrap(`
  <rect x="40" y="70" width="80" height="34" rx="6" fill="${IC.green}"/>${label(80,91,'TCP',13)}${sublabel(80,120,'careful, checks every piece')}
  <polygon points="220,60 260,80 220,100 235,80" fill="${IC.red}"/>${label(235,150,'UDP',13)}${sublabel(235,168,'fast, no waiting around')}
`); }

function ilMapRoute(){ return wrap(`
  <rect x="30" y="40" width="120" height="110" rx="8" fill="${IC.sky}" opacity="0.18"/>
  <circle cx="60" cy="100" r="6" fill="${IC.blue}"/><circle cx="120" cy="70" r="6" fill="${IC.blue}"/>
  <path d="M60 100 Q90 60 120 70" fill="none" stroke="${IC.blue}" stroke-width="3"/>${sublabel(90,155,'OSPF/EIGRP: inside one network')}
  <circle cx="220" cy="60" r="6" fill="${IC.violet}"/><circle cx="280" cy="140" r="6" fill="${IC.violet}"/>
  <path d="M220 60 Q260 80 280 140" fill="none" stroke="${IC.violet}" stroke-width="3"/>${sublabel(250,168,'BGP: across the whole internet')}
`); }

function ilDoorNumbers(){ return wrap(`
  <rect x="40" y="40" width="240" height="120" rx="6" fill="${IC.mute}" opacity="0.3"/>
  ${[['22',60],['53',115],['80',170],['443',225]].map(([n,x])=>`<rect x="${x}" y="70" width="40" height="60" rx="4" fill="${IC.blue}"/>${label(x+20,105,n,12)}`).join('')}
  ${sublabel(160,175,'each door = one service')}
`); }

function ilSharedDoor(){ return wrap(`
  ${[0,1,2].map(i=>ilPerson(70+i*35,110,0.75,IC.sky)).join('')}
  <rect x="185" y="70" width="20" height="70" rx="6" fill="${IC.mute}"/>
  ${ilArrow(150,105,182,105,IC.mute)}
  <rect x="215" y="85" width="46" height="34" rx="6" fill="${IC.amber}"/>${sublabel(238,140,'1 shared address')}
`); }

function ilWifiShield(){ return wrap(`
  ${ilShield(160,95,1.9,IC.blue)}
  ${ilWifi(160,88,0.8,IC.ink,2)}
  ${sublabel(160,165,'WPA3 locks the wireless traffic')}
`); }

// ---- Network Hardware & Connectivity ----
function ilDeviceChain(){ return wrap(`
  <rect x="30" y="80" width="46" height="34" rx="4" fill="${IC.amber}"/>${sublabel(53,130,'modem')}
  ${ilArrow(80,97,110,97,IC.mute)}
  ${ilRouter(140,97,0.85,IC.blue)}${sublabel(140,130,'router')}
  ${ilArrow(170,97,200,97,IC.mute)}
  <rect x="210" y="82" width="60" height="28" rx="4" fill="${IC.violet}"/>${sublabel(240,130,'switch')}
`); }

function ilNicCard(){ return wrap(`
  ${ilComputer(110,95,1.2,IC.sky)}
  <rect x="190" y="80" width="60" height="34" rx="4" fill="${IC.green}"/>
  <rect x="196" y="86" width="10" height="6" fill="rgba(255,255,255,.7)"/><rect x="210" y="86" width="10" height="6" fill="rgba(255,255,255,.7)"/><rect x="224" y="86" width="10" height="6" fill="rgba(255,255,255,.7)"/>
  ${sublabel(220,132,'NIC: the network chip')}
`); }

function ilCableFamily(){ return wrap(`
  ${[['UTP',60,IC.sky],['STP',160,IC.blue],['Coax',260,IC.violet]].map(([n,x,c])=>`<circle cx="${x}" cy="95" r="30" fill="${c}"/>${label(x,100,n,12)}`).join('')}
`); }

function ilFiberLight(){ return wrap(`
  <path d="M40 100 h240" stroke="${IC.mute}" stroke-width="10" stroke-linecap="round"/>
  <path d="M40 100 h240" stroke="${IC.yellow}" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10"/>
  ${sublabel(160,140,'light travels through the glass strand')}
`); }

function ilRackVsBlade(){ return wrap(`
  ${[0,1,2].map(i=>`<rect x="${50+i*10}" y="${50+i*22}" width="60" height="18" rx="3" fill="${IC.blue}"/>`).join('')}
  ${sublabel(80,160,'rack: separate boxes')}
  <rect x="190" y="45" width="90" height="100" rx="6" fill="${IC.violet}"/>
  ${[0,1,2,3].map(i=>`<rect x="198" y="${55+i*20}" width="74" height="14" rx="2" fill="rgba(255,255,255,.25)"/>`).join('')}
  ${sublabel(235,160,'blade: shared chassis')}
`); }

function ilConnectChain(){ return wrap(`
  ${ilHouse(45,115,0.7,IC.sky)}${ilArrow(65,115,90,115,IC.mute)}
  <rect x="92" y="103" width="30" height="22" rx="4" fill="${IC.amber}"/>${ilArrow(122,114,148,114,IC.mute)}
  ${ilRouter(168,114,0.65,IC.blue)}${ilArrow(190,114,215,114,IC.mute)}
  <rect x="217" y="102" width="34" height="22" rx="4" fill="${IC.violet}"/>${ilArrow(251,113,275,113,IC.mute)}
  ${ilWifi(295,105,0.7,IC.green,2)}
`); }

function ilDisksStack(){ return wrap(`
  ${[0,1,2].map(i=>`<ellipse cx="140" cy="${140-i*22}" rx="46" ry="14" fill="${IC.blue}" opacity="${1-i*0.18}"/>`).join('')}
  ${ilShield(230,90,1.2,IC.green)}
  ${sublabel(140,168,'RAID: many disks, one safety net')}
`); }

const ILLUSTRATIONS = {
  'lan-types': ilLanTypes, 'osi-stack': ilOsiStack, 'data-road': ilDataRoad,
  'internet-chain': ilInternetChain, 'address-tag': ilAddressTag, 'ip-versions': ilIpVersions,
  'p2p-vs-server': ilP2pVsServer, 'lan-man-wan': ilLanManWan, 'network-shapes': ilNetworkShapes,
  'wifi-coverage': ilWifiCoverage, 'cloud-layers': ilCloudLayers, 'cloud-scale': ilCloudScale,
  'wifi-waves': ilWifiWaves, 'tower-speed': ilTowerSpeed,
  'door-lock': ilDoorLock, 'inside-outside': ilInsideOutside, 'security-layers': ilSecurityLayers,
  'shield-bug': ilShieldBug, 'flood-wave': ilFloodWave, 'fishing-hook': ilFishingHook,
  'cia-triangle': ilCiaTriangle, 'closed-doors': ilClosedDoors, 'fingerprint-seal': ilFingerprintSeal,
  'key-phone-fingerprint': ilKeyPhoneFingerprint,
  'truck-delivery': ilTruckDelivery, 'phonebook-badge': ilPhonebookBadge, 'wifi-antenna': ilWifiAntenna,
  'ethernet-cable': ilEthernetCable, 'race-cars': ilRaceCars, 'map-route': ilMapRoute,
  'door-numbers': ilDoorNumbers, 'shared-door': ilSharedDoor, 'wifi-shield': ilWifiShield,
  'device-chain': ilDeviceChain, 'nic-card': ilNicCard, 'cable-family': ilCableFamily,
  'fiber-light': ilFiberLight, 'rack-vs-blade': ilRackVsBlade, 'connect-chain': ilConnectChain,
  'disks-stack': ilDisksStack,
};
