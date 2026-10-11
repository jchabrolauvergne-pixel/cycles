/* =====================================================================
   LEVEL UP — module commun (connexion enfant + enregistrement des parties)
   À inclure dans chaque quiz :  <script src="levelup.js" data-quiz="id-du-quiz"></script>
   ===================================================================== */
(function(){
  const SUPABASE_URL = 'https://ggyuqlrqveuohkmuugcs.supabase.co';
  // Clé publique (« anon ») : elle ne donne accès qu'aux fonctions Level Up, qui vérifient les codes.
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdneXVxbHJxdmV1b2hrbXV1Z2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjE3MjksImV4cCI6MjA5MDQzNzcyOX0.s6j9-PYD9eJfBYSNKxdhcp8eJF4GRmL6_cBGCd1wUWM';

  const script = document.currentScript;
  const QUIZ = (script && script.dataset.quiz) || '';
  const LS = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
    del(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };
  const strip = s => String(s ?? '').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();

  async function rpc(fn, args){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method:'POST',
      headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify(args || {})
    });
    const txt = await r.text(); let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(e){}
    if (!r.ok) { const err = new Error((data && (data.message || data.hint)) || ('HTTP '+r.status)); err.code = data && data.message; throw err; }
    if (data && data.error) { const err = new Error(data.error); err.code = data.error; throw err; }
    return data;
  }

  /* ---------- session enfant ---------- */
  function session(){ try { return JSON.parse(LS.get('lu_session')); } catch(e){ return null; } }
  async function login(prenom, pin){
    const d = await rpc('lu_login', {p_prenom: prenom, p_pin: pin});
    const s = {token:d.token, prenom:d.prenom, niveau:d.niveau};
    LS.set('lu_session', JSON.stringify(s)); LS.set('levelup_level', d.niveau);
    flush();
    return s;
  }
  async function logout(){
    const s = session(); LS.del('lu_session'); LS.del('lu_me');
    if (s) { try { await rpc('lu_logout', {p_token:s.token}); } catch(e){} }
  }
  async function me(){
    const s = session(); if (!s) return null;
    try { const d = await rpc('lu_me', {p_token:s.token}); LS.set('lu_me', JSON.stringify(d)); return d; }
    catch(e){
      if (e.code === 'session_invalide') { LS.del('lu_session'); LS.del('lu_me'); return null; }
      try { return JSON.parse(LS.get('lu_me')); } catch(_){ return null; }   // hors ligne : dernière copie
    }
  }

  /* ---------- erreurs de la partie en cours ---------- */
  let errs = [];
  function err(item, expected, given){ if (errs.length < 100) errs.push({item:strip(item).slice(0,300), expected:strip(expected).slice(0,200), given:strip(given).slice(0,200)}); }
  function reset(){ errs = []; }

  /* ---------- enregistrement (avec file d'attente hors ligne) ---------- */
  function queue(){ try { return JSON.parse(LS.get('lu_queue')) || []; } catch(e){ return []; } }
  async function send(item){
    const s = session(); if (!s) return null;
    return rpc('lu_save', {p_token:s.token, p_quiz:item.quiz, p_mode:item.mode, p_score:item.score, p_total:item.total, p_errors:item.errors});
  }
  let flushing = false;
  async function flush(){
    if (flushing || !session()) return; flushing = true;
    let q = queue();
    while (q.length){
      try { await send(q[0]); q.shift(); LS.set('lu_queue', JSON.stringify(q)); }
      catch(e){ if (e.code === 'session_invalide' || e.code === 'score_invalide') { q.shift(); LS.set('lu_queue', JSON.stringify(q)); } else break; }
    }
    flushing = false;
  }
  async function save(mode, score, total, quiz){
    const item = {quiz: quiz || QUIZ, mode: mode || '', score: Math.max(0, Math.min(score|0, total|0)), total: total|0, errors: errs.slice(0,100)};
    errs = [];
    if (!session()) { toast('Connecte-toi sur l\'accueil pour gagner des XP ✨', true); return; }
    if (!item.total) return;
    try { const r = await send(item); toast(`+${r.xp_gained} XP · total ${r.xp_total} XP ▲`); LS.del('lu_me'); }
    catch(e){
      if (e.code === 'session_invalide') { LS.del('lu_session'); toast('Session expirée : reconnecte-toi sur l\'accueil', true); return; }
      const q = queue(); q.push(item); LS.set('lu_queue', JSON.stringify(q.slice(-50)));
      toast('Hors ligne : la partie sera envoyée plus tard 📶', true);
    }
  }

  /* ---------- petit bandeau + notifications ---------- */
  function css(){
    if (document.getElementById('lu-css')) return;
    const st = document.createElement('style'); st.id = 'lu-css';
    st.textContent = `
      .lu-pill{position:fixed;right:12px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:8px;
        background:#23342d;color:#f4f1e8;border-radius:999px;padding:7px 12px 7px 8px;font:600 14px Inter,system-ui,sans-serif;
        box-shadow:0 6px 20px -6px rgba(0,0,0,.45);text-decoration:none}
      .lu-pill .lu-logo{width:24px;height:24px;border-radius:8px;background:linear-gradient(145deg,#f5d76e,#ffb84d);display:grid;place-items:center;color:#23342d;font-size:13px}
      .lu-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:10000;
        background:#23342d;color:#f5d76e;border-radius:14px;padding:10px 16px;font:700 16px Inter,system-ui,sans-serif;
        box-shadow:0 10px 30px -10px rgba(0,0,0,.5);transition:all .35s;max-width:90vw;text-align:center}
      .lu-toast.soft{color:#f4f1e8;font-weight:600;font-size:15px}
      .lu-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
      @media print{.lu-pill,.lu-toast{display:none}}`;
    document.head.appendChild(st);
  }
  function toast(msg, soft){
    css(); const t = document.createElement('div'); t.className = 'lu-toast' + (soft?' soft':''); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2800);
  }
  function pill(){
    if (!QUIZ || document.querySelector('.lu-pill')) return;
    css(); const s = session();
    const a = document.createElement('a'); a.className = 'lu-pill'; a.href = 'index.html';
    a.innerHTML = `<span class="lu-logo">▲</span><span></span>`;
    a.lastChild.textContent = s ? `${s.prenom} · Level Up` : 'Level Up · se connecter';
    document.body.appendChild(a);
  }

  window.LevelUp = { rpc, session, login, logout, me, err, reset, save, flush, toast, quiz: QUIZ };
  const ready = () => { pill(); flush(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
