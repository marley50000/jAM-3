import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Menu, Plus, X, MessageSquare, ThumbsUp, ThumbsDown, Info, Trash2 } from 'lucide-react';
import { Message } from '../types';
import { ai } from '../services/gemini';
import { telemetry } from '../services/telemetry';
import { SYSTEM_INSTRUCTION, EMPATHY_INSTRUCTION } from '../constants';
import ReactMarkdown from 'react-markdown';

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastModified: number;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onNewChat: () => void;
  currentSessionId: string | null;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  currentSessionId
}) => {
  const groupedSessions = sessions.reduce((acc, session) => {
    const date = new Date(session.lastModified);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let key = date.toDateString() === today.toDateString() ? 'Today' : (date.toDateString() === yesterday.toDateString() ? 'Yesterday' : 'Older');
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {} as Record<string, ChatSession[]>);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-3/4 max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><MessageSquare size={18} /> Conversations</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={20} /></button>
        </div>
        <div className="p-4"><button onClick={() => { onNewChat(); onClose(); }} className="w-full bg-green-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-sm"><Plus size={18} /> New Chat</button></div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
           {sessions.length === 0 ? <div className="text-center py-10 text-gray-400"><p className="text-sm">No saved chats</p></div> : 
             ['Today', 'Yesterday', 'Older'].map(group => {
               const groupItems = groupedSessions[group];
               if (!groupItems || groupItems.length === 0) return null;
               return (
                 <div key={group} className="space-y-2">
                   <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</h4>
                   {groupItems.sort((a,b) => b.lastModified - a.lastModified).map((session) => (
                     <div key={session.id} className={`group relative rounded-xl border p-3 cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 hover:border-green-200'}`} onClick={() => { onSelectSession(session); onClose(); }}>
                       <h5 className="text-sm font-medium mb-1 line-clamp-1 pr-6">{session.title || 'New Chat'}</h5>
                       <button onClick={(e) => onDeleteSession(session.id, e)} className="absolute right-2 top-3 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                     </div>
                   ))}
                 </div>
               );
             })
           }
        </div>
      </div>
    </div>
  );
};

interface ChatInterfaceProps {
  selectedVoice: string;
  onOpenSettings: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ selectedVoice, onOpenSettings }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ id: 'welcome', role: 'model', text: "Wa gwaan! Ready to learn some Patois?", timestamp: new Date() }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputText, timestamp: new Date() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: updatedMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: SYSTEM_INSTRUCTION + "\n\n" + EMPATHY_INSTRUCTION },
      });

      const result = await chat.sendMessage({ message: currentInput });
      const responseText = result.text || '';
      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: new Date() };
      setMessages(prev => [...prev, botMsg]);

      telemetry.logEvent({
        type: 'query',
        payload: { 
          userQuery: currentInput,
          aiResponse: responseText,
          messageCount: updatedMessages.length
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = (messageId: string, isPositive: boolean) => {
    if (feedbackGiven.has(messageId)) return;
    setFeedbackGiven(prev => new Set(prev).add(messageId));
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50 pt-4 pb-20 relative overflow-hidden">
      <div className="px-4 pb-2 flex justify-between items-center">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><Menu size={20} /></button>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full shadow-sm">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Live Session</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 scrollbar-hide">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm relative group animate-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'bg-green-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
              <div className="leading-relaxed text-sm prose prose-sm prose-green"><ReactMarkdown>{msg.text}</ReactMarkdown></div>
              {msg.role === 'model' && (
                <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t border-gray-50">
                    <div className="flex gap-2">
                        <button onClick={() => handleFeedback(msg.id, true)} className={`p-1.5 rounded-lg transition-colors ${feedbackGiven.has(msg.id) ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}><ThumbsUp size={14} /></button>
                        <button onClick={() => handleFeedback(msg.id, false)} className={`p-1.5 rounded-lg transition-colors ${feedbackGiven.has(msg.id) ? 'text-red-400 bg-red-50' : 'text-gray-400 hover:bg-gray-100'}`}><ThumbsDown size={14} /></button>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-gray-300"><Info size={10} /> Improving AI</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-green-500" />
              <span className="text-xs text-gray-400 font-medium">JamTalk is crafting a response...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="bg-gray-50 p-2 rounded-2xl flex items-center gap-2 border border-gray-200 focus-within:border-green-500 transition-all">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Type in English or Patois..." className="flex-1 bg-transparent outline-none text-sm px-3 py-1 font-medium text-gray-700" disabled={isLoading} />
          <button onClick={handleSendMessage} disabled={!inputText.trim() || isLoading} className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 shadow-md transition-all active:scale-95"><Send size={18} /></button>
        </div>
      </div>

      <ChatSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} sessions={sessions} onSelectSession={(s) => setCurrentSessionId(s.id)} onDeleteSession={() => {}} onNewChat={() => {}} currentSessionId={currentSessionId} />
    </div>
  );
};