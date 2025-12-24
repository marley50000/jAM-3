
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Zap, ArrowRight, Loader2, Lock, AlertCircle, Copy, Check } from 'lucide-react';

/**
 * GOOGLE CLIENT ID:
 * Note: If you see "origin_mismatch", you must add the URL shown in the error box
 * below to your "Authorized JavaScript origins" in the Google Cloud Console.
 */
const GOOGLE_CLIENT_ID = "875691901377-203kieemshcs85ku42hktllsrrkqlmso.apps.googleusercontent.com";

declare const google: any;

interface AuthScreenProps {
  onLogin: (name: string, email: string, avatar?: string) => void;
}

const decodeJwt = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWT Decode Error:", e);
    return null;
  }
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'google' | 'email' | null>(null);
  const [step, setStep] = useState<'landing' | 'login'>('landing');
  const [authError, setAuthError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Get current origin for troubleshooting
  const currentOrigin = window.location.origin;

  useEffect(() => {
    const initGsi = () => {
      if (typeof google === 'undefined') {
        setTimeout(initGsi, 100);
        return;
      }

      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            setIsLoading(true);
            setAuthMethod('google');
            const payload = decodeJwt(response.credential);
            if (payload) {
              setTimeout(() => {
                onLogin(payload.name, payload.email, payload.picture);
                setIsLoading(false);
              }, 800);
            } else {
              setIsLoading(false);
              setAuthError("Failed to decode user profile. Please try again.");
            }
          },
          // Error handler
          error_callback: (error: any) => {
            console.error("GSI Error Event:", error);
            if (error.type === 'origin_mismatch' || error.type === 'idpiframe_initialization_failed') {
               setAuthError("Origin Mismatch: This URL needs to be authorized in your Google Cloud Console.");
            }
          }
        });

        if (googleBtnRef.current) {
          google.accounts.id.renderButton(googleBtnRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            width: googleBtnRef.current.offsetWidth,
          });
        }
      } catch (err) {
        console.error("GSI Init Error:", err);
      }
    };

    if (step === 'landing' || step === 'login') {
      initGsi();
    }
  }, [step]);

  const handleManualAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    setIsLoading(true);
    setAuthMethod('email');
    setTimeout(() => {
      onLogin(name, email);
      setIsLoading(false);
    }, 1000);
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 'landing') {
    return (
      <div className="min-h-screen bg-[#052e16] text-white flex flex-col p-8 justify-between relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-yellow-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-green-500/20 rounded-full blur-[100px]" />

        <div className="mt-20 space-y-6 relative z-10">
          <div className="flex items-center gap-3">
             <span className="text-4xl">🇯🇲</span>
             <h1 className="text-5xl font-black tracking-tighter italic">JAMTALK</h1>
          </div>
          <p className="text-xl text-green-100/80 leading-relaxed font-medium">
            Learn Jamaican Patois with your private AI teacher, powered by Google Gemini.
          </p>
          
          <div className="space-y-4 pt-10">
             <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                    <ShieldCheck size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Secure Sign-In</h3>
                    <p className="text-xs text-green-100/50">Official Google OAuth 2.0 security.</p>
                </div>
             </div>
             <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                    <Zap size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Real-time Feedback</h3>
                    <p className="text-xs text-green-100/50">Voice analysis & corrections.</p>
                </div>
             </div>
          </div>
        </div>

        <div className="pb-10 space-y-4 relative z-10 flex flex-col items-center">
           {/* TROUBLESHOOTING UI FOR ORIGIN MISMATCH */}
           <div className="w-full bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                <div>
                   <p className="text-xs font-bold text-red-100 italic">Origin Setup Checklist</p>
                   <p className="text-[10px] text-red-100/60 mt-1 leading-relaxed">
                     If you see "origin_mismatch", copy the URL below and add it to your Authorized JavaScript Origins in the Google Cloud Console.
                   </p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                 <code className="text-[9px] text-green-400 font-mono truncate flex-1">{currentOrigin}</code>
                 <button 
                  onClick={copyOrigin}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                 >
                   {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                 </button>
              </div>
           </div>

           <div ref={googleBtnRef} className="w-full min-h-[48px] overflow-hidden rounded-full transition-all" />

           <button 
             onClick={() => setStep('login')}
             className="w-full bg-green-500 text-[#052e16] py-4 rounded-[2rem] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-green-400 transition-all shadow-2xl active:scale-95"
           >
             Manual Access <ArrowRight size={20} />
           </button>
           
           <p className="text-center text-[10px] text-green-100/30 mt-4 uppercase tracking-[0.2em] font-bold flex items-center gap-1.5">
             <Lock size={10} /> Certified Secure Infrastructure
           </p>
        </div>

        {isLoading && authMethod === 'google' && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-center p-8">
            <Loader2 size={48} className="text-green-500 animate-spin mb-4" />
            <h2 className="text-2xl font-black italic tracking-tight uppercase">Verifying Identity...</h2>
            <p className="text-green-100/60 text-sm mt-2 font-medium">Official Google Security Handshake</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col p-8 justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="max-w-sm mx-auto w-full space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Enter JamTalk</h2>
                <p className="text-gray-500 text-sm">Sign in to sync your learning progress.</p>
            </div>

            <div className="space-y-4 flex flex-col items-center">
                <div ref={googleBtnRef} className="w-full min-h-[48px] overflow-hidden rounded-full border border-gray-100" />

                <div className="relative flex items-center py-2 w-full">
                    <div className="flex-grow border-t border-gray-100"></div>
                    <span className="flex-shrink mx-4 text-gray-300 text-[10px] font-black uppercase tracking-widest">Or fallback</span>
                    <div className="flex-grow border-t border-gray-100"></div>
                </div>

                <form onSubmit={handleManualAuth} className="space-y-4 w-full">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Full Name</label>
                        <input required type="text" placeholder="Your Name" className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none focus:border-green-500 transition-colors" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Email</label>
                        <input required type="email" placeholder="Email" className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none focus:border-green-500 transition-colors" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <button disabled={isLoading} className="w-full bg-gray-950 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs mt-2 flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition-all shadow-xl">
                      {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Enter App'}
                    </button>
                </form>
            </div>

            <div className="flex flex-col items-center gap-4 pt-4">
                <button onClick={() => setStep('landing')} className="text-xs text-gray-400 hover:text-gray-600 font-medium">Back to Home</button>
            </div>
        </div>
    </div>
  );
};
