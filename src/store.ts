import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ScreenState = 'menu' | 'playing' | 'gameover' | 'settings' | 'tutorial' | 'stats' | 'achievements';

export const THEMES = {
  classic: { id: 'classic', name: 'Classic Day', bg: '#70c5ce', bgBottom: '#b4e1e6', cloudColor: 'rgba(255,255,255,0.6)', pipeTop: '#73bf2e', pipeBottom: '#73bf2e', pipeBorder: '#558022', birdBody: '#e8c92a', birdWing: '#fdfdfd', groundTop: '#ded895', groundBottom: '#e0d890', groundBorder: '#554215', mtnBack: '#8ed9df', mtnFront: '#a5e9cd', cityscape: false, hasStars: false },
  night: { id: 'night', name: 'Midnight', bg: '#001122', bgBottom: '#003366', cloudColor: 'rgba(255,255,255,0.1)', pipeTop: '#2b1b54', pipeBottom: '#2b1b54', pipeBorder: '#1a0b33', birdBody: '#ff4500', birdWing: '#ffa500', groundTop: '#1a2233', groundBottom: '#0a1222', groundBorder: '#000000', mtnBack: '#002244', mtnFront: '#004488', cityscape: false, hasStars: true },
  neon: { id: 'neon', name: 'Cyberpunk', bg: '#090014', bgBottom: '#1a0033', cloudColor: 'rgba(255,0,170,0.1)', pipeTop: '#ff00aa', pipeBottom: '#00d4ff', pipeBorder: '#ffffff', birdBody: '#00ffcc', birdWing: '#ffffff', groundTop: '#110022', groundBottom: '#050011', groundBorder: '#ff00aa', mtnBack: '#330044', mtnFront: '#660088', cityscape: true, hasStars: true },
  retro: { id: 'retro', name: 'Gameboy', bg: '#9bbc0f', bgBottom: '#8bac0f', cloudColor: 'rgba(15,56,15,0.15)', pipeTop: '#306230', pipeBottom: '#306230', pipeBorder: '#0f380f', birdBody: '#0f380f', birdWing: '#8bac0f', groundTop: '#8bac0f', groundBottom: '#8bac0f', groundBorder: '#0f380f', mtnBack: '#306230', mtnFront: '#0f380f', cityscape: false, hasStars: false },
};

interface GameStats {
  gamesPlayed: number;
  totalJumps: number;
  totalScore: number;
}

interface GameState {
  screen: ScreenState;
  score: number;
  highScore: number;
  sfxVolume: number;
  musicVolume: number;
  themeId: keyof typeof THEMES;
  hasSeenTutorial: boolean;
  stats: GameStats;
  achievements: string[];
  autoPlay: boolean;
  setScreen: (screen: ScreenState) => void;
  setScore: (score: number) => void;
  updateHighScore: (score: number) => void;
  setSfxVolume: (vol: number) => void;
  setMusicVolume: (vol: number) => void;
  setTheme: (themeId: keyof typeof THEMES) => void;
  setAutoPlay: (auto: boolean) => void;
  completeTutorial: () => void;
  updateStats: (jumps: number, score: number) => void;
  resetProgress: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      screen: 'menu',
      score: 0,
      highScore: 0,
      sfxVolume: 50,
      musicVolume: 50,
      themeId: 'classic',
      hasSeenTutorial: false,
      stats: { gamesPlayed: 0, totalJumps: 0, totalScore: 0 },
      achievements: [],
      autoPlay: false,
      setScreen: (screen) => set({ screen }),
      setScore: (score) => set({ score }),
      updateHighScore: (score) => set((state) => ({ highScore: Math.max(state.highScore, score) })),
      setSfxVolume: (vol) => set({ sfxVolume: vol }),
      setMusicVolume: (vol) => set({ musicVolume: vol }),
      setTheme: (themeId) => set({ themeId }),
      setAutoPlay: (auto) => set({ autoPlay: auto }),
      completeTutorial: () => set({ hasSeenTutorial: true }),
      updateStats: (jumps, score) => set((state) => {
        const newStats = {
          gamesPlayed: state.stats.gamesPlayed + 1,
          totalJumps: state.stats.totalJumps + jumps,
          totalScore: state.stats.totalScore + score,
        };
        const newAchievements = [...state.achievements];
        if (newStats.gamesPlayed >= 10 && !newAchievements.includes('veteran')) newAchievements.push('veteran');
        if (score >= 10 && !newAchievements.includes('bronze')) newAchievements.push('bronze');
        if (score >= 50 && !newAchievements.includes('silver')) newAchievements.push('silver');
        if (score >= 100 && !newAchievements.includes('gold')) newAchievements.push('gold');

        return { stats: newStats, achievements: newAchievements };
      }),
      resetProgress: () => set({ highScore: 0, hasSeenTutorial: false, stats: { gamesPlayed: 0, totalJumps: 0, totalScore: 0 }, achievements: [] }),
    }),
    {
      name: 'flappy-storage',
      partialize: (state) => ({
        highScore: state.highScore,
        sfxVolume: state.sfxVolume,
        musicVolume: state.musicVolume,
        themeId: state.themeId,
        hasSeenTutorial: state.hasSeenTutorial,
        stats: state.stats,
        achievements: state.achievements,
      }),
    }
  )
);
