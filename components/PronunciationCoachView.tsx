
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Mic, Square, RefreshCw, Volume2, ChevronRight, Loader2, Award, Zap, History, Calendar, X, StopCircle } from 'lucide-react';
import { ai } from '../services/gemini';
import { telemetry } from '../services/telemetry';
import { Type, Modality } from '@google/genai';
import { base64ToUint8Array, decodeAudioData, arrayBufferToBase64 } from '../utils/audio';
import { CoachHistoryItem } from '../types';

const HISTORY_KEY = 'jamtalk_coach_history';

interface FeedbackData {
  score: number;
  phonemes: string;
  feedback: string;
  fix: string;
}

interface CoachHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: CoachHistoryItem[];
  onSelect: (item: CoachHistoryItem) => void;
  onClear: () => void;
}

const CoachHistorySidebar: React.FC<CoachHistorySidebarProps> = ({ isOpen, onClose, history, onSelect, onClear }) => {
    const groupedHistory = history.reduce((acc, item) => {
        const date = new Date(item.timestamp);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
    
        let key = 'Older';
        if (date.toDateString() === today.toDateString()) {
          key = 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
          key = 'Yesterday';
        }
    
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, CoachHistoryItem[]>);
    
    const groupOrder = ['Today', 'Yesterday', 'Older'];
    
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-50 flex">
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" 
            onClick={onClose}
          />
          <div className="relative w-3/4 max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <History size={18} /> Past Challenges
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {history.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <History size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No practice history</p>
                    </div>
                ) : (
                    groupOrder.map(group => {
                        const items = groupedHistory[group];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={group} className="space-y-2">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                                    <Calendar size={10} /> {group}
                                </h4>
                                <div className="space-y-2">
                                    {items.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(item => (
                                        <div 
                                            key={item.id}
                                            onClick={() => onSelect(item)}
                                            className="group bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:border-green-200 hover:shadow-md transition-all cursor-pointer flex justify-between items-center"
                                        >
                                            <div className="flex-1 mr-2">
                                                <h5 className="text-sm font-medium text-gray-800 line-clamp-1 mb-1">
                                                    {item.targetPhrase.patois}
                                                </h5>
                                                <div className="text-xs text-gray-500">
                                                    {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                item.score >= 80 ? 'bg-green-100 text-green-700' :
                                                item.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                                {item.score}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
            <div className="p-4 border-t border-gray-100">
                <button 
                  onClick={onClear}
                  className="w-full text-red-500 text-sm font-medium p-2 hover:bg-red-50 rounded-lg"
                >
                  Clear History
                </button>
            </div>
          </div>
        </div>
    );
};

interface PronunciationCoachViewProps {
  selectedVoice?: string;
  onOpenSettings: () => void;
}

export const PronunciationCoachView: React.FC<PronunciationCoachViewProps> = ({ selectedVoice = 'Kore', onOpenSettings }) => {
  const [targetPhrase, setTargetPhrase] = useState<{ patois: string, english: string } | null>(null);
  const [isGeneratingPhrase, setIsGeneratingPhrase] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  
  // History State
  const [history, setHistory] = useState<CoachHistoryItem[]>(() => {
      try {
          const saved = localStorage.getItem(HISTORY_KEY);
          return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Audio state
  const [nativeAudioBuffer, setNativeAudioBuffer] = useState<AudioBuffer | null>(null);
  const [userAudioBuffer, setUserAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [isPlayingUser, setIsPlayingUser] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nativeCanvasRef = useRef<HTMLCanvasElement>(null);
  const userCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nativeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const userSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Initialize Audio Context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    return () => {
      stopAllAudio();
      audioContextRef.current?.close();
    };
  }, []);

  // Persist history
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const stopAllAudio = () => {
    if (nativeSourceRef.current) {
        try { nativeSourceRef.current.stop(); } catch(e) {}
        nativeSourceRef.current = null;
    }
    if (userSourceRef.current) {
        try { userSourceRef.current.stop(); } catch(e) {}
        userSourceRef.current = null;
    }
    setIsPlayingNative(false);
    setIsPlayingUser(false);
  };

  const fetchNewPhrase = async () => {
    stopAllAudio();
    setIsGeneratingPhrase(true);
    setFeedback(null);
    setUserAudioBuffer(null);
    setNativeAudioBuffer(null);
    
    try {
      const prompt = "Generate a short, challenging Jamaican Patois phrase for pronunciation practice. Include the English meaning. Return a clean JSON object with keys: 'patois' and 'english'.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patois: { type: Type.STRING },
              english: { type: Type.STRING }
            },
            required: ['patois', 'english']
          }
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      
      const json = JSON.parse(text);
      setTargetPhrase(json);
      generateNativeAudio(json.patois);
    } catch (e) {
      console.warn("Error fetching phrase, using fallback", e);
      const fallback = {
        patois: "Wah gwaan, everything irie?",
        english: "What's up, is everything good?"
      };
      setTargetPhrase(fallback);
      generateNativeAudio(fallback.patois);
    } finally {
      setIsGeneratingPhrase(false);
    }
  };

  const generateNativeAudio = async (text: string) => {
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
            }
        }
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(
            base64ToUint8Array(base64Audio),
            ctx,
            24000
        );
        setNativeAudioBuffer(audioBuffer);
        setTimeout(() => drawWaveform(audioBuffer, nativeCanvasRef.current, '#22c55e'), 100);
      }
    } catch (e) {
      console.error("TTS generation error", e);
    }
  };

  useEffect(() => {
    if (!targetPhrase) {
        fetchNewPhrase();
    }
  }, []);

  const drawWaveform = (buffer: AudioBuffer, canvas: HTMLCanvasElement | null, color: string) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    ctx.globalAlpha = 0.2;
    ctx.fillRect(0, amp, width, 1);
    ctx.globalAlpha = 1.0;

    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
  };

  const startRecording = async () => {
    try {
      stopAllAudio();
      setFeedback(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        const arrayBuffer = await blob.arrayBuffer();
        if (audioContextRef.current) {
             const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
             setUserAudioBuffer(audioBuffer);
             drawWaveform(audioBuffer, userCanvasRef.current, '#3b82f6');
        }

        analyzePronunciation(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const analyzePronunciation = async (audioBlob: Blob) => {
    if (!targetPhrase) return;
    setIsAnalyzing(true);
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      const prompt = `Act as a strict Jamaican Patois vocal coach. Listen to this recording of the user saying: "${targetPhrase.patois}". Provide feedback on accuracy and tips for improvement. Return results in JSON format.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: "Accuracy score 0-100" },
              phonemes: { type: Type.STRING, description: "Specific phonetic issues found" },
              feedback: { type: Type.STRING, description: "General coaching feedback" },
              fix: { type: Type.STRING, description: "One specific tip to improve" }
            },
            required: ['score', 'phonemes', 'feedback', 'fix']
          }
        }
      });

      let text = response.text || '{}';
      const feedbackData = JSON.parse(text) as FeedbackData;
      setFeedback(feedbackData);

      // TELEMETRY: Log the score for developer insight
      telemetry.logEvent({
          type: 'pronunciation_score',
          payload: { 
              phrase: targetPhrase.patois,
              score: feedbackData.score,
              fix: feedbackData.fix
          },
          timestamp: Date.now()
      });

      const historyItem: CoachHistoryItem = {
          id: Date.now().toString(),
          targetPhrase: targetPhrase,
          score: feedbackData.score,
          feedback: feedbackData,
          timestamp: new Date()
      };
      setHistory(prev => [historyItem, ...prev]);

    } catch (e) {
      console.error("Analysis error", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playNativeAudio = () => {
    if (!nativeAudioBuffer || !audioContextRef.current) return;
    stopAllAudio();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = nativeAudioBuffer;
    source.connect(ctx.destination);
    source.onended = () => { setIsPlayingNative(false); nativeSourceRef.current = null; };
    nativeSourceRef.current = source;
    source.start();
    setIsPlayingNative(true);
  };

  const playUserAudio = () => {
    if (!userAudioBuffer || !audioContextRef.current) return;
    stopAllAudio();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = userAudioBuffer;
    source.connect(ctx.destination);
    source.onended = () => { setIsPlayingUser(false); userSourceRef.current = null; };
    userSourceRef.current = source;
    source.start();
    setIsPlayingUser(true);
  };

  const loadHistoryItem = (item: CoachHistoryItem) => {
      stopAllAudio();
      setTargetPhrase(item.targetPhrase);
      setFeedback(item.feedback);
      setNativeAudioBuffer(null);
      setUserAudioBuffer(null);
      generateNativeAudio(item.targetPhrase.patois);
      setIsHistoryOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 max-w-2xl mx-auto pb-24 relative overflow-hidden">
      <div className="p-6 bg-white shadow-sm flex items-center justify-between">
         <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="text-green-600" /> Pronunciation Coach
            </h2>
            <p className="text-sm text-gray-500">Master your Patois accent</p>
         </div>
         
         <div className="flex gap-2">
             <button onClick={onOpenSettings} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100" title="Change Voice"><Volume2 size={12} /> {selectedVoice}</button>
             <button onClick={() => setIsHistoryOpen(true)} className="p-2 rounded-full text-gray-600 hover:bg-gray-100" title="History"><History size={20} /></button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-green-500 relative overflow-hidden">
           {isGeneratingPhrase ? (
               <div className="flex flex-col items-center py-8 gap-3">
                   <Loader2 className="animate-spin text-green-600" size={32} />
                   <span className="text-sm text-gray-500 font-bold uppercase tracking-widest">Generating Challenge...</span>
               </div>
           ) : (
               <>
                 <div className="flex justify-between items-start mb-4">
                    <span className="bg-green-100 text-green-800 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest">Active Challenge</span>
                    <button onClick={fetchNewPhrase} className="text-gray-400 hover:text-green-600 transition-colors"><RefreshCw size={18} /></button>
                 </div>
                 
                 <h3 className="text-2xl font-black text-gray-900 mb-2 leading-tight italic tracking-tight">{targetPhrase?.patois}</h3>
                 <p className="text-gray-500 italic mb-6">"{targetPhrase?.english}"</p>

                 <div className="space-y-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 relative">
                        <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-black text-green-600 flex items-center gap-1 uppercase tracking-widest"><Award size={12} /> Target Accent</span>
                             <button onClick={playNativeAudio} disabled={!nativeAudioBuffer} className={`p-2 rounded-full shadow-sm transition-all disabled:opacity-50 ${isPlayingNative ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-green-600 hover:scale-110 shadow-lg'}`}>{isPlayingNative ? <StopCircle size={16} /> : <Volume2 size={16} />}</button>
                        </div>
                        <canvas ref={nativeCanvasRef} width={300} height={60} className="w-full h-16 rounded opacity-80" />
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 relative">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-blue-600 flex items-center gap-1 uppercase tracking-widest"><Mic size={12} /> Your Recording</span>
                            <button onClick={playUserAudio} disabled={!userAudioBuffer} className={`p-2 rounded-full shadow-sm transition-all disabled:opacity-50 ${isPlayingUser ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-blue-600 hover:scale-110 shadow-lg'}`}>{isPlayingUser ? <StopCircle size={16} /> : <Volume2 size={16} />}</button>
                        </div>
                        <canvas ref={userCanvasRef} width={300} height={60} className="w-full h-16 rounded opacity-80" />
                    </div>
                 </div>

                 <div className="flex justify-center">
                    <button onClick={isRecording ? stopRecording : startRecording} disabled={isAnalyzing} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all transform active:scale-90 ${isRecording ? 'bg-red-500 ring-8 ring-red-100 animate-pulse' : 'bg-gray-950 hover:bg-gray-800'}`}>
                        {isRecording ? <Square size={32} className="text-white fill-current" /> : <Mic size={32} className="text-white" />}
                    </button>
                 </div>
               </>
           )}
        </div>

        {isAnalyzing && (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center border border-gray-100 animate-in fade-in">
                <Loader2 size={40} className="animate-spin text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-black text-gray-800 italic uppercase">Sonic Analysis...</h3>
            </div>
        )}

        {feedback && !isAnalyzing && (
            <div className="bg-white rounded-2xl shadow-xl p-6 border-t-4 border-green-500 animate-in slide-in-from-bottom-6 duration-500">
                <div className="flex items-center justify-between mb-8">
                    <div><h3 className="text-xl font-black text-gray-900 italic tracking-tight">Coach's Verdict</h3></div>
                    <div className={`relative w-20 h-20 flex items-center justify-center rounded-full border-[6px] font-black text-2xl shadow-inner ${feedback.score >= 80 ? 'border-green-500 text-green-600' : feedback.score >= 60 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600'}`}>{feedback.score}</div>
                </div>
                <div className="space-y-6">
                    <div className="bg-green-50/50 rounded-2xl p-5 border border-green-100/50">
                        <h4 className="text-[10px] font-black text-green-600 mb-2 uppercase tracking-widest">Phonetic Issues</h4>
                        <p className="text-sm text-gray-700 font-bold">"{feedback.phonemes}"</p>
                    </div>
                    <div className="bg-yellow-50/50 rounded-2xl p-5 border border-yellow-100/50">
                         <h4 className="text-[10px] font-black text-yellow-700 mb-2 uppercase tracking-widest">Pro Tip</h4>
                         <p className="text-sm text-yellow-800 font-black italic">"{feedback.fix}"</p>
                    </div>
                </div>
                <button onClick={fetchNewPhrase} className="w-full mt-10 bg-gray-950 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95">Next Challenge <ChevronRight size={18} /></button>
            </div>
        )}
      </div>
      
      <CoachHistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={loadHistoryItem} onClear={() => { if(window.confirm('Clear practice history?')) setHistory([]); }} />
    </div>
  );
};
