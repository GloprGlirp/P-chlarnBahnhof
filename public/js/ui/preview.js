// Kleine 3D-Vorschau der Waffe im Waffenschmied
import * as THREE from 'three';
import { buildGun } from '../game/models.js';

export class GunPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 2, 0.01, 10);
    this.camera.position.set(0.95, 0.3, 0.55);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4dd, 0x2a3220, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(1, 2, 1.5);
    this.scene.add(d);
    const rim = new THREE.DirectionalLight(0xc9a24a, 1.5);
    rim.position.set(-1.5, 0.5, -1);
    this.scene.add(rim);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.angle = 0;
    this.drag = null;
    this.running = true;
    canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag !== null) { this.angle += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && (canvas.width !== Math.floor(w * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      }
      if (this.drag === null) this.angle += 0.004;
      this.holder.rotation.y = Math.sin(this.angle) * 0.6 - 0.2;
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  show(weaponId, att) {
    this.holder.clear();
    const g = buildGun(weaponId, att);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const s = 0.75 / Math.max(size.z, 0.3);
    g.scale.setScalar(s);
    g.position.set(-c.x * s, -c.y * s, -c.z * s);
    this.holder.add(g);
  }

  dispose() {
    this.running = false;
    this.renderer.dispose();
  }
}
