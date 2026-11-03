import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RaceScene } from '../../game/race/RaceScene';
import { buildRace, computeResult } from '../../game/race/buildRace';
import { getPlayer, race, resetRace } from '../../game/race/raceRuntime';
import { attachKeyboard, clearInputs } from '../../game/input/input';
import { audio } from '../../game/audio/audio';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { HUD } from '../hud/HUD';
import { TouchControls } from '../hud/TouchControls';
import { PauseMenu } from '../hud/PauseMenu';
import type { CameraMode } from '../../types';
import { TRACKS } from '../../data/tracks';

const CAMERAS: CameraMode[] = ['chase', 'cab', 'far'];

export function RaceScreen() {
  const cfg = useGame((s) => s.raceConfig);
  const raceKey = useGame((s) => s.raceKey);
  const finishRace = useGame((s) => s.finishRace);
  const restartRace = useGame((s) => s.restartRace);
  const go = useGame((s) => s.go);
  const settings = useProfile((s) => s.settings);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [camera, setCamera] = useState<CameraMode>(settings.camera);
  const finished = useRef(false);

  const { track, setups } = useMemo(() => {
    const p = useProfile.getState();
    return buildRace(cfg, {
      playerName: p.playerName,
      selectedTruck: p.selectedTruck,
      upgrades: p.upgrades,
      design: p.activeDesign(),
      difficulty: p.settings.difficulty,
      camera: p.settings.camera,
    });
    // a new raceKey rebuilds the whole race
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceKey]);

  // useMemo may run twice in StrictMode; make sure the shared runtime points at
  // exactly the racer objects that are rendered.
  useLayoutEffect(() => {
    resetRace(track, cfg.laps, useProfile.getState().settings.camera);
    race.racers = setups.map((s) => s.runtime);
    setCamera(race.camera);
  }, [track, setups, cfg.laps]);

  const showTouch = settings.touchControls === 'on' || (settings.touchControls === 'auto' && window.matchMedia('(pointer: coarse)').matches);

  const togglePause = useCallback(() => {
    if (race.phase === 'loading' || finished.current) return;
    setPaused((p) => !p);
  }, []);
  const cycleCamera = useCallback(() => {
    const next = CAMERAS[(CAMERAS.indexOf(race.camera) + 1) % CAMERAS.length];
    race.camera = next;
    setCamera(next);
    useProfile.getState().updateSettings({ camera: next });
  }, []);
  const respawn = useCallback(() => {
    const p = getPlayer();
    if (p && race.phase === 'racing') p.respawnRequested = true;
  }, []);

  useEffect(() => {
    race.paused = paused;
    if (paused) clearInputs();
  }, [paused]);

  useEffect(() => {
    const detach = attachKeyboard({ onCamera: cycleCamera, onPause: togglePause, onRespawn: respawn });
    const vis = () => { if (document.hidden && race.phase !== 'loading' && !finished.current) setPaused(true); };
    document.addEventListener('visibilitychange', vis);
    audio.unlock();
    audio.setVolume(useProfile.getState().settings.volume);
    audio.startEngine();
    return () => {
      detach();
      document.removeEventListener('visibilitychange', vis);
      audio.stopEngine();
    };
  }, [cycleCamera, togglePause, respawn]);

  useEffect(() => {
    finished.current = false;
    setLoading(true);
    setPaused(false);
  }, [raceKey]);

  const onReady = useCallback(() => {
    // give textures / shaders a moment to compile before the countdown
    setTimeout(() => {
      race.phase = 'countdown';
      race.countdown = 4;
      setLoading(false);
    }, 600);
  }, []);

  const onFinish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const prof = useProfile.getState();
    const result = computeResult(cfg, prof.settings.difficulty);
    const player = getPlayer();
    const prevBest = prof.records[cfg.trackId]?.bestLap ?? null;
    const bestLap = player?.bestLap ?? null;
    const unlocked = prof.recordRace(result, {
      nitroUsed: player?.nitroUsed ?? 0,
      mode: cfg.mode,
      playerTime: result.entries.find((e) => e.isPlayer)!.time,
      bestLap,
    });
    result.newAchievements = unlocked;
    result.bestLapRecord = bestLap != null && (prevBest == null || bestLap < prevBest);
    if (cfg.mode === 'championship' && prof.championship) {
      result.championshipRound = prof.championship.round;
      prof.applyChampionshipRound(result);
    }
    audio.fanfare(result.playerPosition <= 3);
    finishRace(result);
  }, [cfg, finishRace]);

  return (
    <div className="absolute inset-0 bg-black" data-testid="race-screen">
      <RaceScene
        key={raceKey}
        track={track}
        racers={setups}
        quality={settings.quality}
        paused={paused}
        autopilot={cfg.autopilot}
        onFinish={onFinish}
        onReady={onReady}
      />
      {!loading && <HUD track={track} onPause={togglePause} onCamera={cycleCamera} />}
      {!loading && showTouch && !paused && <TouchControls onRespawn={respawn} />}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: 'radial-gradient(ellipse at center, #0d2450 0%, #050b18 70%)' }}>
          <div className="text-6xl">{TRACKS[cfg.trackId].emoji}</div>
          <div className="text-3xl font-black neon-text">{TRACKS[cfg.trackId].nameHe}</div>
          <div className="text-sky-300">טוען מסלול…</div>
          <div className="w-48 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full w-1/2 bg-sky-400 animate-pulse" /></div>
        </div>
      )}
      {paused && (
        <PauseMenu
          camera={camera}
          onResume={() => setPaused(false)}
          onRestart={() => restartRace()}
          onCamera={cycleCamera}
          onExit={() => go(cfg.mode === 'championship' ? 'championship' : 'home')}
        />
      )}
    </div>
  );
}
