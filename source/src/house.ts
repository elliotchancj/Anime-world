import * as THREE from 'three';
import { Builder, toon, glassMat, hipRoof, skirtRoof, canvasTex, JP_FONT, JP_SERIF, addOutline, type Surface } from './core';
import type { Physics } from './physics';

// House-local coordinates (metres): x east, z south. House origin sits at lot (3,0,1).
export const HOUSE_OFFSET = new THREE.Vector3(3, 0, 1);
const F1 = 0.45, C1 = 2.85, F2 = 3.2, C2 = 5.6, TOP1 = 3.0, TOP2 = 5.75;
const WALL = '#EEF0E8';
const ALU = '#C3C9CF';

export interface Inspectable { obj: THREE.Object3D; name: string; desc: string; }
export const inspectables: Inspectable[] = [];
function inspect(obj: THREE.Object3D, name: string, desc: string) { obj.userData.inspect = { name, desc }; inspectables.push({ obj, name, desc }); }

type OpKind = 'door' | 'window' | 'glassdoor' | 'shoji' | 'glassblock' | 'blocked';
interface Op { a: number; b: number; y0: number; y1: number; kind: OpKind; panes?: number; }
type Range = [number, number, string];

interface WallOpts { t?: number; core?: string; neg?: Range[]; pos?: Range[]; ly0?: number; ly1?: number; surface?: Surface; }

let B: Builder; let P: Physics; let scene: THREE.Scene;

/** Wall running along `axis` ('x' => wall spans x at z=at; 'z' => spans z at x=at). */
function wall(axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number, ops: Op[], o: WallOpts = {}) {
  const t = o.t ?? 0.12;
  const rects = holes(a0, a1, y0, y1, ops);
  const put = (a: number, b: number, ya: number, yb: number, n0: number, n1: number, color: string, opts: any) => {
    if (axis === 'x') B.box(a, ya, n0, b, yb, n1, color, opts); else B.box(n0, ya, a, n1, yb, b, color, opts);
  };
  for (const r of rects) put(r[0], r[1], r[2], r[3], at - t / 2, at + t / 2, o.core ?? WALL, { surface: o.surface ?? 'wall' });
  // linings
  const ly0 = o.ly0 ?? y0, ly1 = o.ly1 ?? y1;
  const lin = (ranges: Range[] | undefined, sign: number) => {
    if (!ranges) return;
    for (const [ra, rb, col] of ranges) {
      for (const r of holes(ra, rb, ly0, ly1, ops)) {
        const n0 = at + sign * (t / 2), n1 = at + sign * (t / 2 + 0.012);
        put(r[0], r[1], r[2], r[3], Math.min(n0, n1), Math.max(n0, n1), col, { collide: false, surface: 'interior', receive: false, cast: false, edges: true });
      }
    }
  };
  lin(o.neg, -1); lin(o.pos, 1);
  // fill openings
  for (const op of ops) {
    const cA = (op.a + op.b) / 2, cY = (op.y0 + op.y1) / 2, w = op.b - op.a, h = op.y1 - op.y0;
    const wp = (x: number, y: number, n: number) => axis === 'x' ? new THREE.Vector3(x, y, n) : new THREE.Vector3(n, y, x);
    if (op.kind !== 'door') {
      const c = wp(cA, cY, at).add(B.offset);
      if (axis === 'x') P.addBox(c.x, c.y, c.z, w / 2, h / 2, t / 2); else P.addBox(c.x, c.y, c.z, t / 2, h / 2, w / 2);
    }
    if (op.kind === 'window' || op.kind === 'glassdoor' || op.kind === 'shoji') {
      const panes = op.panes ?? (w > 1.2 ? 2 : 1);
      // glass
      if (axis === 'x') B.box(op.a, op.y0, at - 0.01, op.b, op.y1, at + 0.01, glassMat, { collide: false, cast: false, edges: false });
      else B.box(at - 0.01, op.y0, op.a, at + 0.01, op.y1, op.b, glassMat, { collide: false, cast: false, edges: false });
      // frame
      const f = 0.045;
      const fr = (a: number, b: number, ya: number, yb: number) => put(a, b, ya, yb, at - t / 2 - 0.01, at + t / 2 + 0.01, ALU, { collide: false, cast: false });
      fr(op.a, op.b, op.y0, op.y0 + f); fr(op.a, op.b, op.y1 - f, op.y1); fr(op.a, op.a + f, op.y0, op.y1); fr(op.b - f, op.b, op.y0, op.y1);
      for (let i = 1; i < panes; i++) { const x = op.a + (w * i) / panes; fr(x - f / 2, x + f / 2, op.y0, op.y1); }
      if (op.kind === 'shoji') {
        const m = toon('#ffffff', 'interior', { map: shojiTex() });
        const g = new THREE.PlaneGeometry(w, h);
        const side = (o.neg ? -1 : 1);
        const nOff = at + side * (t / 2 + 0.03);
        if (axis === 'x') { if (side < 0) g.rotateY(Math.PI); g.translate(cA, cY, nOff); }
        else { g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(nOff, cY, cA); }
        g.translate(B.offset.x, B.offset.y, B.offset.z);
        B.addGeo(g, m, { cast: false, receive: false, edges: false });
      }
    }
    if (op.kind === 'glassblock') {
      const tex = canvasTex(64, 256, c => { c.fillStyle = '#9fc4dc'; c.fillRect(0, 0, 64, 256); c.fillStyle = '#d9eef8'; for (let y = 0; y < 8; y++) for (let x = 0; x < 2; x++) c.fillRect(x * 32 + 3, y * 32 + 3, 26, 26); });
      const m = toon('#ffffff', 'other', { map: tex });
      if (axis === 'x') B.box(op.a, op.y0, at - t / 2, op.b, op.y1, at + t / 2, m, { collide: false });
      else B.box(at - t / 2, op.y0, op.a, at + t / 2, op.y1, op.b, m, { collide: false });
    }
  }
}

function holes(a0: number, a1: number, y0: number, y1: number, ops: Op[]): number[][] {
  const out: number[][] = [];
  const os = ops.filter(o => o.b > a0 && o.a < a1).sort((p, q) => p.a - q.a);
  let cur = a0;
  for (const o of os) {
    const oa = Math.max(o.a, a0), ob = Math.min(o.b, a1);
    if (oa > cur) out.push([cur, oa, y0, y1]);
    if (o.y0 > y0) out.push([oa, ob, y0, Math.min(o.y0, y1)]);
    if (o.y1 < y1) out.push([oa, ob, Math.max(o.y1, y0), y1]);
    cur = Math.max(cur, ob);
  }
  if (cur < a1) out.push([cur, a1, y0, y1]);
  return out.filter(r => r[1] - r[0] > 1e-3 && r[3] - r[2] > 1e-3);
}

let _shoji: THREE.Texture | null = null;
function shojiTex() {
  if (_shoji) return _shoji;
  _shoji = canvasTex(256, 256, c => { c.fillStyle = '#F7F2E2'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#B8935E'; c.lineWidth = 6; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 256); c.stroke(); } for (let i = 0; i <= 6; i++) { c.beginPath(); c.moveTo(0, i * 256 / 6); c.lineTo(256, i * 256 / 6); c.stroke(); } });
  return _shoji;
}

/** Bar between two points (house-local) as a thin box. */
function bar(p: number[], q: number[], th: number, color: string | THREE.Material, opts: any = {}) {
  const a = new THREE.Vector3(...p).add(B.offset), b = new THREE.Vector3(...q).add(B.offset);
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(th, th, len);
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  B.addGeo(g, color, { edges: false, ...opts });
}

// ----- object helpers (non-merged, inspectable) -----
function obj(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string | THREE.Material, x: number, y: number, z: number, surf: Surface = 'interior'): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, surf) : color);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false;
  parent.add(m);
  return m;
}
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function edgesOf(g: THREE.Object3D) {
  const mat = new THREE.LineBasicMaterial({ color: '#2b2730', transparent: true, opacity: 0.8 });
  const list: THREE.Mesh[] = [];
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && !(o as any).userData.noEdges) list.push(o as THREE.Mesh); });
  for (const m of list) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), mat); m.add(e); }
}
function group(x: number, y: number, z: number, rotY = 0): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, y, z).add(B.offset); g.rotation.y = rotY; scene.add(g); return g;
}

export interface HouseHandles {
  door: { pivot: THREE.Group; collider: any; open: number; target: number; worldPos: THREE.Vector3 };
  tv: THREE.Mesh; tvOn: boolean;
  isInside: (p: THREE.Vector3) => boolean;
  lamps: THREE.Mesh[];
  laundry: THREE.Mesh[];
}

export function buildHouse(b: Builder, physics: Physics, sc: THREE.Scene): HouseHandles {
  B = b; P = physics; scene = sc;
  B.setOffset(HOUSE_OFFSET.x, HOUSE_OFFSET.y, HOUSE_OFFSET.z);

  // ---------- foundations & floors ----------
  const FOUND = '#C9C5BC';
  B.box(0, 0, 0, 10.4, F1 - 0.02, 3.6, FOUND, { surface: 'wall' });
  B.box(2.6, 0, 3.6, 7.2, F1 - 0.02, 7.6, FOUND, { surface: 'wall' });
  B.box(7.2, 0, 2.6, 8.2, F1 - 0.02, 6.4, FOUND);
  B.box(8.2, 0, 6.0, 9.2, F1 - 0.02, 6.4, FOUND);
  B.box(8.2, 0, 2.6, 9.2, F1 - 0.02, 6.0, FOUND);
  B.box(9.2, 0, 3.6 - 1.0, 10.4, F1 - 0.02, 3.6, FOUND);
  B.box(7.2, 0, 6.4, 9.2, 0.13, 7.6, FOUND);
  const fl = (x0: number, z0: number, x1: number, z1: number, col: string, y = F1) => B.box(x0, y - 0.02, z0, x1, y, z1, col, { collide: false, surface: 'interior', receive: false, cast: false });
  fl(2.6, 3.6, 7.2, 7.6, '#88F246');                 // living: green carpet
  fl(3.6, 0, 7.2, 3.6, '#F96159');                   // DK: coral floor
  fl(7.2, 0, 8.4, 2.6, '#D8D2C4');                   // washroom
  fl(8.4, 0, 10.4, 1.6, '#A9CFE0');                  // bath
  fl(8.4, 1.6, 10.4, 2.6, '#E7E2D2');                // WC
  fl(7.2, 2.6, 8.2, 6.4, '#568BC9');                 // hall (blue)
  fl(8.2, 6.0, 9.2, 6.4, '#568BC9');
  fl(7.2, 6.4, 9.2, 7.6, '#E28B4B', 0.15);           // genkan tiles (orange)
  // genkan tile grid
  for (let x = 7.2; x < 9.19; x += 0.4) B.box(x - 0.006, 0.15, 6.4, x + 0.006, 0.152, 7.6, '#B86A35', { collide: false, edges: false, receive: false, cast: false });
  for (let z = 6.4; z < 7.59; z += 0.4) B.box(7.2, 0.15, z - 0.006, 9.2, 0.152, z + 0.006, '#B86A35', { collide: false, edges: false, receive: false, cast: false });
  B.box(7.2, 0.13, 6.38, 9.2, F1 - 0.02, 6.42, '#568BC9', { collide: false, surface: 'interior', receive: false }); // blue step riser
  // tatami (8 mats)
  const tat = (x0: number, z0: number, x1: number, z1: number) => { B.box(x0 + 0.005, F1 - 0.02, z0 + 0.005, x1 - 0.005, F1 + 0.01, z1 - 0.005, '#94CC57', { collide: false, surface: 'interior', receive: false, cast: false }); };
  tat(0, 0, 0.9, 1.8); tat(0.9, 0, 1.8, 1.8); tat(0, 1.8, 0.9, 3.6); tat(0.9, 1.8, 1.8, 3.6);
  tat(1.8, 0, 3.6, 0.9); tat(1.8, 0.9, 3.6, 1.8); tat(1.8, 1.8, 3.6, 2.7); tat(1.8, 2.7, 3.6, 3.6);
  // tatami borders
  B.box(0, F1 - 0.02, 0, 3.6, F1 + 0.005, 3.6, '#2f4a2a', { collide: false, edges: false, receive: false, cast: false });

  // ---------- 1F ceilings ----------
  const ce = (x0: number, z0: number, x1: number, z1: number, col: string) => B.box(x0, C1, z0, x1, C1 + 0.1, z1, toon(col, 'other', { emissive: '#' + new THREE.Color(col).multiplyScalar(0.5).getHexString() }), { surface: 'interior', receive: false, cast: false, camBlock: true, collide: true });
  ce(0, 0, 3.6, 3.6, '#D9C08A');
  ce(3.6, 0, 7.2, 3.6, '#BB8593');
  ce(2.6, 3.6, 7.2, 7.6, '#FBC161');
  ce(7.2, 0, 10.4, 2.6, '#F4F4F0');
  ce(7.2, 2.6, 8.2, 6.0, '#E8F4FB'); ce(7.2, 6.0, 9.2, 7.6, '#E8F4FB');
  ce(9.2, 2.6, 10.4, 3.6, '#F4F4F0');

  // ---------- 1F exterior walls ----------
  const W1 = { ly0: F1, ly1: C1 };
  wall('x', 0, 0, 10.4, 0, TOP1, [
    { a: 1.0, b: 2.6, y0: 1.3, y1: 2.3, kind: 'shoji' },
    { a: 4.4, b: 6.0, y0: 1.5, y1: 2.3, kind: 'window' },
    { a: 7.5, b: 8.1, y0: 1.7, y1: 2.3, kind: 'window' },
    { a: 9.0, b: 9.9, y0: 1.6, y1: 2.3, kind: 'window' }],
    { ...W1, pos: [[0, 3.6, '#B0E5B1'], [3.6, 7.2, '#FBE2C8'], [7.2, 8.4, '#F1F1EA'], [8.4, 10.4, '#CFE6F0']] });
  wall('z', 0, 0, 3.6, 0, TOP1, [{ a: 0.8, b: 2.8, y0: 1.0, y1: 2.4, kind: 'shoji', panes: 2 }], { ...W1, pos: [[0, 3.6, '#B0E5B1']] });
  wall('x', 3.6, 0, 2.6, 0, TOP1, [{ a: 0.4, b: 2.2, y0: 1.0, y1: 2.4, kind: 'shoji', panes: 2 }], { ...W1, neg: [[0, 2.6, '#B0E5B1']] });
  wall('x', 3.6, 9.2, 10.4, 0, TOP1, [], { ...W1, neg: [[9.2, 10.4, '#F1F1EA']] });
  wall('z', 10.4, 0, 3.6, 0, TOP1, [{ a: 0.4, b: 1.2, y0: 1.7, y1: 2.3, kind: 'window', panes: 1 }, { a: 2.0, b: 2.4, y0: 1.8, y1: 2.3, kind: 'window', panes: 1 }], { ...W1, neg: [[0, 1.6, '#CFE6F0'], [1.6, 3.6, '#F1F1EA']] });
  wall('z', 2.6, 3.6, 7.6, 0, TOP1, [{ a: 4.4, b: 6.4, y0: F1, y1: 2.5, kind: 'glassdoor', panes: 2 }], { ...W1, pos: [[3.6, 7.6, '#B8FCD1']] });
  wall('x', 7.6, 2.6, 9.2, 0, TOP1, [
    { a: 2.9, b: 4.1, y0: 1.0, y1: 2.4, kind: 'door' },              // bay window opening (bay box added below)
    { a: 4.5, b: 6.5, y0: F1, y1: 2.5, kind: 'glassdoor', panes: 2 },
    { a: 7.6, b: 8.5, y0: 0.15, y1: 2.3, kind: 'door' },
    { a: 8.6, b: 9.0, y0: 0.6, y1: 2.1, kind: 'glassblock' }],
    { ...W1, neg: [[2.6, 7.2, '#B8FCD1'], [7.2, 9.2, '#C8EAFD']], ly0: 0.15 });
  wall('z', 9.2, 3.6, 7.6, 0, TOP1, [{ a: 4.4, b: 5.0, y0: 1.8, y1: 2.4, kind: 'window', panes: 1 }, { a: 6.7, b: 7.2, y0: 1.2, y1: 2.0, kind: 'window', panes: 1 }], { ...W1, neg: [[3.6, 7.6, '#C8EAFD']], ly0: 0.15, ly1: TOP1 });
  // foundation band (grey) outside around walls
  const band = (x0: number, z0: number, x1: number, z1: number) => B.box(x0, 0, z0, x1, 0.42, z1, '#BDB8AE', { collide: false, cast: false });
  band(-0.07, -0.07, 10.47, 0.0); band(-0.07, 0, 0, 3.67); band(10.4, -0.07, 10.47, 3.67); band(-0.07, 3.6, 2.6, 3.67); band(9.2, 3.6, 10.47, 3.67);
  band(2.53, 3.6, 2.6, 7.67); band(2.53, 7.6, 7.6, 7.67); band(9.2, 3.6, 9.27, 7.67);

  // bay window box
  B.box(2.9, 0.42, 7.6, 4.1, 1.0, 8.05, WALL, { surface: 'wall' });
  B.box(2.9, 2.4, 7.6, 4.1, 2.45, 8.05, WALL, { surface: 'wall', collide: false });
  B.box(2.9, 1.0, 8.03, 4.1, 2.4, 8.05, glassMat, { collide: false, cast: false, edges: false });
  B.box(2.9, 1.0, 7.6, 2.92, 2.4, 8.05, glassMat, { collide: false, cast: false, edges: false });
  B.box(4.08, 1.0, 7.6, 4.1, 2.4, 8.05, glassMat, { collide: false, cast: false, edges: false });
  P.addBox(3.5 + HOUSE_OFFSET.x, 1.7, 8.04 + HOUSE_OFFSET.z, 0.6, 0.7, 0.03);
  for (const x of [2.9, 3.5, 4.06]) B.box(x, 1.0, 8.0, x + 0.04, 2.4, 8.06, ALU, { collide: false, cast: false });
  B.addGeo(hipRoof(2.8 + 3, 7.6 + 1, 4.2 + 3, 8.18 + 1, 2.45, 0.55, 0.05), toon('#E1685E', 'roof'), { camBlock: false });
  // shutter boxes (louvred tobukuro)
  const louvre = (x0: number, x1: number, y0: number, y1: number, zf: number) => {
    B.box(x0, y0, zf - 0.02, x1, y1, zf + 0.14, WALL, { surface: 'wall' });
    for (let y = y0 + 0.08; y < y1 - 0.04; y += 0.09) B.box(x0 + 0.04, y, zf + 0.14, x1 - 0.04, y + 0.012, zf + 0.15, '#B9BDB8', { collide: false, edges: false, cast: false });
  };
  louvre(6.55, 7.25, F1, 2.55, 7.6);
  // engawa benches
  const bench = (x0: number, z0: number, x1: number, z1: number) => {
    B.box(x0, 0.36, z0, x1, 0.42, z1, '#C9945A');
    for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) B.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.36, z + 0.04, '#9C6B3C', { collide: false });
  };
  bench(4.4, 7.68, 6.6, 8.25); bench(2.0, 4.3, 2.52, 6.5);
  // door step + door canopy lamp
  B.box(7.4, 0, 7.66, 8.7, 0.12, 8.25, '#D5D1C7');
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), toon('#FFF3C4', 'other', { emissive: '#000000' }));
  lamp.position.set(7.42, 2.05, 7.72).add(B.offset); scene.add(lamp);
  B.box(7.38, 1.92, 7.6, 7.46, 2.18, 7.67, '#5a4a3a', { collide: false });

  // ---------- front door ----------
  const pivot = new THREE.Group(); pivot.position.set(7.6, 0.15, 7.6).add(B.offset); scene.add(pivot);
  const doorMesh = obj(pivot, bx(0.9, 2.15, 0.05), '#C36C43', 0.45, 1.075, 0, 'other');
  obj(pivot, bx(0.3, 0.04, 0.01), '#4A3020', 0.45, 0.95, 0.03, 'other');             // mail slot
  obj(pivot, bx(0.03, 0.18, 0.04), '#D9B44A', 0.8, 1.0, 0.045, 'other');            // handle
  for (const y of [0.55, 1.6]) obj(pivot, bx(0.6, 0.5, 0.012), '#B05E39', 0.45, y, 0.03, 'other');
  edgesOf(pivot);
  const dc = P.addBox(7.6 + 0.45 + B.offset.x, 0.15 + 1.075, 7.6 + B.offset.z, 0.45, 1.075, 0.04);
  inspect(doorMesh, 'Front door', 'Brown panel door with a mail slot and glass-block sidelight. Opens as you walk up (or press E).');

  // ---------- interior walls 1F ----------
  const IN = { t: 0.1, core: '#F2F0EA', ly0: F1, ly1: C1, surface: 'interior' as Surface };
  wall('z', 3.6, 0, 3.6, F1, C1, [{ a: 2.5, b: 3.3, y0: F1, y1: 2.3, kind: 'door' }], { ...IN, neg: [[0, 3.6, '#B0E5B1']], pos: [[0, 3.6, '#FBE2C8']] });
  wall('x', 3.6, 2.6, 7.2, F1, C1, [{ a: 2.7, b: 3.5, y0: F1, y1: 2.3, kind: 'door' }, { a: 4.0, b: 6.4, y0: F1, y1: 2.3, kind: 'door' }], { ...IN, neg: [[2.6, 3.6, '#B0E5B1'], [3.6, 7.2, '#FBE2C8']], pos: [[2.6, 7.2, '#B8FCD1']] });
  wall('z', 7.2, 0, 2.6, F1, C1, [], { ...IN, neg: [[0, 2.6, '#FBE2C8']], pos: [[0, 2.6, '#F1F1EA']] });
  wall('z', 7.2, 2.6, 3.6, F1, C1, [{ a: 2.72, b: 3.48, y0: F1, y1: 2.3, kind: 'door' }], { ...IN, neg: [[2.6, 3.6, '#FBE2C8']], pos: [[2.6, 3.6, '#C8EAFD']] });
  wall('z', 7.2, 3.6, 6.4, F1, C1, [{ a: 5.0, b: 5.8, y0: F1, y1: 2.3, kind: 'door' }], { ...IN, neg: [[3.6, 6.4, '#B8FCD1']], pos: [[3.6, 6.4, '#C8EAFD']] });
  wall('z', 7.2, 6.4, 7.6, 0.15, C1, [], { ...IN, ly0: 0.15, neg: [[6.4, 7.6, '#B8FCD1']], pos: [[6.4, 7.6, '#C8EAFD']] });
  wall('z', 8.2, 2.6, 6.0, F1, F2, [], { ...IN, ly1: F2, neg: [[2.6, 6.0, '#C8EAFD']], pos: [[2.6, 6.0, '#C8EAFD']] });
  wall('x', 2.6, 7.2, 8.4, F1, C1, [{ a: 7.35, b: 8.05, y0: F1, y1: 2.3, kind: 'door' }], { ...IN, neg: [[7.2, 8.4, '#F1F1EA']], pos: [[7.2, 8.2, '#C8EAFD']] });
  wall('x', 2.6, 8.4, 10.4, F1, C1, [], { ...IN, neg: [[8.4, 10.4, '#F1F1EA']] });
  wall('z', 8.4, 0, 2.6, F1, C1, [{ a: 0.6, b: 1.4, y0: F1, y1: 2.2, kind: 'door' }], { ...IN, neg: [[0, 2.6, '#F1F1EA']], pos: [[0, 1.6, '#CFE6F0'], [1.6, 2.6, '#F1F1EA']] });
  wall('x', 1.6, 8.4, 10.4, F1, C1, [], { ...IN, neg: [[8.4, 10.4, '#CFE6F0']], pos: [[8.4, 10.4, '#F1F1EA']] });
  wall('z', 9.2, 2.6, 3.6, F1, F2, [], { ...IN, ly1: F2, neg: [[2.6, 3.6, '#C8EAFD']] });
  // stairs (13 steps rising north from z=6.0 to z=2.6)
  const steps = 13, run = (6.0 - 2.6) / steps, rise = (F2 - F1) / steps;
  for (let i = 0; i < steps; i++) {
    const z1 = 6.0 - i * run, z0 = z1 - run, y = F1 + (i + 1) * rise;
    B.box(8.22, F1, z0, 9.14, y, z1, '#568BC9', { collide: false, surface: 'interior', receive: false });
  }
  const ang = Math.atan2(F2 - F1, 6.0 - 2.6);
  const len = Math.hypot(F2 - F1, 6.0 - 2.6);
  P.addRampZ(8.7 + B.offset.x, (F1 + F2) / 2 + B.offset.y - 0.03, 4.3 + B.offset.z, 0.46, len / 2, ang);

  // ---------- 2F ----------
  // floor slabs (with stairwell hole x8.2-9.2, z2.6-6.0)
  B.box(3.2, C1 + 0.1, 1.2, 8.2, F2, 6.8, '#E7E1D3', { surface: 'interior', receive: false, cast: false });
  B.box(8.2, C1 + 0.1, 1.2, 9.2, F2, 2.6, '#E7E1D3', { surface: 'interior', receive: false, cast: false });
  B.box(8.2, C1 + 0.1, 6.0, 9.2, F2, 6.8, '#E7E1D3', { surface: 'interior', receive: false, cast: false });
  fl(3.2, 1.2, 7.0, 4.0, '#74C26A', F2 + 0.01);   // Musae's old room - green carpet
  fl(3.2, 4.0, 7.0, 6.8, '#5B86D6', F2 + 0.01);   // Hiroshi's study - blue carpet
  fl(7.0, 1.2, 8.2, 6.8, '#C79A62', F2 + 0.01);
  fl(8.2, 1.2, 9.2, 2.6, '#C79A62', F2 + 0.01);
  // 2F ceiling
  B.box(3.2, C2, 1.2, 9.2, C2 + 0.1, 6.8, toon('#F6F3EA', 'other', { emissive: '#7b7975' }), { surface: 'interior', receive: false, cast: false });
  const W2 = { ly0: F2, ly1: C2 };
  wall('x', 1.2, 3.2, 9.2, C1, TOP2, [{ a: 4.4, b: 5.8, y0: 4.1, y1: 5.0, kind: 'window' }, { a: 8.4, b: 8.9, y0: 4.2, y1: 5.0, kind: 'window', panes: 1 }], { ...W2, pos: [[3.2, 7.0, '#F4ECD2'], [7.0, 9.2, '#F2EEE2']] });
  wall('z', 3.2, 1.2, 6.8, C1, TOP2, [{ a: 1.6, b: 3.4, y0: F2, y1: 5.2, kind: 'door' }, { a: 4.6, b: 6.0, y0: 4.0, y1: 5.0, kind: 'window' }], { ...W2, pos: [[1.2, 4.0, '#F4ECD2'], [4.0, 6.8, '#EEF3F6']] });
  wall('x', 6.8, 3.2, 9.2, C1, TOP2, [{ a: 4.6, b: 6.4, y0: F2, y1: 5.2, kind: 'door' }, { a: 8.45, b: 8.85, y0: 3.6, y1: 5.3, kind: 'window', panes: 1 }], { ...W2, neg: [[3.2, 7.0, '#EEF3F6'], [7.0, 9.2, '#F2EEE2']] });
  wall('z', 9.2, 1.2, 6.8, C1, TOP2, [{ a: 3.6, b: 4.4, y0: 4.2, y1: 5.0, kind: 'window', panes: 1 }], { ...W2, neg: [[1.2, 6.8, '#F2EEE2']] });
  // sliding glass doors to balconies (closed glass panel half, half open)
  B.box(3.17, F2, 1.6, 3.23, 5.2, 2.5, glassMat, { collide: false, cast: false, edges: false });
  B.box(4.6, F2, 6.77, 5.5, 5.2, 6.83, glassMat, { collide: false, cast: false, edges: false });
  for (const a of [1.6, 2.5, 3.36]) B.box(3.14, F2, a, 3.26, 5.2, a + 0.04, ALU, { collide: false, cast: false });
  for (const a of [4.6, 5.5, 6.36]) B.box(a, F2, 6.74, a + 0.04, 5.2, 6.86, ALU, { collide: false, cast: false });
  P.addBox(3.2 + HOUSE_OFFSET.x, 4.2, 2.05 + HOUSE_OFFSET.z, 0.05, 1.0, 0.45);
  P.addBox(5.05 + HOUSE_OFFSET.x, 4.2, 6.8 + HOUSE_OFFSET.z, 0.45, 1.0, 0.05);
  louvre(4.0, 4.55, F2, 5.25, 6.8);
  const IN2 = { t: 0.1, core: '#F2F0EA', ly0: F2, ly1: C2, surface: 'interior' as Surface };
  wall('x', 4.0, 3.2, 7.0, F2, C2, [], { ...IN2, neg: [[3.2, 7.0, '#F4ECD2']], pos: [[3.2, 7.0, '#EEF3F6']] });
  wall('z', 7.0, 1.2, 6.8, F2, C2, [{ a: 2.8, b: 3.6, y0: F2, y1: 5.2, kind: 'door' }, { a: 4.4, b: 5.2, y0: F2, y1: 5.2, kind: 'door' }], { ...IN2, neg: [[1.2, 4.0, '#F4ECD2'], [4.0, 6.8, '#EEF3F6']], pos: [[1.2, 6.8, '#F2EEE2']] });
  // stairwell rails
  B.box(8.17, F2, 2.6, 8.23, F2 + 0.9, 6.0, '#D9C08A');
  B.box(8.2, F2, 5.97, 9.2, F2 + 0.9, 6.03, '#D9C08A');
  // balconies
  const balc = (x0: number, z0: number, x1: number, z1: number, side: 'S' | 'W') => {
    B.box(x0, F2 - 0.15, z0, x1, F2, z1, '#E9E9E2', { surface: 'wall' });
    const pH = F2 + 0.55, rH = F2 + 1.0;
    if (side === 'S') {
      B.box(x0, F2, z1 - 0.1, x1, pH, z1, WALL, { surface: 'wall' });
      B.box(x0, F2, z0, x0 + 0.1, pH, z1, WALL); B.box(x1 - 0.1, F2, z0, x1, pH, z1, WALL);
      B.box(x0, rH - 0.04, z1 - 0.08, x1, rH, z1 - 0.02, ALU, { collide: false });
      for (let x = x0 + 0.05; x <= x1; x += 0.12) B.box(x, pH, z1 - 0.06, x + 0.02, rH, z1 - 0.04, ALU, { collide: false, edges: false });
      P.addBox((x0 + x1) / 2 + B.offset.x, rH + B.offset.y, z1 - 0.05 + B.offset.z, (x1 - x0) / 2, 0.5, 0.05);
    } else {
      B.box(x0, F2, z0, x0 + 0.1, pH, z1, WALL, { surface: 'wall' });
      B.box(x0, F2, z0, 3.2, pH, z0 + 0.1, WALL); B.box(x0, F2, z1 - 0.1, 3.2, pH, z1, WALL);
      B.box(x0 + 0.02, rH - 0.04, z0, x0 + 0.08, rH, z1, ALU, { collide: false });
      for (let z = z0 + 0.05; z <= z1; z += 0.12) B.box(x0 + 0.04, pH, z, x0 + 0.06, rH, z + 0.02, ALU, { collide: false, edges: false });
      P.addBox(x0 + 0.05 + B.offset.x, rH + B.offset.y, (z0 + z1) / 2 + B.offset.z, 0.05, 0.5, (z1 - z0) / 2);
    }
  };
  balc(3.9, 6.86, 7.0, 7.6, 'S');
  balc(2.4, 1.5, 3.14, 3.5, 'W');

  // ---------- roofs ----------
  const ROOF = toon('#E1685E', 'roof');
  B.addGeo(hipRoof(2.85 + 3, 0.85 + 1, 9.55 + 3, 7.15 + 1, TOP2, 0.5), ROOF, { camBlock: true });
  // soffit under main roof
  B.box(2.85, TOP2 - 0.14, 0.85, 9.55, TOP2 - 0.12, 7.15, '#F3EEE4', { collide: false, edges: false, cast: false });
  const skirt = skirtRoof([[-0.45 + 3, -0.45 + 1, 10.85 + 3, 4.0 + 1], [2.15 + 3, 3.0 + 1, 9.65 + 3, 8.05 + 1]],
    [[3.12 + 3, 1.12 + 1, 9.28 + 3, 6.88 + 1]], TOP1 - 0.05, 0.5, 4.15, 3.1, 0.1);
  B.addGeo(skirt, ROOF, { camBlock: true, edges: false });
  // skirt fascia outline (gutter line)
  const fas = (x0: number, z0: number, x1: number, z1: number) => B.box(x0, TOP1 - 0.16, z0, x1, TOP1 - 0.04, z1, '#F2EEE6', { collide: false, cast: false });
  fas(-0.45, -0.45, 10.85, -0.4); fas(-0.45, -0.45, -0.4, 4.0); fas(10.8, -0.45, 10.85, 4.0); fas(-0.45, 3.95, 2.15, 4.0); fas(9.65, 3.95, 10.85, 4.0);
  fas(2.15, 3.95, 2.2, 8.05); fas(2.15, 8.0, 9.65, 8.05); fas(9.6, 3.95, 9.65, 8.05);
  // soffits under skirt
  const sof = (x0: number, z0: number, x1: number, z1: number) => B.box(x0, TOP1 - 0.17, z0, x1, TOP1 - 0.15, z1, '#F3EEE4', { collide: false, edges: false, cast: false });
  sof(-0.45, -0.45, 10.85, -0.06); sof(-0.45, -0.06, -0.06, 4.0); sof(10.46, -0.06, 10.85, 4.0); sof(-0.06, 3.66, 2.54, 4.0); sof(9.26, 3.66, 10.46, 4.0);
  sof(2.15, 3.66, 2.54, 8.05); sof(2.54, 7.66, 9.65, 8.05); sof(9.26, 4.0, 9.65, 7.66);
  // TV aerial on ridge
  const ridgeY = TOP2 + 0.5 * 6.3 / 2;
  bar([6.6, ridgeY - 0.1, 4.0], [6.6, ridgeY + 1.5, 4.0], 0.04, '#8F959C', { cast: true });
  for (const [y, w] of [[1.45, 1.1], [1.2, 0.9], [0.95, 0.7]] as const) {
    bar([6.6 - w / 2, ridgeY + y, 4.0], [6.6 + w / 2, ridgeY + y, 4.0], 0.025, '#8F959C');
    for (let i = 0; i < 6; i++) { const x = 6.6 - w / 2 + (w * i) / 5; bar([x, ridgeY + y, 3.8], [x, ridgeY + y, 4.2], 0.015, '#8F959C'); }
  }
  bar([6.6, ridgeY + 1.3, 4.0], [5.8, ridgeY + 0.4, 4.0], 0.012, '#555', { cast: false });

  // ---------- furniture & props ----------
  const lamps: THREE.Mesh[] = [lamp];
  furnishLiving(lamps);
  const tv = furnishTV();
  furnishKitchen();
  furnishWashitsu();
  furnishGenkan();
  furnishWet();
  furnish2F();

  const isInside = (p: THREE.Vector3) => {
    const x = p.x - HOUSE_OFFSET.x, z = p.z - HOUSE_OFFSET.z;
    const inN = x > 0 && x < 10.4 && z > 0 && z < 3.6, inS = x > 2.6 && x < 9.2 && z > 3.6 && z < 7.6;
    if (p.y > F2 - 0.3) return x > 3.2 && x < 9.2 && z > 1.2 && z < 6.8;
    return inN || inS;
  };
  return { door: { pivot, collider: dc, open: 0, target: 0, worldPos: new THREE.Vector3(8.05, 0, 7.6).add(HOUSE_OFFSET) }, tv, tvOn: true, isInside, lamps, laundry: [] };
}

function furnishLiving(lamps: THREE.Mesh[]) {
  // low table (chabudai-style rectangular zataku)
  const t = group(4.9, F1, 5.5);
  obj(t, bx(1.2, 0.05, 0.8), '#BA7431', 0, 0.33, 0);
  for (const [x, z] of [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]]) obj(t, bx(0.07, 0.31, 0.07), '#8E5524', x, 0.155, z);
  obj(t, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), '#E9E3D3', -0.25, 0.37, 0.05);  // plate
  obj(t, new THREE.CylinderGeometry(0.035, 0.03, 0.08, 12), '#5FA05A', 0.25, 0.395, -0.1); // teacup
  edgesOf(t); inspect(t, 'Living-room low table', 'The wooden low table where the family eats snacks and watches TV, sitting on the green carpet.');
  P.addBox(4.9 + HOUSE_OFFSET.x, F1 + 0.18, 5.5 + HOUSE_OFFSET.z, 0.6, 0.18, 0.4);
  // floor cushions
  for (const [x, z, c] of [[4.9, 4.85, '#E07A5F'], [4.9, 6.15, '#6C8FD6'], [4.0, 5.5, '#E8C547']] as const) { const g = group(x, F1, z); obj(g, bx(0.5, 0.06, 0.5), c, 0, 0.03, 0); }
  // sideboard (east wall)
  const sb = group(6.92, F1, 4.4, -Math.PI / 2);
  obj(sb, bx(1.25, 0.85, 0.42), '#D09B52', 0, 0.425, 0);
  obj(sb, bx(0.56, 0.36, 0.01), glassMat, -0.3, 0.6, 0.215);
  obj(sb, bx(0.56, 0.36, 0.01), glassMat, 0.3, 0.6, 0.215);
  for (const x of [-0.06, 0.06]) obj(sb, new THREE.SphereGeometry(0.025, 10, 8), '#E0362C', x, 0.25, 0.22);
  obj(sb, bx(1.1, 0.02, 0.36), '#B88444', 0, 0.42, 0);
  for (let i = 0; i < 5; i++) obj(sb, bx(0.05, 0.22, 0.17), ['#D74B4B', '#4B7BD7', '#E8C547', '#5AAE61', '#9A5AC9'][i], -0.48 + i * 0.065, 0.55, 0.0);
  // blue vase on top
  const vase = obj(sb, new THREE.CylinderGeometry(0.05, 0.08, 0.22, 16), '#3D6FD1', 0.35, 0.96, 0);
  obj(sb, new THREE.SphereGeometry(0.07, 10, 8), '#F0A0B8', 0.35, 1.12, 0);
  edgesOf(sb); inspect(sb, 'Sideboard', 'Honey-wood sideboard with glass doors, red knobs, books and a blue vase on top.');
  inspect(vase, 'Blue vase', 'A blue vase with a pink flower on the sideboard.');
  P.addBox(6.92 + HOUSE_OFFSET.x, F1 + 0.43, 4.4 + HOUSE_OFFSET.z, 0.21, 0.43, 0.63);
  // two-yellow-fish picture
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(280, 200, c => {
    c.fillStyle = '#8a5a2b'; c.fillRect(0, 0, 280, 200); c.fillStyle = '#BFE6F5'; c.fillRect(14, 14, 252, 172);
    const fish = (x: number, y: number, s: number) => { c.fillStyle = '#F4D22A'; c.beginPath(); c.ellipse(x, y, 40 * s, 20 * s, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(x + 34 * s, y); c.lineTo(x + 62 * s, y - 18 * s); c.lineTo(x + 62 * s, y + 18 * s); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(x - 22 * s, y - 4 * s, 4 * s, 0, 7); c.fill(); };
    fish(110, 80, 1); fish(150, 130, 0.9);
  }) }));
  pic.position.set(7.14, 2.0, 4.4).add(HOUSE_OFFSET); pic.rotation.y = -Math.PI / 2; scene.add(pic);
  inspect(pic, 'Fish picture', 'Framed picture of two yellow fish over the sideboard.');
  // pink-framed clock (north wall, near the accordion door)
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, c => {
    c.fillStyle = '#F08CB0'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); c.fillStyle = '#FFFDF5'; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.fill();
    c.fillStyle = '#333'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.fillRect(64 + Math.sin(a) * 44 - 2, 64 - Math.cos(a) * 44 - 2, 4, 4); }
    c.strokeStyle = '#222'; c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 30); c.moveTo(64, 64); c.lineTo(90, 70); c.stroke();
  }) }));
  clock.position.set(6.85, 2.35, 3.67).add(HOUSE_OFFSET); scene.add(clock);
  inspect(clock, 'Wall clock', 'Round clock with a pink frame.');
  // pull-cord square pendant lamp
  const pl = group(4.9, C1, 5.5);
  obj(pl, new THREE.CylinderGeometry(0.004, 0.004, 0.45, 4), '#444', 0, -0.22, 0);
  const shade = obj(pl, bx(0.55, 0.14, 0.55), toon('#FFF7DC', 'other', { emissive: '#000000' }), 0, -0.5, 0);
  obj(pl, new THREE.CylinderGeometry(0.003, 0.003, 0.35, 4), '#444', 0.1, -0.75, 0.1);
  obj(pl, new THREE.SphereGeometry(0.015, 6, 6), '#E8C547', 0.1, -0.93, 0.1);
  edgesOf(pl); inspect(pl, 'Ceiling lamp', 'Square pendant lamp with a pull cord.');
  lamps.push(shade);
  // green curtains
  const cg = group(0, 0, 0);
  for (const [x, z, ry] of [[4.6, 7.42, 0], [6.4, 7.42, 0], [2.78, 4.5, Math.PI / 2], [2.78, 6.3, Math.PI / 2]] as const) {
    const g = new THREE.Group(); g.position.set(x, 1.5, z); g.rotation.y = ry; cg.add(g);
    for (let i = 0; i < 4; i++) obj(g, bx(0.09, 2.05, 0.05), '#5DB85A', -0.15 + i * 0.1, 0, (i % 2) * 0.03);
  }
  for (const x of [3.0, 4.0]) { const g = new THREE.Group(); g.position.set(x, 1.7, 7.5); cg.add(g); for (let i = 0; i < 2; i++) obj(g, bx(0.09, 1.4, 0.05), '#5DB85A', i * 0.1, 0, (i % 2) * 0.03); }
  // pink accordion partition (bunched at the side of the living/kitchen opening)
  const acc = group(4.0, F1, 3.6);
  for (let i = 0; i < 8; i++) { const m = obj(acc, bx(0.06, 1.82, 0.16), '#E4A3B1', 0.05 + i * 0.055, 0.92, 0); m.rotation.y = i % 2 ? 0.7 : -0.7; }
  obj(acc, bx(2.4, 0.06, 0.08), '#C98796', 1.2, 1.86, 0);
  edgesOf(acc); inspect(acc, 'Pink accordion door', 'The pink folding partition between the living room and the kitchen.');
}

function furnishTV(): THREE.Mesh {
  const g = group(3.15, F1, 7.05, Math.PI * 0.78);
  obj(g, bx(1.0, 0.4, 0.4), '#6B4A33', 0, 0.2, 0);
  obj(g, bx(0.26, 0.04, 0.18), '#222', 0, 0.42, 0);
  obj(g, bx(0.05, 0.08, 0.05), '#222', 0, 0.46, 0);
  obj(g, bx(0.96, 0.56, 0.05), '#1F1F24', 0, 0.78, 0);
  const screenTex = canvasTex(256, 144, c => {
    const gr = c.createLinearGradient(0, 0, 0, 144); gr.addColorStop(0, '#5BC8F5'); gr.addColorStop(1, '#BDF0FF'); c.fillStyle = gr; c.fillRect(0, 0, 256, 144);
    c.fillStyle = '#F4D22A'; c.beginPath(); c.arc(200, 34, 18, 0, 7); c.fill();
    c.fillStyle = '#6BCB5A'; c.fillRect(0, 110, 256, 34);
    c.fillStyle = '#E3342F'; c.beginPath(); c.moveTo(90, 110); c.lineTo(110, 50); c.lineTo(130, 110); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 22px ' + JP_FONT; c.fillText('ヒーロー ショー', 60, 30);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.78, 0.027); g.add(screen);
  edgesOf(g); inspect(g, 'Flat-screen TV', 'Flat TV in the south-west corner of the living room (rebuilt-house era). Click it to turn it on or off.');
  screen.userData.tvScreen = true;
  P.addBox(3.15 + HOUSE_OFFSET.x, F1 + 0.4, 7.05 + HOUSE_OFFSET.z, 0.45, 0.4, 0.3, Math.PI * 0.78);
  return screen;
}

function furnishKitchen() {
  // counter along north wall
  const k = group(5.5, F1, 0.38);
  obj(k, bx(2.8, 0.85, 0.62), '#F4EAD0', 0, 0.425, 0);
  obj(k, bx(2.84, 0.04, 0.66), '#E6E2D8', 0, 0.87, 0);
  obj(k, bx(0.7, 0.03, 0.42), '#9DA6AE', -0.3, 0.885, 0.02);          // sink
  obj(k, new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), '#BFC6CC', -0.3, 1.0, -0.22);
  obj(k, bx(0.6, 0.02, 0.5), '#2A2A2A', 0.95, 0.895, 0);              // hob
  for (const x of [0.8, 1.1]) obj(k, new THREE.TorusGeometry(0.08, 0.012, 6, 16), '#555', x, 0.91, 0).rotation.x = Math.PI / 2;
  obj(k, bx(0.75, 0.35, 0.5), '#E9E4DA', 0.95, 1.95, -0.02);          // hood
  for (let i = 0; i < 4; i++) obj(k, bx(0.62, 0.62, 0.01), '#EADFC2', -1.05 + i * 0.68, 0.42, 0.315);
  edgesOf(k); inspect(k, 'Kitchen counter', 'Cream kitchen counter with sink, gas hob and range hood under the north window.');
  P.addBox(5.5 + HOUSE_OFFSET.x, F1 + 0.45, 0.38 + HOUSE_OFFSET.z, 1.42, 0.45, 0.33);
  // fridge
  const fr = group(3.98, F1, 0.42);
  obj(fr, bx(0.62, 1.8, 0.65), '#EDEDE6', 0, 0.9, 0);
  obj(fr, bx(0.6, 0.01, 0.01), '#999', 0, 1.2, 0.33);
  obj(fr, bx(0.03, 0.3, 0.03), '#B9B9B0', 0.25, 1.45, 0.34);
  edgesOf(fr); inspect(fr, 'Fridge', 'The family fridge, next to the counter.');
  P.addBox(3.98 + HOUSE_OFFSET.x, F1 + 0.9, 0.42 + HOUSE_OFFSET.z, 0.31, 0.9, 0.33);
  // dining table + 4 chairs with red cushions
  const dt = group(5.2, F1, 2.2);
  obj(dt, bx(1.2, 0.04, 0.8), '#C58A4E', 0, 0.72, 0);
  for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) obj(dt, bx(0.05, 0.7, 0.05), '#9A6535', x, 0.35, z);
  for (const [x, z, r] of [[-0.3, -0.6, 0], [0.3, -0.6, 0], [-0.3, 0.6, Math.PI], [0.3, 0.6, Math.PI]] as const) {
    const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = r; dt.add(ch);
    obj(ch, bx(0.4, 0.04, 0.4), '#9A6535', 0, 0.42, 0); obj(ch, bx(0.36, 0.05, 0.36), '#D93A30', 0, 0.465, 0);
    obj(ch, bx(0.4, 0.45, 0.04), '#9A6535', 0, 0.66, -0.18);
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) obj(ch, bx(0.035, 0.42, 0.035), '#9A6535', lx, 0.21, lz);
  }
  edgesOf(dt); inspect(dt, 'Dining table', 'Kitchen table with four chairs and red seat cushions.');
  P.addBox(5.2 + HOUSE_OFFSET.x, F1 + 0.4, 2.2 + HOUSE_OFFSET.z, 0.6, 0.4, 0.4);
  // dark dish cabinet with blue glass (east wall)
  const dc = group(6.93, F1, 1.6, -Math.PI / 2);
  obj(dc, bx(1.3, 1.9, 0.42), '#744D40', 0, 0.95, 0);
  for (const x of [-0.31, 0.31]) obj(dc, bx(0.56, 0.75, 0.01), toon('#6FA6E0', 'interior', { transparent: true, opacity: 0.75 }), x, 1.4, 0.215);
  for (const x of [-0.31, 0.31]) for (const y of [1.2, 1.55]) obj(dc, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), '#F2F0E6', x, y, 0.05);
  edgesOf(dc); inspect(dc, 'Dish cabinet', 'Dark-wood dish cabinet with blue glass doors.');
  P.addBox(6.93 + HOUSE_OFFSET.x, F1 + 0.95, 1.6 + HOUSE_OFFSET.z, 0.21, 0.95, 0.65);
  // striped kitchen mat
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.45), new THREE.MeshBasicMaterial({ map: canvasTex(128, 64, c => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#F6F0D8' : '#6FA0D8'; c.fillRect(i * 16, 0, 16, 64); } }) }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(5.2, F1 + 0.005, 0.95).add(HOUSE_OFFSET); scene.add(mat);
}

function furnishWashitsu() {
  // tokonoma alcove + scroll
  B.box(0.06, F1, 0.06, 1.2, F1 + 0.1, 0.55, '#8C6A44', { surface: 'interior', receive: false });
  const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(128, 384, c => {
    c.fillStyle = '#3A6A8A'; c.fillRect(0, 0, 128, 384); c.fillStyle = '#F7F1DC'; c.fillRect(12, 30, 104, 320);
    c.fillStyle = '#111'; c.font = 'bold 58px ' + JP_SERIF; c.textAlign = 'center';
    ['色', '即', '是', '空'].forEach((ch, i) => c.fillText(ch, 64, 100 + i * 70));
    c.fillStyle = '#6b4a2a'; c.fillRect(0, 0, 128, 10); c.fillRect(0, 374, 128, 10);
  }) }));
  scroll.position.set(0.63, 1.75, 0.075).add(HOUSE_OFFSET); scene.add(scroll);
  inspect(scroll, 'Hanging scroll', 'Calligraphy scroll in the washitsu alcove: 色即是空 ("form is emptiness").');
  // tansu stack + yellow chest
  const ts = group(3.22, F1, 0.85, -Math.PI / 2);
  obj(ts, bx(1.2, 0.9, 0.55), '#4E3426', 0, 0.45, 0);
  obj(ts, bx(1.2, 0.85, 0.55), '#5A3B2B', 0, 1.33, 0);
  for (let i = 0; i < 4; i++) for (const x of [-0.3, 0.3]) obj(ts, bx(0.08, 0.03, 0.02), '#C8A050', x, 0.25 + i * 0.4, 0.28);
  edgesOf(ts); inspect(ts, 'Tansu chests', 'Stacked dark-wood tansu drawers in the tatami room.');
  P.addBox(3.22 + HOUSE_OFFSET.x, F1 + 0.88, 0.85 + HOUSE_OFFSET.z, 0.28, 0.88, 0.6);
  const yc = group(3.25, F1, 1.95, -Math.PI / 2);
  obj(yc, bx(0.7, 0.8, 0.5), '#E8C24A', 0, 0.4, 0);
  for (let i = 0; i < 3; i++) obj(yc, bx(0.6, 0.015, 0.02), '#B8902A', 0, 0.2 + i * 0.25, 0.26);
  edgesOf(yc); inspect(yc, 'Yellow chest', 'Yellow chest of drawers next to the tansu.');
  P.addBox(3.25 + HOUSE_OFFSET.x, F1 + 0.4, 1.95 + HOUSE_OFFSET.z, 0.26, 0.4, 0.35);
  // zabuton & low table
  const lt = group(1.6, F1, 2.0); obj(lt, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24), '#7A4B2A', 0, 0.3, 0); obj(lt, new THREE.CylinderGeometry(0.05, 0.08, 0.3, 8), '#5A3520', 0, 0.15, 0);
  edgesOf(lt); inspect(lt, 'Chabudai', 'Round low table in the tatami room.');
}

function furnishGenkan() {
  const sc = group(8.95, 0.15, 6.85, -Math.PI / 2);
  obj(sc, bx(0.75, 0.9, 0.38), '#D9C08A', 0, 0.45, 0);
  for (let i = 0; i < 9; i++) obj(sc, bx(0.68, 0.012, 0.01), '#B89A60', 0, 0.12 + i * 0.085, 0.195);
  obj(sc, bx(0.22, 0.08, 0.16), '#F2F0E6', -0.15, 0.94, 0);           // phone
  obj(sc, bx(0.08, 0.03, 0.03), '#F2F0E6', -0.15, 1.0, 0);
  obj(sc, new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), '#C66B3D', 0.2, 0.95, 0);
  obj(sc, new THREE.SphereGeometry(0.09, 10, 8), '#4FA84A', 0.2, 1.08, 0);
  edgesOf(sc); inspect(sc, 'Shoe cabinet', 'Louvred shoe cabinet in the genkan with the house phone and a potted plant.');
  P.addBox(8.95 + HOUSE_OFFSET.x, 0.6, 6.85 + HOUSE_OFFSET.z, 0.19, 0.45, 0.38);
  const um = group(7.4, 0.15, 7.35); obj(um, new THREE.CylinderGeometry(0.09, 0.08, 0.45, 12), '#4C7CC4', 0, 0.22, 0);
  obj(um, new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), '#E3342F', 0.03, 0.55, 0); obj(um, new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), '#F4D22A', -0.03, 0.55, 0.02);
  edgesOf(um); inspect(um, 'Umbrella stand', 'Umbrella stand by the front door.');
}

function furnishWet() {
  const tub = group(9.4, F1, 0.75); obj(tub, bx(1.4, 0.6, 0.75), '#7FB8DA', 0, 0.3, 0); obj(tub, bx(1.25, 0.02, 0.6), '#B7E1F4', 0, 0.55, 0); edgesOf(tub);
  P.addBox(9.4 + HOUSE_OFFSET.x, F1 + 0.3, 0.75 + HOUSE_OFFSET.z, 0.7, 0.3, 0.38);
  const wb = group(7.8, F1, 0.35); obj(wb, bx(0.75, 0.8, 0.5), '#F4F4F0', 0, 0.4, 0); obj(wb, bx(0.6, 0.5, 0.02), toon('#CFE3F0', 'interior'), 0, 1.35, -0.2); edgesOf(wb);
  const wm = group(7.8, F1, 1.9); obj(wm, bx(0.6, 0.85, 0.6), '#F4F4F0', 0, 0.42, 0); obj(wm, new THREE.CylinderGeometry(0.18, 0.18, 0.01, 20), '#8FA6B8', 0, 0.86, 0); edgesOf(wm);
  inspect(wm, 'Washing machine', 'Washing machine in the wash room.');
  const wc = group(9.7, F1, 2.1); obj(wc, bx(0.38, 0.4, 0.55), '#FAFAF8', 0, 0.2, 0); obj(wc, bx(0.36, 0.35, 0.18), '#FAFAF8', 0, 0.55, -0.22); edgesOf(wc);
}

function furnish2F() {
  // Hiroshi's study: wall unit + desk + golf bag
  const wu = group(4.5, F2, 4.28);
  obj(wu, bx(2.0, 1.9, 0.4), '#8B5E3C', 0, 0.95, 0);
  for (let s = 0; s < 4; s++) for (let i = 0; i < 12; i++) obj(wu, bx(0.06, 0.26, 0.24), ['#D74B4B', '#4B7BD7', '#E8C547', '#5AAE61', '#EEE'][(i + s) % 5], -0.85 + i * 0.15, 0.3 + s * 0.45, 0.06);
  edgesOf(wu); inspect(wu, "Hiroshi's wall unit", 'Bookcase wall unit in the upstairs study.');
  P.addBox(4.5 + HOUSE_OFFSET.x, F2 + 0.95, 4.28 + HOUSE_OFFSET.z, 1.0, 0.95, 0.2);
  const dk = group(6.6, F2, 5.8, -Math.PI / 2);
  obj(dk, bx(1.1, 0.04, 0.6), '#9A6535', 0, 0.72, 0);
  obj(dk, bx(0.4, 0.7, 0.58), '#8B5E3C', 0.33, 0.35, 0);
  obj(dk, bx(0.4, 0.28, 0.25), '#2A2A30', -0.15, 0.88, -0.1);
  obj(dk, bx(0.45, 0.45, 0.45), '#3A3A40', -0.15, 0.23, 0.45);
  edgesOf(dk); inspect(dk, "Hiroshi's desk", 'Desk in the upstairs study with a computer monitor.');
  P.addBox(6.6 + HOUSE_OFFSET.x, F2 + 0.4, 5.8 + HOUSE_OFFSET.z, 0.32, 0.4, 0.56);
  const gb = group(3.5, F2, 6.4); obj(gb, new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), '#2E4A8A', 0, 0.45, 0); for (let i = 0; i < 3; i++) obj(gb, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), '#CCC', -0.05 + i * 0.05, 1.0, 0); edgesOf(gb);
  inspect(gb, 'Golf bag', "Hiroshi's golf bag in the corner.");
  // Musae's former room: mostly empty, folded futon
  const fu = group(4.0, F2, 1.8); obj(fu, bx(1.0, 0.3, 0.7), '#F2C6D6', 0, 0.15, 0); obj(fu, bx(1.0, 0.12, 0.7), '#F7F1E2', 0, 0.36, 0); edgesOf(fu);
  inspect(fu, 'Folded futon', "Musae's old room upstairs - mostly empty now.");
}

/** Lot (garden, walls, gate, carport, doghouse...) - lot coords (origin = NW corner of the lot). */
export function buildLot(b: Builder, physics: Physics, sc: THREE.Scene): { laundry: THREE.Mesh[]; dogHome: THREE.Vector3; gateLamp: THREE.Mesh } {
  B = b; P = physics; scene = sc;
  B.setOffset(0, 0, 0);
  // lawn (polygon with chamfer)
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(15.6, 0), new THREE.Vector2(15.6, -10.4), new THREE.Vector2(3, -10.4), new THREE.Vector2(0, -7.4)]);
  const lg = new THREE.ShapeGeometry(sh); lg.rotateX(-Math.PI / 2); lg.translate(0, 0.012, 0);
  B.addGeo(lg, toon('#83D661', 'lawn'), { edges: false, cast: false });
  // paths & carport slab
  B.box(10.3, 0, 8.6, 11.9, 0.03, 10.4, '#D8D4C8', { collide: false, surface: 'ground', cast: false });
  B.box(12.3, 0, 4.6, 15.6, 0.03, 10.4, '#CFCAC0', { collide: false, surface: 'ground', cast: false });
  for (const [x, z] of [[9.6, 8.9], [9.0, 9.4]]) B.box(x - 0.25, 0, z - 0.2, x + 0.25, 0.04, z + 0.2, '#D8D4C8', { collide: false, surface: 'ground', cast: false });
  // gravel strip around house north/east
  B.box(3, 0, 0.2, 13.6, 0.02, 1.0, '#C8C2B4', { collide: false, surface: 'ground', cast: false, edges: false });

  // --- front wall (yellow blocks + hedge planters) ---
  const YEL = '#EDE27F', HEDGE = '#305D2C';
  const front = (x0: number, x1: number) => {
    B.box(x0, 0, 10.05, x1, 0.55, 10.4, YEL, { surface: 'wall' });
    for (let x = x0; x < x1 - 0.2; x += 1.6) {
      const px1 = Math.min(x + 0.45, x1);
      B.box(x, 0.55, 10.0, px1, 1.15, 10.4, YEL, { surface: 'wall' });
      B.box(x - 0.02, 1.15, 9.98, px1 + 0.02, 1.2, 10.42, '#D9CC66', { collide: false });
      const hx0 = px1 + 0.05, hx1 = Math.min(x + 1.6, x1) - 0.05;
      if (hx0 < hx1) {
        B.box(hx0, 0.55, 9.55, hx1, 1.18, 10.25, HEDGE, { surface: 'hedge', edges: false });
        for (let k = 0, nb = Math.max(2, Math.round((hx1 - hx0) / 0.35)); k < nb; k++) { const g = new THREE.IcosahedronGeometry(0.27, 1); g.scale(1, 0.75, 1.25); g.translate(hx0 + 0.2 + (k * (hx1 - hx0 - 0.4)) / (nb - 1), 1.14 + (k % 2) * 0.04, 9.9); B.addGeo(g, toon(HEDGE, 'hedge'), { edges: false }); }
        B.box(hx0, 0.55, 9.53, hx1, 0.6, 10.27, '#D9CC66', { collide: false, edges: true });
      }
    }
  };
  front(3.0, 10.0);
  // chamfer segment (rotated)
  const cl = Math.hypot(3, 3), cx = 1.5, cz = 8.9, rot = -Math.PI / 4;
  B.boxC(cx + 0.12, 0.275, cz - 0.12, cl, 0.55, 0.35, YEL, { rotY: rot, surface: 'wall' });
  for (let i = 0; i < 2; i++) { const t = -0.4 + i * 1.3; B.boxC(cx + 0.12 + t * 0.7071, 0.85, cz - 0.12 + t * 0.7071, 0.45, 0.6, 0.4, YEL, { rotY: rot, surface: 'wall' }); }
  B.boxC(cx + 0.45 + 0.6, 0.9, cz - 0.45 + 0.6, 1.4, 0.7, 0.6, HEDGE, { rotY: rot, surface: 'hedge' });
  // west wall (pale grey-green) & north/east boundaries
  B.box(0, 0, 0, 0.15, 1.5, 7.4, '#B7C2A8', { surface: 'wall' });
  B.box(0, 0, -0.08, 15.6, 1.5, 0.07, '#BDBDB6', { surface: 'wall' });
  B.box(15.45, 0, 0, 15.6, 1.5, 4.6, '#BDBDB6', { surface: 'wall' });
  B.box(15.45, 0, 4.6, 15.6, 0.6, 10.4, '#BDBDB6', { surface: 'wall' });
  // brick gate pillars
  const BRICK = '#C54938';
  const pillar = (x0: number, x1: number) => {
    B.box(x0, 0, 10.0, x1, 1.35, 10.45, BRICK, { surface: 'wall' });
    B.box(x0 - 0.03, 1.35, 9.97, x1 + 0.03, 1.42, 10.48, '#A63A2C');
    for (let y = 0.15; y < 1.35; y += 0.15) B.box(x0 - 0.002, y, 10.451, x1 + 0.002, y + 0.012, 10.456, '#9A3428', { collide: false, edges: false, cast: false });
  };
  pillar(10.0, 10.4); pillar(11.8, 12.2);
  // mailbox on left pillar
  const mb = new THREE.Group(); mb.position.set(10.2, 1.42, 10.25); scene.add(mb);
  obj(mb, bx(0.34, 0.3, 0.26), '#DE332B', 0, 0.15, 0, 'other');
  const dome = obj(mb, new THREE.CylinderGeometry(0.13, 0.13, 0.34, 16, 1, false, 0, Math.PI), '#DE332B', 0, 0.3, 0, 'other'); dome.rotation.z = Math.PI / 2;
  obj(mb, bx(0.2, 0.025, 0.01), '#5A1A14', 0, 0.2, 0.135, 'other');
  const yu = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(64, 64, c => { c.fillStyle = '#fff'; c.font = 'bold 54px ' + JP_FONT; c.textAlign = 'center'; c.fillText('〒', 32, 52); }) }));
  yu.position.set(0, 0.1, 0.132); mb.add(yu);
  edgesOf(mb); inspect(mb, 'Mailbox', 'Red mailbox with the 〒 mark on top of the brick gate pillar.');
  // nameplate & intercom on left pillar face
  const np = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.12), new THREE.MeshBasicMaterial({ map: canvasTex(140, 60, c => { c.fillStyle = '#F4EEDC'; c.fillRect(0, 0, 140, 60); c.strokeStyle = '#6b4a2a'; c.lineWidth = 6; c.strokeRect(0, 0, 140, 60); c.fillStyle = '#222'; c.font = 'bold 40px ' + JP_SERIF; c.textAlign = 'center'; c.fillText('野原', 70, 45); }) }));
  np.position.set(10.2, 1.05, 10.457); scene.add(np);
  inspect(np, 'Nameplate', 'Family nameplate on the gate pillar.');
  const ic = new THREE.Group(); ic.position.set(10.2, 0.78, 10.46); scene.add(ic);
  obj(ic, bx(0.12, 0.18, 0.03), '#E8E8E0', 0, 0, 0, 'other'); obj(ic, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), '#555', 0, -0.04, 0.02, 'other').rotation.x = Math.PI / 2;
  edgesOf(ic); inspect(ic, 'Intercom', 'Intercom doorbell on the gate pillar. Ding-dong!');
  // slatted double gate (open, swung inward)
  const gate = (hx: number, sgn: number) => {
    const g = new THREE.Group(); g.position.set(hx, 0, 10.2); g.rotation.y = sgn * Math.PI * 0.45; scene.add(g);
    for (let i = 0; i < 6; i++) obj(g, bx(0.07, 0.9, 0.03), '#EFE6CC', sgn * (-0.06 - i * 0.12), 0.55, 0, 'other');
    for (const y of [0.25, 0.9]) obj(g, bx(0.72, 0.06, 0.04), '#E0D4B0', sgn * -0.36, y, 0, 'other');
    edgesOf(g);
  };
  gate(10.42, -1); gate(11.78, 1);
  // gate lamp on right pillar
  const gateLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), toon('#FFF3C4', 'other', { emissive: '#000000' }));
  gateLamp.position.set(12.0, 1.55, 10.22); scene.add(gateLamp);

  // --- carport ---
  const WH = '#F4F4F0';
  for (const z of [4.8, 9.9]) { B.box(15.15, 0, z - 0.06, 15.27, 2.35, z + 0.06, WH); }
  // curved roof frame: arcs over the car (east posts -> curving down toward the west edge)
  const arc = (z: number) => { let prev: number[] | null = null; for (let i = 0; i <= 10; i++) { const t = i / 10; const x = 15.21 - t * 3.0; const y = 2.35 + Math.sin(t * Math.PI * 0.85) * 0.18 - t * t * 0.05; const p = [x, y, z]; if (prev) bar(prev, p, 0.07, WH); prev = p; } };
  for (const z of [4.7, 6.4, 8.1, 10.0]) arc(z);
  bar([15.21, 2.35, 4.7], [15.21, 2.35, 10.0], 0.09, WH);
  bar([12.21, 2.3, 4.7], [12.21, 2.3, 10.0], 0.07, WH);
  const roofG = new THREE.BufferGeometry();
  { const pos: number[] = []; for (let i = 0; i < 10; i++) { const f = (t: number) => [15.21 - t * 3.0, 2.39 + Math.sin(t * Math.PI * 0.85) * 0.18 - t * t * 0.05]; const [xa, ya] = f(i / 10), [xb, yb] = f((i + 1) / 10); pos.push(xa, ya, 4.7, xb, yb, 4.7, xb, yb, 10.0, xa, ya, 4.7, xb, yb, 10.0, xa, ya, 10.0); } roofG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); roofG.computeVertexNormals(); }
  const roofMat = toon('#6776A2', 'other', { transparent: true, opacity: 0.62, side: THREE.DoubleSide });
  const roofMesh = new THREE.Mesh(roofG, roofMat); roofMesh.castShadow = true; scene.add(roofMesh);
  // golden lattice gate (closed accordion) at street edge
  const lat = new THREE.Group(); lat.position.set(12.3, 0, 10.32); scene.add(lat);
  const GOLD = toon('#D29B13', 'other');
  const n = 14, w = 3.15, hgt = 1.2;
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * w, x1 = ((i + 1) / n) * w;
    for (const [ya, yb] of [[0.1, hgt], [hgt, 0.1]]) {
      const len = Math.hypot(x1 - x0, yb - ya);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 0.02), GOLD);
      m.position.set((x0 + x1) / 2, (ya + yb) / 2, 0); m.rotation.z = Math.atan2(yb - ya, x1 - x0); lat.add(m);
    }
  }
  for (const y of [0.08, hgt + 0.02]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.04), GOLD); m.position.set(w / 2, y, 0); lat.add(m); }
  for (let i = 0; i <= n; i += 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, hgt, 0.03), GOLD); m.position.set((i / n) * w, hgt / 2 + 0.05, 0); lat.add(m); }
  lat.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  P.addBox(12.3 + w / 2, 0.65, 10.32, w / 2, 0.65, 0.05);
  inspect(lat, 'Carport lattice gate', 'Golden expanding lattice gate across the carport.');
  // car (green hatchback)
  buildCar(13.75, 7.3);
  // cypresses
  for (const [x, z, h] of [[14.6, 1.2, 4.2], [14.9, 2.4, 4.8], [14.6, 3.6, 4.0]]) cypress(x, z, h);

  // --- doghouse ---
  const dh = new THREE.Group(); dh.position.set(5.05, 0, 5.0); dh.rotation.y = -Math.PI / 2; scene.add(dh);
  const BOARD = '#BCCADB';
  obj(dh, bx(0.62, 0.5, 0.75), BOARD, 0, 0.27, 0, 'other');
  obj(dh, bx(0.66, 0.04, 0.79), '#9AAABF', 0, 0.02, 0, 'other');
  for (let i = 0; i < 4; i++) obj(dh, bx(0.63, 0.008, 0.76), '#A3B3C7', 0, 0.12 + i * 0.11, 0, 'other');
  const door = obj(dh, new THREE.CircleGeometry(0.16, 20, 0, Math.PI), '#1E2433', 0, 0.2, 0.378, 'other');
  obj(dh, bx(0.32, 0.18, 0.01), '#1E2433', 0, 0.12, 0.378, 'other');
  door.userData.noEdges = true;
  const ROOFB = toon('#385ACD', 'roof');
  for (const s of [-1, 1]) { const r = obj(dh, bx(0.48, 0.04, 0.9), ROOFB, s * 0.2, 0.62, 0); r.rotation.z = s * -0.62; }
  const gable = new THREE.Shape([new THREE.Vector2(-0.31, 0), new THREE.Vector2(0.31, 0), new THREE.Vector2(0, 0.24)]);
  for (const z of [-0.376, 0.376]) obj(dh, new THREE.ShapeGeometry(gable), BOARD, 0, 0.52, z, 'other').material = toon(BOARD, 'other', { side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.09), new THREE.MeshBasicMaterial({ map: canvasTex(110, 45, c => { c.fillStyle = '#F7F1DC'; c.fillRect(0, 0, 110, 45); c.strokeStyle = '#6b4a2a'; c.lineWidth = 4; c.strokeRect(0, 0, 110, 45); c.fillStyle = '#222'; c.font = 'bold 32px ' + JP_FONT; c.textAlign = 'center'; c.fillText('シロ', 55, 34); }) }));
  plate.position.set(0, 0.6, 0.382); dh.add(plate);
  edgesOf(dh); inspect(dh, "Shiro's doghouse", 'Blue-roofed doghouse with the シロ nameplate, against the living-room west wall.');
  P.addBox(5.05, 0.35, 5.0, 0.38, 0.35, 0.32);
  const bowl = new THREE.Group(); bowl.position.set(4.35, 0, 5.4); scene.add(bowl);
  obj(bowl, new THREE.CylinderGeometry(0.1, 0.08, 0.06, 16), '#2E6FD8', 0, 0.03, 0, 'other');
  obj(bowl, new THREE.CylinderGeometry(0.085, 0.085, 0.01, 16), '#C98A4A', 0, 0.06, 0, 'other');
  edgesOf(bowl); inspect(bowl, "Shiro's bowl", 'Blue food bowl.');
  // AC outdoor unit
  const ac = new THREE.Group(); ac.position.set(4.2, 0, 4.8); scene.add(ac);
  obj(ac, bx(0.75, 0.55, 0.28), '#E9E9E2', 0, 0.3, 0, 'other');
  const fan = obj(ac, new THREE.CircleGeometry(0.17, 20), '#555A60', -0.12, 0.3, 0.141, 'other'); fan.userData.noEdges = true;
  edgesOf(ac); inspect(ac, 'Air-conditioner unit', 'Outdoor AC unit next to the doghouse.');
  P.addBox(4.2, 0.3, 4.8, 0.38, 0.3, 0.14);

  // --- laundry poles ---
  const laundry: THREE.Mesh[] = [];
  for (const z of [5.0, 7.2]) { B.box(1.55, 0, z - 0.04, 1.63, 1.85, z + 0.04, '#5A9A5A', { collide: true }); B.box(1.35, 0, z - 0.25, 1.83, 0.06, z + 0.25, '#5A9A5A', { collide: false }); B.box(1.4, 1.75, z - 0.03, 1.78, 1.8, z + 0.03, '#5A9A5A', { collide: false }); }
  for (const x of [1.45, 1.73]) bar([x, 1.77, 4.8], [x, 1.77, 7.4], 0.035, '#DDE3E8');
  const cloth = (z: number, col: string, w: number, h: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 4, 4), toon(col, 'other', { side: THREE.DoubleSide })); m.geometry.translate(0, -h / 2, 0); m.position.set(1.45, 1.77, z); m.rotation.y = Math.PI / 2; m.castShadow = true; scene.add(m); laundry.push(m); };
  cloth(5.4, '#E3002C', 0.45, 0.4); cloth(5.95, '#FFF8A2', 0.35, 0.25); cloth(6.5, '#FFFFFF', 0.6, 0.45); cloth(7.0, '#F08CB0', 0.4, 0.5);
  // --- tulip bed (brick-edged) ---
  for (const [x0, z0, x1, z1] of [[3.4, 9.15, 7.2, 9.5]]) {
    B.box(x0, 0, z0, x1, 0.15, z0 + 0.06, '#B5503C', { collide: false }); B.box(x0, 0, z1 - 0.06, x1, 0.15, z1, '#B5503C', { collide: false });
    B.box(x0, 0, z0, x1, 0.1, z1, '#7A5638', { collide: false, edges: false });
    const cols = ['#E3342F', '#F4D22A', '#F08CB0', '#FFFFFF'];
    for (let x = x0 + 0.15, i = 0; x < x1 - 0.1; x += 0.22, i++) { bar([x, 0.1, (z0 + z1) / 2], [x, 0.32, (z0 + z1) / 2], 0.015, '#3E8E3A', { cast: false }); B.boxC(x, 0.36, (z0 + z1) / 2, 0.07, 0.09, 0.07, cols[i % 4], { collide: false, cast: false }); }
  }
  // --- sandbox (SW) ---
  B.box(1.9, 0, 7.9, 3.1, 0.2, 7.98, '#C9945A'); B.box(1.9, 0, 8.82, 3.1, 0.2, 8.9, '#C9945A');
  B.box(1.9, 0, 7.9, 1.98, 0.2, 8.9, '#C9945A'); B.box(3.02, 0, 7.9, 3.1, 0.2, 8.9, '#C9945A');
  B.box(1.98, 0, 7.98, 3.02, 0.12, 8.82, '#EED9A2', { collide: false, surface: 'ground', edges: false });
  const pail = new THREE.Group(); pail.position.set(2.4, 0.12, 8.3); scene.add(pail); obj(pail, new THREE.CylinderGeometry(0.08, 0.06, 0.12, 14), '#2F8FE0', 0, 0.06, 0, 'other'); edgesOf(pail);
  inspect(pail, 'Sandbox', 'Little sandbox in the south-west corner of the garden.');
  // garden trees
  roundTree(1.2, 1.3, 2.6, '#3F8A3A'); roundTree(1.0, 3.2, 2.0, '#4A9A44'); roundTree(9.9, 9.55, 1.0, '#3E7F38');
  // utility meter box etc on east
  return { laundry, dogHome: new THREE.Vector3(4.55, 0, 5.0), gateLamp };
}

function buildCar(x: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const GREEN = '#7CC49C';
  obj(g, bx(1.6, 0.6, 3.5), GREEN, 0, 0.55, 0, 'other');
  obj(g, bx(1.45, 0.55, 2.0), GREEN, 0, 1.12, -0.35, 'other');
  const glass = toon('#36507A', 'other');
  obj(g, bx(1.36, 0.42, 0.02), glass, 0, 1.12, 0.66, 'other').rotation.x = -0.35;
  obj(g, bx(1.47, 0.4, 1.6), glass, 0, 1.13, -0.35, 'other');
  obj(g, bx(1.3, 0.38, 0.02), glass, 0, 1.12, -1.36, 'other');
  obj(g, bx(1.62, 0.12, 3.52), '#5A9C79', 0, 0.3, 0, 'other');
  for (const sx of [-0.55, 0.55]) obj(g, bx(0.3, 0.12, 0.02), '#FFF6C8', sx, 0.66, 1.76, 'other');
  for (const sx of [-0.6, 0.6]) obj(g, bx(0.18, 0.12, 0.02), '#E3342F', sx, 0.7, -1.76, 'other');
  obj(g, bx(0.42, 0.1, 0.01), '#F4F4F0', 0, 0.42, 1.76, 'other');
  for (const [wx, wz] of [[-0.72, 1.1], [0.72, 1.1], [-0.72, -1.1], [0.72, -1.1]]) { const w = obj(g, new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18), '#222', wx, 0.3, wz, 'other'); w.rotation.z = Math.PI / 2; obj(w, new THREE.CylinderGeometry(0.15, 0.15, 0.23, 12), '#BFC6CC', 0, 0, 0, 'other'); }
  edgesOf(g); inspect(g, 'Family car', 'Light-green hatchback in the carport (the rebuilt-house era car).');
  P.addBox(x, 0.75, z, 0.8, 0.75, 1.75);
}

export function cypress(x: number, z: number, h: number) {
  const g = new THREE.ConeGeometry(0.55, h - 0.4, 12); g.translate(x, 0.4 + (h - 0.4) / 2, z);
  B.addGeo(g, toon('#2F6B3A', 'hedge'), { edges: false });
  B.box(x - 0.08, 0, z - 0.08, x + 0.08, 0.5, z + 0.08, '#6B4A33', { edges: false });
}
export function roundTree(x: number, z: number, h: number, col: string) {
  B.box(x - 0.08, 0, z - 0.08, x + 0.08, h * 0.5, z + 0.08, '#6B4A33', { edges: false });
  for (const [dx, dy, dz, r] of [[0, 0.75, 0, 0.5], [0.3, 0.6, 0.15, 0.35], [-0.25, 0.62, -0.2, 0.38], [0.05, 0.95, -0.1, 0.32]]) {
    const g = new THREE.IcosahedronGeometry(r * h * 0.55, 1); g.translate(x + dx * h * 0.5, h * dy, z + dz * h * 0.5);
    B.addGeo(g, toon(col, 'hedge'), { edges: false, collide: false });
  }
}
export { addOutline };
