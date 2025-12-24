
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Video, PhoneOff, BarChart2, Loader2, CheckCircle, ArrowLeft, Heart, HeartHandshake, History, X, Calendar, Play, Volume2, AlertCircle } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SYSTEM_INSTRUCTION, EMPATHY_INSTRUCTION } from '../constants';
import { base64ToUint8Array, createPcmBlob, decodeAudioData } from '../utils/audio';
import { Message, LiveSessionRecord } from '../types';

const HISTORY_KEY = 'jamtalk_live_history';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: LiveSessionRecord[];
  onSelect: (session: LiveSessionRecord) => void;
  onClear: () => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onClear
}) => {
    // Group by date
    const groupedHistory = history.reduce((acc, item) => {
        const date = new Date(item.date);
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
      }, {} as Record<string, LiveSessionRecord[]>);
    
      const groupOrder = ['Today', 'Yesterday', 'Older'];
    
      if (!isOpen) return null;
    
      return (
        <div className="absolute inset-0 z-50 flex">
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" 
            onClick={onClose}
          />
          <div className="relative w-3/4 max-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <History size={18} /> Past Sessions
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {history.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <History size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No recorded sessions</p>
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
                                    {items.sort((a,b) => b.date - a.date).map(session => (
                                        <div 
                                            key={session.id}
                                            onClick={() => onSelect(session)}
                                            className="group bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:border-green-200 hover:shadow-md transition-all cursor-pointer"
                                        >
                                            <h5 className="text-sm font-medium text-gray-800 line-clamp-1 mb-1">
                                                {session.title}
                                            </h5>
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
                )}
            </div>
            {history.length > 0 && (
                <div className="p-4 border-t border-gray-100">
                    <button 
                    onClick={onClear}
                    className="w-full text-red-500 text-sm font-medium p-2 hover:bg-red-50 rounded-lg"
                    >
                    Clear History
                    </button>
                </div>
            )}
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

export const LiveSession: React.FC<LiveSessionProps> = ({ 
  initialContext, 
  canMarkComplete, 
  onComplete, 
  onExit,
  selectedVoice,
  onOpenSettings
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmpathyMode, setIsEmpathyMode] = useState(true);
  
  // Session Summary State
  const [showSummary, setShowSummary] = useState(false);
  
  // Transcription State
  const [messages, setMessages] = useState<Message[]>([]);
  const [realtimeInput, setRealtimeInput] = useState('');
  const [realtimeOutput, setRealtimeOutput] = useState('');
  
  // History State
  const [history, setHistory] = useState<LiveSessionRecord[]>(() => {
      try {
          const saved = localStorage.getItem(HISTORY_KEY);
          return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState<LiveSessionRecord | null>(null);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session ref to avoid closure staleness in callbacks
  const activeSessionRef = useRef<any>(null);
  
  // Refs for cleanup
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  // Refs for transcription accumulation
  const inputBufferRef = useRef('');
  const outputBufferRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, realtimeInput, realtimeOutput, reviewSession]);

  // Persist history
  useEffect(() => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const saveSession = () => {
      if (messages.length === 0) return;
      
      const newRecord: LiveSessionRecord = {
          id: Date.now().toString(),
          date: Date.now(),
          title: messages[0]?.text.substring(0, 40) || 'Live Conversation',
          transcript: messages
      };
      
      setHistory(prev => [newRecord, ...prev]);
  };

  const stopAudioProcessing = () => {
     if (scriptProcessorRef.current) {
         try {
            scriptProcessorRef.current.disconnect();
         } catch(e) {}
         scriptProcessorRef.current = null;
     }
     if (inputSourceRef.current) {
         try {
            inputSourceRef.current.disconnect();
         } catch(e) {}
         inputSourceRef.current = null;
     }
     if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
         streamRef.current = null;
     }
     if (inputContextRef.current) {
         if (inputContextRef.current.state !== 'closed') {
             inputContextRef.current.close().catch(console.error);
         }
         inputContextRef.current = null;
     }
  }

  const cleanup = useCallback(() => {
    // Stop visualizer loop
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    // Stop all playing audio
    sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch (e) {}
    });
    sourceNodesRef.current.clear();

    // Close session
    if (activeSessionRef.current) {
        try { activeSessionRef.current.close(); } catch(e) {}
        activeSessionRef.current = null;
    }

    // Stop recording
    stopAudioProcessing();

    // Close output context
    if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    // Reset realtime buffers
    setRealtimeInput('');
    setRealtimeOutput('');
    inputBufferRef.current = '';
    outputBufferRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const drawVisualizer = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = 32; // Low number for chunky bars
      const dataArray = new Uint8Array(bufferLength);
      const outputDataArray = new Uint8Array(bufferLength);
      const inputDataForMic = new Uint8Array(32);

      const draw = () => {
          if (!isConnected) return;
          animationFrameRef.current = requestAnimationFrame(draw);

          // Get data
          if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              // Also calculate basic volume for mic button glow
              analyserRef.current.getByteTimeDomainData(inputDataForMic);
              let sum = 0;
              for(let i = 0; i < inputDataForMic.length; i++) {
                  const v = inputDataForMic[i] - 128;
                  sum += v * v;
              }
              const rms = Math.sqrt(sum / inputDataForMic.length);
              const volume = Math.min(1, rms / 50); // Normalize roughly
              
              if (micButtonRef.current) {
                  micButtonRef.current.style.setProperty('--mic-level', (1 + volume * 0.5).toString());
                  micButtonRef.current.style.boxShadow = `0 0 ${volume * 20}px rgba(239, 68, 68, ${volume})`;
              }
          }

          if (outputAnalyserRef.current) outputAnalyserRef.current.getByteFrequencyData(outputDataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const radius = 60; // Should match the inner circle visual size approximately
          
          // Draw bars
          for (let i = 0; i < bufferLength; i++) {
              const value = dataArray[i]; // Input volume
              const outValue = outputDataArray[i]; // Output volume
              
              const angle = (i / bufferLength) * Math.PI * 2;
              
              // Input Visualization (User - Gray/Dark)
              if (value > 10) {
                  const h = (value / 255) * 40;
                  const x1 = centerX + Math.cos(angle) * (radius);
                  const y1 = centerY + Math.sin(angle) * (radius);
                  const x2 = centerX + Math.cos(angle) * (radius + h);
                  const y2 = centerY + Math.sin(angle) * (radius + h);
                  
                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
                  ctx.lineWidth = 4;
                  ctx.lineCap = 'round';
                  ctx.stroke();
              }

              // Output Visualization (AI - Green)
              if (outValue > 10) {
                  const h = (outValue / 255) * 50;
                  const x1 = centerX + Math.cos(angle) * (radius - 5);
                  const y1 = centerY + Math.sin(angle) * (radius - 5);
                  const x2 = centerX + Math.cos(angle) * (radius + h + 10);
                  const y2 = centerY + Math.sin(angle) * (radius + h + 10);

                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.strokeStyle = '#22c55e'; // Green-500
                  ctx.lineWidth = 4;
                  ctx.lineCap = 'round';
                  ctx.stroke();
              }
          }
      };
      draw();
  };

  const startSession = async () => {
    if (isConnecting) return;
    setError(null);
    setIsConnecting(true);
    setMessages([]); // Clear previous session messages
    setShowSummary(false); // Reset summary view
    setReviewSession(null); // Clear review mode

    try {
      // Initialize API client locally
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 1. Setup Audio Contexts with error handling
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 64;
      outputAnalyserRef.current = outputAnalyser;
      
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      inputContextRef.current = inputCtx;
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      
      const outputNode = outputCtx.createGain();
      outputNode.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);

      // Force resume contexts to ensure they are active
      try {
        await outputCtx.resume();
        await inputCtx.resume();
      } catch (resumeErr) {
        console.warn("Failed to resume audio contexts:", resumeErr);
      }

      nextStartTimeRef.current = outputCtx.currentTime;

      // 2. Get Microphone Stream
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              channelCount: 1,
              echoCancellation: true,
              autoGainControl: true,
              noiseSuppression: true
            } 
          });
          streamRef.current = stream;
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError("Microphone permission denied. Please allow access in browser settings.");
        } else if (err.name === 'NotFoundError') {
            setError("No microphone found. Please connect an audio input device.");
        } else {
            setError(`Microphone error: ${err.message || 'Unknown error'}`);
        }
        cleanup();
        return;
      }

      // 3. Connect to Gemini Live API
      let baseInstruction = initialContext 
        ? `${SYSTEM_INSTRUCTION}\n\n[Context for this session: ${initialContext}]`
        : SYSTEM_INSTRUCTION;

      if (isEmpathyMode) {
        baseInstruction += `\n\n${EMPATHY_INSTRUCTION}`;
      }

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
            },
            systemInstruction: baseInstruction,
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
        }
      };

      // Connect and await the session promise
      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
            onopen: () => {
                console.log('Session opened');
                // The sessionPromise resolves to the session object, but we need to signal that we are ready
                setIsConnected(true);
                setIsConnecting(false);
                
                // Start Visualizer
                drawVisualizer();

                // Set up Audio Input Processing ONLY after connection is confirmed
                try {
                    const source = inputCtx.createMediaStreamSource(stream);
                    inputSourceRef.current = source;
                    
                    // Connect to analyser for visualization
                    source.connect(analyser);

                    const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (e) => {
                        if (isMuted || !activeSessionRef.current) return;

                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        
                        try {
                            activeSessionRef.current.sendRealtimeInput({ media: pcmBlob });
                        } catch (err) {
                            // Don't log spam if session is closing
                            if (activeSessionRef.current) {
                                console.error("Error sending audio chunk:", err);
                            }
                        }
                    };
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputCtx.destination);
                } catch (audioSetupErr) {
                    console.error("Audio setup error:", audioSetupErr);
                    setError("Failed to process microphone input.");
                    cleanup();
                }
            },
            onmessage: async (message: LiveServerMessage) => {
                const content = message.serverContent;

                // Handle Audio Output
                const base64Audio = content?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio) {
                     const ctx = audioContextRef.current;
                     if (ctx) {
                         if (ctx.state === 'suspended') await ctx.resume();
                         nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                         try {
                            const audioBuffer = await decodeAudioData(
                                base64ToUint8Array(base64Audio),
                                ctx,
                                24000
                            );
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNode);
                            source.onended = () => sourceNodesRef.current.delete(source);
                            source.start(nextStartTimeRef.current);
                            sourceNodesRef.current.add(source);
                            nextStartTimeRef.current += audioBuffer.duration;
                         } catch (e) {
                             console.error("Error decoding audio", e);
                             // Non-fatal, just log. 
                             // Could set a temporary warning if frequent.
                         }
                     }
                }

                // Handle Transcription
                if (content?.inputTranscription) {
                    inputBufferRef.current += content.inputTranscription.text;
                    setRealtimeInput(inputBufferRef.current);
                }
                if (content?.outputTranscription) {
                    outputBufferRef.current += content.outputTranscription.text;
                    setRealtimeOutput(outputBufferRef.current);
                }

                // Handle Turn Complete (Commit logs)
                if (content?.turnComplete) {
                    const newMessages: Message[] = [];
                    
                    if (inputBufferRef.current.trim()) {
                        newMessages.push({
                            id: Date.now().toString() + 'u',
                            role: 'user',
                            text: inputBufferRef.current.trim(),
                            timestamp: new Date()
                        });
                        inputBufferRef.current = '';
                        setRealtimeInput('');
                    }
                    
                    if (outputBufferRef.current.trim()) {
                        newMessages.push({
                            id: Date.now().toString() + 'm',
                            role: 'model',
                            text: outputBufferRef.current.trim(),
                            timestamp: new Date()
                        });
                        outputBufferRef.current = '';
                        setRealtimeOutput('');
                    }
                    
                    if (newMessages.length > 0) {
                        setMessages(prev => [...prev, ...newMessages]);
                    }
                }

                // Handle Interruption
                if (content?.interrupted) {
                    console.log("Interrupted!");
                    sourceNodesRef.current.forEach(node => {
                        try { node.stop(); } catch(e) {}
                    });
                    sourceNodesRef.current.clear();
                    if(audioContextRef.current) {
                        nextStartTimeRef.current = audioContextRef.current.currentTime;
                    }
                    
                    // Commit what we have so far, don't lose the text
                    if (outputBufferRef.current.trim()) {
                        setMessages(prev => [...prev, {
                            id: Date.now().toString() + 'm_int',
                            role: 'model',
                            text: outputBufferRef.current.trim() + ' ...',
                            timestamp: new Date()
                        }]);
                    }

                    // Clear pending output
                    outputBufferRef.current = '';
                    setRealtimeOutput('');
                }
            },
            onclose: () => {
                console.log('Session closed');
                setIsConnected(false);
                setIsConnecting(false);
            },
            onerror: (err) => {
                console.error("Session error:", err);
                // Only show user error if we were actually connected or connecting
                if (activeSessionRef.current || isConnecting) {
                    setError("Connection lost. Please try again.");
                }
                cleanup();
            }
        }
      });
      
      // Store the session immediately
      const session = await sessionPromise;
      activeSessionRef.current = session;

    } catch (err: any) {
        console.error("Failed to start session:", err);
        cleanup();
        setError(err.message || "Connection failed. Please check your network.");
        setIsConnecting(false);
    }
  };

  const toggleMute = () => {
      setIsMuted(prev => !prev);
  };

  const handleHangUp = () => {
      cleanup();
      saveSession();
      // Show summary screen if we had a session
      setShowSummary(true);
  };

  if (showSummary) {
    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-green-50 to-white items-center justify-center p-6 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Session Ended</h2>
                <p className="text-gray-500">
                    Great practice! You've successfully completed a conversation session with JamTalk.
                </p>

                <div className="pt-4 space-y-3">
                    {canMarkComplete && onComplete && (
                        <button 
                            onClick={onComplete}
                            className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={20} /> Mark Lesson Complete
                        </button>
                    )}
                    
                    {onExit && (
                        <button 
                            onClick={onExit}
                            className={`w-full py-3 rounded-xl font-medium transition-colors border ${
                                canMarkComplete 
                                    ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50' 
                                    : 'bg-green-600 text-white hover:bg-green-700 border-transparent'
                            }`}
                        >
                           {canMarkComplete ? "Back to Lessons" : "Return to Menu"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
  }

  // REVIEW MODE
  if (reviewSession) {
      return (
          <div className="flex flex-col h-full bg-gray-50">
              <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
                  <button onClick={() => setReviewSession(null)} className="p-2 hover:bg-gray-100 rounded-full">
                      <ArrowLeft size={20} />
                  </button>
                  <div>
                      <h2 className="font-bold">{reviewSession.title}</h2>
                      <p className="text-xs text-gray-500">{new Date(reviewSession.date).toLocaleString()}</p>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                   {reviewSession.transcript.map(msg => (
                       <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                              msg.role === 'user' 
                              ? 'bg-gray-200 text-gray-800' 
                              : 'bg-white border border-gray-200 text-gray-800'
                           }`}>
                               <span className="block text-[10px] opacity-50 mb-1 font-bold">
                                   {msg.role === 'user' ? 'You' : 'JamTalk'}
                               </span>
                               {msg.text}
                           </div>
                       </div>
                   ))}
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-green-50 to-white overflow-hidden relative">
      
      <div className="flex-none pt-6 px-6 relative">
        {/* Left Controls */}
        <div className="absolute left-4 top-6 flex gap-2">
            {onExit && !isConnected && !isConnecting && (
                <button 
                    onClick={onExit}
                    className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                    title="Back"
                >
                    <ArrowLeft size={20} />
                </button>
            )}
             <button 
                onClick={() => setIsHistoryOpen(true)}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                title="History"
            >
                <History size={20} />
            </button>
        </div>
        
        {/* Connection Status Badge */}
        <div className="absolute right-6 top-6 flex items-center gap-3">
             {/* Voice Indicator */}
             {!isConnected && !isConnecting && (
                 <button 
                     onClick={onOpenSettings}
                     className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                     title="Change Voice"
                 >
                     <Volume2 size={12} /> {selectedVoice}
                 </button>
             )}

             {/* Empathy Toggle */}
             {!isConnected && !isConnecting && (
                <button
                    onClick={() => setIsEmpathyMode(!isEmpathyMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isEmpathyMode 
                            ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm' 
                            : 'bg-gray-100 text-gray-400 border border-transparent'
                    }`}
                    title={isEmpathyMode ? "Empathetic Mode: ON" : "Empathetic Mode: OFF"}
                >
                    {isEmpathyMode ? <Heart size={14} className="fill-current" /> : <Heart size={14} />}
                    {isEmpathyMode ? 'Mood AI' : 'Mood AI'}
                </button>
             )}

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-300 ${
                isConnected 
                    ? 'bg-green-100 text-green-700 border-green-200' 
                    : isConnecting 
                        ? 'bg-yellow-100 text-yellow-700 border-yellow-200' 
                        : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}>
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    isConnected 
                        ? 'bg-green-500 animate-pulse' 
                        : isConnecting 
                            ? 'bg-yellow-500 animate-bounce' 
                            : 'bg-gray-400'
                }`} />
                {isConnected ? 'Live' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </div>
        </div>

        <div className="text-center pt-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Live Practice</h2>
            <p className="text-gray-600 text-sm">
            {isConnected ? "Conversation in progress..." : "Start a real-time conversation to practice."}
            </p>
        </div>
      </div>

      {/* Main Content Area - Flexible split */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
          
          {/* Visualizer */}
          <div className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 mb-8 flex-shrink-0 ${
              isConnected ? 'bg-green-50 shadow-[0_0_60px_-15px_rgba(34,197,94,0.2)] scale-105' : 'bg-gray-100'
          }`}>
              <canvas 
                ref={canvasRef} 
                width={320} 
                height={320} 
                className="absolute inset-[-40px] w-[240px] h-[240px] pointer-events-none z-0"
              />

              <div className={`w-32 h-32 rounded-full flex items-center justify-center z-10 transition-colors shadow-lg ${
                  isConnected ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gray-300'
              }`}>
                 {isConnecting ? (
                     <Loader2 className="w-12 h-12 text-gray-500 animate-spin" />
                 ) : isConnected ? (
                     <BarChart2 className="w-12 h-12 text-white animate-pulse" />
                 ) : (
                     <Video className="w-12 h-12 text-gray-500" />
                 )}
              </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 mb-8 flex-shrink-0 relative z-10">
              {!isConnected && !isConnecting ? (
                  <button 
                    onClick={startSession}
                    className="flex items-center gap-3 bg-gray-900 text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:bg-gray-800 hover:scale-105 transition-all"
                  >
                     <Mic className="w-5 h-5" />
                     Start Conversation
                  </button>
              ) : isConnecting ? (
                 <button 
                    disabled
                    className="flex items-center gap-3 bg-gray-200 text-gray-500 px-8 py-3 rounded-full font-semibold cursor-not-allowed"
                  >
                     <Loader2 className="w-5 h-5 animate-spin" />
                     Connecting...
                  </button>
              ) : (
                  <>
                    <div className="relative">
                        <div 
                           ref={micButtonRef as any}
                           className="absolute inset-0 rounded-full bg-red-500 opacity-20 pointer-events-none transition-all duration-75"
                           style={{ '--mic-level': 1 } as React.CSSProperties}
                        />
                        <button 
                            onClick={toggleMute}
                            className={`p-4 rounded-full shadow-md transition-all relative z-10 ${
                                isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>
                    </div>

                    <button 
                        onClick={handleHangUp}
                        className="p-4 rounded-full bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600 hover:scale-110 transition-all"
                    >
                        <PhoneOff className="w-6 h-6" />
                    </button>
                  </>
              )}
          </div>
          
          {error && (
              <div className="mb-4 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm max-w-xs text-center border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{error}</span>
              </div>
          )}

          {/* Transcript Area */}
          {(messages.length > 0 || realtimeInput || realtimeOutput) && (
              <div 
                ref={scrollRef}
                className="w-full max-w-md flex-1 overflow-y-auto px-4 space-y-3 min-h-0 bg-white/50 rounded-xl border border-gray-100 p-4 scrollbar-hide shadow-inner"
              >
                  {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                              msg.role === 'user' 
                              ? 'bg-gray-200 text-gray-800 rounded-tr-none' 
                              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                          }`}>
                              {msg.text}
                          </div>
                      </div>
                  ))}
                  
                  {/* Realtime Input Bubble */}
                  {realtimeInput && (
                      <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl px-4 py-2 text-sm bg-gray-100 text-gray-500 rounded-tr-none animate-pulse">
                             {realtimeInput} <span className="inline-block w-1 h-3 ml-1 bg-gray-400 animate-bounce"></span>
                          </div>
                      </div>
                  )}

                  {/* Realtime Output Bubble */}
                  {realtimeOutput && (
                      <div className="flex justify-start">
                           <div className="max-w-[85%] rounded-2xl px-4 py-2 text-sm bg-white border border-gray-100 text-gray-500 rounded-tl-none shadow-sm">
                              {realtimeOutput} <span className="inline-block w-1 h-3 ml-1 bg-green-400 animate-bounce"></span>
                           </div>
                      </div>
                  )}
              </div>
          )}
      </div>

      <div className="flex-none p-4 text-center">
           <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
              Powered by Gemini 2.5 Native Audio {isEmpathyMode && <span className="text-red-300">• Mood AI Enabled</span>}
           </div>
      </div>

      <HistorySidebar 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelect={(s) => {
            setReviewSession(s);
            setIsHistoryOpen(false);
        }}
        onClear={() => {
            if(window.confirm('Clear all session history?')) setHistory([]);
        }}
      />
    </div>
  );
};
