import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, PhoneOff, BarChart2, Video, History, X } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SYSTEM_INSTRUCTION, EMPATHY_INSTRUCTION } from '../constants';
import { base64ToUint8Array, createPcmBlob, decodeAudioData } from '../utils/audio';
import { Message, LiveSessionRecord } from '../types';

const HISTORY_KEY = 'jamtalk_live_history';

// Ensure the compiler knows process exists
declare const process: { env: { API_KEY: string } };

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: LiveSessionRecord[];
  onSelect: (session: LiveSessionRecord) => void;
  onClear: () => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ isOpen, onClose, history, onSelect, onClear }) => {
    const groupedHistory = history.reduce((acc, item) => {
        const date = new Date(item.date);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        let key = date.toDateString() === today.toDateString() ? 'Today' : (date.toDateString() === yesterday.toDateString() ? 'Yesterday' : 'Older');
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {} as Record<string, LiveSessionRecord[]>);
    
      if (!isOpen) return null;
    
      return (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
          <div className="relative w-3/4 max-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><History size={18} /> Past Sessions</h3>
              <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {history.length === 0 ? <div className="text-center py-10 text-gray-400"><History size={32} className="mx-auto mb-2 opacity-20" /><p className="text-sm">No recorded sessions</p></div> : 
                    ['Today', 'Yesterday', 'Older'].map(group => {
                        const items = groupedHistory[group];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={group} className="space-y-2">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</h4>
                                <div className="space-y-2">
                                    {items.sort((a,b) => b.date - a.date).map(session => (
                                        <div key={session.id} onClick={() => onSelect(session)} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:border-green-200 transition-all cursor-pointer">
                                            <h5 className="text-sm font-medium text-gray-800 line-clamp-1 mb-1">{session.title}</h5>
                                            <div className="text-xs text-gray-500 flex justify-between">
                                                <span>{new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                <span>{session.transcript.length} turns</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })
                }
            </div>
            {history.length > 0 && <div className="p-4 border-t border-gray-100"><button onClick={onClear} className="w-full text-red-500 text-sm font-medium p-2 hover:bg-red-50 rounded-lg">Clear History</button></div>}
          </div>
        </div>
      );
}

interface LiveSessionProps {
  initialContext?: string;
  canMarkComplete?: boolean;
  onComplete?: () => void;
  onExit?: () => void;
  selectedVoice: string;
  onOpenSettings: () => void;
}

export const LiveSession: React.FC<LiveSessionProps> = ({ initialContext, canMarkComplete, onComplete, onExit, selectedVoice, onOpenSettings }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmpathyMode, setIsEmpathyMode] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [realtimeInput, setRealtimeInput] = useState('');
  const [realtimeOutput, setRealtimeOutput] = useState('');
  const [history, setHistory] = useState<LiveSessionRecord[]>(() => {
      try { const saved = localStorage.getItem(HISTORY_KEY); return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState<LiveSessionRecord | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const activeSessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const inputBufferRef = useRef('');
  const outputBufferRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, realtimeInput, realtimeOutput, reviewSession]);
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    sourceNodesRef.current.forEach(node => { try { node.stop(); } catch (e) {} });
    sourceNodesRef.current.clear();
    if (activeSessionRef.current) { try { activeSessionRef.current.close(); } catch(e) {} activeSessionRef.current = null; }
    if (scriptProcessorRef.current) { scriptProcessorRef.current.disconnect(); scriptProcessorRef.current = null; }
    if (inputSourceRef.current) { inputSourceRef.current.disconnect(); inputSourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (inputContextRef.current) { inputContextRef.current.close().catch(() => {}); inputContextRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    setIsConnected(false); setIsConnecting(false); setRealtimeInput(''); setRealtimeOutput('');
  }, []);

  useEffect(() => { return () => cleanup(); }, [cleanup]);

  const drawVisualizer = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const bufferLength = 32;
      const dataArray = new Uint8Array(bufferLength);
      const outputDataArray = new Uint8Array(bufferLength);
      const draw = () => {
          if (!isConnected) return;
          animationFrameRef.current = requestAnimationFrame(draw);
          if (analyserRef.current) analyserRef.current.getByteFrequencyData(dataArray);
          if (outputAnalyserRef.current) outputAnalyserRef.current.getByteFrequencyData(outputDataArray);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const radius = 60;
          for (let i = 0; i < bufferLength; i++) {
              const value = dataArray[i];
              const outValue = outputDataArray[i];
              const angle = (i / bufferLength) * Math.PI * 2;
              if (value > 10) {
                  const h = (value / 255) * 40;
                  ctx.beginPath();
                  ctx.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
                  ctx.lineTo(centerX + Math.cos(angle) * (radius + h), centerY + Math.sin(angle) * (radius + h));
                  ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
                  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
              }
              if (outValue > 10) {
                  const h = (outValue / 255) * 50;
                  ctx.beginPath();
                  ctx.moveTo(centerX + Math.cos(angle) * (radius - 5), centerY + Math.sin(angle) * (radius - 5));
                  ctx.lineTo(centerX + Math.cos(angle) * (radius + h + 10), centerY + Math.sin(angle) * (radius + h + 10));
                  ctx.strokeStyle = '#22c55e';
                  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
              }
          }
      };
      draw();
  };

  const startSession = async () => {
    if (isConnecting) return;
    setError(null); setIsConnecting(true); setMessages([]); setShowSummary(false);
    try {
      const apiKey = process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const outputCtx = new AudioContextClass({ sampleRate: 24000 }); audioContextRef.current = outputCtx;
      const outputAnalyser = outputCtx.createAnalyser(); outputAnalyser.fftSize = 64; outputAnalyserRef.current = outputAnalyser;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 }); inputContextRef.current = inputCtx;
      const analyser = inputCtx.createAnalyser(); analyser.fftSize = 64; analyserRef.current = analyser;
      const outputNode = outputCtx.createGain(); outputNode.connect(outputAnalyser); outputAnalyser.connect(outputCtx.destination);
      await outputCtx.resume(); await inputCtx.resume();
      nextStartTimeRef.current = outputCtx.currentTime;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } }); streamRef.current = stream;
      let baseInstruction = initialContext ? `${SYSTEM_INSTRUCTION}\n\n[Context: ${initialContext}]` : SYSTEM_INSTRUCTION;
      if (isEmpathyMode) baseInstruction += `\n\n${EMPATHY_INSTRUCTION}`;
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } }, systemInstruction: baseInstruction, inputAudioTranscription: {}, outputAudioTranscription: {} },
        callbacks: {
            onopen: () => { setIsConnected(true); setIsConnecting(false); drawVisualizer();
                const source = inputCtx.createMediaStreamSource(stream); inputSourceRef.current = source; source.connect(analyser);
                const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1); scriptProcessorRef.current = scriptProcessor;
                scriptProcessor.onaudioprocess = (e) => { if (isMuted || !activeSessionRef.current) return; activeSessionRef.current.sendRealtimeInput({ media: createPcmBlob(e.inputBuffer.getChannelData(0)) }); };
                source.connect(scriptProcessor); scriptProcessor.connect(inputCtx.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
                const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio && audioContextRef.current) {
                    const ctx = audioContextRef.current; if (ctx.state === 'suspended') await ctx.resume();
                    const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx, 24000);
                    const source = ctx.createBufferSource(); source.buffer = audioBuffer; source.connect(outputNode);
                    source.onended = () => sourceNodesRef.current.delete(source); source.start(nextStartTimeRef.current);
                    sourceNodesRef.current.add(source); nextStartTimeRef.current += audioBuffer.duration;
                }
                if (message.serverContent?.inputTranscription) { inputBufferRef.current += message.serverContent.inputTranscription.text; setRealtimeInput(inputBufferRef.current); }
                if (message.serverContent?.outputTranscription) { outputBufferRef.current += message.serverContent.outputTranscription.text; setRealtimeOutput(outputBufferRef.current); }
                if (message.serverContent?.turnComplete) {
                    const newM: Message[] = [];
                    if (inputBufferRef.current.trim()) newM.push({ id: Date.now() + 'u', role: 'user', text: inputBufferRef.current.trim(), timestamp: new Date() });
                    if (outputBufferRef.current.trim()) newM.push({ id: Date.now() + 'm', role: 'model', text: outputBufferRef.current.trim(), timestamp: new Date() });
                    setMessages(p => [...p, ...newM]); inputBufferRef.current = ''; outputBufferRef.current = ''; setRealtimeInput(''); setRealtimeOutput('');
                }
            },
            onclose: () => { setIsConnected(false); },
            onerror: () => { cleanup(); }
        }
      });
      activeSessionRef.current = await sessionPromise;
    } catch (err: any) { cleanup(); setError(err.message || "Failed to start."); setIsConnecting(false); }
  };

  const handleHangUp = () => { cleanup(); setShowSummary(true); };

  if (showSummary) return <div className="flex flex-col h-full items-center justify-center p-6"><div className="bg-white p-6 rounded-2xl shadow-xl text-center"><h2 className="text-2xl font-bold mb-4">Session Ended</h2><button onClick={onExit} className="bg-green-600 text-white px-8 py-3 rounded-xl">Back to Menu</button></div></div>;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-green-50 to-white relative overflow-hidden">
      <div className="flex-none pt-6 px-6 relative">
        <div className="absolute left-4 top-6 flex gap-2"><button onClick={() => setIsHistoryOpen(true)} className="p-2 text-gray-500"><History size={20} /></button></div>
        <div className="text-center pt-10"><h2 className="text-2xl font-bold">Live Practice</h2></div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className={`w-40 h-40 rounded-full flex items-center justify-center mb-8 ${isConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
              <canvas ref={canvasRef} width={320} height={320} className="absolute w-[240px] h-[240px] z-0" />
              <div className={`w-32 h-32 rounded-full flex items-center justify-center z-10 ${isConnected ? 'bg-green-600' : 'bg-gray-300'}`}>{isConnected ? <BarChart2 className="text-white" /> : <Video />}</div>
          </div>
          <div className="flex items-center gap-6 mb-8">
              {!isConnected && !isConnecting ? <button onClick={startSession} className="bg-gray-900 text-white px-8 py-3 rounded-full flex items-center gap-2">Start Session</button> : 
               isConnecting ? <button disabled className="bg-gray-200 px-8 py-3 rounded-full">Connecting...</button> : 
               <button onClick={handleHangUp} className="p-4 bg-red-500 text-white rounded-full"><PhoneOff /></button>
              }
          </div>
          {messages.length > 0 && <div ref={scrollRef} className="w-full max-w-md flex-1 overflow-y-auto bg-white/50 p-4 rounded-xl">{messages.map(m => <div key={m.id} className={`mb-2 text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>{m.text}</div>)}</div>}
      </div>
      <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={setReviewSession} onClear={() => setHistory([])} />
    </div>
  );
};