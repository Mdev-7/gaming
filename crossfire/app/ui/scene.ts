import * as THREE from 'three';
import { BOXES, EYE_HEIGHT, EMPTY_INPUT, WEAPONS, movePlayer, type Input, type PublicPlayer, type Snapshot, type Vec3, type GameEvent } from '../../lib/game';

export type SceneStatus = { locked: boolean; hp: number; ammo: number; weapon: number; reloading: boolean; hit: boolean; damage: boolean; dead: boolean; respawn: number; fps: number; freeLook?: boolean };
type Local = Vec3 & { vy: number };
const mat = (color: string, metalness = 0, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
function box(parent: THREE.Object3D, size: number[], position: number[], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
  mesh.position.set(...position as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, radius: number, length: number, position: number[], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.rotation.x = Math.PI / 2; mesh.position.set(...position as [number, number, number]); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function sign(text: string, color = '#f6d58a', bg = '#233333', width = 4, height = 1) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 140px Arial'; ctx.fillText(text, 512, 140);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
}
function buildGun(index: number) {
  const gun = new THREE.Group();
  const steel = mat('#52605b', 0.45, 0.37), black = mat('#283432', 0.25, 0.5), accent = mat(index === 1 ? '#b66e3f' : '#dbad50', 0.4, 0.42);
  const dark = mat('#67746c', 0.4, 0.4);
  const length = index === 1 ? 0.64 : index === 2 ? 0.9 : 0.72;
  box(gun, [0.14, 0.18, 0.42], [0, 0, 0], steel);
  box(gun, [0.115, 0.145, length], [0, 0.015, -length / 2 - 0.1], black);
  box(gun, [0.145, 0.12, 0.22], [0, 0, 0.3], dark);
  box(gun, [0.16, 0.23, 0.08], [0, -0.03, 0.44], black);
  const grip = box(gun, [0.09, 0.23, 0.12], [0, -0.16, 0.08], black); grip.rotation.x = -0.25;
  const magazine = box(gun, [0.09, index === 1 ? 0.11 : 0.26, 0.17], [0, -0.17, -0.14], accent); magazine.rotation.x = 0.15;
  cylinder(gun, index === 1 ? 0.044 : 0.025, 0.26, [0, 0.03, -length - 0.2], steel);
  cylinder(gun, 0.035, 0.1, [0, 0.03, -length - 0.36], black);
  box(gun, [0.07, 0.05, length * 0.9], [0, 0.11, -length * 0.45], dark);
  for (let i = 0; i < 9; i++) box(gun, [0.16, 0.025, 0.025], [0, 0.115, -0.15 - i * 0.055], steel);
  box(gun, [0.015, 0.065, 0.25], [0.075, -0.005, -0.4], accent);
  box(gun, [0.10, 0.075, 0.05], [0, 0.16, -0.09], black);
  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 5, 12), accent); sight.position.set(0, 0.205, -0.1); gun.add(sight);
  if (index === 2) { cylinder(gun, 0.045, 0.3, [0, 0.2, -0.2], black); cylinder(gun, 0.054, 0.035, [0, 0.2, -0.37], mat('#43cfcc', 0.7, 0.1)); }
  if (index === 1) box(gun, [0.16, 0.16, 0.26], [0, -0.045, -0.48], accent);
  return gun;
}
function buildArena(scene: THREE.Scene) {
  const concrete = mat('#b5b29b'), edge = mat('#6e7870'), floor = mat('#4a5859');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat('#293b40')); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  box(scene, [50, 0.15, 50], [0, -0.08, 0], floor);
  const laneMat = mat('#b6a35f');
  for (let i = -4; i <= 4; i++) {
    box(scene, [0.045, 0.008, 48], [i * 5, 0.005, 0], edge);
    box(scene, [48, 0.008, 0.045], [0, 0.005, i * 5], edge);
  }
  for (let x = -20; x <= 20; x += 10) for (const z of [-21.5, 21.5]) box(scene, [3, 0.012, 0.12], [x, 0.01, z], laneMat);
  const glow = new THREE.MeshBasicMaterial({ color: '#89e9de' });
  BOXES.forEach((b, index) => {
    const material = b.kind === 'container' ? mat(b.color!) : b.kind === 'crate' ? mat('#a89870') : concrete;
    box(scene, [b.w, b.h, b.d], [b.x, b.h / 2, b.z], material);
    if (b.kind === 'container') {
      const vertical = b.d > b.w, long = vertical ? b.d : b.w;
      const ribMat = mat(b.color!).clone(); ribMat.color.multiplyScalar(0.78);
      for (let i = -long / 2 + 0.2; i < long / 2; i += 0.43) {
        for (const side of [-1, 1]) box(scene, vertical ? [0.07, b.h - 0.22, 0.07] : [0.07, b.h - 0.22, 0.07], vertical ? [b.x + side * (b.w / 2 + 0.025), b.h / 2, b.z + i] : [b.x + i, b.h / 2, b.z + side * (b.d / 2 + 0.025)], ribMat);
      }
      box(scene, [b.w + 0.12, 0.12, b.d + 0.12], [b.x, b.h + 0.03, b.z], edge);
      const label = sign('CF / 0' + index, '#d8d9ba', b.color, vertical ? 2.7 : 4, 0.7);
      label.position.set(b.x, 2.3, b.z + b.d / 2 + 0.041); scene.add(label);
    } else if (b.kind === 'crate') {
      const dark = mat('#6d6a51');
      for (const y of [0.12, b.h - 0.12]) box(scene, [b.w + 0.06, 0.15, b.d + 0.06], [b.x, y, b.z], dark);
      for (const x of [-0.4, 0.4]) box(scene, [0.1, b.h, b.d + 0.05], [b.x + b.w * x, b.h / 2, b.z], dark);
      const label = sign('↑  ↑', '#b8ad83', '#736e55', 0.8, 0.5); label.position.set(b.x, b.h / 2, b.z + b.d / 2 + 0.04); scene.add(label);
    } else if (b.kind === 'pillar') {
      box(scene, [b.w + 0.2, 0.12, b.d + 0.2], [b.x, b.h + 0.04, b.z], edge);
      for (const z of [-1, 1]) box(scene, [2, 0.08, 0.03], [0, 1.6, z * 2.12], glow);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 6, 50), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 2.65; scene.add(ring);
    }
  });
  const wallDetail = mat('#707b73');
  for (let x = -24; x <= 24; x += 6) for (const z of [-24.45, 24.45]) {
    box(scene, [0.25, 6.4, 0.25], [x, 3.2, z], wallDetail);
    box(scene, [2, 0.12, 0.12], [x + 2.5, 5.5, z], glow);
  }
  const sector = sign('SECTOR 07', '#e7ddbb', '#46564f', 12, 2.6); sector.position.set(1, 4.1, -24.4); scene.add(sector);
  const opposite = sign('CROSSFIRE // TRAINING FACILITY', '#e7ddbb', '#46564f', 17, 1.4); opposite.position.set(0, 4, 24.4); opposite.rotation.y = Math.PI; scene.add(opposite);
  // Perimeter architecture and a gantry frame give the compact arena depth.
  const distant = mat('#3c5156');
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.4, r = 42 + (i % 3) * 8, h = 8 + (i % 5) * 3;
    box(scene, [5 + i % 4, h, 8], [Math.sin(angle) * r, h / 2 - 1, Math.cos(angle) * r], distant);
  }
  const gantry = mat('#9a8061', 0.4);
  for (const x of [-21, 21]) {
    box(scene, [0.5, 13, 0.5], [x, 6.5, -18], gantry);
    box(scene, [0.5, 13, 0.5], [x, 6.5, -21], gantry);
  }
  box(scene, [44, 0.65, 0.6], [0, 12.7, -18], gantry);
  box(scene, [44, 0.65, 0.6], [0, 12.7, -21], gantry);
  for (let x = -20; x < 20; x += 3) box(scene, [0.15, 0.15, 3], [x, 12.9, -19.5], gantry);
}
function avatar(p: PublicPlayer) {
  const group = new THREE.Group(), armor = mat(p.color, 0.2), fabric = mat('#24343b'), face = mat('#17292e', 0.4);
  box(group, [0.58, 0.7, 0.33], [0, 1.02, 0], armor);
  box(group, [0.44, 0.3, 0.38], [0, 1.63, 0], armor);
  box(group, [0.34, 0.1, 0.04], [0, 1.66, -0.205], mat('#9bebe6', 0.3));
  for (const side of [-1, 1]) {
    box(group, [0.22, 0.65, 0.25], [side * 0.17, 0.35, 0], fabric);
    box(group, [0.22, 0.15, 0.34], [side * 0.17, 0.1, -0.04], face);
    const arm = box(group, [0.18, 0.53, 0.21], [side * 0.38, 1.07, -0.12], fabric); arm.rotation.x = -0.5;
  }
  box(group, [0.12, 0.14, 0.7], [0.28, 1.14, -0.48], face);
  const plate = sign(p.name + (p.bot ? ' [BOT]' : ''), p.color, '#14242a', 1.5, 0.34); plate.position.set(0, 2.18, 0); group.add(plate); group.userData.label = plate;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: '#07171d', transparent: true, opacity: 0.4 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015; group.add(shadow);
  return group;
}

export class ArenaScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(77, 1, 0.06, 200);
  gunRoot = new THREE.Group();
  guns = WEAPONS.map((_, i) => buildGun(i));
  remote = new Map<string, THREE.Group>();
  keys = new Set<string>();
  yaw = 0; pitch = 0; weapon = 0; fire = false; aim = false; reload = false;
  local: Local = { x: 0, y: 0, z: 0, vy: 0 };
  state: Snapshot | null = null; playerId = ''; active = false; disposed = false;
  paused = false; freeLook = false; lastFrame = 0; lastUI = 0; sequence = 0;
  pending: { seq: number; input: Input; dt: number }[] = [];
  correction = new THREE.Vector3();
  history: { state: Snapshot; at: number }[] = [];
  onInput: (() => void) | null = null;
  connected = true;
  hitUntil = 0; damageUntil = 0; recoil = 0; shotAt = 0; fps = 60;
  seenEvents = new Set<string>();
  traces: { line: THREE.Line; until: number }[] = [];
  audio: AudioContext | null = null; muted = false; sensitivity = 1;
  onStatus: (status: SceneStatus) => void;
  onPause: (paused: boolean) => void;
  onScoreboard: (show: boolean) => void;
  abort = new AbortController(); resize: ResizeObserver; raf = 0;
  constructor(public container: HTMLElement, callbacks: { onStatus: ArenaScene['onStatus']; onPause: ArenaScene['onPause']; onScoreboard: ArenaScene['onScoreboard'] }) {
    this.onStatus = callbacks.onStatus; this.onPause = callbacks.onPause; this.onScoreboard = callbacks.onScoreboard;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute('aria-label', '3D Crossfire arena'); this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#73858a'); this.scene.fog = new THREE.FogExp2('#73858a', 0.013);
    this.scene.add(new THREE.HemisphereLight('#c0e2ed', '#515953', 2.7));
    const sunlight = new THREE.DirectionalLight('#ffe3ad', 3.2); sunlight.position.set(-15, 32, 12); sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048); Object.assign(sunlight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 85 }); sunlight.shadow.bias = -0.001;
    this.scene.add(sunlight); buildArena(this.scene);
    this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.guns.forEach(g => this.gunRoot.add(g)); this.camera.add(this.gunRoot);
    const gunLight = new THREE.PointLight('#e5f8ff', 3, 4); gunLight.position.set(0.5, 0.8, 0.2); this.camera.add(gunLight);
    this.resize = new ResizeObserver(() => this.setSize()); this.resize.observe(container); this.setSize();
    const options = { signal: this.abort.signal };
    document.addEventListener('keydown', this.keydown, options); document.addEventListener('keyup', this.keyup, options);
    document.addEventListener('mousemove', this.mousemove, options); document.addEventListener('pointerlockchange', this.lockchange, options);
    document.addEventListener('pointerlockerror', this.enableFreeLook, options);
    document.addEventListener('mousedown', this.mousedown, options); document.addEventListener('mouseup', this.mouseup, options);
    window.addEventListener('blur', this.blur, options); document.addEventListener('visibilitychange', this.visibility, options);
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault(), options);
    this.raf = requestAnimationFrame(this.frame);
  }
  setSize() { const { clientWidth: w, clientHeight: h } = this.container; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  keydown = (e: KeyboardEvent) => {
    if (!this.active || (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName))) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) this.weapon = Number(e.code.slice(-1)) - 1;
    if (e.code === 'KeyR') this.reload = true;
    if (e.code === 'Tab') this.onScoreboard(true);
    if (e.code === 'Escape' && !document.pointerLockElement) { this.paused = true; this.onPause(true); }
    if (['KeyR', 'Space', 'Digit1', 'Digit2', 'Digit3'].includes(e.code) && !e.repeat) this.onInput?.();
  };
  keyup = (e: KeyboardEvent) => { this.keys.delete(e.code); if (e.code === 'Tab') this.onScoreboard(false); };
  mousemove = (e: MouseEvent) => {
    if (!this.active || this.paused) return;
    if (document.pointerLockElement !== this.renderer.domElement && !(this.freeLook && (e.buttons & 2))) return;
    this.yaw -= e.movementX * 0.002 * this.sensitivity * (this.aim ? 0.6 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.002 * this.sensitivity * (this.aim ? 0.6 : 1), -1.45, 1.45);
  };
  mousedown = (e: MouseEvent) => { if ((document.pointerLockElement === this.renderer.domElement || (this.freeLook && e.target === this.renderer.domElement)) && this.active && !this.paused) { if (e.button === 0) { this.fire = true; this.onInput?.(); } if (e.button === 2) this.aim = true; } };
  mouseup = (e: MouseEvent) => { if (e.button === 0) { this.fire = false; if (this.active) this.onInput?.(); } if (e.button === 2) this.aim = false; };
  blur = () => { this.keys.clear(); this.fire = false; this.aim = false; this.onInput?.(); };
  visibility = () => { if (document.hidden) { this.blur(); if (this.active) { this.paused = true; this.onPause(true); } } };
  lockchange = () => { if (this.active) { this.paused = document.pointerLockElement !== this.renderer.domElement; if (!this.paused) this.freeLook = false; if (this.paused) this.blur(); this.onPause(this.paused); } };
  enableFreeLook = () => { if (this.active) { this.freeLook = true; this.paused = false; this.onPause(false); } };
  lock() {
    if (!this.active) return;
    this.audio ||= new AudioContext(); if (this.audio.state === 'suspended') void this.audio.resume();
    this.paused = false; this.onPause(false);
    try {
      const promise = this.renderer.domElement.requestPointerLock();
      if (promise) promise.then(() => { if (!document.pointerLockElement) this.enableFreeLook(); }).catch(this.enableFreeLook);
    } catch { this.enableFreeLook(); }
  }
  start(state: Snapshot, id: string) {
    this.state = state; this.playerId = id; this.active = true; this.paused = true; this.freeLook = false; this.connected = true;
    const p = state.players[id]; this.local = { x: p.x, y: p.y, z: p.z, vy: 0 }; this.yaw = p.yaw; this.pitch = 0; this.weapon = 0; this.sequence = p.seq;
    this.pending = []; this.correction.set(0, 0, 0); this.history = [{ state, at: performance.now() / 1000 }]; this.seenEvents.clear(); state.events.forEach(e => this.seenEvents.add(e.id));
  }
  stop() { this.active = false; this.state = null; this.playerId = ''; this.onInput = null; this.pending = []; this.history = []; this.blur(); if (document.pointerLockElement) document.exitPointerLock(); this.remote.forEach(g => { this.scene.remove(g); this.disposeObject(g); }); this.remote.clear(); }
  setConnected(connected: boolean) { if (this.connected && !connected) { this.blur(); this.paused = true; this.onPause(true); } this.connected = connected; }
  input(): Input {
    const engaged = this.active && this.connected && !this.paused && !document.hidden;
    let forward = engaged ? Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) : 0;
    let right = engaged ? Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) : 0;
    const norm = Math.max(1, Math.hypot(forward, right)); forward /= norm; right /= norm;
    return { seq: this.sequence, mx: -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right, mz: -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right, yaw: this.yaw, pitch: this.pitch, jump: engaged && this.keys.has('Space'), sprint: engaged && this.keys.has('ShiftLeft'), fire: engaged && this.fire, reload: this.reload, weapon: this.weapon, active: engaged };
  }
  networkInput(): Input {
    const input = { ...this.input(), seq: ++this.sequence }; this.reload = false;
    // Sent input IDs let reconciliation discard acknowledged movement.
    return input;
  }
  receive(state: Snapshot) {
    const previous = this.state?.players[this.playerId], me = state.players[this.playerId];
    if (!me) return;
    const now = performance.now() / 1000;
    if (previous && me.hp < previous.hp) { this.damageUntil = now + 0.35; this.sound('hurt'); }
    const respawned = previous && previous.hp <= 0 && me.hp > 0;
    const previousPosition = new THREE.Vector3(this.local.x, this.local.y, this.local.z).add(this.correction);
    this.pending = this.pending.filter(frame => frame.seq > me.seq).slice(-120);
    const predicted = { x: me.x, y: me.y, z: me.z, vy: me.vy };
    if (me.hp > 0 && !respawned) for (const frame of this.pending) movePlayer(predicted, frame.input, frame.dt);
    this.local = predicted;
    if (respawned || me.hp <= 0 || previousPosition.distanceTo(new THREE.Vector3(predicted.x, predicted.y, predicted.z)) > 3) {
      this.correction.set(0, 0, 0); this.pending = []; if (respawned) this.yaw = me.yaw;
    } else this.correction.copy(previousPosition).sub(new THREE.Vector3(predicted.x, predicted.y, predicted.z));
    this.state = state;
    this.history.push({ state, at: now }); this.history = this.history.slice(-30);
    for (const event of state.events) if (!this.seenEvents.has(event.id)) { this.seenEvents.add(event.id); if (state.time - event.at < 1.5) this.event(event, now); }
    if (this.seenEvents.size > 800) this.seenEvents = new Set(state.events.map(e => e.id));
  }
  event(event: GameEvent, now: number) {
    if (event.type !== 'shot' || !event.from || !event.to) return;
    if (event.by === this.playerId) { if (event.hit) { this.hitUntil = now + 0.16; this.sound('hit'); } }
    else {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(event.from.x, event.from.y, event.from.z), new THREE.Vector3(event.to.x, event.to.y, event.to.z)]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffdf99', transparent: true, opacity: 0.7 })); this.scene.add(line); this.traces.push({ line, until: now + 0.08 });
      if (Math.hypot(event.from.x - this.local.x, event.from.z - this.local.z) < 23) this.sound('distant');
    }
  }
  sound(kind: string) {
    if (!this.audio || this.muted) return;
    const ctx = this.audio, at = ctx.currentTime, gain = ctx.createGain(); gain.connect(ctx.destination);
    if (kind === 'shot' || kind === 'distant') {
      const n = ctx.createBuffer(1, ctx.sampleRate * 0.13, ctx.sampleRate), data = n.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = ctx.createBufferSource(); source.buffer = n;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'distant' ? 550 : this.weapon === 1 ? 1200 : 2200;
      source.connect(filter); filter.connect(gain); gain.gain.setValueAtTime(kind === 'distant' ? 0.035 : 0.17, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    } else {
      const tone = ctx.createOscillator(); tone.type = kind === 'hurt' ? 'sawtooth' : 'sine'; tone.frequency.setValueAtTime(kind === 'hurt' ? 100 : 1150, at); tone.frequency.exponentialRampToValueAtTime(kind === 'hurt' ? 40 : 600, at + 0.08);
      tone.connect(gain); gain.gain.setValueAtTime(0.04, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.1); tone.start(); tone.stop(at + 0.1); tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    }
  }
  frame = (ms: number) => {
    if (this.disposed) return;
    const now = ms / 1000, dt = Math.min((ms - (this.lastFrame || ms)) / 1000, 0.05); this.lastFrame = ms;
    this.fps += ((dt ? 1 / dt : 60) - this.fps) * 0.04;
    const me = this.state?.players[this.playerId];
    if (this.active && me) {
      const input = this.input();
      if (me.hp > 0 && !this.state?.winner && this.connected) {
        movePlayer(this.local, input, dt);
        this.pending.push({ seq: this.sequence + 1, input: { ...input }, dt });
        this.pending = this.pending.slice(-120);
      }
      this.correction.multiplyScalar(Math.exp(-dt * 18));
      this.camera.position.set(this.local.x + this.correction.x, this.local.y + this.correction.y + (me.hp > 0 ? EYE_HEIGHT : 0.55), this.local.z + this.correction.z);
      const moving = Math.hypot(input.mx, input.mz) > 0.1;
      if (moving && this.local.y < 0.1) this.camera.position.y += Math.sin(now * 13) * 0.035;
      this.camera.rotation.set(this.pitch + this.recoil * 0.03, this.yaw, 0, 'YXZ');
      const fov = this.aim && !this.paused ? this.weapon === 2 ? 36 : 57 : input.sprint && moving ? 84 : 77;
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12); this.camera.updateProjectionMatrix();
      const canShoot = input.fire && me.hp > 0 && !me.reloadUntil && me.ammo[this.weapon] > 0 && !this.state?.winner;
      if (canShoot && now > this.shotAt) { this.shotAt = now + WEAPONS[this.weapon].interval; this.recoil = 1; this.sound('shot'); }
      this.recoil *= Math.max(0, 1 - dt * 13);
      this.gunRoot.visible = me.hp > 0;
      const reload = me.reloadUntil > 0;
      this.gunRoot.position.set(this.aim ? 0.015 : 0.29, this.aim ? -0.22 : -0.28, -0.48 + this.recoil * 0.09);
      this.gunRoot.rotation.set(this.recoil * 0.09 + (reload ? -0.5 + Math.sin(now * 9) * 0.1 : 0), reload ? -0.3 : 0, moving ? Math.sin(now * 6.5) * 0.012 : 0);
      this.gunRoot.scale.setScalar(0.66);
      this.guns.forEach((g, i) => { g.visible = i === this.weapon; });
      const latest = this.history[this.history.length - 1];
      const renderTime = latest ? latest.state.time + now - latest.at - 0.075 : this.state!.time;
      let before = this.history[0]?.state || this.state!, after = this.state!;
      for (const entry of this.history) { if (entry.state.time <= renderTime) before = entry.state; if (entry.state.time >= renderTime) { after = entry.state; break; } }
      const blend = THREE.MathUtils.clamp((renderTime - before.time) / Math.max(0.001, after.time - before.time), 0, 1);
      for (const [id, p] of Object.entries(this.state!.players)) {
        if (id === this.playerId) continue;
        let group = this.remote.get(id); if (!group) { group = avatar(p); group.position.set(p.x, p.y, p.z); this.scene.add(group); this.remote.set(id, group); }
        group.visible = p.hp > 0 && p.ready;
        const a = before.players[id] || p, b = after.players[id] || p;
        const teleported = Math.hypot(a.x - b.x, a.z - b.z) > 8 || (a.hp <= 0 && b.hp > 0);
        group.position.set(teleported ? b.x : THREE.MathUtils.lerp(a.x, b.x, blend), teleported ? b.y : THREE.MathUtils.lerp(a.y, b.y, blend), teleported ? b.z : THREE.MathUtils.lerp(a.z, b.z, blend));
        group.rotation.y = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * blend;
        const label = group.userData.label as THREE.Mesh; label.rotation.y = this.yaw - p.yaw;
        group.scale.setScalar(p.protectedUntil > this.state!.time ? 0.97 + Math.sin(now * 10) * 0.025 : 1);
      }
      for (const [id, group] of this.remote) if (!this.state!.players[id]) { this.scene.remove(group); this.disposeObject(group); this.remote.delete(id); }
      if (ms - this.lastUI > 100) {
        this.lastUI = ms; this.onStatus({ locked: !this.paused, hp: me.hp, ammo: me.ammo[this.weapon], weapon: this.weapon, reloading: reload, hit: now < this.hitUntil, damage: now < this.damageUntil, dead: me.hp <= 0, respawn: Math.max(0, Math.ceil(me.respawnAt - this.state!.time)), fps: Math.round(this.fps), freeLook: this.freeLook });
      }
    } else {
      this.camera.position.set(22 + Math.sin(now * 0.045) * 2, 17, 27); this.camera.lookAt(-1, 1, -3); this.camera.fov = 53; this.camera.updateProjectionMatrix();
      this.gunRoot.visible = true; this.gunRoot.position.set(1.1, 0.10 + Math.sin(now * 0.65) * 0.028, -2.7);
      this.gunRoot.rotation.set(0.15, 1.08 + Math.sin(now * 0.15) * 0.04, -0.18); this.gunRoot.scale.setScalar(1.18);
      this.guns.forEach((g, i) => { g.visible = i === this.weapon; });
    }
    this.traces = this.traces.filter(t => { if (now > t.until) { this.scene.remove(t.line); t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); return false; } return true; });
    this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(this.frame);
  };
  disposeObject(object: THREE.Object3D) { object.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach((m: THREE.Material) => { if (m instanceof THREE.MeshBasicMaterial && m.map) m.map.dispose(); m.dispose(); }); } }); }
  dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.abort.abort(); this.resize.disconnect(); if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock(); this.disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove(); void this.audio?.close(); }
}
