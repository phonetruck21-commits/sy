/* אנשים וכלבים אמיתיים: דמויות סרוקות מספריית Microsoft Rocketbox (רישיון MIT),
 * עם שלד ואנימציות מצולמות (הליכה, ריצה, נפנוף, ריקוד, דיבור, ישיבה, הקלדה בטלפון).
 * מחליף את StoreCharacters.person ו-StoreCharacters.pet('dog') באותו ממשק:
 *   { object, head, height, play(name), setPose(pose), update(dt, speed) }
 * הדמות נטענת ברקע; עד שהיא מגיעה רואים רק צל רך על הרצפה.
 */
(function () {
  'use strict';
  const C = window.StoreCharacters;
  if (!C || !THREE.GLTFLoader) return;

  const BASE = 'assets/people/';
  const CAST = {
    Female_Adult_01: { g: 'f', name: 'שירה' },
    Female_Adult_08: { g: 'f', name: 'מאיה' },
    Female_Adult_17: { g: 'f', name: 'נטע' },
    Male_Adult_08: { g: 'm', name: 'עומר' },
    Male_Adult_09: { g: 'm', name: 'דניאל' },
    Male_Adult_16: { g: 'm', name: 'יונתן' },
    Female_Child_01: { g: 'f', kid: true, name: 'ילדה' },
    Male_Child_01: { g: 'm', kid: true, name: 'ילד' },
    Business_Female_01: { g: 'f', name: 'נועה' },
    Custom_Male_01: { g: 'm', name: 'כובע וזקן' }, // מותאם לפי תמונה (בסיס Male_Adult_17)
  };
  const ADULTS_F = ['Female_Adult_01', 'Female_Adult_08', 'Female_Adult_17'];
  const ADULTS_M = ['Male_Adult_08', 'Male_Adult_09', 'Male_Adult_16'];

  const loader = new THREE.GLTFLoader();
  const files = {};
  const file = (n) => files[n] || (files[n] = new Promise((res, rej) => loader.load(BASE + n + '.glb', res, undefined, rej)));

  /* שכפול דמות עם שלד (כמו SkeletonUtils.clone) */
  function walk2(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) walk2(a.children[i], b.children[i], cb); }
  function cloneSkinned(src) {
    const srcOf = new Map(), cloneOf = new Map();
    const out = src.clone();
    walk2(src, out, (s, c) => { srcOf.set(c, s); cloneOf.set(s, c); });
    out.traverse((n) => {
      if (!n.isSkinnedMesh) return;
      const s = srcOf.get(n);
      n.skeleton = s.skeleton.clone();
      n.bindMatrix.copy(s.bindMatrix);
      n.skeleton.bones = s.skeleton.bones.map((b) => cloneOf.get(b));
      n.bind(n.skeleton, n.bindMatrix);
    });
    return out;
  }
  const hipY = (scene) => { let y = null; scene.traverse((n) => { if (y === null && n.name === 'Bip01') y = n.position.y; }); return y; };

  /* תבנית לכל דמות: שמות עצמות אחידים, חומרים, וקליפים מותאמים לגובה (ילדים) */
  const templates = {};
  function template(id) {
    if (templates[id]) return templates[id];
    const meta = CAST[id];
    templates[id] = Promise.all([file(id), file('anim_' + meta.g)]).then(([m, a]) => {
      const scene = m.scene;
      scene.traverse((n) => {
        if (n.name && n.name.startsWith('Bip02')) n.name = n.name.replace('Bip02', 'Bip01');
        if (n.isMesh) {
          n.castShadow = true; n.frustumCulled = false;
          [].concat(n.material).forEach((mt) => { mt.envMapIntensity = 0.6; if (mt.name === 'opacity') { mt.alphaTest = 0.5; mt.side = THREE.DoubleSide; } });
        }
      });
      let clips = a.animations;
      const k = (hipY(scene) || 1) / (hipY(a.scene) || 1);
      if (Math.abs(k - 1) > 0.03) {
        clips = clips.map((c) => {
          const c2 = c.clone();
          c2.tracks.forEach((t) => { if (/^Bip01\.position$/.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= k; });
          return c2;
        });
      }
      return { scene, clips, meta };
    });
    return templates[id];
  }

  function hashStr(s) { let x = 7; for (const ch of String(s || '')) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; }
  function pickAvatar(look = {}) {
    if (CAST[look.avatar]) return look.avatar;
    const fem = ['long', 'ponytail'].includes(look.hairStyle);
    if (look.kid) return fem ? 'Female_Child_01' : 'Male_Child_01';
    const list = fem ? ADULTS_F : ADULTS_M;
    return list[hashStr(look.color + look.skin) % list.length];
  }

  const ONCE = { wave: 2.6, jump: 3.0, dance: 6.5, talk: 6 };

  function person(look = {}) {
    const id = pickAvatar(look);
    const meta = CAST[id];
    const kid = !!meta.kid;
    const root = new THREE.Group();
    if (window.StoreEnv) { const sh = window.StoreEnv.shadowMesh(0.7, 0.55, 0.4); sh.position.y = 0.012; root.add(sh); }
    const height = kid ? 1.4 : 1.75;
    const head = new THREE.Object3D(); head.position.y = height - 0.15; root.add(head);
    let mixer = null, actions = {}, cur = null, pose = null, act = null, actT = 0, idle = look.idle || 'idle', model = null;

    template(id).then((t) => {
      model = cloneSkinned(t.scene);
      model.scale.setScalar(0.01);
      root.add(model);
      mixer = new THREE.AnimationMixer(model);
      t.clips.forEach((c) => { actions[c.name] = mixer.clipAction(c); });
      ['wave', 'jump'].forEach((n) => { if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; } });
      mixer.update(Math.random() * 3);
    }).catch((e) => console.warn('avatar', id, e));

    function go(name, fade = 0.3) {
      const a = actions[name];
      if (!a || cur === name) return;
      const prev = cur && actions[cur];
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
      if (prev) a.crossFadeFrom(prev, fade, true);
      cur = name;
    }

    return {
      object: root, head, height, avatar: id,
      play(name) { if (ONCE[name]) { act = name; actT = ONCE[name]; } },
      setPose(p) { pose = p; },
      setIdle(n) { idle = n; },
      update(dt, speed) {
        if (!mixer) return;
        if (act) { actT -= dt; if (actT <= 0) act = null; }
        const moving = speed > 0.12;
        if (moving && act && act !== 'talk') act = null;
        const want = pose === 'sit' || pose === 'slide' ? 'sit' : act || (speed > 2.6 ? 'run' : moving ? 'walk' : idle);
        go(actions[want] ? want : 'idle');
        if (cur === 'walk') actions.walk.timeScale = THREE.MathUtils.clamp(speed / (kid ? 1.1 : 1.3), 0.6, 1.7);
        if (cur === 'run') actions.run.timeScale = THREE.MathUtils.clamp(speed / 3.6, 0.7, 1.4);
        mixer.update(dt);
      },
    };
  }

  /* ---------- כלבים אמיתיים: ביגל ורועה גרמני, עם הליכה פרוצדורלית על השלד ---------- */
  const dogFiles = { beagle: 'Dog_Beagle_01', shepherd: 'Dog_GermanShepard_01' };
  const dogTpl = {};
  function dogTemplate(kind) {
    return dogTpl[kind] || (dogTpl[kind] = file(dogFiles[kind]).then((m) => {
      m.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; } });
      return m.scene;
    }));
  }
  const darkDog = (c) => { if (!c) return false; const col = new THREE.Color(c); return col.r + col.g + col.b < 0.9; };

  function realDog(color) {
    const kind = darkDog(color) ? 'shepherd' : 'beagle';
    const root = new THREE.Group();
    if (window.StoreEnv) { const sh = window.StoreEnv.shadowMesh(0.5, 0.8, 0.35); sh.position.y = 0.012; root.add(sh); }
    let rig = null, phase = Math.random() * 6;
    dogTemplate(kind).then((tpl) => {
      const model = cloneSkinned(tpl);
      const s = kind === 'beagle' ? 0.01 : 0.0085;
      model.scale.setScalar(s);
      model.updateMatrixWorld(true);
      const find = (suffix) => { let b = null; model.traverse((n) => { if (!b && n.isBone && n.name.endsWith(suffix)) b = n; }); return b; };
      const lateral = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0);
      const mkJoint = (suffix, axisRoot) => {
        const b = find(suffix); if (!b) return null;
        const pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq);
        return { b, q0: b.quaternion.clone(), axis: axisRoot.clone().applyQuaternion(pq.invert()).normalize() };
      };
      rig = {
        fl: mkJoint('L_UpperArm', lateral), fr: mkJoint('R_UpperArm', lateral),
        bl: mkJoint('L_Thigh', lateral), br: mkJoint('R_Thigh', lateral),
        flc: mkJoint('L_Forearm', lateral), frc: mkJoint('R_Forearm', lateral),
        blc: mkJoint('L_Calf', lateral), brc: mkJoint('R_Calf', lateral),
        tail: mkJoint('_Tail', up), tail1: mkJoint('_Tail1', up), head: mkJoint('_Head', up), neck: mkJoint('_Neck1', lateral),
      };
      root.add(model);
    }).catch((e) => console.warn('dog', e));
    const qa = new THREE.Quaternion();
    const set = (j, ang) => { if (!j) return; qa.setFromAxisAngle(j.axis, ang); j.b.quaternion.copy(qa).multiply(j.q0); };
    return {
      object: root,
      update(dt, speed) {
        if (!rig) return;
        const moving = speed > 0.08;
        phase += dt * (moving ? 7 + speed * 2.5 : 2);
        const amp = moving ? Math.min(0.55, 0.3 + speed * 0.1) : 0;
        const s1 = Math.sin(phase) * amp, s2 = Math.sin(phase + Math.PI) * amp;
        set(rig.fl, s1); set(rig.br, s1 * 0.9); set(rig.fr, s2); set(rig.bl, s2 * 0.9);
        set(rig.flc, moving ? Math.max(0, -Math.sin(phase)) * 0.6 : 0);
        set(rig.frc, moving ? Math.max(0, Math.sin(phase)) * 0.6 : 0);
        set(rig.blc, moving ? -Math.max(0, Math.sin(phase)) * 0.5 : 0);
        set(rig.brc, moving ? -Math.max(0, -Math.sin(phase)) * 0.5 : 0);
        const wag = Math.sin(phase * (moving ? 1.5 : 4.5)) * (moving ? 0.35 : 0.6);
        set(rig.tail, wag); set(rig.tail1, wag * 0.8);
        set(rig.head, moving ? 0 : Math.sin(phase * 0.25) * 0.35);
        set(rig.neck, moving ? Math.sin(phase * 2) * 0.04 : 0);
      },
    };
  }

  const basePet = C.pet;
  C.person = person;
  C.pet = (kind, color) => (kind === 'dog' ? realDog(color) : basePet(kind, color));
  C.CAST = CAST;
  C.preload = (ids) => (ids || Object.keys(CAST)).forEach((id) => template(id));
  // טוענים מראש את מה שכמעט תמיד מופיע: המוכרת וכלבים
  template('Business_Female_01'); dogTemplate('beagle');
})();
