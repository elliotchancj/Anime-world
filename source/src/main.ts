import * as THREE from 'three';
import { Physics } from './physics';
import { Builder, matRegistry } from './core';
import { buildHouse, buildLot, inspectables, HOUSE_OFFSET } from './house';
import { buildTown } from './town';
import { Weather, type WeatherKind } from './weather';
import { buildShinchan, animateRig, buildDog, buildPerson, type Rig } from './characters';

const qs = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const mobile = isTouch && Math.min(screen.width, screen.height) < 900;
const $ = (id: string) => document.getElementById(id)!;

async function main() {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: qs.has('shot') });
  let maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 2 : 2);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 900);

  // ---------- world ----------
  const physics = new Physics(); await physics.init();
  const builder = new Builder(scene, physics);
  const house = buildHouse(builder, physics, scene);
  const lot = buildLot(builder, physics, scene);
  const town = buildTown(builder, physics, scene);
  const camMeshes = builder.finalize();
  const weather = new Weather(scene, mobile);
  weather.lamps = [...town.lamps, ...house.lamps, lot.gateLamp];
  weather.lampLights = town.lampLights;
  const inspectRoots = inspectables.map(i => i.obj);

  // ---------- player (Shin-chan) ----------
  const R = physics.R;
  const rig = buildShinchan(); scene.add(rig.root);
  const start = new THREE.Vector3(11.1, 0, 12.2);
  if (qs.get('spawn') === 'living') start.set(HOUSE_OFFSET.x + 4.5, 0.46, HOUSE_OFFSET.z + 6.6);
  const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + 0.5, start.z));
  const collider = physics.world.createCollider(R.ColliderDesc.capsule(0.28, 0.22), body);
  const cc = physics.world.createCharacterController(0.02);
  cc.enableAutostep(0.36, 0.12, true); cc.enableSnapToGround(0.3); cc.setMaxSlopeClimbAngle(52 * Math.PI / 180); cc.setMinSlopeSlideAngle(60 * Math.PI / 180); cc.setApplyImpulsesToDynamicBodies(false);
  let vy = 0, grounded = false, facing = Math.PI, dance = false, mode = 'idle';

  // ---------- Shiro ----------
  const dog = buildDog(); scene.add(dog.root); dog.root.position.copy(lot.dogHome).add(new THREE.Vector3(-0.4, 0, 0.3));
  let dogPhase = 0;

  // ---------- NPCs ----------
  interface Npc { rig: Rig; path: THREE.Vector3[]; seg: number; t: number; speed: number; dir: number; pingpong: boolean; wait: number; }
  const styles = [
    { top: '#2F3F66', bottom: '#2F3F66', hair: '#1a1a1a' },                       // salaryman
    { top: '#F08CB0', bottom: '#6C8FD6', skirt: true, hair: '#5a3a2a' },          // neighbour
    { top: '#D93A30', bottom: '#2A2A40', hair: '#222' },                           // jogger
    { top: '#9AA0A8', bottom: '#6A6A70', hair: '#DADADA', height: 1.55 },          // elderly
    { top: '#F2F2EC', bottom: '#3F6FD0', height: 1.05, hat: '#F2C230', bag: '#E3342F' }, // kindergarten kid
    { top: '#F2F2EC', bottom: '#3F6FD0', height: 1.0, hat: '#F2C230', bag: '#3F7FD8' },
    { top: '#5AAE61', bottom: '#C9945A', skirt: true, hair: '#2a1a10' },
    { top: '#E8C547', bottom: '#3A3A44', hair: '#3a2a20' },
  ];
  const npcs: Npc[] = [];
  styles.forEach((st, i) => {
    const r = buildPerson(st); scene.add(r.root);
    const path = town.paths[i % town.paths.length];
    const pingpong = path.length === 2;
    npcs.push({ rig: r, path, seg: Math.floor(Math.random() * path.length), t: Math.random(), speed: (st.height && st.height < 1.2 ? 1.0 : 1.25) * (i === 2 ? 2.4 : 1), dir: i % 2 ? 1 : -1, pingpong, wait: 0 });
  });
  const npcPos = (n: Npc) => { const a = n.path[n.seg], b = n.path[(n.seg + 1) % n.path.length]; return a.clone().lerp(b, n.t); };

  // ---------- camera rig ----------
  let yaw = 0.25, pitch = 0.32, dist = 6.5, curDist = 6.5;
  const camTarget = new THREE.Vector3();
  let inspecting: THREE.Object3D | null = null; const inspectCenter = new THREE.Vector3(); let inspectDist = 2;
  const ray = new THREE.Raycaster(); (ray as any).firstHitOnly = true;

  // presets for screenshots / debugging
  const preset = qs.get('cam');
  if (qs.get('weather')) weather.setKind(qs.get('weather') as WeatherKind);
  if (qs.get('time')) weather.time = parseFloat(qs.get('time')!);
  if (qs.has('shot')) { weather.cloudiness = weather.kind === 'sunny' ? 0 : 1; weather.precip = weather.kind === 'rain' || weather.kind === 'snow' ? 1 : 0; weather.wet = weather.kind === 'rain' ? 1 : 0; weather.snowCover = weather.kind === 'snow' ? 1 : 0; }
  let fixedCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  if (preset === 'ext') fixedCam = { pos: new THREE.Vector3(1.0, 2.6, 15.0), look: new THREE.Vector3(9.0, 2.4, 5.5) };
  if (preset === 'aerial') fixedCam = { pos: new THREE.Vector3(-14, 26, 30), look: new THREE.Vector3(8, 0, 5) };
  if (preset === 'gate') fixedCam = { pos: new THREE.Vector3(8.6, 1.6, 14.2), look: new THREE.Vector3(11.0, 1.2, 9.5) };
  if (preset === 'int') { fixedCam = { pos: new THREE.Vector3(HOUSE_OFFSET.x + 6.9, 2.3, HOUSE_OFFSET.z + 7.35), look: new THREE.Vector3(HOUSE_OFFSET.x + 3.6, 0.9, HOUSE_OFFSET.z + 4.2) }; }
  if (preset === 'kitchen') fixedCam = { pos: new THREE.Vector3(HOUSE_OFFSET.x + 5.0, 2.2, HOUSE_OFFSET.z + 6.9), look: new THREE.Vector3(HOUSE_OFFSET.x + 5.4, 1.0, HOUSE_OFFSET.z + 0.5) };
  if (preset === 'close') { yaw = 0.0; pitch = 0.12; dist = curDist = 1.6; }
  if (preset === 'rear') fixedCam = { pos: new THREE.Vector3(-3.5, 6, -4), look: new THREE.Vector3(8, 2, 5) };
  if (preset === 'play') { yaw = -0.35; pitch = 0.28; dist = curDist = 5.5; }

  // ---------- input ----------
  const keys = new Set<string>();
  addEventListener('keydown', e => {
    keys.add(e.code);
    if (e.code === 'Escape') exitInspect();
    if (e.code === 'KeyB') dance = !dance;
    if (e.code === 'KeyE') house.door.target = house.door.target > 0.5 ? 0 : 1;
    if (e.code === 'KeyH') $('help').style.display = $('help').style.display === 'none' ? '' : 'none';
    if (e.code === 'KeyF') toggleFs();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const joy = { x: 0, y: 0, id: -1 as number }; let touchRun = false, touchJump = false;
  if (isTouch) { $('joy').style.display = 'block'; $('touchbtns').style.display = 'flex'; }
  const joyEl = $('joy'), knob = $('knob');
  const joyMove = (e: PointerEvent) => { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy), max = r.width / 2 - 10; if (m > max) { dx *= max / m; dy *= max / m; } joy.x = dx / max; joy.y = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  joyEl.addEventListener('pointerdown', e => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.stopPropagation(); });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
  const joyEnd = (e: PointerEvent) => { if (e.pointerId === joy.id) { joy.id = -1; joy.x = joy.y = 0; knob.style.transform = ''; } };
  joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
  const tb = (id: string, down: () => void, up?: () => void) => { const el = $(id); el.addEventListener('pointerdown', e => { e.stopPropagation(); down(); el.classList.add('on'); }); el.addEventListener('pointerup', () => { up?.(); if (id !== 'tDance' || !dance) el.classList.remove('on'); }); el.addEventListener('pointerleave', () => { up?.(); }); };
  tb('tJump', () => touchJump = true); tb('tRun', () => touchRun = true, () => touchRun = false); tb('tDance', () => { dance = !dance; });

  // orbit / pinch / click on canvas
  const cvs = renderer.domElement;
  const ptrs = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  let pinch0 = 0, pinchDist0 = 0;
  cvs.addEventListener('pointerdown', e => { cvs.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = inspecting ? inspectDist : dist; } });
  cvs.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const nd = pinchDist0 * pinch0 / Math.max(d, 1); if (inspecting) inspectDist = THREE.MathUtils.clamp(nd, 0.15, 8); else dist = THREE.MathUtils.clamp(nd, 0.35, 40); return; }
    const s = isTouch ? 0.007 : 0.005;
    yaw -= dx * s; pitch = THREE.MathUtils.clamp(pitch + dy * s, -0.35, 1.45);
    fixedCam = null;
  });
  const ptrEnd = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (p && ptrs.size === 0 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6 && performance.now() - p.t < 400) pick(e.clientX, e.clientY);
  };
  cvs.addEventListener('pointerup', ptrEnd); cvs.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
  cvs.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(e.deltaY * 0.0012); if (inspecting) inspectDist = THREE.MathUtils.clamp(inspectDist * f, 0.15, 8); else dist = THREE.MathUtils.clamp(dist * f, 0.35, 40); fixedCam = null; }, { passive: false });

  const label = $('label');
  function showLabel(name: string, desc: string) { label.innerHTML = `${name}<small>${desc}</small><small style="opacity:.7">Esc / tap empty space to exit · wheel/pinch to zoom</small>`; label.style.display = 'block'; }
  function pick(cx: number, cy: number) {
    const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera); (ray as any).firstHitOnly = false;
    const hits = ray.intersectObjects([...inspectRoots, ...camMeshes], true);
    (ray as any).firstHitOnly = true;
    let found: THREE.Object3D | null = null;
    for (const h of hits) { if ((h.object as any).isLineSegments) continue; let o: THREE.Object3D | null = h.object; while (o && !o.userData.inspect) o = o.parent; if (o) found = o; break; }
    if (!found) { exitInspect(); return; }
    if (found === house.tv.parent || found.userData.inspect?.name === 'Flat-screen TV') { house.tvOn = !house.tvOn; house.tv.visible = house.tvOn; }
    inspecting = found;
    const box = new THREE.Box3().setFromObject(found); box.getCenter(inspectCenter);
    const size = box.getSize(new THREE.Vector3()).length();
    inspectDist = THREE.MathUtils.clamp(size * 1.3 + 0.25, 0.4, 7);
    showLabel(found.userData.inspect.name, found.userData.inspect.desc);
    fixedCam = null;
  }
  function exitInspect() { if (!inspecting) return; inspecting = null; label.style.display = 'none'; }

  // ---------- HUD buttons ----------
  const top = $('top');
  const grp = (items: [string, string, () => void][], getOn: () => string) => {
    const g = document.createElement('div'); g.className = 'grp';
    const btns: HTMLButtonElement[] = [];
    for (const [key, text, fn] of items) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = text; b.dataset.k = key; b.onclick = e => { e.stopPropagation(); fn(); refresh(); }; g.appendChild(b); btns.push(b); }
    const refresh = () => { const on = getOn(); btns.forEach(b => b.classList.toggle('on', on.split(',').includes(b.dataset.k!))); };
    refresh(); top.appendChild(g); refreshers.push(refresh);
  };
  const refreshers: (() => void)[] = [];
  grp([['sunny', '☀️ Sunny', () => weather.setKind('sunny')], ['cloudy', '☁️ Cloudy', () => weather.setKind('cloudy')], ['rain', '🌧️ Rain', () => weather.setKind('rain')], ['snow', '❄️ Snow', () => weather.setKind('snow')]], () => weather.kind);
  grp([['day', 'Day', () => { weather.time = 13; weather.autoTime = false; }], ['dusk', 'Sunset', () => { weather.time = 17.6; weather.autoTime = false; }], ['night', 'Night', () => { weather.time = 21.5; weather.autoTime = false; }], ['cycle', '⏱ Cycle', () => { weather.autoTime = !weather.autoTime; }]],
    () => [weather.autoTime ? 'cycle' : '', !weather.autoTime && weather.time > 7 && weather.time < 16.8 ? 'day' : '', !weather.autoTime && weather.time >= 16.8 && weather.time < 19 ? 'dusk' : '', !weather.autoTime && (weather.time >= 19 || weather.time <= 7) ? 'night' : ''].join(','));
  const toggleFs = async () => {
    const d: any = document, el: any = document.documentElement;
    try {
      if (!(d.fullscreenElement || d.webkitFullscreenElement)) { await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.()); try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* iOS / desktop */ } }
      else await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    } catch { showLabel('Fullscreen unavailable', 'On iPhone: Share → Add to Home Screen to play fullscreen.'); setTimeout(() => label.style.display = 'none', 3500); }
  };
  grp([['fs', '⛶ Fullscreen', () => toggleFs()], ['help', '?', () => { const h = $('help'); h.style.display = h.style.display === 'none' ? '' : 'none'; }]], () => '');
  setInterval(() => refreshers.forEach(f => f()), 1000);

  // ---------- resize ----------
  const onResize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
  addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 200));

  // ---------- loop ----------
  const clock = new THREE.Clock(); let t = 0;
  let fpsAcc = 0, fpsN = 0, lowFor = 0;
  const tmp = new THREE.Vector3();
  const playerPos = () => { const p = body.translation(); return new THREE.Vector3(p.x, p.y - 0.5, p.z); };
  if (qs.has('shot')) { $('help').style.display = 'none'; }

  function step() {
    const dt = Math.min(clock.getDelta(), 1 / 20); t += dt;
    // --- gather input ---
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += joy.x; mz += joy.y;
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchRun || Math.hypot(joy.x, joy.y) > 0.92;
    let jump = keys.has('Space') || touchJump; touchJump = false;
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const dz = (v: number) => Math.abs(v) > 0.15 ? v : 0;
      mx += dz(gp.axes[0]); mz += dz(gp.axes[1]);
      yaw -= dz(gp.axes[2] ?? 0) * dt * 2.5; pitch = THREE.MathUtils.clamp(pitch + dz(gp.axes[3] ?? 0) * dt * 2, -0.35, 1.45);
      if (gp.buttons[0]?.pressed) jump = true; if (gp.buttons[1]?.pressed || gp.buttons[10]?.pressed) run = true;
      if (gp.buttons[6]?.pressed) dist = Math.min(40, dist * (1 + dt)); if (gp.buttons[7]?.pressed) dist = Math.max(0.35, dist * (1 - dt));
    }
    if (inspecting) { mx = mz = 0; jump = false; }
    const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.05) { dance = false; fixedCam = fixedCam && qs.has('shot') ? fixedCam : null; }
    // --- move ---
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const wish = new THREE.Vector3().addScaledVector(right, mx).addScaledVector(fwd, -mz);
    if (wish.lengthSq() > 1e-4) wish.normalize().multiplyScalar(mag * (run ? 4.6 : 2.2));
    if (grounded && jump) vy = 4.3;
    vy -= 12 * dt; if (grounded && vy < 0) vy = -0.5;
    const desired = { x: wish.x * dt, y: vy * dt, z: wish.z * dt };
    cc.computeColliderMovement(collider, desired);
    const mv = cc.computedMovement(); grounded = cc.computedGrounded();
    const cur = body.translation();
    body.setNextKinematicTranslation({ x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z });
    // door
    const pp = playerPos();
    const near = pp.distanceTo(house.door.worldPos) < 1.6;
    if (near && house.door.target === 0 && !qs.has('shot')) house.door.target = 1;
    if (!near && house.door.target === 1 && pp.distanceTo(house.door.worldPos) > 3.5) house.door.target = 0;
    house.door.open += (house.door.target - house.door.open) * Math.min(1, dt * 4);
    house.door.pivot.rotation.y = house.door.open * 1.6;
    house.door.collider.setEnabled(house.door.open < 0.3);
    physics.world.step();
    // rig
    const speedH = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);
    if (wish.lengthSq() > 0.01) { const target = Math.atan2(wish.x, wish.z); let d = target - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); facing += d * Math.min(1, dt * 12); }
    mode = dance ? 'dance' : !grounded && Math.abs(vy) > 1.2 ? 'jump' : speedH > 3.2 ? 'run' : speedH > 0.25 ? 'walk' : 'idle';
    const p2 = playerPos(); rig.root.position.copy(p2); rig.root.rotation.y = facing;
    animateRig(rig, dt, speedH, mode, t);
    // --- dog: follow Shin-chan when he's in the garden, else go home ---
    const inLot = p2.x > -0.5 && p2.x < 16 && p2.z > -0.5 && p2.z < 11 && !house.isInside(p2) && p2.y < 1;
    const dogTarget = inLot ? p2.clone().add(new THREE.Vector3(Math.sin(facing + 2.4) * 0.9, 0, Math.cos(facing + 2.4) * 0.9)) : lot.dogHome.clone().add(new THREE.Vector3(-0.5, 0, 0.35));
    tmp.copy(dogTarget).sub(dog.root.position); tmp.y = 0;
    const dd = tmp.length(); let dogSpeed = 0;
    if (dd > 0.25) { dogSpeed = Math.min(dd * 2.2, 4.5); tmp.normalize(); dog.root.position.addScaledVector(tmp, dogSpeed * dt); dog.root.rotation.y = Math.atan2(tmp.x, tmp.z); }
    dog.root.position.y = 0;
    dogPhase += dt * (dogSpeed * 5 + 1);
    dog.legs.forEach((l, i) => l.rotation.x = dogSpeed > 0.1 ? Math.sin(dogPhase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0);
    dog.tail.position.x = Math.sin(t * 14) * 0.03;
    dog.root.children[0].position.y = dogSpeed > 0.1 ? Math.abs(Math.sin(dogPhase)) * 0.03 : 0;
    // --- NPCs ---
    for (const n of npcs) {
      const pos = npcPos(n);
      const blocked = pos.distanceTo(p2) < 1.1;
      let sp = blocked ? 0 : n.speed;
      const a = n.path[n.seg], b = n.path[(n.seg + 1) % n.path.length];
      const len = a.distanceTo(b);
      n.t += (sp * dt / len) * (n.pingpong ? n.dir : 1);
      if (n.pingpong) { if (n.t > 1) { n.t = 1; n.dir = -1; } if (n.t < 0) { n.t = 0; n.dir = 1; } }
      else if (n.t > 1) { n.t -= 1; n.seg = (n.seg + 1) % n.path.length; }
      const np = npcPos(n);
      n.rig.root.position.copy(np);
      const dir = b.clone().sub(a).multiplyScalar(n.pingpong ? n.dir : 1);
      const ty = Math.atan2(dir.x, dir.z); let d = ty - n.rig.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); n.rig.root.rotation.y += d * Math.min(1, dt * 6);
      if (blocked) { const look = Math.atan2(p2.x - np.x, p2.z - np.z); let e = look - n.rig.root.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); n.rig.root.rotation.y += e * Math.min(1, dt * 4); }
      n.rig.root.visible = np.distanceTo(camera.position) < 140;
      if (n.rig.root.visible) animateRig(n.rig, dt, sp, sp > 2 ? 'run' : sp > 0 ? 'walk' : 'idle', t, false);
    }
    // laundry sway
    lot.laundry.forEach((m, i) => { m.rotation.z = Math.sin(t * (2 + i * 0.3)) * 0.12 * weather.wind * 2; m.rotation.x = Math.sin(t * 1.7 + i) * 0.05; });
    // --- camera ---
    const headY = rig.root.position.y + 0.78;
    if (inspecting) camTarget.lerp(inspectCenter, Math.min(1, dt * 6));
    else camTarget.lerp(tmp.set(p2.x, headY, p2.z), Math.min(1, dt * 12));
    if (fixedCam) {
      camera.position.copy(fixedCam.pos); camera.lookAt(fixedCam.look);
    } else {
      const want = inspecting ? inspectDist : dist;
      const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      let allowed = want;
      if (!inspecting && want > 0.4) {
        ray.set(camTarget, off); ray.far = want + 0.2; ray.near = 0.05;
        const hit = ray.intersectObjects(camMeshes, false)[0];
        if (hit) allowed = Math.max(0.3, hit.distance - 0.18);
      }
      curDist = allowed < curDist ? allowed : curDist + (allowed - curDist) * Math.min(1, dt * 3);
      camera.position.copy(camTarget).addScaledVector(off, curDist);
      camera.lookAt(camTarget);
    }
    rig.root.visible = inspecting ? true : (fixedCam ? true : curDist > 0.45);
    camera.near = curDist < 1 || inspecting ? 0.02 : 0.05; camera.updateProjectionMatrix();
    // --- weather ---
    weather.update(dt, t, camera.position, inspecting ? inspectCenter : p2);
    house.lamps.forEach(() => {});
    renderer.render(scene, camera);
    // --- fps + adaptive resolution ---
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) {
      const fps = fpsN / fpsAcc; $('fps').textContent = `${fps.toFixed(0)} fps · ${dpr.toFixed(2)}x`;
      if (fps < 45 && !qs.has('shot')) { lowFor++; if (lowFor >= 2 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); lowFor = 0; } } else { lowFor = 0; if (fps > 58 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); renderer.setPixelRatio(dpr); } }
      fpsAcc = 0; fpsN = 0;
    }
    requestAnimationFrame(step);
  }
  void matRegistry;
  $('loading').style.display = 'none';
  (window as any).__ready = true;
  (window as any).__dbg = { pos: () => playerPos().toArray().map(v => +v.toFixed(2)), grounded: () => grounded };
  requestAnimationFrame(step);
}

main().catch(e => { console.error(e); $('loading').textContent = 'Failed to start: ' + (e?.message ?? e); });
