import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Phone as WhatsApp, ShieldCheck, User, Loader2, AlertTriangle } from 'lucide-react';
import { UserProfile, ChatMessage } from '../types';
import {
  getAdminChatMessagesForPlayer,
  sendPlayerSupportMessage,
  markAdminChatAsRead,
  supabase,
  isSupabaseConfigured
} from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

interface SupportChatProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile | null;
}

export const SupportChat: React.FC<SupportChatProps> = ({ isOpen, onClose, userProfile }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userId = userProfile?.id;

  // Safe fetch helper
  const fetchThreadMessages = async () => {
    if (!userId) return;
    try {
      setFetchError(null);
      const rows = await getAdminChatMessagesForPlayer(userId);
      const mapped: ChatMessage[] = rows.map((m) => ({
        id: m.id,
        sender_id: m.sender_type === 'admin' ? 'admin' : m.player_id,
        sender_username: m.sender_type === 'admin' ? 'MVP ADMIN' : (userProfile?.username || 'Player'),
        sender_pubg_name: (userProfile?.pubg_id_name || userProfile?.pubg_name || ''),
        receiver_id: m.sender_type === 'admin' ? m.player_id : 'admin',
        message_text: m.message,
        is_read: m.is_read,
        created_at: m.created_at
      }));
      setMessages(mapped);

      // Mark admin messages to this player as read
      try {
        await markAdminChatAsRead(userId, 'player');
      } catch (err) {
        console.warn('markAdminChatAsRead non-fatal warning:', err);
      }
    } catch (err: any) {
      console.error('Error fetching support chat messages:', err);
      setFetchError(err?.message || 'Unable to load messages');
      setMessages([]);
    }
  };

  // On open: fetch messages, realtime subscription & poll every 5s while open
  useEffect(() => {
    if (!isOpen || !userId) {
      setMessages([]);
      return;
    }

    setSendError(null);
    setFetchError(null);
    setIsLoading(true);

    fetchThreadMessages().finally(() => {
      setIsLoading(false);
    });

    let channel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        channel = supabase
          .channel(`support_chat_${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'admin_chats',
              filter: `player_id=eq.${userId}`
            },
            () => {
              fetchThreadMessages();
            }
          )
          .subscribe();
      } catch (e) {
        console.warn('Realtime subscription error in SupportChat:', e);
      }
    }

    // 5-second interval poll for fallback updates
    const interval = setInterval(() => {
      if (isOpen && userId) {
        fetchThreadMessages();
      }
    }, 5000);

    return () => {
      if (channel && supabase) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {}
      }
      clearInterval(interval);
    };
  }, [isOpen, userId]);

  // Auto-scroll to bottom safely across layout passes
  const scrollToBottom = () => {
    const doScroll = () => {
      try {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } catch (e) {
        console.warn('Scroll warning:', e);
      }
    };
    doScroll();
    requestAnimationFrame(() => {
      doScroll();
      setTimeout(doScroll, 50);
      setTimeout(doScroll, 200);
    });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = (newMessage || '').trim();
    if (!cleanText || isSending) return;

    if (!userProfile || !userProfile.id) {
      const msg = 'Please login again to send a message.';
      setSendError(msg);
      alert(msg);
      return;
    }

    setSendError(null);
    setIsSending(true);

    try {
      const sentMsg = await sendPlayerSupportMessage(userProfile.id, cleanText);

      const uiMsg: ChatMessage = {
        id: sentMsg.id,
        sender_id: userProfile.id,
        sender_username: userProfile.username || 'Player',
        sender_pubg_name: userProfile.pubg_id_name || userProfile.pubg_name || '',
        receiver_id: 'admin',
        message_text: sentMsg.message,
        is_read: sentMsg.is_read,
        created_at: sentMsg.created_at
      };

      setMessages((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((m) => m && m.id === uiMsg.id)) return list;
        return [...list, uiMsg];
      });
      setNewMessage('');
      setSendError(null);
      fetchThreadMessages();
    } catch (err: any) {
      console.error('Failed to send support message:', err);
      const errMsg = err?.message || 'Failed to send message. Please try again.';
      setSendError(errMsg);
      alert(errMsg); // Explicit requirement: on error alert(error.message) — never silent fail
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 320 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 320 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 right-0 w-full sm:w-[420px] h-full bg-[#030a16] border-l border-cyan-500/20 z-[100] shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-cyan-500/20 bg-[#07192e] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40 shadow-lg shadow-emerald-500/10">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  MVP Support Desk
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">
                    Official Admin • Online
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              aria-label="Close Support Chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* WhatsApp Direct Line */}
          <div className="p-3.5 bg-emerald-500/10 border-b border-emerald-500/20">
            <a
              href="https://wa.me/923010626633"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <WhatsApp className="w-4 h-4 fill-current" />
              Chat via WhatsApp (Instant)
            </a>
            <p className="text-[9px] text-emerald-400/80 text-center mt-1.5 font-bold uppercase tracking-tighter">
              Fast Helpline: 0301-0626633
            </p>
          </div>

          {/* Chat Messages Container */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#030a16]"
          >
            {!userProfile || !userProfile.id ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Authentication Required
                </h4>
                <p className="text-[11px] text-gray-400">Please login again to access live support chat.</p>
              </div>
            ) : isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Loading Live Support...
                </p>
              </div>
            ) : fetchError ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
                <p className="text-xs text-rose-400 font-bold uppercase tracking-wider">
                  {fetchError}
                </p>
                <button
                  onClick={() => fetchThreadMessages()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-all"
                >
                  Retry
                </button>
              </div>
            ) : !Array.isArray(messages) || messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-4 border border-cyan-500/20 shadow-inner">
                  <MessageSquare className="w-8 h-8 text-cyan-400" />
                </div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-1.5">
                  Need Help or Have a Question?
                </h4>
                <p className="text-[11px] text-gray-400 leading-relaxed max-w-[240px] mx-auto">
                  Type your message below. The MVP Admin team will review and reply directly to you.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                if (!msg) return null;
                const isPlayer = msg.sender_id === userProfile.id;
                const formattedTime = msg.created_at
                  ? new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '';

                return (
                  <div
                    key={msg.id || `msg-${idx}`}
                    className={`flex ${isPlayer ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] flex gap-2.5 ${
                        isPlayer ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border shadow-md ${
                          isPlayer
                            ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                            : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        }`}
                      >
                        {isPlayer ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                      </div>

                      {/* Bubble Content */}
                      <div className="space-y-1">
                        <div
                          className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-lg ${
                            isPlayer
                              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-tr-none shadow-cyan-500/10'
                              : 'bg-[#0a233f] text-emerald-100 font-medium rounded-tl-none border border-emerald-500/30 shadow-emerald-950/40'
                          }`}
                        >
                          {msg.message_text || ''}
                        </div>

                        {/* Metadata Tag */}
                        <div
                          className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                            isPlayer
                              ? 'justify-end text-cyan-400/80'
                              : 'justify-start text-emerald-400'
                          }`}
                        >
                          <span>{isPlayer ? 'YOU' : '🛡️ MVP ADMIN'}</span>
                          {formattedTime && (
                            <>
                              <span>•</span>
                              <span>{formattedTime}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-cyan-500/20 bg-[#07192e]">
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder={userProfile?.id ? "Type your message to Admin..." : "Please login to chat..."}
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  disabled={isSending || !userProfile?.id}
                  className="w-full pl-4 pr-12 py-3 rounded-xl bg-[#030a16] border border-cyan-500/30 text-white text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder:text-gray-500 shadow-inner disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || isSending || !userProfile?.id}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-black font-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center justify-center"
                  aria-label="Send Message"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    <Send className="w-4 h-4 text-black" />
                  )}
                </button>
              </div>
              {sendError && (
                <p className="text-[11px] text-rose-400 font-bold px-1 animate-pulse">
                  ⚠️ {sendError}
                </p>
              )}
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
