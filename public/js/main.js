// App-Steuerung: Login, Verbindung, Menüs, Spielstart
import * as THREE from 'three';
import { Net } from './net.js';
import { renderLogin, renderMenu, renderPause, renderEnd } from './ui/menus.js';
import { Game } from './game/game.js';
import { audio } from './game/audio.js';

const DEFAULTS = { sens: 1.0, adsSens: 0.85, fov: 95, volume: 0.6, scale: 1, invertY: false, toggleAds: false, quality: 'medium', showFps: false };

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('kh_settings') || '{}') };
    if (this.settings.shadows === false && !this.settings.quality) this.settings.quality = 'low';
    delete this.settings.shadows;
    if (!['low', 'medium', 'high'].includes(this.settings.quality)) this.settings.quality = 'medium';
    this.net = new Net();
    this.profile = null;
    this.game = null;
    this.tabCleanup = null;
    this.canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1d2316);
    this.renderer.setSize(innerWidth, innerHeight, false);
    audio.setVolume(this.settings.volume);
    this.net.on(m => this.onMessage(m));
    this.net.onclose = () => this.onDisconnect();
  }

  toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    document.getElementById('toast').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  saveSettings() {
    localStorage.setItem('kh_settings', JSON.stringify(this.settings));
    audio.setVolume(this.settings.volume);
    if (this.game) this.game.applySettings();
  }

  cleanupTab() { if (this.tabCleanup) { this.tabCleanup(); this.tabCleanup = null; } }

  async boot() {
    const token = localStorage.getItem('kh_token');
    if (token) {
      try { await this.hello({ token }); return; } catch { localStorage.removeItem('kh_token'); }
    }
    renderLogin(this);
  }

  async ensureConnected() {
    if (this.net.ws && this.net.ws.readyState === 1) return;
    await this.net.connect();
  }

  hello(payload) {
    return new Promise(async (resolve, reject) => {
      try { await this.ensureConnected(); } catch (e) { reject(e); return; }
      const off = this.net.on(m => {
        if (m.t === 'welcome') { off(); this.profile = m.profile; if (m.guest) sessionStorage.setItem('kh_guest', JSON.stringify({ name: payload.guest, token: m.token })); renderMenu(this, 'play'); resolve(); }
        if (m.t === 'authError') { off(); reject(new Error('Sitzung abgelaufen – bitte neu anmelden.')); }
      });
      this.net.send({ t: 'hello', ...payload });
    });
  }

  async loginAccount(kind, username, password) {
    const r = await fetch(`/api/${kind === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Fehler');
    localStorage.setItem('kh_token', data.token);
    await this.hello({ token: data.token });
  }

  async loginGuest(name) {
    const old = JSON.parse(sessionStorage.getItem('kh_guest') || 'null');
    await this.hello({ guest: name, token: old && old.name === name ? old.token : undefined });
  }

  logout() {
    const token = localStorage.getItem('kh_token');
    if (token) fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    localStorage.removeItem('kh_token');
    sessionStorage.removeItem('kh_guest');
    this.cleanupTab();
    this.net.close();
    this.profile = null;
    renderLogin(this);
  }

  onMessage(m) {
    switch (m.t) {
      case 'profile':
        this.profile = m.profile;
        if (!this.game && this.menuTab === 'profile') renderMenu(this, 'profile');
        break;
      case 'joined':
        this.startGame(m);
        break;
      case 'error':
        if (!this.game) {
          this.toast(m.msg);
          if (this.menuTab === 'play') renderMenu(this, 'play');
        }
        break;
      case 'end':
        if (m.summary && this.profile) { this.profile.level = m.summary.level; this.profile.weaponXp = m.summary.weaponXp; this.profile.xp = m.summary.xp; this.profile.stats = m.summary.stats; }
        break;
    }
  }

  onDisconnect() {
    if (this.game) { this.game.destroy(); this.game = null; }
    this.cleanupTab();
    this.toast('Verbindung zum Server verloren.');
    this.root.innerHTML = `<div class="menu"><div class="login"><div class="login-box">
      <h1 class="wordmark">KUGELHAGEL</h1>
      <p class="lead">Die Verbindung zum Server ist abgebrochen.</p>
      <button class="btn" id="re">Neu verbinden</button>
    </div></div></div>`;
    this.root.querySelector('#re').onclick = () => location.reload();
  }

  startGame(joined) {
    this.cleanupTab();
    this.root.innerHTML = '';
    audio.init();
    this.game = new Game(this, joined);
  }

  leaveGame() {
    if (!this.game) return;
    this.net.send({ t: 'leave' });
    this.game.destroy();
    this.game = null;
    this.paused = false;
    renderMenu(this, 'play');
  }

  showPause(game) {
    game.paused = true;
    renderPause(this, game);
  }

  hidePause() {
    if (this.game) this.game.paused = false;
    if (this.game && !this.game.ended) this.root.innerHTML = '';
  }

  showEnd(m, game) {
    game.paused = true;
    renderEnd(this, m, game);
  }

  hideEnd() {
    if (this.game) { this.game.paused = false; this.root.innerHTML = ''; }
  }
}

const app = new App();
window.kh = app;
app.boot();
