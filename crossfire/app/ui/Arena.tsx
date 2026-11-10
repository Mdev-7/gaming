'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BOXES, WEAPONS, SCORE_LIMIT, type Snapshot } from '../../lib/game';
import type { ArenaScene, SceneStatus } from './scene';
import { GunIcon, Icon } from './icons';

type Session = { code: string; id: string; token: string };
type Modal = 'join' | 'help' | 'settings' | null;
const initialStatus: SceneStatus = { locked: false, hp: 100, ammo: 30, weapon: 0, reloading: false, hit: false, damage: false, dead: false, respawn: 0, fps: 60 };
async function api(body: unknown) {
  const response = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const data = await response.json() as { error?: string; code: string; id: string; token: string; state: Snapshot };
  if (!response.ok) throw Object.assign(new Error(data.error || 'Unable to connect. Please try again.'), { status: response.status });
  return data;
}
function Radar({ state, id }: { state: Snapshot; id: string }) {
  return <svg className="radar" viewBox="-27 -27 54 54" aria-label="Arena minimap">
    <rect x="-26" y="-26" width="52" height="52" fill="#17262b"/>
    {BOXES.map((b, i) => <rect key={i} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill="#61716d"/>)}
    {Object.values(state.players).filter(p => p.hp > 0 && (p.id === id || Math.hypot(p.x - state.players[id]?.x, p.z - state.players[id]?.z) < 12)).map(p => <circle key={p.id} cx={p.x} cy={p.z} r={p.id === id ? 1.4 : 0.9} fill={p.id === id ? '#f6c655' : '#f1856c'}/>)}
  </svg>;
}
export default function Arena() {
  const canvasHost = useRef<HTMLDivElement>(null), sceneRef = useRef<ArenaScene | null>(null), sessionRef = useRef<Session | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null), mounted = useRef(true), networkEpoch = useRef(0);
  const [ready, setReady] = useState(false), [sceneError, setSceneError] = useState('');
  const [name, setName] = useState(''), [roomCode, setRoomCode] = useState('');
  const [lobby, setLobby] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [modal, setModal] = useState<Modal>(null), [paused, setPaused] = useState(true), [scoreboard, setScoreboard] = useState(false);
  const [session, setSession] = useState<Session | null>(null), [state, setState] = useState<Snapshot | null>(null), [status, setStatus] = useState(initialStatus);
  const [muted, setMuted] = useState(false), [sensitivity, setSensitivity] = useState(1), [previewWeapon, setPreviewWeapon] = useState(0);
  const [ping, setPing] = useState(0), [network, setNetwork] = useState('connected'), [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    try { setName(localStorage.getItem('crossfire-name') || ''); } catch { /* storage can be disabled */ }
    const code = location.hash.slice(1).toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) { setRoomCode(code); setModal('join'); }
    let cancelled = false;
    import('./scene').then(({ ArenaScene: Scene }) => {
      if (cancelled || !canvasHost.current) return;
      try {
        sceneRef.current = new Scene(canvasHost.current, { onStatus: setStatus, onPause: setPaused, onScoreboard: setScoreboard }); setReady(true);
      } catch { setSceneError('This browser could not start WebGL. Try a desktop browser with hardware acceleration enabled.'); }
    }).catch(() => setSceneError('Could not load the arena. Refresh to try again.'));
    return () => {
      cancelled = true; mounted.current = false; networkEpoch.current++;
      if (syncTimer.current) clearTimeout(syncTimer.current); if (copyTimer.current) clearTimeout(copyTimer.current);
      sceneRef.current?.dispose(); sceneRef.current = null;
    };
  }, []);
  useEffect(() => { if (sceneRef.current) sceneRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.sensitivity = sensitivity; }, [sensitivity]);
  const leave = useCallback(() => {
    const current = sessionRef.current; networkEpoch.current++;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    sessionRef.current = null; sceneRef.current?.stop();
    setSession(null); setState(null); setLobby(true); setPaused(true); setModal(null); setScoreboard(false); setError(''); setNetwork('connected'); setStatus(initialStatus);
    history.replaceState(null, '', location.pathname + location.search);
    if (current) void api({ ...current, action: 'leave' }).catch(() => {});
  }, []);
  async function enter(action: string) {
    if (busy || !ready) return;
    setBusy(action); setError('');
    try {
      const data = await api({ action, name: name.trim() || 'Rookie', code: roomCode });
      if (!mounted.current) return;
      const current: Session = { code: data.code, id: data.id, token: data.token };
      try { localStorage.setItem('crossfire-name', name.trim() || 'Rookie'); } catch { /* optional preference */ }
      sessionRef.current = current; setSession(current); setState(data.state); sceneRef.current!.start(data.state, current.id);
      setLobby(false); setModal(null); setPaused(true); setStatus(initialStatus); setNetwork('connected');
      history.replaceState(null, '', '#' + current.code);
      const epoch = ++networkEpoch.current;
      let lastSuccess = performance.now();
      const sync = async () => {
        if (!mounted.current || epoch !== networkEpoch.current || !sceneRef.current) return;
        const input = sceneRef.current.networkInput(), at = performance.now();
        try {
          const update = await api({ ...current, action: 'sync', input });
          if (!mounted.current || epoch !== networkEpoch.current) return;
          lastSuccess = performance.now(); setPing(Math.round(lastSuccess - at)); setNetwork('connected');
          sceneRef.current?.receive(update.state, input); setState(update.state);
        } catch (e) {
          if (!mounted.current || epoch !== networkEpoch.current) return;
          if (e instanceof Error && 'status' in e && e.status === 401) { leave(); setError('Your session expired. Join the room to play again.'); return; }
          if (performance.now() - lastSuccess > 2500) setNetwork('reconnecting');
        }
        if (mounted.current && epoch === networkEpoch.current) syncTimer.current = setTimeout(sync, Math.max(30, 110 - (performance.now() - at)));
      };
      void sync();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not join the match.'); }
    finally { if (mounted.current) setBusy(''); }
  }
  async function copyInvite() {
    const current = sessionRef.current; if (!current) return;
    const link = location.origin + location.pathname + '#' + current.code;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setRoomCode(current.code); setModal('join'); }
    if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2500);
  }
  const selectWeapon = (i: number) => { setPreviewWeapon(i); if (sceneRef.current) sceneRef.current.weapon = i; };
  const me = state && session ? state.players[session.id] : null;
  const players = state ? Object.values(state.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths) : [];
  const remaining = state ? Math.max(0, Math.ceil(state.roundEnd - state.time)) : 300;
  const clock = Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
  const kills = state?.events.filter(e => e.type === 'kill').slice(-4).reverse() || [];
  const humanCount = players.filter(p => !p.bot).length;
  const resume = () => { setModal(null); sceneRef.current?.lock(); };
  return <main className={'game-shell ' + (lobby ? 'is-lobby' : 'is-playing')}>
    <div className="scene-host" ref={canvasHost}/>
    {lobby && <>
      <div className="lobby-shade"/><div className="film-grain"/>
      <header className="topbar">
        <a href="/" className="brand" aria-label="Crossfire home"><span className="brand-symbol"><Icon name="crosshair" size={25}/></span><span>CROSSFIRE<span className="brand-dot">®</span></span></a>
        <nav aria-label="Main navigation"><button className="nav-active" onClick={() => setModal(null)}>PLAY</button><button onClick={() => setModal('help')}>HOW TO PLAY <span>↗</span></button></nav>
        <div className="top-actions"><span className="online-label"><i/> ONLINE MULTIPLAYER</span><button className="icon-button" aria-label={muted ? 'Enable sound' : 'Mute sound'} onClick={() => setMuted(!muted)}><Icon name={muted ? 'mute' : 'volume'} size={18}/></button><button className="icon-button" aria-label="Settings" onClick={() => setModal('settings')}><Icon name="settings" size={18}/></button></div>
      </header>
      <section className="lobby-content">
        <div className="hero-copy">
          <div className="eyebrow"><span className="tiny-cross">+</span> INSTANT ACTION. ZERO DOWNLOADS.</div>
          <h1>MAKE<br/><span>YOUR MARK.</span></h1>
          <p className="hero-description">Your browser. Your battleground.<br/>Gear up for fast, no-nonsense multiplayer combat.</p>
          <div className="play-panel">
            <label htmlFor="callsign" className="field-label">YOUR CALLSIGN <span>01 — IDENTIFY YOURSELF</span></label>
            <div className="name-field"><Icon name="users" size={18}/><input id="callsign" placeholder="Enter player name" autoComplete="nickname" maxLength={18} value={name} onChange={e => setName(e.target.value)}/><span>↵</span></div>
            <button className="play-button" disabled={!!busy || !ready} onClick={() => enter('quick')}><Icon name="bolt" size={22}/><span>{busy === 'quick' ? 'CONNECTING…' : !ready ? 'LOADING ARENA…' : 'QUICK PLAY'}</span><Icon name="arrow" size={23}/></button>
            <div className="room-buttons"><button disabled={!!busy || !ready} onClick={() => enter('create')}><Icon name="users" size={17}/>{busy === 'create' ? 'CREATING…' : 'CREATE ROOM'}<span>+</span></button><button disabled={!!busy || !ready} onClick={() => { setError(''); setModal('join'); }}><Icon name="link" size={17}/>JOIN ROOM<span>↗</span></button></div>
            <button className="practice-button" disabled={!!busy || !ready} onClick={() => enter('practice')}><Icon name="crosshair" size={15}/>{busy === 'practice' ? 'PREPARING RANGE…' : 'Warm up against bots'}<span>→</span></button>
            {error && <p role="alert" className="error-text">{error}</p>}
            {sceneError && <p role="alert" className="error-text">{sceneError}</p>}
          </div>
          <p className="desktop-note"><span>⌨</span> DESKTOP + MOUSE RECOMMENDED <span className="note-line"/> FREE TO PLAY</p>
        </div>
        <div className="weapon-showcase" aria-label="Weapon preview">
          <div className="showcase-top"><span>STANDARD ISSUE / {String(previewWeapon + 1).padStart(2, '0')}</span><span className="outline-cross">+</span></div>
          <div className="weapon-caption"><span className="yellow-dash"/><div><span className="field-label">{WEAPONS[previewWeapon].short}</span><h2>{WEAPONS[previewWeapon].name}</h2></div><span className="weapon-spec">{WEAPONS[previewWeapon].magazine}<small>ROUND MAG</small></span></div>
          <div className="weapon-picker">{WEAPONS.map((w, i) => <button key={w.id} className={previewWeapon === i ? 'selected' : ''} onClick={() => selectWeapon(i)} aria-label={'Preview ' + w.name} aria-pressed={previewWeapon === i}><span>0{i + 1}</span><GunIcon weapon={i} size={85}/><span>{['AR', 'SG', 'DMR'][i]}</span></button>)}</div>
        </div>
      </section>
      <section className="briefing-strip" aria-label="Match information">
        <div className="map-thumb"><div className="map-grid"><i/><i/><i/><i/><i/></div><span>07</span></div>
        <div className="map-description"><span className="field-label">THE BATTLEGROUND</span><strong>SECTOR 07 <span>LIVE</span></strong><small>Industrial yard · Close-quarters combat</small></div>
        <div className="briefing-stats"><div><Icon name="users"/><strong>2–8<span>PLAYERS</span></strong></div><div><Icon name="crosshair"/><strong>FREE FOR ALL<span>EVERY PLAYER FOR THEMSELVES</span></strong></div><div><Icon name="trophy"/><strong>15 KILLS<span>TAKE THE TOP SPOT</span></strong></div></div>
        <button className="briefing-help" aria-label="View game controls" onClick={() => setModal('help')}><Icon name="arrow"/></button>
      </section>
      <footer className="lobby-footer"><span>LESS WAITING. MORE PLAYING.</span><span>CROSSFIRE / BROWSER WARFARE <i/> V.1.0</span></footer>
    </>}
    {!lobby && state && session && <>
      <div className={'damage-vignette ' + (status.damage ? 'visible' : '')}/>
      <div className="game-top"><div className="match-info"><span className="mini-brand">CROSSFIRE</span><span>SECTOR 07 <i/> FREE FOR ALL</span></div><div className="match-clock"><span>FIRST TO {SCORE_LIMIT}</span><strong>{clock}</strong></div><div className="connection-info"><span className={network === 'connected' ? 'connection-good' : 'connection-bad'}>● {network === 'connected' ? ping + ' MS' : 'RECONNECTING'}</span><span>{humanCount} ONLINE{state.mode === 'practice' ? ' · 3 BOTS' : ''}</span></div></div>
      <div className="radar-panel"><Radar state={state} id={session.id}/><button onClick={copyInvite}><Icon name={copied ? 'check' : 'link'} size={13}/>{copied ? 'LINK COPIED' : 'ROOM ' + session.code}</button></div>
      <div className="killfeed">{kills.map(k => <div key={k.id}><span className={k.by === session.id ? 'you' : ''}>{k.name}</span><GunIcon weapon={k.weapon} size={42}/><span className={k.target === session.id ? 'you' : ''}>{k.victim}</span>{k.headshot && <Icon name="crosshair" size={12}/>}</div>)}</div>
      {!paused && !status.dead && !state.winner && <div className={'crosshair ' + (status.hit ? 'is-hit' : '')}><i/><i/><i/><i/>{status.hit && <span>×</span>}</div>}
      {!paused && status.reloading && <div className="reload-indicator"><span/>RELOADING</div>}
      {!paused && status.dead && <div className="death-screen"><Icon name="skull" size={42}/><h2>ELIMINATED</h2><p>Back in the fight in <strong>{status.respawn}</strong></p></div>}
      <div className="game-bottom"><div className="health-panel"><Icon name="shield" size={25}/><strong>{status.hp}<small>HEALTH</small></strong><div className="health-bar"><i style={{ width: status.hp + '%' }}/></div><span>{me?.kills || 0} K / {me?.deaths || 0} D</span></div><div className="weapon-slots">{WEAPONS.map((w, i) => <button key={w.id} className={status.weapon === i ? 'selected' : ''} onClick={() => { if (sceneRef.current) sceneRef.current.weapon = i; }} aria-label={'Equip ' + w.name}><kbd>{i + 1}</kbd><GunIcon weapon={i} size={66}/></button>)}</div><div className="ammo-panel"><span>{WEAPONS[status.weapon].name}<small>{status.reloading ? 'RELOADING' : 'R TO RELOAD'}</small></span><strong>{String(status.ammo).padStart(2, '0')}<small>/ {WEAPONS[status.weapon].magazine}</small></strong></div></div>
      <div className="game-hints"><span><kbd>TAB</kbd> SCOREBOARD</span><span><kbd>ESC</kbd> MENU</span>{status.freeLook && <span><kbd>RIGHT DRAG</kbd> LOOK</span>}<span>{status.fps} FPS</span></div>
      {humanCount === 1 && state.mode === 'online' && !paused && <div className="waiting-banner"><Icon name="users" size={15}/>Arena is open. Invite a friend to start the firefight.<button onClick={copyInvite}>{copied ? 'COPIED ✓' : 'COPY INVITE ↗'}</button></div>}
      {state.winner && <div className="round-finish"><Icon name="trophy" size={44}/><span>ROUND COMPLETE</span><h2>{state.winner}</h2><p>takes the top spot. Next round starts shortly.</p><button onClick={() => setScoreboard(!scoreboard)}>VIEW SCOREBOARD</button></div>}
      {(scoreboard || (paused && !modal)) && <div className="menu-backdrop">
        {scoreboard ? <section className="scoreboard"><div className="modal-header"><div><span className="eyebrow">SECTOR 07 / FREE FOR ALL</span><h2>SCOREBOARD</h2></div><button className="icon-button" aria-label="Close scoreboard" onClick={() => setScoreboard(false)}><Icon name="close"/></button></div><div className="score-row score-heading"><span>#</span><span>PLAYER</span><span>KILLS</span><span>DEATHS</span></div>{players.map((p, i) => <div className={'score-row ' + (p.id === session.id ? 'is-you' : '')} key={p.id}><span>{i + 1}</span><span><i style={{ background: p.color }}/>{p.name}{p.id === session.id && <small>YOU</small>}{p.bot && <small>BOT</small>}</span><strong>{p.kills}</strong><span>{p.deaths}</span></div>)}<p className="score-footer">{humanCount}/8 players · First to 15 kills · 5 minute rounds</p></section> : <section className="pause-menu"><div className="eyebrow">{state.mode === 'practice' ? 'PRACTICE RANGE · 3 BOTS' : 'ONLINE MULTIPLAYER · ' + session.code}</div><h2>READY TO<br/><em>DROP IN?</em></h2><p>{state.mode === 'practice' ? 'A little target practice. A lot of firepower.' : humanCount > 1 ? 'The arena is live. Make every shot count.' : 'Your arena is ready. Share the link and bring a rival.'}</p><button className="play-button" onClick={resume}><Icon name="crosshair"/><span>{status.locked ? 'BACK TO THE FIGHT' : 'ENTER ARENA'}</span><Icon name="arrow"/></button><div className="pause-secondary"><button onClick={copyInvite}><Icon name={copied ? 'check' : 'link'} size={16}/>{copied ? 'INVITE COPIED' : 'INVITE FRIENDS'}</button><button onClick={() => setModal('settings')}><Icon name="settings" size={16}/>SETTINGS</button></div><button className="leave-button" onClick={leave}><Icon name="exit" size={16}/>LEAVE MATCH</button><div className="pause-controls"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>MOUSE</kbd> AIM + FIRE</span><span><kbd>1 2 3</kbd> WEAPONS</span></div></section>}
      </div>}
    </>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="modal-card"><div className="modal-header"><span className="eyebrow">CROSSFIRE / {modal === 'join' ? 'MULTIPLAYER' : modal === 'help' ? 'FIELD MANUAL' : 'PREFERENCES'}</span><button className="icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><Icon name="close"/></button></div>
      {modal === 'join' && <><h2 id="modal-title">{session ? 'BRING A RIVAL.' : 'JOIN THE FIGHT.'}</h2><p>{session ? 'Send your friends this room code or copy the invite link.' : 'Get a room code from a friend and jump into the same arena.'}</p>{session ? <><div className="share-code">{session.code}</div><button className="play-button" onClick={copyInvite}><Icon name="link"/><span>{copied ? 'COPIED!' : 'COPY INVITE LINK'}</span><Icon name="arrow"/></button></> : <form onSubmit={e => { e.preventDefault(); void enter('join'); }}><label className="field-label" htmlFor="room-code">6-CHARACTER ROOM CODE</label><input id="room-code" className="room-code-input" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="XXXXXX" maxLength={6} autoFocus autoComplete="off" required minLength={6}/><button className="play-button" disabled={!!busy || roomCode.length !== 6 || !ready}><Icon name="link"/><span>{busy ? 'CONNECTING…' : 'JOIN ROOM'}</span><Icon name="arrow"/></button></form>}{error && <p className="error-text" role="alert">{error}</p>}</>}
      {modal === 'help' && <><h2 id="modal-title">KNOW YOUR MOVES.</h2><p>First to 15 kills wins. Every player is a rival. You respawn after 3 seconds, so get back in there.</p><div className="controls-list">{[['W A S D', 'Move'], ['MOUSE', 'Look around'], ['LEFT CLICK', 'Fire weapon'], ['RIGHT CLICK', 'Aim down sights'], ['SPACE', 'Jump'], ['SHIFT', 'Sprint'], ['R', 'Reload'], ['1 / 2 / 3', 'Switch weapons'], ['TAB', 'Scoreboard'], ['ESC', 'Open menu']].map(([key, label]) => <div key={key}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="tip"><Icon name="users"/><span>Create a room and share its invite link. Friends join the same live match from another browser.</span></div></>}
      {modal === 'settings' && <><h2 id="modal-title">DIAL IT IN.</h2><p>Your setup. Your edge.</p><div className="setting-row"><label htmlFor="sensitivity">Mouse sensitivity</label><output>{sensitivity.toFixed(1)}×</output></div><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value={sensitivity} onChange={e => setSensitivity(Number(e.target.value))}/><div className="setting-row"><span>Game audio</span><button className={'toggle ' + (!muted ? 'on' : '')} onClick={() => setMuted(!muted)} aria-label="Game audio" role="switch" aria-checked={!muted}><i/></button></div><p className="setting-note">Headphones recommended. Audio starts when you enter the arena.</p><button className="play-button" onClick={() => { setModal(null); if (!lobby) sceneRef.current?.lock(); }}><Icon name="check"/><span>{lobby ? 'ALL SET' : 'BACK TO THE FIGHT'}</span><Icon name="arrow"/></button></>}
    </section></div>}
    <div className="sr-only" aria-live="polite">{busy ? 'Connecting to match' : error || ''}</div>
  </main>;
}
