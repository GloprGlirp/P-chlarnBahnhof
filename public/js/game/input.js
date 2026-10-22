// Tastatur, Maus und Pointer-Lock
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // in diesem Frame gedrückt
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0, thumb: false };
    this.locked = false;
    this.enabled = true;
    this.chatOpen = false;
    this.onLockChange = null;
    this.lastShift = 0;
    this.tacRequest = false;

    this._kd = (e) => {
      if (this.chatOpen) return;
      if (['Tab', 'Space', 'KeyQ', 'KeyG', 'KeyV', 'KeyE', 'KeyF', 'KeyC', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          const t = performance.now();
          if (t - this.lastShift < 320) this.tacRequest = true;
          this.lastShift = t;
        }
      }
      this.keys.add(e.code);
    };
    this._ku = (e) => { this.keys.delete(e.code); };
    this._md = (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (e.button === 3 || e.button === 4) { this.mouse.thumb = true; e.preventDefault(); }
    };
    this._mu = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this._mm = (e) => {
      if (!this.locked) return;
      // Ausreißer mancher Browser abfangen
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    };
    this._wh = (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); };
    this._ctx = (e) => e.preventDefault();
    this._plc = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    this._blur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('wheel', this._wh, { passive: true });
    window.addEventListener('contextmenu', this._ctx);
    window.addEventListener('blur', this._blur);
    document.addEventListener('pointerlockchange', this._plc);
  }

  lock() {
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* egal */ } });
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
    this.mouse.thumb = false;
    this.tacRequest = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('wheel', this._wh);
    window.removeEventListener('contextmenu', this._ctx);
    window.removeEventListener('blur', this._blur);
    document.removeEventListener('pointerlockchange', this._plc);
    this.unlock();
  }
}
