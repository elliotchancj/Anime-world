import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import type { Physics } from './physics';

// BVH-accelerated raycasting for camera collision and picking
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type Surface = 'roof' | 'ground' | 'lawn' | 'road' | 'wall' | 'interior' | 'other' | 'hedge';

// ---------- Toon materials ----------
let gradientMap: THREE.DataTexture | null = null;
export function getGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([60, 60, 255, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientMap = tex;
  return tex;
}

export interface MatEntry { mat: THREE.MeshToonMaterial; base: THREE.Color; surface: Surface; }
export const matRegistry: MatEntry[] = [];
const matCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: string | number, surface: Surface = 'other', opts: { emissive?: string; transparent?: boolean; opacity?: number; side?: THREE.Side; map?: THREE.Texture } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${surface}|${opts.emissive ?? ''}|${opts.transparent ?? ''}|${opts.opacity ?? ''}|${opts.side ?? ''}|${opts.map ? opts.map.uuid : ''}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: getGradient(), map: opts.map ?? null });
  if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
  if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 0.5; m.depthWrite = false; }
  if (opts.side !== undefined) m.side = opts.side;
  matCache.set(key, m);
  matRegistry.push({ mat: m, base: m.color.clone(), surface });
  return m;
}

// Glass (windows) - shared, emissive at night
export const glassMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#B7CDEB'), gradientMap: getGradient(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
glassMat.emissive = new THREE.Color('#000000');
export const windowGlowColor = new THREE.Color('#ffd27a');

// ---------- Static batching builder ----------
interface Bucket { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean; collidable: boolean; }

export interface BoxOpts {
  collide?: boolean;      // add physics collider (default true)
  edges?: boolean;        // add line edges (default true)
  cast?: boolean;         // cast shadow (default true)
  receive?: boolean;      // receive shadow (default true)
  rotY?: number;
  surface?: Surface;
  camBlock?: boolean;     // camera collision (default = collide)
}

const EDGE_COLOR = '#2b2730';

export class Builder {
  buckets = new Map<string, Bucket>();
  edgeGeos: THREE.BufferGeometry[] = [];
  offset = new THREE.Vector3();
  camMeshes: THREE.Mesh[] = [];
  constructor(public scene: THREE.Scene, public physics: Physics) {}

  setOffset(x: number, y: number, z: number) { this.offset.set(x, y, z); }

  private bucket(mat: THREE.Material, cast: boolean, receive: boolean, collidable: boolean): Bucket {
    const key = `${mat.uuid}|${cast}|${receive}|${collidable}`;
    let b = this.buckets.get(key);
    if (!b) { b = { mat, geos: [], cast, receive, collidable }; this.buckets.set(key, b); }
    return b;
  }

  /** Axis-aligned (optionally Y-rotated) box from min/max corners in local (offset) coordinates. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string | THREE.Material, o: BoxOpts = {}) {
    const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
    if (sx < 1e-4 || sy < 1e-4 || sz < 1e-4) return;
    const cx = (x0 + x1) / 2 + this.offset.x, cy = (y0 + y1) / 2 + this.offset.y, cz = (z0 + z1) / 2 + this.offset.z;
    this.boxC(cx, cy, cz, sx, sy, sz, color, o);
  }

  /** Box by world center and size. */
  boxC(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string | THREE.Material, o: BoxOpts = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY ?? 0), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const collide = o.collide ?? true;
    this.addGeo(g, color, { ...o, collide: false, camBlock: o.camBlock ?? collide });
    if (collide) this.physics.addBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, o.rotY ?? 0);
  }

  /** Add any world-space geometry. */
  addGeo(g: THREE.BufferGeometry, color: string | THREE.Material, o: BoxOpts = {}) {
    const mat = typeof color === 'string' ? toon(color, o.surface ?? 'other') : color;
    const camBlock = o.camBlock ?? false;
    const b = this.bucket(mat, o.cast ?? true, o.receive ?? true, camBlock);
    const gg = g.index ? g.toNonIndexed() : g;
    // keep only position/normal/uv for merging compatibility
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((gg.attributes.position.count) * 2), 2));
    if (!gg.attributes.normal) gg.computeVertexNormals();
    b.geos.push(gg);
    if (o.edges ?? true) this.edgeGeos.push(new THREE.EdgesGeometry(g, 28));
  }

  finalize(): THREE.Mesh[] {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
      if (b.collidable) { (merged as any).computeBoundsTree(); this.camMeshes.push(mesh); }
    }
    if (this.edgeGeos.length) {
      const e = mergeGeometries(this.edgeGeos, false);
      if (e) {
        const lines = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.85 }));
        lines.matrixAutoUpdate = false; lines.updateMatrix();
        lines.userData.edges = true;
        this.scene.add(lines);
      }
    }
    this.buckets.clear(); this.edgeGeos = [];
    return this.camMeshes;
  }
}

// ---------- Roof geometry ----------
/** Hipped roof over rectangle [x0,x1]x[z0,z1] (already incl. overhang). */
export function hipRoof(x0: number, z0: number, x1: number, z1: number, eaveY: number, pitch: number, thickness = 0.12): THREE.BufferGeometry {
  const w = x1 - x0, d = z1 - z0;
  const h = pitch * Math.min(w, d) / 2;
  const top = eaveY + h;
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const A = [x0, eaveY, z0], B = [x1, eaveY, z0], C = [x1, eaveY, z1], D = [x0, eaveY, z1];
  if (w >= d) {
    const r0 = [x0 + d / 2, top, (z0 + z1) / 2], r1 = [x1 - d / 2, top, (z0 + z1) / 2];
    tri(A, r0, r1); tri(A, r1, B);           // north face (toward -z)
    tri(D, C, r1); tri(D, r1, r0);           // south
    tri(A, D, r0);                           // west hip
    tri(B, r1, C);                           // east hip
  } else {
    const r0 = [(x0 + x1) / 2, top, z0 + w / 2], r1 = [(x0 + x1) / 2, top, z1 - w / 2];
    tri(A, r0, B);                           // north hip
    tri(D, C, r1);                           // south hip
    tri(A, D, r1); tri(A, r1, r0);           // west
    tri(B, r0, r1); tri(B, r1, C);           // east
  }
  // underside / fascia
  tri(A, B, [x1, eaveY - thickness, z0]); tri(A, [x1, eaveY - thickness, z0], [x0, eaveY - thickness, z0]);
  tri(B, C, [x1, eaveY - thickness, z1]); tri(B, [x1, eaveY - thickness, z1], [x1, eaveY - thickness, z0]);
  tri(C, D, [x0, eaveY - thickness, z1]); tri(C, [x0, eaveY - thickness, z1], [x1, eaveY - thickness, z1]);
  tri(D, A, [x0, eaveY - thickness, z0]); tri(D, [x0, eaveY - thickness, z0], [x0, eaveY - thickness, z1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fixWinding(g);
  g.computeVertexNormals();
  return g;
}

/** Make every triangle face outward/upwards relative to centroid of geometry (cheap heuristic). */
function fixWinding(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
  c.divideScalar(p.count); c.y -= 2;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.clone().sub(a), d.clone().sub(a));
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    if (n.dot(m) < 0) { p.setXYZ(i + 1, d.x, d.y, d.z); p.setXYZ(i + 2, b.x, b.y, b.z); }
  }
}

/** Skirt roof as a height field: hipped around union of rects, dipping under clamp rects (upper floor). */
export function skirtRoof(rects: number[][], clampRects: number[][], eaveY: number, pitch: number, maxY: number, clampY: number, res = 0.1): THREE.BufferGeometry {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of rects) { minX = Math.min(minX, r[0]); minZ = Math.min(minZ, r[1]); maxX = Math.max(maxX, r[2]); maxZ = Math.max(maxZ, r[3]); }
  const nx = Math.ceil((maxX - minX) / res), nz = Math.ceil((maxZ - minZ) / res);
  const inside = (x: number, z: number) => rects.some(r => x >= r[0] - 1e-6 && x <= r[2] + 1e-6 && z >= r[1] - 1e-6 && z <= r[3] + 1e-6);
  const dist = (x: number, z: number) => { let best = -1; for (const r of rects) { if (x >= r[0] - 1e-6 && x <= r[2] + 1e-6 && z >= r[1] - 1e-6 && z <= r[3] + 1e-6) best = Math.max(best, Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z)); } return best; };
  const height = (x: number, z: number) => {
    if (clampRects.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3])) return clampY;
    return Math.min(maxY, eaveY + pitch * Math.max(0, dist(x, z)));
  };
  const pos: number[] = [];
  const V = (i: number, j: number) => { const x = minX + Math.min(i * res, maxX - minX), z = minZ + Math.min(j * res, maxZ - minZ); return [x, height(x, z), z]; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = minX + i * res, za = minZ + j * res, xb = Math.min(xa + res, maxX), zb = Math.min(za + res, maxZ);
    if (!inside((xa + xb) / 2, (za + zb) / 2)) continue;
    const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
    // choose diagonal that follows hips better
    if (Math.abs(a[1] - c[1]) < Math.abs(b[1] - d[1])) { pos.push(...a, ...d, ...c, ...a, ...c, ...b); }
    else { pos.push(...a, ...d, ...b, ...b, ...d, ...c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- Canvas textures (generated, original) ----------
export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const JP_FONT = '"Noto Sans CJK JP","Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
export const JP_SERIF = '"Noto Serif CJK JP","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

export function textPlane(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, px = 256): THREE.Mesh {
  const ratio = w / h;
  const cw = ratio >= 1 ? px : Math.round(px * ratio), ch = ratio >= 1 ? Math.round(px / ratio) : px;
  const tex = canvasTex(cw, ch, draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return m;
}

export function addOutline(obj: THREE.Object3D, thickness = 0.025, color = '#1a1418') {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const list: THREE.Mesh[] = [];
  obj.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.noOutline) list.push(o as THREE.Mesh); });
  for (const m of list) {
    const geo = m.geometry;
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius || 0.1;
    const s = 1 + thickness / Math.max(r, 0.02);
    const hull = new THREE.Mesh(geo, mat);
    hull.scale.setScalar(Math.min(s, 1.6));
    hull.userData.noOutline = true; hull.userData.hull = true;
    hull.castShadow = false;
    m.add(hull);
  }
}

export function rand(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
