
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Search, Music, Loader2, StopCircle, Disc, Info, AlertCircle, Headphones, Check, X, Volume2, Globe, ShieldCheck, Zap, Quote, Waves, Activity, Cpu } from 'lucide-react';
import { ai } from '../services/gemini';
import { Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { arrayBufferToBase64 } from '../utils/audio';

export const MusicLyricsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'listen' | 'search'>('listen');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [analysisStage, setAnalysisStage] = useState<'idle' | 'sampling' | 'decoding' | 'grounding' | 'authenticating'>('idle');
  const [detectedProfile, setDetectedProfile] = useState<{ snippet: string, signature: string } | null>(null);
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const RECORDING_LIMIT = 15;

  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= RECORDING_LIMIT) {
            stopRecording();
            return RECORDING_LIMIT;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setLyricsResult(null);
      setDetectedProfile(null);
      setAnalysisStage('idle');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false, 
          noiseSuppression: false, 
          autoGainControl: true,
        } 
      });

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateLevel = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setMicLevel(average);
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        audioCtx.close();
        if (chunksRef.current.length === 0) return;
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await deepDNAIdentification(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
      alert("JamTalk needs mic access to hear di riddim.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const deepDNAIdentification = async (audioBlob: Blob) => {
    setAnalysisStage('sampling');
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      setAnalysisStage('decoding');
      // Fix: Used 'gemini-3-flash-preview' for extraction task
      const signatureResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
            { text: `Extract detailed sonic DNA for music identification: artist tags, unique Patois lyrics, and riddim metadata.` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              signature: { type: Type.STRING, description: "Artist tags, producer names, or riddim style detected" },
              snippet: { type: Type.STRING, description: "Transcription of clearest Patois phrases" },
              query: { type: Type.STRING, description: "Optimized search query for Google Search" }
            },
            required: ['signature', 'snippet', 'query']
          }
        }
      });

      const data = JSON.parse(signatureResponse.text);
      const signature = data.signature || "Unknown Sonic DNA";
      const snippet = data.snippet || "Instrumental profile";
      const query = data.query || "Jamaican song identification";

      setDetectedProfile({ snippet, signature });
      setAnalysisStage('grounding');

      // Note: 'gemini-3-pro-preview' is correct here as it supports googleSearch and complex reasoning
      const groundedResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Pinpoint the EXACT Jamaican track:
          SONIC SIGNATURE: ${signature}
          TRANSCRIPTION SNIPPET: "${snippet}"
          HEURISTIC QUERY: ${query}
          
          Use Google Search to cross-reference. 
          Focus on exact artist version for common riddims.
          
          # 🇯🇲 MATCH FOUND: [Song] by [Artist]
          [Patois Lyrics]
          [English Meaning]
          [JamTalk Insight: Slang found in this specific riddim]`,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingBudget: 4000 }
        }
      });

      setAnalysisStage('authenticating');
      await new Promise(r => setTimeout(r, 600));
      setLyricsResult(groundedResponse.text);

    } catch (error) {
      console.error("Deep ID Error:", error);
      setLyricsResult("Bwoy, di digital signal drop! Make sure di music loud and try record again.");
    } finally {
      setAnalysisStage('idle');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setAnalysisStage('grounding');
    setLyricsResult(null);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Provide official Jamaican Patois lyrics, English meaning, and context for: "${searchQuery}". Use Google Search.`,
        config: { tools: [{ googleSearch: {} }] }
      });
      setLyricsResult(response.text);
    } catch (error) {
      setLyricsResult("Cho! JamTalk couldn't find dem records. Try search for di artist directly.");
    } finally {
      setAnalysisStage('idle');
    }
  };

  const progress = (recordingTime / RECORDING_LIMIT) * 100;

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white max-w-2xl mx-auto pb-24 min-h-screen">
      <div className="p-8 pb-4">
        <div className="flex items-center justify-between mb-1">
            <h2 className="text-3xl font-black bg-gradient-to-r from-yellow-400 via-green-500 to-yellow-400 bg-clip-text text-transparent italic tracking-tighter uppercase">
                Sonic DNA
            </h2>
            <div className="w-10 h-10 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center">
                <Headphones size={20} className="text-green-500" />
            </div>
        </div>
        <div className="flex items-center gap-2">
            <div className="h-1 flex-1 bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 w-1/4 animate-pulse"></div>
            </div>
            <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.5em]">Deep Scan Mode v4</p>
        </div>
      </div>

      <div className="flex px-8 border-b border-gray-900/40">
        <button
          onClick={() => { setActiveTab('listen'); setLyricsResult(null); setDetectedProfile(null); }}
          className={`flex-1 pb-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${
            activeTab === 'listen' ? 'text-yellow-400' : 'text-gray-600'
          }`}
        >
          Auto Detect
          {activeTab === 'listen' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 shadow-[0_0_12px_#facc15]" />}
        </button>
        <button
          onClick={() => { setActiveTab('search'); setLyricsResult(null); setDetectedProfile(null); }}
          className={`flex-1 pb-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${
            activeTab === 'search' ? 'text-green-400' : 'text-gray-600'
          }`}
        >
          Manual ID
          {activeTab === 'search' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400 shadow-[0_0_12px_#4ade80]" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
        {activeTab === 'listen' && analysisStage === 'idle' && !lyricsResult && (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-16">
            <div className="relative flex items-center justify-center">
              <div className="absolute rounded-full bg-green-500/5 blur-[90px] transition-all duration-75"
                style={{ width: isRecording ? `${260 + micLevel * 4}px` : '220px', height: isRecording ? `${260 + micLevel * 4}px` : '220px' }}
              />
              <svg className="absolute w-64 h-64 transform -rotate-90">
                <circle cx="128" cy="128" r="118" stroke="currentColor" strokeWidth="0.5" fill="transparent" className="text-gray-900" />
                <circle cx="128" cy="128" r="118" stroke="currentColor" strokeWidth="6" fill="transparent"
                  strokeDasharray={741} strokeDashoffset={741 - (741 * progress) / 100}
                  className={`transition-all duration-1000 ${isRecording ? 'text-green-500' : 'text-transparent'}`}
                  strokeLinecap="round" />
              </svg>
              <button onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-48 h-48 rounded-full flex flex-col items-center justify-center shadow-2xl z-10 transition-all active:scale-95 group ${isRecording ? 'bg-red-600 ring-[20px] ring-red-950/20' : 'bg-green-500 text-gray-950 hover:bg-green-400'}`}>
                {isRecording ? (
                  <div className="flex flex-col items-center">
                    <span className="text-6xl font-black italic tracking-tighter">{RECORDING_LIMIT - recordingTime}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Sampling</span>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-black/5 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-500">
                      <Waves size={56} strokeWidth={3} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Initialize</span>
                  </>
                )}
              </button>
            </div>
            <div className="text-center space-y-4 max-w-xs mx-auto">
              <h3 className="text-xl font-black text-white tracking-tight uppercase">Acoustic Capture</h3>
              <p className="text-gray-600 text-[10px] leading-relaxed font-bold uppercase tracking-[0.2em] opacity-80 text-center">
                JamTalk decodes riddim signatures and artist tags for precise matching.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'search' && analysisStage === 'idle' && !lyricsResult && (
          <div className="space-y-8 animate-in fade-in py-12">
            <div className="bg-gray-900/30 border border-gray-800/40 p-6 rounded-[2.5rem] flex items-start gap-4 backdrop-blur-md">
                <Search size={22} className="text-green-500 mt-1" />
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] leading-relaxed">
                    Search manually for riddims or lyrics. JamTalk cross-references global databases.
                </p>
            </div>
            <div className="relative group">
              <input type="text" placeholder="Artist, Song, or Patois snippet..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-transparent border-b-2 border-gray-800 px-2 py-8 text-2xl font-bold text-white outline-none focus:border-green-500 transition-all placeholder:text-gray-800" />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 group-focus-within:text-green-500 transition-colors">
                <Search size={32} />
              </div>
            </div>
            <button onClick={handleSearch} disabled={!searchQuery.trim()}
              className="w-full bg-green-600 py-7 rounded-[2rem] font-black uppercase tracking-[0.4em] text-[11px] shadow-2xl shadow-green-950/20 hover:bg-green-500 transition-all active:scale-95 disabled:opacity-50">
              Authenticate Track
            </button>
          </div>
        )}

        {analysisStage !== 'idle' && (
           <div className="flex flex-col items-center justify-center py-20 space-y-14 animate-in fade-in">
             <div className="relative">
                <div className="absolute inset-0 bg-green-500/10 blur-[130px] animate-pulse" />
                <div className="relative z-10 p-4 border border-gray-800 rounded-full bg-black/40 backdrop-blur-sm">
                   <Disc size={160} className="text-green-500 animate-[spin_5s_linear_infinite]" />
                   <div className="absolute inset-0 m-auto w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-3xl">
                      <Cpu size={24} className="text-green-600 animate-pulse" />
                   </div>
                </div>
                <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-yellow-400 rounded-full shadow-[0_0_20px_#facc15]" />
                </div>
             </div>
             <div className="text-center space-y-10 w-full max-w-sm">
                <div className="flex flex-col items-center gap-4">
                   <div className="flex items-center gap-3 text-green-400 text-[10px] font-black uppercase tracking-[0.5em] bg-gray-900/50 border border-gray-800 px-6 py-2.5 rounded-full">
                      {analysisStage === 'sampling' && 'Stage 1: Sample Extraction'}
                      {analysisStage === 'decoding' && 'Stage 2: DNA Decoding'}
                      {analysisStage === 'grounding' && 'Stage 3: Global Grounding'}
                      {analysisStage === 'authenticating' && 'Stage 4: Authenticating'}
                   </div>
                   <p className="text-4xl font-black text-white italic tracking-tighter uppercase">
                      {analysisStage === 'sampling' && 'Sampling...'}
                      {analysisStage === 'decoding' && 'Extracting DNA...'}
                      {analysisStage === 'grounding' && 'Matching Records...'}
                      {analysisStage === 'authenticating' && 'Finalizing...'}
                   </p>
                </div>
                {detectedProfile && (
                  <div className="bg-gray-900/40 p-6 rounded-[2.5rem] border border-gray-800 text-left animate-in fade-in slide-in-from-top-6 duration-700">
                      <div className="flex items-center gap-2 text-[9px] font-black text-green-500 uppercase tracking-[0.4em] mb-3">
                          <Activity size={12} /> Fingerprint
                      </div>
                      <p className="text-sm text-gray-200 font-black italic mb-2">"{detectedProfile.snippet}"</p>
                      <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{detectedProfile.signature}</p>
                  </div>
                )}
                <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                   <div className={`h-full bg-green-500 transition-all duration-[2000ms] ease-out ${
                     analysisStage === 'sampling' ? 'w-1/4' : 
                     analysisStage === 'decoding' ? 'w-2/4' : 
                     analysisStage === 'grounding' ? 'w-3/4' : 'w-full'}`} />
                </div>
             </div>
           </div>
        )}

        {lyricsResult && analysisStage === 'idle' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-12 duration-1000">
             <div className={`flex items-center gap-6 rounded-[3rem] p-8 shadow-3xl border transition-all ${lyricsResult.includes("MATCH FOUND") ? 'bg-green-950/10 border-green-800/40' : 'bg-yellow-950/10 border-yellow-800/40'}`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl flex-shrink-0 transition-transform duration-1000 hover:rotate-[360deg] ${lyricsResult.includes("MATCH FOUND") ? 'bg-green-500 text-gray-950' : 'bg-yellow-500 text-gray-950'}`}>
                  {lyricsResult.includes("MATCH FOUND") ? <Check size={44} strokeWidth={4} /> : <Info size={44} strokeWidth={4} />}
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-600 mb-2">Verified Result</p>
                   <p className="text-3xl font-black text-white tracking-tighter italic leading-none">
                     {lyricsResult.includes("MATCH FOUND") ? 'RECORD CONFIRMED' : 'BEST MATCH'}
                   </p>
                </div>
             </div>
             <div className="bg-gray-900/20 backdrop-blur-3xl rounded-[3.5rem] p-12 border border-gray-800/40 shadow-2xl relative overflow-hidden group">
                <Music className="absolute -top-16 -right-16 text-white/5 group-hover:text-green-500/5 transition-colors duration-1000" size={320} />
                <div className="prose prose-invert prose-headings:text-yellow-400 prose-headings:font-black prose-headings:italic prose-headings:tracking-tighter prose-headings:text-3xl prose-strong:text-green-400 prose-strong:font-black prose-p:text-gray-300 prose-p:leading-relaxed prose-p:text-base max-w-none relative z-10">
                   <ReactMarkdown>{lyricsResult}</ReactMarkdown>
                </div>
             </div>
             <div className="flex gap-4">
                <button onClick={() => { setLyricsResult(null); stopRecording(); }}
                  className="flex-[3] py-8 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-black rounded-[2.5rem] transition-all shadow-xl active:scale-95 flex items-center justify-center gap-4 uppercase tracking-[0.3em] text-[12px]">
                  <RefreshCw size={22} strokeWidth={3} /> Scan Next Riddim
                </button>
                <button onClick={() => setLyricsResult(null)}
                  className="flex-1 py-8 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-500 rounded-[2.5rem] transition-all flex items-center justify-center">
                  <X size={32} />
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const RefreshCw = (props: any) => <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>;
