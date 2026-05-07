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
              <span key={score} className="text-4xl text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-score-bump inline-block origin-top-left" style={{WebkitTextStroke: "2px black"}}>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-20 animate-fade-in-scale">
            <div className="absolute inset-0 bg-sky-900/10 backdrop-blur-[1px] z-0"></div>
            
            <div className="z-10 flex flex-col items-center w-full max-w-[320px]">
              <h1 className="text-4xl font-black text-white text-center leading-[1.1] tracking-widest drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-8 -rotate-3" style={{WebkitTextStroke: "2px #553811", textShadow: "0 4px 0 #553811, 0 6px 8px rgba(0,0,0,0.5)"}}>
                FLAPPY<br/>
                <span className="text-[#facc15]" style={{WebkitTextStroke: "2px #ca8a04", textShadow: "0 4px 0 #ca8a04, 0 6px 8px rgba(0,0,0,0.5)"}}>CLONE</span>
              </h1>
              
              <div className="flex flex-col gap-4 w-full">
                <button 
                  className="bg-green-500 hover:bg-green-400 text-white w-full py-5 text-3xl rounded-2xl border-b-[8px] border-green-700 active:border-b-0 active:mt-[8px] active:mb-[-8px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:shadow-none animate-pulse hover:animate-none"
                  onClick={(e) => { e.stopPropagation(); startGame(); }}
                  style={{WebkitTextStroke: "2px #14532d", textShadow: "3px 3px 0 #14532d"}}
                >
                  <Play className="mr-3" size={32} fill="currentColor" strokeWidth={2} stroke="#14532d" /> PLAY
                </button>
                
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <button 
                    className="bg-blue-500 hover:bg-blue-400 text-white w-full py-4 text-lg rounded-2xl border-b-[6px] border-blue-700 active:border-b-0 active:mt-[6px] active:mb-[-6px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none"
                    onClick={(e) => { e.stopPropagation(); startGame(true); }}
                    style={{WebkitTextStroke: "1px #1e3a8a", textShadow: "2px 2px 0 #1e3a8a"}}
                  >
                    <Bot className="mr-2" size={24} strokeWidth={2} /> BOT
                  </button>
                  <button 
                    className="bg-purple-500 hover:bg-purple-400 text-white w-full py-4 text-lg rounded-2xl border-b-[6px] border-purple-700 active:border-b-0 active:mt-[6px] active:mb-[-6px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none"
                    onClick={(e) => { e.stopPropagation(); setScreen('aiMenu'); }}
                    style={{WebkitTextStroke: "1px #3b0764", textShadow: "2px 2px 0 #3b0764"}}
                  >
                    <HardDrive className="mr-2" size={24} strokeWidth={2} /> LAB
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <button 
                    className="bg-[#c3b97b] hover:bg-[#ded895] text-[#553811] w-full py-3 text-sm rounded-2xl border-b-[6px] border-[#928641] active:border-b-0 active:mt-[6px] active:mb-[-6px] flex flex-col items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none"
                    onClick={(e) => { e.stopPropagation(); setScreen('stats'); }}
                  >
                    <BarChart3 className="mb-1" size={20} strokeWidth={3} /> STATS
                  </button>
                  <button 
                    className="bg-[#c3b97b] hover:bg-[#ded895] text-[#553811] w-full py-3 text-sm rounded-2xl border-b-[6px] border-[#928641] active:border-b-0 active:mt-[6px] active:mb-[-6px] flex flex-col items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none"
                    onClick={(e) => { e.stopPropagation(); setScreen('achievements'); }}
                  >
                    <Medal className="mb-1" size={20} strokeWidth={3} /> MEDALS
                  </button>
                </div>
                
                <button 
                  className="bg-[#8b7b4b] hover:bg-[#a1905c] text-white w-full py-4 text-sm rounded-2xl border-b-[6px] border-[#554b2d] active:border-b-0 active:mt-[6px] active:mb-[-6px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none mt-2"
                  onClick={(e) => { e.stopPropagation(); setScreen('settings'); }}
                  style={{WebkitTextStroke: "1px #3a331c", textShadow: "2px 2px 0 #3a331c"}}
                >
                  <Settings className="mr-2" size={20} strokeWidth={3} /> SETTINGS
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'tutorial' && (
          <div className="absolute inset-0 bg-black/40 z-20 flex flex-col items-center justify-center p-8 pointer-events-none text-center backdrop-blur-sm">
            <div className="animate-bounce mb-8 drop-shadow-xl">
              <span className="text-white text-7xl" style={{ filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.5))" }}>👆</span>
            </div>
            <p className="text-white text-3xl font-black leading-tight tracking-widest uppercase mb-12" style={{WebkitTextStroke: "2px #1e3a8a", textShadow: "0 4px 0 #1e3a8a, 0 8px 10px rgba(0,0,0,0.6)"}}>
              TAP OR SPACE<br/>TO FLAP
            </p>
          </div>
        )}

        {screen === 'aiMenu' && <AiMenu />}

        {screen === 'gameover' && (
          <div className="absolute inset-0 overlay-dark flex flex-col items-center justify-center p-6 gap-8 animate-fade-in-scale z-30">
            <h2 className="text-5xl md:text-6xl font-black text-white text-center leading-[1.1] tracking-widest drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]" style={{WebkitTextStroke: "3px #553811", textShadow: "0 6px 0 #553811, 0 8px 10px rgba(0,0,0,0.5)"}}>
              GAME<br/>OVER
            </h2>
            
            <div className="bg-[#ded895] border-[6px] border-[#553811] rounded-2xl p-6 w-full max-w-[280px] flex flex-col items-center gap-2 relative shadow-[0_12px_0_#553811,0_25px_30px_rgba(0,0,0,0.6)]">
              <div className="flex flex-col items-center w-full uppercase font-black tracking-widest text-[#d8582d]">
                <span className="text-lg drop-shadow-sm mb-1 z-10" style={{textShadow: "1px 1px 0 rgba(255,255,255,0.4)"}}>SCORE</span>
                <span className="text-5xl text-white drop-shadow-md z-20" style={{WebkitTextStroke: "2px #553811", textShadow: "0px 4px 0px #553811"}}>{score}</span>
              </div>
              
              <div className="w-[80%] h-[4px] bg-[#c3b97b] rounded-full my-3"></div>
              
              <div className="flex flex-col items-center w-full uppercase font-black tracking-widest text-[#d8582d]">
                <span className="text-lg drop-shadow-sm mb-1 z-10" style={{textShadow: "1px 1px 0 rgba(255,255,255,0.4)"}}>BEST</span>
                <span className="text-4xl text-white drop-shadow-md z-20" style={{WebkitTextStroke: "2px #553811", textShadow: "0px 4px 0px #553811"}}>{Math.max(score, highScore)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-4 w-full max-w-[280px]">
              <button 
                className="bg-green-500 hover:bg-green-400 text-white w-full py-4 text-xl rounded-2xl border-b-[8px] border-green-700 active:border-b-0 active:mt-[8px] active:mb-[-8px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:shadow-none"
                onClick={(e) => { e.stopPropagation(); startGame(); }}
                style={{WebkitTextStroke: "1px #14532d", textShadow: "2px 2px 0 #14532d"}}
              >
                <Play className="mr-3" size={24} fill="currentColor" strokeWidth={1} stroke="#14532d" /> PLAY AGAIN
              </button>
              <button 
                className="bg-orange-500 hover:bg-orange-400 text-white w-full py-4 text-xl rounded-2xl border-b-[8px] border-orange-700 active:border-b-0 active:mt-[8px] active:mb-[-8px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:shadow-none"
                onClick={(e) => { e.stopPropagation(); setScreen('menu'); }}
                style={{WebkitTextStroke: "1px #7c2d12", textShadow: "2px 2px 0 #7c2d12"}}
              >
                MAIN MENU
              </button>
            </div>
          </div>
        )}

        {screen === 'stats' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 p-6 overflow-y-auto flex flex-col items-center">
            <div className="w-full max-w-[320px] mt-8">
              <div className="flex items-center justify-center relative mb-8">
                <button 
                  onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} 
                  className="absolute left-0 bg-yellow-500 hover:bg-yellow-400 text-white p-3 rounded-xl border-b-[6px] border-yellow-700 active:border-b-0 active:translate-y-[6px] shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
                >
                  <ArrowLeft size={28} strokeWidth={3} />
                </button>
                <h2 className="text-4xl font-black text-white tracking-widest" style={{WebkitTextStroke: "2px #1e3a8a", textShadow: "0 4px 0 #1e3a8a, 0 6px 10px rgba(0,0,0,0.5)"}}>
                  STATS
                </h2>
              </div>
              
              <div className="bg-[#ded895] border-[6px] border-[#553811] rounded-2xl p-5 w-full flex flex-col gap-5 relative shadow-[0_12px_0_#553811,0_25px_30px_rgba(0,0,0,0.6)]">
                 <div className="bg-[#c3b97b] border-[4px] border-[#928641] rounded-xl p-4 flex justify-between items-center shadow-inner">
                   <span className="text-sm font-black text-[#6a5f25] tracking-widest">HIGH SCORE</span>
                   <span className="text-2xl font-black text-white" style={{WebkitTextStroke: "1px #3a331c", textShadow: "0 2px 0 #3a331c"}}>{highScore}</span>
                 </div>
                 <div className="bg-[#c3b97b] border-[4px] border-[#928641] rounded-xl p-4 flex justify-between items-center shadow-inner">
                   <span className="text-sm font-black text-[#6a5f25] tracking-widest">GAMES PLAYED</span>
                   <span className="text-2xl font-black text-white" style={{WebkitTextStroke: "1px #3a331c", textShadow: "0 2px 0 #3a331c"}}>{stats.gamesPlayed}</span>
                 </div>
                 <div className="bg-[#c3b97b] border-[4px] border-[#928641] rounded-xl p-4 flex justify-between items-center shadow-inner">
                   <span className="text-sm font-black text-[#6a5f25] tracking-widest">TOTAL FLAPS</span>
                   <span className="text-2xl font-black text-white" style={{WebkitTextStroke: "1px #3a331c", textShadow: "0 2px 0 #3a331c"}}>{stats.totalJumps}</span>
                 </div>
                 <div className="bg-[#c3b97b] border-[4px] border-[#928641] rounded-xl p-4 flex justify-between items-center shadow-inner">
                   <span className="text-sm font-black text-[#6a5f25] tracking-widest">TOTAL PIPES</span>
                   <span className="text-2xl font-black text-white" style={{WebkitTextStroke: "1px #3a331c", textShadow: "0 2px 0 #3a331c"}}>{stats.totalScore}</span>
                 </div>
              </div>
            </div>
          </div>
        )}

        {screen === 'achievements' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 p-6 overflow-y-auto flex flex-col items-center">
            <div className="w-full max-w-[320px] mt-8">
              <div className="flex items-center justify-center relative mb-8">
                <button 
                  onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} 
                  className="absolute left-0 bg-yellow-500 hover:bg-yellow-400 text-white p-3 rounded-xl border-b-[6px] border-yellow-700 active:border-b-0 active:translate-y-[6px] shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
                >
                  <ArrowLeft size={28} strokeWidth={3} />
                </button>
                <h2 className="text-4xl font-black text-white tracking-widest" style={{WebkitTextStroke: "2px #6b21a8", textShadow: "0 4px 0 #6b21a8, 0 6px 10px rgba(0,0,0,0.5)"}}>
                  MEDALS
                </h2>
              </div>
              
              <div className="flex flex-col gap-4">
                {[
                  { id: 'veteran', name: 'Veteran', desc: 'Play 10 games', icon: Trophy, color: 'text-slate-200 shadow-[0_0_15px_rgba(226,232,240,0.8)]' },
                  { id: 'bronze', name: 'Bronze', desc: 'Score 10 points', icon: Medal, color: 'text-amber-600 shadow-[0_0_15px_rgba(217,119,6,0.8)]' },
                  { id: 'silver', name: 'Silver', desc: 'Score 50 points', icon: Medal, color: 'text-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.8)]' },
                  { id: 'gold', name: 'Gold', desc: 'Score 100 points', icon: Medal, color: 'text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)]' },
                ].map(a => (
                  <div key={a.id} className={`p-4 rounded-2xl border-[4px] flex items-center gap-4 relative overflow-hidden transition-all ${achievements.includes(a.id) ? 'bg-[#fef08a] border-[#eab308] shadow-[0_6px_0_#ca8a04,0_10px_15px_rgba(0,0,0,0.4)]' : 'bg-[#ded895] border-[#928641] opacity-60 shadow-[0_6px_0_#928641]'} mt-2`}>
                    <div className={`p-3 rounded-full bg-[#553811] ${achievements.includes(a.id) ? a.color : 'text-[#a1905c]'}`}>
                      <a.icon size={28} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xl font-black text-[#6a5f25]" style={{WebkitTextStroke: "1px #fae8ff"}}>{a.name}</span>
                      <span className="text-xs font-bold text-[#8b7b4b] uppercase tracking-widest">{a.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {screen === 'settings' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 p-6 overflow-y-auto flex flex-col items-center">
            <div className="w-full max-w-[320px] mt-8">
              <div className="flex items-center justify-center relative mb-8">
                <button 
                  onClick={(e) => { e.stopPropagation(); setScreen('menu'); }} 
                  className="absolute left-0 bg-yellow-500 hover:bg-yellow-400 text-white p-3 rounded-xl border-b-[6px] border-yellow-700 active:border-b-0 active:translate-y-[6px] shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
                >
                  <ArrowLeft size={28} strokeWidth={3} />
                </button>
                <h2 className="text-4xl font-black text-white tracking-widest" style={{WebkitTextStroke: "2px #b45309", textShadow: "0 4px 0 #b45309, 0 6px 10px rgba(0,0,0,0.5)"}}>
                  SETTINGS
                </h2>
              </div>
              
              <div className="flex flex-col gap-6 w-full">
                <div className="bg-[#ded895] border-[6px] border-[#553811] rounded-2xl p-5 flex flex-col gap-5 relative shadow-[0_12px_0_#553811,0_25px_30px_rgba(0,0,0,0.6)]">
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-black text-[#6a5f25] tracking-widest" style={{WebkitTextStroke: "1px #fae8ff"}}>THEME</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.values(THEMES).map(t => (
                        <button
                          key={t.id}
                          onClick={(e) => { e.stopPropagation(); setTheme(t.id as keyof typeof THEMES); }}
                          className={`p-3 rounded-xl border-[4px] text-xs font-black flex flex-col items-center gap-2 transition-all ${themeId === t.id ? 'border-[#14532d] bg-[#fef08a] shadow-[0_4px_0_#14532d] text-[#14532d]' : 'border-[#928641] bg-[#c3b97b] text-[#6a5f25] hover:bg-[#d4cd9e]'}`}
                        >
                          <div className="w-full h-12 rounded-lg border-[3px] border-[#553811] relative overflow-hidden" style={{ backgroundColor: t.bg }}>
                             <div className="absolute bottom-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#553811]" style={{ backgroundColor: t.pipeTop, borderColor: t.pipeBorder }}></div>
                          </div>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-black text-[#6a5f25] tracking-widest" style={{WebkitTextStroke: "1px #fae8ff"}}>AUDIO</h3>
                    <div className="bg-[#c3b97b] p-4 rounded-xl flex flex-col gap-4 border-[4px] border-[#928641] shadow-inner">
                      <div className="flex items-center gap-4">
                        <Volume2 size={28} strokeWidth={3} className="text-[#553811] shrink-0" />
                        <div className="w-full flex flex-col gap-2">
                           <span className="text-xs font-bold text-[#6a5f25] tracking-widest">SFX: {sfxVolume}%</span>
                           <input type="range" min="0" max="100" value={sfxVolume} onChange={(e) => setSfxVolume(parseInt(e.target.value))} onPointerDown={(e) => e.stopPropagation()} className="w-full retro-slider" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-black text-[#6a5f25] tracking-widest" style={{WebkitTextStroke: "1px #fae8ff"}}>VISUAL EFFECTS</h3>
                    <div className="bg-[#c3b97b] p-4 rounded-xl flex flex-col gap-4 border-[4px] border-[#928641] shadow-inner">
                      <label className="flex items-center justify-between cursor-pointer w-full">
                        <div className="flex items-center gap-3">
                          <Zap size={24} strokeWidth={3} className={enableShake ? "text-yellow-500" : "text-[#8b7b4b]"} />
                          <span className="text-xs font-black text-[#553811] tracking-wide">SHAKE & FLASH</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={enableShake} 
                          onChange={(e) => setEnableShake(e.target.checked)} 
                          className="w-6 h-6 accent-yellow-500 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {resetConfirm ? (
                    <div className="flex gap-2 w-full animate-fade-in-scale">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          resetProgress();
                          setResetConfirm(false);
                        }}
                        className="flex-1 p-4 bg-red-500 hover:bg-red-400 text-white rounded-xl border-b-[6px] border-red-700 active:border-b-0 active:translate-y-[6px] text-xs font-black tracking-wider shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
                      >
                        CONFIRM
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setResetConfirm(false);
                        }}
                        className="flex-1 p-4 bg-[#8b7b4b] hover:bg-[#a1905c] text-white rounded-xl border-b-[6px] border-[#554b2d] active:border-b-0 active:translate-y-[6px] text-xs font-black tracking-wider shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
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
                      className="flex items-center justify-center gap-2 w-full p-4 bg-red-500 hover:bg-red-400 text-white rounded-xl border-b-[6px] border-red-700 active:border-b-0 active:translate-y-[6px] text-sm tracking-wider font-black shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all"
                    >
                      <Trash2 size={20} strokeWidth={3} /> CLEAR DATA
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

