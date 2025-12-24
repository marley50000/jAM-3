import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowDown, Copy, Loader2, Volume2, Trash2, StopCircle, 
  ArrowRightLeft, History, X, Search, Check, Calendar, Sparkles,
  Eye, EyeOff
} from 'lucide-react';
import { ai } from '../services/gemini';
import { TranslationHistoryItem, TranslationDirection } from '../types';
import { Type, Modality } from '@google/genai';
import { base64ToUint8Array, decodeAudioData } from '../utils/audio';

const STORAGE_KEY = 'jamtalk_translation_history_v2';
const DAILY_PHRASE_KEY = 'jamtalk_daily_phrase';

interface DailyPhrase {
  patois: string;
  english: string;
  pronunciation: string;
  date: string;
}

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: TranslationHistoryItem[];
  onSelect: (item: TranslationHistoryItem) => void;
  onClear: () => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onClear
}) => {
  // Group history by date
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
  }, {} as Record<string, TranslationHistoryItem[]>);

  const groupOrder = ['Today', 'Yesterday', 'Older'];

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-3/4 max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <History size={18} /> History
          </h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
           {history.length === 0 ? (
             <div className="text-center py-10 text-gray-400">
               <Search size={32} className="mx-auto mb-2 opacity-20" />
               <p className="text-sm">No history yet</p>
             </div>
           ) : (
             groupOrder.map(group => {
               const items = groupedHistory[group];
               if (!items || items.length === 0) return null;

               return (
                 <div key={group} className="space-y-3">
                   <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                     <Calendar size={10} /> {group}
                   </h4>
                   <div className="space-y-3">
                     {items.map((item) => (
                       <div 
                          key={item.id} 
                          className="group bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:border-green-200 hover:shadow-md transition-all cursor-pointer"
                          onClick={() => onSelect(item)}
                       >
                         <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              item.direction === 'en-to-pat' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                            }`}>
                              {item.direction === 'en-to-pat' ? 'EN → PAT' : 'PAT → EN'}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                         </div>
                         <p className="text-xs text-gray-500 line-clamp-1 mb-1">{item.original}</p>
                         <p className="text-sm font-medium text-gray-800 line-clamp-2">{item.translated}</p>
                         {item.pronunciation && (
                            <p className="text-xs text-gray-400 italic mt-0.5">({item.pronunciation})</p>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               );
             })
           )}
        </div>

        {history.length > 0 && (
          <div className="p-4 border-t border-gray-100">
            <button 
              onClick={onClear}
              className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors text-sm font-medium"
            >
              <Trash2 size={16} /> Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface TranslatorViewProps {
  selectedVoice?: string;
  onOpenSettings: () => void;
}

export const TranslatorView: React.FC<TranslatorViewProps> = ({ selectedVoice = 'Kore', onOpenSettings }) => {
  const [inputText, setInputText] = useState('');
  const [translation, setTranslation] = useState('');
  const [pronunciation, setPronunciation] = useState<string | undefined>(undefined);
  const [direction, setDirection] = useState<TranslationDirection>('en-to-pat');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(true);
  
  // Daily Phrase State
  const [dailyPhrase, setDailyPhrase] = useState<DailyPhrase | null>(null);
  const [isLoadingPhrase, setIsLoadingPhrase] = useState(false);
  
  // Content Ref for scrolling
  const contentRef = useRef<HTMLDivElement>(null);

  // History State
  const [history, setHistory] = useState<TranslationHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (e) {
      console.warn('Failed to load translation history', e);
    }
    return [];
  });

  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Load/Generate Daily Phrase
  useEffect(() => {
    const fetchDailyPhrase = async () => {
      const today = new Date().toDateString();
      
      // Check local storage first
      try {
        const saved = localStorage.getItem(DAILY_PHRASE_KEY);
        if (saved) {
          const parsed: DailyPhrase = JSON.parse(saved);
          if (parsed.date === today) {
            setDailyPhrase(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to read daily phrase', e);
      }

      // Generate new phrase if missing or old
      setIsLoadingPhrase(true);
      try {
        // Fix: Update to 'gemini-3-flash-preview' for text task
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: "Generate a unique, popular Jamaican Patois phrase, proverb, or slang term. Return a JSON object with 'patois', 'english' translation, and 'pronunciation'.",
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                patois: { type: Type.STRING },
                english: { type: Type.STRING },
                pronunciation: { type: Type.STRING }
              }
            }
          }
        });

        let text = response.text || '';
        text = text.replace(/```json\n?|\n?```/g, '').trim();
        const json = JSON.parse(text);
        
        const newPhrase: DailyPhrase = {
          patois: json.patois,
          english: json.english,
          pronunciation: json.pronunciation,
          date: today
        };

        setDailyPhrase(newPhrase);
        localStorage.setItem(DAILY_PHRASE_KEY, JSON.stringify(newPhrase));
      } catch (err) {
        console.error("Failed to fetch daily phrase", err);
      } finally {
        setIsLoadingPhrase(false);
      }
    };

    fetchDailyPhrase();
  }, []);

  // Persist history whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => {
        stopAudio();
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };
  }, []);

  const stopAudio = () => {
      if (activeSourceRef.current) {
          try { activeSourceRef.current.stop(); } catch(e) {}
          activeSourceRef.current = null;
      }
      setIsPlaying(false);
      setIsAudioLoading(false);
  };

  const playAudio = async (text: string) => {
      if (!text || !text.trim()) return;

      if (isPlaying) {
          stopAudio();
          return;
      }

      setIsAudioLoading(true);
      
      try {
          if (!audioContextRef.current) {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
          }
          const ctx = audioContextRef.current;
          if (ctx.state === 'suspended') await ctx.resume();

          // Sanitize text
          const cleanText = text.replace(/[*_~`]/g, '').trim();
          if (!cleanText) throw new Error("Empty text for audio");

          // Truncate text to avoid token limit errors for TTS (limit to ~600 chars)
          const maxLength = 600;
          const textToSpeak = cleanText.length > maxLength ? cleanText.substring(0, maxLength) : cleanText;

          // Fix: Corrected model name and used Modality.AUDIO enum
          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash-preview-tts",
              contents: [{ parts: [{ text: textToSpeak }] }],
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
                  }
              }
          });

          const part = response.candidates?.[0]?.content?.parts?.[0];
          
          if (part?.text && !part?.inlineData) {
             console.warn("TTS refused and returned text:", part.text);
             throw new Error("TTS generation failed");
          }

          const base64Audio = part?.inlineData?.data;
          if (!base64Audio) throw new Error("No audio data received");

          const audioBuffer = await decodeAudioData(
              base64ToUint8Array(base64Audio),
              ctx,
              24000
          );

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          
          source.onended = () => {
              setIsPlaying(false);
              activeSourceRef.current = null;
          };

          activeSourceRef.current = source;
          source.start();
          setIsPlaying(true);

      } catch (e) {
          console.error("Audio playback error", e);
      } finally {
          setIsAudioLoading(false);
      }
  };

  const handleTranslate = async () => {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setTranslation('');
    setPronunciation(undefined);
    stopAudio();
    setShowPronunciation(true); // Reset to visible on new translation

    try {
      let resultText = '';
      let pronunciationText: string | undefined = undefined;

      if (direction === 'en-to-pat') {
        // Fix: Update to 'gemini-3-flash-preview' for text task
        const prompt = `Translate the following Standard English text into authentic Jamaican Patois (Patwa). Return the translation and a simplified phonetic pronunciation guide. Text: "${inputText}"`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                translation: { type: Type.STRING, description: "The Patois translation" },
                pronunciation: { type: Type.STRING, description: "Simplified phonetic guide (e.g. Wah-gwaan)" },
              }
            }
          }
        });
        
        try {
          let text = response.text || '{}';
          text = text.replace(/```json\n?|\n?```/g, '').trim();
          const json = JSON.parse(text);
          resultText = json.translation;
          pronunciationText = json.pronunciation;
        } catch (e) {
          console.error("Error parsing JSON response", e);
          resultText = response.text || "Error parsing translation.";
        }

      } else {
        // Fix: Update to 'gemini-3-flash-preview' for text task
        const prompt = `Translate the following Jamaican Patois (Patwa) text into Standard English. Provide ONLY the translation, no intro or explanation. Text: "${inputText}"`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        resultText = response.text || "Could not translate.";
      }

      setTranslation(resultText);
      setPronunciation(pronunciationText);

      // Add to history
      const newItem: TranslationHistoryItem = {
        id: Date.now().toString(),
        original: inputText,
        translated: resultText,
        pronunciation: pronunciationText,
        timestamp: new Date(),
        direction: direction
      };
      
      setHistory(prev => [newItem, ...prev]);

    } catch (error) {
      console.error("Translation error:", error);
      setTranslation("Error: Could not translate at this time.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    if (window.confirm("Clear all translation history?")) {
      setHistory([]);
    }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const toggleDirection = () => {
    setDirection(prev => prev === 'en-to-pat' ? 'pat-to-en' : 'en-to-pat');
    // Swap input and output if they exist
    if (translation) {
      setInputText(translation);
      setTranslation(inputText);
      setPronunciation(undefined); // Reset pronunciation on swap as direction changes
    }
  };

  const loadHistoryItem = (item: TranslationHistoryItem) => {
    setInputText(item.original);
    setTranslation(item.translated);
    setPronunciation(item.pronunciation);
    setDirection(item.direction);
    setIsSidebarOpen(false);
    setShowPronunciation(true);
    
    // Scroll to top so user sees the result immediately
    if (contentRef.current) {
        contentRef.current.scrollTop = 0;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 max-w-2xl mx-auto pb-24 relative overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Translator</h2>
          <p className="text-xs text-gray-500">
            {direction === 'en-to-pat' ? 'English → Patois' : 'Patois → English'}
          </p>
        </div>
        
        <div className="flex gap-2">
           <button 
             onClick={onOpenSettings}
             className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
             title="Change Voice"
            >
             <Volume2 size={12} /> {selectedVoice}
           </button>

            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors relative"
              title="History"
            >
              <History size={20} />
              {history.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full border border-white"></span>
              )}
            </button>
        </div>
      </div>

      <div ref={contentRef} className="p-4 space-y-4 flex-1 overflow-y-auto">
        
        {/* Phrase of the Day Card */}
        {dailyPhrase && (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-100 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-orange-600 text-xs font-bold uppercase tracking-wider mb-2">
                  <Sparkles size={12} className="fill-current" /> Phrase of the Day
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{dailyPhrase.patois}</h3>
                <p className="text-sm text-gray-600 italic mb-2">"{dailyPhrase.english}"</p>
                <div className="text-xs text-gray-400">({dailyPhrase.pronunciation})</div>
              </div>
              <button
                onClick={() => playAudio(dailyPhrase.patois)}
                disabled={isAudioLoading}
                className="p-3 bg-white text-orange-500 rounded-full shadow-sm hover:scale-105 transition-transform"
              >
                <Volume2 size={18} />
              </button>
            </div>
            {/* Background Decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
              <Sparkles size={100} />
            </div>
          </div>
        )}

        {/* Language Switcher - Prominent Button Design */}
        <div className="flex items-center justify-center gap-4 mb-2 mt-2">
          <div className={`flex-1 max-w-[120px] text-center py-2.5 rounded-xl text-sm font-bold transition-all border ${
            direction === 'en-to-pat' 
              ? 'bg-white border-green-100 text-green-700 shadow-sm' 
              : 'bg-transparent border-transparent text-gray-400'
          }`}>
            English
          </div>
          
          <button 
            onClick={toggleDirection}
            className="p-3 bg-white rounded-full shadow-md text-green-600 hover:bg-green-50 hover:scale-105 active:scale-95 transition-all border border-gray-100 z-10"
            title="Swap Languages"
          >
            <ArrowRightLeft size={20} strokeWidth={2.5} />
          </button>
          
          <div className={`flex-1 max-w-[120px] text-center py-2.5 rounded-xl text-sm font-bold transition-all border ${
            direction === 'pat-to-en' 
              ? 'bg-white border-green-100 text-green-700 shadow-sm' 
              : 'bg-transparent border-transparent text-gray-400'
          }`}>
            Patois
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
           <textarea
             className="w-full text-lg resize-none outline-none text-gray-800 placeholder-gray-400 min-h-[120px]"
             placeholder={direction === 'en-to-pat' ? "Type in English..." : "Type in Patois..."}
             value={inputText}
             onChange={(e) => setInputText(e.target.value)}
           />
           <div className="flex justify-end mt-2">
             <button
               onClick={handleTranslate}
               disabled={!inputText.trim() || isLoading}
               className="bg-green-600 text-white px-6 py-2 rounded-full font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
             >
               {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Translate"}
             </button>
           </div>
        </div>

        {/* Result Section */}
        {(translation || isLoading) && (
          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="absolute left-1/2 -top-3 transform -translate-x-1/2 bg-gray-100 p-1.5 rounded-full text-gray-400 border border-white">
               <ArrowDown size={16} />
             </div>
             <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl shadow-sm p-5 border border-green-100 mt-2">
               {isLoading ? (
                 <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
                   <Loader2 size={24} className="animate-spin text-green-500" />
                   <span className="font-medium">Translating...</span>
                 </div>
               ) : (
                 <>
                   <div className="text-xl font-medium text-gray-900 mb-2 font-serif italic leading-relaxed">
                     "{translation}"
                   </div>
                   
                   {pronunciation && (
                     <div className="mb-4">
                       <button
                         onClick={() => setShowPronunciation(!showPronunciation)}
                         className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 hover:text-green-600 transition-colors mb-1"
                       >
                         {showPronunciation ? <EyeOff size={12} /> : <Eye size={12} />}
                         {showPronunciation ? 'Hide Phonetics' : 'Show Phonetics'}
                       </button>
                       {showPronunciation && (
                         <div className="text-sm text-gray-500 italic font-light animate-in fade-in slide-in-from-top-1">
                           ({pronunciation})
                         </div>
                       )}
                     </div>
                   )}

                   <div className={`flex items-center justify-between border-t border-gray-100 pt-3 ${!pronunciation ? 'mt-4' : ''}`}>
                     <button 
                       onClick={() => playAudio(translation)}
                       disabled={isAudioLoading}
                       className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full transition-colors ${
                         isAudioLoading 
                           ? 'bg-gray-100 text-gray-500 cursor-wait' 
                           : 'bg-green-100 text-green-700 hover:bg-green-200'
                       }`}
                     >
                       {isAudioLoading ? (
                         <>
                            <Loader2 size={16} className="animate-spin" />
                            Loading...
                         </>
                       ) : isPlaying ? (
                         <>
                            <StopCircle size={16} />
                            Stop
                         </>
                       ) : (
                         <>
                            <Volume2 size={16} />
                            Listen
                         </>
                       )}
                     </button>
                     
                     <div className="flex gap-1">
                        <button 
                          onClick={() => copyToClipboard(translation)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all ${
                              isCopied 
                                ? 'bg-green-100 text-green-700' 
                                : 'text-gray-400 hover:text-green-600 hover:bg-gray-50'
                          }`}
                          title="Copy to clipboard"
                        >
                          {isCopied ? <Check size={18} /> : <Copy size={18} />}
                          <span className="text-sm font-medium">{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                     </div>
                   </div>
                 </>
               )}
             </div>
          </div>
        )}
      </div>

      <HistorySidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        history={history}
        onSelect={loadHistoryItem}
        onClear={clearHistory}
      />

    </div>
  );
};
