import * as THREE from 'three';
import { matRegistry, glassMat, windowGlowColor } from './core';
import { nightGlowMats } from './town';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow';

export class Weather {
  kind: WeatherKind = 'sunny';
  time = 15.5;             // hours
  autoTime = false;
  wind = 0.35;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  sky: THREE.Mesh; skyMat: THREE.ShaderMaterial;
  clouds: THREE.Group; cloudMat: THREE.MeshToonMaterial;
  rain: THREE.LineSegments; rainMat: THREE.ShaderMaterial;
  snow: THREE.Points; snowMat: THREE.ShaderMaterial;
  puddles: THREE.Mesh[] = [];
  wet = 0; snowCover = 0; cloudiness = 0; precip = 0;
  lamps: THREE.Mesh[] = []; lampLights: THREE.PointLight[] = [];
  nightFactor = 0;
  private sunTarget = new THREE.Object3D();
  constructor(public scene: THREE.Scene, mobile: boolean) {
    this.hemi = new THREE.HemisphereLight('#DCEBFF', '#E8DCC8', 2.1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#FFF6E6', 1.05);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); s.bias = -0.0004; s.normalBias = 0.03;
    const cam = s.camera as THREE.OrthographicCamera; cam.left = -22; cam.right = 22; cam.top = 22; cam.bottom = -22; cam.near = 1; cam.far = 120;
    scene.add(this.sun); scene.add(this.sunTarget); this.sun.target = this.sunTarget;
    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#4FA6F0') }, bottom: { value: new THREE.Color('#CDEBFF') }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color('#FFF6D0') }, stars: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ float t = clamp(vP.y*1.6+0.08, 0.0, 1.0); vec3 c = mix(bottom, top, pow(t,0.7));
          float d = max(dot(vP, normalize(sunDir)), 0.0); c += sunCol * (smoothstep(0.9975, 0.999, d) * 1.2 + pow(d, 60.0)*0.25);
          if (stars > 0.0) { vec3 q = floor(vP*220.0); float s = step(0.997, h(q)) * stars * smoothstep(0.05, 0.3, vP.y); c += vec3(s); }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), this.skyMat); this.sky.frustumCulled = false; this.sky.renderOrder = -1; scene.add(this.sky);
    // clouds: flat-ish anime cloud clusters
    this.cloudMat = new THREE.MeshToonMaterial({ color: '#FFFFFF', fog: false });
    this.clouds = new THREE.Group(); scene.add(this.clouds);
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 6, 12, 8), this.cloudMat); m.position.set(k * 7 - n * 3.5, Math.random() * 3, Math.random() * 6); m.scale.y = 0.55; c.add(m); }
      const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 180;
      c.position.set(Math.cos(a) * r, 55 + Math.random() * 40, Math.sin(a) * r);
      c.userData.base = i < 10 ? 1 : 0; // first 10 visible in sunny weather
      this.clouds.add(c);
    }
    // rain (shader-animated streaks around the camera)
    const N = mobile ? 2500 : 7000;
    const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 30, z = (Math.random() - 0.5) * 50;
      pos.set([x, y, z, x, y, z], i * 6); seed.set([0, 1], i * 2);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setAttribute('endp', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2(0.3, 0.1) }, opacity: { value: 0.0 }, color: { value: new THREE.Color('#C8D6F0') } },
      vertexShader: `attribute float endp; uniform float time; uniform vec3 center; uniform vec2 wind; varying float vA;
        void main(){ vec3 p = position; float sp = 22.0; float y = mod(p.y - time*sp, 30.0);
          vec3 w = vec3(wind.x, 0.0, wind.y);
          vec3 q = vec3(mod(p.x - center.x + 25.0 + w.x*y, 50.0) - 25.0 + center.x, y + max(center.y - 10.0, -2.0), mod(p.z - center.z + 25.0 + w.z*y, 50.0) - 25.0 + center.z);
          q += endp * (vec3(-w.x, 1.0, -w.z) * 0.55);
          vA = 1.0 - endp*0.7;
          gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); }`,
      fragmentShader: `uniform float opacity; uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, opacity*vA); }`,
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    // snow
    const M = mobile ? 2000 : 5000;
    const sp = new Float32Array(M * 3); for (let i = 0; i < M; i++) sp.set([(Math.random() - 0.5) * 50, Math.random() * 25, (Math.random() - 0.5) * 50], i * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2(0.3, 0.1) }, opacity: { value: 0 }, scale: { value: 300 } },
      vertexShader: `uniform float time; uniform vec3 center; uniform vec2 wind; uniform float scale;
        void main(){ vec3 p = position; float y = mod(p.y - time*1.4, 25.0);
          float sx = sin(time*0.8 + p.z)*0.6, sz = cos(time*0.7 + p.x)*0.6;
          vec3 q = vec3(mod(p.x - center.x + 25.0 + wind.x*y*2.0 + sx, 50.0)-25.0+center.x, y + max(center.y-8.0,-2.0), mod(p.z - center.z + 25.0 + wind.y*y*2.0 + sz, 50.0)-25.0+center.z);
          vec4 mv = viewMatrix * vec4(q,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(scale * 0.06 / -mv.z, 1.5, 14.0); }`,
      fragmentShader: `uniform float opacity; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.3, length(d)); gl_FragColor = vec4(1.0,1.0,1.0, a*opacity); }`,
    });
    this.snow = new THREE.Points(sg, this.snowMat); this.snow.frustumCulled = false; this.snow.visible = false; scene.add(this.snow);
    // puddles on roads/approach
    const pm = new THREE.MeshBasicMaterial({ color: '#9AA6E0', transparent: true, opacity: 0, depthWrite: false });
    for (const [x, z, sx, sz] of [[-2.5, 4, 1.6, 0.9], [4, 12.6, 2.2, 1.0], [12, 13.4, 1.2, 0.7], [-3, 13, 1.4, 1.1], [24, 12, 2.0, 0.8], [11.0, 9.5, 0.8, 0.5], [-1.6, -8, 1.1, 0.6]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), pm); m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, 0.02, z); scene.add(m); this.puddles.push(m);
    }
    scene.fog = new THREE.Fog('#CDEBFF', 70, 260);
  }

  setKind(k: WeatherKind) { this.kind = k; }

  update(dt: number, t: number, camPos: THREE.Vector3, focus: THREE.Vector3) {
    if (this.autoTime) this.time = (this.time + dt * (24 / 240)) % 24; // full day in 4 minutes
    const k = this.kind;
    const ap = (cur: number, target: number, rate: number) => cur + (target - cur) * Math.min(1, dt * rate);
    this.cloudiness = ap(this.cloudiness, k === 'sunny' ? 0 : 1, 1.5);
    this.precip = ap(this.precip, k === 'rain' || k === 'snow' ? 1 : 0, 1.2);
    this.wet = ap(this.wet, k === 'rain' ? 1 : 0, k === 'rain' ? 0.35 : 0.15);
    this.snowCover = ap(this.snowCover, k === 'snow' ? 1 : 0, k === 'snow' ? 0.2 : 0.3);
    const wind = k === 'rain' ? 0.6 : k === 'snow' ? 0.4 : k === 'cloudy' ? 0.45 : 0.25;
    this.wind = ap(this.wind, wind, 0.5);

    // ---- sun / day-night ----
    const h = this.time;
    const sunAng = ((h - 6) / 12) * Math.PI; // 0 at 6am, PI at 6pm
    const elev = Math.sin(sunAng);
    const dir = new THREE.Vector3(Math.cos(sunAng) * 0.8, Math.max(elev, 0.05), 0.5).normalize(); // east at dawn, south at noon, west at dusk
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.08) / 0.28) * (elev > -0.15 ? 1 : 0);
    this.nightFactor = 1 - day;
    const cl = this.cloudiness;
    const lightDir = day > 0.02 ? dir : new THREE.Vector3(-0.3, 0.8, 0.4).normalize(); // moonlight
    this.sun.position.copy(focus).addScaledVector(lightDir, 60);
    this.sunTarget.position.copy(focus);
    const sunCol = new THREE.Color('#FFF6E6').lerp(new THREE.Color('#FFB070'), dusk * 0.8);
    const moonCol = new THREE.Color('#8FA6E8');
    this.sun.color.copy(day > 0.02 ? sunCol : moonCol);
    this.sun.intensity = day > 0.02 ? 1.05 * day * (1 - cl * 0.7) : 0.25;
    this.sun.castShadow = true;
    this.sun.shadow.intensity = 1 - cl * 0.6;
    const hemiSky = new THREE.Color('#DCEBFF').lerp(new THREE.Color('#E8E8EE'), cl).lerp(new THREE.Color('#FFD2B0'), dusk * 0.5);
    this.hemi.color.copy(hemiSky).lerp(new THREE.Color('#3A4A80'), 1 - day);
    this.hemi.groundColor.copy(new THREE.Color('#E8DCC8')).lerp(new THREE.Color('#1A1A30'), 1 - day);
    this.hemi.intensity = THREE.MathUtils.lerp(0.9, 2.1 + cl * 0.55, day);

    // sky colours
    const top = new THREE.Color('#3E9BEF').lerp(new THREE.Color('#8E9AAE'), cl).lerp(new THREE.Color('#6B6FC4'), dusk * 0.6).lerp(new THREE.Color('#0B1230'), 1 - day);
    const bot = new THREE.Color('#CDEBFF').lerp(new THREE.Color('#C6CBD4'), cl).lerp(new THREE.Color('#FFB27A'), dusk * 0.85).lerp(new THREE.Color('#1F2A55'), 1 - day);
    this.skyMat.uniforms.top.value.copy(top); this.skyMat.uniforms.bottom.value.copy(bot);
    this.skyMat.uniforms.sunDir.value.copy(day > 0.02 ? dir : new THREE.Vector3(-0.3, 0.6, -0.6));
    this.skyMat.uniforms.sunCol.value.set(day > 0.02 ? '#FFF2C0' : '#DDE4FF').multiplyScalar(1 - cl * 0.85);
    this.skyMat.uniforms.stars.value = (1 - day) * (1 - cl);
    this.sky.position.copy(camPos);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(bot);
    fog.near = THREE.MathUtils.lerp(70, 25, this.precip); fog.far = THREE.MathUtils.lerp(260, 120, this.precip);
    // clouds
    this.cloudMat.color.set('#FFFFFF').lerp(new THREE.Color('#A9AFBA'), cl * 0.8).lerp(new THREE.Color('#FFC8A8'), dusk * 0.5).lerp(new THREE.Color('#2A3050'), 1 - day);
    for (const c of this.clouds.children) {
      c.visible = c.userData.base === 1 || cl > 0.3;
      c.position.x += dt * this.wind * 4; if (c.position.x > 260) c.position.x = -260;
      c.scale.setScalar(c.userData.base === 1 ? 1 + cl * 0.5 : cl);
    }
    // precipitation
    const camC = camPos;
    this.rain.visible = this.precip > 0.02 && k !== 'snow' && (k === 'rain' || this.rainMat.uniforms.opacity.value > 0.02);
    this.rainMat.uniforms.opacity.value = ap(this.rainMat.uniforms.opacity.value, k === 'rain' ? 0.55 : 0, 2);
    this.rainMat.uniforms.time.value = t; this.rainMat.uniforms.center.value.copy(camC);
    this.rainMat.uniforms.wind.value.set(this.wind * 0.5, this.wind * 0.15);
    this.rainMat.uniforms.color.value.set(day > 0.3 ? '#C8D6F0' : '#8090B8');
    this.snowMat.uniforms.opacity.value = ap(this.snowMat.uniforms.opacity.value, k === 'snow' ? 0.95 : 0, 1.5);
    this.snow.visible = this.snowMat.uniforms.opacity.value > 0.02;
    this.snowMat.uniforms.time.value = t; this.snowMat.uniforms.center.value.copy(camC); this.snowMat.uniforms.wind.value.set(this.wind * 0.6, this.wind * 0.2);
    for (const p of this.puddles) (p.material as THREE.MeshBasicMaterial).opacity = this.wet * 0.55 * (1 - this.snowCover);
    // surface tint: wet darkening, snow whitening (top-facing surfaces)
    const white = new THREE.Color('#F4F7FB');
    for (const e of matRegistry) {
      const c = e.mat.color.copy(e.base);
      if (e.surface === 'interior') continue;
      const wetK = e.surface === 'road' || e.surface === 'ground' || e.surface === 'roof' || e.surface === 'lawn' ? 0.72 : e.surface === 'wall' ? 0.88 : 0.92;
      c.multiplyScalar(THREE.MathUtils.lerp(1, wetK, this.wet));
      const snowK = e.surface === 'roof' ? 0.85 : e.surface === 'lawn' ? 0.9 : e.surface === 'ground' ? 0.8 : e.surface === 'road' ? 0.55 : e.surface === 'hedge' ? 0.5 : 0;
      if (snowK) c.lerp(white, snowK * this.snowCover);
    }
    // night emissives
    const n = this.nightFactor;
    for (const e of matRegistry) if (e.surface === 'interior') e.mat.emissive.copy(e.base).multiplyScalar(0.16 + n * 0.42);
    glassMat.emissive.copy(windowGlowColor).multiplyScalar(n * 0.55);
    for (const m of nightGlowMats) m.emissive.set('#FFD27A').multiplyScalar(n * 0.75);
    for (const l of this.lamps) (l.material as THREE.MeshToonMaterial).emissive.set('#FFE6A8').multiplyScalar(n * 1.2);
    for (const l of this.lampLights) l.intensity = n * 14;
  }
}
