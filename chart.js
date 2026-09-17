// ---- Mastery-over-time line chart (SVG + hover tooltip) ----
function renderMasteryChart(container){
  const attempts = allAttemptsChronological().slice(-12);
  if(attempts.length < 2){
    container.innerHTML = `<div class="empty-state" style="padding:36px 10px;">
      ${iconSvg('trend')}
      <div>Complete at least two quiz attempts to see your mastery trend here.</div>
    </div>`;
    return;
  }
  const w = 900, h = 220, padL = 34, padR = 10, padT = 14, padB = 26;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const xs = attempts.map((a,i) => padL + (attempts.length === 1 ? innerW/2 : (i/(attempts.length-1)) * innerW));
  const ys = attempts.map(a => padT + innerH - (a.score * innerH));

  const gridLines = [0,25,50,75,100].map(pct => {
    const y = padT + innerH - (pct/100)*innerH;
    return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="${padL-8}" y="${y+4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10.5" fill="#57555d">${pct}%</text>`;
  }).join('');

  const passY = padT + innerH - (PASS_THRESHOLD*innerH);
  const passLine = `<line x1="${padL}" y1="${passY}" x2="${w-padR}" y2="${passY}" stroke="#34d399" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.6"/>`;

  let path = `M ${xs[0]} ${ys[0]}`;
  for(let i=1;i<xs.length;i++) path += ` L ${xs[i]} ${ys[i]}`;
  const areaPath = `${path} L ${xs[xs.length-1]} ${padT+innerH} L ${xs[0]} ${padT+innerH} Z`;

  const dots = attempts.map((a,i) => `<circle class="chart-dot" data-i="${i}" cx="${xs[i]}" cy="${ys[i]}" r="4.5" fill="#121116" stroke="${a.score>=PASS_THRESHOLD?'#34d399':'#c893ff'}" stroke-width="2.5" style="cursor:pointer;"/>`).join('');

  container.innerHTML = `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; display:block;" role="img" aria-label="Quiz score trend across recent attempts">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c893ff" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#c893ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        ${passLine}
        <path d="${areaPath}" fill="url(#areaFill)"/>
        <path d="${path}" fill="none" stroke="#c893ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>
      <div class="chart-tooltip" id="chartTooltip" hidden></div>
    </div>
  `;

  const svgEl = container.querySelector('svg');
  const tooltip = container.querySelector('#chartTooltip');
  container.querySelectorAll('.chart-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const i = +dot.getAttribute('data-i');
      const a = attempts[i];
      const rect = svgEl.getBoundingClientRect();
      const scaleX = rect.width / w, scaleY = rect.height / h;
      const px = xs[i]*scaleX, py = ys[i]*scaleY;
      tooltip.hidden = false;
      tooltip.style.left = px + 'px';
      tooltip.style.top = py + 'px';
      const d = new Date(a.ts);
      tooltip.innerHTML = `<div><strong>${Math.round(a.score*100)}%</strong> &middot; ${a.sectionShort}</div><div class="tt-sub">${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>`;
    });
    dot.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  });
}
