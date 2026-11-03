// Shared game types

export type ThemeId = 'tech-blue' | 'dynamic-red' | 'modern-green' | 'luxury-gold' | 'clean-white' | 'gaming-purple';
export type SideId = 'left' | 'right' | 'rear';
export type RimStyle = 'steel' | 'chrome' | 'black' | 'gold' | 'neon';
export type TrackId = 'ashdod' | 'desert' | 'neon';
export type TruckId = 'atleon' | 'hauler' | 'phantom';
export type CameraMode = 'chase' | 'cab' | 'far';
export type UpgradeKey = 'engine' | 'acceleration' | 'handling' | 'nitro';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface SideDesign {
  theme: ThemeId;
  headline: string;
  subheadline: string;
  showServices: boolean;
  showContact: boolean;
  showLogo: boolean;
}

export interface BrandInfo {
  title: string; // PHONE TRUCK
  tagline: string; // מעבדת סלולר ומחשבים ניידת
  company: string; // S.Y
  companyTagline: string; // פתרונות טכנולוגיים חכמים
  website: string;
  phone: string;
}

export interface TruckDesign {
  id: string;
  name: string;
  cabColor: string;
  boxColor: string;
  chassisColor: string;
  accentColor: string;
  rimStyle: RimStyle;
  underglow: string | null;
  lightBar: boolean;
  beacons: boolean;
  sideSkirts: boolean;
  brand: BrandInfo;
  sides: Record<SideId, SideDesign>;
  logoDataUrl: string | null;
}

export interface TruckStats {
  maxSpeed: number; // m/s
  accel: number; // m/s^2
  handling: number; // rad/s base yaw rate
  nitroCapacity: number; // seconds
  mass: number;
  offroad: number; // 0..1 how well it keeps speed off-road
}

export interface TrackTheme {
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: string;
  road: string;
  roadLine: string;
  barrier: string;
  barrierEmissive?: string;
  ambient: number;
  sunColor: string;
  sunIntensity: number;
  night: boolean;
}

export interface TrackDef {
  id: TrackId;
  name: string;
  nameHe: string;
  description: string;
  points: [number, number][]; // control points x,z (closed loop)
  heights?: number[]; // optional elevation per control point (visual only, kept flat for MVP)
  width: number;
  theme: TrackTheme;
  ramps?: number[]; // fraction along track [0..1) where ramps are placed
  scenery: 'city' | 'desert' | 'neon';
  emoji: string;
}

export interface RaceResultEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  position: number;
  finished: boolean;
  time: number; // seconds (estimated if not finished)
  bestLap: number | null;
  color: string;
}

export interface RaceResult {
  trackId: TrackId;
  entries: RaceResultEntry[];
  playerPosition: number;
  coinsEarned: number;
  newAchievements: string[];
  bestLapRecord: boolean;
  championshipRound?: number;
}
