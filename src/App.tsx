import { useEffect } from 'react';
import { useGame } from './store/gameStore';
import { useProfile } from './store/profileStore';
import { audio } from './game/audio/audio';
import { race } from './game/race/raceRuntime';
import { HomeScreen } from './ui/screens/HomeScreen';
import { RaceSetupScreen } from './ui/screens/RaceSetupScreen';
import { GarageScreen } from './ui/screens/GarageScreen';
import { DesignScreen } from './ui/screens/DesignScreen';
import { ChampionshipScreen } from './ui/screens/ChampionshipScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { RaceScreen } from './ui/screens/RaceScreen';
import { ResultsScreen } from './ui/screens/ResultsScreen';
import { OnlineScreen } from './ui/screens/OnlineScreen';
import { startCloudSync } from './net/cloudSync';

export default function App() {
  const screen = useGame((s) => s.screen);
  const volume = useProfile((s) => s.settings.volume);

  useEffect(() => audio.setVolume(volume), [volume]);
  useEffect(() => {
    void startCloudSync();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    // expose state for automated testing / debugging
    (window as unknown as Record<string, unknown>).__truckGame = { game: useGame, profile: useProfile, race };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" dir="rtl">
      {screen === 'home' && <HomeScreen />}
      {screen === 'race-setup' && <RaceSetupScreen />}
      {screen === 'garage' && <GarageScreen />}
      {screen === 'design' && <DesignScreen />}
      {screen === 'championship' && <ChampionshipScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'online' && <OnlineScreen />}
      {screen === 'race' && <RaceScreen />}
      {screen === 'results' && <ResultsScreen />}
    </div>
  );
}
