import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, FriendItem, FriendRequestItem, DirectMessage } from '../types';
import { 
  X, Users, UserPlus, MessageSquare, ArrowLeft, Send, Image, 
  Search, Check, UserCheck, Trash2, RefreshCw
} from 'lucide-react';
import { 
  getFriendsList, getFriendRequestsList, searchPlayers, 
  sendFriendRequestApi, respondFriendRequestApi, getDirectMessagesApi, 
  sendDirectMessageApi, uploadChatMediaApi, markFriendMessagesAsReadApi,
  getUnreadFriendChatCountsApi, deleteFriendApi, supabase, isSupabaseConfigured
} from '../lib/supabase';
import { useSmartLoading } from '../context/LoadingContext';

interface FriendsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

export const FriendsHubModal: React.FC<FriendsHubModalProps> = ({
  isOpen,
  onClose,
  userProfile
}) => {
  const { executeTask, isTaskLoading, startGlobalLoading, stopGlobalLoading } = useSmartLoading();
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sentRequests, setSentRequests] = useState<Record<string, boolean>>({});
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const hasInitialLoadedRef = useRef(false);

  // Delete Friend State
  const [activeDeleteFriendId, setActiveDeleteFriendId] = useState<string | null>(null);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Chat State
  const [activeFriend, setActiveFriend] = useState<FriendItem | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [mediaUploadState, setMediaUploadState] = useState<{ progress: number; previewUrl: string } | null>(null);
  const [friendUnreadCounts, setFriendUnreadCounts] = useState<Record<string, number>>({});

  // Fullscreen Media Preview Modal
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<any>(null);

  const scrollToBottom = (delay = 50) => {
    const doScroll = () => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    };
    doScroll();
    requestAnimationFrame(() => {
      doScroll();
      if (delay > 0) {
        setTimeout(doScroll, delay);
      }
    });
  };

  const isNearBottom = () => {
    if (!chatScrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 150;
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const loadUnreadCounts = async () => {
    if (!userProfile?.id) return;
    try {
      const { countsByFriend } = await getUnreadFriendChatCountsApi(userProfile.id);
      setFriendUnreadCounts(countsByFriend);
    } catch (e) {
      console.warn('loadUnreadCounts error:', e);
    }
  };

  const openFriendChat = async (friend: FriendItem) => {
    setMessages([]); // Start with clean empty state for the specific friend
    setActiveFriend(friend);
    setFriendUnreadCounts(prev => ({ ...prev, [friend.id]: 0 }));
    scrollToBottom(0);
    try {
      await markFriendMessagesAsReadApi(userProfile.id, friend.id);
      window.dispatchEvent(new Event('friends_changed'));
    } catch (e) {
      console.warn('markRead error on open chat:', e);
    }
  };

  const cancelDeletePrompt = () => {
    setActiveDeleteFriendId(null);
  };

  const triggerDeletePrompt = (friendId: string) => {
    setActiveDeleteFriendId(friendId);
  };

  useEffect(() => {
    return () => {
      cancelDeletePrompt();
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const loadData = async (_isFirstFetch = false) => {
    setIsLoadingRequests(true);
    try {
      const friendsData = await getFriendsList(userProfile.id);
      setFriends(friendsData);

      const requestsData = await getFriendRequestsList(userProfile.id);
      const filteredRequests = requestsData.filter(r => 
        String(r.receiver_id) === String(userProfile.id)
      );
      setRequests(filteredRequests);

      await loadUnreadCounts();
      hasInitialLoadedRef.current = true;
    } catch (e) {
      console.error("loadData error:", e);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const isFirst = !hasInitialLoadedRef.current;
      loadData(isFirst);

      // Realtime subscription for friend requests, friends, friend_chats, direct_messages
      let requestsChannel: any = null;
      let friendsChannel: any = null;
      let fcChannel: any = null;
      let dmChannel: any = null;

      if (isSupabaseConfigured() && supabase) {
        try {
          requestsChannel = supabase
            .channel(`friend_requests_realtime:${userProfile.id}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'friend_requests' },
              () => {
                loadData();
              }
            )
            .subscribe();

          friendsChannel = supabase
            .channel(`friends_realtime:${userProfile.id}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'friends' },
              () => {
                loadData();
              }
            )
            .subscribe();

          fcChannel = supabase
            .channel(`friend_chats_unread:${userProfile.id}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'friend_chats' },
              () => {
                loadUnreadCounts();
              }
            )
            .subscribe();
        } catch (e) {
          console.warn('Realtime subscription error in FriendsHub:', e);
        }
      }

      return () => {
        if (requestsChannel) {
          try { supabase?.removeChannel(requestsChannel); } catch (e) {}
        }
        if (friendsChannel) {
          try { supabase?.removeChannel(friendsChannel); } catch (e) {}
        }
        if (fcChannel) {
          try { supabase?.removeChannel(fcChannel); } catch (e) {}
        }
      };
    }
  }, [isOpen, userProfile.id]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  // Debounced Search logic (250ms)
  useEffect(() => {
    const query = (searchQuery || '').trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchPlayers(query, userProfile.id);
        setSearchResults(results);
      } catch (err: any) {
        console.error('Search error in modal:', err);
        setSearchError(err?.message || 'Error searching profiles');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, userProfile.id]);

  // Chat Realtime & Polling
  useEffect(() => {
    let dmChannel: any = null;
    let fcChannel: any = null;
    let pollInterval: any = null;

    if (!activeFriend) {
      setMessages([]);
    } else {
      // Mark as read immediately when activeFriend is open
      markFriendMessagesAsReadApi(userProfile.id, activeFriend.id);
      setFriendUnreadCounts(prev => ({ ...prev, [activeFriend.id]: 0 }));
      window.dispatchEvent(new Event('friends_changed'));

      loadMessages(activeFriend.id);

      if (isSupabaseConfigured() && supabase) {
        try {
          fcChannel = supabase
            .channel(`friend_chats_active:${userProfile.id}:${activeFriend.id}`)
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'friend_chats' },
              (payload: any) => {
                const newMsgRow = payload.new;
                if (
                  (String(newMsgRow.sender_id) === String(userProfile.id) && String(newMsgRow.receiver_id) === String(activeFriend.id)) ||
                  (String(newMsgRow.sender_id) === String(activeFriend.id) && String(newMsgRow.receiver_id) === String(userProfile.id))
                ) {
                  const mapped: DirectMessage = {
                    id: String(newMsgRow.id),
                    sender_id: String(newMsgRow.sender_id),
                    sender_username: 'Player',
                    sender_avatar: null,
                    receiver_id: String(newMsgRow.receiver_id),
                    message_text: String(newMsgRow.message || newMsgRow.message_text || ''),
                    media_url: newMsgRow.media_url || null,
                    media_type: (newMsgRow.media_type?.includes('image') || newMsgRow.media_url) ? 'image' : undefined,
                    created_at: newMsgRow.created_at || new Date().toISOString(),
                    is_read: true
                  };

                  setMessages(prev => {
                    if (prev.some(m => m.id === mapped.id)) return prev;
                    return [...prev, mapped];
                  });

                  markFriendMessagesAsReadApi(userProfile.id, activeFriend.id);
                  setFriendUnreadCounts(prev => ({ ...prev, [activeFriend.id]: 0 }));
                  window.dispatchEvent(new Event('friends_changed'));

                  if (isNearBottom() || String(newMsgRow.sender_id) === String(userProfile.id)) {
                    scrollToBottom(50);
                  }
                }
              }
            )
            .subscribe();
        } catch (e) {
          console.warn('Realtime error on friend_chats:', e);
        }
      }

      pollInterval = setInterval(() => {
        if (activeFriend) {
          loadMessages(activeFriend.id);
          markFriendMessagesAsReadApi(userProfile.id, activeFriend.id);
          setFriendUnreadCounts(prev => ({ ...prev, [activeFriend.id]: 0 }));
          window.dispatchEvent(new Event('friends_changed'));
        }
      }, 3000);
    }

    return () => {
      if (fcChannel) {
        try { supabase?.removeChannel(fcChannel); } catch (e) {}
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [activeFriend, userProfile.id]);

  // Auto-scroll to bottom whenever activeFriend changes or new messages load/arrive
  useEffect(() => {
    if (activeFriend) {
      scrollToBottom(0);
      const t1 = setTimeout(() => scrollToBottom(0), 50);
      const t2 = setTimeout(() => scrollToBottom(0), 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [activeFriend?.id, messages.length]);

  const loadMessages = async (friendId: string) => {
    const msgs = await getDirectMessagesApi(userProfile.id, friendId);
    setMessages(prev => {
      // Filter prev to ONLY contain messages between current user and friendId (no cross-friend leakage)
      const currentFriendMsgs = prev.filter(m => 
        (String(m.sender_id) === String(userProfile.id) && String(m.receiver_id) === String(friendId)) ||
        (String(m.sender_id) === String(friendId) && String(m.receiver_id) === String(userProfile.id))
      );
      
      const map = new Map<string, DirectMessage>();
      [...currentFriendMsgs, ...msgs].forEach(m => map.set(m.id, m));
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSendRequest = async (target: FriendItem) => {
    executeTask(`friend_send_${target.id}`, async () => {
      setSentRequests(prev => ({ ...prev, [target.id]: true }));
      const res = await sendFriendRequestApi(userProfile, target);
      if (res.success) {
        showToast('✅ Friend request sent!');
      } else {
        showToast(`❌ ${res.error || 'Failed to send request'}`);
      }
      loadData();
    });
  };

  const handleRespondRequest = async (requestId: string, action: 'accept' | 'reject') => {
    executeTask(`friend_respond_${requestId}_${action}`, async () => {
      const apiAction = action === 'accept' ? 'accepted' : 'rejected';
      const res = await respondFriendRequestApi(requestId, apiAction, userProfile);
      if (res.success) {
        if (action === 'accept') {
          showToast('🎉 Friend request accepted!');
        } else {
          showToast('Friend request declined.');
        }
      } else {
        showToast(`❌ ${res.error || 'Failed to process request'}`);
      }
      loadData();
    }, {
      isGlobal: true,
      globalMessage: action === 'accept' ? 'Accepting Friend Request...' : 'Declining Friend Request...'
    });
  };

  const handleDeleteFriend = async (friend: FriendItem) => {
    executeTask(`friend_delete_${friend.id}`, async () => {
      cancelDeletePrompt();
      // Optimistic UI update
      setFriends(prev => prev.filter(f => f.id !== friend.id));
      if (activeFriend?.id === friend.id) {
        setActiveFriend(null);
      }

      const res = await deleteFriendApi(userProfile, friend);
      if (res.success) {
        showToast(`🗑️ Removed ${friend.name || friend.username} from friends`);
      } else {
        showToast(`❌ ${res.error || 'Failed to delete friend'}`);
      }
      loadData();
    }, {
      isGlobal: true,
      globalMessage: 'Removing Friend...'
    });
  };

  const isLongPressRef = React.useRef(false);

  const handleTouchStart = (friend: FriendItem) => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      triggerDeletePrompt(friend.id);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeFriend) return;

    const textToSend = newMessageText.trim();
    setNewMessageText('');

    try {
      const res = await sendDirectMessageApi(userProfile, activeFriend.id, textToSend);
      if (res.success && res.data) {
        setMessages(prev => {
          if (prev.some(m => m.id === res.data!.id)) return prev;
          return [...prev, res.data!];
        });
        scrollToBottom(50);
      } else {
        showToast(`❌ ${res.error || 'Failed to send message'}`);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      showToast(`❌ Error: ${err?.message || 'Failed to send message'}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFriend) return;

    if (!file.type.startsWith('image/')) {
      showToast('⚠️ Please upload an image file (PNG/JPG).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast('⚠️ Image file is too large (Max 15MB).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setMediaUploadState({ progress: 10, previewUrl });

    // Scroll smoothly to bottom so user sees upload card
    scrollToBottom(50);

    // Smooth liquid upload progress animation
    const progressInterval = setInterval(() => {
      setMediaUploadState(prev => {
        if (!prev) return null;
        if (prev.progress < 85) {
          const inc = Math.floor(Math.random() * 8) + 6;
          return { ...prev, progress: Math.min(85, prev.progress + inc) };
        }
        return prev;
      });
    }, 160);

    try {
      // 1. Upload to Supabase Storage chat-media bucket
      const { url, type, objectPath } = await uploadChatMediaApi(file, userProfile.id);
      if (!url) throw new Error('Upload returned no URL');

      // Update progress to 92% (upload completed, inserting record)
      setMediaUploadState(prev => prev ? { ...prev, progress: 92 } : null);

      // 2. Insert into friend_chats table with non-null message
      const res = await sendDirectMessageApi(userProfile, activeFriend.id, '', url, type, objectPath);
      
      if (res.success && res.data) {
        clearInterval(progressInterval);
        setMediaUploadState(prev => prev ? { ...prev, progress: 100 } : null);

        setMessages(prev => {
          if (prev.some(m => m.id === res.data!.id)) return prev;
          return [...prev, res.data!];
        });

        scrollToBottom(50);

        showToast('📷 Image sent successfully!');

        // Smoothly clear temporary upload card once image is committed
        setTimeout(() => {
          setMediaUploadState(null);
          URL.revokeObjectURL(previewUrl);
        }, 300);
      } else {
        clearInterval(progressInterval);
        setMediaUploadState(null);
        URL.revokeObjectURL(previewUrl);
        showToast(`❌ ${res.error || 'Failed to send image'}`);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setMediaUploadState(null);
      URL.revokeObjectURL(previewUrl);
      console.error('File upload failed:', err);
      showToast(`❌ Image upload failed: ${err?.message || 'Error'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 w-full h-screen bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 lg:p-6 overflow-hidden animate-in fade-in duration-200">
      <div className="w-full h-full md:max-h-[90vh] md:rounded-2xl max-w-3xl lg:max-w-4xl mx-auto bg-[#030a16] flex flex-col overflow-hidden relative shadow-2xl border border-[#00e5ff]/20">
        
        {/* TOAST BANNER */}
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[130] bg-[#00e5ff] text-[#030a16] px-4 py-2 rounded-xl shadow-xl font-black text-xs border border-white/40 animate-in fade-in slide-in-from-top-4 flex items-center gap-2">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* HEADER BAR: Either Active Chat Bar OR Social Hub Header */}
        {/* ======================================================== */}
        {activeFriend ? (
          // TOP ACTIVE CHAT BAR
          <div className="p-3 bg-[#030a16] border-b-2 border-t border-t-amber-500/20 border-b-cyan-500/40 flex items-center justify-between shadow-xl relative">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveFriend(null)}
                className="p-2 rounded-xl bg-[#07192e] border border-cyan-500/30 text-[#00e5ff] hover:bg-cyan-500/10 active:scale-95 transition-all"
                title="Back to Friends List"
              >
                <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
              </button>

              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 via-cyan-400 to-blue-500 p-0.5 shadow-md flex items-center justify-center">
                  <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-sm overflow-hidden">
                    {activeFriend.avatar_url ? (
                      <img src={activeFriend.avatar_url} alt="Friend Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      activeFriend.username?.charAt(0).toUpperCase() || 'P'
                    )}
                  </div>
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#030a16]" />
              </div>

              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                  {activeFriend.name || activeFriend.username}
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">
                    VIP
                  </span>
                </h3>
                {activeFriend.pubg_id_name && activeFriend.pubg_id_name !== 'N/A' && (
                  <p className="text-[10px] text-[#00e5ff] font-bold">
                    PUBG: {activeFriend.pubg_id_name}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
            </div>
          </div>
        ) : (
          // SOCIAL HUB HEADER
          <div className="p-4 bg-[#07192e] border-b border-[#00e5ff]/20 flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/20 border border-[#00e5ff]/40 flex items-center justify-center text-[#00e5ff]">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-wider uppercase flex items-center gap-1.5">
                  FRIENDS & SOCIAL DISCUSSION
                </h2>
                <p className="text-[10px] text-gray-400">1-on-1 VIP Player Messaging & Media Sharing</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MAIN BODY AREA: Active Chat Window OR Social Hub Tabs */}
        {/* ======================================================== */}
        {activeFriend ? (
          // ==================== VIP PRIVATE CHAT WINDOW ====================
          <div className="flex-1 flex flex-col min-h-0 bg-[#020710]">
            {/* Messages Scroll Area */}
            <div ref={chatScrollRef} className="flex-1 p-4 space-y-3 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                  <div className="w-12 h-12 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] mb-2 animate-bounce">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Start Chat with {activeFriend.username}!</h4>
                  <p className="text-[10px] text-gray-500 max-w-xs mt-1">
                    Send direct messages, strategy tips, or share gameplay screenshots.
                  </p>
                </div>
              ) : (
                messages.map(msg => {
                  const isSender = msg.sender_id === userProfile.id || msg.sender_id === 'current_user';

                  return (
                    <div 
                      key={msg.id}
                      className={`flex items-end gap-2 ${isSender ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* RECEIVER AVATAR LOGO beside bubble */}
                      {!isSender && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shrink-0 shadow-md mb-1">
                          <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-[10px] overflow-hidden">
                            {activeFriend.avatar_url ? (
                              <img src={activeFriend.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              activeFriend.username?.charAt(0).toUpperCase() || 'P'
                            )}
                          </div>
                        </div>
                      )}

                      {/* CHAT BUBBLE: Sent = Blue (Right), Received = Red (Left) */}
                      <div className={`max-w-[75%] space-y-1 ${
                        isSender 
                          ? 'bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl rounded-tr-none px-4 py-2.5 shadow-lg shadow-blue-900/30 border border-blue-400/20'
                          : 'bg-gradient-to-br from-red-800 to-red-955 text-red-50 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-md shadow-red-950/50 border border-red-500/20'
                      }`}>
                        {/* Media attachment render */}
                        {msg.media_url && (
                          <div 
                            onClick={() => setFullscreenMedia({ url: msg.media_url!, type: 'image' })}
                            className="rounded-xl overflow-hidden cursor-pointer border border-white/20 relative group my-1 bg-black/40"
                          >
                            <img 
                              src={msg.media_url} 
                              alt="Chat Attachment" 
                              className="w-full max-h-56 object-cover rounded-xl hover:scale-102 transition-all duration-200" 
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Text Message */}
                        {msg.message_text && msg.message_text !== '[image]' && (
                          <p className="text-xs leading-relaxed font-medium break-words">
                            {msg.message_text}
                          </p>
                        )}

                        <span className={`block text-[8px] font-mono mt-1 text-right ${isSender ? 'text-blue-200/90' : 'text-red-300/80'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Liquid Upload Progress Bubble (0% -> 100%) */}
              {mediaUploadState && (
                <div className="flex items-end gap-2 justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="max-w-[75%] bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl rounded-tr-none p-3 shadow-lg shadow-blue-900/40 border border-blue-400/40 space-y-2.5">
                    {/* Thumbnail with percentage fill overlay */}
                    <div className="relative rounded-xl overflow-hidden bg-black/60 border border-white/20">
                      <img 
                        src={mediaUploadState.previewUrl} 
                        alt="Uploading Preview" 
                        className="w-full max-h-48 object-cover opacity-80 filter brightness-90"
                      />
                      
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-3">
                        <div className="w-12 h-12 rounded-full bg-[#07192e]/90 border-2 border-[#00e5ff] flex items-center justify-center shadow-lg shadow-cyan-500/40 mb-1.5">
                          <span className="font-mono font-black text-sm text-[#00e5ff] tracking-tight">
                            {Math.round(mediaUploadState.progress)}%
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-cyan-200 uppercase tracking-wider">
                          {mediaUploadState.progress >= 100 
                            ? 'Sent ✨' 
                            : mediaUploadState.progress >= 90 
                              ? 'Finalizing...' 
                              : 'Uploading...'}
                        </span>
                      </div>
                    </div>

                    {/* Liquid / Fill Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-cyan-200">
                        <span>Uploading attachment</span>
                        <span className="font-bold">{Math.round(mediaUploadState.progress)}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-cyan-400/30">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 transition-all duration-200 relative overflow-hidden shadow-md shadow-cyan-400/40"
                          style={{ width: `${Math.max(5, Math.min(100, mediaUploadState.progress))}%` }}
                        >
                          {/* Liquid shine wave */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse w-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input Controls */}
            <form onSubmit={handleSendMessage} className="p-3 bg-[#030a16] border-t border-amber-500/25 flex items-center gap-2 shadow-[0_-4px_15px_rgba(0,0,0,0.5)] bg-gradient-to-t from-[#020710] to-[#030a16]">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileUpload} 
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(mediaUploadState)}
                className="p-2.5 rounded-xl bg-[#07192e] border border-cyan-500/30 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Attach Screenshot / Image"
              >
                <Image className="w-5 h-5 text-[#00e5ff]" />
              </button>

              <input
                type="text"
                value={newMessageText}
                onChange={e => setNewMessageText(e.target.value)}
                placeholder="Type VIP message or share media..."
                disabled={Boolean(mediaUploadState)}
                className="flex-1 bg-[#07192e] border border-cyan-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-amber-500 outline-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!newMessageText.trim() || Boolean(mediaUploadState)}
                className="px-4 py-2.5 bg-gradient-to-r from-[#00e5ff] to-cyan-500 text-[#030a16] font-extrabold text-xs rounded-xl flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-[#00e5ff]/20"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        ) : (
          // ==================== SOCIAL HUB TABS AREA ====================
          <div className="flex-1 flex flex-col min-h-0 bg-[#020710]">
            {/* 3 TABS HEADER */}
            <div className="flex border-b border-gray-800 bg-[#07192e]">
              <button
                onClick={() => setActiveTab('friends')}
                className={`flex-1 py-3 text-xs font-black flex items-center justify-center gap-2 transition-all border-b-2 ${
                  activeTab === 'friends'
                    ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>My Friends</span>
                {friends.length > 0 && (
                  <span className="text-[9px] bg-[#00e5ff]/20 text-[#00e5ff] px-1.5 py-0.2 rounded-full font-bold">
                    {friends.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('search')}
                className={`flex-1 py-3 text-xs font-black flex items-center justify-center gap-2 transition-all border-b-2 ${
                  activeTab === 'search'
                    ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Search className="w-4 h-4" />
                <span>Search Friends</span>
              </button>

              <button
                onClick={() => setActiveTab('requests')}
                className={`flex-1 py-3 text-xs font-black flex items-center justify-center gap-2 transition-all border-b-2 relative ${
                  activeTab === 'requests'
                    ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Requests</span>
                {requests.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-md">
                    {requests.length > 9 ? '9+' : requests.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 p-4 overflow-y-auto">
              {/* TAB 1: YOUR FRIENDS */}
              {activeTab === 'friends' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 mb-2">
                    💡 <span className="font-semibold text-gray-300">Tip:</span> Tap and hold on any friend bar to show the Delete option.
                  </p>

                  {friends.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] mx-auto">
                        <Users className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs font-bold text-white">No Friends Added Yet</h4>
                      <p className="text-[10px] text-gray-400 max-w-xs mx-auto">
                        Search for other PUBG players by IGN or Username to send friend requests and chat!
                      </p>
                      <button
                        onClick={() => setActiveTab('search')}
                        className="px-4 py-2 bg-[#00e5ff] text-[#030a16] font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all"
                      >
                        Search Players Now 🔍
                      </button>
                    </div>
                  ) : (
                    friends.map(friend => {
                      const isDeleting = activeDeleteFriendId === friend.id;

                      return (
                        <div
                          key={friend.id}
                          onTouchStart={() => handleTouchStart(friend)}
                          onTouchEnd={handleTouchEnd}
                          onMouseDown={() => handleTouchStart(friend)}
                          onMouseUp={handleTouchEnd}
                          onClick={() => {
                            if (isLongPressRef.current) {
                              isLongPressRef.current = false;
                              return;
                            }
                            if (!isDeleting) {
                              openFriendChat(friend);
                            }
                          }}
                          className={`p-3 rounded-2xl bg-[#07192e] border transition-all select-none shadow-md ${
                            isDeleting 
                              ? 'border-red-500/70 bg-red-950/20' 
                              : 'border-gray-800 hover:border-[#00e5ff]/50 cursor-pointer active:scale-98'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shadow-md flex items-center justify-center">
                                  <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-base overflow-hidden">
                                    {friend.avatar_url ? (
                                      <img src={friend.avatar_url} alt="Friend Avatar" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      friend.username?.charAt(0).toUpperCase() || 'P'
                                    )}
                                  </div>
                                </div>
                                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#030a16]" />
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-black text-white group-hover:text-[#00e5ff] transition-colors">
                                    {friend.name || friend.username}
                                  </h4>
                                  <span className="text-[9px] text-[#00e5ff] bg-[#00e5ff]/10 px-1 rounded border border-[#00e5ff]/30 font-bold">
                                    @{friend.username}
                                  </span>
                                </div>
                                {friend.pubg_id_name && friend.pubg_id_name !== 'N/A' && (
                                  <p className="text-[10px] text-gray-400">
                                    PUBG: <span className="text-[#00e5ff] font-bold">{friend.pubg_id_name}</span>
                                  </p>
                                )}
                                {friend.last_message && (
                                  <p className="text-[10px] text-gray-400 truncate max-w-[180px] mt-0.5">
                                    {friend.last_message}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Actions Area */}
                            {isDeleting ? (
                              <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFriend(friend);
                                  }}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg shadow-red-600/30 active:scale-95 transition-all flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelDeletePrompt();
                                  }}
                                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {friendUnreadCounts[friend.id] > 0 && (
                                  <span className="min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-md animate-pulse">
                                    {friendUnreadCounts[friend.id] > 9 ? '9+' : friendUnreadCounts[friend.id]}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFriendChat(friend);
                                  }}
                                  className="p-2 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all"
                                  title="Open VIP Private Chat"
                                >
                                  <MessageSquare className="w-4 h-4 text-[#00e5ff]" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: SEARCH FRIENDS */}
              {activeTab === 'search' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder="Search with username"
                      className="w-full bg-[#07192e] border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-[#00e5ff] outline-none"
                    />
                  </div>

                  {searchError ? (
                    <div className="p-8 text-center text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      ⚠️ {searchError}
                    </div>
                  ) : isSearching ? (
                    <div className="p-8 text-center text-gray-400 text-xs animate-pulse">
                      Searching players database... 🔍
                    </div>
                  ) : searchQuery.trim().length < 2 ? (
                    <div className="p-8 text-center text-gray-500 text-xs italic">
                      Type at least 2 characters to search by username...
                    </div>
                  ) : searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      No players found matching "{searchQuery}".
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map(player => {
                        const isAlreadyFriend = friends.some(f => f.id === player.id);
                        const isSent = sentRequests[player.id];
                        const hasIncoming = requests.some(r => r.sender_id === player.id && r.status === 'pending');

                        return (
                          <div
                            key={player.id}
                            className="p-3 rounded-2xl bg-[#07192e] border border-gray-800 flex items-center justify-between shadow-md"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shrink-0">
                                <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-xs overflow-hidden">
                                  {player.avatar_url ? (
                                    <img src={player.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                    player.username?.charAt(0).toUpperCase() || 'P'
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-black text-white">{player.name || player.username}</h4>
                                  <span className="text-[9px] text-[#00e5ff] bg-[#00e5ff]/10 px-1 rounded font-bold font-mono">@{player.username}</span>
                                </div>
                                <p className="text-[10px] text-gray-400">
                                  {player.pubg_id_name ? (
                                    <>PUBG: <span className="text-[#00e5ff] font-bold">{player.pubg_id_name}</span></>
                                  ) : (
                                    <span className="text-gray-500 italic">No PUBG IGN set</span>
                                  )}
                                </p>
                              </div>
                            </div>

                            {isAlreadyFriend ? (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-xl border border-emerald-500/30 font-bold flex items-center gap-1 cursor-not-allowed">
                                <UserCheck className="w-3 h-3" /> FRIENDS
                              </span>
                            ) : isSent ? (
                              <span className="text-[10px] bg-cyan-500/20 text-[#00e5ff] px-2.5 py-1 rounded-xl border border-[#00e5ff]/30 font-bold flex items-center gap-1 cursor-not-allowed">
                                <Check className="w-3 h-3" /> REQUEST SUBMITTED
                              </span>
                            ) : hasIncoming ? (
                              <button
                                onClick={() => setActiveTab('requests')}
                                className="px-3 py-1.5 bg-amber-500 text-black font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all"
                              >
                                Respond in Requests
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSendRequest(player)}
                                className="px-3 py-1.5 bg-[#00e5ff] hover:bg-[#33ebff] text-[#030a16] font-extrabold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> Send Friend Request
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: FRIEND REQUESTS */}
              {activeTab === 'requests' && (
                <div className="space-y-3">
                  {isLoadingRequests ? (
                    <div className="p-8 text-center space-y-2 text-gray-400">
                      <div className="w-6 h-6 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs">Loading requests...</p>
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="p-8 text-center space-y-2 text-gray-400">
                      <UserCheck className="w-8 h-8 text-[#00e5ff] mx-auto opacity-50" />
                      <p className="text-xs font-bold text-white">No pending requests</p>
                      <p className="text-[10px] text-gray-500">Incoming requests from players will appear here.</p>
                    </div>
                  ) : (
                    requests.map(req => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-2xl bg-[#07192e] border border-[#00e5ff]/30 flex items-center justify-between shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shrink-0">
                            <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-xs overflow-hidden">
                              {req.sender_avatar ? (
                                <img src={req.sender_avatar} alt="Sender Avatar" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                req.sender_username?.charAt(0).toUpperCase() || 'P'
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-black text-white">{req.sender_name || req.sender_username}</h4>
                              <span className="text-[9px] text-[#00e5ff] font-bold">@{req.sender_username}</span>
                            </div>
                            <p className="text-[10px] text-gray-400">PUBG: <span className="text-[#00e5ff] font-bold">{req.sender_pubg_name || 'N/A'}</span></p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRespondRequest(req.id, 'accept')}
                            disabled={isTaskLoading(`friend_respond_${req.id}_accept`)}
                            className="px-3 py-1.5 bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            {isTaskLoading(`friend_respond_${req.id}_accept`) ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespondRequest(req.id, 'reject')}
                            disabled={isTaskLoading(`friend_respond_${req.id}_reject`)}
                            className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/30 active:scale-95 transition-all disabled:opacity-50"
                            title="Reject Request"
                          >
                            {isTaskLoading(`friend_respond_${req.id}_reject`) ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ======================================================== */}
      {/* FULLSCREEN MEDIA VIEW MODAL (Images / Videos) */}
      {/* ======================================================== */}
      {fullscreenMedia && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <button
            onClick={() => setFullscreenMedia(null)}
            className="absolute top-4 right-4 p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 active:scale-95 transition-all shadow-xl z-10"
            title="Close Fullscreen Media"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <div className="max-w-4xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl border border-white/10">
            {fullscreenMedia.type === 'video' ? (
              <video 
                src={fullscreenMedia.url} 
                controls 
                autoPlay 
                className="max-w-full max-h-[80vh] rounded-2xl"
              />
            ) : (
              <img 
                src={fullscreenMedia.url} 
                alt="Fullscreen Preview" 
                className="max-w-full max-h-[80vh] object-contain rounded-2xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
