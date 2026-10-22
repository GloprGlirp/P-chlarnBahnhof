// Nachbearbeitung für Qualitätsstufe "Hoch": Umgebungsverdeckung, Bloom, Farbkorrektur, Vignette
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// AO ohne Partikel, Decals und Himmel
class AOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    this._extra = [];
    this.scene.traverse(o => {
      if (!o.visible) return;
      if (o.isSprite || o.userData.noAO || (o.material && o.material.transparent && !o.material.depthWrite)) { o.visible = false; this._extra.push(o); }
    });
  }
  _restoreVisibility() {
    super._restoreVisibility();
    for (const o of this._extra || []) o.visible = true;
    this._extra = [];
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 }, contrast: { value: 1.06 }, vig: { value: 1.0 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float sat; uniform float contrast; uniform float vig; uniform float hurt; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat * (1.0 - hurt * 0.7));
      col = (col - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5; d.x *= 1.3;
      float v = smoothstep(0.95, 0.3, length(d) * vig);
      col *= mix(0.78, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    this.render_ = new RenderPass(scene, camera);
    this.composer.addPass(this.render_);
    this.ao = new AOPass(scene, camera, size.x * pr, size.y * pr);
    this.ao.blendIntensity = 0.9;
    this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.4, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  render(dt) { this.composer.render(dt); }

  dispose() {
    this.composer.dispose();
    this.ao.dispose();
    this.bloom.dispose();
  }
}
