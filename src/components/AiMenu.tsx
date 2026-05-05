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

  const startTraining = (count: number = 100) => {
    setTraining(true);
    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.currentBatchSize = count;
        engineRef.current.start();
      }
    }, 100);
  };

  const stopTraining = () => {
    engineRef.current?.stop();
    setTraining(false);
  };

  const saveBest = async () => {
    if (!user || !bestBrainRef.current) return;
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
          weights: bestBrainRef.current.serialize(),
          score: allTimeBestScore > 0 ? allTimeBestScore : maxScore,
          generation: allTimeBestGen || engineRef.current?.generation || 1,
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
    <div className="absolute inset-0 z-50 bg-neutral-900 bg-opacity-95 text-white flex flex-col items-center justify-start p-6 overflow-y-auto w-full h-full">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full font-bold shadow-lg transition-all animate-in slide-in-from-top-4 fade-in duration-300 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
          {toast.msg}
        </div>
      )}
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('menu')} className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="text-cyan-400" /> AI Laboratory
          </h2>
        </div>

        {!user ? (
          <div className="bg-neutral-800 p-6 rounded-xl flex flex-col gap-4 text-center">
            <p className="text-neutral-400">Sign in to train and save genetic models in the cloud.</p>
            <button onClick={login} className="bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl flex items-center justify-center gap-2">
              <LogIn size={20} /> Sign in with Google
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-neutral-800 p-4 rounded-xl">
              <div className="text-sm">
                <p className="text-neutral-400">Logged in as:</p>
                <p className="font-bold">{user.displayName || user.email}</p>
              </div>
              <button onClick={() => signOut(auth)} className="text-xs text-red-400 hover:underline">Sign out</button>
            </div>

            {training ? (
              <div className="flex flex-col gap-4 relative">
                 <div className="aspect-[4/7] w-full max-h-[60vh] mx-auto bg-black rounded-xl overflow-hidden relative border border-cyan-800/50">
                    <canvas ref={trainingCanvasRef} width={400} height={700} className="w-full h-full object-contain" />
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                       <div className="flex gap-2">
                         <span className="bg-black/50 px-2 py-1 rounded text-xs">Gen: {generation}</span>
                         <span className="bg-black/50 px-2 py-1 rounded text-xs">Score: {maxScore}</span>
                         <span className="bg-black/50 px-2 py-1 rounded text-xs">Alive: {alive}</span>
                       </div>
                       {allTimeBestScore > 0 && (
                         <div className="flex gap-2 text-cyan-300">
                           <span className="bg-black/50 px-2 py-1 rounded text-[10px] font-bold border border-cyan-900/50">
                             Best: {allTimeBestScore} (from Gen {allTimeBestGen})
                           </span>
                         </div>
                       )}
                    </div>
                 </div>
                 <div className="flex gap-2">
                   <button onClick={stopTraining} className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold">Stop</button>
                   <button onClick={saveBest} className="flex-1 bg-cyan-600 hover:bg-cyan-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                     <Save size={18} /> Save Best
                   </button>
                 </div>
              </div>
            ) : (
              <button onClick={() => startTraining(1000)} className="w-full bg-cyan-600 hover:bg-cyan-500 py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[0_4px_0_#155e75] active:translate-y-1 active:shadow-none transition-all">
                <Play size={20} /> START TRAINING (1k BIRDS)
              </button>
            )}

             <h3 className="text-xl font-bold mt-4 border-b border-neutral-700 pb-2">Saved Models</h3>
             <div className="flex flex-col gap-2">
               {bots.length === 0 && <p className="text-neutral-500 text-sm">No saved bots yet.</p>}
               {bots.map(b => (
                 <div key={b.id} className="bg-neutral-800 p-4 rounded-xl flex justify-between items-center border border-neutral-700/50 hover:border-cyan-800/50 transition-colors group">
                    <div className="flex flex-col">
                      <span className="font-bold text-cyan-400 text-lg">Score: {b.score}</span>
                      <span className="text-xs text-neutral-400">Generation {b.generation}</span>
                      {b.createdAt && <span className="text-[10px] text-neutral-500 mt-1">{new Date(b.createdAt.seconds ? b.createdAt.seconds * 1000 : b.createdAt).toLocaleString()}</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {botToDelete === b.id ? (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => deleteBot(b.id)}
                            className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Confirm Delete
                          </button>
                          <button 
                            onClick={() => setBotToDelete(null)}
                            className="bg-neutral-600 hover:bg-neutral-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Cancel
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
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1 shadow-md"
                          >
                            <Play size={14} /> WATCH
                          </button>
                          <button 
                            onClick={() => setBotToDelete(b.id)}
                            className="bg-neutral-700 hover:bg-red-500 hover:text-white text-neutral-300 px-3 py-2 rounded-lg transition-colors flex items-center justify-center opacity-70 group-hover:opacity-100"
                            title="Delete this model"
                          >
                            <Trash2 size={16} />
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
  );
}
