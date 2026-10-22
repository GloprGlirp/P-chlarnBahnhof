// HUD: Fadenkreuz, Munition, Leben, Minimap, Killfeed, Modus-Anzeige, Scoreboard
import { TEAMS } from '/shared/constants.js';
import { WEAPONS, EQUIPMENT } from '/shared/weapons.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const WNAMES = { frag: 'Splittergranate', semtex: 'Haftgranate', knife: 'Messer', bomb: 'Bombe', fall: 'Absturz' };
export function weaponLabel(w) { return (WEAPONS[w] && WEAPONS[w].name) || WNAMES[w] || '✕'; }

export class Hud {
  constructor(el, game) {
    this.el = el;
    this.game = game;
    el.innerHTML = `
      <div class="vign"></div>
      <div class="scope"><i class="h"></i><i class="v"></i><i class="dot"></i></div>
      <div class="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="hitm"><i style="left:3px;top:3px;transform:rotate(45deg)"></i><i style="left:-13px;top:3px;transform:rotate(-45deg)"></i><i style="left:3px;top:-5px;transform:rotate(-45deg)"></i><i style="left:-13px;top:-5px;transform:rotate(45deg)"></i></div>
      <div class="dmgdir"></div>
      <div class="minimap"><canvas width="200" height="200"></canvas></div>
      <div class="modebar"></div>
      <div class="flags"></div>
      <div class="sndinfo"></div>
      <div class="killfeed"></div>
      <div class="xpfeed"></div>
      <div class="banner"></div>
      <div class="msgs"></div>
      <div class="lookname"></div>
      <div class="hp"><div class="lbl"><span class="hpn">100</span><span class="cls"></span></div><div class="bar"><i></i></div></div>
      <div class="ammo"><div class="wname"></div><div class="count"></div><div class="equip"></div></div>
      <div class="chat"></div>
      <div class="center-msg"></div>
      <div class="board hidden"></div>
      <div class="flash"></div>
      <div class="fps hidden"></div>
    `;
    const q = s => el.querySelector(s);
    this.$ = {
      vign: q('.vign'), scope: q('.scope'), cross: q('.cross'), hitm: q('.hitm'), dmgdir: q('.dmgdir'),
      mm: q('.minimap canvas'), modebar: q('.modebar'), flags: q('.flags'), snd: q('.sndinfo'), kf: q('.killfeed'),
      xp: q('.xpfeed'), banner: q('.banner'), msgs: q('.msgs'), look: q('.lookname'), hpn: q('.hpn'), hpbar: q('.hp .bar i'),
      cls: q('.cls'), wname: q('.wname'), count: q('.count'), equip: q('.equip'), chat: q('.chat'), center: q('.center-msg'),
      board: q('.board'), flash: q('.flash'), fps: q('.fps'), hp: q('.hp'), ammo: q('.ammo'),
    };
    this.cr = [...this.$.cross.querySelectorAll('i')];
    this.mmctx = this.$.mm.getContext('2d');
    this.hitT = 0;
    this.flashT = 0; this.flashMax = 1;
    this.bannerT = 0;
    this.cache = {};
    this.enemyPings = new Map();
  }

  set(key, el, html) {
    if (this.cache[key] === html) return;
    this.cache[key] = html;
    el.innerHTML = html;
  }

  buildMinimap(map) {
    const B = map.bounds;
    const S = 4;
    const c = document.createElement('canvas');
    c.width = (B.maxX - B.minX) * S; c.height = (B.maxZ - B.minZ) * S;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(70,78,60,.85)'; g.fillRect(0, 0, c.width, c.height);
    const sorted = map.boxes.filter(b => b.min[1] > -0.5 && b.mat !== 'invisible').sort((a, b) => a.max[1] - b.max[1]);
    for (const b of sorted) {
      const h = b.max[1];
      const v = Math.max(0, Math.min(1, h / 6));
      g.fillStyle = `rgb(${150 - v * 90},${150 - v * 90},${135 - v * 85})`;
      g.fillRect((b.min[0] - B.minX) * S, (b.min[2] - B.minZ) * S, (b.max[0] - b.min[0]) * S, (b.max[2] - b.min[2]) * S);
    }
    this.mmImg = c; this.mmS = S; this.mmB = B;
  }

  enemyFired(id) { this.enemyPings.set(id, performance.now()); }

  drawMinimap(me, players, modeState, map, mode) {
    const g = this.mmctx;
    const W = 200, Z = 0.62; // Pixel pro Kartenpixel
    g.clearRect(0, 0, W, W);
    if (!this.mmImg || !me) return;
    const S = this.mmS, B = this.mmB;
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(me.yaw);
    g.scale(Z, Z);
    g.drawImage(this.mmImg, -(me.x - B.minX) * S, -(me.z - B.minZ) * S);
    g.restore();
    const tr = (x, z) => {
      const dx = (x - me.x) * S * Z, dz = (z - me.z) * S * Z;
      const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
      return [W / 2 + dx * c - dz * s, W / 2 + dx * s + dz * c];
    };
    // Ziele
    if (mode === 'dom' && modeState && modeState.f) {
      map.dom.forEach((f, i) => {
        const [x, y] = tr(f.x, f.z);
        const o = modeState.f[i][0];
        g.fillStyle = o >= 0 ? TEAMS[o].color : '#ddd';
        g.font = 'bold 15px "Saira Stencil One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3; g.strokeText(f.id, x, y); g.fillText(f.id, x, y);
      });
    }
    if (mode === 'snd') {
      for (const s of map.snd) {
        const [x, y] = tr(s.x, s.z);
        g.fillStyle = '#ff5a4a'; g.font = 'bold 15px "Saira Stencil One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3; g.strokeText(s.id, x, y); g.fillText(s.id, x, y);
      }
      const b = modeState && modeState.b;
      const bp = b && (b.p || b.dr);
      if (bp && (me.team === modeState.at || b.pl)) {
        const [x, y] = tr(bp[0], bp[2]);
        g.fillStyle = b.pl ? '#ff3b2f' : '#ffd23f'; g.fillRect(x - 4, y - 4, 8, 8);
      }
    }
    const now = performance.now();
    for (const p of players) {
      if (!p.alive || !p.model.visible) continue;
      let show = p.friendly;
      if (!show) { const pt = this.enemyPings.get(p.id); show = pt && now - pt < 1800; }
      if (!show) continue;
      const [x, y] = tr(p.pos.x, p.pos.z);
      if (x < -5 || y < -5 || x > W + 5 || y > W + 5) continue;
      g.fillStyle = p.friendly ? '#5aa2ff' : '#ff3b30';
      if (p.friendly) {
        g.save(); g.translate(x, y); g.rotate(me.yaw - p.yaw);
        g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.restore();
      } else { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    }
    // Ich
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(W / 2, W / 2 - 8); g.lineTo(W / 2 + 6, W / 2 + 6); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 6); g.closePath(); g.fill();
  }

  crosshair(gapPx, visible, dot) {
    this.$.cross.style.display = visible ? '' : 'none';
    if (!visible) return;
    const g = Math.round(Math.max(3, Math.min(120, gapPx)));
    if (this.cache.gap !== g) {
      this.cache.gap = g;
      this.cr[0].style.top = `${-g - 9}px`;
      this.cr[1].style.top = `${g}px`;
      this.cr[2].style.left = `${-g - 9}px`;
      this.cr[3].style.left = `${g}px`;
    }
    this.cr[4].style.display = dot ? '' : 'none';
  }

  hitmarker(kind) {
    const h = this.$.hitm;
    h.className = 'hitm' + (kind === 'kill' ? ' kill' : kind === 'head' ? ' head' : '');
    h.style.opacity = 1;
    h.style.transform = kind === 'kill' ? 'scale(1.35)' : 'scale(1)';
    this.hitT = kind === 'kill' ? 0.35 : 0.2;
  }

  damageDir(angle) {
    const i = document.createElement('i');
    i.style.transform = `rotate(${angle}rad)`;
    this.$.dmgdir.appendChild(i);
    setTimeout(() => i.remove(), 1200);
  }

  flash(s) { this.flashT = s; this.flashMax = s; }

  killfeed(k, v, w, head, roster, myId) {
    const name = id => { const r = roster.get(id); return r ? `<span class="c-t${r.team}">${esc(r.name)}</span>` : '?'; };
    const d = document.createElement('div');
    if (k === myId || v === myId) d.className = 'me';
    d.innerHTML = k && k !== v ? `${name(k)}<span class="w">[${esc(weaponLabel(w))}${head ? ' ⦿' : ''}]</span>${name(v)}` : `${name(v)}<span class="w">[${esc(weaponLabel(w))}]</span>`;
    this.$.kf.appendChild(d);
    while (this.$.kf.children.length > 6) this.$.kf.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  xp(a, r) {
    const d = document.createElement('div');
    d.textContent = `+${a} ${r}`;
    this.$.xp.appendChild(d);
    while (this.$.xp.children.length > 4) this.$.xp.firstChild.remove();
    setTimeout(() => d.remove(), 1800);
  }

  banner(text, sub = '', dur = 2.5, color = '') {
    this.$.banner.innerHTML = `<span style="color:${color || 'inherit'}">${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.$.banner.classList.add('on');
    this.bannerT = dur;
  }

  chat(name, team, text) {
    const d = document.createElement('div');
    d.innerHTML = `<span class="c-t${team}">${esc(name)}:</span> ${esc(text)}`;
    this.$.chat.appendChild(d);
    while (this.$.chat.children.length > 7) this.$.chat.firstChild.remove();
    setTimeout(() => d.remove(), 10000);
  }

  info(text) {
    const d = document.createElement('div');
    d.style.color = '#cfc6a8';
    d.textContent = text;
    this.$.chat.appendChild(d);
    while (this.$.chat.children.length > 7) this.$.chat.firstChild.remove();
    setTimeout(() => d.remove(), 8000);
  }

  board(show, roster, myId, score, mode) {
    this.$.board.classList.toggle('hidden', !show);
    if (!show) return;
    let html = '';
    for (const t of [0, 1]) {
      const list = [...roster.values()].filter(r => r.team === t).sort((a, b) => b.sc - a.sc);
      html += `<h4><span class="c-t${t}">${TEAMS[t].name}</span><span>${score ? score[t] : 0}</span></h4>
        <table><thead><tr><th>Spieler</th><th>Lv</th><th>Punkte</th><th>K</th><th>T</th><th>A</th><th>Ping</th></tr></thead><tbody>
        ${list.map(r => `<tr class="${r.id === myId ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${esc(r.name)}</td><td>${r.lv}</td><td>${r.sc}</td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td><td>${r.bot ? 'BOT' : r.ping}</td></tr>`).join('')}
        </tbody></table>`;
    }
    this.set('board', this.$.board, html);
    void mode;
  }

  update(dt, s) {
    // Leben
    const hp = Math.max(0, Math.round(s.hp));
    if (this.cache.hp !== hp) {
      this.cache.hp = hp;
      this.$.hpn.textContent = hp;
      this.$.hpbar.style.width = hp + '%';
      this.$.hpbar.style.background = hp < 35 ? '#ff5a4a' : '#fff';
    }
    this.$.vign.style.opacity = s.alive ? Math.max(0, (70 - hp) / 70) * 0.9 : 0;
    this.$.hp.style.display = this.$.ammo.style.display = s.alive ? '' : 'none';
    // Munition
    if (s.weapon) {
      this.set('wname', this.$.wname, esc(s.weapon.name) + (s.reloading ? ' <span style="color:var(--brass-hi)">· lädt nach</span>' : ''));
      const low = s.mag <= Math.ceil(s.weapon.mag * 0.25);
      this.set('count', this.$.count, `<span${low ? ' style="color:#ff6b5b"' : ''}>${s.mag}</span><small> / ${s.res}</small>`);
      this.set('equip', this.$.equip, `<span>${esc(EQUIPMENT[s.lethalId] ? EQUIPMENT[s.lethalId].name : '')} <b>${s.lethal}</b> <kbd>G</kbd></span><span>${esc(EQUIPMENT[s.tacticalId] ? EQUIPMENT[s.tacticalId].name : '')} <b>${s.tactical}</b> <kbd>Q</kbd></span>`);
    }
    this.$.scope.classList.toggle('on', !!s.scope);
    // Treffermarker
    if (this.hitT > 0) { this.hitT -= dt; this.$.hitm.style.opacity = Math.max(0, this.hitT * 5); }
    if (this.flashT > 0) { this.flashT -= dt; this.$.flash.style.opacity = Math.min(1, this.flashT / Math.max(0.3, this.flashMax * 0.6)); }
    else this.$.flash.style.opacity = 0;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.$.banner.classList.remove('on'); }
    this.set('look', this.$.look, s.lookName ? esc(s.lookName) : '');
    this.set('msgs', this.$.msgs, s.msg || '');
    this.set('center', this.$.center, s.center || '');
    this.$.fps.classList.toggle('hidden', !s.showFps);
    if (s.showFps) this.set('fps', this.$.fps, `${s.fps} FPS · ${s.ping} ms`);
    // Modus
    const m = s.modeState;
    if (m) {
      const myT = s.team, enT = 1 - s.team;
      const tl = m.ph === 'pre' ? `<span style="color:var(--brass-hi)">${Math.ceil(m.pe || 0)}</span>` : fmtTime(m.tl || 0);
      this.set('modebar', this.$.modebar, `<div class="score t${myT}">${m.sc[myT]}</div><div class="timer">${tl}</div><div class="score t${enT}">${m.sc[enT]}</div>`);
      if (m.f) {
        const html = m.f.map((f, i) => {
          const [owner, cap, prog, cont] = f;
          const fill = cap >= 0 ? `<div class="fill" style="height:${Math.round(prog * 100)}%;background:${TEAMS[cap].color}"></div>` : '';
          return `<div class="flag ${owner >= 0 ? 'c' + owner : ''} ${cont ? 'contested' : ''}">${fill}<span>${'ABC'[i]}</span></div>`;
        }).join('');
        this.set('flags', this.$.flags, html);
      }
      if (m.b !== undefined) {
        const atk = m.at === s.team;
        const alive = s.aliveCounts || [0, 0];
        const total = s.totalCounts || [0, 0];
        const bars = t => `<span class="alive c-t${t}">${Array.from({ length: total[t] }, (_, i) => `<i class="${i < alive[t] ? '' : 'dead'}"></i>`).join('')}</span>`;
        let st = atk ? 'Angriff' : 'Verteidigung';
        if (m.b.pl) st = `<span style="color:#ff5a4a">Bombe an ${m.b.s} gelegt · ${Math.ceil(m.b.ex)} s</span>`;
        this.set('snd', this.$.snd, `${bars(myT)} Runde ${m.rd} · ${st} ${bars(enT)}`);
      }
    }
  }
}

export { esc, fmtTime };
