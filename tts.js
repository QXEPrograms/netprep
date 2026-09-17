// ---- Text-to-speech for lesson content (Web Speech API, no external service) ----
const TTS_SUPPORTED = (function(){ try{ return 'speechSynthesis' in window; }catch(e){ return false; } })();
let ttsActiveBtn = null;

function stripHtml(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent.replace(/\s+/g, ' ').trim();
}

function ttsSetIdle(btn, label){
  btn.classList.remove('speaking');
  btn.innerHTML = `${iconSvg('volume')}<span>${label}</span>`;
}
function ttsSetActive(btn){
  btn.classList.add('speaking');
  btn.innerHTML = `${iconSvg('stopCircle')}<span>Stop</span>`;
}

function ttsStop(){
  if(!TTS_SUPPORTED) return;
  try{ window.speechSynthesis.cancel(); }catch(e){ /* ignore */ }
  if(ttsActiveBtn){ ttsSetIdle(ttsActiveBtn, ttsActiveBtn.dataset.ttsLabel || 'Listen'); ttsActiveBtn = null; }
}

function ttsToggle(btn, label, text){
  if(!TTS_SUPPORTED) return;
  btn.dataset.ttsLabel = label;
  const synth = window.speechSynthesis;
  if(ttsActiveBtn === btn){
    ttsStop();
    return;
  }
  const wasActive = ttsActiveBtn;
  try{ synth.cancel(); }catch(e){ /* ignore */ }
  if(wasActive) ttsSetIdle(wasActive, wasActive.dataset.ttsLabel || 'Listen');

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.96;
  const clearIfCurrent = () => { if(ttsActiveBtn === btn){ ttsSetIdle(btn, label); ttsActiveBtn = null; } };
  utter.onend = clearIfCurrent;
  utter.onerror = clearIfCurrent;

  ttsActiveBtn = btn;
  ttsSetActive(btn);
  try{ synth.speak(utter); }catch(e){ clearIfCurrent(); }
}

function ttsButtonHtml(idAttr, label){
  return `<button class="btn sm ghost tts-btn" ${idAttr}>${iconSvg('volume')}<span>${label}</span></button>`;
}
