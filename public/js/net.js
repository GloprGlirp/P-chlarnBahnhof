// WebSocket-Verbindung zum Server
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Set();
    this.onclose = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Verbindung fehlgeschlagen'));
      ws.onclose = () => { if (this.ws === ws && this.onclose) this.onclose(); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        for (const h of [...this.handlers]) h(m);
      };
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  close() {
    if (this.ws) { const w = this.ws; this.ws = null; w.close(); }
  }
}
