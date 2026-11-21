/* עיבוד תמונה קולנועי (מחשב וטלפון; במשקף כבוי כדי לשמור על קצב פריימים).
 * הסצנה מצוירת ל-HDR עם החלקת קצוות (MSAA), ואז:
 *  - Bloom: אורות, שלטים ושמיים זוהרים
 *  - טון ACES, דירוג צבע חם (כמו שעת זהב), ניגודיות ורוויה
 *  - וינייטה, גרעין עדין, וחדות
 * מתלבש על renderer.render, כך ששאר הקוד לא משתנה. רינדור לטקסטורה (מצלמת הטלפון) עובר כרגיל.
 */
(function () {
  'use strict';
  const THREE = window.THREE || AFRAME.THREE;

  const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  const brightFS = `
    uniform sampler2D tSrc; uniform float threshold; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = smoothstep(threshold, threshold + 0.8, l);
      gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0);
    }`;

  // טשטוש גאוסיאני 9 דגימות לכיוון אחד
  const blurFS = `
    uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
      s += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162;
      s += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;
      s += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703;
      s += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(s, 1.0);
    }`;

  const finalFS = `
    uniform sampler2D tScene, tB1, tB2, tB3;
    uniform vec2 texel; uniform float bloom, exposure, time, sharpen;
    varying vec2 vUv;
    vec3 aces(vec3 x){ // ACES fitted (Stephen Hill)
      const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      x = i * x; vec3 a = x * (x + 0.0245786) - 0.000090537; vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081; return clamp(o * (a / b), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      // חידוד עדין (unsharp)
      vec3 n = texture2D(tScene, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(texel.x, 0.0)).rgb
             + texture2D(tScene, vUv + vec2(0.0, texel.y)).rgb + texture2D(tScene, vUv - vec2(0.0, texel.y)).rgb;
      c = max(c + (c - n * 0.25) * sharpen, 0.0);
      vec3 b = texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.35 + texture2D(tB3, vUv).rgb * 0.3;
      c += b * bloom;
      c *= exposure;
      c = aces(c);
      // דירוג צבע: צללים קרירים, אורות חמים, ניגודיות ורוויה
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += mix(vec3(-0.012, 0.0, 0.025), vec3(0.03, 0.012, -0.02), smoothstep(0.15, 0.8, l));
      c = mix(vec3(l), c, 1.12);
      c = clamp((c - 0.5) * 1.03 + 0.5, 0.0, 1.0);
      c = c + (1.0 - c) * 0.025; // הרמת צללים עדינה
      // וינייטה
      vec2 q = vUv - 0.5; c *= mix(1.0, 0.9, smoothstep(0.25, 0.85, dot(q, q) * 2.2));
      c = toSRGB(c);
      c += (hash(vUv * 731.0) - 0.5) * 0.018; // גרעין
      gl_FragColor = vec4(c, 1.0);
    }`;

  AFRAME.registerComponent('cinematic', {
    schema: { enabled: { default: true }, bloom: { default: 0.55 }, threshold: { default: 1.1 }, exposure: { default: 1.12 } },

    init() {
      const sceneEl = this.el;
      const start = () => {
        const r = sceneEl.renderer;
        if (!r || !r.capabilities.isWebGL2) return;
        this.r = r;
        const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
        this.samples = coarse ? 2 : 4;
        this.cam = new THREE.Camera();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this.quad.frustumCulled = false;
        this.qscene = new THREE.Scene(); this.qscene.add(this.quad);
        const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: quadVS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, toneMapped: false });
        this.mBright = mk(brightFS, { tSrc: { value: null }, threshold: { value: this.data.threshold } });
        this.mBlur = mk(blurFS, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
        this.mFinal = mk(finalFS, {
          tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
          texel: { value: new THREE.Vector2() }, bloom: { value: this.data.bloom }, exposure: { value: this.data.exposure },
          time: { value: 0 }, sharpen: { value: coarse ? 0.15 : 0.25 },
        });
        this.size = new THREE.Vector2();
        this.rts = null;

        const orig = r.render.bind(r);
        this.orig = orig;
        let busy = false;
        r.render = (scene, camera) => {
          if (busy || !this.data.enabled || r.xr.isPresenting || r.getRenderTarget() !== null || scene !== sceneEl.object3D) return orig(scene, camera);
          busy = true;
          try { this.pipeline(scene, camera); } finally { busy = false; }
        };
        window.StorePost = this;
      };
      if (sceneEl.renderer) start(); else sceneEl.addEventListener('render-target-loaded', start);
    },

    ensure(w, h) {
      if (this.rts && this.rts.w === w && this.rts.h === h) return;
      if (this.rts) Object.values(this.rts).forEach((t) => t && t.dispose && t.dispose());
      const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      const scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples, depthBuffer: true });
      const lv = [2, 4, 8].map((d) => [new THREE.WebGLRenderTarget(Math.max(1, w / d | 0), Math.max(1, h / d | 0), o), new THREE.WebGLRenderTarget(Math.max(1, w / d | 0), Math.max(1, h / d | 0), o)]);
      this.rts = { w, h, scene, a1: lv[0][0], b1: lv[0][1], a2: lv[1][0], b2: lv[1][1], a3: lv[2][0], b3: lv[2][1] };
    },

    pass(mat, target) {
      this.quad.material = mat;
      this.r.setRenderTarget(target);
      this.orig(this.qscene, this.cam);
    },

    blur(src, tmp, dst, radius) {
      this.mBlur.uniforms.tSrc.value = src.texture;
      this.mBlur.uniforms.dir.value.set(radius / src.width, 0);
      this.pass(this.mBlur, tmp);
      this.mBlur.uniforms.tSrc.value = tmp.texture;
      this.mBlur.uniforms.dir.value.set(0, radius / src.height);
      this.pass(this.mBlur, dst);
    },

    pipeline(scene, camera) {
      const r = this.r;
      r.getDrawingBufferSize(this.size);
      const w = this.size.x | 0, h = this.size.y | 0;
      this.ensure(w, h);
      const R = this.rts;
      const auto = r.autoClear;
      r.setRenderTarget(R.scene);
      r.clear();
      this.orig(scene, camera);
      r.autoClear = true;
      // bloom: בהירות -> 3 רמות טשטוש
      this.mBright.uniforms.tSrc.value = R.scene.texture;
      this.mBright.uniforms.threshold.value = this.data.threshold;
      this.pass(this.mBright, R.a1);
      this.blur(R.a1, R.b1, R.a1, 1.0);
      this.mBlur.uniforms.tSrc.value = R.a1.texture; this.mBlur.uniforms.dir.value.set(0, 0); this.pass(this.mBlur, R.a2);
      this.blur(R.a2, R.b2, R.a2, 1.5);
      this.mBlur.uniforms.tSrc.value = R.a2.texture; this.mBlur.uniforms.dir.value.set(0, 0); this.pass(this.mBlur, R.a3);
      this.blur(R.a3, R.b3, R.a3, 2.0);
      // תמונה סופית למסך
      const u = this.mFinal.uniforms;
      u.tScene.value = R.scene.texture; u.tB1.value = R.a1.texture; u.tB2.value = R.a2.texture; u.tB3.value = R.a3.texture;
      u.texel.value.set(1 / w, 1 / h); u.time.value = (performance.now() / 1000) % 100;
      u.bloom.value = this.data.bloom; u.exposure.value = this.data.exposure;
      this.pass(this.mFinal, null);
      r.autoClear = auto;
    },
  });
})();
