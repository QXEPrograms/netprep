// ---- Flashcards: a calm, self-paced flip-card review, no timer or scoring pressure ----
let fcDeckId = 'all';
let fcCards = [];
let fcIndex = 0;
let fcFlipped = false;
let fcHideKnown = false;

function fcAllCards(){
  return Object.keys(window.FLASHCARDS).flatMap(sectionId =>
    window.FLASHCARDS[sectionId].map(c => Object.assign({ sectionId }, c))
  );
}

function fcIsKnown(id){
  return (STATE.flashcardsKnown || []).includes(id);
}

function fcToggleKnown(id){
  STATE.flashcardsKnown = STATE.flashcardsKnown || [];
  const i = STATE.flashcardsKnown.indexOf(id);
  if(i >= 0) STATE.flashcardsKnown.splice(i, 1);
  else STATE.flashcardsKnown.push(id);
  saveState();
}

function shuffleArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function fcBuildDeck(){
  const source = fcDeckId === 'all' ? fcAllCards() : window.FLASHCARDS[fcDeckId].map(c => Object.assign({ sectionId: fcDeckId }, c));
  fcCards = fcHideKnown ? source.filter(c => !fcIsKnown(c.id)) : source;
  fcIndex = Math.min(fcIndex, Math.max(fcCards.length - 1, 0));
  fcFlipped = false;
}

function fcDeckPickerHtml(){
  const decks = [{ id: 'all', short: 'All' }].concat(SECTIONS.map(s => ({ id: s.id, short: s.short })));
  return decks.map(d => {
    const count = d.id === 'all' ? fcAllCards().length : window.FLASHCARDS[d.id].length;
    return `<button class="btn sm ${fcDeckId===d.id?'primary':'ghost'}" data-deck="${d.id}">${d.short} <span class="tabnum" style="opacity:.7;">${count}</span></button>`;
  }).join('');
}

function renderFlashcards(){
  fcBuildDeck();
  const main = document.getElementById('mainView');
  const knownCount = (STATE.flashcardsKnown || []).length;

  main.innerHTML = `
    <div class="topbar">
      <div><h1>Flashcards</h1><div class="topbar-sub">Flip through key terms at your own pace. Mark the ones you know to lighten future rounds.</div></div>
    </div>
    <div class="panel">
      <div class="calc-preset-row" id="fcDeckPicker">${fcDeckPickerHtml()}</div>
      <label class="pill-toggle" style="cursor:pointer; margin-top:12px;">
        <span class="switch ${fcHideKnown?'on':''}" id="fcHideKnownSwitch"><i></i></span>
        <span>Hide cards I already know (${knownCount} marked)</span>
      </label>
    </div>
    <div class="panel" id="fcPanel"></div>
  `;

  main.querySelectorAll('[data-deck]').forEach(btn => {
    btn.addEventListener('click', () => { fcDeckId = btn.getAttribute('data-deck'); fcIndex = 0; renderFlashcards(); });
  });
  document.getElementById('fcHideKnownSwitch').addEventListener('click', (e) => {
    fcHideKnown = !fcHideKnown;
    fcIndex = 0;
    renderFlashcards();
  });

  fcRenderCard();
}

function fcRenderCard(){
  const panel = document.getElementById('fcPanel');
  if(!fcCards.length){
    panel.innerHTML = `<div class="empty-state" style="padding:40px 20px;">${iconSvg('check')}
      <h2 style="font-size:16px; margin-bottom:6px;">All caught up</h2>
      <p>Every card in this deck is marked as known. Toggle the switch above to see them again.</p>
    </div>`;
    return;
  }

  const card = fcCards[fcIndex];
  const known = fcIsKnown(card.id);
  const sectionLabel = getSection(card.sectionId) ? getSection(card.sectionId).short : card.sectionId;

  panel.innerHTML = `
    <div class="fc-stage">
      <div class="fc-progress hint tabnum">Card ${fcIndex+1} of ${fcCards.length} &middot; ${sectionLabel}</div>
      <div class="fc-card ${fcFlipped?'flipped':''}" id="fcCardEl" role="button" tabindex="0" aria-label="Flip card">
        <div class="fc-card-face fc-card-front">
          <span class="badge muted" style="margin-bottom:14px;">${sectionLabel}</span>
          <div class="fc-term">${card.term}</div>
          <div class="fc-hint">Tap to flip</div>
        </div>
        <div class="fc-card-face fc-card-back">
          <div class="fc-def">${card.def}</div>
        </div>
      </div>
      <div class="fc-controls">
        <button class="btn" id="fcPrevBtn" ${fcIndex===0?'disabled':''}>${iconSvg('chevron')} Back</button>
        <button class="btn ${known?'primary':''}" id="fcKnownBtn">${iconSvg('check')} ${known ? 'Known' : 'I know this'}</button>
        <button class="btn" id="fcShuffleBtn">${iconSvg('dice')} Shuffle</button>
        <button class="btn primary" id="fcNextBtn">${fcIndex===fcCards.length-1?'Restart':'Next'} ${iconSvg('chevron')}</button>
      </div>
    </div>
  `;

  const cardEl = document.getElementById('fcCardEl');
  const flip = () => { fcFlipped = !fcFlipped; cardEl.classList.toggle('flipped', fcFlipped); };
  cardEl.addEventListener('click', flip);
  cardEl.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); flip(); } });

  document.getElementById('fcPrevBtn').addEventListener('click', () => { fcIndex = Math.max(0, fcIndex - 1); fcFlipped = false; fcRenderCard(); });
  document.getElementById('fcNextBtn').addEventListener('click', () => {
    fcIndex = fcIndex === fcCards.length - 1 ? 0 : fcIndex + 1;
    fcFlipped = false;
    fcRenderCard();
  });
  document.getElementById('fcShuffleBtn').addEventListener('click', () => {
    fcCards = shuffleArray(fcCards);
    fcIndex = 0;
    fcFlipped = false;
    fcRenderCard();
  });
  document.getElementById('fcKnownBtn').addEventListener('click', () => {
    fcToggleKnown(card.id);
    const counterEl = document.querySelector('#fcHideKnownSwitch').nextElementSibling;
    if(counterEl) counterEl.textContent = `Hide cards I already know (${(STATE.flashcardsKnown||[]).length} marked)`;
    if(fcHideKnown){ renderFlashcards(); } else { fcRenderCard(); }
  });
}
