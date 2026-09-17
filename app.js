// ---- Router ----
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '');
  return h ? h.split('/') : ['dashboard'];
}

function router(){
  ttsStop();
  const parts = parseHash();
  const route = parts[0];

  // Remember the current screen (not an in-progress quiz) so reopening the app resumes here.
  if(['dashboard', 'section', 'mistakes', 'settings', 'calculator', 'flashcards'].includes(route)){
    const asRoute = parts.join('/');
    if(STATE.lastRoute !== asRoute){ STATE.lastRoute = asRoute; saveState(); }
  }

  if(route === 'quiz'){
    const arg = parts[1];
    if(arg === 'mistakes'){
      if(!quizSession || !quizSession.isMistakeMode) startQuiz(null, true);
      else renderShellAndView('quiz/mistakes', renderQuiz);
      return;
    }
    if(!quizSession || quizSession.sectionId !== arg || quizSession.isMistakeMode){
      startQuiz(arg, false);
      return;
    }
    renderShellAndView(`quiz/${arg}`, renderQuiz);
    return;
  }

  quizSession = null;

  if(route === 'section'){
    renderShellAndView(`section/${parts[1]}`, () => renderSection(parts[1], parts[2]));
    return;
  }
  if(route === 'mistakes'){
    renderShellAndView('mistakes', renderMistakes);
    return;
  }
  if(route === 'settings'){
    renderShellAndView('settings', renderSettings);
    return;
  }
  if(route === 'calculator'){
    renderShellAndView('calculator', renderCalculator);
    return;
  }
  if(route === 'flashcards'){
    renderShellAndView('flashcards', renderFlashcards);
    return;
  }
  renderShellAndView('dashboard', renderDashboard);
}

function renderShellAndView(activeRoute, viewFn){
  renderShell(activeRoute);
  viewFn();
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  touchStreak();
  if(!location.hash && STATE.lastRoute){
    location.hash = '#/' + STATE.lastRoute; // triggers hashchange -> router()
  } else {
    router();
  }
});
