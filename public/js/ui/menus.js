// Menü-Bildschirme: Login, Spielen, Klassen/Waffenschmied, Profil, Rangliste, Einstellungen, Pause, Match-Ende
import { MODES, TEAMS } from '/shared/constants.js';
import { MAPS, MAP_LIST } from '/shared/maps.js';
import {
  WEAPONS, ATTACHMENTS, ATTACHMENT_SLOTS, PERKS, EQUIPMENT, CLASS_ATTACHMENTS, CLASS_LABELS, MAX_ATTACHMENTS,
  computeStats, displayStats, weaponsForSlot,
} from '/shared/weapons.js';
import { weaponLevelInfo, unlocksAt, MAX_LEVEL, CLASS_COUNT } from '/shared/progression.js';
import { GunPreview } from './preview.js';
import { audio } from '../game/audio.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, s) => root.querySelector(s);
const $$ = (root, s) => [...root.querySelectorAll(s)];

// ================================================================ LOGIN
export function renderLogin(app, tab = 'login', err = '') {
  const root = app.root;
  root.innerHTML = `
  <div class="menu"><div class="login"><div class="login-box">
    <h1 class="wordmark">KUGELHAGEL<small>5 gegen 5. Waffen freischalten. Bots auffüllen. Los.</small></h1>
    <div class="tabs" role="tablist">
      <button data-tab="login" class="${tab === 'login' ? 'on' : ''}">Anmelden</button>
      <button data-tab="register" class="${tab === 'register' ? 'on' : ''}">Account erstellen</button>
      <button data-tab="guest" class="${tab === 'guest' ? 'on' : ''}">Als Gast</button>
    </div>
    <form autocomplete="on">
      <div class="field"><label for="u">Spielername</label><input id="u" type="text" maxlength="16" autocomplete="username" value="${esc(localStorage.getItem('kh_lastname') || '')}"></div>
      ${tab !== 'guest' ? `<div class="field"><label for="p">Passwort</label><input id="p" type="password" autocomplete="${tab === 'register' ? 'new-password' : 'current-password'}"></div>` : ''}
      ${tab === 'register' ? '<div class="field"><label for="p2">Passwort wiederholen</label><input id="p2" type="password" autocomplete="new-password"></div>' : ''}
      <div class="err">${esc(err)}</div>
      <button class="btn" type="submit">${tab === 'login' ? 'Anmelden' : tab === 'register' ? 'Account erstellen' : 'Als Gast spielen'}</button>
      <p class="hint">${tab === 'guest' ? 'Als Gast wird dein Fortschritt nicht gespeichert.' : tab === 'register' ? 'Mit Account bleiben Level, Waffen und Klassen gespeichert.' : 'Noch keinen Account? Oben „Account erstellen“ wählen.'}</p>
    </form>
  </div></div></div>`;
  $$(root, '.tabs button').forEach(b => b.onclick = () => renderLogin(app, b.dataset.tab));
  const form = $(root, 'form');
  $(root, '#u').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    audio.init();
    const u = $(root, '#u').value.trim();
    const p = $(root, '#p') ? $(root, '#p').value : '';
    const btn = $(root, 'button[type=submit]');
    const errEl = $(root, '.err');
    if (tab === 'register' && p !== $(root, '#p2').value) { errEl.textContent = 'Die Passwörter stimmen nicht überein.'; return; }
    if (!u) { errEl.textContent = 'Bitte einen Spielernamen eingeben.'; return; }
    btn.disabled = true;
    localStorage.setItem('kh_lastname', u);
    try {
      if (tab === 'guest') await app.loginGuest(u);
      else await app.loginAccount(tab, u, p);
    } catch (ex) {
      errEl.textContent = ex.message;
      btn.disabled = false;
    }
  };
}

// ================================================================ HAUPTMENÜ
export function renderMenu(app, tab = 'play') {
  const P = app.profile;
  const L = P.level;
  app.menuTab = tab;
  const root = app.root;
  root.innerHTML = `
  <div class="menu">
    <header class="topbar">
      <h1 class="wordmark">KUGELHAGEL</h1>
      <div class="player-chip">
        <div class="lvl-badge" title="Level">${L.level}</div>
        <div>
          <div class="name">${esc(P.username)}${P.guest ? ' <span class="xptext">(Gast)</span>' : ''}</div>
          <div class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></div>
          <div class="xptext">${L.need ? `${L.into} / ${L.need} XP bis Level ${L.level + 1}` : 'Maximales Level'}</div>
        </div>
      </div>
    </header>
    <div class="layout">
      <nav class="nav">
        <button data-tab="play">Spielen</button>
        <button data-tab="classes">Klassen</button>
        <button data-tab="profile">Profil</button>
        <button data-tab="top">Rangliste</button>
        <button data-tab="settings">Einstellungen</button>
        <div class="spacer"></div>
        <button class="quiet" data-tab="logout">${P.guest ? 'Beenden' : 'Abmelden'}</button>
      </nav>
      <main class="content"></main>
    </div>
  </div>`;
  $$(root, '.nav button').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.onclick = () => { audio.init(); audio.click(); if (b.dataset.tab === 'logout') app.logout(); else renderMenu(app, b.dataset.tab); };
  });
  const c = $(root, '.content');
  app.cleanupTab();
  if (tab === 'play') renderPlay(app, c);
  else if (tab === 'classes') renderClasses(app, c);
  else if (tab === 'profile') renderProfile(app, c);
  else if (tab === 'top') renderTop(app, c);
  else if (tab === 'settings') renderSettings(app, c);
}

// ---------------------------------------------------------------- Spielen
function renderPlay(app, c) {
  const metas = {
    tdm: '5 gegen 5 · 10 Minuten · 75 Kills zum Sieg',
    dom: '5 gegen 5 · 10 Minuten · 200 Punkte zum Sieg',
    snd: '5 gegen 5 · ein Leben pro Runde · 4 Rundensiege',
  };
  c.innerHTML = `
    <h2>Spielen</h2>
    <p class="lead">Wähle einen Modus. Leere Plätze füllen Bots auf, echte Spieler verdrängen sie automatisch.</p>
    <div class="modes">
      ${Object.values(MODES).map(m => `
        <div class="mode-row">
          <div><div class="mname">${esc(m.name)}</div><div class="mdesc">${esc(m.desc)}</div><div class="mmeta">${metas[m.id]}</div></div>
          <button class="btn" data-quick="${m.id}">Schnelles Spiel</button>
        </div>`).join('')}
    </div>
    <div class="cols">
      <section>
        <h3>Offene Spiele</h3>
        <div class="rooms"><div class="empty">Suche Spiele …</div></div>
        <h3>Mit Code beitreten</h3>
        <div style="display:flex;gap:8px;max-width:340px">
          <input type="text" id="code" maxlength="6" placeholder="z. B. K7Q2M" style="flex:1;text-transform:uppercase">
          <button class="btn ghost" id="joincode">Beitreten</button>
        </div>
      </section>
      <section>
        <h3>Eigenes Spiel erstellen</h3>
        <div class="form-grid">
          <div class="field"><label for="cmode">Modus</label><select id="cmode">${Object.values(MODES).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="cmap">Karte</label><select id="cmap"><option value="">Rotation</option>${MAP_LIST.map(id => `<option value="${id}">${esc(MAPS[id].name)}</option>`).join('')}</select></div>
          <div class="field"><label for="cdiff">Bot-Stärke</label><select id="cdiff"><option value="easy">Leicht</option><option value="normal" selected>Normal</option><option value="hard">Schwer</option></select></div>
          <div class="field"><label for="cname">Name (optional)</label><input type="text" id="cname" maxlength="32" placeholder="Gloppys Runde"></div>
        </div>
        <label class="check"><input type="checkbox" id="cbots" checked> Mit Bots auffüllen</label>
        <label class="check"><input type="checkbox" id="cpriv"> Privat (nur mit Code)</label>
        <button class="btn" id="create">Spiel erstellen</button>
      </section>
    </div>`;
  $$(c, '[data-quick]').forEach(b => b.onclick = () => { audio.init(); app.net.send({ t: 'quick', mode: b.dataset.quick }); b.disabled = true; b.textContent = 'Verbinde …'; });
  $(c, '#create').onclick = () => {
    audio.init();
    app.net.send({ t: 'create', mode: $(c, '#cmode').value, map: $(c, '#cmap').value || null, difficulty: $(c, '#cdiff').value,
      bots: $(c, '#cbots').checked, private: $(c, '#cpriv').checked, name: $(c, '#cname').value.trim() || null });
  };
  $(c, '#joincode').onclick = () => { audio.init(); const code = $(c, '#code').value.trim(); if (code) app.net.send({ t: 'join', code }); };
  const roomsEl = $(c, '.rooms');
  const draw = (list) => {
    if (!list.length) { roomsEl.innerHTML = '<div class="empty">Gerade läuft kein offenes Spiel. Starte eins mit „Schnelles Spiel“.</div>'; return; }
    roomsEl.innerHTML = `<table class="list"><thead><tr><th>Spiel</th><th>Modus</th><th>Karte</th><th>Spieler</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${esc(r.name)}</td><td>${MODES[r.mode].short}</td><td>${esc(MAPS[r.map].name)}</td><td>${r.humans} + ${r.bots} Bots</td>
      <td><button class="btn small ghost" data-join="${r.id}" ${r.humans >= 10 ? 'disabled' : ''}>Beitreten</button></td></tr>`).join('')}
      </tbody></table>`;
    $$(roomsEl, '[data-join]').forEach(b => b.onclick = () => { audio.init(); app.net.send({ t: 'join', id: b.dataset.join }); });
  };
  const off = app.net.on(m => { if (m.t === 'rooms') draw(m.list); });
  app.net.send({ t: 'rooms' });
  const iv = setInterval(() => app.net.send({ t: 'rooms' }), 3000);
  app.tabCleanup = () => { off(); clearInterval(iv); };
}

// ---------------------------------------------------------------- Klassen
function renderClasses(app, c) {
  const P = app.profile;
  const level = P.level.level;
  const classes = JSON.parse(JSON.stringify(P.classes));
  let sel = app.classSel || 0;
  let smith = null; // 'primary' | 'secondary'
  let preview = null;
  let saveT = null;

  const save = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => app.net.send({ t: 'saveClasses', classes }), 250);
  };
  const wlvl = id => weaponLevelInfo((P.weaponXp || {})[id] || 0);

  const draw = () => {
    if (preview && !smith) { preview.dispose(); preview = null; }
    const cl = classes[sel];
    c.innerHTML = `<h2>${smith ? 'Waffenschmied' : 'Klassen'}</h2>
      <p class="lead">${smith ? 'Wähle Waffe und bis zu fünf Aufsätze. Aufsätze schaltest du mit Kills dieser Waffe frei.' : 'Fünf eigene Ausrüstungen. Im Spiel wechselst du sie mit Esc.'}</p>
      <div class="classes">
        <div class="class-list">${classes.map((k, i) => `<button data-c="${i}" class="${i === sel ? 'on' : ''}">${esc(k.name)}<span>${esc(WEAPONS[k.primary.id].name)} · ${esc(WEAPONS[k.secondary.id].name)}</span></button>`).join('')}</div>
        <div class="right"></div>
      </div>`;
    $$(c, '[data-c]').forEach(b => b.onclick = () => { audio.click(); sel = +b.dataset.c; app.classSel = sel; smith = null; draw(); });
    const right = $(c, '.right');
    if (smith) drawSmith(right, cl);
    else drawSheet(right, cl);
  };

  const chipsFor = (items, current, onPick) => items.map(it => {
    const locked = it.unlock > level;
    return `<button class="chip ${current === it.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-pick="${it.id}" ${locked ? 'disabled' : ''} title="${esc(it.desc || '')}">${esc(it.name)}${locked ? `<small>Lv ${it.unlock}</small>` : ''}</button>`;
  }).join('');

  const drawSheet = (el, cl) => {
    const perkSlot = s => Object.values(PERKS).filter(p => p.slot === s);
    const wline = (slot, label) => {
      const w = cl[slot];
      const W = WEAPONS[w.id];
      const att = w.att.map(a => ATTACHMENTS[a].name).join(', ') || 'Keine Aufsätze';
      return `<div class="slotline"><div class="k">${label}</div><div class="v">${esc(W.name)}<small>${esc(CLASS_LABELS[W.cls])} · ${esc(att)}</small></div><button class="btn small ghost" data-smith="${slot}">Bearbeiten</button></div>`;
    };
    el.innerHTML = `<div class="sheet">
      <div class="sheet-head"><input type="text" id="cname" maxlength="20" value="${esc(cl.name)}" aria-label="Klassenname"></div>
      ${wline('primary', 'Primärwaffe')}
      ${wline('secondary', 'Sekundärwaffe')}
      ${[1, 2, 3].map(s => `<div class="slotline"><div class="k">Perk ${s}</div><div class="chips" data-perk="${s}">${chipsFor(perkSlot(s), cl.perks[s - 1])}</div><div></div></div>`).join('')}
      <div class="slotline"><div class="k">Tödlich</div><div class="chips" data-eq="lethal">${chipsFor(Object.values(EQUIPMENT).filter(e => e.type === 'lethal'), cl.lethal)}</div><div></div></div>
      <div class="slotline"><div class="k">Taktisch</div><div class="chips" data-eq="tactical">${chipsFor(Object.values(EQUIPMENT).filter(e => e.type === 'tactical'), cl.tactical)}</div><div></div></div>
      <div class="att-desc" id="desc"></div>
    </div>`;
    $(el, '#cname').oninput = e => { cl.name = e.target.value.slice(0, 20) || 'Klasse'; $(c, `[data-c="${sel}"]`).firstChild.textContent = cl.name; save(); };
    $$(el, '[data-smith]').forEach(b => b.onclick = () => { audio.click(); smith = b.dataset.smith; draw(); });
    $$(el, '[data-perk] .chip').forEach(b => {
      b.onclick = () => { audio.click(); cl.perks[+b.parentElement.dataset.perk - 1] = b.dataset.pick; save(); drawSheet(el, cl); };
      b.onmouseenter = () => { $(el, '#desc').textContent = PERKS[b.dataset.pick].desc; };
    });
    $$(el, '[data-eq] .chip').forEach(b => {
      b.onclick = () => { audio.click(); cl[b.parentElement.dataset.eq] = b.dataset.pick; save(); drawSheet(el, cl); };
      b.onmouseenter = () => { $(el, '#desc').textContent = EQUIPMENT[b.dataset.pick].desc; };
    });
  };

  const drawSmith = (el, cl) => {
    const slot = smith;
    const w = cl[slot];
    const W = WEAPONS[w.id];
    const wl = wlvl(w.id);
    const base = displayStats(computeStats(w.id, []));
    const now = displayStats(computeStats(w.id, w.att));
    const allowed = CLASS_ATTACHMENTS[W.cls] || [];
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
        <button class="btn small ghost" id="back">Zurück zur Klasse</button>
        <span class="xptext">${slot === 'primary' ? 'Primärwaffe' : 'Sekundärwaffe'}</span>
      </div>
      <div class="weapons-grid">${weaponsForSlot(slot).map(x => {
        const locked = x.unlock > level;
        return `<button class="chip ${x.id === w.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-w="${x.id}" ${locked ? 'disabled' : ''}>${esc(x.name)}${locked ? `<small>Lv ${x.unlock}</small>` : ''}</button>`;
      }).join('')}</div>
      <div class="smith">
        <div>
          <div class="smith-preview"><canvas></canvas><div class="wl"><b>${esc(W.name)}</b><span>${esc(CLASS_LABELS[W.cls])} · ${esc(W.desc)}</span></div></div>
          <div class="wlevel">Waffenlevel ${wl.level}${wl.need ? `<div class="xpbar"><i style="width:${Math.round(wl.pct * 100)}%"></i></div><span>${wl.into} / ${wl.need}</span>` : ' (max)'}</div>
          <h3>Werte</h3>
          <div class="stats">${Object.keys(now).map(k => {
            const a = base[k], b = now[k];
            const lo = Math.min(a, b), hi = Math.max(a, b);
            return `<div class="stat"><span>${k}</span><div class="bar"><i style="width:${lo}%"></i>${b !== a ? `<i class="${b > a ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></i>` : ''}</div><span class="num">${b}</span></div>`;
          }).join('')}</div>
        </div>
        <div>
          <h3 style="margin-top:0">Aufsätze <span class="xptext">${w.att.length} / ${MAX_ATTACHMENTS}</span></h3>
          ${ATTACHMENT_SLOTS.map(s => {
            const opts = allowed.filter(a => ATTACHMENTS[a].slot === s.id);
            if (!opts.length) return W.fixedOptic && s.id === 'optic' ? `<div class="att-slot"><div class="k">${s.name}</div><div class="chips"><span class="chip on">Zielfernrohr (fest)</span></div></div>` : '';
            const cur = w.att.find(a => ATTACHMENTS[a].slot === s.id) || '';
            const full = w.att.length >= MAX_ATTACHMENTS && !cur;
            return `<div class="att-slot"><div class="k">${s.name}</div><div class="chips" data-slot="${s.id}">
              <button class="chip ${cur === '' ? 'on' : ''}" data-a="">Keiner</button>
              ${opts.map(a => {
                const A = ATTACHMENTS[a];
                const locked = A.lvl > wl.level;
                const dis = locked || (full && cur !== a);
                return `<button class="chip ${cur === a ? 'on' : ''} ${dis ? 'locked' : ''}" data-a="${a}" ${dis ? 'disabled' : ''}>${esc(A.name)}${locked ? `<small>WLv ${A.lvl}</small>` : ''}</button>`;
              }).join('')}
            </div></div>`;
          }).join('')}
          <div class="att-desc" id="adesc"></div>
        </div>
      </div>`;
    $(el, '#back').onclick = () => { audio.click(); smith = null; draw(); };
    if (!preview || preview.canvas !== $(el, 'canvas')) { if (preview) preview.dispose(); preview = new GunPreview($(el, 'canvas')); }
    preview.show(w.id, w.att);
    $$(el, '[data-w]').forEach(b => b.onclick = () => {
      audio.click();
      w.id = b.dataset.w;
      w.att = [];
      save(); drawSmith(el, cl);
      $(c, `[data-c="${sel}"] span`).textContent = `${WEAPONS[cl.primary.id].name} · ${WEAPONS[cl.secondary.id].name}`;
    });
    $$(el, '[data-slot] .chip').forEach(b => {
      const a = b.dataset.a;
      b.onclick = () => {
        if (a === undefined) return;
        audio.click();
        const s = b.parentElement.dataset.slot;
        w.att = w.att.filter(x => ATTACHMENTS[x].slot !== s);
        if (a) w.att.push(a);
        save(); drawSmith(el, cl);
      };
      if (a) b.onmouseenter = () => { $(el, '#adesc').textContent = ATTACHMENTS[a].desc; };
    });
  };

  draw();
  app.tabCleanup = () => { if (preview) preview.dispose(); clearTimeout(saveT); if (saveT) app.net.send({ t: 'saveClasses', classes }); };
}

// ---------------------------------------------------------------- Profil
function renderProfile(app, c) {
  const P = app.profile;
  const s = P.stats;
  const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
  const lv = P.level.level;
  const road = [];
  for (let l = 2; l <= Math.min(MAX_LEVEL, 30); l++) {
    const u = unlocksAt(l);
    if (u.length) road.push({ l, u });
  }
  const wl = Object.values(WEAPONS).map(w => ({ w, info: weaponLevelInfo((P.weaponXp || {})[w.id] || 0), xp: (P.weaponXp || {})[w.id] || 0 })).sort((a, b) => b.xp - a.xp);
  c.innerHTML = `
    <h2>${esc(P.username)}</h2>
    <p class="lead">Level ${lv} · ${P.xp} XP gesamt${P.guest ? ' · Gast-Fortschritt geht beim Verlassen verloren' : ''}</p>
    <div class="statgrid">
      <div><b>${s.kills}</b><span>Kills</span></div>
      <div><b>${s.deaths}</b><span>Tode</span></div>
      <div><b>${kd}</b><span>K/T</span></div>
      <div><b>${s.assists}</b><span>Assists</span></div>
      <div><b>${s.headshots}</b><span>Kopfschüsse</span></div>
      <div><b>${s.wins}</b><span>Siege</span></div>
      <div><b>${s.matches}</b><span>Matches</span></div>
      <div><b>${s.bestStreak || 0}</b><span>Beste Serie</span></div>
    </div>
    <div class="cols">
      <section>
        <h3>Freischaltungen</h3>
        <div class="roadmap">${road.map(r => `<div class="lv">${r.l}</div><div class="it ${r.l <= lv ? 'got' : ''}">${r.u.map(x => `${esc(x.name)} <span class="xptext">(${x.type === 'weapon' ? 'Waffe' : x.type === 'perk' ? 'Perk' : 'Ausrüstung'})</span>`).join(', ')}${r.l <= lv ? ' ✓' : ''}</div>`).join('')}</div>
      </section>
      <section>
        <h3>Waffenlevel</h3>
        <table class="list"><thead><tr><th>Waffe</th><th>Level</th><th>XP</th></tr></thead><tbody>
        ${wl.map(x => `<tr><td>${esc(x.w.name)}</td><td>${x.info.level}</td><td>${x.xp}</td></tr>`).join('')}
        </tbody></table>
      </section>
    </div>`;
}

// ---------------------------------------------------------------- Rangliste
async function renderTop(app, c) {
  c.innerHTML = '<h2>Rangliste</h2><p class="lead">Die erfahrensten Spieler auf diesem Server.</p><div class="empty">Lade …</div>';
  try {
    const list = await (await fetch('/api/leaderboard')).json();
    if (app.menuTab !== 'top') return;
    c.innerHTML = `<h2>Rangliste</h2><p class="lead">Die erfahrensten Spieler auf diesem Server.</p>
      ${list.length ? `<table class="list"><thead><tr><th>#</th><th>Spieler</th><th>Level</th><th>XP</th><th>Kills</th><th>Siege</th></tr></thead><tbody>
      ${list.map((r, i) => `<tr class="${r.name === app.profile.username ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.level}</td><td>${r.xp}</td><td>${r.kills}</td><td>${r.wins}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Noch niemand drauf. Spiel ein Match und sei der Erste.</div>'}`;
  } catch {
    c.innerHTML = '<h2>Rangliste</h2><div class="err">Rangliste konnte nicht geladen werden.</div>';
  }
}

// ---------------------------------------------------------------- Einstellungen
export function renderSettings(app, c, compact = false) {
  const S = app.settings;
  const rows = [
    ['sens', 'Mausempfindlichkeit', 0.1, 4, 0.05],
    ['adsSens', 'Empfindlichkeit beim Zielen', 0.3, 1.5, 0.05],
    ['fov', 'Sichtfeld', 65, 120, 1],
    ['volume', 'Lautstärke', 0, 1, 0.05],
    ['scale', 'Renderauflösung', 0.5, 1, 0.05],
  ];
  const checks = [
    ['invertY', 'Maus-Y umkehren'], ['toggleAds', 'Zielen umschalten statt halten'], ['showFps', 'FPS und Ping anzeigen'],
  ];
  c.innerHTML = `${compact ? '' : '<h2>Einstellungen</h2><p class="lead">Wird in diesem Browser gespeichert.</p>'}
    <div class="settings">
      <div class="setting"><label for="s_quality">Grafikqualität</label><select id="s_quality">
        <option value="low" ${S.quality === 'low' ? 'selected' : ''}>Niedrig – ohne Schatten</option>
        <option value="medium" ${S.quality === 'medium' ? 'selected' : ''}>Mittel – Schatten</option>
        <option value="high" ${S.quality === 'high' ? 'selected' : ''}>Hoch – Schatten, Umgebungsverdeckung, Bloom</option>
      </select><span></span></div>
      ${rows.map(([k, l, mi, ma, st]) => `<div class="setting"><label for="s_${k}">${l}</label><input id="s_${k}" type="range" min="${mi}" max="${ma}" step="${st}" value="${S[k]}"><span class="val" data-v="${k}">${fmt(k, S[k])}</span></div>`).join('')}
      ${checks.map(([k, l]) => `<label class="check" style="padding:8px 0;border-bottom:1px solid rgba(62,74,46,.6);margin:0"><input type="checkbox" id="s_${k}" ${S[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      ${compact ? '' : `<h3>Steuerung</h3><div class="keys">
        <div><kbd>W A S D</kbd> Bewegen</div><div><kbd>Maus</kbd> Umsehen</div>
        <div><kbd>Linksklick</kbd> Schießen</div><div><kbd>Rechtsklick</kbd> Zielen</div>
        <div><kbd>Shift</kbd> Sprinten · 2× taktischer Sprint</div><div><kbd>Leertaste</kbd> Springen / Klettern</div>
        <div><kbd>C</kbd> Ducken · beim Sprinten Rutschen</div><div><kbd>R</kbd> Nachladen</div>
        <div><kbd>1</kbd> <kbd>2</kbd> <kbd>Mausrad</kbd> Waffe wechseln</div><div><kbd>G</kbd> Tödliche Granate</div>
        <div><kbd>Q</kbd> Taktische Granate</div><div><kbd>V</kbd> Messer</div>
        <div><kbd>E</kbd> Bombe legen / entschärfen</div><div><kbd>Tab</kbd> Punktestand</div>
        <div><kbd>T</kbd> Chat</div><div><kbd>Esc</kbd> Pause / Klasse wechseln</div>
        <div><kbd>Shift</kbd> im Zielfernrohr: Atem anhalten</div>
      </div>`}
    </div>`;
  function fmt(k, v) { return k === 'volume' || k === 'scale' ? Math.round(v * 100) + '%' : k === 'fov' ? Math.round(v) + '°' : (+v).toFixed(2); }
  for (const [k] of rows) {
    $(c, `#s_${k}`).oninput = e => { S[k] = +e.target.value; $(c, `[data-v="${k}"]`).textContent = fmt(k, S[k]); app.saveSettings(); };
  }
  for (const [k] of checks) $(c, `#s_${k}`).onchange = e => { S[k] = e.target.checked; app.saveSettings(); };
  $(c, '#s_quality').onchange = e => { S.quality = e.target.value; app.saveSettings(); };
}

// ================================================================ PAUSE
export function renderPause(app, game) {
  const root = app.root;
  const room = game.roomInfo;
  const classes = app.profile.classes;
  const cur = game.me.classIndex ?? 0;
  root.innerHTML = `
  <div class="menu over-game pause">
    <header class="topbar"><h1 class="wordmark" style="font-size:56px">PAUSE</h1>
      <div class="xptext" style="text-align:right">${esc(room.name)} · ${esc(MODES[game.mode].name)} · ${esc(game.map.name)}${room.private ? `<br>Einladungscode: <b style="color:var(--brass-hi);font-size:22px">${esc(room.code)}</b>` : ''}</div>
    </header>
    <div class="pause-body">
      <div class="pause-actions">
        <button class="btn" id="resume">Weiterspielen</button>
        <button class="btn ghost" id="leave">Match verlassen</button>
      </div>
      <section>
        <h3 style="margin-top:0">Klasse wählen</h3>
        <div class="class-list">${classes.map((k, i) => `<button data-c="${i}" class="${i === cur ? 'on' : ''}">${esc(k.name)}<span>${esc(WEAPONS[k.primary.id].name)} · ${esc(WEAPONS[k.secondary.id].name)} · ${esc(k.perks.map(p => PERKS[p].name).join(', '))}</span></button>`).join('')}</div>
        <p class="hint">Gilt beim nächsten Spawn – kurz nach dem Spawn sofort. Bearbeiten kannst du Klassen im Hauptmenü.</p>
      </section>
      <section>
        <h3 style="margin-top:0">Einstellungen</h3>
        <div class="settings-wrap"></div>
      </section>
    </div>
  </div>`;
  $(root, '#resume').onclick = () => { app.hidePause(); game.input.lock(); };
  $(root, '#leave').onclick = () => app.leaveGame();
  $$(root, '[data-c]').forEach(b => b.onclick = () => {
    audio.click();
    $$(root, '[data-c]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    game.me.classIndex = +b.dataset.c;
    game.chooseClass(+b.dataset.c);
  });
  renderSettings(app, $(root, '.settings-wrap'), true);
}

// ================================================================ MATCH-ENDE
export function renderEnd(app, m, game) {
  const root = app.root;
  const myTeam = game.team;
  const won = m.winner === myTeam, draw = m.winner === -1;
  const sum = m.summary;
  const W = id => WEAPONS[id] ? WEAPONS[id].name : id;
  const players = m.players;
  const table = t => `<h3 class="c-t${t}" style="color:${TEAMS[t].color}">${TEAMS[t].name} · ${m.score[t]}</h3>
    <table class="list"><thead><tr><th>Spieler</th><th>Punkte</th><th>K</th><th>T</th><th>A</th></tr></thead><tbody>
    ${players.filter(p => p.team === t).map(p => `<tr class="${p.id === game.myId ? 'me' : ''}"><td>${esc(p.name)}${p.id === m.mvp ? ' <span class="xptext">MVP</span>' : ''}</td><td>${p.sc}</td><td>${p.k}</td><td>${p.d}</td><td>${p.a}</td></tr>`).join('')}
    </tbody></table>`;
  root.innerHTML = `<div class="endscreen"><div class="inner">
    <div class="result ${won ? 'win' : draw ? '' : 'loss'}">${won ? 'SIEG' : draw ? 'UNENTSCHIEDEN' : 'NIEDERLAGE'}</div>
    <div class="xptext" style="font-size:20px">${esc(MODES[game.mode].name)} · ${esc(game.map.name)} · Nächstes Match in <span id="cd">15</span> s</div>
    <div class="grid2">
      <section>${table(myTeam)}${table(1 - myTeam)}</section>
      <section>
        <h3>Erfahrung</h3>
        ${Object.entries(m.xpLog || {}).map(([k, v]) => `<div class="xpl"><span>${esc(k)}</span><span>+${v}</span></div>`).join('') || '<div class="empty">Keine XP in diesem Match.</div>'}
        <div class="xpl total"><span>Gesamt</span><span>+${m.xp}</span></div>
        ${sum ? `
          <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
            <div class="lvl-badge">${sum.level.level}</div>
            <div style="flex:1"><div class="xpbar" style="width:100%"><i style="width:${Math.round(sum.level.pct * 100)}%"></i></div>
            <div class="xptext">${sum.level.need ? `${sum.level.into} / ${sum.level.need} XP` : 'Maximales Level'}</div></div>
          </div>
          ${sum.after > sum.before ? `<div class="unlock"><b>Level ${sum.after} erreicht!</b></div>` : ''}
          ${sum.unlocks.map(u => `<div class="unlock">Freigeschaltet: <b>${esc(u.name)}</b> <span class="xptext">(${u.type === 'weapon' ? 'Waffe' : u.type === 'perk' ? 'Perk' : 'Ausrüstung'})</span></div>`).join('')}
          ${sum.weaponUps.map(u => `<div class="unlock">${esc(W(u.weapon))} erreicht Waffenlevel <b>${u.level}</b>${u.unlocks.length ? ` · neu: <b>${esc(u.unlocks.map(x => x.name).join(', '))}</b>` : ''}</div>`).join('')}
        ` : ''}
        <div style="display:flex;gap:10px;margin-top:22px">
          <button class="btn" id="stay">Weiterspielen</button>
          <button class="btn ghost" id="leave">Zurück ins Menü</button>
        </div>
      </section>
    </div>
  </div></div>`;
  if (sum && sum.after > sum.before) audio.levelUp(); else audio.announce(won ? 'good' : 'bad');
  let t = 15;
  const iv = setInterval(() => { t--; const el = $(root, '#cd'); if (el) el.textContent = Math.max(0, t); else clearInterval(iv); }, 1000);
  $(root, '#stay').onclick = () => { $(root, '#stay').textContent = 'Warte auf nächstes Match …'; $(root, '#stay').disabled = true; };
  $(root, '#leave').onclick = () => { clearInterval(iv); app.leaveGame(); };
}

export { esc, CLASS_COUNT };
