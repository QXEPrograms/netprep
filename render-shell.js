// ---- Sidebar / nav / shell ----
function navItemsHtml(activeRoute){
  const items = SECTIONS.map((s,i) => {
    const unlocked = sectionUnlocked(i);
    const passed = sectionPassed(s.id);
    const prog = sectionObjectiveProgress(s.id);
    const cls = ['nav-item'];
    if(!unlocked) cls.push('locked');
    if(passed) cls.push('done');
    if(activeRoute === `section/${s.id}` || activeRoute === `quiz/${s.id}`) cls.push('active');
    return `<button class="${cls.join(' ')}" data-nav="${unlocked ? `section/${s.id}` : ''}" ${unlocked ? '' : 'disabled title="Pass the previous section to unlock"'}>
      <span class="dot"></span>
      <span>${s.short}</span>
      ${!unlocked ? `<span style="margin-left:auto; opacity:.6; width:13px; height:13px;">${iconSvg('lock')}</span>` : `<span class="mini-bar"><i style="width:${Math.round(prog*100)}%"></i></span>`}
    </button>`;
  }).join('');
  return items;
}

function renderShell(activeRoute){
  const app = document.getElementById('app');
  const mistakeCount = activeMistakeQuestions().length;
  app.innerHTML = `
    <div class="app-shell">
      <nav class="mobile-nav">
        <button class="nav-item ${activeRoute==='dashboard'?'active':''}" data-nav="dashboard"><span>Dashboard</span></button>
        ${navItemsHtml(activeRoute)}
        <button class="nav-item ${activeRoute==='mistakes'?'active':''}" data-nav="mistakes"><span>Mistakes${mistakeCount?` (${mistakeCount})`:''}</span></button>
        <button class="nav-item ${activeRoute==='calculator'?'active':''}" data-nav="calculator"><span>Calculator</span></button>
        <button class="nav-item ${activeRoute==='flashcards'?'active':''}" data-nav="flashcards"><span>Flashcards</span></button>
      </nav>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${iconSvg('target')}</div>
          <div>
            <div class="brand-name">NetPrep</div>
            <div class="brand-sub">FBLA Networking Infra</div>
          </div>
        </div>
        <div>
          <div class="nav-group-label">Overview</div>
          <div class="nav-list">
            <button class="nav-item ${activeRoute==='dashboard'?'active':''}" data-nav="dashboard">${iconSvg('home')}<span>Dashboard</span></button>
            <button class="nav-item ${activeRoute==='mistakes'?'active':''}" data-nav="mistakes">${iconSvg('replay')}<span>Mistake replay</span>${mistakeCount?`<span class="mini-bar" style="width:auto; background:none;"><span class="badge danger" style="margin-left:6px;">${mistakeCount}</span></span>`:''}</button>
          </div>
        </div>
        <div>
          <div class="nav-group-label">Study sections</div>
          <div class="nav-list">${navItemsHtml(activeRoute)}</div>
        </div>
        <div>
          <div class="nav-group-label">Tools</div>
          <div class="nav-list">
            <button class="nav-item ${activeRoute==='calculator'?'active':''}" data-nav="calculator">${iconSvg('calculator')}<span>Subnet Calculator</span></button>
            <button class="nav-item ${activeRoute==='flashcards'?'active':''}" data-nav="flashcards">${iconSvg('cards')}<span>Flashcards</span></button>
          </div>
        </div>
        <div style="margin-top:auto;">
          <div class="nav-list">
            <button class="nav-item ${activeRoute==='settings'?'active':''}" data-nav="settings">${iconSvg('settings')}<span>Settings</span></button>
          </div>
        </div>
      </aside>
      <main class="main" id="mainView"></main>
    </div>
  `;
  app.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => { const r = el.getAttribute('data-nav'); if(r) location.hash = '#/' + r; });
  });
}

function statCard(label, value, sub, barPct, barColor, deltaHtml){
  return `<div class="stat-card">
    <div class="stat-label"><span>${label}</span>${deltaHtml||''}</div>
    <div class="stat-value">${value}${sub ? `<small>${sub}</small>` : ''}</div>
    ${barPct !== undefined ? `<div class="stat-bar"><i style="width:${Math.round(barPct*100)}%; background:${barColor};"></i></div>` : ''}
  </div>`;
}

function formatDate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function weekBannerHtml(){
  const weekNum = currentWeekNumber();
  if(weekNum === null){
    return `<div class="week-banner">
      <div class="week-banner-eyebrow">Your study plan</div>
      <div class="week-banner-title">Starts ${formatDate(STATE.planStartDate)}</div>
      <div class="week-banner-sub">Change the start date anytime in Settings.</div>
    </div>`;
  }
  const focus = weekFocus(weekNum);
  const isReview = !focus.sectionId;
  const idx = focus.sectionId ? SECTIONS.findIndex(s => s.id === focus.sectionId) : -1;
  const unlocked = idx >= 0 ? sectionUnlocked(idx) : true;
  const weekLabel = weekNum <= WEEK_PLAN_TOTAL_WEEKS ? `Week ${weekNum} of ${WEEK_PLAN_TOTAL_WEEKS}` : `Week ${weekNum} &middot; review phase`;

  let cta;
  if(isReview){
    cta = `<button class="btn primary sm" data-nav="mistakes">Drill weak spots ${iconSvg('chevron')}</button>`;
  } else if(!unlocked){
    cta = `<button class="btn sm" disabled>${iconSvg('lock')} Finish earlier sections first</button>`;
  } else {
    cta = `<button class="btn primary sm" data-nav="section/${focus.sectionId}">Study now ${iconSvg('chevron')}</button>`;
  }

  return `<div class="week-banner">
    <div class="week-banner-top">
      <span class="week-banner-eyebrow">${weekLabel}</span>
    </div>
    <div class="week-banner-row">
      <div>
        <div class="week-banner-title">This week: ${focus.label}</div>
        ${focus.note ? `<div class="week-banner-sub">${focus.note}</div>` : ''}
      </div>
      <div class="week-banner-cta">${cta}</div>
    </div>
  </div>`;
}

function renderDashboard(){
  const main = document.getElementById('mainView');
  const overall = overallProgress();
  const acc = overallAccuracy();
  const weak = weakestSection();
  const days = daysUntil(STATE.competitionDate);
  const nextSection = firstUnfinishedSection();

  const statsHtml = `<div class="stat-grid">
    ${statCard('Overall progress', Math.round(overall*100)+'%', '', overall, 'var(--primary)')}
    ${statCard('Practice accuracy', acc===null?'&mdash;':Math.round(acc*100)+'%', acc===null?'':'', acc===null?undefined:acc, 'var(--accent)')}
    ${statCard('Study streak', STATE.streak.count, 'day'+(STATE.streak.count===1?'':'s'), undefined, undefined, STATE.streak.count>0?`<span class="stat-delta up">${iconSvg('flame')}</span>`:'')}
    ${days===null ? `<div class="stat-card"><div class="stat-label">Districts countdown</div><div class="stat-value" style="font-size:14px; color:var(--text-muted); font-family:var(--font-body); font-weight:600;">Not set</div><button class="btn sm ghost" id="setDateBtn" style="align-self:flex-start; padding:4px 10px;">Set date</button></div>`
      : statCard('Districts countdown', Math.max(days,0), days===0?'today':(days<0?'days ago':'days left'))}
  </div>`;

  const weakHtml = weak
    ? `<div class="callout"><div class="callout-icon">${iconSvg('alert')}</div>
        <div class="callout-body"><div class="callout-title">Weakest area: ${weak.section.title}</div><div class="callout-sub">Averaging ${Math.round(weak.avg*100)}% across your attempts &mdash; review this section next.</div></div>
        <div class="callout-cta"><button class="btn sm primary" data-nav="section/${weak.section.id}">Review</button></div>
      </div>`
    : `<div class="callout ok"><div class="callout-icon">${iconSvg('check')}</div>
        <div class="callout-body"><div class="callout-title">No quiz attempts yet</div><div class="callout-sub">Start with ${nextSection.title} to build your first data point.</div></div>
        <div class="callout-cta"><button class="btn sm primary" data-nav="section/${nextSection.id}">Start studying</button></div>
      </div>`;

  const mistakeCount = activeMistakeQuestions().length;
  const upcomingCount = upcomingMistakeQuestions().length;
  const mistakeHtml = mistakeCount ? `<div class="callout"><div class="callout-icon">${iconSvg('replay')}</div>
      <div class="callout-body"><div class="callout-title">${mistakeCount} question${mistakeCount===1?'':'s'} due for review</div><div class="callout-sub">Spaced-repetition replay of past misses${upcomingCount ? ` &middot; ${upcomingCount} more scheduled for later` : ''}.</div></div>
      <div class="callout-cta"><button class="btn sm" data-nav="mistakes">Replay</button></div>
    </div>` : (upcomingCount ? `<div class="callout ok"><div class="callout-icon">${iconSvg('check')}</div>
      <div class="callout-body"><div class="callout-title">Nothing due right now</div><div class="callout-sub">${upcomingCount} previously-missed question${upcomingCount===1?'':'s'} will resurface as its review date comes up.</div></div>
    </div>` : '');

  const rows = SECTIONS.map((s,i) => {
    const unlocked = sectionUnlocked(i);
    const passed = sectionPassed(s.id);
    const best = sectionBestScore(s.id);
    const cov = sectionObjectiveProgress(s.id);
    return `<div class="section-row ${unlocked?'':'locked'} ${passed?'passed':''}">
      <div class="sr-index">${passed ? iconSvg('check') : (i+1)}</div>
      <div class="sr-body">
        <div class="sr-title-row"><span class="sr-title">${s.title}</span><span class="sr-weight">${s.weight} items</span></div>
        <div class="sr-progress"><i style="width:${Math.round(cov*100)}%"></i></div>
      </div>
      <div class="sr-score">${best===null?'&mdash;':Math.round(best*100)+'%'}</div>
      <div class="sr-action">${unlocked
        ? `<button class="btn sm ${passed?'':'primary'}" data-nav="section/${s.id}">${passed?'Review':(cov>0?'Continue':'Start')}</button>`
        : `<button class="btn sm" disabled>${iconSvg('lock')}</button>`}</div>
    </div>`;
  }).join('');

  main.innerHTML = `
    <div class="topbar">
      <div><h1>Welcome back</h1><div class="topbar-sub">${SECTIONS.reduce((a,s)=>a+s.objectives.length,0)} objectives &middot; 100 exam items across 5 sections</div></div>
      <div class="topbar-actions"><button class="icon-btn" data-nav="settings" title="Settings">${iconSvg('settings')}</button></div>
    </div>
    ${weekBannerHtml()}
    ${weakHtml}
    ${mistakeHtml}
    <div class="panel">
      <div class="panel-head"><h2>Sections</h2><span class="hint">Locked in order &mdash; pass at ${Math.round(PASS_THRESHOLD*100)}% to unlock the next</span></div>
      <div class="section-rows">${rows}</div>
    </div>
    <details class="panel disclosure">
      <summary>Your stats, mastery trend &amp; milestones ${iconSvg('chevron')}</summary>
      <div class="disclosure-body">
        ${statsHtml}
        <div class="panel-head" style="margin-top:20px;"><h2>Mastery over time</h2><span class="hint">Last ${Math.min(allAttemptsChronological().length,12)} quiz attempts</span></div>
        <div id="chartHost"></div>
        <div class="panel-head" style="margin-top:20px;"><h2>Milestones</h2><span class="hint">${Object.keys(STATE.badges).length} / ${BADGES.length} earned</span></div>
        <div class="badge-grid">${BADGES.map(b => `
          <div class="badge-chip ${STATE.badges[b.id]?'earned':'locked'}">
            <span class="badge-chip-icon">${iconSvg(b.icon)}</span>
            <div><div class="badge-chip-title">${b.title}</div><div class="badge-chip-desc">${b.desc}</div></div>
          </div>
        `).join('')}</div>
      </div>
    </details>
  `;
  main.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => location.hash = '#/' + el.getAttribute('data-nav')));
  renderMasteryChart(document.getElementById('chartHost'));

  const setDateBtn = document.getElementById('setDateBtn');
  if(setDateBtn) setDateBtn.addEventListener('click', () => location.hash = '#/settings');
}
