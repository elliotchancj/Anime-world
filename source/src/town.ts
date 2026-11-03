import * as THREE from 'three';
import { Builder, toon, hipRoof, canvasTex, JP_FONT, rand } from './core';
import type { Physics } from './physics';
import { cypress, roundTree, inspectables } from './house';

const ROAD = '#7B7FC8', CURB = '#B9BDE8';
export const nightGlowMats: THREE.MeshToonMaterial[] = [];
function winMat() { const m = toon('#4E6190', 'other', { emissive: '#000000' }); if (!nightGlowMats.includes(m)) nightGlowMats.push(m); return m; }

let B: Builder; let P: Physics; let scene: THREE.Scene;

function genericHouse(x0: number, z0: number, x1: number, z1: number, face: 'N' | 'S' | 'E' | 'W', wall: string, roof: string, r: () => number, floors = 2) {
  const W = x1 - x0, D = z1 - z0;
  // block wall around the lot (gap on the facing side)
  const bw = '#C9C6BB', h = 1.2, t = 0.14;
  const gapC = face === 'N' || face === 'S' ? x0 + W * (0.35 + r() * 0.3) : z0 + D * (0.35 + r() * 0.3);
  const seg = (a0: number, a1: number, fixed: number, axis: 'x' | 'z') => { if (a1 - a0 < 0.05) return; if (axis === 'x') B.box(a0, 0, fixed - t / 2, a1, h, fixed + t / 2, bw, { surface: 'wall' }); else B.box(fixed - t / 2, 0, a0, fixed + t / 2, h, a1, bw, { surface: 'wall' }); };
  const sides: Record<string, [number, number, number, 'x' | 'z']> = { N: [x0, x1, z0 + t / 2, 'x'], S: [x0, x1, z1 - t / 2, 'x'], W: [z0, z1, x0 + t / 2, 'z'], E: [z0, z1, x1 - t / 2, 'z'] };
  for (const k of ['N', 'S', 'E', 'W']) { const [a, b, f, ax] = sides[k]; if (k === face) { seg(a, gapC - 0.8, f, ax); seg(gapC + 0.8, b, f, ax); } else seg(a, b, f, ax); }
  // yard
  const sh = new THREE.PlaneGeometry(W, D); sh.rotateX(-Math.PI / 2); sh.translate((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
  B.addGeo(sh, toon(r() > 0.5 ? '#9AD47A' : '#D6D0BF', 'lawn'), { edges: false, cast: false });
  // body
  const inset = 1.4;
  let bx0 = x0 + inset, bx1 = x1 - inset, bz0 = z0 + inset, bz1 = z1 - inset;
  if (face === 'N') bz0 += 1.2; if (face === 'S') bz1 -= 1.2; if (face === 'W') bx0 += 1.2; if (face === 'E') bx1 -= 1.2;
  const H = floors * 2.8 + 0.4;
  B.box(bx0, 0, bz0, bx1, H, bz1, wall, { surface: 'wall' });
  B.box(bx0 - 0.03, 0, bz0 - 0.03, bx1 + 0.03, 0.4, bz1 + 0.03, '#BDB8AE', { collide: false, cast: false });
  B.addGeo(hipRoof(bx0 - 0.45, bz0 - 0.45, bx1 + 0.45, bz1 + 0.45, H, 0.5), toon(roof, 'roof'), { camBlock: true });
  // windows on all 4 faces
  const wm = winMat();
  const facade = (axis: 'x' | 'z', a0: number, a1: number, at: number, out: number) => {
    const n = Math.max(1, Math.floor((a1 - a0) / 2.6));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      if (r() < 0.25) continue;
      const c = a0 + ((i + 0.5) * (a1 - a0)) / n, ww = 0.8 + r() * 0.6, y0 = 0.4 + f * 2.8 + 0.9, y1 = y0 + 1.1;
      if (axis === 'x') { B.box(c - ww / 2, y0, at, c + ww / 2, y1, at + out * 0.03, wm, { collide: false, cast: false }); B.box(c - ww / 2 - 0.05, y0 - 0.06, at, c + ww / 2 + 0.05, y0, at + out * 0.06, '#F2F2EC', { collide: false, cast: false }); }
      else { B.box(at, y0, c - ww / 2, at + out * 0.03, y1, c + ww / 2, wm, { collide: false, cast: false }); B.box(at, y0 - 0.06, c - ww / 2 - 0.05, at + out * 0.06, y0, c + ww / 2 + 0.05, '#F2F2EC', { collide: false, cast: false }); }
    }
  };
  facade('x', bx0, bx1, bz1, 1); facade('x', bx0, bx1, bz0, -1); facade('z', bz0, bz1, bx0, -1); facade('z', bz0, bz1, bx1, 1);
  // front door
  const dc = face === 'N' || face === 'S' ? Math.min(Math.max(gapC, bx0 + 0.6), bx1 - 0.6) : Math.min(Math.max(gapC, bz0 + 0.6), bz1 - 0.6);
  const DOOR = ['#8A5A3C', '#5A6E8A', '#B07A4A'][Math.floor(r() * 3)];
  if (face === 'S') B.box(dc - 0.45, 0, bz1, dc + 0.45, 2.1, bz1 + 0.05, DOOR, { collide: false });
  if (face === 'N') B.box(dc - 0.45, 0, bz0 - 0.05, dc + 0.45, 2.1, bz0, DOOR, { collide: false });
  if (face === 'E') B.box(bx1, 0, dc - 0.45, bx1 + 0.05, 2.1, dc + 0.45, DOOR, { collide: false });
  if (face === 'W') B.box(bx0 - 0.05, 0, dc - 0.45, bx0, 2.1, dc + 0.45, DOOR, { collide: false });
  // a garden tree
  if (r() > 0.35) roundTree(x0 + 0.9 + r() * (W - 1.8), face === 'N' ? z1 - 0.9 : z0 + 0.9, 2 + r() * 1.5, '#3F8A3A');
}

export interface TownHandles { lamps: THREE.Mesh[]; lampLights: THREE.PointLight[]; paths: THREE.Vector3[][]; vending: THREE.Mesh; }

export function buildTown(b: Builder, physics: Physics, sc: THREE.Scene): TownHandles {
  B = b; P = physics; scene = sc; B.setOffset(0, 0, 0);
  const r = rand(7);
  // base ground (beyond roads)
  const g = new THREE.PlaneGeometry(400, 400); g.rotateX(-Math.PI / 2); g.translate(20, -0.005, 0);
  B.addGeo(g, toon('#D3CDBB', 'ground'), { edges: false, cast: false });
  P.addBox(20, -0.5, 0, 200, 0.5, 200);
  // roads
  const road = (x0: number, z0: number, x1: number, z1: number) => B.box(x0, -0.004, z0, x1, 0.004, z1, toon(ROAD, 'road'), { collide: false, edges: false, cast: false });
  road(-5, -80, 0, 80); road(-80, 10.4, 100, 15.4); road(-80, -21, 100, -16); road(44, -80, 49, 80); road(-80, 40, 100, 45); road(-40, -80, -35, 80);
  const curb = (x0: number, z0: number, x1: number, z1: number) => B.box(x0, 0, z0, x1, 0.02, z1, toon(CURB, 'road'), { collide: false, edges: false, cast: false });
  // curb strips along the Nohara block & opposite edges
  curb(-0.35, -16, 0, 10.4); curb(0, 10.4, 44, 10.75); curb(-5, 15.05, 44, 15.4); curb(-5.35, -16, -5, 10.4); curb(-5.35, 15.4, -5, 40); curb(-0.35, 15.4, 0, 40); curb(0, -16.35, 44, -16); curb(43.65, -16, 44, 10.4); curb(49, -16, 49.35, 40);
  // stop line + 止まれ painted on west road before the intersection
  B.box(-5, 0.006, 9.6, -2.5, 0.01, 9.9, '#F4F4F4', { collide: false, edges: false, cast: false });
  const tomare = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 192, c => { c.fillStyle = '#F4F4F4'; c.font = 'bold 60px ' + JP_FONT; c.textAlign = 'center'; c.fillText('止', 64, 60); c.fillText('ま', 64, 122); c.fillText('れ', 64, 184); }) }));
  tomare.rotation.x = -Math.PI / 2; tomare.rotation.z = Math.PI; tomare.position.set(-3.75, 0.012, 7.4); scene.add(tomare);

  // ---- Kitamoto house (north neighbour, white walls, blue roof) ----
  genericHouse(0, -16, 15.6, -0.2, 'N', '#F3F1EA', '#4C6FC4', r);
  // ---- apartment (east) ----
  apartment(16.2, -1.5, 29.2, 8.8);
  B.box(15.6, 0, 9.8, 30, 1.0, 10.3, '#C9C6BB', { surface: 'wall' });
  genericHouse(15.6, -16, 30, -2.2, 'N', '#EFE4CF', '#8A5A44', r);
  // ---- park ----
  park(30, -3.5, 44, 10.4);
  genericHouse(30, -16, 44, -4, 'N', '#F5EEE0', '#5D8F6B', r);
  // ---- south side of the south road (facing north) ----
  const cols = [['#F2EBDD', '#C1543F'], ['#E9EEF2', '#4E6FA8'], ['#F7F0E0', '#6B7F4A'], ['#F0E6E6', '#8C4A5A'], ['#EFEFE8', '#3F6E8C']];
  let i = 0;
  for (let x = -5.2 + 5.2; x < 44; x += 11) { const [w, rf] = cols[i++ % cols.length]; genericHouse(x, 15.4, Math.min(x + 11, 44), 27.8, 'N', w, rf, r); }
  for (let x = 0; x < 44; x += 11) { const [w, rf] = cols[i++ % cols.length]; genericHouse(x, 27.8, Math.min(x + 11, 44), 40, 'S', w, rf, r); }
  // ---- west of the west road (facing east) ----
  for (const [z0, z1] of [[-16, -3], [-3, 10.4], [15.4, 27.8], [27.8, 40]]) { const [w, rf] = cols[i++ % cols.length]; genericHouse(-20, z0, -5, z1, 'E', w, rf, r); genericHouse(-35, z0, -20, z1, 'W', cols[i % 5][0], cols[(i + 2) % 5][1], r); }
  // ---- north of the north road (facing south) ----
  for (const [x0, x1] of [[-35, -20], [-20, -5], [0, 14.6], [14.6, 29.3], [29.3, 44]]) { const [w, rf] = cols[i++ % cols.length]; genericHouse(x0, -36, x1, -21, 'S', w, rf, r); }
  // ---- east of the east road ----
  for (const [z0, z1] of [[-16, -2], [-2, 10.4], [15.4, 27.8]]) { const [w, rf] = cols[i++ % cols.length]; genericHouse(49, z0, 63, z1, 'W', w, rf, r); }

  // ---- utility poles + wires ----
  const lamps: THREE.Mesh[] = []; const lampLights: THREE.PointLight[] = [];
  const poles: THREE.Vector3[] = [];
  const pole = (x: number, z: number, lampDir: THREE.Vector3 | null) => {
    const geo = new THREE.CylinderGeometry(0.13, 0.18, 9, 10); geo.translate(x, 4.5, z);
    B.addGeo(geo, toon('#B9B6AE', 'other'), { edges: false });
    P.addCylinder(x, 4.5, z, 4.5, 0.18);
    B.box(x - 0.9, 8.1, z - 0.05, x + 0.9, 8.22, z + 0.05, '#8C8880', { collide: false, edges: false });
    B.box(x - 0.6, 7.3, z - 0.05, x + 0.6, 7.4, z + 0.05, '#8C8880', { collide: false, edges: false });
    for (const dx of [-0.8, 0, 0.8]) B.boxC(x + dx, 8.3, z, 0.08, 0.14, 0.08, '#E8E6E0', { collide: false, edges: false });
    if (r() > 0.4) { const t = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 12); t.translate(x + 0.4, 6.4, z + 0.15); B.addGeo(t, toon('#9DA3A8', 'other'), { edges: false }); }
    // signage band
    B.box(x - 0.2, 2.0, z - 0.2, x + 0.2, 2.9, z + 0.2, '#F2E37A', { collide: false, edges: false });
    if (lampDir) {
      const end = new THREE.Vector3(x, 5.2, z).addScaledVector(lampDir, 1.1);
      B.box(Math.min(x, end.x) - 0.03, 5.15, Math.min(z, end.z) - 0.03, Math.max(x, end.x) + 0.03, 5.23, Math.max(z, end.z) + 0.03, '#8C8880', { collide: false, edges: false });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.22), toon('#FFFFFF', 'other', { emissive: '#000000' }));
      lamp.position.copy(end).setY(5.12); scene.add(lamp); lamps.push(lamp);
      if (lampLights.length < 4) { const pl = new THREE.PointLight('#ffe2a8', 0, 16, 1.6); pl.position.copy(end).setY(5.0); scene.add(pl); lampLights.push(pl); }
    }
    poles.push(new THREE.Vector3(x, 8.15, z));
  };
  // along the south road (north edge, in front of the Nohara block) and west road
  const southPoles = [-7, 6.5, 21, 35.5, 50]; const westPoles = [-30, -14.5, 1.0];
  for (const x of southPoles) pole(x, x < 0 ? 15.8 : 10.95, new THREE.Vector3(0, 0, x < 0 ? -1 : 1));
  for (const z of westPoles) pole(-5.5, z, new THREE.Vector3(1, 0, 0));
  const wire = (a: THREE.Vector3, c: THREE.Vector3) => {
    const pts: number[] = [];
    for (const dy of [0, -0.85]) for (const dx of [-0.8, 0.8]) {
      const A = a.clone().add(new THREE.Vector3(dx, dy, 0)), C = c.clone().add(new THREE.Vector3(dx, dy, 0));
      let prev = A;
      for (let k = 1; k <= 12; k++) { const t = k / 12; const p = A.clone().lerp(C, t); p.y -= Math.sin(t * Math.PI) * 0.45; pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); prev = p; }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#2a2a30' })));
  };
  for (let k = 0; k < southPoles.length - 1; k++) wire(poles[k], poles[k + 1]);
  for (let k = 0; k < westPoles.length - 1; k++) wire(poles[southPoles.length + k], poles[southPoles.length + k + 1]);
  wire(poles[southPoles.length + westPoles.length - 1], poles[0]);
  wire(poles[1], new THREE.Vector3(10.5, 5.0, 4.5)); // service drop to the Nohara house

  // ---- curve mirror (SW corner of the intersection) ----
  const cm = new THREE.Group(); cm.position.set(-5.6, 0, 15.9); scene.add(cm);
  const OR = toon('#E8762B', 'other');
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), OR); pm.position.y = 1.45; cm.add(pm);
  for (const ry of [Math.PI * 0.85, Math.PI * 0.35]) {
    const m = new THREE.Group(); m.position.y = 2.9; m.rotation.y = ry; cm.add(m);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), OR); ring.rotation.x = Math.PI / 2; m.add(ring);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.37, 24), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, c => { const gr = c.createRadialGradient(24, 24, 4, 32, 32, 34); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#8FA8C8'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }) }));
    face.position.z = 0.035; m.add(face);
  }
  cm.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  P.addCylinder(-5.6, 1.45, 15.9, 1.45, 0.08);
  cm.userData.inspect = { name: 'Curve mirror', desc: 'Orange traffic mirror on the corner - a classic Japanese residential street detail.' };
  inspectables.push({ obj: cm, name: 'Curve mirror', desc: cm.userData.inspect.desc });
  // ---- stop sign ----
  const ss = new THREE.Group(); ss.position.set(-5.45, 0, 9.4); scene.add(ss);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), toon('#D8D8D8', 'other')); sp.position.y = 1.15; ss.add(sp);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: canvasTex(160, 140, c => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(160, 0); c.lineTo(80, 140); c.fill(); c.fillStyle = '#D7262C'; c.beginPath(); c.moveTo(10, 6); c.lineTo(150, 6); c.lineTo(80, 128); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 34px ' + JP_FONT; c.textAlign = 'center'; c.fillText('止まれ', 80, 48); }) }));
  sign.position.set(0, 2.15, 0.05); sign.rotation.y = Math.PI; ss.add(sign);
  P.addCylinder(-5.45, 1.15, 9.4, 1.15, 0.05);
  // ---- vending machine near the park ----
  const vm = new THREE.Group(); vm.position.set(29.3, 0, 9.75); scene.add(vm);
  const vb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), toon('#D7262C', 'other')); vb.position.y = 0.925; vb.castShadow = true; vm.add(vb);
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.0), new THREE.MeshBasicMaterial({ map: canvasTex(128, 150, c => { c.fillStyle = '#F7F7F2'; c.fillRect(0, 0, 128, 150); const cc = ['#3F7FD8', '#E8C547', '#5AAE61', '#E3342F', '#F08CB0', '#8A5A3C']; for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { c.fillStyle = cc[(x + y * 2) % 6]; c.fillRect(6 + x * 20, 12 + y * 46, 14, 30); c.fillStyle = '#333'; c.fillRect(6 + x * 20, 44 + y * 46, 14, 4); } }) }));
  vf.position.set(0, 1.25, 0.38); vm.add(vf);
  P.addBox(29.3, 0.92, 9.75, 0.5, 0.92, 0.38);
  vm.userData.inspect = { name: 'Vending machine', desc: 'Drinks vending machine by the park. It glows at night.' };
  inspectables.push({ obj: vm, name: 'Vending machine', desc: vm.userData.inspect.desc });

  const paths: THREE.Vector3[][] = [
    [new THREE.Vector3(-0.9, 0, -17), new THREE.Vector3(-0.9, 0, 11.3), new THREE.Vector3(43.1, 0, 11.3), new THREE.Vector3(43.1, 0, -15.2)],
    [new THREE.Vector3(-4.1, 0, -20.2), new THREE.Vector3(48.1, 0, -20.2), new THREE.Vector3(48.1, 0, 14.5), new THREE.Vector3(-4.1, 0, 14.5)],
    [new THREE.Vector3(-30, 0, 13.0), new THREE.Vector3(60, 0, 13.0)],
    [new THREE.Vector3(-2.5, 0, -60), new THREE.Vector3(-2.5, 0, 42.5), new THREE.Vector3(46.5, 0, 42.5), new THREE.Vector3(46.5, 0, -60)],
  ];
  return { lamps, lampLights, paths, vending: vf };
}

function apartment(x0: number, z0: number, x1: number, z1: number) {
  const floors = 3, fh = 2.9, H = floors * fh + 0.3;
  B.box(x0, 0, z0, x1, H, z1, '#E9E5DA', { surface: 'wall' });
  B.box(x0 - 0.1, H, z0 - 0.1, x1 + 0.1, H + 0.35, z1 + 0.1, '#D8D3C6', { surface: 'wall' });
  B.box(x0, H + 0.35, z0, x1, H + 0.37, z1, toon('#9A9A9A', 'roof'), { collide: false, edges: false });
  const wm = winMat();
  const units = 4, uw = (x1 - x0) / units;
  for (let f = 0; f < floors; f++) {
    const y = f * fh + 0.3;
    // south balconies
    B.box(x0, y + fh - 0.15, z1, x1, y + fh, z1 + 1.1, '#DAD5C8', { collide: f === 0, surface: 'wall' });
    if (f > 0 || true) for (let u = 0; u < units; u++) {
      const ux = x0 + u * uw;
      B.box(ux + 0.3, y + 0.2, z1, ux + uw - 0.3, y + 2.2, z1 + 0.03, wm, { collide: false, cast: false });
      if (f > 0) { B.box(ux + 0.05, y - 0.15 + 0.15, z1 + 1.0, ux + uw - 0.05, y + 1.0, z1 + 1.1, '#7F96B8', { collide: false }); }
      B.box(ux - 0.06, y, z1, ux + 0.06, y + fh, z1 + 1.1, '#DAD5C8', { collide: false });
      // north corridor windows
      B.box(ux + 0.5, y + 1.0, z0 - 0.03, ux + 1.5, y + 2.0, z0, wm, { collide: false, cast: false });
    }
  }
  // external stair on the east end
  B.box(x1, 0, z0 + 1, x1 + 1.4, H - 0.4, z0 + 4, '#CFCAC0', { surface: 'wall' });
  for (let k = 0; k < 6; k++) cypress(x0 - 0.2, z0 + 1 + k * 1.6, 3.2 + (k % 2) * 0.8);
}

function park(x0: number, z0: number, x1: number, z1: number) {
  const g = new THREE.PlaneGeometry(x1 - x0 - 0.6, z1 - z0 - 0.6); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
  B.addGeo(g, toon('#E3D3A6', 'ground'), { edges: false, cast: false });
  // low green fence with an entrance on the south
  const F = '#4C9A55';
  B.box(x0 + 0.3, 0, z1 - 0.38, x0 + 6, 0.7, z1 - 0.3, F); B.box(x0 + 8, 0, z1 - 0.38, x1 - 0.3, 0.7, z1 - 0.3, F);
  B.box(x0 + 0.3, 0, z0 + 0.3, x0 + 0.38, 0.7, z1 - 0.3, F); B.box(x1 - 0.38, 0, z0 + 0.3, x1 - 0.3, 0.7, z1 - 0.3, F);
  B.box(x0 + 0.3, 0, z0 + 0.3, x1 - 0.3, 0.7, z0 + 0.38, F);
  // swing
  const sx = x0 + 3, sz = z0 + 3;
  for (const dx of [0, 3]) for (const dz of [-0.6, 0.6]) B.box(sx + dx - 0.05, 0, sz + dz - 0.05, sx + dx + 0.05, 2.3, sz + dz + 0.05, '#D7262C');
  B.box(sx - 0.05, 2.25, sz - 0.05, sx + 3.05, 2.35, sz + 0.05, '#D7262C', { collide: false });
  for (const dx of [0.9, 2.1]) { B.box(sx + dx - 0.25, 0.45, sz - 0.12, sx + dx + 0.25, 0.5, sz + 0.12, '#E8C547', { collide: false }); for (const ex of [-0.22, 0.22]) B.box(sx + dx + ex - 0.01, 0.5, sz - 0.01, sx + dx + ex + 0.01, 2.25, sz + 0.01, '#9DA3A8', { collide: false, edges: false }); }
  // slide
  const lx = x0 + 9, lz = z0 + 4;
  B.box(lx, 0, lz, lx + 0.8, 1.8, lz + 0.8, '#3F7FD8');
  const sl = new THREE.BoxGeometry(0.6, 0.06, 3.0); sl.rotateX(-0.6); sl.translate(lx + 0.4, 0.95, lz + 0.8 + 1.25);
  B.addGeo(sl, toon('#E8C547', 'other'), { camBlock: false });
  // bench + sandbox + trees
  B.box(x0 + 2, 0.4, z1 - 2.2, x0 + 3.8, 0.46, z1 - 1.8, '#B07A4A'); B.box(x0 + 2, 0, z1 - 2.1, x0 + 2.1, 0.4, z1 - 1.9, '#666', { collide: false }); B.box(x0 + 3.7, 0, z1 - 2.1, x0 + 3.8, 0.4, z1 - 1.9, '#666', { collide: false });
  B.box(x0 + 9, 0, z1 - 4, x0 + 12, 0.2, z1 - 1.5, '#C9945A'); B.box(x0 + 9.1, 0, z1 - 3.9, x0 + 11.9, 0.15, z1 - 1.6, toon('#EED9A2', 'ground'), { collide: false, edges: false });
  for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1.2, z0 + 1.2], [x1 - 1.2, z1 - 1.5], [x0 + 6.5, z0 + 1.1], [x0 + 1.1, z0 + 7]]) roundTree(x, z, 4 + Math.random(), '#3F8A3A');
}
