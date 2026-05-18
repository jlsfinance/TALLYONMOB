import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  User,
  Send,
  Sparkles,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  Key,
  MessageSquare,
} from 'lucide-react';
import { ChatService, ChatMessage, AppDataContext } from '../services/chatService';
import { AIService } from '../services/aiService';
import { useAI } from '../contexts/AIContext';

interface ChatBotProps {
  isOpen: boolean;
  onClose: () => void;
  appData?: AppDataContext;
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'ai',
  content: '👋 Namaste! Main **JLS AI Assistant** hoon. Aap apne business data ke baare mein mujhse pooch sakte hain!\n\n_Kuch examples:_\n• "Meri total sales kitni hai?"\n• "Kitne customers hain?"\n• "Is mahine kitna expense hua?"\n• "Sabse zyada kaun sa product bik raha hai?"',
  timestamp: Date.now(),
};

export const ChatBot: React.FC<ChatBotProps> = ({ isOpen, onClose, appData }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { isConfigured, showKeySetup } = useAI();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setError('');

    if (!isConfigured) {
      showKeySetup('AI Chat');
      return;
    }

    setIsLoading(true);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const aiText = await ChatService.sendMessage(text, appData);
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: aiText, timestamp: Date.now() },
      ]);
    } catch (err: any) {
      setError(err.message || 'Kuch error aaya');
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: `❌ **Error:** ${err.message || 'AI se baat karne mein problem aayi'}\n\n👉 Apna API key check karein ya dubara try karein.`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    ChatService.clearHistory();
    setMessages([INITIAL_MESSAGE]);
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickQuestions = [
    'Total sales kitni hai?',
    'Kitne customers hain?',
    'Kya aaj koi sale hui?',
    'Meri expense summary do',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">JLS AI Assistant</h2>
            <p className="text-indigo-200 text-xs">Gemini AI • Business Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-5 h-5 text-white/80" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/80" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-900">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-700 rounded-bl-md'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-1 ${
                      msg.role === 'user' ? 'order-2' : ''
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-white/80" />
                    ) : (
                      <Bot className="w-4 h-4 text-indigo-500 shrink-0" />
                    )}
                  </div>
                  <div className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'text-white' : ''}`}>
                    {msg.content.split('\n').map((line, j) => (
                      <React.Fragment key={j}>
                        {line}
                        {j < msg.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md p-4 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Soch raha hoon...
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick questions */}
        {messages.length <= 1 && !isLoading && (
          <div className="mt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 text-center">
              Try asking:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200 dark:border-indigo-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConfigured ? "Apna sawaal poochhein..." : "Pehle API key set karein..."}
              disabled={isLoading}
              className="w-full px-4 py-3 pr-10 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
            />
            {!isConfigured && (
              <button
                onClick={() => showKeySetup('AI Chat')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors"
              >
                <Key className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !isConfigured}
            className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
          Powered by Google Gemini AI — Answers are AI-generated
        </p>
      </div>
    </div>
  );
};
