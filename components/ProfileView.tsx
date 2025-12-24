
import React, { useRef, useState, useEffect } from 'react';
import { User as UserType } from '../types';
import { storage } from '../services/storage';
import { telemetry } from '../services/telemetry';
import { 
  Award, Star, Flame, LogOut, ShieldCheck, Lock, Trash2, Download, Upload, 
  RefreshCw, Check, AlertTriangle, Cloud, HardDrive, KeyRound, Eye, EyeOff,
  LineChart, Users
} from 'lucide-react';

interface ProfileViewProps {
  user: UserType;
  completedLessonsCount: number;
  totalLessons: number;
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, completedLessonsCount, totalLessons, onLogout }) => {
  const [isPersistent, setIsPersistent] = useState<boolean | null>(null);
  const [hasVault, setHasVault] = useState(false);
  const [isTelemetryEnabled, setIsTelemetryEnabled] = useState(telemetry.getEnablement());
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressPercent = Math.round((completedLessonsCount / totalLessons) * 100);

  useEffect(() => {
    const checkStatus = async () => {
      if (navigator.storage && navigator.storage.persisted) {
        navigator.storage.persisted().then(setIsPersistent);
      }
      const vaultMeta = await storage.getItem('vault_meta', 'config');
      setHasVault(!!vaultMeta);
    };
    checkStatus();
  }, []);

  const handleTelemetryToggle = (val: boolean) => {
    setIsTelemetryEnabled(val);
    telemetry.setEnablement(val);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto pb-24">
      <div className="bg-white p-8 border-b border-gray-100 flex flex-col items-center text-center">
        <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-yellow-400 p-1">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-3xl font-black text-green-600 border-4 border-white shadow-inner overflow-hidden">
                    {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-md border border-gray-50 text-yellow-500"><Star size={16} fill="currentColor" /></div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">{user.name}</h2>
        <div className="flex gap-3 mt-4">
            <div className="bg-green-50 px-4 py-1.5 rounded-full border border-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Award size={14} /> Patois Novice</div>
            <div className="bg-yellow-50 px-4 py-1.5 rounded-full border border-yellow-100 text-yellow-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Flame size={14} /> {user.xp} XP</div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
        
        {/* Growth & Feedback Section (For Developer Insights) */}
        <div className="space-y-3">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Community & Growth</h3>
             <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                        <Users size={24} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Help Improve JamTalk</h4>
                        <p className="text-[10px] text-gray-500 font-medium">Share anonymized learning patterns with the developer.</p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <LineChart size={18} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-700">Anonymized Insights</span>
                    </div>
                    <button 
                        onClick={() => handleTelemetryToggle(!isTelemetryEnabled)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${isTelemetryEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isTelemetryEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>
                <p className="mt-3 text-[9px] text-gray-400 italic px-2">
                    *By enabling this, you help the developer see which phrases are hard to learn. No private data or PINs are ever shared.
                </p>
             </div>
        </div>

        {/* Security Vault Section */}
        <div className="space-y-3">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Security Vault</h3>
             <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl ${hasVault ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {hasVault ? <Lock size={24} /> : <ShieldCheck size={24} />}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${hasVault ? 'bg-green-100 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    {hasVault ? 'AES-GCM 256' : 'Standard'}
                    </div>
                </div>
                <h4 className="text-lg font-black text-gray-900 mb-1">Privacy Encryption</h4>
                <p className="text-xs text-gray-500 mb-2 font-medium">
                    {hasVault ? "Your data is locked with your PIN." : "Basic local storage active."}
                </p>
             </div>
        </div>

        {/* Database Stats */}
        <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${isPersistent ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}><HardDrive size={18} /></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Durability</span>
                <span className="text-xs font-bold text-gray-700">{isPersistent ? 'Persistent' : 'Best Effort'}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2"><KeyRound size={18} /></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sync</span>
                <span className="text-xs font-bold text-gray-700">Offline Only</span>
            </div>
        </div>

        <button onClick={onLogout} className="w-full bg-gray-50 border border-gray-200 py-4 rounded-2xl flex items-center justify-center gap-2 text-gray-400 font-bold text-sm hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"><LogOut size={18} /> Sign Out</button>
      </div>
    </div>
  );
};
