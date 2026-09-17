// ---- Subnet / IP calculator ----
function ipToInt(ip){
  if(typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if(parts.length !== 4) return null;
  let result = 0;
  for(const p of parts){
    if(!/^\d{1,3}$/.test(p)) return null;
    const n = parseInt(p, 10);
    if(n < 0 || n > 255) return null;
    result = (result * 256) + n;
  }
  return result >>> 0;
}

function intToIp(int){
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

// Accepts "/24", "24", or a dotted mask like "255.255.255.0". Returns 0-32 or null.
function parseMaskInput(str){
  if(typeof str !== 'string') return null;
  let s = str.trim();
  if(!s) return null;
  if(s.startsWith('/')) s = s.slice(1);
  if(/^\d{1,2}$/.test(s)){
    const n = parseInt(s, 10);
    return (n >= 0 && n <= 32) ? n : null;
  }
  const maskInt = ipToInt(s);
  if(maskInt === null) return null;
  let prefix = 0, seenZero = false;
  for(let i = 31; i >= 0; i--){
    const bit = (maskInt >>> i) & 1;
    if(bit === 1){
      if(seenZero) return null; // not a contiguous mask
      prefix++;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

function maskIntFromPrefix(prefix){
  return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
}

function computeSubnet(ipInt, prefix){
  const maskInt = maskIntFromPrefix(prefix);
  const wildcardInt = (~maskInt) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const totalAddresses = Math.pow(2, 32 - prefix);
  let firstHost, lastHost, usableHosts;
  if(prefix === 32){
    firstHost = networkInt; lastHost = networkInt; usableHosts = 1;
  } else if(prefix === 31){
    firstHost = networkInt; lastHost = broadcastInt; usableHosts = 2;
  } else {
    firstHost = (networkInt + 1) >>> 0;
    lastHost = (broadcastInt - 1) >>> 0;
    usableHosts = totalAddresses - 2;
  }
  return { maskInt, wildcardInt, networkInt, broadcastInt, totalAddresses, firstHost, lastHost, usableHosts };
}

function ipClassOf(ipInt){
  const a = (ipInt >>> 24) & 255;
  if(a < 128) return 'A';
  if(a < 192) return 'B';
  if(a < 224) return 'C';
  if(a < 240) return 'D (multicast)';
  return 'E (experimental)';
}

function isPrivateIp(ipInt){
  const a = (ipInt >>> 24) & 255, b = (ipInt >>> 16) & 255;
  if(a === 10) return true;
  if(a === 172 && b >= 16 && b <= 31) return true;
  if(a === 192 && b === 168) return true;
  return false;
}

function bitsOf(int){
  const bits = [];
  for(let i = 31; i >= 0; i--) bits.push((int >>> i) & 1);
  return bits;
}

const CALC_PRESETS = [8, 16, 24, 25, 26, 27, 28, 30];

function randomPrivateIpAndPrefix(){
  const bases = ['10.0.0.0', '172.16.0.0', '192.168.0.0'];
  const base = ipToInt(bases[Math.floor(Math.random() * bases.length)]);
  const prefix = CALC_PRESETS[Math.floor(Math.random() * CALC_PRESETS.length)];
  const hostBits = 32 - prefix;
  const randomHostPart = Math.floor(Math.random() * Math.pow(2, Math.min(hostBits, 24)));
  const ip = (base + randomHostPart) >>> 0;
  return { ip: intToIp(ip), prefix };
}

function renderCalcResults(container, ipStr, maskStr){
  const ipInt = ipToInt(ipStr);
  const prefix = parseMaskInput(maskStr);

  if(ipInt === null || prefix === null){
    container.innerHTML = `<div class="empty-state" style="padding:30px;">${iconSvg('alert')}<div>${ipInt === null ? 'Enter a valid IPv4 address, like 192.168.1.10.' : 'Enter a valid mask, like 255.255.255.0 or /24.'}</div></div>`;
    return;
  }

  const r = computeSubnet(ipInt, prefix);
  const cls = ipClassOf(ipInt);
  const priv = isPrivateIp(ipInt);

  const resultCard = (label, value, mono) => `<div class="calc-result"><div class="calc-result-label">${label}</div><div class="calc-result-value${mono?' tabnum':''}">${value}</div></div>`;

  const resultsHtml = `<div class="calc-result-grid">
    ${resultCard('Network address', intToIp(r.networkInt), true)}
    ${resultCard('Broadcast address', intToIp(r.broadcastInt), true)}
    ${resultCard('First usable host', intToIp(r.firstHost), true)}
    ${resultCard('Last usable host', intToIp(r.lastHost), true)}
    ${resultCard('Usable hosts', r.usableHosts.toLocaleString(), true)}
    ${resultCard('Total addresses', r.totalAddresses.toLocaleString(), true)}
    ${resultCard('Subnet mask', intToIp(r.maskInt), true)}
    ${resultCard('Wildcard mask', intToIp(r.wildcardInt), true)}
    ${resultCard('CIDR notation', '/' + prefix, true)}
    ${resultCard('IP class', cls, false)}
    ${resultCard('Address scope', priv ? 'Private' : 'Public', false)}
  </div>`;

  const octets = bitsOf(ipInt);
  const bitBoxes = octets.map((bit, i) => {
    const isNetwork = i < prefix;
    const octetBreak = (i > 0 && i % 8 === 0) ? '<span class="calc-bit-gap"></span>' : '';
    return `${octetBreak}<span class="calc-bit ${isNetwork ? 'net' : 'host'}">${bit}</span>`;
  }).join('');

  const binaryHtml = `<div class="calc-binary">
    <div class="calc-binary-row">${bitBoxes}</div>
    <div class="calc-binary-legend">
      <span><i class="calc-swatch net"></i> network bits (${prefix})</span>
      <span><i class="calc-swatch host"></i> host bits (${32 - prefix})</span>
    </div>
  </div>`;

  container.innerHTML = resultsHtml + binaryHtml;
}

function renderCalculator(){
  const main = document.getElementById('mainView');
  main.innerHTML = `
    <div class="topbar">
      <div><h1>Subnet &amp; IP Calculator</h1><div class="topbar-sub">The real test gives you a built-in calculator &mdash; practice reading IPs and subnet masks with this one.</div></div>
    </div>
    <div class="panel">
      <div class="calc-input-row">
        <div class="calc-field">
          <label class="field-label" for="calcIp">IP address</label>
          <input type="text" id="calcIp" value="192.168.1.10" placeholder="192.168.1.10" autocomplete="off" spellcheck="false"/>
        </div>
        <div class="calc-field">
          <label class="field-label" for="calcMask">Subnet mask or CIDR</label>
          <input type="text" id="calcMask" value="/24" placeholder="255.255.255.0 or /24" autocomplete="off" spellcheck="false"/>
        </div>
      </div>
      <input type="range" id="calcSlider" min="0" max="32" value="24" style="width:100%; margin:14px 0 4px;"/>
      <div class="calc-preset-row">
        ${CALC_PRESETS.map(p => `<button class="btn sm ghost" data-preset="${p}">/${p}</button>`).join('')}
        <button class="btn sm" id="calcRandomBtn">${iconSvg('dice')} Random example</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Results</h2></div>
      <div id="calcResults"></div>
    </div>
  `;

  const ipInput = document.getElementById('calcIp');
  const maskInput = document.getElementById('calcMask');
  const slider = document.getElementById('calcSlider');
  const resultsHost = document.getElementById('calcResults');

  function recompute(){ renderCalcResults(resultsHost, ipInput.value, maskInput.value); }

  ipInput.addEventListener('input', recompute);
  maskInput.addEventListener('input', () => {
    const p = parseMaskInput(maskInput.value);
    if(p !== null) slider.value = p;
    recompute();
  });
  slider.addEventListener('input', () => {
    maskInput.value = '/' + slider.value;
    recompute();
  });
  main.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-preset');
      maskInput.value = '/' + p;
      slider.value = p;
      recompute();
    });
  });
  document.getElementById('calcRandomBtn').addEventListener('click', () => {
    const { ip, prefix } = randomPrivateIpAndPrefix();
    ipInput.value = ip;
    maskInput.value = '/' + prefix;
    slider.value = prefix;
    recompute();
  });

  recompute();
}
