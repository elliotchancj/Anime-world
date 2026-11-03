import * as THREE from 'three';
import { toon, addOutline } from './core';

const S = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

function mesh(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, 'other'));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export interface Rig {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; hips: THREE.Group;
  phase: number;
}

/** Shin-chan-like 5-year-old built from primitives (original procedural model, 2.5 heads tall, ~1.0 m). */
export function buildShinchan(): Rig {
  const SKIN = '#FBD4AB', SHIRT = '#E3002C', SHORTS = '#FFF8A2', HAIR = '#1C1210', SOCK = '#FFFFFF', SHOE = '#F2C230';
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.34; body.add(hips);
  // shorts
  mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.13, 20), SHORTS, hips, 0, 0.0, 0);
  // torso (shirt)
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
  mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.2, 20), SHIRT, torso, 0, 0.1, 0);
  mesh(S(0.118, 16, 10), SHIRT, torso, 0, 0.2, 0, 1, 0.45, 0.95);
  // head
  const head = new THREE.Group(); head.position.set(0, 0.42, 0); torso.add(head);
  mesh(S(0.2, 28, 20), SKIN, head, 0, 0, 0, 1.08, 0.95, 1.0);
  // cheeks (the famous rice-ball jowls)
  mesh(S(0.11, 16, 12), SKIN, head, -0.1, -0.08, 0.06, 1, 0.9, 1);
  mesh(S(0.11, 16, 12), SKIN, head, 0.1, -0.08, 0.06, 1, 0.9, 1);
  mesh(S(0.09, 16, 12), SKIN, head, 0, -0.12, 0.09, 1.4, 0.8, 1);
  // hair cap (top + back)
  const hairGeo = new THREE.SphereGeometry(0.207, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hair = mesh(hairGeo, HAIR, head, 0, 0.012, -0.012, 1.08, 1.0, 1.0);
  hair.rotation.x = -0.5;
  // ears
  mesh(S(0.045, 12, 8), SKIN, head, -0.215, -0.02, 0, 0.6, 1, 1);
  mesh(S(0.045, 12, 8), SKIN, head, 0.215, -0.02, 0, 0.6, 1, 1);
  // eyebrows (thick)
  const browGeo = new THREE.CapsuleGeometry(0.018, 0.06, 4, 8);
  const bL = mesh(browGeo, HAIR, head, -0.075, 0.075, 0.185); bL.rotation.z = Math.PI / 2 - 0.15;
  const bR = mesh(browGeo, HAIR, head, 0.075, 0.075, 0.185); bR.rotation.z = Math.PI / 2 + 0.15;
  // eyes
  const eyeGeo = S(0.026, 12, 10);
  mesh(eyeGeo, '#111', head, -0.07, 0.025, 0.192, 0.8, 1.15, 0.5).userData.noOutline = true;
  mesh(eyeGeo, '#111', head, 0.07, 0.025, 0.192, 0.8, 1.15, 0.5).userData.noOutline = true;
  mesh(S(0.008, 8, 6), '#fff', head, -0.064, 0.036, 0.205).userData.noOutline = true;
  mesh(S(0.008, 8, 6), '#fff', head, 0.076, 0.036, 0.205).userData.noOutline = true;
  // mouth
  const mouth = mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), '#7a2318', head, 0, -0.085, 0.2);
  mouth.rotation.z = Math.PI; mouth.userData.noOutline = true;
  // arms
  const mkArm = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.135, 0.18, 0); torso.add(g);
    mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), SHIRT, g, side * 0.01, -0.03, 0);
    mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 10), SKIN, g, side * 0.015, -0.12, 0);
    mesh(S(0.04, 12, 10), SKIN, g, side * 0.018, -0.2, 0.0);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  // legs
  const mkLeg = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.065, 0.0, 0); hips.add(g);
    mesh(new THREE.CapsuleGeometry(0.042, 0.13, 4, 10), SKIN, g, 0, -0.12, 0);
    mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.08, 12), SOCK, g, 0, -0.24, 0);
    mesh(S(0.06, 14, 10), SHOE, g, 0, -0.3, 0.03, 0.95, 0.55, 1.45);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  addOutline(root, 0.012);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.userData.hull) (o as THREE.Mesh).castShadow = false; });
  return { root, body, head, armL, armR, legL, legR, hips, phase: 0 };
}

/** Animate a rig. speed in m/s; mode: 'idle'|'walk'|'run'|'jump'|'dance' */
export function animateRig(r: Rig, dt: number, speed: number, mode: string, t: number, kid = true) {
  const k = 1 - Math.exp(-dt * 14);
  const lerp = (o: THREE.Object3D, ax: 'x' | 'y' | 'z', v: number) => { o.rotation[ax] += (v - o.rotation[ax]) * k; };
  const freq = kid ? 2.2 : 1.6;
  r.phase += dt * (speed * freq + (mode === 'idle' ? 0 : 0));
  const p = r.phase * Math.PI * 2 / 2;
  if (mode === 'dance') {
    const d = Math.sin(t * 9);
    lerp(r.hips, 'z', d * 0.35); lerp(r.hips, 'y', Math.sin(t * 4.5) * 0.5);
    lerp(r.body, 'x', 0.55); lerp(r.head, 'x', -0.6);
    lerp(r.armL, 'z', -1.2 + d * 0.3); lerp(r.armR, 'z', 1.2 + d * 0.3);
    lerp(r.armL, 'x', 0); lerp(r.armR, 'x', 0);
    lerp(r.legL, 'x', -0.2); lerp(r.legR, 'x', -0.2);
    r.body.position.y = Math.abs(d) * 0.03;
    return;
  }
  lerp(r.hips, 'z', 0); lerp(r.hips, 'y', 0); lerp(r.body, 'x', 0); lerp(r.head, 'x', 0);
  if (mode === 'jump') {
    lerp(r.armL, 'z', -2.4); lerp(r.armR, 'z', 2.4); lerp(r.armL, 'x', 0); lerp(r.armR, 'x', 0);
    lerp(r.legL, 'x', -0.6); lerp(r.legR, 'x', 0.3);
    r.body.position.y += (0 - r.body.position.y) * k;
    return;
  }
  const amp = mode === 'run' ? 0.95 : mode === 'walk' ? 0.6 : 0;
  const s = Math.sin(p);
  lerp(r.legL, 'x', s * amp); lerp(r.legR, 'x', -s * amp);
  lerp(r.armL, 'x', -s * amp * 0.9); lerp(r.armR, 'x', s * amp * 0.9);
  lerp(r.armL, 'z', -0.12 - (mode === 'run' ? 0.2 : 0)); lerp(r.armR, 'z', 0.12 + (mode === 'run' ? 0.2 : 0));
  if (mode === 'run') lerp(r.body, 'x', 0.18);
  const bob = amp > 0 ? Math.abs(Math.cos(p)) * 0.025 * (mode === 'run' ? 1.6 : 1) : Math.sin(t * 2.2) * 0.004;
  r.body.position.y = bob;
  if (amp === 0) lerp(r.head, 'z', Math.sin(t * 0.9) * 0.05);
}

/** Shiro-like small white fluffy dog (original primitive model). */
export function buildDog(): { root: THREE.Group; tail: THREE.Mesh; legs: THREE.Mesh[]; head: THREE.Group } {
  const root = new THREE.Group();
  const W = '#FBFBF8';
  const fluff = new THREE.Group(); root.add(fluff);
  mesh(S(0.13, 18, 14), W, fluff, 0, 0.15, 0, 1, 0.95, 1.1);
  const head = new THREE.Group(); head.position.set(0, 0.24, 0.12); fluff.add(head);
  mesh(S(0.1, 18, 14), W, head, 0, 0.05, 0.02);
  mesh(S(0.04, 10, 8), W, head, -0.065, 0.13, 0, 1, 0.8, 0.6);
  mesh(S(0.04, 10, 8), W, head, 0.065, 0.13, 0, 1, 0.8, 0.6);
  mesh(S(0.012, 8, 6), '#111', head, -0.035, 0.07, 0.1).userData.noOutline = true;
  mesh(S(0.012, 8, 6), '#111', head, 0.035, 0.07, 0.1).userData.noOutline = true;
  mesh(S(0.014, 8, 6), '#222', head, 0, 0.04, 0.12).userData.noOutline = true;
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.06, 0.07], [0.06, 0.07], [-0.06, -0.07], [0.06, -0.07]]) legs.push(mesh(new THREE.CapsuleGeometry(0.025, 0.05, 3, 8), W, fluff, x, 0.04, z));
  const tail = mesh(S(0.04, 10, 8), W, fluff, 0, 0.22, -0.14);
  addOutline(root, 0.008);
  return { root, tail, legs, head };
}

export interface PersonStyle { top: string; bottom: string; skin?: string; hair?: string; height?: number; hat?: string; skirt?: boolean; bag?: string; }

export function buildPerson(st: PersonStyle): Rig {
  const h = st.height ?? 1.65;
  const sc = h / 1.65;
  const SKIN = st.skin ?? '#F6D2B0';
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.85 * sc; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  mesh(new THREE.CylinderGeometry(0.16 * sc, 0.15 * sc, 0.55 * sc, 14), st.top, torso, 0, 0.28 * sc, 0, 1, 1, 0.7);
  if (st.skirt) mesh(new THREE.CylinderGeometry(0.15 * sc, 0.24 * sc, 0.4 * sc, 14), st.bottom, hips, 0, -0.12 * sc, 0, 1, 1, 0.8);
  const head = new THREE.Group(); head.position.y = 0.7 * sc; torso.add(head);
  mesh(S(0.11 * sc, 16, 12), SKIN, head, 0, 0, 0, 1, 1.12, 1);
  mesh(new THREE.SphereGeometry(0.115 * sc, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), st.hair ?? '#2a211c', head, 0, 0.015 * sc, -0.01, 1, 1.12, 1.02);
  if (st.hat) { mesh(new THREE.SphereGeometry(0.125 * sc, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), st.hat, head, 0, 0.04 * sc, 0); mesh(new THREE.CylinderGeometry(0.17 * sc, 0.17 * sc, 0.01, 16), st.hat, head, 0, 0.04 * sc, 0.02); }
  mesh(S(0.012 * sc, 6, 6), '#111', head, -0.04 * sc, 0.02 * sc, 0.1 * sc).userData.noOutline = true;
  mesh(S(0.012 * sc, 6, 6), '#111', head, 0.04 * sc, 0.02 * sc, 0.1 * sc).userData.noOutline = true;
  if (st.bag) mesh(new THREE.BoxGeometry(0.22 * sc, 0.26 * sc, 0.12 * sc), st.bag, torso, 0, 0.33 * sc, -0.15 * sc);
  const mkArm = (side: number) => { const g = new THREE.Group(); g.position.set(side * 0.19 * sc, 0.52 * sc, 0); torso.add(g); mesh(new THREE.CapsuleGeometry(0.045 * sc, 0.42 * sc, 4, 8), st.top, g, 0, -0.25 * sc, 0); mesh(S(0.045 * sc, 8, 6), SKIN, g, 0, -0.5 * sc, 0); return g; };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = (side: number) => { const g = new THREE.Group(); g.position.set(side * 0.08 * sc, 0, 0); hips.add(g); mesh(new THREE.CapsuleGeometry(0.06 * sc, 0.62 * sc, 4, 8), st.skirt ? SKIN : st.bottom, g, 0, -0.42 * sc, 0); mesh(new THREE.BoxGeometry(0.1 * sc, 0.06 * sc, 0.2 * sc), '#3a3330', g, 0, -0.82 * sc, 0.03); return g; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  addOutline(root, 0.01);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.userData.hull) (o as THREE.Mesh).castShadow = false; });
  return { root, body, head, armL, armR, legL, legR, hips, phase: Math.random() * 10 };
}
