import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Settings, Play, Trophy, Trash2, Pause, ArrowLeft, BarChart3, Medal, Bot, HardDrive, X, Zap } from 'lucide-react';
import { useGameStore, THEMES } from './store';
import { audioContext } from './game/AudioEngine';
import { GameEngine } from './game/GameEngine';

import { AiMenu } from './components/AiMenu';
import { NeuralNetwork } from './game/NeuralNetwork';

export default function App() {
  const { screen, score, highScore, themeId, sfxVolume, musicVolume, enableShake, hasSeenTutorial, stats, achievements, autoPlay, loadedBrain, setScreen, setScore, updateHighScore, setSfxVolume, setMusicVolume, setEnableShake, setTheme, setAutoPlay, completeTutorial, updateStats, resetProgress } = useGameStore();

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
          <div className="absolute inset-0 overlay-glass flex flex-col items-center justify-center p-6 z-20 animate-fade-in-scale">
            <h1 className="text-5xl font-black text-yellow-400 text-center leading-tight drop-shadow-xl mb-10 -rotate-3" style={{WebkitTextStroke: "2px #b45309"}}>
              FLAPPY <br/><span className="text-white">CLONE</span>
            </h1>
            <div className="flex flex-col gap-4 w-full max-w-[280px]">
              <button 
                className="btn btn-primary text-xl"
                onClick={(e) => { e.stopPropagation(); startGame(); }}
              >
                START GAME
              </button>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  className="btn btn-secondary flex items-center justify-center gap-2 text-sm"
                  onClick={(e) => { e.stopPropagation(); startGame(true); }}
                >
                  <Bot size={20} /> BOT
                </button>
                <button 
                  className="btn btn-outline bg-indigo-900/50 flex items-center justify-center gap-2 text-sm"
                  onClick={(e) => { e.stopPropagation(); setScreen('aiMenu'); }}
                >
                  <HardDrive size={20} /> LAB
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <button 
                  className="btn btn-outline bg-blue-900/50 flex flex-col items-center justify-center p-3 gap-1 text-xs"
                  onClick={(e) => { e.stopPropagation(); setScreen('stats'); }}
                >
                  <BarChart3 size={20} /> STATS
                </button>
                <button 
                  className="btn btn-outline bg-purple-900/50 flex flex-col items-center justify-center p-3 gap-1 text-xs"
                  onClick={(e) => { e.stopPropagation(); setScreen('achievements'); }}
                >
                  <Medal size={20} /> MEDALS
                </button>
              </div>

              <button 
                className="btn btn-outline bg-neutral-900/50 flex items-center justify-center gap-2 text-sm mt-2"
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
          <div className="absolute inset-0 overlay-dark flex flex-col items-center justify-center p-6 gap-8 animate-fade-in-scale z-30">
            <h2 className="text-5xl font-black text-red-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" style={{WebkitTextStroke: "2px #7f1d1d"}}>GAME OVER</h2>
            
            <div className="glass-panel p-6 w-full max-w-[280px] flex flex-col items-center gap-6">
              <div className="flex justify-between items-center w-full uppercase font-bold tracking-wider">
                <span className="text-white/80">Score</span>
                <span className="text-3xl font-black text-white">{score}</span>
              </div>
              <div className="w-full h-px bg-white/20"></div>
              <div className="flex justify-between items-center w-full uppercase font-bold tracking-wider">
                <span className="text-yellow-400">Best</span>
                <span className="text-3xl font-black text-yellow-400">{Math.max(score, highScore)}</span>
              </div>
            </div>

            <div className="flex gap-4 mt-2 w-full max-w-[280px]">
              <button 
                className="btn btn-primary flex-1 flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); startGame(); }}
              >
                PLAY AGAIN
              </button>
              <button 
                className="btn btn-outline p-4 flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); setScreen('menu'); }}
              >
                <Settings size={24} />
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
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <h3 className="text-xs text-neutral-400 font-bold tracking-widest">THEME</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(THEMES).map(t => (
                    <button
                      key={t.id}
                      onClick={(e) => { e.stopPropagation(); setTheme(t.id as keyof typeof THEMES); }}
                      className={`p-3 rounded-xl border-4 text-xs font-bold flex flex-col items-center gap-2 transition-all ${themeId === t.id ? 'border-green-500 bg-neutral-800 scale-105 shadow-lg' : 'border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:scale-100'}`}
                    >
                      <div className="w-full h-12 rounded-lg border-2 border-black relative overflow-hidden" style={{ backgroundColor: t.bg }}>
                         <div className="absolute bottom-0 w-8 h-8 border-t-2 border-r-2 border-black" style={{ backgroundColor: t.pipeTop, borderColor: t.pipeBorder }}></div>
                      </div>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-xs text-neutral-400 font-bold tracking-widest">AUDIO</h3>
                <div className="bg-neutral-800 p-4 rounded-xl flex flex-col gap-4 border-2 border-neutral-700 shadow-md">
                  <div className="flex items-center gap-4">
                    <Volume2 size={24} className="text-neutral-400 shrink-0" />
                    <div className="w-full flex flex-col gap-2">
                       <span className="text-[10px] tracking-widest">SFX: {sfxVolume}%</span>
                       <input type="range" min="0" max="100" value={sfxVolume} onChange={(e) => setSfxVolume(parseInt(e.target.value))} onPointerDown={(e) => e.stopPropagation()} className="w-full accent-green-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-xs text-neutral-400 font-bold tracking-widest">VISUAL EFFECTS (JUICE)</h3>
                <div className="bg-neutral-800 p-4 rounded-xl flex flex-col gap-4 border-2 border-neutral-700 shadow-md">
                  <label className="flex items-center justify-between cursor-pointer w-full">
                    <div className="flex items-center gap-3">
                      <Zap size={20} className={enableShake ? "text-yellow-400" : "text-neutral-500"} />
                      <span className="text-xs font-bold tracking-wide">Screen Shake & Hit Stop</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={enableShake} 
                      onChange={(e) => setEnableShake(e.target.checked)} 
                      className="w-5 h-5 accent-yellow-400 cursor-pointer"
                    />
                  </label>
                  <p className="text-[9px] text-neutral-400 leading-relaxed uppercase">
                    Turn off if you are sensitive to flashing lights or rapid screen movements.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-4">
                {resetConfirm ? (
                  <div className="flex gap-2 w-full animate-fade-in-scale">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        resetProgress();
                        setResetConfirm(false);
                      }}
                      className="flex-1 p-4 border border-red-500 bg-red-950/30 text-red-500 rounded-xl hover:bg-red-900/50 text-xs font-bold tracking-wider"
                    >
                      CONFIRM RESET
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setResetConfirm(false);
                      }}
                      className="flex-1 p-4 border border-neutral-700 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 text-xs font-bold tracking-wider"
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
                    className="flex items-center justify-center gap-2 w-full p-4 border-2 border-red-900/50 text-red-500 rounded-xl hover:bg-red-950/30 text-xs tracking-wider font-bold transition-colors"
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

