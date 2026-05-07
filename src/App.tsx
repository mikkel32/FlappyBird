import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Settings, Play, Trophy, Trash2, Pause, ArrowLeft, BarChart3, Medal, Bot, HardDrive, X } from 'lucide-react';
import { useGameStore, THEMES } from './store';
import { audioContext } from './game/AudioEngine';
import { GameEngine } from './game/GameEngine';

import { AiMenu } from './components/AiMenu';
import { NeuralNetwork } from './game/NeuralNetwork';

export default function App() {
  const { screen, score, highScore, themeId, sfxVolume, musicVolume, hasSeenTutorial, stats, achievements, autoPlay, loadedBrain, setScreen, setScore, updateHighScore, setSfxVolume, setMusicVolume, setTheme, setAutoPlay, completeTutorial, updateStats, resetProgress } = useGameStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Layout calculations
  const [dimensions, setDimensions] = useState({ w: 400, h: 700 });
  const [resetConfirm, setResetConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initAudio = () => audioContext.init();
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true });
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    }
  }, []);

  useEffect(() => {
    audioContext.setVolumes(sfxVolume, musicVolume);
  }, [sfxVolume, musicVolume]);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current);
      engineRef.current.startIdle();
      engineRef.current.onScore = (s) => setScore(s);
      engineRef.current.onGameOver = (jumps: number) => {
        // Need to use the latest score via store getState, but since we are handling this async, 
        // passing down the current score directly inside a state setter or wrapping it via engine works best.
        // The engine score should be synonymous with component score.
        updateStats(jumps, useGameStore.getState().score);
        setScreen('gameover');
      };
    }
    if (engineRef.current) {
      engineRef.current.setTheme(themeId);
    }
  }, [dimensions, themeId]);

  useEffect(() => {
    if (engineRef.current) {
       engineRef.current.autoplay = autoPlay;
       if (autoPlay && loadedBrain) {
          try {
             engineRef.current.brain = NeuralNetwork.deserialize(loadedBrain, 5, 8, 1);
          } catch(e) { console.error('Failed to parse brain', e); }
       } else {
          engineRef.current.brain = null;
       }
    }
  }, [autoPlay, loadedBrain]);

  // Sync high score on exact trigger of gameover
  useEffect(() => {
    if (screen === 'gameover') {
      updateHighScore(score);
    } else if (screen === 'menu') {
      engineRef.current?.startIdle();
    } else if (screen === 'playing' && engineRef.current && engineRef.current.state !== 'playing') {
      setTimeout(() => {
         engineRef.current?.start();
      }, 0);
    }
  }, [screen, score, updateHighScore]);

  const startGame = (botMode: boolean = false) => {
    setAutoPlay(botMode);
    if (!hasSeenTutorial && !botMode) {
      setScreen('tutorial');
    } else {
      setScreen('playing');
      setTimeout(() => {
         engineRef.current?.start();
      }, 0);
    }
  };

  const handleInput = () => {
    if (autoPlay) {
       setAutoPlay(false);
    }
    if (screen === 'playing') {
      engineRef.current?.flap();
    } else if (screen === 'tutorial') {
      completeTutorial();
      setScreen('playing');
      engineRef.current?.start();
      engineRef.current?.flap();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
      }
      if (e.code === 'Escape' && screen === 'playing') {
        engineRef.current?.togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, handleInput]);

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-900 flex items-center justify-center font-pixel p-0 md:p-4 selection:bg-transparent">
      <div 
        ref={containerRef}
        className="relative w-full h-[100dvh] md:max-w-[400px] md:h-[700px] bg-black md:rounded-[32px] md:border-[12px] border-neutral-800 overflow-hidden shadow-2xl"
        onPointerDown={handleInput}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.w}
          height={dimensions.h}
          className="block absolute top-0 left-0 bg-transparent w-full h-full"
        />

        {/* HUD */}
        {screen === 'playing' && (
          <div className="absolute top-8 left-0 w-full flex flex-col px-6 z-10 pointer-events-none gap-4">
            <div className="flex justify-between items-start w-full">
              <span className="text-4xl text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]" style={{WebkitTextStroke: "2px black"}}>
                {score}
              </span>
              <div className="flex gap-2">
                <button 
                  className="pointer-events-auto bg-black/40 p-3 rounded-full backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
                  onPointerDown={(e) => { e.stopPropagation(); engineRef.current?.togglePause(); }}
                >
                  <Pause size={24} />
                </button>
                <button 
                  className="pointer-events-auto bg-red-500/80 p-3 rounded-full backdrop-blur-sm text-white hover:bg-red-600 transition-colors"
                  onPointerDown={(e) => { e.stopPropagation(); setAutoPlay(false); setScreen('menu'); }}
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            {autoPlay && (
              <div className="text-center w-full mt-4">
                <span className="bg-cyan-600/80 text-white text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-sm border border-cyan-400/50 shadow-lg animate-pulse">
                  <Bot size={12} className="inline mr-1" /> Auto-pilot Active
                </span>
                <p className="text-[10px] text-white/70 mt-1 uppercase tracking-widest drop-shadow-md">Tap to take over</p>
              </div>
            )}
          </div>
        )}

        {/* OVERLAYS */}
        {screen === 'menu' && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center gap-6 p-6 z-20">
            <h1 className="text-4xl text-white text-center leading-tight drop-shadow-xl" style={{WebkitTextStroke: "1.5px black"}}>
              FLAPPY <br/><span className="text-yellow-400">CLONE</span>
            </h1>
            <div className="flex flex-col gap-3 w-full max-w-[240px]">
              <button 
                className="w-full bg-green-500 hover:bg-green-400 text-white py-4 rounded-xl shadow-[0_4px_0_#166534] active:shadow-[0_0px_0_#166534] active:translate-y-1 transition-all text-xl font-bold"
                onClick={(e) => { e.stopPropagation(); startGame(); }}
              >
                START GAME
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl shadow-[0_4px_0_#155e75] active:shadow-[0_0px_0_#155e75] active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1 text-xs font-bold"
                  onClick={(e) => { e.stopPropagation(); startGame(true); }}
                >
                  <Bot size={20} /> BASIC BOT
                </button>
                <button 
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl shadow-[0_4px_0_#3730a3] active:shadow-[0_0px_0_#3730a3] active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1 text-xs font-bold"
                  onClick={(e) => { e.stopPropagation(); setScreen('aiMenu'); }}
                >
                  <HardDrive size={20} /> AI LAB
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  className="w-full bg-blue-500 hover:bg-blue-400 text-white py-3 rounded-xl shadow-[0_4px_0_#1e3a8a] active:shadow-[0_0px_0_#1e3a8a] active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1 text-xs font-bold"
                  onClick={(e) => { e.stopPropagation(); setScreen('stats'); }}
                >
                  <BarChart3 size={20} /> STATS
                </button>
                <button 
                  className="w-full bg-purple-500 hover:bg-purple-400 text-white py-3 rounded-xl shadow-[0_4px_0_#581c87] active:shadow-[0_0px_0_#581c87] active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1 text-xs font-bold"
                  onClick={(e) => { e.stopPropagation(); setScreen('achievements'); }}
                >
                  <Medal size={20} /> MEDALS
                </button>
              </div>

              <button 
                className="w-full bg-neutral-600 hover:bg-neutral-500 text-white py-3 rounded-xl shadow-[0_4px_0_#262626] active:shadow-[0_0px_0_#262626] active:translate-y-1 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                onClick={(e) => { e.stopPropagation(); setScreen('settings'); }}
              >
                <Settings size={20} /> SETTINGS
              </button>
            </div>
          </div>
        )}

        {screen === 'tutorial' && (
          <div className="absolute inset-0 bg-black/50 z-20 flex flex-col items-center justify-center p-8 pointer-events-none text-center">
            <div className="animate-bounce mb-8">
              <span className="text-white text-6xl">👆</span>
            </div>
            <p className="text-white text-xl leading-relaxed drop-shadow-md">
              TAP OR SPACE<br/>TO FLAP
            </p>
          </div>
        )}

        {screen === 'aiMenu' && <AiMenu />}

        {screen === 'gameover' && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 gap-6">
            <h2 className="text-4xl text-red-500 mb-4 drop-shadow-[0_4px_0_#7f1d1d]">GAME OVER</h2>
            
            <div className="bg-[#e2c179] border-4 border-[#936625] rounded-xl p-6 w-full max-w-[300px] flex flex-col items-center gap-4 text-[#754c24]">
              <div className="text-center w-full">
                <p className="text-xs mb-2">SCORE</p>
                <p className="text-4xl text-white drop-shadow-[0_2px_0_#754c24]">{score}</p>
              </div>
              <div className="w-full h-1 bg-[#c29d5b] rounded-full"></div>
              <div className="text-center w-full">
                <p className="text-xs mb-2 text-red-800">BEST</p>
                <p className="text-2xl text-white drop-shadow-[0_2px_0_#754c24]">{Math.max(score, highScore)}</p>
              </div>
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                className="bg-green-500 p-4 rounded-full text-white shadow-[0_4px_0_#166534] active:translate-y-1 active:shadow-none hover:bg-green-400"
                onClick={(e) => { e.stopPropagation(); startGame(); }}
              >
                <Play size={32} fill="currentColor" />
              </button>
              <button 
                className="bg-blue-500 p-4 rounded-full text-white shadow-[0_4px_0_#1e3a8a] active:translate-y-1 active:shadow-none hover:bg-blue-400"
                onClick={(e) => { e.stopPropagation(); setScreen('menu'); }}
              >
                <Settings size={32} />
              </button>
            </div>
          </div>
        )}

        {screen === 'stats' && (
          <div className="absolute inset-0 bg-neutral-900 z-40 text-white p-6 overflow-y-auto">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} className="p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700">
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl text-blue-400">STATS</h2>
            </div>
            
            <div className="flex flex-col gap-4">
               <div className="bg-neutral-800 p-4 rounded-xl border-2 border-neutral-700 flex justify-between items-center">
                 <span className="text-xs text-neutral-400">HIGH SCORE</span>
                 <span className="text-xl text-yellow-400">{highScore}</span>
               </div>
               <div className="bg-neutral-800 p-4 rounded-xl border-2 border-neutral-700 flex justify-between items-center">
                 <span className="text-xs text-neutral-400">GAMES PLAYED</span>
                 <span className="text-xl text-blue-400">{stats.gamesPlayed}</span>
               </div>
               <div className="bg-neutral-800 p-4 rounded-xl border-2 border-neutral-700 flex justify-between items-center">
                 <span className="text-xs text-neutral-400">TOTAL FLAPS</span>
                 <span className="text-xl text-green-400">{stats.totalJumps}</span>
               </div>
               <div className="bg-neutral-800 p-4 rounded-xl border-2 border-neutral-700 flex justify-between items-center">
                 <span className="text-xs text-neutral-400">TOTAL PIPES</span>
                 <span className="text-xl text-white">{stats.totalScore}</span>
               </div>
            </div>
          </div>
        )}

        {screen === 'achievements' && (
          <div className="absolute inset-0 bg-neutral-900 z-40 text-white p-6 overflow-y-auto">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} className="p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700">
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl text-purple-400">MEDALS</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {[
                { id: 'veteran', name: 'Veteran', desc: 'Play 10 games', icon: Trophy, color: 'text-gray-400' },
                { id: 'bronze', name: 'Bronze', desc: 'Score 10 points', icon: Medal, color: 'text-amber-600' },
                { id: 'silver', name: 'Silver', desc: 'Score 50 points', icon: Medal, color: 'text-slate-300' },
                { id: 'gold', name: 'Gold', desc: 'Score 100 points', icon: Medal, color: 'text-yellow-400' },
              ].map(a => (
                <div key={a.id} className={`p-4 rounded-xl border-2 flex items-center gap-4 ${achievements.includes(a.id) ? 'bg-neutral-800 border-purple-500/50' : 'bg-neutral-900 border-neutral-800 opacity-50'}`}>
                  <div className={`p-3 rounded-full bg-neutral-900 ${achievements.includes(a.id) ? a.color : 'text-neutral-600'}`}>
                    <a.icon size={24} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{a.name}</span>
                    <span className="text-[10px] text-neutral-400">{a.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 'settings' && (
          <div className="absolute inset-0 bg-neutral-900 z-40 text-white p-6 overflow-y-auto">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} className="p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700">
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl text-yellow-400">SETTINGS</h2>
            </div>
            
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <h3 className="text-sm text-neutral-400">THEME</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(THEMES).map(t => (
                    <button
                      key={t.id}
                      onClick={(e) => { e.stopPropagation(); setTheme(t.id as keyof typeof THEMES); }}
                      className={`p-3 rounded-xl border-4 text-xs font-bold flex flex-col items-center gap-2 ${themeId === t.id ? 'border-green-500 bg-neutral-800' : 'border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800'}`}
                    >
                      <div className="w-full h-12 rounded-lg border-2 border-black relative overflow-hidden" style={{ backgroundColor: t.bg }}>
                         <div className="absolute bottom-0 w-8 h-8 border-t-2 border-r-2 border-black" style={{ backgroundColor: t.pipeTop, borderColor: t.pipeBorder }}></div>
                      </div>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-sm text-neutral-400">AUDIO</h3>
                <div className="bg-neutral-800 p-4 rounded-xl flex flex-col gap-4 border-2 border-neutral-700">
                  <div className="flex items-center gap-4">
                    <Volume2 size={24} className="text-neutral-400 shrink-0" />
                    <div className="w-full flex flex-col gap-2">
                       <span className="text-[10px]">SFX: {sfxVolume}%</span>
                       <input type="range" min="0" max="100" value={sfxVolume} onChange={(e) => setSfxVolume(parseInt(e.target.value))} onPointerDown={(e) => e.stopPropagation()} className="w-full accent-green-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-auto">
                {resetConfirm ? (
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        resetProgress();
                        setResetConfirm(false);
                      }}
                      className="flex-1 p-4 border border-red-500 bg-red-950/30 text-red-500 rounded-xl hover:bg-red-900/50 text-xs font-bold"
                    >
                      CONFIRM RESET
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setResetConfirm(false);
                      }}
                      className="flex-1 p-4 border border-neutral-700 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 text-xs font-bold"
                    >
                      CANCEL
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setResetConfirm(true);
                    }}
                    className="flex items-center justify-center gap-2 w-full p-4 border-2 border-red-900 text-red-500 rounded-xl hover:bg-red-950/30 text-xs"
                  >
                    <Trash2 size={16} /> CLEAR SAVE DATA
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

