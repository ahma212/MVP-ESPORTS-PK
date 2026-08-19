import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, ShieldCheck, Check, Search, ArrowLeft, Loader2, Gamepad2, CheckCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../types';
import {
  supabase,
  isSupabaseConfigured,
  getAllAdminChatsRows,
  getAdminChatMessagesForPlayer,
  sendAdminReplyMessage,
  markAdminChatAsRead,
  AdminChatMessage
} from '../lib/supabase';

interface PlayerConversation {
  playerId: string;
  username: string;
  pubgName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export const AdminChatPanel: React.FC = () => {
  const [allChatRows, setAllChatRows] = useState<AdminChatMessage[]>([]);
  const [threadMessages, setThreadMessages] = useState<AdminChatMessage[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profilesMap, setProfilesMap] = useState<Map<string, { username: string; pubg_name: string }>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all profiles map to enrich conversation cards
  const fetchProfiles = async () => {
    if (!isSupabaseConfigured() || !supabase) return;
    try {
      const { data } = await supabase.from('profiles').select('id, username, pubg_name, name');
      if (Array.isArray(data)) {
        const map = new Map<string, { username: string; pubg_name: string; name?: string }>();
        data.forEach((p: any) => {
          if (!p || !p.id) return;
          const uName = (p.username || '').trim().replace(/^@/, '');
          const pName = (p.pubg_name || '').trim();
          const fullName = (p.name || '').trim();
          
          // Priority: username -> pubg_name -> name -> 'Player'
          const resolvedUsername = uName || pName || fullName || 'Player';
          map.set(String(p.id), { username: resolvedUsername, pubg_name: pName, name: fullName });
        });
        setProfilesMap(map);
      }
    } catch (e) {
      console.warn('Error fetching profiles in AdminChatPanel:', e);
    }
  };

  // Fetch all admin_chats rows safely
  const refreshAllRows = async () => {
    try {
      setLoadError(null);
      const rows = await getAllAdminChatsRows();
      setAllChatRows(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      console.error('Error loading admin_chats in AdminChatPanel:', err);
      setLoadError(err?.message || 'Failed to load chats');
      setAllChatRows([]);
    }
  };

  // Load selected player's thread messages
  const loadSelectedThread = async (playerId: string) => {
    try {
      const rows = await getAdminChatMessagesForPlayer(playerId);
      setThreadMessages(rows);
      await markAdminChatAsRead(playerId, 'admin');
    } catch (e) {
      console.warn('Error loading thread for player:', e);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refreshAllRows(), fetchProfiles()]);
    if (selectedPlayerId) {
      await loadSelectedThread(selectedPlayerId);
    }
  };

  // Initial load, Realtime subscription & 5s polling interval
  useEffect(() => {
    setIsLoading(true);
    refreshAll().finally(() => {
      setIsLoading(false);
    });

    let channel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        channel = supabase
          .channel('admin_chats_panel_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'admin_chats'
            },
            () => {
              refreshAllRows();
            }
          )
          .subscribe();
      } catch (e) {
        console.warn('Realtime error in AdminChatPanel:', e);
      }
    }

    // Interval refreshes chat rows without re-fetching full profiles table repeatedly
    const interval = setInterval(() => {
      refreshAllRows();
    }, 5000);

    return () => {
      if (channel && supabase) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {}
      }
      clearInterval(interval);
    };
  }, []);

  // When admin selects a player thread
  useEffect(() => {
    if (selectedPlayerId) {
      loadSelectedThread(selectedPlayerId);
    } else {
      setThreadMessages([]);
    }
  }, [selectedPlayerId]);

  // Auto-scroll on new message or selected player change in open thread
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
    if (selectedPlayerId) {
      scrollToBottom();
    }
  }, [threadMessages, selectedPlayerId]);

  // Group messages into Player Conversations safely
  const playerConversations: Record<string, PlayerConversation> = {};

  allChatRows.forEach((msg) => {
    if (!msg || !msg.player_id) return;
    const playerId = msg.player_id;

    const profileData = profilesMap.get(playerId);
    const senderPubg = profileData?.pubg_name || '';
    const rawUsername = profileData?.username || 'Player';
    const cleanUsername = String(rawUsername || 'Player').replace(/^@/, '');

    if (!playerConversations[playerId]) {
      playerConversations[playerId] = {
        playerId,
        username: cleanUsername,
        pubgName: senderPubg,
        lastMessage: msg.message || '',
        lastMessageTime: msg.created_at || new Date().toISOString(),
        unreadCount: 0
      };
    }

    const conv = playerConversations[playerId];

    if (senderPubg && !conv.pubgName) {
      conv.pubgName = senderPubg;
    }
    if (cleanUsername && cleanUsername !== 'Player') {
      conv.username = cleanUsername;
    }

    // Unread count: Player -> Admin message not read yet
    if (msg.sender_type === 'player' && !msg.is_read) {
      conv.unreadCount++;
    }

    // Latest message preview
    const msgDate = new Date(msg.created_at || 0).getTime();
    const curDate = new Date(conv.lastMessageTime || 0).getTime();
    if (msgDate >= curDate) {
      conv.lastMessage = msg.message || '';
      conv.lastMessageTime = msg.created_at;
      if (senderPubg) conv.pubgName = senderPubg;
    }
  });

  const conversationList = Object.values(playerConversations).sort(
    (a, b) => new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()
  );

  const filteredConversations = conversationList.filter((c) => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (!q) return true;
    return (
      (c.username || '').toLowerCase().includes(q) ||
      (c.pubgName || '').toLowerCase().includes(q) ||
      (c.lastMessage || '').toLowerCase().includes(q)
    );
  });

  const activePlayer = selectedPlayerId ? playerConversations[selectedPlayerId] : null;

  const currentThreadMessages = threadMessages;

  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = (newMessage || '').trim();
    if (!cleanText || !selectedPlayerId || isSending) return;

    setSendError(null);
    setIsSending(true);

    try {
      const sentMsg = await sendAdminReplyMessage(selectedPlayerId, cleanText);

      setThreadMessages((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((m) => m && m.id === sentMsg.id)) return list;
        return [...list, sentMsg];
      });
      setNewMessage('');
      setSendError(null);
      refreshAll();
    } catch (err: any) {
      console.error('Exception in handleSendAdminReply:', err);
      const errMsg = err?.message || 'Failed to send reply';
      setSendError(errMsg);
      alert(errMsg); // Explicit requirement: alert on error
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[620px] bg-[#030a16] rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
      {/* LEFT SIDEBAR: Player Requests List */}
      <div
        className={`w-full sm:w-84 md:w-96 border-r border-gray-800/80 bg-[#040f1d] flex flex-col ${
          selectedPlayerId ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {/* List Header */}
        <div className="p-4 border-b border-gray-800 bg-[#07192e] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Player Support Requests
                </h3>
                <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">
                  {conversationList.length} Active Conversations
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setIsLoading(true);
                refreshAll().finally(() => setIsLoading(false));
              }}
              title="Refresh Messages"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Username or PUBG Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#030a16] border border-gray-800 text-white text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Conversation List / Player Request Boxes */}
        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-800/40">
          {isLoading && conversationList.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Loading Requests...</p>
            </div>
          ) : loadError ? (
            <div className="p-8 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-xs text-rose-400 font-bold uppercase tracking-wider">Failed to load chats</p>
              <p className="text-[10px] text-gray-400">{loadError}</p>
              <button
                onClick={() => {
                  setIsLoading(true);
                  refreshAll().finally(() => setIsLoading(false));
                }}
                className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg font-bold"
              >
                Retry
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-gray-700 mx-auto" />
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">No Support Requests</p>
              <p className="text-[10px] text-gray-600">When players send messages to Admin Support, they appear here live.</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedPlayerId === conv.playerId;
              const timeStr = conv.lastMessageTime
                ? new Date(conv.lastMessageTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '';

              return (
                <button
                  key={conv.playerId}
                  onClick={() => setSelectedPlayerId(conv.playerId)}
                  className={`w-full p-3.5 flex gap-3 items-start text-left transition-all relative ${
                    isSelected
                      ? 'bg-cyan-500/10 border-l-4 border-l-cyan-400 shadow-inner'
                      : 'hover:bg-[#07192e]/60'
                  }`}
                >
                  {/* Player Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0c243e] to-[#05111d] border border-cyan-500/30 flex items-center justify-center flex-shrink-0 text-cyan-300 font-black text-sm shadow-md">
                    {conv.username.charAt(0).toUpperCase() || 'P'}
                  </div>

                  {/* Player Info Box */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-black text-white truncate tracking-wide">
                        @{conv.username}
                      </span>
                      <span className="text-[9px] font-bold text-gray-400 flex-shrink-0">
                        {timeStr}
                      </span>
                    </div>

                    {/* PUBG IGN Badge */}
                    <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-wider">
                        <Gamepad2 className="w-2.5 h-2.5" />
                        {conv.pubgName ? conv.pubgName : 'IGN: Not Set'}
                      </span>
                    </div>

                    {/* Last Message Preview */}
                    <p className="text-[11px] text-gray-400 line-clamp-1 leading-snug">
                      {conv.lastMessage}
                    </p>
                  </div>

                  {/* Unread Counter Badge */}
                  {conv.unreadCount > 0 && (
                    <div className="flex-shrink-0 ml-1">
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-red-600/30 animate-pulse">
                        {conv.unreadCount} NEW
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT MAIN CHAT THREAD */}
      <div
        className={`flex-1 flex flex-col bg-[#030a16] ${
          !selectedPlayerId ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {selectedPlayerId && activePlayer ? (
          <>
            {/* Thread Header */}
            <div className="p-3.5 sm:p-4 border-b border-gray-800 bg-[#07192e] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedPlayerId(null)}
                  className="sm:hidden p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-md">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      @{activePlayer.username}
                    </h3>
                    {activePlayer.pubgName && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                        PUBG: {activePlayer.pubgName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Direct Player Support Channel
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#030a16]"
            >
              {currentThreadMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <MessageSquare className="w-8 h-8 text-gray-700" />
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                    No Messages in this Thread
                  </p>
                  <p className="text-[10px] text-gray-500 max-w-xs">
                    Send a reply below to reach out to @{activePlayer.username}.
                  </p>
                </div>
              ) : (
                currentThreadMessages.map((msg, idx) => {
                  if (!msg) return null;
                  const isAdminMsg = msg.sender_type === 'admin';
                  const formattedTime = msg.created_at
                    ? new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '';

                  return (
                    <div
                      key={msg.id || `admin-msg-${idx}`}
                      className={`flex ${isAdminMsg ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] flex gap-2.5 ${
                          isAdminMsg ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border shadow-md ${
                            isAdminMsg
                              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                              : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                          }`}
                        >
                          {isAdminMsg ? (
                            <ShieldCheck className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </div>

                        {/* Bubble */}
                        <div className="space-y-1">
                          <div
                            className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-lg ${
                              isAdminMsg
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-tr-none shadow-emerald-950/30'
                                : 'bg-[#0a233f] text-cyan-50 font-medium rounded-tl-none border border-cyan-500/30 shadow-cyan-950/40'
                            }`}
                          >
                            {msg.message || ''}
                          </div>

                          {/* Meta line */}
                          <div
                            className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isAdminMsg
                                ? 'justify-end text-emerald-400'
                                : 'justify-start text-cyan-400/80'
                            }`}
                          >
                            <span>
                              {isAdminMsg
                                ? '🛡️ MVP ADMIN'
                                : `@${activePlayer.username}${
                                    activePlayer.pubgName ? ` (${activePlayer.pubgName})` : ''
                                  }`}
                            </span>
                            {formattedTime && (
                              <>
                                <span>•</span>
                                <span>{formattedTime}</span>
                              </>
                            )}
                            {isAdminMsg && (
                              <span className="inline-flex items-center" title={msg.is_read ? "Read by Player" : "Delivered"}>
                                {msg.is_read ? (
                                  <CheckCheck className="w-3 h-3 text-cyan-400" />
                                ) : (
                                  <Check className="w-3 h-3 text-emerald-400/60" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Admin Reply Form */}
            <div className="p-3.5 sm:p-4 border-t border-gray-800 bg-[#07192e]">
              <form onSubmit={handleSendAdminReply} className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={`Reply directly to @${activePlayer.username} (${activePlayer.pubgName || 'Player'})...`}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      if (sendError) setSendError(null);
                    }}
                    disabled={isSending}
                    className="w-full pl-4 pr-12 py-3 rounded-xl bg-[#030a16] border border-emerald-500/30 text-white text-xs font-medium focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all placeholder:text-gray-500 shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || isSending}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center"
                    aria-label="Send Reply"
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
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-inner">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Select a Player Request
            </h3>
            <p className="text-xs text-gray-400 font-medium max-w-[280px] leading-relaxed">
              Click any conversation card on the left to view the live chat thread and send official admin replies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
