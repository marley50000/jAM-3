
import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { LessonsView } from './components/LessonsView';
import { ChatInterface } from './components/ChatInterface';
import { LiveSession } from './components/LiveSession';
import { TranslatorView } from './components/TranslatorView';
import { MusicLyricsView } from './components/MusicLyricsView';
import { PronunciationCoachView } from './components/PronunciationCoachView';
import { ProfileView } from './components/ProfileView';
import { AuthScreen } from './components/AuthScreen';
import { AppMode, Lesson, User } from './types';
import { Settings, X, Volume2, Check, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { AVAILABLE_VOICES, INITIAL_LESSONS } from './constants';
import { storage } from './services/storage';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [vaultState, setVaultState] = useState<'locked' | 'unlocked' | 'none'>('none');
  const [vaultPIN, setVaultPIN] = useState('');
  const [vaultError, setVaultError] = useState(false);
  
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.LESSONS);
  const [liveContext, setLiveContext] = useState<string | undefined>(undefined);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Check for Vault status on boot
  useEffect(() => {
    const checkVault = async () => {
      const vaultMeta = await storage.getItem<{ salt: string }>('vault_meta', 'config');
      if (vaultMeta) {
        setVaultState('locked');
      } else {
        setVaultState('none');
        loadAppData();
      }
    };
    checkVault();
  }, []);

  const loadAppData = async () => {
    try {
      const [savedUser, savedLessons, savedVoice] = await Promise.all([
        storage.getItem<User>('profile', 'user_session'),
        storage.getItem<string[]>('lessons', 'completed_list'),
        storage.getItem<string>('settings', 'voice_preference')
      ]);

      if (savedUser) setUser({ ...savedUser, joinedAt: new Date(savedUser.joinedAt) });
      if (savedLessons) setCompletedLessons(savedLessons);
      if (savedVoice) setSelectedVoice(savedVoice);
    } catch (e) {
      console.error("Load failed", e);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleUnlockVault = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setVaultError(false);
    const vaultMeta = await storage.getItem<{ salt: string }>('vault_meta', 'config');
    if (!vaultMeta) return;

    try {
      await storage.unlockVault(vaultPIN, vaultMeta.salt);
      setVaultState('unlocked');
      loadAppData();
    } catch (err) {
      setVaultError(true);
      setVaultPIN('');
    }
  };

  useEffect(() => { if (user) storage.setItem('profile', 'user_session', user); }, [user]);
  useEffect(() => { storage.setItem('lessons', 'completed_list', completedLessons); }, [completedLessons]);
  useEffect(() => { storage.setItem('settings', 'voice_preference', selectedVoice); }, [selectedVoice]);

  const handleLogin = (name: string, email: string, avatar?: string) => {
    const newUser: User = { id: Math.random().toString(36).substr(2, 9), name, email, avatar, joinedAt: new Date(), xp: 0 };
    setUser(newUser);
  };

  const handleLogout = async () => {
    if (confirm('Logout?')) {
      await storage.removeItem('profile', 'user_session');
      storage.lockVault();
      setUser(null);
      window.location.reload();
    }
  };

  if (vaultState === 'locked') {
    return (
      <div className="min-h-screen bg-[#052e16] flex flex-col items-center justify-center p-8 text-white">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 border border-green-500/30">
          <Lock className="text-green-400" size={32} />
        </div>
        <h2 className="text-2xl font-black italic tracking-tighter mb-2 uppercase">JamTalk Vault</h2>
        <p className="text-sm text-green-100/50 mb-8 text-center max-w-xs">Your data is encrypted. Enter your Security PIN to continue.</p>
        
        <form onSubmit={handleUnlockVault} className="w-full max-w-xs space-y-4">
          <input 
            type="password" 
            placeholder="Enter PIN" 
            autoFocus
            className={`w-full bg-white/5 border ${vaultError ? 'border-red-500' : 'border-white/10'} rounded-2xl px-6 py-4 text-center text-2xl tracking-[1em] outline-none focus:border-green-500 transition-all`}
            value={vaultPIN}
            onChange={(e) => setVaultPIN(e.target.value)}
          />
          {vaultError && <p className="text-red-400 text-[10px] font-bold text-center uppercase tracking-widest">Incorrect PIN. Try again.</p>}
          <button className="w-full bg-green-500 text-[#052e16] py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-green-400 active:scale-95 transition-all">
            Unlock Records
          </button>
        </form>
      </div>
    );
  }

  if (isInitializing && vaultState !== 'locked') {
    return (
      <div className="min-h-screen bg-[#052e16] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-green-500 mb-4" size={48} />
        <h1 className="text-xl font-bold italic tracking-tighter animate-pulse uppercase">Syncing JamTalk...</h1>
      </div>
    );
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🇯🇲</span>
            <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 to-yellow-500 bg-clip-text text-transparent italic">JamTalk</h1>
          </div>
          <div className="flex items-center gap-2">
             <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-blue-100 flex items-center gap-1.5">
                <ShieldCheck size={12} /> {storage.isLocked() ? 'Standard' : 'Vault Active'}
             </div>
             <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                <Settings size={20} />
             </button>
          </div>
        </div>
      </header>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm relative overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800">Voice Settings</h3>
                    <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    {AVAILABLE_VOICES.map((voice) => (
                        <button key={voice.id} onClick={() => setSelectedVoice(voice.id)} className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${selectedVoice === voice.id ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedVoice === voice.id ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-400'}`}><Volume2 size={18} /></div>
                                <div className="text-left"><div className="font-bold">{voice.name}</div><span className="text-[10px] uppercase font-black opacity-40">{voice.gender}</span></div>
                            </div>
                            {selectedVoice === voice.id && <Check size={20} className="text-green-600" />}
                        </button>
                    ))}
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-full py-4 text-green-600 font-bold bg-gray-50 border-t border-gray-100">Done</button>
            </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden relative">
        {currentMode === AppMode.LESSONS && <LessonsView onStartLesson={(l) => { setLiveContext(`Practice: ${l.title}`); setActiveLessonId(l.id); setCurrentMode(AppMode.LIVE); }} completedLessonIds={completedLessons} />}
        {currentMode === AppMode.CHAT && <ChatInterface selectedVoice={selectedVoice} onOpenSettings={() => setIsSettingsOpen(true)} />}
        {currentMode === AppMode.LIVE && <LiveSession initialContext={liveContext} canMarkComplete={!!activeLessonId} onComplete={() => { if (activeLessonId) setCompletedLessons(p => [...p, activeLessonId]); setCurrentMode(AppMode.LESSONS); }} onExit={() => setCurrentMode(AppMode.LESSONS)} selectedVoice={selectedVoice} onOpenSettings={() => setIsSettingsOpen(true)} />}
        {currentMode === AppMode.COACH && <PronunciationCoachView selectedVoice={selectedVoice} onOpenSettings={() => setIsSettingsOpen(true)} />}
        {currentMode === AppMode.TRANSLATE && <TranslatorView selectedVoice={selectedVoice} onOpenSettings={() => setIsSettingsOpen(true)} />}
        {currentMode === AppMode.MUSIC && <MusicLyricsView />}
        {currentMode === AppMode.PROFILE && <ProfileView user={user} completedLessonsCount={completedLessons.length} totalLessons={INITIAL_LESSONS.length} onLogout={handleLogout} />}
      </main>
      <Navigation currentMode={currentMode} onChangeMode={setCurrentMode} />
    </div>
  );
}
export default App;
