import React, { useEffect, useState, useRef } from 'react';
import { Bot, ArrowLeft, Save, LogIn, HardDrive, Play, Trash2 } from 'lucide-react';
import { useGameStore } from '../store';
import { auth, db } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, doc, setDoc, deleteDoc, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { NeuralNetwork } from '../game/NeuralNetwork';
import { AiTrainingEngine } from '../game/AiTrainingEngine';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function AiMenu() {
  const { setScreen, autoPlay, setAutoPlay } = useGameStore();
  const [user, setUser] = useState<User | null>(null);
  
  const [training, setTraining] = useState(false);
  const [generation, setGeneration] = useState(1);
  const [maxScore, setMaxScore] = useState(0);
  const [alive, setAlive] = useState(0);
  const [allTimeBestScore, setAllTimeBestScore] = useState(0);
  const [allTimeBestGen, setAllTimeBestGen] = useState(1);
  const [bots, setBots] = useState<any[]>([]);
  const [botToDelete, setBotToDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg: string, type: 'error' | 'success'} | null>(null);

  // Training configurations
  const [batchSize, setBatchSize] = useState(100);
  const [mutationRate, setMutationRate] = useState(15);
  const [elitism, setElitism] = useState(10);

  const showToast = (msg: string, type: 'error' | 'success' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const trainingCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AiTrainingEngine | null>(null);
  const bestBrainRef = useRef<NeuralNetwork | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) loadBots(u.uid);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (trainingCanvasRef.current && !engineRef.current) {
      engineRef.current = new AiTrainingEngine(trainingCanvasRef.current);
      engineRef.current.onGenerationComplete = (best, score) => {
        bestBrainRef.current = best;
      };
      engineRef.current.onScoreUpdate = (score, aliveNum, bestScore, bestGen) => {
        setGeneration(engineRef.current!.generation);
        setMaxScore(Math.floor(score));
        setAlive(aliveNum);
        setAllTimeBestScore(bestScore);
        setAllTimeBestGen(bestGen);
        
        // Capture brain in real-time
        if (engineRef.current?.bestAllTimeBrain) {
          bestBrainRef.current = engineRef.current.bestAllTimeBrain;
        }
      };
    }
  }, [training]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loadBots = async (uid: string) => {
    const botsRef = collection(db, 'users', uid, 'bots');
    const q = query(botsRef, orderBy('createdAt', 'desc'), limit(10));
    try {
      const snap = await getDocs(q);
      const b: any[] = [];
      snap.forEach(doc => b.push({ id: doc.id, ...doc.data() }));
      setBots(b);
    } catch (e) {
      console.warn('Failed to load bots (perhaps rules need time to propagation or first user doc creation)', e);
      try {
        handleFirestoreError(e, OperationType.LIST, `users/${uid}/bots`);
      } catch (err) {}
    }
  };

  const startTraining = () => {
    setTraining(true);
    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.currentBatchSize = batchSize;
        engineRef.current.baseMutationRate = mutationRate / 100;
        engineRef.current.elitismCount = elitism;
        engineRef.current.start();
      }
    }, 100);
  };

  const [isPaused, setIsPaused] = useState(false);

  const stopTraining = () => {
    engineRef.current?.stop();
    setTraining(false);
    setIsPaused(false);
  };

  const togglePause = () => {
    if (!engineRef.current) return;
    engineRef.current.togglePause();
    setIsPaused(!engineRef.current.isRunning);
  };

  const saveBest = async () => {
    // Priority: 1. Engine's live state, 2. Engine's all-time record, 3. Ref fallback
    const bestData = engineRef.current?.getBestBrain();
    const brainToSave = bestData?.brain || engineRef.current?.bestAllTimeBrain || bestBrainRef.current;
    
    if (!user || !brainToSave) return;
    
    const finalScore = bestData?.score ?? (allTimeBestScore > 0 ? allTimeBestScore : maxScore);
    const finalGen = bestData?.gen ?? (allTimeBestGen || engineRef.current?.generation || 1);

    try {
      const docId = `bot-${Date.now()}`;
      
      // Ensure user profile exists
      const userRef = doc(db, 'users', user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
        throw e;
      }

      if (!userSnap.exists()) {
        try {
          await setDoc(userRef, {
             createdAt: serverTimestamp(),
             displayName: user.displayName || 'Anonymous Player'
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
          throw e; // rethrow for outer catch
        }
      }

      const botDoc = doc(db, 'users', user.uid, 'bots', docId);
      try {
        await setDoc(botDoc, {
          weights: brainToSave.serialize(),
          score: finalScore,
          generation: finalGen,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/bots/${docId}`);
        throw e;
      }
      
      showToast('Bot saved successfully!');
      loadBots(user.uid);
    } catch (e) {
      console.error(e);
      showToast('Failed to save bot!', 'error');
    }
  };

  const deleteBot = async (docId: string) => {
    if (!user) return;
    
    // Optimistic update
    const prevBots = [...bots];
    setBots(bots.filter(b => b.id !== docId));
    setBotToDelete(null);
    
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'bots', docId));
      showToast('Bot deleted!');
    } catch (e) {
      console.error(e);
      showToast('Failed to delete bot!', 'error');
      setBots(prevBots);
      try {
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/bots/${docId}`);
      } catch(err) {}
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-start p-6 overflow-y-auto w-full h-full animate-fade-in-scale">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full font-black tracking-widest shadow-lg transition-all animate-fade-in-scale ${toast.type === 'error' ? 'bg-red-500 border-b-[4px] border-red-700 text-white' : 'bg-green-500 border-b-[4px] border-green-700 text-white'}`}>
          {toast.msg}
        </div>
      )}
      <div className="w-full max-w-[320px] flex flex-col gap-6 mt-2">
        <div className="flex justify-center items-center relative mb-4">
          <button 
            className="absolute left-0 bg-yellow-500 hover:bg-yellow-400 text-white p-2 rounded-xl border-b-[6px] border-yellow-700 active:border-b-0 active:translate-y-[6px] shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:shadow-none transition-all" 
            onClick={() => setScreen('menu')}
          >
            <ArrowLeft size={24} strokeWidth={3} />
          </button>
          <h2 className="text-3xl font-black text-white tracking-widest drop-shadow-md" style={{WebkitTextStroke: "1px #0891b2", textShadow: "0 4px 0 #0891b2, 0 6px 10px rgba(0,0,0,0.5)"}}>
            AI LAB
          </h2>
        </div>

        <div className="bg-[#ded895] border-[6px] border-[#553811] rounded-2xl p-5 flex flex-col gap-4 relative shadow-[0_12px_0_#553811,0_25px_30px_rgba(0,0,0,0.6)] w-full">
          {!user ? (
            <div className="flex flex-col gap-4 text-center mt-2">
              <p className="text-[#553811] font-bold text-sm">Sign in to train and save genetic models in the cloud.</p>
              <button 
                onClick={login} 
                className="bg-blue-500 hover:bg-blue-400 text-white w-full py-4 text-lg rounded-2xl border-b-[6px] border-blue-700 active:border-b-0 active:translate-y-[6px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none"
                style={{WebkitTextStroke: "1px #1e3a8a", textShadow: "2px 2px 0 #1e3a8a"}}
              >
                <LogIn size={24} strokeWidth={2.5} className="mr-2" /> SIGN IN
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-[#c3b97b] border-[4px] border-[#928641] p-3 rounded-xl shadow-inner">
                <div className="text-xs">
                  <p className="text-[#8b7b4b] font-black tracking-widest leading-none mb-1">LOGGED IN AS</p>
                  <p className="font-bold text-[#553811]">{user.displayName || user.email}</p>
                </div>
                <button onClick={() => signOut(auth)} className="text-[10px] font-black tracking-widest uppercase bg-red-500 text-white px-2 py-1 rounded border-b-[2px] border-red-700 active:border-b-0 active:translate-y-[2px]">OUT</button>
              </div>

            {training ? (
              <div className="flex flex-col gap-6 relative mt-4">
                 <div className="w-full aspect-[4/7] max-h-[60vh] mx-auto rounded-xl overflow-hidden relative shadow-inner bg-black border-[3px] border-cyan-500">
                    <canvas ref={trainingCanvasRef} width={400} height={700} className="w-full h-full object-contain" />
                    <div className="absolute top-2 left-2 flex flex-col gap-2">
                       <div className="flex gap-2">
                         <span className="bg-black/60 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wide">Gen: {generation}</span>
                         <span className="bg-black/60 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wide">Score: {maxScore}</span>
                         <span className="bg-green-500/80 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wide">Alive: {alive}</span>
                       </div>
                       {allTimeBestScore > 0 && (
                         <div className="flex gap-2 text-yellow-300">
                           <span className="bg-black/60 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-wide border border-yellow-500/50">
                             Best: {allTimeBestScore} (from Gen {allTimeBestGen})
                           </span>
                         </div>
                       )}
                    </div>
                 </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={togglePause}
                      className={`btn flex-1 flex items-center justify-center ${isPaused ? 'bg-green-500 text-green-950' : 'bg-amber-500 text-amber-950'}`}
                      style={{boxShadow: `0 6px 0 ${isPaused ? '#16a34a' : '#d97706'}`}}
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button onClick={stopTraining} className="btn flex-1 bg-red-500 text-red-950 flex items-center justify-center gap-2" style={{boxShadow: '0 6px 0 #dc2626'}}>
                      <Save size={18} /> Stop
                    </button>
                    <button onClick={saveBest} className="btn flex-1 btn-primary flex items-center justify-center gap-2">
                      <Save size={18} /> Save Best
                    </button>
                  </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6 mt-4">
                <div className="flex flex-col gap-4 font-semibold text-white/90">                  
                  <div className="setting-slider">
                    <label className="flex justify-between items-center">
                      <span className="text-sm">Batch Size</span>
                      <span className="font-mono bg-white/10 px-2 py-1 rounded">{(batchSize)}</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" 
                      max="2000" 
                      step="10" 
                      value={batchSize} 
                      onChange={(e) => setBatchSize(Number(e.target.value))} 
                      className="w-full mt-2"
                    />
                  </div>

                  <div className="setting-slider">
                    <label className="flex justify-between items-center">
                      <span className="text-sm">Mutation (%)</span>
                      <span className="font-mono bg-white/10 px-2 py-1 rounded">{mutationRate}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      value={mutationRate} 
                      onChange={(e) => setMutationRate(Number(e.target.value))} 
                      className="w-full mt-2"
                    />
                  </div>

                  <div className="setting-slider">
                    <label className="flex justify-between items-center">
                      <span className="text-sm">Elitism</span>
                      <span className="font-mono bg-white/10 px-2 py-1 rounded">{elitism}</span>
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max={Math.floor(batchSize * 0.5)} 
                      value={Math.min(elitism, Math.floor(batchSize * 0.5))} 
                      onChange={(e) => setElitism(Number(e.target.value))} 
                      className="w-full mt-2"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => startTraining()} 
                  className="bg-green-500 hover:bg-green-400 text-white w-full py-4 text-lg rounded-2xl border-b-[6px] border-green-700 active:border-b-0 active:translate-y-[6px] flex items-center justify-center font-black tracking-widest transition-all shadow-[0_6px_15px_rgba(0,0,0,0.3)] active:shadow-none mt-2"
                  style={{WebkitTextStroke: "1px #14532d", textShadow: "2px 2px 0 #14532d"}}
                >
                  <Play size={24} strokeWidth={2.5} className="mr-2" /> START TRAINING
                </button>
              </div>
            )}

              <h3 className="text-xl font-black mt-4 pb-2 border-b-[4px] border-[#c3b97b] text-[#553811] tracking-widest">SAVED MODELS</h3>
              <div className="flex flex-col gap-2">
                {bots.length === 0 && <p className="text-[#8b7b4b] text-xs font-bold uppercase">No saved bots yet.</p>}
                {bots.map(b => (
                  <div key={b.id} className="bg-[#c3b97b] p-4 rounded-xl flex justify-between items-center border-[4px] border-[#928641] transition-colors group">
                     <div className="flex flex-col">
                       <span className="font-black text-[#14532d] text-lg">Score: {b.score}</span>
                       <span className="text-[10px] font-bold text-[#6a5f25] tracking-widest uppercase mb-1">Generation {b.generation}</span>
                       {b.createdAt && <span className="text-[10px] text-[#8b7b4b] font-bold">{new Date(b.createdAt.seconds ? b.createdAt.seconds * 1000 : b.createdAt).toLocaleString()}</span>}
                     </div>
                     <div className="flex flex-col sm:flex-row gap-2">
                       {botToDelete === b.id ? (
                         <div className="flex items-center gap-2">
                           <button 
                             onClick={() => deleteBot(b.id)}
                             className="bg-red-500 hover:bg-red-400 text-white px-3 py-2 rounded-lg text-xs font-black tracking-widest border-b-[4px] border-red-700 active:border-b-0 active:translate-y-[4px] transition-all"
                           >
                             DELETE
                           </button>
                           <button 
                             onClick={() => setBotToDelete(null)}
                             className="bg-[#8b7b4b] hover:bg-[#a1905c] text-white px-3 py-2 rounded-lg text-xs font-black tracking-widest border-b-[4px] border-[#554b2d] active:border-b-0 active:translate-y-[4px] transition-all"
                           >
                             CANCEL
                           </button>
                         </div>
                       ) : (
                         <>
                           <button 
                             onClick={() => {
                               useGameStore.getState().setLoadedBrain(b.weights);
                               useGameStore.getState().setAutoPlay(true);
                               useGameStore.getState().setScreen('playing');
                             }}
                             className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-lg text-xs font-black tracking-widest border-b-[4px] border-blue-700 active:border-b-0 active:translate-y-[4px] transition-all flex items-center gap-1 shadow-md"
                           >
                             <Play size={16} strokeWidth={3} /> WATCH
                           </button>
                           <button 
                             onClick={() => setBotToDelete(b.id)}
                             className="bg-red-500 hover:bg-red-400 text-white px-3 py-2 rounded-lg text-xs font-black tracking-widest border-b-[4px] border-red-700 active:border-b-0 active:translate-y-[4px] transition-all flex items-center justify-center opacity-70 group-hover:opacity-100"
                             title="Delete this model"
                           >
                             <Trash2 size={16} strokeWidth={3} />
                           </button>
                         </>
                       )}
                     </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
