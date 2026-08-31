import React, { useState, useEffect, useRef } from 'react';
import { Match, WalletTransaction, MatchType, MapType, SlotBooking, MatchResult, PlayerResult, UserProfile, Announcement, LiveStream, BanRecord, LeaderboardVideo, RoomCredential, Poll } from '../types';
import { X, Shield, Plus, KeyRound, Check, AlertCircle, RefreshCw, Trophy, DollarSign, Users, Crosshair, Send, Trash2, Edit3, CheckCircle2, UserCheck, Star, ArrowLeft, ArrowDownLeft, ArrowUpRight, Eye, ZoomIn, ZoomOut, RotateCcw, FileText, XCircle, Bell, Video, Clock, Ban, UserX, MessageSquare, ScrollText, Activity, Search, Filter, BarChart2, Vote, Flame, Gamepad2, ExternalLink, Calendar, Award } from 'lucide-react';
import { supabase, isSupabaseConfigured, parseAmount, getMatchBookings, fetchMatchBookingsFromSupabase, adminSaveSlotBooking, adminRemoveSlotBooking, removeAllMatchBookings, saveMatchResult, getMatchResults, _matchResultsCache, getAllProfiles, saveAllProfiles, getLocalProfile, saveLocalProfile, getYoutubeThumbnail, formatStreamViewers, adminAdjustWalletBalance, getBans, saveBan, removeBan, fetchBansFromSupabase, searchPlayerByUsername, deleteUserAccountByAdmin, formatRemainingBanTime, getDeletionRequests, getChatMessages, fetchLeaderboardVideosApi, uploadLeaderboardVideoApi, deleteLeaderboardVideoApi, normalizeLeaderboardCategory, getLocalTransactions, uploadMatchBannerToSupabase, ensureFreshSupabaseSession, fetchPublishedMatchResultsFromSupabase, deletePublishedMatchResultApi } from '../lib/supabase';

import { AdminChatPanel } from './AdminChatPanel';
import { AdminRulesPanel } from './AdminRulesPanel';
import { AdminPlayersHub } from './AdminPlayersHub';
import { PubgSeatGrid } from './PubgSeatGrid';
import { LiveBroadcastPanel } from './LiveBroadcastPanel';
import { ChatMessage } from '../types';
// Safe Push Notification Helper
const sendPushNotification = (payload: any) => {
  fetch('https://rsqakcncemlkscobizcr.supabase.co/functions/v1/send-push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sb_publishable_uo4Pa8vev48bV3KP75rr8A_G-_72OvB'
    },
    body: JSON.stringify(payload)
  }).catch(err => console.log("Push failed silently:", err));
};

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: Match[];
  transactions: WalletTransaction[];
  onCreateMatch: (newMatch: Partial<Match>) => Promise<void>;
  onPublishRoomDetails: (matchId: string, roomId: string, roomPass: string, mapIndex?: number, releaseTimerMinutes?: number, roomCredentialsOverride?: RoomCredential[]) => void | Promise<void>;
  onEditMatch?: (updatedMatch: Match) => Promise<void>;
  onDeleteMatch?: (matchId: string) => Promise<void>;
  onApproveTransaction: (txId: string) => void;
  onRejectTransaction: (txId: string) => void;
  onDataRefresh?: () => void;
  announcements?: Announcement[];
  onSaveAnnouncement?: (ann: Announcement) => void;
  onDeleteAnnouncement?: (id: string) => void;
  onRefreshAnnouncements?: () => void;
  polls?: Poll[];
  onCreatePoll?: (question: string, options: string[]) => Promise<void>;
  onDeactivatePoll?: (pollId: string) => Promise<void>;
  onDeletePoll?: (pollId: string) => Promise<void>;
  liveStreams?: LiveStream[];
  onSaveLiveStream?: (stream: LiveStream) => Promise<void> | void;
  onDeleteLiveStream?: (id: string) => void;
  userProfile?: UserProfile | null;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  matches,
  transactions,
  onCreateMatch,
  onPublishRoomDetails,
  onEditMatch,
  onDeleteMatch,
  onApproveTransaction,
  onRejectTransaction,
  onDataRefresh,
  announcements = [],
  onSaveAnnouncement,
  onDeleteAnnouncement,
  onRefreshAnnouncements,
  polls = [],
  onCreatePoll,
  onDeactivatePoll,
  onDeletePoll,
  liveStreams = [],
  userProfile,
  onSaveLiveStream,
  onDeleteLiveStream
}) => {
  const [activeTab, setActiveTab] = useState<'publish' | 'slots' | 'results' | 'manage_matches' | 'create' | 'deposits' | 'withdrawals' | 'tx_history' | 'audit' | 'announcements' | 'polls' | 'livestreams' | 'rewards' | 'bans' | 'chats' | 'manage_rules' | 'players_hub' | 'leaderboard_video_manager' | 'live_broadcast'>('players_hub');
  
  // Poll creation state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState<string[]>(['', '']);
  const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);
  
  // Submit lock states for match creation to prevent duplicates
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const isSubmittingCreateRef = useRef(false);

  // Transaction History Tab States
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposits' | 'withdrawals' | 'approved' | 'rejected' | 'pending'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTransactions, setHistoryTransactions] = useState<any[]>([]);
  const [selectedDetailTx, setSelectedDetailTx] = useState<any | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Audit Tab States
  const [auditLogsData, setAuditLogsData] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const lastAuditFetchRef = useRef<number>(0);

  // Caching references to prevent duplicate heavy queries
  const profilesCacheRef = useRef<{ data: Map<string, any>; timestamp: number } | null>(null);
  const lastHistoryFetchRef = useRef<number>(0);

  // Helper to fetch/reuse cached profile map
  const getProfilesMap = async () => {
    const now = Date.now();
    if (profilesCacheRef.current && (now - profilesCacheRef.current.timestamp < 30000)) {
      return profilesCacheRef.current.data;
    }
    if (!supabase) return new Map<string, any>();
    try {
      const { data: profilesData } = await supabase.from('profiles').select('id, username, email, name');
      const map = new Map<string, any>();
      if (profilesData) {
        profilesData.forEach((p) => map.set(p.id, p));
      }
      profilesCacheRef.current = { data: map, timestamp: now };
      return map;
    } catch (e) {
      console.warn("Profile cache lookup warning:", e);
      return profilesCacheRef.current?.data || new Map<string, any>();
    }
  };

  const renderTxPlayer = (tx: any, profileMapParam?: Map<string, any>) => {
    if (!tx) return 'Unknown Player';

    const userId = tx.user_id || tx.player_id || tx.userId || tx.playerId;
    const pMap = profileMapParam || profilesCacheRef.current?.data;
    const prof = userId && pMap ? pMap.get(userId) : null;

    // 1. Direct username on tx or profile username
    const rawUname = tx.username || prof?.username;
    if (rawUname) {
      const cleanUname = String(rawUname).replace(/^@+/, '').trim();
      if (cleanUname && cleanUname.toLowerCase() !== 'player' && cleanUname.toLowerCase() !== 'n/a' && cleanUname.toLowerCase() !== 'unknown') {
        return `@${cleanUname}`;
      }
    }

    // 2. Profile name
    if (prof?.name) {
      const cleanName = String(prof.name).replace(/^@+/, '').trim();
      if (cleanName && cleanName.toLowerCase() !== 'player' && cleanName.toLowerCase() !== 'n/a' && cleanName.toLowerCase() !== 'unknown') {
        return cleanName.startsWith('@') ? cleanName : `@${cleanName}`;
      }
    }

    // 3. Transaction user_name
    if (tx.user_name) {
      const name = String(tx.user_name).replace(/^@+/, '').trim();
      if (name && name.toLowerCase() !== 'player' && name.toLowerCase() !== 'n/a' && name.toLowerCase() !== 'unknown') {
        return name.startsWith('@') ? name : `@${name}`;
      }
    }

// 4. Prefer account_title (player) over sender_name (Admin) for rewards
    if (tx.account_title || tx.sender_name) {
      const preferred =
        tx.type === 'reward_adjustment' ||
        tx.payment_method === 'Admin Reward' ||
        tx.payment_method === 'Admin Deduction'
          ? (tx.account_title || tx.username || tx.sender_name)
          : (tx.sender_name || tx.account_title);
      const sname = String(preferred || '').replace(/^@+/, '').trim();
      if (sname && sname.toLowerCase() !== 'player' && sname.toLowerCase() !== 'n/a' && sname.toLowerCase() !== 'unknown') {
        return sname.startsWith('@') ? sname : `@${sname}`;
      }
    }

    // 5. Fallback email handle
    const email = prof?.email || tx.user_email;
    if (email && email !== 'N/A' && typeof email === 'string' && email.includes('@')) {
      const handle = email.split('@')[0];
      if (handle && handle.toLowerCase() !== 'player' && handle.toLowerCase() !== 'n/a') {
        return `@${handle}`;
      }
    }

    return 'Unknown Player';
  };

  // Load data based on active tab
  useEffect(() => {
    if (!isOpen) return;

    if (activeTab === 'tx_history') {
      fetchTransactionHistory();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'deposits') {
      fetchPendingDepositRequests();
    } else if (activeTab === 'withdrawals') {
      fetchPendingWithdrawalRequests();
    } else if (activeTab === 'bans') {
      loadBansList();
    } else if (activeTab === 'chats') {
      loadChatMessages();
    } else if (activeTab === 'leaderboard_video_manager') {
      loadLeaderboardVideos();
    }
  }, [activeTab, isOpen]);

  const loadChatMessages = async () => {
    try {
      const cm = await getChatMessages();
      if (Array.isArray(cm)) setChatMessages(cm);
    } catch (e) {
      console.warn('Error loading chat messages:', e);
    }
  };

  // Reward States
  const [rewardUsername, setRewardUsername] = useState('');
  const [rewardActionType, setRewardActionType] = useState<'add' | 'deduct'>('add');
  const [rewardAmount, setRewardAmount] = useState<number>(0);
  const [isProcessingReward, setIsProcessingReward] = useState(false);
  const [rewardSuccessMsg, setRewardSuccessMsg] = useState<string | null>(null);
  const [rewardErrorMsg, setRewardErrorMsg] = useState<string | null>(null);
  const rewardSubmittingRef = useRef<boolean>(false);

  // Transaction action state (for single-click & debouncing)
  const [processingTxIds, setProcessingTxIds] = useState<string[]>([]);

  
  const [realtimeDepositRequests, setRealtimeDepositRequests] = useState<any[]>([]);
  const [realtimeWithdrawalRequests, setRealtimeWithdrawalRequests] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<any[]>([]);
  const [banUsername, setBanUsername] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('1 Day');
  const [searchedPlayer, setSearchedPlayer] = useState<UserProfile | null>(null);
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false);
  const [searchPlayerError, setSearchPlayerError] = useState<string | null>(null);
  const [isApplyingBan, setIsApplyingBan] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [unbanConfirmTarget, setUnbanConfirmTarget] = useState<{ id: string; username?: string; userId?: string; displayName: string } | null>(null);
  const [leaderboardVideos, setLeaderboardVideos] = useState<any[]>([]);
  const [selectedVideoFiles, setSelectedVideoFiles] = useState<{ [key: string]: File | null }>({});
  const [previewBlobUrls, setPreviewBlobUrls] = useState<{ [key: string]: string | null }>({});
  const [isPublishingVideo, setIsPublishingVideo] = useState<{ [key: string]: boolean }>({});
  const [isDeletingVideo, setIsDeletingVideo] = useState<{ [key: string]: boolean }>({});
  const [videoUploadProgress, setVideoUploadProgress] = useState<{ [key: string]: number }>({});
  const [videoUploadStage, setVideoUploadStage] = useState<{ [key: string]: string | null }>({});
  const [videoSlotErrors, setVideoSlotErrors] = useState<{ [key: string]: string | null }>({});
  const [newDepositRequestsBadge, setNewDepositRequestsBadge] = useState<number>(0);
  const [deleteConfirmMatchId, setDeleteConfirmMatchId] = useState<string | null>(null);
  const [deleteConfirmAnnouncementId, setDeleteConfirmAnnouncementId] = useState<string | null>(null);
  const [deleteConfirmPollId, setDeleteConfirmPollId] = useState<string | null>(null);
  const [deleteConfirmLiveStreamId, setDeleteConfirmLiveStreamId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [isSavingMatch, setIsSavingMatch] = useState<boolean>(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [isSubmittingAnn, setIsSubmittingAnn] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamViewers, setStreamViewers] = useState('');
  const [isPublishingStream, setIsPublishingStream] = useState<boolean>(false);


  const loadLeaderboardVideos = async () => {
    try {
      const lv = await fetchLeaderboardVideosApi();
      if (Array.isArray(lv)) setLeaderboardVideos(lv);
    } catch (e) {
      console.warn('Error loading leaderboard videos:', e);
    }
  };
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch(e){}
  };
  const handleApproveTxClick = async (e: React.MouseEvent, txId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (processingTxIds.includes(txId)) return;
    setProcessingTxIds(prev => [...prev, txId]);

    try {
      const isWithdrawal = activeTab === 'withdrawals' || realtimeWithdrawalRequests.some(r => r.id === txId);
      const tableName = isWithdrawal ? 'withdrawal_requests' : 'deposit_requests';

      // Check status in Supabase before processing
      if (isSupabaseConfigured() && supabase) {
        const { data: record } = await supabase
          .from(tableName)
          .select('status')
          .eq('id', txId)
          .maybeSingle();

        if (record && record.status !== 'pending') {
          alert("Already processed");
          setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
          setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));
          if (activeTab === 'deposits') fetchPendingDepositRequests();
          if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
          return;
        }
      }

      const adminId = userProfile?.id || 'admin';

      console.log(`[Admin] handleApproveTxClick: txId=${txId}, adminId=${adminId}`);

      // Filter out approved transaction from pending lists immediately
      setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
      setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));

      // Single authoritative approval handler
      await onApproveTransaction(txId);
      if (onDataRefresh) {
        onDataRefresh();
      }
      // Transaction Approve Notification Call
      // Re-fetch only if needed
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals')   fetchPendingWithdrawalRequests();
    } catch (err: any) {
      console.error('[Admin] Approval exception:', err);
      const errMsg = err?.message || "Approval failed: Player ID not found or balance update error";
      if (errMsg.toLowerCase().includes('already processed')) {
        alert("Already processed");
      } else {
        alert(errMsg);
      }
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } finally {
      setTimeout(() => {
        setProcessingTxIds(prev => prev.filter(id => id !== txId));
      }, 1000);
    }
  };

  const handleRejectTxClick = async (e: React.MouseEvent, txId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (processingTxIds.includes(txId)) return;
    setProcessingTxIds(prev => [...prev, txId]);

    try {
      const isWithdrawal = activeTab === 'withdrawals' || realtimeWithdrawalRequests.some(r => r.id === txId);
      const tableName = isWithdrawal ? 'withdrawal_requests' : 'deposit_requests';

      // Check status in Supabase before processing
      if (isSupabaseConfigured() && supabase) {
        const { data: record } = await supabase
          .from(tableName)
          .select('status')
          .eq('id', txId)
          .maybeSingle();

        if (record && record.status !== 'pending') {
          alert("Already processed");
          setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
          setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));
          if (activeTab === 'deposits') fetchPendingDepositRequests();
          if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
          return;
        }
      }

      const adminId = userProfile?.id || 'admin';

      // Filter out rejected transaction from pending lists immediately
      setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
      setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));

      // Single authoritative rejection handler
      await onRejectTransaction(txId);
      if (onDataRefresh) {
        onDataRefresh();
      }
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } catch (err: any) {
      console.error('[Admin] Rejection exception:', err);
      const errMsg = err?.message || 'Error rejecting transaction';
      if (errMsg.toLowerCase().includes('already processed')) {
        alert("Already processed");
      } else {
        alert(errMsg);
      }
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } finally {
      setTimeout(() => {
        setProcessingTxIds(prev => prev.filter(id => id !== txId));
      }, 1000);
    }
  };

  const fetchPendingDepositRequests = async () => {
    if (!supabase) return;
    try {
      const [depRes, profileMap] = await Promise.all([
        supabase
          .from('deposit_requests')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        getProfilesMap()
      ]);
      const depData = depRes.data;

      const combinedMap = new Map<string, any>();
      if (depData) {
        depData.forEach((d: any) => {
          const playerId = d.player_id || d.user_id;
          const prof = profileMap.get(playerId);
          const rawUname = d.username || prof?.username || '';
          const cleanUname = String(rawUname).replace(/^@+/, '');
          const resolvedName = d.user_name || prof?.name || prof?.username || '';
          const resolvedEmail = d.user_email || prof?.email || 'N/A';
          combinedMap.set(d.id, {
            id: d.id,
            player_id: playerId,
            user_id: playerId,
            username: cleanUname,
            user_name: resolvedName,
            user_email: resolvedEmail,
            amount: Number(d.amount || 0),
            type: 'deposit',
            payment_method: d.payment_method || 'JazzCash/EasyPaisa',
            account_number: d.account_number || '',
            account_title: d.account_title || d.sender_name || '',
            sender_name: d.sender_name || d.account_title || '',
            trx_id: d.transaction_id || d.trx_id || '',
            screenshot_url: d.screenshot_url || d.screenshotUrl || d.screenshot || d.receipt_url || d.image_url || '',
            status: 'pending',
            created_at: d.created_at || new Date().toISOString()
          });
        });
      }
      setRealtimeDepositRequests(Array.from(combinedMap.values()));
    } catch (err) {
      console.error('Exception in fetchPendingDepositRequests:', err);
    }
  };

  const fetchPendingWithdrawalRequests = async () => {
    if (!supabase) return;
    try {
      const [wdRes, profileMap] = await Promise.all([
        supabase
          .from('withdrawal_requests')
          .select('*')
          .or('status.eq.pending,status.eq.PENDING')
          .order('created_at', { ascending: false }),
        getProfilesMap()
      ]);
      const wdData = wdRes.data;

      const combinedMap = new Map<string, any>();

      if (wdData) {
        wdData.forEach((w: any) => {
          const playerId = w.player_id || w.user_id;
          const prof = profileMap.get(playerId);
          const rawUname = w.username || prof?.username || '';
          const cleanUname = String(rawUname).replace(/^@+/, '');
          combinedMap.set(w.id, {
            id: w.id,
            player_id: playerId,
            user_id: playerId,
            user_email: prof?.email || w.user_email || '',
            user_name: prof?.name || w.user_name || '',
            username: cleanUname,
            amount: Number(w.amount || 0),
            type: 'withdrawal',
            payment_method: w.payment_method || 'JazzCash/EasyPaisa',
            account_number: w.account_number || '',
            account_title: w.account_title || '',
            screenshot_url: w.screenshot_url || '',
            status: 'pending',
            created_at: w.created_at || new Date().toISOString()
          });
        });
      }

      setRealtimeWithdrawalRequests(Array.from(combinedMap.values()));
    } catch (err) {
      console.error('Exception in fetchPendingWithdrawalRequests:', err);
    }
  };

  const fetchAuditLogs = async (force = false) => {
    const now = Date.now();
    if (!force && auditLogsData.length > 0 && now - lastAuditFetchRef.current < 15000) {
      return;
    }

    if (auditLogsData.length === 0) {
      setIsLoadingAudit(true);
    }

    try {
      if (!supabase) {
        setAuditLogsData([]);
        setIsLoadingAudit(false);
        return;
      }

      const [depRes, wdRes, txRes, profileMap] = await Promise.all([
        supabase.from('deposit_requests').select('*').neq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('withdrawal_requests').select('*').neq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').neq('type', 'match_entry').neq('status', 'pending').order('created_at', { ascending: false }),
        getProfilesMap()
      ]);

      const depData = depRes.data || [];
      const wdData = wdRes.data || [];
      const txData = txRes.data || [];

      const parseStatus = (rawStatus: any): 'approved' | 'rejected' => {
        const st = String(rawStatus || 'approved').toLowerCase();
        if (st === 'rejected' || st === 'declined' || st === 'cancelled') return 'rejected';
        return 'approved';
      };

      const combinedMap = new Map<string, any>();

      if (depData) {
        depData.forEach((d: any) => {
          const userId = d.player_id || d.user_id;
          const prof = userId ? profileMap.get(userId) : null;
          const rawUname = d.username || prof?.username || prof?.name || '';
          const cleanUname = String(rawUname).replace(/^@+/, '').trim();
          const resolvedName = prof?.name || d.user_name || prof?.username || '';
          const resolvedEmail = prof?.email || d.user_email || 'N/A';

          combinedMap.set(`dep-${d.id}`, {
            id: d.id,
            user_id: userId,
            player_id: userId,
            user_email: resolvedEmail,
            user_name: resolvedName,
            username: cleanUname,
            amount: Number(d.amount || 0),
            type: d.type || 'deposit',
            payment_method: d.payment_method || 'JazzCash/EasyPaisa',
            account_number: d.account_number || '',
            account_title: d.account_title || d.sender_name || '',
            sender_name: d.sender_name || d.account_title || '',
            trx_id: d.transaction_id || d.trx_id || '',
            status: parseStatus(d.status),
            created_at: d.created_at || new Date().toISOString()
          });
        });
      }

      if (wdData) {
        wdData.forEach((w: any) => {
          const userId = w.player_id || w.user_id;
          const prof = userId ? profileMap.get(userId) : null;
          const rawUname = w.username || prof?.username || prof?.name || '';
          const cleanUname = String(rawUname).replace(/^@+/, '').trim();
          const resolvedName = prof?.name || w.user_name || prof?.username || '';
          const resolvedEmail = prof?.email || w.user_email || 'N/A';

          combinedMap.set(`wd-${w.id}`, {
            id: w.id,
            user_id: userId,
            player_id: userId,
            user_email: resolvedEmail,
            user_name: resolvedName,
            username: cleanUname,
            amount: Number(w.amount || 0),
            type: w.type || 'withdrawal',
            payment_method: w.payment_method || 'JazzCash/EasyPaisa',
            account_number: w.account_number || '',
            account_title: w.account_title || '',
            trx_id: w.trx_id || w.transaction_id || '',
            status: parseStatus(w.status),
            created_at: w.created_at || new Date().toISOString()
          });
        });
      }

      if (txData) {
        txData.forEach((t: any) => {
          if (t.type === 'match_entry') return; // strictly skip match_entry

          const userId = t.user_id || t.player_id;
          const prefix = t.type === 'withdrawal' ? 'wd' : t.type === 'deposit' ? 'dep' : (t.type || 'tx');
          const key = `${prefix}-${t.id}`;

          if (!combinedMap.has(key) && !combinedMap.has(t.id)) {
            const prof = userId ? profileMap.get(userId) : null;
            const rawUname = t.username || prof?.username || prof?.name || '';
            const cleanUname = String(rawUname).replace(/^@+/, '').trim();
            const resolvedName = prof?.name || t.user_name || prof?.username || '';
            const resolvedEmail = prof?.email || t.user_email || 'N/A';

            combinedMap.set(key, {
              id: t.id,
              user_id: userId,
              player_id: userId,
              user_email: resolvedEmail,
              user_name: resolvedName,
              username: cleanUname,
              amount: Number(t.amount || 0),
              type: t.type || 'reward_adjustment',
              payment_method: t.payment_method || '',
              account_number: t.account_number || '',
              account_title: t.account_title || t.sender_name || '',
              sender_name: t.sender_name || t.account_title || '',
              trx_id: t.trx_id || t.transaction_id || '',
              status: parseStatus(t.status || 'approved'),
              created_at: t.created_at || new Date().toISOString()
            });
          }
        });
      }

      const list = Array.from(combinedMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setAuditLogsData(list);
      lastAuditFetchRef.current = now;
    } catch (err) {
      console.error('Exception in fetchAuditLogs:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const fetchTransactionHistory = async (force = false) => {
    const now = Date.now();
    // Cache check: Skip if loaded less than 15 seconds ago and not forced
    if (!force && historyTransactions.length > 0 && now - lastHistoryFetchRef.current < 15000) {
      return;
    }

    if (historyTransactions.length === 0) {
      setIsLoadingHistory(true);
    }

    try {
      if (!supabase || !isSupabaseConfigured()) {
        setHistoryTransactions([]);
        setIsLoadingHistory(false);
        return;
      }

      const [depRes, wdRes, txRes, profileMap] = await Promise.all([
        supabase.from('deposit_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').neq('type', 'match_entry').order('created_at', { ascending: false }),
        getProfilesMap()
      ]);

      const depData = depRes.data;
      const wdData = wdRes.data;
      const txData = txRes.data;

      const parseStatus = (rawStatus: any): 'pending' | 'approved' | 'rejected' => {
        const st = String(rawStatus || 'pending').toLowerCase();
        if (st === 'approved' || st === 'completed') return 'approved';
        if (st === 'rejected') return 'rejected';
        return 'pending';
      };

      const combinedMap = new Map<string, any>();

      if (depData) {
        depData.forEach((d: any) => {
          const userId = d.player_id || d.user_id;
          const prof = profileMap.get(userId);
          const rawUname = d.username || prof?.username || '';
          const cleanUname = String(rawUname).replace(/^@+/, '');
          const resolvedName = d.user_name || prof?.name || prof?.username || '';
          const resolvedEmail = d.user_email || prof?.email || 'N/A';
          combinedMap.set(`dep-${d.id}`, {
            id: d.id,
            user_id: userId,
            player_id: userId,
            user_email: resolvedEmail,
            user_name: resolvedName,
            username: cleanUname,
            amount: Number(d.amount || 0),
            type: 'deposit',
            payment_method: d.payment_method || 'JazzCash/EasyPaisa',
            account_number: d.account_number || '',
            account_title: d.account_title || d.sender_name || '',
            sender_name: d.sender_name || d.account_title || '',
            trx_id: d.transaction_id || d.trx_id || '',
            screenshot_url: d.screenshot_url || d.screenshotUrl || d.screenshot || d.receipt_url || d.image_url || '',
            status: parseStatus(d.status),
            created_at: d.created_at || new Date().toISOString()
          });
        });
      }

      if (wdData) {
        wdData.forEach((w: any) => {
          const playerId = w.player_id || w.user_id;
          const prof = profileMap.get(playerId);
          const rawUname = w.username || prof?.username || '';
          const cleanUname = String(rawUname).replace(/^@+/, '');
          const resolvedName = w.user_name || prof?.name || prof?.username || '';
          const resolvedEmail = w.user_email || prof?.email || 'N/A';
          combinedMap.set(`wd-${w.id}`, {
            id: w.id,
            user_id: playerId,
            player_id: playerId,
            user_email: resolvedEmail,
            user_name: resolvedName,
            username: cleanUname,
            amount: Number(w.amount || 0),
            type: 'withdrawal',
            payment_method: w.payment_method || 'JazzCash/EasyPaisa',
            account_number: w.account_number || '',
            account_title: w.account_title || '',
            screenshot_url: w.screenshot_url || '',
            status: parseStatus(w.status),
            created_at: w.created_at || new Date().toISOString()
          });
        });
      }

      if (txData) {
        txData.forEach((t: any) => {
          if (t.type === 'match_entry') return; // strictly exclude match_entry
          const playerId = t.user_id || t.player_id;
          const prefix = t.type === 'withdrawal' ? 'wd' : t.type === 'deposit' ? 'dep' : (t.type || 'tx');
          const key = `${prefix}-${t.id}`;
          if (!combinedMap.has(key) && !combinedMap.has(t.id)) {
            const prof = profileMap.get(playerId);
            const rawUname = t.username || prof?.username || '';
            const cleanUname = String(rawUname).replace(/^@+/, '');
            const resolvedName = t.user_name || prof?.name || prof?.username || '';
            const resolvedEmail = t.user_email || prof?.email || 'N/A';
            combinedMap.set(key, {
              id: t.id,
              user_id: playerId,
              player_id: playerId,
              user_email: resolvedEmail,
              user_name: resolvedName,
              username: cleanUname,
              amount: Number(t.amount || 0),
              type: t.type || 'deposit',
              payment_method: t.payment_method || 'JazzCash/EasyPaisa',
              account_number: t.account_number || '',
              account_title: t.account_title || t.sender_name || '',
              sender_name: t.sender_name || t.account_title || '',
              trx_id: t.trx_id || t.transaction_id || '',
              screenshot_url: t.screenshot_url || '',
              status: parseStatus(t.status),
              created_at: t.created_at || new Date().toISOString()
            });
          }
        });
      }

      if (transactions) {
        transactions.forEach((t) => {
          if (t.type === 'match_entry') return; // strictly exclude match_entry
          const key = `${t.type === 'withdrawal' ? 'wd' : 'dep'}-${t.id}`;
          if (!combinedMap.has(key) && !combinedMap.has(t.id)) {
            const prof = profileMap.get(t.user_id);
            combinedMap.set(t.id, {
              id: t.id,
              user_id: t.user_id,
              user_email: prof?.email || t.user_email || 'N/A',
              user_name: prof?.name || t.user_name || '',
              username: prof?.username || t.username || '',
              amount: Number(t.amount || 0),
              type: t.type || 'deposit',
              payment_method: t.payment_method || 'JazzCash/EasyPaisa',
              account_number: t.account_number || '',
              account_title: t.account_title || t.sender_name || '',
              sender_name: t.sender_name || t.account_title || '',
              trx_id: t.trx_id || '',
              screenshot_url: t.screenshot_url || '',
              status: parseStatus(t.status),
              created_at: t.created_at || new Date().toISOString()
            });
          }
        });
      }

      const list = Array.from(combinedMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setHistoryTransactions(list);
      lastHistoryFetchRef.current = now;
    } catch (err) {
      console.error('Exception in fetchTransactionHistory:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    fetchPendingDepositRequests();
    fetchPendingWithdrawalRequests();

    const channelDep = supabase
      .channel('admin_deposit_requests_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposit_requests'
        },
        async (payload) => {
          await fetchPendingDepositRequests();
          if (activeTab === 'audit') fetchAuditLogs(true);
          if (activeTab === 'tx_history') fetchTransactionHistory(true);
          if (payload.eventType === 'INSERT') {
            const isPending = String(payload.new.status).toLowerCase() === 'pending';
            if (isPending) {
              playNotificationSound();
              setNewDepositRequestsBadge(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    const channelWd = supabase
      .channel('admin_withdrawal_requests_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests'
        },
        async () => {
          await fetchPendingWithdrawalRequests();
          if (activeTab === 'audit') fetchAuditLogs(true);
          if (activeTab === 'tx_history') fetchTransactionHistory(true);
        }
      )
      .subscribe();

    const channelWalletTx = supabase
      .channel('admin_wallet_transactions_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_transactions'
        },
        async () => {
          if (activeTab === 'audit') fetchAuditLogs(true);
          if (activeTab === 'tx_history') fetchTransactionHistory(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelDep);
      supabase.removeChannel(channelWd);
      supabase.removeChannel(channelWalletTx);
    };
  }, [isOpen, activeTab]);

  const loadBansList = async () => {
    try {
      const list = await fetchBansFromSupabase();
      setBannedPlayers(list);
    } catch (e) {
      console.warn('loadBansList error:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'deposits') {
      setNewDepositRequestsBadge(0);
    } else if (activeTab === 'announcements' && onRefreshAnnouncements) {
      onRefreshAnnouncements();
    } else if (activeTab === 'bans') {
      loadBansList();
    }
  }, [activeTab]);
const pendingDepositTransactions = Array.isArray(realtimeDepositRequests) && realtimeDepositRequests.length > 0
    ? realtimeDepositRequests
    : (Array.isArray(transactions) ? transactions.filter((t) => t && t.type === 'deposit' && t.status === 'pending') : []);

  const pendingWithdrawalTransactions = Array.isArray(realtimeWithdrawalRequests) && realtimeWithdrawalRequests.length > 0
    ? realtimeWithdrawalRequests
    : (Array.isArray(transactions) ? transactions.filter((t) => t && t.type === 'withdrawal' && t.status === 'pending') : []);
  const pendingDepositsCount = Array.isArray(realtimeDepositRequests) && realtimeDepositRequests.length > 0
    ? realtimeDepositRequests.length
    : (Array.isArray(transactions) ? transactions.filter(t => t && t.type === 'deposit' && t.status === 'pending').length : 0);
  const pendingWithdrawalsCount = Array.isArray(realtimeWithdrawalRequests) && realtimeWithdrawalRequests.length > 0
    ? realtimeWithdrawalRequests.length
    : (Array.isArray(transactions) ? transactions.filter(t => t && t.type === 'withdrawal' && t.status === 'pending').length : 0);
  const pendingChatMessages = Array.isArray(chatMessages) ? chatMessages.filter(m => m && !m.is_read).length : 0;

  const handleDeleteMatch = async (matchId: string) => {
    setDeletingMatchId(matchId);
    try {
      if (onDeleteMatch) {
        await onDeleteMatch(matchId);
        setDeleteConfirmMatchId(null);
      } else if (isSupabaseConfigured() && supabase) {
        // 1. Delete dependent slot_bookings first (ignore error if none)
        try {
          await supabase.from('slot_bookings').delete().eq('match_id', matchId);
        } catch (bookingErr) {
          console.warn(`Booking deletion notice from Supabase:`, bookingErr);
        }

        // 2. Delete dependent match_results if any (wrap try/catch; if table missing ignore)
        try {
          await supabase.from('match_results').delete().eq('match_id', matchId);
        } catch (resErr) {
          console.warn(`Match results deletion notice from Supabase:`, resErr);
        }

        // 3. Now delete the match itself permanently from Supabase matches table
        const { error: matchErr } = await supabase.from('matches').delete().eq('id', matchId);
        if (matchErr) {
          console.error(`Failed to delete match from Supabase: ${matchErr.message}`);
          alert(`Failed to delete match from Supabase: ${matchErr.message}`);
          return;
        }

        setDeleteConfirmMatchId(null);
        alert('Match deleted successfully');
        if (onDataRefresh) {
          try {
            await onDataRefresh();
          } catch (refreshErr) {
            console.warn('Refresh in AdminPanelModal failed but ignored safely:', refreshErr);
          }
        }
      } else {
        console.error('Delete match failed: Supabase is not connected.');
        alert('Supabase is not connected.');
        return;
      }
    } catch (err: any) {
      console.error('Error in handleDeleteMatch:', err);
      alert(err?.message || 'Failed to delete match.');
    } finally {
      setDeletingMatchId(null);
    }
  };

  const handleRewardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setRewardSuccessMsg(null);
    setRewardErrorMsg(null);

    if (rewardSubmittingRef.current || isProcessingReward) return;

    const trimmedUsername = (rewardUsername || '').trim();
    if (!trimmedUsername) {
      setRewardErrorMsg('Invalid username');
      alert('Invalid username');
      return;
    }

    if (!rewardAmount || rewardAmount <= 0) {
      setRewardErrorMsg('Enter a valid amount');
      alert('Enter a valid amount');
      return;
    }

    rewardSubmittingRef.current = true;
    setIsProcessingReward(true);

    try {
      const result = await adminAdjustWalletBalance(trimmedUsername, rewardAmount, rewardActionType);
      
      if (result.success) {
        setRewardSuccessMsg(result.message);
        alert(result.message);
        setRewardUsername('');
        setRewardAmount(0);
        if (onDataRefresh) {
          try {
            onDataRefresh();
          } catch (e) {
            console.warn('onDataRefresh warning:', e);
          }
        }
        try {
          fetchTransactionHistory(true);
        } catch (e) {
          console.warn('fetchTransactionHistory warning:', e);
        }
      } else {
        const errorMsg = result.message || 'Invalid username';
        setRewardErrorMsg(errorMsg);
        alert(errorMsg);
      }
    } catch (error: any) {
      console.error('Reward error:', error);
      const errorMsg = error?.message || 'Invalid username';
      setRewardErrorMsg(errorMsg);
      alert(errorMsg);
    } finally {
      rewardSubmittingRef.current = false;
      setIsProcessingReward(false);
    }
  };

  const handleSearchPlayer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = (banUsername || '').trim();
    if (!clean) {
      setSearchPlayerError('Please enter a player username to search.');
      setSearchedPlayer(null);
      return;
    }

    setIsSearchingPlayer(true);
    setSearchPlayerError(null);
    try {
      const p = await searchPlayerByUsername(clean);
      if (p) {
        setSearchedPlayer(p);
        setSearchPlayerError(null);
        setBanUsername('');
      } else {
        setSearchedPlayer(null);
        setSearchPlayerError(`No player found with username @${clean.replace(/^@+/, '')} in Supabase.`);
      }
    } catch (err: any) {
      setSearchedPlayer(null);
      setSearchPlayerError('Search error: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSearchingPlayer(false);
    }
  };

  const handleApplyBan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isApplyingBan) return;

    if (!searchedPlayer && !banUsername.trim()) {
      alert('Please search for a player username first or enter a username.');
      return;
    }

    const targetUsername = searchedPlayer ? searchedPlayer.username : banUsername.trim().replace(/^@+/, '');
    const targetUserId = searchedPlayer ? searchedPlayer.id : undefined;

    setIsApplyingBan(true);

    try {
      // Handle Permanent Delete Account option
      if (banDuration === 'Permanent Delete Account') {
        const confirmDelete = confirm(
          `💥 PERMANENT ACCOUNT DELETION\n\nAre you sure you want to PERMANENTLY DELETE account @${targetUsername}?\n\nThis will permanently delete the player from Supabase Auth and all database tables. This CANNOT be undone!`
        );
        if (!confirmDelete) {
          setIsApplyingBan(false);
          return;
        }

        const res = await deleteUserAccountByAdmin(targetUserId || '', targetUsername);
        if (res.success) {
          alert(`Player @${targetUsername} account has been PERMANENTLY DELETED from Supabase!`);
          setSearchedPlayer(null);
          setBanUsername('');
          setBanReason('');
          await loadBansList();
        } else {
          alert(`Failed to delete account: ${res.message}`);
        }
        return;
      }

      // Handle Temporary Bans (1 Day, 3 Days, 7 Days, 15 Days, 30 Days)
      let expiry: number | null = null;
      const now = Date.now();
      if (banDuration === '1 Day' || banDuration === '1 Day Ban') expiry = now + 86400000;
      else if (banDuration === '3 Days' || banDuration === '3 Days Ban') expiry = now + 86400000 * 3;
      else if (banDuration === '7 Days' || banDuration === '7 Days Ban') expiry = now + 86400000 * 7;
      else if (banDuration === '15 Days' || banDuration === '15 Days Ban') expiry = now + 86400000 * 15;
      else if (banDuration === '30 Days' || banDuration === '1 Month (30 Days)' || banDuration === '30 Days Ban') expiry = now + 86400000 * 30;

      const newBan: BanRecord = {
        id: crypto.randomUUID(),
        username: targetUsername,
        reason: banReason || 'No reason provided by Admin',
        duration: banDuration,
        expires_at: expiry,
        created_at: new Date().toISOString()
      };

      const res = await saveBan(newBan, targetUserId);
      if (res.success) {
        alert(`Player @${targetUsername} has been banned for ${banDuration}!`);
        setBanUsername('');
        setBanReason('');
        setSearchedPlayer(null);
        await loadBansList();
      } else {
        alert(`Failed to apply ban: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error applying action: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsApplyingBan(false);
    }
  };

  const triggerRemoveBanConfirm = (id: string, username?: string, userId?: string) => {
    const cleanUsername = (username || '').replace(/^@+/, '').trim();
    const displayName = cleanUsername ? `@${cleanUsername}` : (username || userId || id || 'this player');
    setUnbanConfirmTarget({ id, username, userId, displayName });
  };

  const handleRemoveBan = async (id: string, username?: string, userId?: string) => {
    console.log('🔴 [AdminPanelModal handleRemoveBan TRIGGERED]', { id, username, userId, unbanningId });

    if (unbanningId) {
      console.warn('🔴 [handleRemoveBan BLOCKED - another unban operation in progress]', unbanningId);
      return;
    }

    const cleanUsername = (username || '').replace(/^@+/, '').trim();
    const displayName = cleanUsername ? `@${cleanUsername}` : (username || userId || id || 'this player');

    const key = id || cleanUsername || userId || 'unbanning';
    setUnbanningId(key);

    try {
      console.log('🔴 [Calling removeBan API with params]:', { id, cleanUsername, userId });
      const res = await removeBan(id, cleanUsername, userId);
      console.log('🔴 [removeBan API response]:', res);

      if (res.success) {
        alert(`Player ${displayName} has been unbanned successfully!`);

        // Immediately filter out the unbanned player from local state list
        setBannedPlayers(prev => prev.filter(b => {
          const bName = (b.username || '').replace(/^@+/, '').toLowerCase();
          const targetName = cleanUsername.toLowerCase();
          if (b.id && id && b.id === id) return false;
          if (b.user_id && (userId || id) && (b.user_id === userId || b.user_id === id)) return false;
          if (targetName && bName === targetName) return false;
          return true;
        }));

        // Refresh searched player card if it matches the unbanned player
        if (searchedPlayer) {
          const sName = searchedPlayer.username.replace(/^@+/, '').toLowerCase();
          const targetName = cleanUsername.toLowerCase();
          if (sName === targetName || searchedPlayer.id === userId || searchedPlayer.id === id) {
            const updatedP = await searchPlayerByUsername(searchedPlayer.username);
            setSearchedPlayer(updatedP);
          }
        }

        // Always re-fetch clean list from Supabase
        await loadBansList();
      } else {
        alert(`Failed to remove ban: ${res.message}`);
      }
    } catch (err: any) {
      console.error('🔴 [Error in handleRemoveBan]:', err);
      alert(`Error removing ban: ${err?.message || 'Unknown error'}`);
    } finally {
      setUnbanningId(null);
      setUnbanConfirmTarget(null);
    }
  };

  // Screenshot Lightbox Modal State
  const [previewScreenshot, setPreviewScreenshot] = useState<{
    url: string;
    title: string;
    senderName?: string;
    accountNumber?: string;
    trxId?: string;
    timestamp?: string;
    method?: string;
    amount?: number;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Create & Edit match state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MatchType>('squad');
  const [map, setMap] = useState<MapType>('Erangel');
  const [matchTime, setMatchTime] = useState('Today | 08:00 PM (PKT)');
  const [entryFee, setEntryFee] = useState(100);
  const [firstPrize, setFirstPrize] = useState(2000);
  const [secondPrize, setSecondPrize] = useState(1000);
  const [thirdPrize, setThirdPrize] = useState(500);
  const [perKillPrize, setPerKillPrize] = useState(50);
  const [maxSlots, setMaxSlots] = useState(100);
  const [mapMaxSlots, setMapMaxSlots] = useState<number[]>([100, 100, 100, 100, 100, 100]);
  const [bannerUrl, setBannerUrl] = useState('');
  const [mapBanners, setMapBanners] = useState<string[]>(['', '', '', '', '', '']);
  const [matchRules, setMatchRules] = useState('');
  const [lockedSlots, setLockedSlots] = useState<number[]>([]);
  const [startTimeInput, setStartTimeInput] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingMapBanner, setIsUploadingMapBanner] = useState<boolean[]>([false, false, false, false, false, false]);
  const [hostMatchErrorMsg, setHostMatchErrorMsg] = useState<string | null>(null);
  const [hostMatchSuccessMsg, setHostMatchSuccessMsg] = useState<string | null>(null);

  // Tournament States
  const [tournamentMatchCount, setTournamentMatchCount] = useState<number>(3);
  const [tournamentMaps, setTournamentMaps] = useState<string[]>(['Erangel', 'Miramar', 'Rondo', 'Livik', 'Sanhok', 'Vikendi']);
  const [gapMinutes, setGapMinutes] = useState<number>(15);
  const [squadType, setSquadType] = useState<'SOLO' | 'DUO' | 'SQUAD'>('SQUAD');
  const [multiRoomIds, setMultiRoomIds] = useState<string[]>(['', '', '', '', '', '']);
  const [multiRoomPasses, setMultiRoomPasses] = useState<string[]>(['', '', '', '', '', '']);
  const [multiRoomTimers, setMultiRoomTimers] = useState<number[]>([0, 0, 0, 0, 0, 0]);

  const isAnyUploading = isUploadingBanner || isUploadingMapBanner.some(Boolean);

  const formatMatchTimeString = (datetimeLocalValue: string) => {
    if (!datetimeLocalValue) return '';
    const d = new Date(datetimeLocalValue);
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart} | ${timePart} (PKT)`;
  };

  const renderStartTimePickerSection = () => {
    const target = new Date(startTimeInput).getTime();
    const diff = Math.max(0, target - Date.now());
    const totalSecs = Math.floor(diff / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isMoreThan24Hours = diff > 24 * 60 * 60 * 1000;

    return (
      <div className="space-y-2 bg-[#030a16] p-3 rounded-xl border border-gray-800 my-2">
        <label className="text-[11px] font-bold text-gray-300 block mb-1">
          Target Match Start Date & Time * (Live Countdown)
        </label>
        <input
          type="datetime-local"
          value={startTimeInput}
          onChange={(e) => setStartTimeInput(e.target.value)}
          className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
          required
        />
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-3.5 h-3.5 text-[#00e5ff] animate-pulse" />
            <span className="text-[10px] font-bold">Start Time Preview:</span>
          </div>
          {isMoreThan24Hours ? (
            <span className="font-mono font-black text-[#00e5ff] bg-[#00e5ff]/10 px-2.5 py-1 rounded border border-[#00e5ff]/30 text-[10px]">
              📅 {formatMatchTimeString(startTimeInput)} (&gt; 24h away)
            </span>
          ) : (
            <span className="font-mono font-black text-[#00e5ff] bg-[#00e5ff]/10 px-2.5 py-1 rounded border border-[#00e5ff]/30 text-xs">
              Starts in {pad(hrs)} : {pad(mins)} : {pad(secs)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const toggleSlotLock = (slotNum: number) => {
    setLockedSlots(prev =>
      prev.includes(slotNum)
        ? prev.filter(s => s !== slotNum)
        : [...prev, slotNum].sort((a, b) => a - b)
    );
  };

  const renderSlotSelectorGrid = () => {
    const normSquadType = (squadType || 'SQUAD').toUpperCase();

    return (
      <div className="space-y-2 bg-[#030a16] p-3 rounded-xl border border-gray-800 my-2">
        <div className="flex justify-between items-center">
          <label className="text-[11px] font-bold text-gray-300 flex items-center gap-1">
            <span>🔒 PUBG Interactive Slot Locking Grid ({maxSlots} Slots)</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold bg-[#07192e] px-2 py-0.5 rounded border border-gray-700 uppercase">
              {normSquadType}
            </span>
            <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {lockedSlots.length} Locked
            </span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400">
          Click slot boxes below to toggle lock/unlock status (🔒 Locked). Locked slots cannot be booked by players.
        </p>

        <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
          <PubgSeatGrid
            mode="admin_lock"
            squadType={normSquadType}
            matchType={type}
            maxSlots={maxSlots}
            lockedSlots={lockedSlots}
            onSlotClick={toggleSlotLock}
            onToggleTeamLock={(slotsInTeam) => {
              const allLocked = slotsInTeam.every((s) => lockedSlots.includes(s));
              if (allLocked) {
                setLockedSlots((prev) => prev.filter((s) => !slotsInTeam.includes(s)));
              } else {
                setLockedSlots((prev) => Array.from(new Set([...prev, ...slotsInTeam])).sort((a, b) => a - b));
              }
            }}
          />
        </div>
      </div>
    );
  };

  const getDefaultMaxSlots = (m: string, t: MatchType) => {
    if (t === 'tdm' || m === 'Warehouse') return 8;
    if (['Livik', 'Karakin', 'Nusa'].includes(m)) return 52;
    return 100;
  };

  const handleMapChange = (newMap: MapType) => {
    setMap(newMap);
    setMaxSlots(getDefaultMaxSlots(newMap, type));
  };

  const handleTypeChange = (newType: MatchType) => {
    setType(newType);

    if (newType === 'solo' || newType === 'duo' || newType === 'squad') {
      setSquadType(newType.toUpperCase() as 'SOLO' | 'DUO' | 'SQUAD');
    }

    let nextMap = map;
    if (newType === 'wow') {
      nextMap = 'WOW';
      setMap('WOW');
    } else if (map === 'WOW') {
      nextMap = 'Erangel';
      setMap('Erangel');
    }
    setMaxSlots(getDefaultMaxSlots(nextMap, newType));

    if (newType !== 'tournament') {
      setTournamentMatchCount(1);
      setMapBanners(['', '', '', '', '', '']);
      setMapMaxSlots([100, 100, 100, 100, 100, 100]);
    } else {
      setTournamentMatchCount(3);
      setTournamentMaps(['Erangel', 'Miramar', 'Rondo', 'Livik', 'Sanhok', 'Vikendi']);
      setMapBanners(['', '', '', '', '', '']);
      setMapMaxSlots([100, 100, 100, 100, 100, 100]);
    }
  };

  const handleImageUpload = async (file: File, callback: (url: string) => void, mapIndex?: number) => {
    setHostMatchErrorMsg(null);
    setHostMatchSuccessMsg(null);

    if (file.size > 5 * 1024 * 1024) {
      const errorMsg = 'Max 5MB per image';
      setHostMatchErrorMsg(errorMsg);
      alert(`${errorMsg}\n\nPlease select an image under 5MB or paste a custom image URL.`);
      return;
    }

    if (mapIndex !== undefined) {
      setIsUploadingMapBanner(prev => {
        const copy = [...prev];
        copy[mapIndex] = true;
        return copy;
      });
    } else {
      setIsUploadingBanner(true);
    }

    try {
      const res = await uploadMatchBannerToSupabase(file);
      if (res.success && res.url) {
        callback(res.url);
      } else {
        const errorMsg = res.error || 'Failed to upload image to Supabase Storage.';
        setHostMatchErrorMsg(errorMsg);
        alert(`${errorMsg}\n\nFallback: You can paste a custom image URL manually in the input box.`);
      }
    } catch (err: any) {
      console.error('Error during image upload:', err);
      const errorMsg = err?.message || 'Failed to process image upload.';
      setHostMatchErrorMsg(errorMsg);
      alert(`${errorMsg}\n\nFallback: You can paste a custom image URL manually in the input box.`);
    } finally {
      if (mapIndex !== undefined) {
        setIsUploadingMapBanner(prev => {
          const copy = [...prev];
          copy[mapIndex] = false;
          return copy;
        });
      } else {
        setIsUploadingBanner(false);
      }
    }
  };

  const getLeaderboardVideoUrl = (category: string, rank: number = 1) => {
    const { aliases } = normalizeLeaderboardCategory(category);
    const uploaded = leaderboardVideos.find(v => (
      aliases.includes(v.category?.toLowerCase()?.trim())
    ) && Number(v.rank) === rank);
    if (uploaded?.video_url) return uploaded.video_url;

    return '';
  };

  const hasCustomVideo = (category: string, rank: number = 1) => {
    const { aliases } = normalizeLeaderboardCategory(category);
    return leaderboardVideos.some(v => (
      aliases.includes(v.category?.toLowerCase()?.trim())
    ) && Number(v.rank) === rank && !!v.video_url);
  };

  const handleSelectVideoFile = (category: string, file: File | null) => {
    if (!file) return;
    if (previewBlobUrls[category]) {
      try {
        URL.revokeObjectURL(previewBlobUrls[category]!);
      } catch (e) {}
    }
    const blobUrl = URL.createObjectURL(file);
    setSelectedVideoFiles(prev => ({ ...prev, [category]: file }));
    setPreviewBlobUrls(prev => ({ ...prev, [category]: blobUrl }));
    setVideoSlotErrors(prev => ({ ...prev, [category]: null }));
  };

  const handleClearStagedVideo = (category: string) => {
    if (previewBlobUrls[category]) {
      try {
        URL.revokeObjectURL(previewBlobUrls[category]!);
      } catch (e) {}
    }
    setSelectedVideoFiles(prev => ({ ...prev, [category]: null }));
    setPreviewBlobUrls(prev => ({ ...prev, [category]: null }));
    setVideoUploadProgress(prev => ({ ...prev, [category]: 0 }));
    setVideoUploadStage(prev => ({ ...prev, [category]: null }));
    setVideoSlotErrors(prev => ({ ...prev, [category]: null }));
  };

  const handlePublishLeaderboardVideo = async (category: string) => {
    const file = selectedVideoFiles[category];
    if (!file) {
      alert('Please select an HD MP4 video file first before publishing.');
      return;
    }

    // Step A: Refresh session before upload/publish
    if (isSupabaseConfigured() && supabase) {
      try {
        const sessionCheck = await ensureFreshSupabaseSession();
        if (!sessionCheck.valid) {
          alert('Session expired, please login again');
          return;
        }
      } catch (authErr: any) {
        console.error('Auth verification error:', authErr);
        alert('Session expired, please login again');
        return;
      }
    }

    setIsPublishingVideo(prev => ({ ...prev, [category]: true }));
    setVideoUploadProgress(prev => ({ ...prev, [category]: 5 }));
    setVideoUploadStage(prev => ({ ...prev, [category]: 'Starting upload...' }));
    setVideoSlotErrors(prev => ({ ...prev, [category]: null }));

    try {
      await uploadLeaderboardVideoApi(category, 1, file, (percent, stage) => {
        setVideoUploadProgress(prev => ({ ...prev, [category]: percent }));
        if (stage) {
          setVideoUploadStage(prev => ({ ...prev, [category]: stage }));
        }
      });

      // 4) Only when upload + DB upsert both succeed → bar 100% → alert "Video published to #1 card"
      setVideoUploadProgress(prev => ({ ...prev, [category]: 100 }));
      setVideoUploadStage(prev => ({ ...prev, [category]: 'Video published successfully!' }));
      await loadLeaderboardVideos();
      handleClearStagedVideo(category);
      alert('Video published to #1 card');
    } catch (err: any) {
      console.error('Error publishing leaderboard video:', err);
      const errMsg = err?.message || 'Failed to publish video to Supabase.';

      // Check if auth or JWT expired
      if (
        errMsg.toLowerCase().includes('session expired') || 
        errMsg.toLowerCase().includes('exp claim') || 
        errMsg.toLowerCase().includes('jwt') ||
        errMsg.toLowerCase().includes('token')
      ) {
        alert('Session expired, please login again');
      } else {
        alert(`Publish Failed: ${errMsg}`);
      }

      setVideoSlotErrors(prev => ({ ...prev, [category]: errMsg }));
      // 5) On failure: show error, reset bar, do not mark published
      setVideoUploadProgress(prev => ({ ...prev, [category]: 0 }));
      setVideoUploadStage(prev => ({ ...prev, [category]: null }));
    } finally {
      setIsPublishingVideo(prev => ({ ...prev, [category]: false }));
    }
  };

  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<string | null>(null);

  const performDeleteLeaderboardVideo = async (category: string) => {
    console.log('PERFORMING PERMANENT DELETE FOR CATEGORY:', category);

    if (isSupabaseConfigured() && supabase) {
      try {
        const sessionCheck = await ensureFreshSupabaseSession();
        if (!sessionCheck.valid) {
          alert('Session expired, please login again');
          return;
        }
      } catch (authErr: any) {
        console.error('Auth verification error:', authErr);
        alert('Session expired, please login again');
        return;
      }
    }

    setIsDeletingVideo(prev => ({ ...prev, [category]: true }));
    setVideoSlotErrors(prev => ({ ...prev, [category]: null }));

    try {
      const res = await deleteLeaderboardVideoApi(category, 1);
      await loadLeaderboardVideos();
      handleClearStagedVideo(category);
      setDeleteConfirmCategory(null);
      alert(res?.message || 'Video permanently deleted from Supabase & Card!');
    } catch (err: any) {
      console.error('Error deleting leaderboard video:', err);
      const errMsg = err?.message || 'Failed to remove video from Supabase.';
      if (
        errMsg.toLowerCase().includes('session expired') || 
        errMsg.toLowerCase().includes('exp claim') || 
        errMsg.toLowerCase().includes('jwt')
      ) {
        alert('Session expired, please login again');
      } else {
        alert(`Delete Failed: ${errMsg}`);
      }
      setVideoSlotErrors(prev => ({ ...prev, [category]: errMsg }));
    } finally {
      setIsDeletingVideo(prev => ({ ...prev, [category]: false }));
    }
  };

  const handleDeleteLeaderboardVideo = (category: string) => {
    console.log('DELETE CLICKED FOR CATEGORY:', category);
    setDeleteConfirmCategory(category);
  };

  // Active/upcoming selectable matches for management
  const activeUpcomingMatches = (matches || []).filter((m) => m.status !== 'completed' && !m.is_ended);
  const selectableMatches = activeUpcomingMatches.length > 0 ? activeUpcomingMatches : (matches || []);

  // Publish Room ID state
  const [selectedMatchId, setSelectedMatchId] = useState((matches || [])[0]?.id || '');
  const [selectedMapIndex, setSelectedMapIndex] = useState<number>(0);
  const [roomId, setRoomId] = useState('');
  const [roomPass, setRoomPass] = useState('');
  const [releaseTimerMinutes, setReleaseTimerMinutes] = useState<number>(0);

  // Slot Manager State (Supabase Single Source of Truth)
  const [slotMatchId, setSlotMatchId] = useState(selectableMatches[0]?.id || (matches || [])[0]?.id || '');
  const [slotBookings, setSlotBookings] = useState<SlotBooking[]>([]);
  const [fetchedProfiles, setFetchedProfiles] = useState<UserProfile[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [isSavingSlot, setIsSavingSlot] = useState<boolean>(false);
  const [matchedPreviewProfile, setMatchedPreviewProfile] = useState<UserProfile | null>(null);

  const [editingSlotNum, setEditingSlotNum] = useState<number | null>(null);
  const [manualIgn, setManualIgn] = useState('');
  const [manualTeam, setManualTeam] = useState('');
  const [manualUid, setManualUid] = useState('');
  const [manualUsername, setManualUsername] = useState('');

  // Keep slotMatchId valid when matches update
  useEffect(() => {
    if (!slotMatchId && selectableMatches.length > 0) {
      setSlotMatchId(selectableMatches[0].id);
    }
  }, [matches, slotMatchId]);

  // Load slot bookings and profiles directly from Supabase
  const loadSlotsForMatch = async (matchId: string) => {
    if (!matchId) return;
    setIsLoadingSlots(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        const [bRes, pRes] = await Promise.all([
          supabase
            .from('slot_bookings')
            .select('*')
            .eq('match_id', matchId)
            .eq('status', 'confirmed'),
          supabase
            .from('profiles')
            .select('*')
        ]);

        if (pRes.data && Array.isArray(pRes.data)) {
          setFetchedProfiles(pRes.data);
        }
        if (bRes.data) {
          setSlotBookings(bRes.data);
          return;
        }
      }
      const local = getMatchBookings(matchId);
      setSlotBookings(local);
    } catch (e) {
      console.warn('loadSlotsForMatch exception:', e);
      setSlotBookings(getMatchBookings(matchId));
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'slots' && slotMatchId) {
      loadSlotsForMatch(slotMatchId);
    }
  }, [activeTab, slotMatchId]);

  // Debounced real-time Supabase profile search as admin types username/IGN
  useEffect(() => {
    let isMounted = true;
    const cleanUname = manualUsername.replace('@', '').trim();
    const cleanIgn = manualIgn.trim();

    if (!cleanUname && !cleanIgn) {
      setMatchedPreviewProfile(null);
      return;
    }

    const timer = setTimeout(async () => {
      if (isSupabaseConfigured() && supabase) {
        try {
          if (cleanUname) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .ilike('username', cleanUname)
              .maybeSingle();
            if (data && isMounted) {
              setMatchedPreviewProfile(data);
              return;
            }
          }
          if (cleanIgn) {
            const { data: ignMatch } = await supabase
              .from('profiles')
              .select('*')
              .ilike('pubg_id_name', cleanIgn)
              .maybeSingle();
            if (ignMatch && isMounted) {
              setMatchedPreviewProfile(ignMatch);
              return;
            }
            const { data: uMatch } = await supabase
              .from('profiles')
              .select('*')
              .ilike('username', cleanIgn)
              .maybeSingle();
            if (uMatch && isMounted) {
              setMatchedPreviewProfile(uMatch);
              return;
            }
          }
        } catch (err) {
          console.warn('Profile search error:', err);
        }
      }

      // Local fallback search
      const allProfs = getAllProfiles();
      const localMatch = allProfs.find(
        p => (cleanUname && p.username?.toLowerCase() === cleanUname.toLowerCase()) ||
             (cleanIgn && p.pubg_id_name?.trim().toLowerCase() === cleanIgn.toLowerCase()) ||
             (cleanIgn && p.username?.trim().toLowerCase() === cleanIgn.toLowerCase())
      );
      if (isMounted) {
        setMatchedPreviewProfile(localMatch || null);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [manualUsername, manualIgn]);

  // Result Box State
  const [resultMatchId, setResultMatchId] = useState((matches || [])[0]?.id || '');
  const [draftResults, setDraftResults] = useState<PlayerResult[]>([]);
  const [resultTournamentMatchesCount, setResultTournamentMatchesCount] = useState<number>(3);
  const [resultImageUrl, setResultImageUrl] = useState<string>('');
  const [resultImageAspect, setResultImageAspect] = useState<'16:9' | '9:16' | 'auto'>('16:9');
  const [isUploadingResultImage, setIsUploadingResultImage] = useState<boolean>(false);
  const [isPublishingResult, setIsPublishingResult] = useState<boolean>(false);
  const [isPublishingImage, setIsPublishingImage] = useState<boolean>(false);
const [isPublishingRoom, setIsPublishingRoom] = useState<boolean>(false);
  // Published Results List State
  const [publishedResults, setPublishedResults] = useState<MatchResult[]>([]);
  const [isLoadingPublishedResults, setIsLoadingPublishedResults] = useState<boolean>(false);
  const [deletingResultItem, setDeletingResultItem] = useState<MatchResult | null>(null);
  const [isExecutingDeleteResult, setIsExecutingDeleteResult] = useState<boolean>(false);
  const [deleteNoticeMsg, setDeleteNoticeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPublishedResults = async () => {
    setIsLoadingPublishedResults(true);
    try {
      const data = await fetchPublishedMatchResultsFromSupabase();
      setPublishedResults(data || []);
    } catch (err) {
      console.warn('loadPublishedResults error:', err);
    } finally {
      setIsLoadingPublishedResults(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'results') {
      loadPublishedResults();
    }
  }, [activeTab]);

  const handleConfirmDeleteResult = async () => {
    if (!deletingResultItem || isExecutingDeleteResult) return;
    setIsExecutingDeleteResult(true);
    setDeleteNoticeMsg(null);
    try {
      const targetTitle = deletingResultItem.match_title || 'Match Result';
      const res = await deletePublishedMatchResultApi(deletingResultItem);
      if (res.success) {
        setDeleteNoticeMsg({
          type: 'success',
          text: `✓ Successfully deleted published result for "${targetTitle}".`
        });
        setDeletingResultItem(null);
        await loadPublishedResults();
        if (onDataRefresh) {
          await onDataRefresh();
        }
        alert(`✓ Published result for "${targetTitle}" deleted from Supabase.`);
      } else {
        const errText = res.error || 'Failed to delete match result.';
        setDeleteNoticeMsg({
          type: 'error',
          text: errText
        });
        alert(`Deletion Error: ${errText}`);
      }
    } catch (err: any) {
      const errText = err?.message || 'Error executing deletion.';
      setDeleteNoticeMsg({
        type: 'error',
        text: errText
      });
      alert(`Error: ${errText}`);
    } finally {
      setIsExecutingDeleteResult(false);
    }
  };

  // Load Result Draft when resultMatchId or tab changes
  useEffect(() => {
    if (resultMatchId) {
      loadDraftResults(resultMatchId);
    }
  }, [resultMatchId, activeTab]);
  

  const renderThumbnailSelector = (isEditMode: boolean) => {
    const count = type === 'tournament' ? Math.max(1, Math.min(6, tournamentMatchCount)) : 1;
    const items = Array.from({ length: count }, (_, idx) => idx);

    return (
      <div className="space-y-3 bg-[#030a16] p-3 rounded-xl border border-gray-800 my-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              {type === 'tournament' ? 'MATCH MAP THUMBNAILS' : 'MATCH THUMBNAIL'}
            </h4>
            <p className="text-[9px] text-gray-500 mt-0.5">
              Upload clear JPG/PNG images to Supabase Storage. Recommended 16:9 landscape.
            </p>
          </div>
          {isEditMode && editingMatch && (
            <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
              EDIT MODE
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {items.map((idx) => {
            const mapName = type === 'tournament' ? (tournamentMaps[idx] || `Match ${idx + 1}`) : map;
            const currentBanner = type === 'tournament' ? (mapBanners[idx] || '') : bannerUrl;
            const uploading = type === 'tournament' ? Boolean(isUploadingMapBanner[idx]) : isUploadingBanner;

            return (
              <div key={idx} className="p-3 rounded-xl bg-[#020710]/80 border border-gray-800 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center pb-1.5 border-b border-gray-800/60">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider">
                      {type === 'tournament' ? `Match #${idx + 1} Map` : 'Match Thumbnail'}
                    </p>
                    {type === 'tournament' && (
                      <span className="px-1.5 py-0.5 bg-gray-800/80 text-[8px] text-gray-400 font-bold rounded">
                        {mapName}
                      </span>
                    )}
                  </div>

                  {type === 'tournament' && (
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-1">Select Map</label>
                      <select
                        value={mapName}
                        disabled={isAnyUploading}
                        onChange={(e) => {
                          const updated = [...tournamentMaps];
                          updated[idx] = e.target.value;
                          setTournamentMaps(updated);
                        }}
                        className="w-full p-1.5 rounded bg-[#030a16] border border-gray-800 text-white text-[10px] focus:outline-none focus:border-[#00e5ff]"
                      >
                        <option value="Erangel">Erangel</option>
                        <option value="Miramar">Miramar</option>
                        <option value="Sanhok">Sanhok</option>
                        <option value="Livik">Livik</option>
                        <option value="Karakin">Karakin</option>
                        <option value="Nusa">Nusa</option>
                        <option value="Warehouse">Warehouse</option>
                        <option value="Rondo">Rondo</option>
                        <option value="Vikendi">Vikendi</option>
                      </select>
                    </div>
                  )}

                  {type === 'tournament' && (
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-1">Max Slots ({mapName})</label>
                      <input
                        type="number"
                        disabled={isAnyUploading}
                        value={mapMaxSlots[idx] !== undefined ? mapMaxSlots[idx] : getDefaultMaxSlots(mapName, type)}
                        onChange={(e) => {
                          const updated = [...mapMaxSlots];
                          updated[idx] = Number(e.target.value);
                          setMapMaxSlots(updated);
                        }}
                        className="w-full p-1.5 rounded bg-[#030a16] border border-gray-800 text-white text-[10px] text-center"
                      />
                    </div>
                  )}

                  <label className={`cursor-pointer py-2 px-2 rounded-lg font-bold border text-[10px] flex items-center justify-center gap-1 transition-all ${
                    uploading || isAnyUploading
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-800'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    <span>{uploading ? '⏳ Uploading...' : '📁 Device / Gallery Upload'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploading || isAnyUploading}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (type === 'tournament') {
                            handleImageUpload(file, (url) => {
                              const updated = [...mapBanners];
                              updated[idx] = url;
                              setMapBanners(updated);
                            }, idx);
                          } else {
                            handleImageUpload(file, (url) => setBannerUrl(url));
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>

                  <input
                    type="text"
                    disabled={isAnyUploading}
                    placeholder="Or paste image URL..."
                    value={currentBanner}
                    onChange={(e) => {
                      if (type === 'tournament') {
                        const updated = [...mapBanners];
                        updated[idx] = e.target.value;
                        setMapBanners(updated);
                      } else {
                        setBannerUrl(e.target.value);
                      }
                    }}
                    className="w-full p-1.5 rounded bg-[#030a16] border border-gray-800 text-[10px] text-white placeholder:text-gray-600 focus:border-[#00e5ff] outline-none"
                  />
                </div>

                {currentBanner && (
                  <div className="relative rounded-xl overflow-visible mt-2 border-2 border-cyan-400/70 bg-[#020710] shadow-[0_0_8px_rgba(34,211,238,0.45),0_0_22px_rgba(0,229,255,0.18)] p-0.5">
                    <div className="relative rounded-[10px] overflow-hidden bg-black aspect-video">
                      <img
                        src={currentBanner}
                        alt={`${mapName} Preview`}
                        className="w-full h-full object-cover block"
                        referrerPolicy="no-referrer"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/5" />
                      <span className="absolute left-2 bottom-2 px-2 py-0.5 rounded bg-black/75 text-[8px] font-black text-cyan-300 border border-cyan-400/40 tracking-wider">
                        VIP HD PREVIEW
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (type === 'tournament') {
                            const updated = [...mapBanners];
                            updated[idx] = '';
                            setMapBanners(updated);
                          } else {
                            setBannerUrl('');
                          }
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-600/90 hover:bg-red-500 text-white shadow-lg border border-red-300/30"
                        title="Remove image"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };


  if (!isOpen) return null;
  
  const auditLogs = transactions.filter((t) => t.status !== 'pending');

  // Refresh active match maps
  const activeSelectedMatch = (matches || []).find((m) => m.id === selectedMatchId) || (matches || [])[0];

  // Get currently published values for comparison
  const publishedCred = activeSelectedMatch?.room_credentials?.[selectedMapIndex];
  const publishedRoomId = publishedCred ? (publishedCred.room_id || '') : (selectedMapIndex === 0 ? (activeSelectedMatch?.room_id || '') : '');
  const publishedRoomPass = publishedCred ? (publishedCred.room_password || '') : (selectedMapIndex === 0 ? (activeSelectedMatch?.room_password || '') : '');
  const publishedTimer = publishedCred ? (publishedCred.release_timer_minutes || 0) : 0;

  const isAlreadyPublished = !!publishedRoomId;
  const isModified = roomId.trim() !== publishedRoomId || roomPass.trim() !== publishedRoomPass || Number(releaseTimerMinutes) !== publishedTimer;

  const activeMatchMaps = activeSelectedMatch
    ? activeSelectedMatch.maps && activeSelectedMatch.maps.length > 0
      ? activeSelectedMatch.maps
      : activeSelectedMatch.type === 'tournament'
      ? ['Erangel', 'Miramar', 'Rondo']
      : [activeSelectedMatch.map]
    : ['Erangel'];

  const loadDraftResults = async (mId: string) => {
    // Check if match already has a published result with screenshot image & aspect ratio
    let existingResult: MatchResult | null = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: resData } = await supabase
          .from('match_results')
          .select('*')
          .eq('match_id', mId)
          .maybeSingle();
        if (resData) existingResult = resData;
      } catch (e) {
        console.warn('loadDraftResults existing match_results error:', e);
      }
    }
    if (!existingResult) {
      existingResult = getMatchResults().find((r) => r.match_id === mId) || null;
    }

    if (existingResult) {
      setResultImageUrl(existingResult.result_image_url || '');
      setResultImageAspect(existingResult.result_image_aspect || '16:9');
      if (existingResult.tournament_matches_count) {
        setResultTournamentMatchesCount(existingResult.tournament_matches_count);
      }
    } else {
      setResultImageUrl('');
      setResultImageAspect('16:9');
    }

    let bookings: SlotBooking[] = [];
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('slot_bookings')
          .select('*')
          .eq('match_id', mId)
          .eq('status', 'confirmed')
          .order('slot_number', { ascending: true });
        if (data && !error) {
          bookings = data;
        }
      } catch (e) {
        console.warn('loadDraftResults Supabase error:', e);
      }
    }
    if (bookings.length === 0) {
      bookings = getMatchBookings(mId);
    }

    let supaProfiles: UserProfile[] = [];
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: pData } = await supabase.from('profiles').select('*');
        if (pData) supaProfiles = pData;
      } catch (e) {
        console.warn('load profiles error in loadDraftResults:', e);
      }
    }

    const allProfiles = supaProfiles.length > 0 ? supaProfiles : getAllProfiles();
    const targetMatch = matches.find((m) => m.id === mId);
    const isTournament = targetMatch?.type === 'tournament' || (targetMatch?.maps && targetMatch.maps.length > 1);
    const squadType = (targetMatch?.squad_type || 'SQUAD').toUpperCase();
    const squadSize = squadType === 'SQUAD' ? 4 : squadType === 'DUO' ? 2 : 1;

    // Initialize tournament matches count
    if (isTournament) {
      const mapsCount = targetMatch?.maps && targetMatch.maps.length > 0 ? targetMatch.maps.length : 3;
      setResultTournamentMatchesCount(mapsCount);
    } else {
      setResultTournamentMatchesCount(1);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const validBookings = bookings.filter(bk => {
      if (!bk || !bk.player_ign || !bk.player_ign.trim()) return false;
      const ign = bk.player_ign.trim().toLowerCase();
      if (ign === 'unoccupied' || ign.includes('unoccupied slot') || ign.includes('empty slot')) return false;
      return true;
    });

    const results: PlayerResult[] = validBookings.map((bk) => {
      const cleanIgn = bk.player_ign ? bk.player_ign.trim().toLowerCase() : '';
      const cleanUid = bk.player_uid ? bk.player_uid.trim() : '';

      // Auto-detect profile from Supabase profiles by matching user_id, player_id, pubg name, username, or pubg uid
      const matchedProf = allProfiles.find((p) => {
        if (bk.player_id && p.id === bk.player_id && uuidRegex.test(p.id)) return true;
        if (bk.user_id && p.id === bk.user_id && uuidRegex.test(p.id)) return true;
        if (cleanIgn && p.pubg_id_name && p.pubg_id_name.trim().toLowerCase() === cleanIgn) return true;
        if (cleanIgn && p.pubg_name && p.pubg_name.trim().toLowerCase() === cleanIgn) return true;
        if (cleanIgn && p.username && p.username.trim().toLowerCase() === cleanIgn) return true;
        if (cleanUid && p.pubg_id_number && String(p.pubg_id_number).trim() === cleanUid) return true;
        return false;
      });

      // Default team name if not specified
      let teamName = bk.team_name;
      if (!teamName && squadSize > 1) {
        const teamIndex = Math.ceil((bk.slot_number || 1) / squadSize);
        teamName = `TEAM #${teamIndex}`;
      }

      const displayIgn = bk.player_ign || matchedProf?.pubg_name || matchedProf?.pubg_id_name || matchedProf?.name || '';
      const displayUname = matchedProf?.username ? (matchedProf.username.startsWith('@') ? matchedProf.username : `@${matchedProf.username}`) : '';

      return {
        slot_number: bk.slot_number,
        player_ign: displayIgn,
        player_uid: bk.player_uid,
        username: displayUname,
        user_id: matchedProf ? matchedProf.id : undefined,
        team_name: teamName || undefined,
        kills: 0,
        is_winner: false,
        points: 0,
        winning_prize: ''
      };
    });

    setDraftResults(results);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCreateRef.current || isCreatingMatch) return;

    if (isUploadingBanner || isUploadingMapBanner.some(Boolean)) {
      alert('Please wait for the image upload to complete before publishing the match.');
      return;
    }

    setHostMatchErrorMsg(null);
    setHostMatchSuccessMsg(null);

    if (!title.trim()) {
      setHostMatchErrorMsg('Please enter a tournament / match title.');
      return;
    }

    isSubmittingCreateRef.current = true;
    setIsCreatingMatch(true);

    try {
      let finalBannerUrl = bannerUrl.trim();
      if (finalBannerUrl.startsWith('data:image')) {
        const uploadRes = await uploadMatchBannerToSupabase(finalBannerUrl);
        if (uploadRes.success && uploadRes.url) {
          finalBannerUrl = uploadRes.url;
        } else {
          console.warn('Base64 image upload failed:', uploadRes.error);
          finalBannerUrl = ''; // Clear base64 string to avoid bloated payloads
        }
      }

      let finalMapBanners = type === 'tournament' 
        ? [...mapBanners].slice(0, tournamentMatchCount) 
        : undefined;
      if (finalMapBanners) {
        for (let i = 0; i < finalMapBanners.length; i++) {
          if (finalMapBanners[i] && finalMapBanners[i].startsWith('data:image')) {
            const uploadRes = await uploadMatchBannerToSupabase(finalMapBanners[i]);
            if (uploadRes.success && uploadRes.url) {
              finalMapBanners[i] = uploadRes.url;
            } else {
              finalMapBanners[i] = '';
            }
          }
        }
      }

      const activeMapsList = type === 'tournament' 
        ? [...tournamentMaps].slice(0, tournamentMatchCount) 
        : [map];

      const initialRoomCreds = type === 'tournament'
        ? activeMapsList.map((mName, idx) => ({
            map_index: idx,
            map_name: mName,
            room_id: '',
            room_password: '',
            release_timer_minutes: 0,
            release_time_ms: 0
          }))
        : undefined;

      await onCreateMatch({
        title: title.trim(),
        type,
        map: type === 'tournament' ? (activeMapsList[0] as MapType) : map,
        banner_url: finalBannerUrl || undefined,
        maps: type === 'tournament' ? activeMapsList : undefined,
        map_banners: finalMapBanners,
        map_max_slots: type === 'tournament' 
          ? [...mapMaxSlots].slice(0, tournamentMatchCount) 
          : undefined,
        locked_slots: lockedSlots.length > 0 ? lockedSlots : undefined,
        match_time: formatMatchTimeString(startTimeInput) || matchTime || 'Upcoming Match',
        start_timestamp: new Date(startTimeInput).getTime(),
        gap_minutes: type === 'tournament' ? gapMinutes : undefined,
        room_credentials: initialRoomCreds,
        entry_fee: Number(entryFee),
        prizes: {
          first_prize: Number(firstPrize),
          second_prize: Number(secondPrize),
          third_prize: type === 'tournament' ? Number(thirdPrize) : undefined,
          per_kill_prize: Number(perKillPrize),
          total_pool: Number(firstPrize) + Number(secondPrize) + (type === 'tournament' ? Number(thirdPrize) : 0) + Number(perKillPrize) * maxSlots
        },
        max_slots: Number(maxSlots),
        squad_type: (type === 'tournament' || type === 'wow' || type === 'tdm') 
          ? squadType 
          : (type === 'squad' ? 'SQUAD' : type === 'duo' ? 'DUO' : 'SOLO'),
        rules: matchRules ? matchRules.split('\n').map(r => r.trim()).filter(Boolean) : [],
        version: 'PUBG Mobile 3.5'
      });

      // Clear the form after successful create
      setTitle('');
      setBannerUrl('');
      setMatchRules('');
      setLockedSlots([]);
      setMapBanners(['', '', '', '', '', '']);
      setMapMaxSlots([100, 100, 100, 100, 100, 100]);
      setEntryFee(100);
      setFirstPrize(2000);
      setSecondPrize(1000);
      setThirdPrize(500);
      setPerKillPrize(50);

      setHostMatchSuccessMsg(`Match published successfully`);
    } catch (err: any) {
      console.error('Error in handleCreateSubmit:', err);
      setHostMatchErrorMsg(err?.message || 'Failed to create tournament. Please try again.');
    } finally {
      isSubmittingCreateRef.current = false;
      setIsCreatingMatch(false);
    }
  };

  const handleStartEditMatch = (m: Match) => {
    setHostMatchErrorMsg(null);
    setHostMatchSuccessMsg(null);
    setEditingMatch(m);
    setTitle(m.title || '');
    setType(m.type || 'squad');
    setSquadType(
      m.squad_type ||
      (m.type === 'solo' ? 'SOLO' : m.type === 'duo' ? 'DUO' : 'SQUAD')
    );
    setMap(m.map || (m.type === 'wow' ? 'WOW' : 'Erangel'));
    setMatchTime(m.match_time || '');
    if (m.start_timestamp) {
      setStartTimeInput(new Date(m.start_timestamp).toISOString().slice(0, 16));
    } else {
      setStartTimeInput(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    }
    setEntryFee(m.entry_fee ?? 50);
    const prizes: any = m.prizes || {};
    setFirstPrize(prizes.first_prize ?? 2500);
    setSecondPrize(prizes.second_prize ?? 1000);
    setThirdPrize(prizes.third_prize ?? 500);
    setPerKillPrize(prizes.per_kill_prize ?? 50);
    setMaxSlots(m.max_slots ?? 52);
    setLockedSlots(m.locked_slots || []);
    
    // Support up to 6 slots cleanly
    const existingMaxSlots = m.map_max_slots || [];
    const newMaxSlots = Array(6).fill(100);
    existingMaxSlots.forEach((val, idx) => {
      if (idx < 6) newMaxSlots[idx] = val;
    });
    setMapMaxSlots(newMaxSlots);

    setBannerUrl(m.banner_url || '');
    setMatchRules(Array.isArray(m.rules) ? m.rules.join('\n') : (m.rules || ''));

    const existingBanners = m.map_banners || [];
    const newBanners = Array(6).fill('');
    existingBanners.forEach((val, idx) => {
      if (idx < 6) newBanners[idx] = val;
    });
    setMapBanners(newBanners);

    // Populate tournament states
    const mapsCount = m.maps ? m.maps.length : 3;
    setTournamentMatchCount(mapsCount);
    if (m.maps) {
      const updatedTmaps = [...tournamentMaps];
      m.maps.forEach((item, idx) => {
        if (idx < 6) updatedTmaps[idx] = item;
      });
      setTournamentMaps(updatedTmaps);
    }
    setGapMinutes(m.gap_minutes ?? 15);
    setSquadType(m.squad_type || 'SQUAD');

    // Populate multi room credentials
    const rids = Array(6).fill('');
    const rpasses = Array(6).fill('');
    const mapsList = m.maps && m.maps.length > 0 ? m.maps : ['Erangel', 'Miramar', 'Rondo'];
    mapsList.forEach((_, idx) => {
      const cred = m.room_credentials?.[idx];
      if (cred) {
        rids[idx] = cred.room_id || '';
        rpasses[idx] = cred.room_password || '';
      } else if (idx === 0 && m.room_id) {
        rids[idx] = m.room_id;
        rpasses[idx] = m.room_password || '';
      }
    });
    setMultiRoomIds(rids);
    setMultiRoomPasses(rpasses);
  };

  const handleSaveMatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;
    setIsSavingMatch(true);
    setHostMatchErrorMsg(null);
    setHostMatchSuccessMsg(null);

    try {
      let finalBannerUrl = bannerUrl.trim();
      if (finalBannerUrl.startsWith('data:image')) {
        const uploadRes = await uploadMatchBannerToSupabase(finalBannerUrl);
        if (uploadRes.success && uploadRes.url) {
          finalBannerUrl = uploadRes.url;
        } else {
          setHostMatchErrorMsg(uploadRes.error || 'Failed to upload banner image.');
          alert(`Failed to upload banner image: ${uploadRes.error || 'Unknown error'}`);
          setIsSavingMatch(false);
          return;
        }
      }

      let finalMapBanners = type === 'tournament' 
        ? [...mapBanners].slice(0, tournamentMatchCount) 
        : undefined;
      if (finalMapBanners) {
        for (let i = 0; i < finalMapBanners.length; i++) {
          if (finalMapBanners[i] && finalMapBanners[i].startsWith('data:image')) {
            const uploadRes = await uploadMatchBannerToSupabase(finalMapBanners[i]);
            if (uploadRes.success && uploadRes.url) {
              finalMapBanners[i] = uploadRes.url;
            }
          }
        }
      }

      const activeMapsList = type === 'tournament' 
        ? [...tournamentMaps].slice(0, tournamentMatchCount) 
        : [map];

      const rawStartTime = new Date(startTimeInput).getTime();
      const startTimestampVal = Number.isNaN(rawStartTime) ? (editingMatch.start_timestamp || Date.now()) : rawStartTime;
      let isEndedVal = editingMatch.is_ended;
      let statusVal = editingMatch.status;
      if (startTimestampVal > Date.now()) {
        isEndedVal = false;
        if (statusVal === 'completed') {
          statusVal = 'upcoming';
        }
      }

      const updated: Match = {
        ...editingMatch,
        title: title.trim(),
        type,
        map: type === 'tournament' ? (activeMapsList[0] as MapType) : map,
        maps: type === 'tournament' ? activeMapsList : null as any,
        banner_url: finalBannerUrl || editingMatch.banner_url,
        map_banners: type === 'tournament' ? finalMapBanners : null as any,
        map_max_slots: type === 'tournament' 
          ? [...mapMaxSlots].slice(0, tournamentMatchCount) 
          : null as any,
        locked_slots: lockedSlots.length > 0 ? lockedSlots : undefined,
        match_time: formatMatchTimeString(startTimeInput) || matchTime || editingMatch.match_time,
        start_timestamp: startTimestampVal,
        is_ended: isEndedVal,
        status: statusVal,
        entry_fee: Number(entryFee) || 0,
        gap_minutes: type === 'tournament' ? gapMinutes : null as any,
        room_credentials: type === 'tournament' ? editingMatch.room_credentials : null as any,
        prizes: {
          ...editingMatch.prizes,
          first_prize: Number(firstPrize) || 0,
          second_prize: Number(secondPrize) || 0,
          third_prize: type === 'tournament' ? (Number(thirdPrize) || 0) : undefined,
          per_kill_prize: Number(perKillPrize) || 0,
          total_pool: (Number(firstPrize) || 0) + (Number(secondPrize) || 0) + (type === 'tournament' ? (Number(thirdPrize) || 0) : 0) + (Number(perKillPrize) || 0) * (Number(maxSlots) || 50)
        },
        max_slots: Number(maxSlots) || 50,
        squad_type: (type === 'tournament' || type === 'wow' || type === 'tdm') 
          ? squadType 
          : (type === 'squad' ? 'SQUAD' : type === 'duo' ? 'DUO' : 'SOLO'),
        rules: matchRules ? matchRules.split('\n').map(r => r.trim()).filter(Boolean) : (Array.isArray(editingMatch.rules) ? editingMatch.rules : [])
      };

      if (onEditMatch) {
        await onEditMatch(updated);
      } else if (isSupabaseConfigured() && supabase) {
        const cleanMatch = Object.fromEntries(
          Object.entries(updated).filter(([_, v]) => v !== undefined && !Number.isNaN(v))
        );
        const { error } = await supabase.from('matches').upsert([cleanMatch]);
        if (error) {
          console.error('Error saving match modifications directly in Supabase:', error);
          alert(`Error saving match in Supabase: ${error.message || JSON.stringify(error)}`);
          throw error;
        }
        if (onDataRefresh) await onDataRefresh();
        alert(`Match "${title}" modifications saved successfully to Supabase!`);
      }

      setEditingMatch(null);
      setHostMatchSuccessMsg(`Match "${title}" details successfully updated!`);
    } catch (err: any) {
      console.error('Error in handleSaveMatchEdit:', err);
      const errMsg = err?.message || 'Failed to update match details.';
      setHostMatchErrorMsg(errMsg);
      alert(`Failed to save match modifications: ${errMsg}`);
    } finally {
      setIsSavingMatch(false);
    }
  };

  const handlePublishSubmit = async (e?:
  React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPublishingRoom) return;
    if (!selectedMatchId) {
      alert('CRITICAL FAILURE: No Match Selected!');
      return;
    }

    if (activeSelectedMatch?.type === 'tournament') {
      const mapsList = activeSelectedMatch.maps && activeSelectedMatch.maps.length > 0 
        ? activeSelectedMatch.maps 
        : ['Erangel', 'Miramar', 'Rondo'];

      // Check if at least one room is filled
      const hasAnyRoom = multiRoomIds.some(id => (id || '').trim().length > 0);
      if (!hasAnyRoom) {
        alert('REQUIRED: Enter a valid Room ID for at least one tournament match.');
        return;
      }

      const override = mapsList.map((mName, idx) => {
        const rId = (multiRoomIds[idx] || '').trim();
        const rPass = (multiRoomPasses[idx] || '').trim();
        const timerMins = Number(multiRoomTimers[idx] || 0);

        let releaseTimeMs: number | undefined = undefined;
        if (rId) {
          releaseTimeMs = timerMins > 0 ? Date.now() + timerMins * 60 * 1000 : Date.now();
        }

        return {
          map_index: idx,
          map_name: mName,
          room_id: rId,
          room_password: rPass,
          release_timer_minutes: timerMins,
          release_time_ms: releaseTimeMs
        };
      });

      const firstValid = override.find(c => c.room_id);

      setIsPublishingRoom(true);
try {
  await onPublishRoomDetails(
    selectedMatchId,
    firstValid?.room_id || '',
    firstValid?.room_password || '',
    0,
    0,
    override
  );
} finally {
  setIsPublishingRoom(false);
}
    } else {
      // Force-capture inputs from state
      const currentRoomId = roomId.trim();
      const currentRoomPass = roomPass.trim();
      const currentTimer = Number(releaseTimerMinutes);

      // Explicit Validation
      if (!currentRoomId) {
        alert('REQUIRED: Enter a valid Room ID.');
        return;
      }
      if (!currentRoomPass) {
        alert('REQUIRED: Enter a Room Password.');
        return;
      }

      // Direct Dispatch
      setIsPublishingRoom(true);
try {
  await onPublishRoomDetails(
    selectedMatchId,
    currentRoomId,
    currentRoomPass,
    selectedMapIndex,
    currentTimer
  );
} finally {
  setIsPublishingRoom(false);
}
    }
    
    // Instant feedback sync
    if (onDataRefresh) {
      setTimeout(() => onDataRefresh(), 100);
    }
  };

  const handlePublishTournamentBox
  = async (boxIdx: number) => { 
    if (!selectedMatchId || !activeSelectedMatch) return;

    const rId = (multiRoomIds[boxIdx] || '').trim();
    const rPass = (multiRoomPasses[boxIdx] || '').trim();
    const timerMins = Number(multiRoomTimers[boxIdx] || 0);

    if (!rId) {
      alert(`Please enter a Room ID for Match #${boxIdx + 1}`);
      return;
    }
    if (!rPass) {
      alert(`Please enter a Password for Match #${boxIdx + 1}`);
      return;
    }

    const mapsList = activeSelectedMatch.maps && activeSelectedMatch.maps.length > 0 
      ? activeSelectedMatch.maps 
      : ['Erangel', 'Miramar', 'Rondo'];

    const existingCreds: RoomCredential[] = mapsList.map((mName, idx) => {
      if (idx === boxIdx) {
        return {
          map_index: idx,
          map_name: mName,
          room_id: rId,
          room_password: rPass,
          release_timer_minutes: timerMins,
          release_time_ms: timerMins > 0 ? Date.now() + timerMins * 60 * 1000 : Date.now()
        };
      }
      const existing = activeSelectedMatch.room_credentials?.[idx];
      return existing || {
        map_index: idx,
        map_name: mName,
        room_id: (multiRoomIds[idx] || '').trim(),
        room_password: (multiRoomPasses[idx] || '').trim(),
        release_timer_minutes: Number(multiRoomTimers[idx] || 0),
        release_time_ms: (multiRoomIds[idx] || '').trim() ? (Number(multiRoomTimers[idx] || 0) > 0 ? Date.now() + Number(multiRoomTimers[idx] || 0) * 60 * 1000 : Date.now()) : undefined
      };
    });

      setIsPublishingRoom(true);
try {
  await onPublishRoomDetails(
    selectedMatchId,
    existingCreds[0]?.room_id || rId,
    existingCreds[0]?.room_password || rPass,
    boxIdx,
    timerMins,
    existingCreds
  );
} finally {
  setIsPublishingRoom(false);
}
    if (onDataRefresh) {
      setTimeout(() => onDataRefresh(), 100);
    }
  };

  // Helper to validate proper UUID strings
  const isValidUUID = (str: string | undefined | null): boolean => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  };

  // Assign / Edit Manual Slot (Supabase Single Source of Truth)
  const handleAssignSlot = async (slotNum: number) => {
    if (!manualIgn.trim()) {
      alert('Please enter PUBG ID Name.');
      return;
    }
    if (!slotMatchId) {
      alert('Please select a match.');
      return;
    }

    setIsSavingSlot(true);
    try {
      const cleanIgn = manualIgn.trim();
      const cleanUname = manualUsername.replace('@', '').trim();

      // a) Look up profile in Supabase by username OR pubg name
      let matchedProfile: UserProfile | null = null;
      if (isSupabaseConfigured() && supabase) {
        if (cleanUname) {
          const { data: uData } = await supabase
            .from('profiles')
            .select('*')
            .ilike('username', cleanUname)
            .maybeSingle();
          if (uData) matchedProfile = uData;
        }
        if (!matchedProfile && cleanIgn) {
          const { data: ignData } = await supabase
            .from('profiles')
            .select('*')
            .ilike('pubg_id_name', cleanIgn)
            .maybeSingle();
          if (ignData) matchedProfile = ignData;
        }
        if (!matchedProfile && cleanIgn) {
          const { data: unameData } = await supabase
            .from('profiles')
            .select('*')
            .ilike('username', cleanIgn)
            .maybeSingle();
          if (unameData) matchedProfile = unameData;
        }
      }

      if (!matchedProfile) {
        const allProfiles = getAllProfiles();
        matchedProfile = allProfiles.find(
          p => (cleanUname && p.username?.toLowerCase() === cleanUname.toLowerCase()) ||
               (cleanIgn && p.pubg_id_name?.trim().toLowerCase() === cleanIgn.toLowerCase()) ||
               (cleanIgn && p.username?.trim().toLowerCase() === cleanIgn.toLowerCase())
        ) || null;
      }

      // Check if profile ID is a valid UUID
      const validProfileUuid = matchedProfile && isValidUUID(matchedProfile.id) ? matchedProfile.id : null;
      const assignedUserId = validProfileUuid;
      const assignedPlayerId = validProfileUuid;
      const assignedUid = manualUid.trim() || (matchedProfile?.pubg_id_number || null);
      const bookingTimeNow = new Date().toISOString();

      if (isSupabaseConfigured() && supabase) {
        // 1. Delete any existing slot_booking for this slot in this match to avoid duplicates/conflicts
        await supabase
          .from('slot_bookings')
          .delete()
          .eq('match_id', slotMatchId)
          .eq('slot_number', slotNum);

        // 2. Insert new slot booking without providing 'id' so Postgres DB defaults to gen_random_uuid()
        const insertPayload: any = {
          match_id: slotMatchId,
          slot_number: slotNum,
          player_ign: cleanIgn,
          player_uid: assignedUid,
          team_name: manualTeam.trim() || null,
          status: 'confirmed',
          user_id: assignedUserId, // null if guest/not on platform
          player_id: assignedPlayerId, // null if guest/not on platform
          paid_amount: 0,
          is_admin_booked: true,
          booking_time: bookingTimeNow,
          created_at: bookingTimeNow
        };

        const { error: insertErr } = await supabase
          .from('slot_bookings')
          .insert([insertPayload]);

        if (insertErr) {
          console.error('Supabase slot booking insert error:', insertErr);
          alert(insertErr.message);
          setIsSavingSlot(false);
          return;
        }

        // 3. Recount confirmed bookings in Supabase for this match
        const { data: countData, error: countErr } = await supabase
          .from('slot_bookings')
          .select('id')
          .eq('match_id', slotMatchId)
          .eq('status', 'confirmed');

        if (countErr) {
          console.warn('Recount bookings warning:', countErr);
        }

        const newBookedCount = countData ? countData.length : 1;

        // 4. Update matches.booked_slots in Supabase
        const { error: matchUpdateErr } = await supabase
          .from('matches')
          .update({ booked_slots: newBookedCount })
          .eq('id', slotMatchId);

        if (matchUpdateErr) {
          console.warn('Update matches.booked_slots warning:', matchUpdateErr);
        }
      } else {
        const newBooking: SlotBooking = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `bkm-${Date.now()}-${slotNum}`,
          match_id: slotMatchId,
          user_id: assignedUserId,
          player_id: assignedPlayerId,
          team_name: manualTeam.trim() || undefined,
          player_ign: cleanIgn,
          player_uid: assignedUid || undefined,
          slot_number: slotNum,
          booking_time: bookingTimeNow,
          created_at: bookingTimeNow,
          status: 'confirmed',
          paid_amount: 0,
          is_admin_booked: true
        };
        await adminSaveSlotBooking(newBooking);
      }

      // Reload slots directly from Supabase
      await loadSlotsForMatch(slotMatchId);

      // Reset form fields
      setEditingSlotNum(null);
      setManualIgn('');
      setManualTeam('');
      setManualUid('');
      setManualUsername('');
      setMatchedPreviewProfile(null);

      // Trigger global data refresh
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (err: any) {
      console.error('Assign slot error:', err);
      alert(err?.message || String(err));
    } finally {
      setIsSavingSlot(false);
    }
  };

  const handleClearSlot = async (slotNum: number) => {
    if (!confirm(`Are you sure you want to remove player from Slot #${slotNum}?`)) {
      return;
    }

    try {
      if (isSupabaseConfigured() && supabase) {
        const { error: delErr } = await supabase
          .from('slot_bookings')
          .delete()
          .eq('match_id', slotMatchId)
          .eq('slot_number', slotNum);

        if (delErr) {
          console.error('Error clearing slot:', delErr);
          alert(delErr.message);
          return;
        }

        // Recount confirmed bookings in Supabase for this match
        const { data: countData, error: countErr } = await supabase
          .from('slot_bookings')
          .select('id')
          .eq('match_id', slotMatchId)
          .eq('status', 'confirmed');

        if (countErr) {
          console.warn('Recount error after delete:', countErr);
        }

        const newBookedCount = countData ? countData.length : 0;

        // Update matches.booked_slots in Supabase
        const { error: updateErr } = await supabase
          .from('matches')
          .update({ booked_slots: newBookedCount })
          .eq('id', slotMatchId);

        if (updateErr) {
          console.warn('Update match booked_slots warning:', updateErr);
        }
      } else {
        await adminRemoveSlotBooking(slotMatchId, slotNum);
      }

      // Refresh slots from Supabase
      await loadSlotsForMatch(slotMatchId);

      // Trigger global refresh so that player sees SLOT BOOK NOW again
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (err: any) {
      console.error('Clear slot error:', err);
      alert(err?.message || String(err));
    }
  };

  // Match Result Box handlers
  const handleKillChange = (index: number, kills: number) => {
    const updated = [...draftResults];
    if (updated[index]) {
      updated[index] = { ...updated[index], kills: Math.max(0, kills) };
      setDraftResults(updated);
    }
  };

  const handleToggleWin = (index: number) => {
    const updated = [...draftResults];
    if (updated[index]) {
      updated[index] = { ...updated[index], is_winner: !updated[index].is_winner };
      setDraftResults(updated);
    }
  };

  const handlePointsChange = (index: number, points: number) => {
    const updated = [...draftResults];
    if (updated[index]) {
      updated[index] = { ...updated[index], points: Math.max(0, points) };
      setDraftResults(updated);
    }
  };

  const handlePrizeChange = (index: number, prize: string) => {
    const updated = [...draftResults];
    if (updated[index]) {
      updated[index] = { ...updated[index], winning_prize: prize };
      setDraftResults(updated);
    }
  };

  const handleUsernameChange = (index: number, username: string) => {
    const clean = username.replace('@', '').trim().toLowerCase();
    const allProfiles = getAllProfiles();
    const matched = allProfiles.find(p => p.username?.toLowerCase() === clean);

    const updated = [...draftResults];
    if (updated[index]) {
      updated[index] = {
        ...updated[index],
        username: username ? (username.startsWith('@') ? username : `@${username}`) : '',
        user_id: matched ? matched.id : undefined
      };
      setDraftResults(updated);
    }
  };

  const handleIgnChange = (index: number, ign: string) => {
    const clean = ign.trim().toLowerCase();
    const allProfiles = getAllProfiles();
    const updated = [...draftResults];
    if (!updated[index]) return;

    let newUsername = updated[index].username;
    let newUserId = updated[index].user_id;

    if (!newUsername || newUsername.trim() === '@' || newUsername.trim() === '') {
      const matched = allProfiles.find(
        p => (p.pubg_id_name && p.pubg_id_name.trim().toLowerCase() === clean) ||
             (p.username && p.username.trim().toLowerCase() === clean)
      );
      if (matched) {
        newUsername = `@${matched.username}`;
        newUserId = matched.id;
      }
    }

    updated[index] = {
      ...updated[index],
      player_ign: ign,
      username: newUsername,
      user_id: newUserId
    };
    setDraftResults(updated);
  };

  const handleTeamPointsChange = (indices: number[], points: number) => {
    const updated = [...draftResults];
    indices.forEach((idx) => {
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], points: Math.max(0, points) };
      }
    });
    setDraftResults(updated);
  };

  const handleTeamPrizeChange = (indices: number[], prize: string) => {
    const updated = [...draftResults];
    indices.forEach((idx) => {
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], winning_prize: prize };
      }
    });
    setDraftResults(updated);
  };

  const handleTeamWinToggle = (indices: number[]) => {
    const updated = [...draftResults];
    const isCurrentlyWin = indices.some(idx => updated[idx]?.is_winner);
    indices.forEach((idx) => {
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], is_winner: !isCurrentlyWin };
      }
    });
    setDraftResults(updated);
  };

  const handleTeamNameChange = (indices: number[], teamName: string) => {
    const updated = [...draftResults];
    indices.forEach((idx) => {
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], team_name: teamName };
      }
    });
    setDraftResults(updated);
  };

  const handleRemoveDraftPlayer = (index: number) => {
    setDraftResults(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddExtraDraftPlayer = () => {
    const ign = prompt('Enter Player PUBG ID Name (required):');
    if (!ign || !ign.trim()) return;
    const uname = prompt('Enter Player Username (e.g. @username or leave empty for auto-detect):', '');
    const killsInput = prompt('Enter Total Kills:', '0');
    const prizeInput = prompt('Enter Winning Prize display text (optional e.g. 1500 PKR):', '');
    const isWin = confirm('Is this player/team the Winner?');

    const cleanIgn = ign.trim().toLowerCase();
    const cleanUname = (uname || '').replace('@', '').trim().toLowerCase();
    const allProfiles = getAllProfiles();
    const matched = allProfiles.find(
      p => (cleanUname && p.username?.toLowerCase() === cleanUname) ||
           (p.pubg_id_name && p.pubg_id_name.trim().toLowerCase() === cleanIgn) ||
           (p.username && p.username.trim().toLowerCase() === cleanIgn)
    );

    const targetMatch = matches.find((m) => m.id === resultMatchId);
    const squadType = (targetMatch?.squad_type || 'SQUAD').toUpperCase();
    const squadSize = squadType === 'SQUAD' ? 4 : squadType === 'DUO' ? 2 : 1;
    const newSlot = draftResults.length + 1;
    const defaultTeam = squadSize > 1 ? `TEAM #${Math.ceil(newSlot / squadSize)}` : undefined;

    setDraftResults((prev) => [
      ...prev,
      {
        slot_number: newSlot,
        player_ign: ign.trim(),
        username: matched ? `@${matched.username}` : (uname?.trim() ? (uname.startsWith('@') ? uname.trim() : `@${uname.trim()}`) : ''),
        user_id: matched ? matched.id : undefined,
        team_name: defaultTeam,
        kills: Number(killsInput) || 0,
        is_winner: isWin,
        points: 0,
        winning_prize: prizeInput?.trim() || ''
      }
    ]);
  };

  const handleResultImageFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingResultImage(true);
    try {
      // Auto-detect image aspect ratio (9:16 portrait vs 16:9 landscape)
      try {
        const objUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          if (img.naturalHeight > img.naturalWidth * 1.1) {
            setResultImageAspect('9:16');
          } else {
            setResultImageAspect('16:9');
          }
          URL.revokeObjectURL(objUrl);
        };
        img.src = objUrl;
      } catch (e) {
        console.warn('Aspect ratio check warning:', e);
      }

      // Upload ONLY the image to Supabase Storage
      const res = await uploadMatchBannerToSupabase(file);
      if (res.success && res.url) {
        setResultImageUrl(res.url);

        // If this match already has a record in Supabase match_results, silently update image URL on it too
        if (isSupabaseConfigured() && supabase && resultMatchId) {
          try {
            await supabase
              .from('match_results')
              .update({
                result_image_url: res.url,
                result_image_aspect: resultImageAspect
              })
              .eq('match_id', resultMatchId);
          } catch (updateErr) {
            console.warn('Silent update to existing match_results image:', updateErr);
          }
        }

        alert('✓ Screenshot uploaded to Supabase Storage!\n• Image URL saved.\n• Results are NOT auto-published. Click "Publish Match Results" when you are ready to publish or sync stats.');
      } else {
        alert(res.error || 'Failed to upload result image');
      }
    } catch (err: any) {
      console.error('Upload result screenshot error:', err);
      alert(err.message || 'Error uploading result image');
    } finally {
      setIsUploadingResultImage(false);
    }
  };

  const handlePublishImageOnlyToMatchResult = async () => {
    if (isPublishingImage) return;
    if (!resultMatchId) {
      alert('Please select a match first.');
      return;
    }
    const rawUrl = resultImageUrl.trim();
    if (!rawUrl) {
      alert('Please select or upload a result image first.');
      return;
    }

    setIsPublishingImage(true);
    try {
      let finalImageUrl = rawUrl;
      // 1) Upload / ensure image is in Supabase Storage (https URL)
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || !rawUrl.startsWith('http')) {
        const uploadRes = await uploadMatchBannerToSupabase(rawUrl);
        if (uploadRes.success && uploadRes.url) {
          finalImageUrl = uploadRes.url;
          setResultImageUrl(finalImageUrl);
        } else if (!uploadRes.success) {
          alert(uploadRes.error || 'Failed to upload result image to Supabase Storage');
          return;
        }
      } else {
        const uploadRes = await uploadMatchBannerToSupabase(rawUrl);
        if (uploadRes.success && uploadRes.url) {
          finalImageUrl = uploadRes.url;
          setResultImageUrl(finalImageUrl);
        }
      }

      // 2) Save screenshot_url on the match_results row for that match_id (insert or update) & set is_published: true
      if (isSupabaseConfigured() && supabase) {
        const targetMatch = matches.find((m) => m.id === resultMatchId);
        let existingResults: any[] = [];
        try {
          const { data: existing } = await supabase
            .from('match_results')
            .select('results')
            .eq('match_id', resultMatchId)
            .maybeSingle();
          if (existing && Array.isArray(existing.results)) {
            existingResults = existing.results;
          }
        } catch (fetchErr) {
          console.warn('Could not fetch existing results array:', fetchErr);
        }

        const payload: any = {
          match_id: resultMatchId,
          match_title: targetMatch?.title || 'PUBG Match',
          match_type: targetMatch?.type || 'squad',
          squad_type: (targetMatch?.squad_type || 'SQUAD') as any,
          map: targetMatch?.map || 'Erangel',
          total_prize_pool: targetMatch?.prizes?.total_pool || 0,
          screenshot_url: finalImageUrl,
          result_image_url: finalImageUrl,
          result_image_aspect: resultImageAspect,
          is_published: true,
          published_at: new Date().toISOString(),
          results: existingResults
        };

        const { error } = await supabase
          .from('match_results')
          .upsert([payload], { onConflict: 'match_id' });

        if (error) {
          alert(error.message);
          return;
        }
      }

      // Update local memory cache so UI updates instantly
      const existingIdx = _matchResultsCache.findIndex(r => r.match_id === resultMatchId);
      if (existingIdx >= 0) {
        _matchResultsCache[existingIdx].screenshot_url = finalImageUrl;
        _matchResultsCache[existingIdx].result_image_url = finalImageUrl;
        _matchResultsCache[existingIdx].result_image_aspect = resultImageAspect;
        _matchResultsCache[existingIdx].is_published = true;
      }

      // 3) Always alert after successful upsert
      alert("Image published to Match Results");

      // Clear admin image UI preview box
      setResultImageUrl('');

      await loadPublishedResults();
      if (onDataRefresh) await onDataRefresh();
    } catch (err: any) {
      alert(err?.message || 'Error publishing image');
    } finally {
      setIsPublishingImage(false);
    }
  };

  const handleSubmitAndUpdateStats = async () => {
    if (isPublishingResult) return;
    if (!resultMatchId) {
      alert('Please select a match to publish results.');
      return;
    }

    const activeRows = draftResults.filter(r => {
      if (!r || !r.player_ign || !r.player_ign.trim()) return false;
      const ign = r.player_ign.trim().toLowerCase();
      if (ign === 'unoccupied' || ign.includes('unoccupied slot') || ign.includes('empty slot')) return false;
      return true;
    });

    if (activeRows.length === 0) {
      alert('No player data to submit in Result Box. Please add players or select a match with bookings.');
      return;
    }

    setIsPublishingResult(true);
    try {
      const targetMatch = matches.find((m) => m.id === resultMatchId);
      const isTournament = targetMatch?.type === 'tournament' || (targetMatch?.maps && targetMatch.maps.length > 1);
      const squadType = (targetMatch?.squad_type || 'SQUAD').toUpperCase();
      const matchesCount = isTournament ? (resultTournamentMatchesCount || targetMatch?.maps?.length || 3) : 1;

      // Sorting rules:
      // TOURNAMENT:
      //   - Ranking by TOTAL POINTS (not only kills): 1st highest points, then 2nd, 3rd, rest (if equal, then kills descending)
      // SINGLE MATCH (solo / duo / squad / tdm):
      //   - Teams/players marked WIN first (top)
      //   - Then by total kills descending
      const sorted = [...activeRows].sort((a, b) => {
        if (isTournament) {
          const aPts = a.points !== undefined ? a.points : 0;
          const bPts = b.points !== undefined ? b.points : 0;
          if (aPts !== bPts) return bPts - aPts;
          if (a.is_winner && !b.is_winner) return -1;
          if (!a.is_winner && b.is_winner) return 1;
          return (b.kills || 0) - (a.kills || 0);
        } else {
          if (a.is_winner && !b.is_winner) return -1;
          if (!a.is_winner && b.is_winner) return 1;
          return (b.kills || 0) - (a.kills || 0);
        }
      }).map((r, idx) => ({
        ...r,
        rank: idx + 1,
        is_win: Boolean(r.is_winner),
        prize_display: r.winning_prize !== undefined ? String(r.winning_prize) : ''
      }));

      const imgUrl = resultImageUrl.trim() || undefined;

      const matchRes: MatchResult = {
        match_id: resultMatchId,
        match_title: targetMatch?.title || 'PUBG Match',
        match_type: targetMatch?.type || 'squad',
        squad_type: (targetMatch?.squad_type || 'SQUAD') as any,
        map: targetMatch?.map || 'Erangel',
        match_time: targetMatch?.match_time,
        total_prize_pool: targetMatch?.prizes?.total_pool || 5000,
        tournament_matches_count: matchesCount,
        result_image_url: imgUrl,
        screenshot_url: imgUrl,
        result_image_aspect: resultImageAspect,
        published_at: new Date().toISOString(),
        is_published: true,
        results: sorted
      };

      // Save to Supabase match_results and sync player profiles (kills, matches_played, wins ONLY; NEVER wallet changes!)
      await saveMatchResult(matchRes);

      if (onDataRefresh) {
        await onDataRefresh();
      }

      alert('Successfully published');

      // Clear Result Box draft state so form is blank for next use
      setDraftResults([]);
      setResultImageUrl('');

      await loadPublishedResults();
    } catch (err: any) {
      console.error('Publish results error:', err);
      alert(err?.message || 'Failed to publish match results.');
    } finally {
      setIsPublishingResult(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 lg:p-6 w-full h-screen overflow-hidden animate-in fade-in duration-200">
      <div className="w-full h-[100dvh] max-h-[100dvh] md:h-full md:max-h-[92vh] md:rounded-2xl max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto bg-[#040e1a] flex-1 flex flex-col overflow-hidden border border-[#00e5ff]/20 relative shadow-2xl">
        
        {/* Header Bar */}
        <div className="p-4 bg-gradient-to-r from-[#07192e] via-[#030a16] to-[#07192e] border-b border-[#00e5ff]/30 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#07192e] border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all shadow-inner"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
            </button>
            <div className="p-2 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/40 text-[#00e5ff]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#00e5ff] tracking-widest uppercase">
                HOST & ADMIN CONTROL PANEL
              </span>
              <h2 className="text-base font-black text-white">MVP Esports Manager</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-800 bg-[#020710] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('players_hub')}
            className={`px-3.5 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap relative ${
              activeTab === 'players_hub'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            Player Activity Hub 👥
          </button>

          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap relative ${
              activeTab === 'deposits'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            Deposit Requests
            {pendingDepositsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {pendingDepositsCount}
                </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap relative ${
              activeTab === 'withdrawals'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
            Withdraw Requests
            {pendingWithdrawalsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {pendingWithdrawalsCount}
                </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('tx_history');
              fetchTransactionHistory();
            }}
            className={`px-3.5 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap relative ${
              activeTab === 'tx_history'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 text-indigo-400" />
            Transaction History 📜
          </button>
          
          <button
            onClick={() => setActiveTab('rewards')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap relative ${
              activeTab === 'rewards'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Star className="w-3.5 h-3.5 text-amber-400" />
            Send Reward / Balance
          </button>

          <button
            onClick={() => setActiveTab('publish')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'publish'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Room ID
          </button>

          <button
            onClick={() => setActiveTab('slots')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'slots'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Slots
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'results'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
            Result Box
          </button>

          <button
            onClick={() => setActiveTab('manage_matches')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'manage_matches'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            Manage & Edit
          </button>

          <button
            onClick={() => setActiveTab('create')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'create'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Host Match
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Audit Logs
          </button>

          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'announcements'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-[#00e5ff]" />
            Announcements
          </button>

          <button
            onClick={() => setActiveTab('polls')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'polls'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#00e5ff]" />
            Polls ({polls.filter(p => p.is_active).length})
          </button>

          <button
            onClick={() => setActiveTab('livestreams')}
            className={`px-3 py-2.5 text-[11px] font-bold transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'livestreams'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-[#00e5ff]" />
            Live Streams
          </button>

          <button
            onClick={() => setActiveTab('live_broadcast')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'live_broadcast'
                ? 'border-fuchsia-400 text-fuchsia-300 bg-fuchsia-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
            LIVE BROADCAST
          </button>

          <button
            onClick={() => setActiveTab('leaderboard_video_manager')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'leaderboard_video_manager'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-amber-400" />
            Card Video Manager 📹
          </button>

          <button
            onClick={() => setActiveTab('bans')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'bans'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-red-500" />
            Ban Players 🚫
          </button>

          <button
            onClick={() => setActiveTab('chats')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap relative ${
              activeTab === 'chats'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#00e5ff]" />
            Player Chat Requests 💬
            {pendingChatMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {pendingChatMessages}
                </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('manage_rules')}
            className={`px-3 py-2.5 text-[11px] font-black transition-all border-b-2 flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'manage_rules'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 text-blue-400" />
            Manage Rules 📜
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 space-y-4">
          
          {/* TAB 0: PLAYER MONITORING & ACTIVITY HUB */}
          {activeTab === 'players_hub' && (
            <AdminPlayersHub
              onOpenRewards={(uname) => {
                setRewardUsername(uname);
                setActiveTab('rewards');
              }}
              onOpenBans={(uname) => {
                setBanUsername(uname);
                setActiveTab('bans');
              }}
            />
          )}

          {/* TAB: LEADERBOARD VIDEO MANAGER */}
          {activeTab === 'leaderboard_video_manager' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
                <Video className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
                <div>
                  <h3 className="text-sm font-black text-white">Card Video Manager (TOP #1 Rank Video Per Category)</h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Upload and manage custom high-definition MP4 videos stored directly in Supabase Storage (<code className="text-amber-300 font-mono text-[11px]">leaderboard_media</code>) and recorded in the <code className="text-amber-300 font-mono text-[11px]">leaderboard_videos</code> table. Only the Rank #1 VIP card for each category displays the animated video background.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  {
                    category: 'kills',
                    title: 'Highest Kills',
                    badge: 'KILL KING #1 VIP',
                    themeColor: 'text-red-400',
                    borderColor: 'border-red-500/30',
                    bgGradient: 'from-red-950/30 via-red-900/10 to-[#030a15]',
                    icon: Flame,
                    description: 'Background video for #1 ranked player in Kills Leaderboard'
                  },
                  {
                    category: 'matches',
                    title: 'Highest Match Play',
                    badge: 'MATCH MASTER #1 VIP',
                    themeColor: 'text-[#00e5ff]',
                    borderColor: 'border-[#00e5ff]/30',
                    bgGradient: 'from-cyan-950/30 via-cyan-900/10 to-[#030a15]',
                    icon: Gamepad2,
                    description: 'Background video for #1 ranked player in Matches Leaderboard'
                  },
                  {
                    category: 'wins',
                    title: 'Highest Match Wins',
                    badge: 'CHAMPION #1 VIP',
                    themeColor: 'text-emerald-400',
                    borderColor: 'border-emerald-500/30',
                    bgGradient: 'from-emerald-950/30 via-emerald-900/10 to-[#030a15]',
                    icon: Trophy,
                    description: 'Background video for #1 ranked player in Wins Leaderboard'
                  },
                  {
                    category: 'reward',
                    title: 'Highest Reward',
                    badge: 'PRIZE KING #1 VIP',
                    themeColor: 'text-amber-400',
                    borderColor: 'border-amber-500/30',
                    bgGradient: 'from-amber-950/30 via-amber-900/10 to-[#030a15]',
                    icon: DollarSign,
                    description: 'Background video for #1 ranked player in Rewards Leaderboard'
                  },
                ].map((slot) => {
                  const isUploading = !!isPublishingVideo[slot.category];
                  const isDeleting = !!isDeletingVideo[slot.category];
                  const errorMsg = videoSlotErrors[slot.category];
                  const isCustom = hasCustomVideo(slot.category, 1);
                  const publishedUrl = getLeaderboardVideoUrl(slot.category, 1);
                  const stagedFile = selectedVideoFiles[slot.category];
                  const stagedBlobUrl = previewBlobUrls[slot.category];
                  const currentPreviewUrl = stagedBlobUrl || publishedUrl;
                  const Icon = slot.icon;

                  return (
                    <div
                      key={slot.category}
                      className={`bg-gradient-to-b ${slot.bgGradient} rounded-2xl border ${slot.borderColor} p-4.5 space-y-4 shadow-xl relative overflow-hidden flex flex-col justify-between`}
                    >
                      {/* Top Header */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-lg bg-black/50 border ${slot.borderColor} ${slot.themeColor}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className={`text-sm font-black uppercase tracking-wider ${slot.themeColor}`}>
                                {slot.title}
                              </h4>
                              <p className="text-[10px] text-gray-400">
                                {slot.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow">
                              Rank #1 Slot
                            </span>
                            {stagedFile ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                                STAGED (READY TO PUBLISH)
                              </span>
                            ) : isCustom ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                LIVE ON SUPABASE
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
                                NO CUSTOM VIDEO
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Video Live Preview Box */}
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-black/90 border border-gray-800 shadow-inner group">
                        {currentPreviewUrl ? (
                          <>
                            <video
                              key={currentPreviewUrl}
                              src={currentPreviewUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              controls={false}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#020712]">
                            <Video className="w-8 h-8 text-gray-600 mb-2 opacity-50" />
                            <span className="text-xs font-bold text-gray-400">No Custom Video Active</span>
                            <span className="text-[10px] text-gray-600 mt-0.5">Card displays default look</span>
                          </div>
                        )}
                        
                        {/* Overlay Badges */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-black/70 border border-white/10 ${slot.themeColor}`}>
                            {slot.badge}
                          </span>
                        </div>

                        {currentPreviewUrl && (
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/80 px-2 py-0.5 rounded text-[8px] text-[#00e5ff] font-bold border border-cyan-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            <span>{stagedFile ? 'STAGED PREVIEW' : 'LIVE PREVIEW'}</span>
                          </div>
                        )}
                      </div>

                      {/* Staged or Published Info */}
                      {stagedFile ? (
                        <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Selected File (Unpublished)
                            </div>
                            <div className="text-[10px] font-mono text-gray-200 truncate">
                              {stagedFile.name} ({(stagedFile.size / (1024 * 1024)).toFixed(2)} MB)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearStagedVideo(slot.category)}
                            className="p-1 rounded text-gray-400 hover:text-white transition-colors"
                            title="Cancel selection"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : publishedUrl ? (
                        <div className="bg-black/50 border border-gray-800/80 rounded-lg p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Live Video URL Source</div>
                            <div className="text-[10px] font-mono text-gray-300 truncate" title={publishedUrl}>
                              {publishedUrl}
                            </div>
                          </div>
                          <a
                            href={publishedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                            title="Open video in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : null}

                      {/* Action Controls */}
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          {/* 1) Select / Change HD Video */}
                          <label className="block cursor-pointer">
                            <div className="w-full py-2.5 px-3 rounded-xl bg-[#07192e] hover:bg-[#0c2642] border border-[#00e5ff]/40 hover:border-[#00e5ff] text-center text-xs font-bold text-[#00e5ff] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                              <Video className="w-3.5 h-3.5" />
                              <span>{isCustom || stagedFile ? 'Change Video' : 'Select HD Video'}</span>
                            </div>
                            <input
                              type="file"
                              accept="video/mp4,video/*"
                              className="hidden"
                              disabled={isUploading || isDeleting}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleSelectVideoFile(slot.category, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* 2) DELETE Button */}
                          <button
                            type="button"
                            onClick={() => {
                              console.log('DELETE BUTTON CLICKED FOR', slot.category);
                              handleDeleteLeaderboardVideo(slot.category);
                            }}
                            disabled={isUploading || isDeleting}
                            className="py-2.5 px-3 rounded-xl bg-red-950/30 hover:bg-red-900/50 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-red-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Delete custom video and revert to default styling"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isDeleting ? 'Deleting...' : 'Delete Video'}</span>
                          </button>
                        </div>

                        {/* Inline YES / NO Confirmation Dialog */}
                        {deleteConfirmCategory === slot.category && (
                          <div className="p-3.5 bg-red-950/95 border-2 border-red-500 rounded-xl space-y-2.5 animate-fadeIn shadow-2xl my-2">
                            <div className="flex items-center gap-2 text-red-200 font-black text-xs">
                              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>Permanently delete video for {slot.title}?</span>
                            </div>
                            <p className="text-[11px] text-red-200/90 leading-tight">
                              This video will be permanently deleted from Supabase DB, Storage bucket, and removed for all players.
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => performDeleteLeaderboardVideo(slot.category)}
                                disabled={isDeleting}
                                className="py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-4 h-4" />
                                <span>YES, DELETE</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmCategory(null)}
                                disabled={isDeleting}
                                className="py-2.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs transition-all border border-gray-600 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <X className="w-4 h-4" />
                                <span>NO, CANCEL</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3) PUBLISH Button */}
                        <button
                          type="button"
                          onClick={() => handlePublishLeaderboardVideo(slot.category)}
                          disabled={!stagedFile || isUploading || isDeleting}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md ${
                            stagedFile && !isUploading && !isDeleting
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-emerald-500/20 cursor-pointer animate-pulse'
                              : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                          }`}
                        >
                          {isUploading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin text-black" />
                              <span>Uploading & Publishing...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>{stagedFile ? (isCustom ? 'Publish & Replace Video' : 'Publish to #1 Card') : 'Select Video to Publish'}</span>
                            </>
                          )}
                        </button>

                        {/* Progress Bar (0% → 100%) */}
                        {isUploading && (
                          <div className="space-y-1.5 p-2.5 rounded-xl bg-black/80 border border-cyan-500/40 shadow-inner">
                            <div className="flex justify-between items-center text-[11px] font-mono">
                              <span className="text-cyan-400 font-bold flex items-center gap-1.5 truncate mr-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400 flex-shrink-0" />
                                <span className="truncate">{videoUploadStage[slot.category] || 'Uploading video to storage...'}</span>
                              </span>
                              <span className="text-white font-black bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/40 text-xs">
                                {videoUploadProgress[slot.category] || 0}%
                              </span>
                            </div>
                            <div className="w-full h-3 bg-gray-950 rounded-full overflow-hidden border border-cyan-500/30 p-0.5 shadow-inner">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(6,182,212,0.8)]"
                                style={{ width: `${Math.min(100, Math.max(5, videoUploadProgress[slot.category] || 0))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {isDeleting && (
                          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-[11px] text-red-400 font-bold animate-pulse">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Removing custom video from Supabase...</span>
                          </div>
                        )}

                        {errorMsg && (
                          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-[11px] text-red-400 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{errorMsg}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 1: PUBLISH ROOM ID */}
          {activeTab === 'publish' && (() => {
            const isTournament = activeSelectedMatch?.type === 'tournament';
            const mapsList = isTournament
              ? (activeSelectedMatch?.maps && activeSelectedMatch.maps.length > 0 
                  ? activeSelectedMatch.maps 
                  : ['Erangel', 'Miramar', 'Rondo'])
              : [];

            const isTournamentModified = isTournament && (() => {
              return mapsList.some((_, i) => {
                const cred = activeSelectedMatch?.room_credentials?.[i];
                const pubId = cred ? (cred.room_id || '') : (i === 0 ? (activeSelectedMatch?.room_id || '') : '');
                const pubPass = cred ? (cred.room_password || '') : (i === 0 ? (activeSelectedMatch?.room_password || '') : '');
                const pubTimer = cred ? (cred.release_timer_minutes || 0) : 0;
                return (
                  (multiRoomIds[i] || '').trim() !== pubId || 
                  (multiRoomPasses[i] || '').trim() !== pubPass ||
                  Number(multiRoomTimers[i] || 0) !== pubTimer
                );
              });
            })();

            return (
              <form onSubmit={handlePublishSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Select Active Match</label>
                  <select
                    value={selectedMatchId}
                    onChange={(e) => {
                      setSelectedMatchId(e.target.value);
                      setSelectedMapIndex(0);
                    }}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                  >
                    {matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.type.toUpperCase()}) — {m.booked_slots}/{m.max_slots} Booked
                      </option>
                    ))}
                  </select>
                </div>

                {isTournament ? (
                  /* TOURNAMENT DYNAMIC ROOM ID ROWS */
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5" />
                        Grand Tournament Match Rooms ({mapsList.length} Boxes)
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {activeSelectedMatch?.booked_slots} Booked Players will receive access
                      </span>
                    </div>

                    {mapsList.map((mapName, idx) => {
                      const cred = activeSelectedMatch?.room_credentials?.[idx];
                      const isBoxPublished = Boolean(cred?.room_id);
                      const isTimerActive = Boolean(cred?.release_time_ms && cred.release_time_ms > Date.now());

                      return (
                        <div key={idx} className="p-3.5 rounded-xl bg-[#030a16]/60 border border-gray-800 hover:border-gray-700 space-y-2.5 transition-all">
                          <div className="flex justify-between items-center">
                            <span className="font-black text-gray-200 text-xs tracking-wide uppercase flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-[10px] font-black">
                                #{idx + 1}
                              </span>
                              {mapName} Map Match
                            </span>

                            {isBoxPublished ? (
                              isTimerActive ? (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                  ⏱️ Timer Active ({cred?.release_timer_minutes}m)
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  ✓ Live ID: {cred?.room_id}
                                </span>
                              )
                            ) : (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                ⚪ Not Published
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1 font-semibold">Room ID</label>
                              <input
                                type="text"
                                placeholder={`Enter Match #${idx + 1} Room ID`}
                                value={multiRoomIds[idx] || ''}
                                onChange={(e) => {
                                  const updated = [...multiRoomIds];
                                  updated[idx] = e.target.value;
                                  setMultiRoomIds(updated);
                                }}
                                className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs placeholder:text-gray-500 focus:border-[#00e5ff] outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1 font-semibold">Password</label>
                              <input
                                type="text"
                                placeholder={`Enter Match #${idx + 1} Password`}
                                value={multiRoomPasses[idx] || ''}
                                onChange={(e) => {
                                  const updated = [...multiRoomPasses];
                                  updated[idx] = e.target.value;
                                  setMultiRoomPasses(updated);
                                }}
                                className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs placeholder:text-gray-500 focus:border-[#00e5ff] outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between pt-1">
                            <div className="w-full sm:w-2/3">
                              <select
                                value={multiRoomTimers[idx] || 0}
                                onChange={(e) => {
                                  const updated = [...multiRoomTimers];
                                  updated[idx] = Number(e.target.value);
                                  setMultiRoomTimers(updated);
                                }}
                                className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                              >
                                <option value={0}>⚡ Instant Release (Reveal Immediately)</option>
                                <option value={5}>⏱️ 5 Minutes Delay Countdown</option>
                                <option value={10}>⏱️ 10 Minutes Delay Countdown</option>
                                <option value={15}>⏱️ 15 Minutes Delay Countdown</option>
                                <option value={20}>⏱️ 20 Minutes Delay Countdown</option>
                                <option value={30}>⏱️ 30 Minutes Delay Countdown</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => handlePublishTournamentBox(idx)}
                              className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] hover:bg-[#00e5ff]/30 border border-[#00e5ff]/40 text-xs font-black transition-all flex items-center justify-center gap-1 shrink-0"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Update Match #{idx + 1} 🔄
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* NORMAL SINGLE MATCH FLOW */
                  <div className="space-y-3 bg-[#030a16]/40 p-3.5 rounded-xl border border-gray-800">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                      <span className="text-xs font-bold text-[#00e5ff] uppercase flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" /> Single Match Credentials
                      </span>
                      {isAlreadyPublished ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          ✓ Published (ID: {activeSelectedMatch?.room_id})
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          ⚪ Not Published
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1">Custom Room ID *</label>
                      <input
                        type="text"
                        placeholder="e.g. 8839201"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1">Room Password *</label>
                      <input
                        type="text"
                        placeholder="e.g. 123"
                        value={roomPass}
                        onChange={(e) => setRoomPass(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1 flex items-center justify-between">
                        <span>Release Timer Dispatch (Minutes)</span>
                        <span className="text-[10px] text-[#00e5ff] font-extrabold font-mono">
                          {releaseTimerMinutes > 0 ? `⏱️ ${releaseTimerMinutes} MINS DELAY` : '⚡ INSTANT'}
                        </span>
                      </label>
                      <select
                        value={releaseTimerMinutes}
                        onChange={(e) => setReleaseTimerMinutes(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                      >
                        <option value={0}>⚡ Instant Release (Reveal Immediately)</option>
                        <option value={5}>⏱️ 5 Minutes Delay</option>
                        <option value={10}>⏱️ 10 Minutes Delay</option>
                        <option value={15}>⏱️ 15 Minutes Delay (Standard Esports Rule)</option>
                        <option value={20}>⏱️ 20 Minutes Delay</option>
                        <option value={30}>⏱️ 30 Minutes Delay</option>
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {releaseTimerMinutes > 0
                          ? `Room credentials will unlock automatically after a live ${releaseTimerMinutes}-minute countdown.`
                          : 'Room credentials will be unlocked immediately for players who booked slots.'}
                      </p>
                    </div>
                  </div>
                )}

                {isTournament ? (
                  /* TOURNAMENT SAVE/UPDATE BUTTON */
                  <button
                    type="submit"
                    onClick={handlePublishSubmit}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs tracking-wider shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    {isTournamentModified ? 'UPDATE & RE-PUBLISH ALL TOURNAMENT ROOMS 🔄' : 'PUBLISH ALL TOURNAMENT ROOM DETAILS 🚀'}
                  </button>
                ) : (
                  /* NORMAL BUTTONS */
                  <button
                    type="submit"
                    onClick={handlePublishSubmit}
                    className={`w-full py-3 rounded-xl bg-gradient-to-r font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all ${
                      isModified && isAlreadyPublished 
                        ? "from-blue-400 to-cyan-500 text-white shadow-blue-500/20 hover:brightness-110" 
                        : isAlreadyPublished && !isModified
                        ? "from-emerald-400 to-green-500 text-[#030a16] shadow-emerald-500/20 hover:brightness-110"
                        : "from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110"
                    }`}
                    disabled={isPublishingRoom}
                  >
                  {isPublishingRoom ? (
  <>
    <RefreshCw className="w-4 h-4 animate-spin" />
    PUBLISHING ROOM TO BOOKED PLAYERS...
  </>
) : isModified && isAlreadyPublished ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin-slow" />
                        UPDATE & RE-PUBLISH NEW ROOM DETAILS 🔄
                      </>
                    ) : isAlreadyPublished && !isModified ? (
                      <>
                        <Check className="w-4 h-4" />
                        PUBLISHED TO BOOKED PLAYERS ✓ (CLICK TO RE-SEND)
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                          PUBLISH ROOM DETAILS TO BOOKED PLAYERS 🚀
                      </>
                    )}
                  </button>
                )}
              </form>
            );
          })()}

          {/* TAB 2: SLOT MANAGER & MANUAL ENTRY (SUPABASE SINGLE SOURCE OF TRUTH) */}
          {activeTab === 'slots' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Select Match to Manage Slots</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={slotMatchId}
                    onChange={(e) => setSlotMatchId(e.target.value)}
                    className="flex-1 p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                  >
                    {selectableMatches.map((m) => {
                      const lockedCount = Array.isArray(m.locked_slots) ? m.locked_slots.length : 0;
                      const availableSlots = m.max_slots - lockedCount;
                      const bookedCount = m.id === slotMatchId ? slotBookings.length : (m.booked_slots ?? 0);
                      return (
                        <option key={m.id} value={m.id}>
                          {m.title} ({bookedCount}/{availableSlots} Booked) • {m.squad_type} • {m.type === 'tournament' ? '🏆 Tournament' : 'Single'}
                        </option>
                      );
                    })}
                  </select>

                  <button
                    onClick={() => {
                      setResultMatchId(slotMatchId);
                      setActiveTab('results');
                    }}
                    className="px-3 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 flex items-center justify-center gap-1.5 transition-all shadow shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send to Result Box
                  </button>

                  <button
                    onClick={() => loadSlotsForMatch(slotMatchId)}
                    disabled={isLoadingSlots}
                    className="p-2.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white border border-gray-700 text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                    title="Reload slots from Supabase"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlots ? 'animate-spin text-[#00e5ff]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Slot Grid / List */}
              {(() => {
                const targetMatch = matches.find((m) => m.id === slotMatchId) || selectableMatches[0];
                if (!targetMatch) {
                  return (
                    <div className="p-8 text-center text-gray-400 bg-[#020710] rounded-xl border border-gray-800 text-xs">
                      No matches available. Create a match first to manage slots.
                    </div>
                  );
                }

                const lockedSlotsSet = new Set(Array.isArray(targetMatch.locked_slots) ? targetMatch.locked_slots : []);
                const availableSlots = targetMatch.max_slots - lockedSlotsSet.size;

                // ONLY render boxes for slot numbers that are NOT in locked_slots
                const unlockedSlots: number[] = [];
                for (let i = 1; i <= targetMatch.max_slots; i++) {
                  if (!lockedSlotsSet.has(i)) {
                    unlockedSlots.push(i);
                  }
                }

                const allProfiles = Array.from(
                  new Map(
                    [...fetchedProfiles, ...getAllProfiles()].map((p) => [p.id, p])
                  ).values()
                );

                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap justify-between items-center text-xs text-gray-300 bg-[#020710] p-2.5 rounded-xl border border-gray-800 gap-2">
                      <span className="font-bold">
                        Total Booked: <strong className="text-[#00e5ff]">{slotBookings.length} / {availableSlots}</strong>
                      </span>
                      <div className="flex items-center gap-2">
                        {lockedSlotsSet.size > 0 && (
                          <span className="px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/30 text-[10px] font-bold">
                            {lockedSlotsSet.size} Locked Slots
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-300 font-bold uppercase">
                          {targetMatch.squad_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          targetMatch.type === 'tournament'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {targetMatch.type === 'tournament' ? 'Tournament Match' : 'Single Match'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Manual Player Assignment Box when an empty slot is clicked */}
                    {editingSlotNum !== null && (
                      <div className="p-3 rounded-xl bg-gradient-to-b from-[#071d33] to-[#041220] border-2 border-amber-500/80 text-xs space-y-2.5 shadow-xl animate-in fade-in duration-150">
                        <div className="flex justify-between items-center text-amber-300 font-extrabold text-[12px] border-b border-amber-500/30 pb-1.5">
                          <span className="flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                            Assign Player to Slot #{editingSlotNum} (Host Manual Booking)
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingSlotNum(null)}
                            className="text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 font-bold cursor-pointer"
                          >
                            ✕ Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-gray-300 block mb-0.5">PUBG In-Game Name (IGN) *</label>
                            <input
                              type="text"
                              placeholder="e.g. MVP丨HUNTER"
                              value={manualIgn}
                              onChange={(e) => setManualIgn(e.target.value)}
                              className="w-full p-2 rounded-lg bg-[#020710] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                              autoFocus
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-gray-300 block mb-0.5">App Username (Optional / Auto-detect)</label>
                            <input
                              type="text"
                              placeholder="e.g. @player_username"
                              value={manualUsername}
                              onChange={(e) => setManualUsername(e.target.value)}
                              className="w-full p-2 rounded-lg bg-[#020710] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-gray-300 block mb-0.5">Team Name (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. Team Alpha"
                              value={manualTeam}
                              onChange={(e) => setManualTeam(e.target.value)}
                              className="w-full p-2 rounded-lg bg-[#020710] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-gray-300 block mb-0.5">PUBG ID Number / UID (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. 5123456789"
                              value={manualUid}
                              onChange={(e) => setManualUid(e.target.value)}
                              className="w-full p-2 rounded-lg bg-[#020710] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                            />
                          </div>
                        </div>

                        {matchedPreviewProfile && (
                          <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-300 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Registered Supabase user: <strong>@{matchedPreviewProfile.username}</strong> ({matchedPreviewProfile.pubg_id_name || matchedPreviewProfile.name || 'User'})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setManualUsername(`@${matchedPreviewProfile.username}`);
                                if (!manualIgn && matchedPreviewProfile.pubg_id_name) {
                                  setManualIgn(matchedPreviewProfile.pubg_id_name);
                                }
                                if (!manualUid && matchedPreviewProfile.pubg_id_number) {
                                  setManualUid(matchedPreviewProfile.pubg_id_number);
                                }
                              }}
                              className="text-[9px] text-[#00e5ff] underline font-bold cursor-pointer"
                            >
                              Use details
                            </button>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingSlotNum(null)}
                            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAssignSlot(editingSlotNum)}
                            disabled={isSavingSlot}
                            className="flex-1 py-2 rounded-lg bg-emerald-500 text-black font-extrabold text-xs hover:brightness-110 shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isSavingSlot ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Saving to Supabase...
                              </>
                            ) : (
                              `Save Player to Slot #${editingSlotNum} (Supabase Sync)`
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {isLoadingSlots ? (
                      <div className="p-8 text-center text-gray-400 bg-[#07192e] rounded-xl border border-gray-800 flex items-center justify-center gap-2 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#00e5ff]" />
                        Loading slots from Supabase...
                      </div>
                    ) : (
                      <div className="max-h-[58vh] overflow-y-auto p-2 bg-[#020710] rounded-xl border border-gray-800 space-y-2.5 custom-scrollbar">
                        <PubgSeatGrid
                          mode="admin_manager"
                          squadType={targetMatch.squad_type}
                          matchType={targetMatch.type}
                          maxSlots={targetMatch.max_slots}
                          lockedSlots={targetMatch.locked_slots}
                          bookings={slotBookings}
                          onAdminAssignSlot={(slotNum) => {
                            setEditingSlotNum(slotNum);
                            setManualIgn('');
                            setManualTeam('');
                            setManualUid('');
                            setManualUsername('');
                          }}
                          onAdminDeleteSlot={handleClearSlot}
                          editingSlotNum={editingSlotNum}
                          allProfiles={allProfiles}
                          currentUserId={userProfile?.id}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: MATCH RESULT BOX & PROFILE SYNC ENGINE */}
          {activeTab === 'results' && (
            <div className="space-y-3.5">
              {/* Match Selector */}
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Select Match for Result Submission</label>
                <select
                  value={resultMatchId}
                  onChange={(e) => setResultMatchId(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                >
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({getMatchBookings(m.id).length} Booked) • {m.squad_type} • {m.type === 'tournament' ? '🏆 Tournament' : 'Single'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tournament Config & Result Screenshot Upload */}
              {(() => {
                const targetMatch = matches.find((m) => m.id === resultMatchId);
                const isTournament = targetMatch?.type === 'tournament';

                return (
                  <div className="p-3.5 rounded-xl bg-[#020710] border border-gray-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Match Metadata & Tournament Config
                        </h4>
                        <p className="text-[10px] text-gray-400">
                          {isTournament
                            ? '🏆 Grand Tournament Multi-Match Mode: Configure match series count and points.'
                            : '⚡ Single Match Mode: Winner and kills will sync to Supabase.'}
                        </p>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        isTournament
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40'
                      }`}>
                        {isTournament ? '🏆 TOURNAMENT' : 'SINGLE MATCH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Tournament Matches Count */}
                      {isTournament && (
                        <div>
                          <label className="text-[10px] font-bold text-amber-300 block mb-1">
                            Tournament Matches Played (Series Count) *
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={resultTournamentMatchesCount}
                            onChange={(e) => setResultTournamentMatchesCount(Math.max(1, Number(e.target.value)))}
                            className="w-full p-2 rounded bg-[#07192e] border border-amber-500/40 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                          />
                          <span className="text-[9px] text-gray-400 block mt-0.5">
                            Each registered player will have +{resultTournamentMatchesCount} matches added to their Supabase profile.
                          </span>
                        </div>
                      )}

                      {/* Result Screenshot / Banner */}
                      <div className={isTournament ? '' : 'sm:col-span-2'}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-gray-300">
                            Official Result Screenshot / Photo (Optional)
                          </label>
                          <span className="text-[9px] text-cyan-400 font-mono">
                            Independent upload (Does not auto-publish)
                          </span>
                        </div>

                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Image URL or upload file..."
                            value={resultImageUrl}
                            onChange={(e) => setResultImageUrl(e.target.value)}
                            className="flex-1 p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                          />
                          <label className={`px-3 py-2 rounded bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] border border-[#00e5ff]/40 text-xs font-bold cursor-pointer shrink-0 transition-all ${
                            isUploadingResultImage ? 'opacity-50 cursor-not-allowed' : ''
                          }`}>
                            {isUploadingResultImage ? 'Uploading...' : 'Upload File'}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingResultImage}
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleResultImageFileUpload(e.target.files[0]);
                                }
                              }}
                            />
                          </label>
                          <select
                            value={resultImageAspect}
                            onChange={(e) => setResultImageAspect(e.target.value as any)}
                            className="p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none font-mono"
                            title="Image Aspect Ratio"
                          >
                            <option value="16:9">🖥️ 16:9 Landscape</option>
                            <option value="9:16">📱 9:16 Portrait</option>
                          </select>
                        </div>

                        {resultImageUrl && (
                          <div className="mt-2 space-y-1.5">
                            <div className={`relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black/90 flex items-center justify-center p-2 ${
                              resultImageAspect === '9:16'
                                ? 'max-w-[200px] max-h-[320px] mx-auto'
                                : 'w-full max-h-[220px]'
                            }`}>
                              <img
                                src={resultImageUrl}
                                alt="Result Screenshot Preview"
                                className="w-full h-auto max-h-[300px] object-contain rounded-lg"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-black/80 text-[9px] font-mono text-cyan-300 border border-cyan-500/40">
                                  {resultImageAspect === '9:16' ? '9:16 Portrait (Uncropped)' : '16:9 Landscape (Uncropped)'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setResultImageUrl('')}
                                  className="p-1 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg cursor-pointer"
                                  title="Remove image"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-400 px-1 gap-1">
                              <span>✓ Image stored in Supabase Storage. Will be saved with match results.</span>
                              <button
                                type="button"
                                disabled={isPublishingImage}
                                onClick={handlePublishImageOnlyToMatchResult}
                                className="px-2.5 py-1 rounded bg-[#00e5ff]/20 text-[#00e5ff] font-bold hover:bg-[#00e5ff]/30 border border-[#00e5ff]/40 text-xs transition-all cursor-pointer shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {isPublishingImage ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Publishing...</span>
                                  </>
                                ) : (
                                  <span>Publish Image Only</span>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Player Draft List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-300">
                    Draft Results ({draftResults.length} Players / Teams)
                  </span>
                  <button
                    onClick={handleAddExtraDraftPlayer}
                    className="px-2 py-1 rounded bg-[#00e5ff]/10 text-[#00e5ff] hover:bg-[#00e5ff]/20 text-[10px] font-bold border border-[#00e5ff]/30 transition-all"
                  >
                    + Add Extra Player
                  </button>
                </div>

                {draftResults.length === 0 ? (
                  <div className="text-center py-8 bg-[#020710] rounded-xl border border-gray-800">
                    <p className="text-xs text-gray-400">No booked players found for this match.</p>
                    <button
                      onClick={() => setActiveTab('slots')}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 text-xs font-bold"
                    >
                      Assign Slots First
                    </button>
                  </div>
                ) : (() => {
                  const allProfiles = getAllProfiles();
                  const targetMatch = matches.find((m) => m.id === resultMatchId);
                  const isTournament = targetMatch?.type === 'tournament' || (targetMatch?.maps && targetMatch.maps.length > 1);
                  const squadType = (targetMatch?.squad_type || 'SQUAD').toUpperCase();
                  const squadSize = squadType === 'SQUAD' ? 4 : squadType === 'DUO' ? 2 : 1;

                  // 1) SOLO MODE (1 player per card)
                  if (!isTournament && squadSize === 1) {
                    return (
                      <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                        {draftResults.map((player, idx) => {
                          const cleanUname = player.username ? player.username.replace('@', '').trim().toLowerCase() : '';
                          const isLinked = allProfiles.some(p => p.username?.toLowerCase() === cleanUname || p.id === player.user_id);

                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-xl border flex flex-col gap-2.5 text-xs transition-all ${
                                player.is_winner
                                  ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-500/15'
                                  : 'bg-[#07192e] border-gray-800'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/60 pb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-extrabold text-[#00e5ff] bg-[#00e5ff]/10 px-2 py-0.5 rounded text-[10px]">
                                    #{player.slot_number}
                                  </span>
                                  <input
                                    type="text"
                                    value={player.player_ign}
                                    onChange={(e) => handleIgnChange(idx, e.target.value)}
                                    className="font-bold text-white bg-transparent border-b border-gray-700 focus:border-[#00e5ff] focus:outline-none text-xs"
                                    placeholder="PUBG IGN (Required)"
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 bg-[#020710] px-2 py-0.5 rounded border border-gray-700">
                                    <span className="text-[10px] text-gray-400 font-mono">@</span>
                                    <input
                                      type="text"
                                      placeholder="username"
                                      value={player.username ? player.username.replace('@', '') : ''}
                                      onChange={(e) => handleUsernameChange(idx, e.target.value)}
                                      className="w-24 bg-transparent text-white text-[10px] font-mono focus:outline-none"
                                    />
                                  </div>

                                  {isLinked ? (
                                    <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                      ✓ Linked
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                      Guest / Manual
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDraftPlayer(idx)}
                                    className="text-gray-500 hover:text-red-400 p-1"
                                    title="Remove player"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Kills */}
                                  <div className="flex items-center gap-1.5 bg-[#020710] px-2.5 py-1 rounded-lg border border-gray-700">
                                    <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] text-gray-400 font-bold">Kills:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={player.kills}
                                      onChange={(e) => handleKillChange(idx, Number(e.target.value))}
                                      className="w-12 bg-transparent text-white font-black text-xs text-center focus:outline-none"
                                    />
                                  </div>

                                  {/* Prize display */}
                                  <div className="flex items-center gap-1.5 bg-[#020710] px-2.5 py-1 rounded-lg border border-gray-700">
                                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] text-gray-400 font-bold">Prize (Display):</span>
                                    <input
                                      type="text"
                                      placeholder="e.g. 1500 PKR"
                                      value={player.winning_prize || ''}
                                      onChange={(e) => handlePrizeChange(idx, e.target.value)}
                                      className="w-24 bg-transparent text-emerald-400 font-bold text-[11px] focus:outline-none"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleToggleWin(idx)}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                    player.is_winner
                                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                                      : 'bg-gray-800 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {player.is_winner ? '🍗 CHICKEN DINNER WINNER' : 'NOT WIN'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // Group draft players into strict team slots according to match type
                  const maxSlotsVal = targetMatch?.max_slots || 100;
                  const totalPossibleTeams = Math.ceil(maxSlotsVal / squadSize);

                  type TeamSlotItem = {
                    slotNumber: number;
                    player?: PlayerResult;
                    globalIndex?: number;
                  };

                  type TeamBoxGroup = {
                    teamId: string;
                    teamNum: number;
                    teamName: string;
                    slots: TeamSlotItem[];
                    indices: number[];
                    totalKills: number;
                    teamPoints: number;
                    isWinner: boolean;
                    winningPrize: string;
                    bookedCount: number;
                  };

                  const teamGroupMap = new Map<number, TeamBoxGroup>();

                  // Pre-initialize slot positions for each potential team 1..totalPossibleTeams
                  for (let t = 1; t <= totalPossibleTeams; t++) {
                    const startSlot = (t - 1) * squadSize + 1;
                    const endSlot = t * squadSize;
                    const slotsArr: TeamSlotItem[] = [];
                    for (let s = startSlot; s <= endSlot; s++) {
                      slotsArr.push({ slotNumber: s });
                    }
                    teamGroupMap.set(t, {
                      teamId: `TEAM_${t}`,
                      teamNum: t,
                      teamName: `TEAM #${t}`,
                      slots: slotsArr,
                      indices: [],
                      totalKills: 0,
                      teamPoints: 0,
                      isWinner: false,
                      winningPrize: '',
                      bookedCount: 0
                    });
                  }

                  // Populate booked players into their team slot positions
                  draftResults.forEach((p, idx) => {
                    const slotNum = p.slot_number || (idx + 1);
                    const tNum = Math.ceil(slotNum / squadSize);
                    let group = teamGroupMap.get(tNum);

                    if (!group) {
                      const startSlot = (tNum - 1) * squadSize + 1;
                      const endSlot = tNum * squadSize;
                      const slotsArr: TeamSlotItem[] = [];
                      for (let s = startSlot; s <= endSlot; s++) {
                        slotsArr.push({ slotNumber: s });
                      }
                      group = {
                        teamId: `TEAM_${tNum}`,
                        teamNum: tNum,
                        teamName: p.team_name || `TEAM #${tNum}`,
                        slots: slotsArr,
                        indices: [],
                        totalKills: 0,
                        teamPoints: 0,
                        isWinner: false,
                        winningPrize: '',
                        bookedCount: 0
                      };
                      teamGroupMap.set(tNum, group);
                    }

                    if (p.team_name && group.teamName.startsWith('TEAM #')) {
                      group.teamName = p.team_name;
                    }

                    group.indices.push(idx);

                    // Place player into matching slot position or first unbooked slot
                    const slotItemIndex = group.slots.findIndex(sItem => sItem.slotNumber === slotNum);
                    if (slotItemIndex !== -1 && !group.slots[slotItemIndex].player) {
                      group.slots[slotItemIndex].player = p;
                      group.slots[slotItemIndex].globalIndex = idx;
                    } else {
                      const unbookedIdx = group.slots.findIndex(sItem => !sItem.player);
                      if (unbookedIdx !== -1) {
                        group.slots[unbookedIdx].player = p;
                        group.slots[unbookedIdx].globalIndex = idx;
                      } else {
                        group.slots.push({ slotNumber: slotNum, player: p, globalIndex: idx });
                      }
                    }

                    group.bookedCount += 1;
                    group.totalKills += p.kills || 0;
                    group.teamPoints = Math.max(group.teamPoints, p.points || 0);
                    if (p.is_winner) group.isWinner = true;
                    if (p.winning_prize && !group.winningPrize) group.winningPrize = String(p.winning_prize);
                  });

                  // RULE 2: Only show teams that have at least 1 booked player (bookedCount > 0)
                  const activeTeamGroups = Array.from(teamGroupMap.values()).filter(g => g.bookedCount > 0);

                  // RULE 4: Team ranking in Result Box - Sort teams by team points / kills (highest team on TOP)
                  activeTeamGroups.sort((a, b) => {
                    if (a.isWinner && !b.isWinner) return -1;
                    if (!a.isWinner && b.isWinner) return 1;
                    if (b.teamPoints !== a.teamPoints) return b.teamPoints - a.teamPoints;
                    return b.totalKills - a.totalKills;
                  });

                  // 2) TOURNAMENT MODE (Points-based ranking with VIP Top 3 Cards)
                  if (isTournament) {
                    return (
                      <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                        {activeTeamGroups.map((team, rankIdx) => {
                          const rank = rankIdx + 1;
                          const isFirst = rank === 1;
                          const isSecond = rank === 2;
                          const isThird = rank === 3;

                          return (
                            <div
                              key={team.teamId + rankIdx}
                              className={`p-3.5 rounded-xl border-2 flex flex-col gap-3 text-xs transition-all ${
                                isFirst
                                  ? 'bg-gradient-to-b from-yellow-500/20 via-[#07192e] to-[#030a16] border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]'
                                  : isSecond
                                  ? 'bg-gradient-to-b from-slate-400/15 via-[#07192e] to-[#030a16] border-slate-300 shadow-[0_0_12px_rgba(203,213,225,0.15)]'
                                  : isThird
                                  ? 'bg-gradient-to-b from-amber-700/15 via-[#07192e] to-[#030a16] border-amber-600 shadow-[0_0_12px_rgba(217,119,6,0.15)]'
                                  : team.isWinner
                                  ? 'bg-emerald-950/30 border-emerald-500/50'
                                  : 'bg-[#07192e] border-gray-800'
                              }`}
                            >
                              {/* Team Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase shadow ${
                                    isFirst
                                      ? 'bg-yellow-400 text-black'
                                      : isSecond
                                      ? 'bg-slate-200 text-black'
                                      : isThird
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-gray-800 text-gray-300'
                                  }`}>
                                    {isFirst ? '🥇 1ST PLACE VIP' : isSecond ? '🥈 2ND PLACE' : isThird ? '🥉 3RD PLACE' : `#${rank} RANK`}
                                  </span>

                                  <input
                                    type="text"
                                    value={team.teamName}
                                    onChange={(e) => handleTeamNameChange(team.indices, e.target.value)}
                                    className="font-black text-white bg-transparent border-b border-gray-700 focus:border-amber-400 focus:outline-none text-xs"
                                    placeholder="Team Name"
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-400 font-bold bg-[#020710] px-2 py-0.5 rounded border border-gray-700">
                                    Team Kills: <strong className="text-white">{team.totalKills}</strong>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleTeamWinToggle(team.indices)}
                                    className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                                      team.isWinner
                                        ? 'bg-yellow-400 text-black shadow'
                                        : 'bg-gray-800 text-gray-400 hover:text-white'
                                    }`}
                                  >
                                    {team.isWinner ? '🏆 WIN' : 'NOT WIN'}
                                  </button>
                                </div>
                              </div>

                              {/* Points & Prize row */}
                              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#020710]/80 p-2 rounded-lg border border-gray-800">
                                <div className="flex items-center gap-2">
                                  <Trophy className="w-4 h-4 text-yellow-400" />
                                  <span className="text-[10px] font-bold text-yellow-300">TOTAL POINTS (For Ranking):</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={team.teamPoints}
                                    onChange={(e) => handleTeamPointsChange(team.indices, Number(e.target.value))}
                                    className="w-16 p-1 rounded bg-[#07192e] border border-yellow-500/50 text-yellow-400 font-black text-xs text-center focus:outline-none focus:border-yellow-400"
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-[10px] text-gray-400 font-bold">Winning Prize (Display):</span>
                                  <input
                                    type="text"
                                    placeholder="e.g. 5000 PKR"
                                    value={team.winningPrize}
                                    onChange={(e) => handleTeamPrizeChange(team.indices, e.target.value)}
                                    className="w-28 p-1 rounded bg-[#07192e] border border-gray-700 text-emerald-400 font-bold text-[11px] focus:outline-none focus:border-emerald-400"
                                  />
                                </div>
                              </div>

                              {/* Players Roster Sub-rows */}
                              <div className="space-y-1.5 pt-1">
                                {team.slots.map((sItem) => {
                                  const player = sItem.player;
                                  const globalIdx = sItem.globalIndex;

                                  if (player && globalIdx !== undefined) {
                                    const cleanUname = player.username ? player.username.replace('@', '').trim().toLowerCase() : '';
                                    const isLinked = allProfiles.some(p => p.username?.toLowerCase() === cleanUname || p.id === player.user_id);

                                    return (
                                      <div key={sItem.slotNumber} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#020710]/50 rounded-lg border border-gray-800 text-[11px]">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-extrabold text-[#00e5ff] text-[10px] bg-[#00e5ff]/10 px-1.5 py-0.5 rounded">
                                            #{sItem.slotNumber}
                                          </span>
                                          <input
                                            type="text"
                                            value={player.player_ign}
                                            onChange={(e) => handleIgnChange(globalIdx, e.target.value)}
                                            className="font-bold text-white bg-transparent border-b border-gray-700 focus:border-[#00e5ff] focus:outline-none text-[11px] w-28 sm:w-36"
                                            placeholder="Player IGN"
                                          />
                                          <div className="flex items-center gap-1 bg-[#040e1a] px-1.5 py-0.5 rounded border border-gray-700">
                                            <span className="text-[10px] text-gray-500 font-mono">@</span>
                                            <input
                                              type="text"
                                              placeholder="username"
                                              value={player.username ? player.username.replace('@', '') : ''}
                                              onChange={(e) => handleUsernameChange(globalIdx, e.target.value)}
                                              className="w-20 bg-transparent text-white text-[10px] font-mono focus:outline-none"
                                            />
                                          </div>
                                          {isLinked ? (
                                            <span className="text-[9px] text-emerald-400 font-bold">✓ Linked</span>
                                          ) : (
                                            <span className="text-[9px] text-gray-500">Guest</span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1 bg-[#040e1a] px-2 py-0.5 rounded border border-gray-700">
                                            <Crosshair className="w-3 h-3 text-emerald-400" />
                                            <span className="text-[10px] text-gray-400">Kills:</span>
                                            <input
                                              type="number"
                                              min={0}
                                              value={player.kills}
                                              onChange={(e) => handleKillChange(globalIdx, Number(e.target.value))}
                                              className="w-10 bg-transparent text-white font-bold text-xs text-center focus:outline-none"
                                            />
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => handleRemoveDraftPlayer(globalIdx)}
                                            className="text-gray-500 hover:text-red-400 p-1"
                                            title="Remove player"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={sItem.slotNumber} className="flex items-center justify-between gap-2 p-2 bg-[#020710]/20 rounded-lg border border-dashed border-gray-800 text-[11px] opacity-70 hover:opacity-100 transition-all">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-gray-600 text-[10px] px-1.5 py-0.5 rounded bg-gray-900">
                                          #{sItem.slotNumber}
                                        </span>
                                        <span className="text-gray-500 font-medium text-[11px] italic">
                                          No player (Empty Slot)
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const ign = prompt(`Enter PUBG IGN for Slot #${sItem.slotNumber}:`);
                                          if (ign && ign.trim()) {
                                            setDraftResults(prev => [
                                              ...prev,
                                              {
                                                slot_number: sItem.slotNumber,
                                                player_ign: ign.trim(),
                                                username: '',
                                                team_name: team.teamName,
                                                kills: 0,
                                                is_winner: false,
                                                points: 0,
                                                winning_prize: ''
                                              }
                                            ]);
                                          }
                                        }}
                                        className="text-[10px] font-bold text-[#00e5ff] hover:underline px-2 py-0.5 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/20"
                                      >
                                        + Assign Player
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // 3) DUO / SQUAD SINGLE MATCH MODE (Team cards with 2 or 4 players per card)
                  return (
                    <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                      {activeTeamGroups.map((team, tIdx) => {
                        const rank = tIdx + 1;

                        return (
                          <div
                            key={team.teamId + tIdx}
                            className={`p-3.5 rounded-xl border flex flex-col gap-2.5 text-xs transition-all ${
                              team.isWinner
                                ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-500/15'
                                : 'bg-[#07192e] border-gray-800'
                            }`}
                          >
                            {/* Team Card Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-extrabold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-[10px]">
                                  #{rank} {team.teamName}
                                </span>
                                <input
                                  type="text"
                                  value={team.teamName}
                                  onChange={(e) => handleTeamNameChange(team.indices, e.target.value)}
                                  className="font-bold text-white bg-transparent border-b border-gray-700 focus:border-[#00e5ff] focus:outline-none text-xs"
                                  placeholder="Team Name"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 font-bold bg-[#020710] px-2 py-0.5 rounded border border-gray-700">
                                  Team Kills: <strong className="text-white">{team.totalKills}</strong>
                                </span>

                                <div className="flex items-center gap-1 bg-[#020710] px-2 py-0.5 rounded border border-gray-700">
                                  <DollarSign className="w-3 h-3 text-emerald-400" />
                                  <input
                                    type="text"
                                    placeholder="Team Prize (PKR)"
                                    value={team.winningPrize}
                                    onChange={(e) => handleTeamPrizeChange(team.indices, e.target.value)}
                                    className="w-24 bg-transparent text-emerald-400 font-bold text-[10px] focus:outline-none"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleTeamWinToggle(team.indices)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                                    team.isWinner
                                      ? 'bg-emerald-500 text-black shadow'
                                      : 'bg-gray-800 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {team.isWinner ? '🍗 WINNER TEAM' : 'NOT WIN'}
                                </button>
                              </div>
                            </div>

                            {/* Players Sub-rows */}
                            <div className="space-y-1.5">
                              {team.slots.map((sItem) => {
                                const player = sItem.player;
                                const globalIdx = sItem.globalIndex;

                                if (player && globalIdx !== undefined) {
                                  const cleanUname = player.username ? player.username.replace('@', '').trim().toLowerCase() : '';
                                  const isLinked = allProfiles.some(p => p.username?.toLowerCase() === cleanUname || p.id === player.user_id);

                                  return (
                                    <div key={sItem.slotNumber} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#020710]/50 rounded-lg border border-gray-800 text-[11px]">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-extrabold text-[#00e5ff] text-[10px] bg-[#00e5ff]/10 px-1.5 py-0.5 rounded">
                                          #{sItem.slotNumber}
                                        </span>
                                        <input
                                          type="text"
                                          value={player.player_ign}
                                          onChange={(e) => handleIgnChange(globalIdx, e.target.value)}
                                          className="font-bold text-white bg-transparent border-b border-gray-700 focus:border-[#00e5ff] focus:outline-none text-[11px] w-28 sm:w-36"
                                          placeholder="Player IGN"
                                        />
                                        <div className="flex items-center gap-1 bg-[#040e1a] px-1.5 py-0.5 rounded border border-gray-700">
                                          <span className="text-[10px] text-gray-500 font-mono">@</span>
                                          <input
                                            type="text"
                                            placeholder="username"
                                            value={player.username ? player.username.replace('@', '') : ''}
                                            onChange={(e) => handleUsernameChange(globalIdx, e.target.value)}
                                            className="w-20 bg-transparent text-white text-[10px] font-mono focus:outline-none"
                                          />
                                        </div>
                                        {isLinked ? (
                                          <span className="text-[9px] text-emerald-400 font-bold">✓ Linked</span>
                                        ) : (
                                          <span className="text-[9px] text-gray-500">Guest</span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 bg-[#040e1a] px-2 py-0.5 rounded border border-gray-700">
                                          <Crosshair className="w-3 h-3 text-emerald-400" />
                                          <span className="text-[10px] text-gray-400">Kills:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            value={player.kills}
                                            onChange={(e) => handleKillChange(globalIdx, Number(e.target.value))}
                                            className="w-10 bg-transparent text-white font-bold text-xs text-center focus:outline-none"
                                          />
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => handleRemoveDraftPlayer(globalIdx)}
                                          className="text-gray-500 hover:text-red-400 p-1"
                                          title="Remove player"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={sItem.slotNumber} className="flex items-center justify-between gap-2 p-2 bg-[#020710]/20 rounded-lg border border-dashed border-gray-800 text-[11px] opacity-70 hover:opacity-100 transition-all">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-gray-600 text-[10px] px-1.5 py-0.5 rounded bg-gray-900">
                                        #{sItem.slotNumber}
                                      </span>
                                      <span className="text-gray-500 font-medium text-[11px] italic">
                                        No player (Empty Slot)
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ign = prompt(`Enter PUBG IGN for Slot #${sItem.slotNumber}:`);
                                        if (ign && ign.trim()) {
                                          setDraftResults(prev => [
                                            ...prev,
                                            {
                                              slot_number: sItem.slotNumber,
                                              player_ign: ign.trim(),
                                              username: '',
                                              team_name: team.teamName,
                                              kills: 0,
                                              is_winner: false,
                                              points: 0,
                                              winning_prize: ''
                                            }
                                          ]);
                                        }
                                      }}
                                      className="text-[10px] font-bold text-[#00e5ff] hover:underline px-2 py-0.5 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/20"
                                    >
                                      + Assign Player
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Submit & Safe Sync Box */}
                <div className="pt-2 space-y-2.5">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px] text-gray-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Supabase Stats Sync & Wallet Isolation Guarantee</span>
                    </div>
                    <p className="text-gray-400">
                      • Matches played (+{matches.find(m => m.id === resultMatchId)?.type === 'tournament' ? (resultTournamentMatchesCount || 3) : 1}), total kills, and wins will sync to registered player profiles in Supabase.
                    </p>
                    <p className="text-amber-400/90 font-medium">
                      • <strong>Security Lock</strong>: Winning prize amounts are strictly for public display on the match result card and will never automatically modify player wallet balances.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isPublishingResult || draftResults.length === 0}
                    onClick={handleSubmitAndUpdateStats}
                    className={`w-full py-3.5 rounded-xl font-black text-xs tracking-wider shadow-xl flex items-center justify-center gap-2 transition-all ${
                      isPublishingResult || draftResults.length === 0
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                        : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-black shadow-emerald-500/20 hover:brightness-110 active:scale-[0.99] cursor-pointer'
                    }`}
                  >
                    {isPublishingResult ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        PUBLISHING RESULTS & SYNCING STATS...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        SUBMIT & PUBLISH MATCH RESULT (SYNC PLAYER STATS TO SUPABASE)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* SECTION: PUBLISHED MATCH RESULTS */}
              <div className="mt-8 pt-6 border-t border-[#00e5ff]/20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-[#00e5ff] uppercase tracking-wider flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#00e5ff]" />
                      PUBLISHED MATCH RESULTS
                    </h3>
                    <p className="text-[10px] text-gray-400">
                      Live published records from Supabase table <code className="text-cyan-300 font-mono">match_results</code>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
                      {publishedResults.length} Published
                    </span>
                    <button
                      type="button"
                      onClick={() => loadPublishedResults()}
                      disabled={isLoadingPublishedResults}
                      className="p-1.5 rounded-lg bg-[#07192e] border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/20 text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                      title="Refresh Published Results List"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPublishedResults ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {deleteNoticeMsg && (
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in ${
                    deleteNoticeMsg.type === 'success'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : 'bg-red-950/80 border-red-500/50 text-red-300'
                  }`}>
                    <span>{deleteNoticeMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setDeleteNoticeMsg(null)}
                      className="p-1 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {isLoadingPublishedResults && publishedResults.length === 0 ? (
                  <div className="p-8 text-center bg-[#020710] rounded-xl border border-gray-800 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#00e5ff] mx-auto" />
                    <p className="text-xs text-gray-400">Loading published match results from Supabase...</p>
                  </div>
                ) : publishedResults.length === 0 ? (
                  <div className="p-8 text-center bg-[#020710] rounded-xl border border-gray-800 space-y-1">
                    <Award className="w-8 h-8 text-gray-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-gray-300">No Published Results Found</p>
                    <p className="text-[10px] text-gray-500">
                      Results published via the form above will be stored in Supabase and displayed here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {publishedResults.map((item, idx) => {
                      const playerCount = Array.isArray(item.results) ? item.results.length : 0;
                      const winner = Array.isArray(item.results) ? item.results.find((r: any) => r.is_winner || r.is_win) : null;
                      const img = item.screenshot_url || item.result_image_url;
                      const pubDateStr = item.published_at
                        ? new Date(item.published_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })
                        : 'Recently';

                      return (
                        <div
                          key={item.id || item.match_id || idx}
                          className="p-3.5 rounded-xl bg-[#030a16] border border-[#00e5ff]/20 hover:border-[#00e5ff]/40 transition-all flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between"
                        >
                          {/* Screenshot Thumbnail or Icon */}
                          <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
                            {img ? (
                              <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-black border border-[#00e5ff]/30 shrink-0">
                                <img
                                  src={img}
                                  alt={item.match_title}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono text-[#00e5ff] px-1">
                                  {item.result_image_aspect === '9:16' ? '9:16' : '16:9'}
                                </span>
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-[#07192e] border border-gray-800 flex items-center justify-center shrink-0 text-gray-500">
                                <Trophy className="w-5 h-5 text-gray-400" />
                              </div>
                            )}

                            {/* Match Details */}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-extrabold text-white text-xs truncate">
                                  {item.match_title}
                                </h4>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 uppercase">
                                  {item.squad_type || item.match_type || 'Match'}
                                </span>
                                {item.map && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-gray-400 bg-gray-900 border border-gray-800">
                                    📍 {item.map}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                                <span className="flex items-center gap-1 font-mono text-[#00e5ff]">
                                  <Calendar className="w-3 h-3 text-[#00e5ff]" />
                                  {pubDateStr}
                                </span>
                                <span className="flex items-center gap-1 font-mono text-emerald-400">
                                  <Users className="w-3 h-3 text-emerald-400" />
                                  {playerCount} Players/Teams
                                </span>
                                {winner && (
                                  <span className="text-amber-300 font-bold truncate max-w-[180px]">
                                    🏆 Winner: {winner.player_ign || winner.team_name || winner.username || '1st Place'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => setDeletingResultItem(item)}
                              className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-500/40 text-xs font-bold transition-all flex items-center gap-1.5 shadow active:scale-95 cursor-pointer"
                              title="Delete Published Match Result"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MANAGE & EDIT MATCHES */}
          {activeTab === 'manage_matches' && (
            <div className="space-y-4">
              {editingMatch ? (
                <form onSubmit={handleSaveMatchEdit} className="p-4 bg-[#07192e] rounded-2xl border border-amber-500/50 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                    <h3 className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4 text-amber-400" />
                      EDITING MATCH: #{editingMatch.id}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingMatch(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800 text-gray-200 hover:text-white hover:bg-gray-700 active:scale-95 transition-all cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>

                  {hostMatchSuccessMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{hostMatchSuccessMsg}</span>
                    </div>
                  )}

                  {hostMatchErrorMsg && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-red-400">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{hostMatchErrorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">Match / Tournament Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs focus:outline-none focus:border-amber-400"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Type</label>
                      <select
                        value={type === 'tournament' ? 'tournament' : 'match'}
                        onChange={(e) => {
                          if (e.target.value === 'tournament') {
                            handleTypeChange('tournament');
                          } else {
                            const currentMode =
                              type === 'solo' || type === 'duo' || type === 'squad'
                                ? type
                                : squadType.toLowerCase() === 'solo'
                                  ? 'solo'
                                  : squadType.toLowerCase() === 'duo'
                                    ? 'duo'
                                    : 'squad';
                            handleTypeChange(currentMode);
                          }
                        }}
                        className="w-full p-2 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                      >
                        <option value="match">Match</option>
                        <option value="tournament">Tournament</option>
                      </select>
                    </div>

                    {type === 'tournament' ? (
                      <div>
                        <label className="text-[11px] font-bold text-gray-300 block mb-1">Series Length (Matches)</label>
                        <select
                          value={tournamentMatchCount}
                          onChange={(e) => setTournamentMatchCount(Number(e.target.value))}
                          className="w-full p-2 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                        >
                          <option value={1}>1 Match</option>
                          <option value={2}>2 Matches</option>
                          <option value={3}>3 Matches</option>
                          <option value={4}>4 Matches</option>
                          <option value={5}>5 Matches</option>
                          <option value={6}>6 Matches</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] font-bold text-gray-300 block mb-1">Mode</label>
                        <select
                          value={type === 'solo' || type === 'duo' || type === 'squad' ? type : squadType.toLowerCase()}
                          onChange={(e) => handleTypeChange(e.target.value as MatchType)}
                          className="w-full p-2 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                        >
                          <option value="solo">Solo</option>
                          <option value="duo">Duo</option>
                          <option value="squad">Squad</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {type !== 'tournament' && (
                    <div className="mt-2">
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Map</label>
                      <select
                        value={map}
                        onChange={(e) => handleMapChange(e.target.value as MapType)}
                        className="w-full p-2 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                      >
                        <option value="Erangel">Erangel</option>
                        <option value="Miramar">Miramar</option>
                        <option value="Sanhok">Sanhok</option>
                        <option value="Livik">Livik</option>
                        <option value="Karakin">Karakin</option>
                        <option value="Nusa">Nusa</option>
                        <option value="Warehouse">Warehouse</option>
                        <option value="Rondo">Rondo</option>
                        <option value="Vikendi">Vikendi</option>
                        <option value="WOW">WOW</option>
                      </select>
                    </div>
                  )}

                  {renderSlotSelectorGrid()}

                  {renderThumbnailSelector(true)}

                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">Max Player Slots</label>
                    <input
                      type="number"
                      value={maxSlots}
                      onChange={(e) => setMaxSlots(Number(e.target.value))}
                      className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                    />
                  </div>

                  {renderStartTimePickerSection()}

                  <div className={`grid ${type === 'tournament' ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-2 text-xs`}>
                    <div>
                      <label className="text-[9px] font-bold text-gray-300 block mb-0.5">Entry Fee (RS)</label>
                      <input
                        type="number"
                        value={entryFee}
                        onChange={(e) => setEntryFee(Number(e.target.value))}
                        className="w-full p-2 rounded bg-[#030a16] border border-gray-700 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-300 block mb-0.5">1st Prize</label>
                      <input
                        type="number"
                        value={firstPrize}
                        onChange={(e) => setFirstPrize(Number(e.target.value))}
                        className="w-full p-2 rounded bg-[#030a16] border border-gray-700 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-300 block mb-0.5">2nd Prize</label>
                      <input
                        type="number"
                        value={secondPrize}
                        onChange={(e) => setSecondPrize(Number(e.target.value))}
                        className="w-full p-2 rounded bg-[#030a16] border border-gray-700 text-white text-xs"
                      />
                    </div>
                    {type === 'tournament' && (
                      <div>
                        <label className="text-[9px] font-bold text-gray-300 block mb-0.5">3rd Prize</label>
                        <input
                          type="number"
                          value={thirdPrize}
                          onChange={(e) => setThirdPrize(Number(e.target.value))}
                          className="w-full p-2 rounded bg-[#030a16] border border-gray-700 text-white text-xs"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-[9px] font-bold text-gray-300 block mb-0.5">Per Kill Prize</label>
                      <input
                        type="number"
                        value={perKillPrize}
                        onChange={(e) => setPerKillPrize(Number(e.target.value))}
                        className="w-full p-2 rounded bg-[#030a16] border border-gray-700 text-white text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">Custom Rules & Instructions</label>
                    <textarea
                      rows={2}
                      value={matchRules}
                      onChange={(e) => setMatchRules(e.target.value)}
                      placeholder="e.g. No emulators allowed. Hacks/cheating will lead to instant permanent ban."
                      className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-700 text-white text-xs"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSavingMatch}
                      className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-black text-xs tracking-wider shadow-lg shadow-amber-500/20 hover:brightness-110 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      {isSavingMatch ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-black" />
                          <span>SAVING MODIFICATIONS...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>SAVE MATCH MODIFICATIONS</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingMatch}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingMatch(null);
                      }}
                      className="px-4 py-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 hover:text-white font-extrabold text-xs border border-gray-700 cursor-pointer transition-all disabled:opacity-50"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-[#07192e] p-2.5 rounded-xl border border-[#00e5ff]/20">
                    <span className="text-xs font-black text-[#00e5ff] uppercase tracking-wider">
                      ALL TOURNAMENTS & MATCHES ({matches.length})
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">Edit details, slots, credentials & results</span>
                  </div>

                  {matches.map((m) => {
                    const bookedCount = getMatchBookings(m.id).length;
                    return (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-2xl bg-gradient-to-br from-[#07192e] to-[#020710] border border-gray-800 hover:border-[#00e5ff]/40 space-y-3 transition-all"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#00e5ff]/20 text-[#00e5ff] uppercase">
                                #{m.id} • {m.type}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase">
                                {m.map}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-white">{m.title}</h4>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Time: <strong className="text-white">{m.match_time}</strong> | Entry: <strong className="text-emerald-400">RS. {m.entry_fee}</strong> | Pool: <strong className="text-[#00e5ff]">RS. {Number(m.prizes?.total_pool ?? m.entry_fee ?? 0).toLocaleString()}</strong>
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-extrabold text-[#00e5ff] bg-[#00e5ff]/10 px-2.5 py-1 rounded-full border border-[#00e5ff]/30 block">
                              {bookedCount} / {m.max_slots} SLOTS
                            </span>
                          </div>
                        </div>

                        {/* Quick Admin Actions Toolbar */}
                        {deleteConfirmMatchId === m.id ? (
                          <div className="pt-2 border-t border-gray-800 text-[10px] space-y-2">
                            <p className="text-red-400 font-bold text-center text-xs">
                              Are you sure you want to permanently delete this match? This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={deletingMatchId === m.id}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  await handleDeleteMatch(m.id);
                                }}
                                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-xs border border-red-500 flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-lg shadow-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deletingMatchId === m.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                                    <span>DELETING...</span>
                                  </>
                                ) : (
                                  <span>YES, DELETE MATCH</span>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={deletingMatchId === m.id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeleteConfirmMatchId(null);
                                }}
                                className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 active:scale-95 border border-gray-700 text-gray-200 hover:text-white font-extrabold text-xs cursor-pointer transition-all disabled:opacity-50"
                              >
                                CANCEL
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-gray-800 text-[10px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleStartEditMatch(m);
                              }}
                              className="py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-300 font-bold border border-amber-500/30 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSlotMatchId(m.id);
                                setActiveTab('slots');
                              }}
                              className="py-1.5 px-2 rounded-lg bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 active:scale-95 text-[#00e5ff] font-bold border border-[#00e5ff]/30 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Users className="w-3 h-3" />
                              <span>Slots</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedMatchId(m.id);
                                setActiveTab('publish');
                              }}
                              className="py-1.5 px-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 text-purple-300 font-bold border border-purple-500/30 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Room</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setResultMatchId(m.id);
                                setActiveTab('results');
                              }}
                              className="py-1.5 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-300 font-bold border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Trophy className="w-3 h-3" />
                              <span>Results</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteConfirmMatchId(m.id);
                              }}
                              className="py-1.5 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 font-bold border border-red-500/30 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CREATE MATCH */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              {hostMatchSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{hostMatchSuccessMsg}</span>
                </div>
              )}

              {hostMatchErrorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-red-400">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{hostMatchErrorMsg}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-gray-300 block mb-1">Tournament / Match Title *</label>
                <input
                  type="text"
                  placeholder="e.g. SUNDAY NIGHT ERANGEL CASH CUP"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-300 block mb-1">Type</label>
                  <select
                    value={type === 'tournament' ? 'tournament' : 'match'}
                    onChange={(e) => {
                      if (e.target.value === 'tournament') {
                        handleTypeChange('tournament');
                      } else {
                        handleTypeChange(
                          type === 'solo' || type === 'duo' || type === 'squad'
                            ? type
                            : 'squad'
                        );
                      }
                    }}
                    className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                  >
                    <option value="match">Match</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </div>

                {type === 'tournament' ? (
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">Series Length (Matches)</label>
                    <select
                      value={tournamentMatchCount}
                      onChange={(e) => setTournamentMatchCount(Number(e.target.value))}
                      className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                    >
                      <option value={1}>1 Match</option>
                      <option value={2}>2 Matches</option>
                      <option value={3}>3 Matches</option>
                      <option value={4}>4 Matches</option>
                      <option value={5}>5 Matches</option>
                      <option value={6}>6 Matches</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">Mode</label>
                    <select
                      value={type === 'solo' || type === 'duo' || type === 'squad' ? type : 'squad'}
                      onChange={(e) => handleTypeChange(e.target.value as MatchType)}
                      className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                    >
                      <option value="solo">Solo</option>
                      <option value="duo">Duo</option>
                      <option value="squad">Squad</option>
                    </select>
                  </div>
                )}
              </div>

              {type !== 'tournament' && (
                <div className="mt-2">
                  <label className="text-[11px] font-bold text-gray-300 block mb-1">Map</label>
                  <select
                    value={map}
                    onChange={(e) => handleMapChange(e.target.value as MapType)}
                    className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                  >
                    <option value="Erangel">Erangel</option>
                    <option value="Miramar">Miramar</option>
                    <option value="Sanhok">Sanhok</option>
                    <option value="Livik">Livik</option>
                    <option value="Karakin">Karakin</option>
                    <option value="Nusa">Nusa</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Rondo">Rondo</option>
                    <option value="Vikendi">Vikendi</option>
                    <option value="WOW">WOW</option>
                  </select>
                </div>
              )}

              {type === 'tournament' && (
                <div className="grid grid-cols-2 gap-2 bg-[#030a16]/40 p-3 rounded-lg border border-gray-800">
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">
                      {type === 'tournament' ? 'Tournament Series Mode' : type === 'wow' ? 'WOW Match Format' : 'TDM Match Format'}
                    </label>
                    <select
                      value={squadType}
                      onChange={(e) => setSquadType(e.target.value as 'SOLO' | 'DUO' | 'SQUAD')}
                      className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                    >
                      <option value="SQUAD">Squad (Up to 4 Players)</option>
                      <option value="DUO">Duo (Up to 2 Players)</option>
                      <option value="SOLO">Solo (1 Player)</option>
                    </select>
                  </div>

                  {type === 'tournament' && (
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Gap Between Matches (Mins)</label>
                      <input
                        type="number"
                        placeholder="e.g. 15"
                        value={gapMinutes}
                        onChange={(e) => setGapMinutes(Number(e.target.value))}
                        className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs"
                        min={0}
                      />
                    </div>
                  )}
                </div>
              )}

              {renderSlotSelectorGrid()}

              {renderStartTimePickerSection()}

              {renderThumbnailSelector(false)}

              <div className={`grid ${type === 'tournament' ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-2`}>
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Entry Fee (RS.)</label>
                  <input
                    type="number"
                    value={entryFee}
                    onChange={(e) => setEntryFee(Number(e.target.value))}
                    className="w-full p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">1st Prize (RS.)</label>
                  <input
                    type="number"
                    value={firstPrize}
                    onChange={(e) => setFirstPrize(Number(e.target.value))}
                    className="w-full p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">2nd Prize (RS.)</label>
                  <input
                    type="number"
                    value={secondPrize}
                    onChange={(e) => setSecondPrize(Number(e.target.value))}
                    className="w-full p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs"
                  />
                </div>
                {type === 'tournament' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1">3rd Prize (RS.)</label>
                    <input
                      type="number"
                      value={thirdPrize}
                      onChange={(e) => setThirdPrize(Number(e.target.value))}
                      className="w-full p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Per Kill (RS.)</label>
                  <input
                    type="number"
                    value={perKillPrize}
                    onChange={(e) => setPerKillPrize(Number(e.target.value))}
                    className="w-full p-2 rounded bg-[#07192e] border border-gray-700 text-white text-xs"
                  />
                </div>
              </div>

       <div className="mt-4 pt-3 pb-6 border-t border-[#00e5ff]/15">slot_bookings
                <button
                  type="submit"
                  disabled={isCreatingMatch || isUploadingBanner || isUploadingMapBanner.some(Boolean)}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs tracking-wider shadow-[0_0_18px_rgba(0,229,255,0.28)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-cyan-300/30"
                >
                {isCreatingMatch
                  ? 'PUBLISHING...'
                  : (isUploadingBanner || isUploadingMapBanner.some(Boolean))
                  ? '⏳ UPLOADING IMAGE...'
                  : 'CREATE & LAUNCH MATCH'}
                </button>
              </div>
            </form>
          )}

          {/* TAB: DEPOSITS APPROVAL */}
          {activeTab === 'deposits' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[#07192e] p-2.5 rounded-xl border border-[#00e5ff]/20">
                <span className="text-xs font-black text-[#00e5ff] uppercase tracking-wider">
                  PENDING DEPOSIT REQUESTS ({pendingDepositTransactions.length})
                </span>
                <span className="text-[10px] text-gray-400 font-medium">Review and approve deposits</span>
              </div>

              {pendingDepositTransactions.length === 0 ? (
                <div className="text-center py-8 bg-[#07192e]/40 rounded-xl border border-gray-800">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-white">No Pending Deposit Requests</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">All player deposit submissions have been processed.</p>
                </div>
              ) : (
                pendingDepositTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-[#07192e] to-[#020710] border border-amber-500/40 space-y-3 text-xs shadow-lg"
                  >
                    {/* Card Header */}
                    <div className="flex justify-between items-start pb-2 border-b border-gray-800">
                      <div>
                        <span className="text-[10px] font-extrabold text-amber-400 tracking-wider uppercase block">
                          DEPOSIT REQUEST • {tx.payment_method || 'JazzCash/EasyPaisa'}
                        </span>
                        <h4 className="text-base font-black text-white">
                          RS. {(parseAmount(tx.amount) ?? 0).toLocaleString()} <span className="text-xs text-[#00e5ff] font-bold">PKR</span>
                        </h4>
                      </div>
                      <span className="text-[10px] font-extrabold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40 uppercase">
                        PENDING APPROVAL
                      </span>
                    </div>

                    {/* Request Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#030a16] p-2.5 rounded-xl border border-gray-800/80">
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Player Username</span>
                        <span className="font-extrabold text-white">{renderTxPlayer(tx)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">User Email</span>
                        <span className="font-semibold text-gray-300 truncate block">{tx.user_email || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Sender Real Name</span>
                        <span className="font-bold text-emerald-400">{tx.sender_name || tx.account_title || tx.user_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Trx ID / TID</span>
                        <span className="font-black text-[#00e5ff] tracking-wider">{tx.trx_id || 'N/A'}</span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-gray-800/60 flex justify-between items-center text-[10px] text-gray-400">
                        <span>Submitted: {new Date(tx.created_at).toLocaleString()}</span>
                        <span>Method: {tx.payment_method}</span>
                      </div>
                    </div>

                    {/* Screenshot Thumbnail */}
                    {tx.screenshot_url ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-400 block">Payment Receipt Screenshot:</span>
                        <div
                          onClick={() => {
                            setPreviewScreenshot({
                              url: tx.screenshot_url!,
                              title: `Deposit Receipt - RS. ${tx.amount} (${tx.payment_method})`,
                              senderName: tx.sender_name || tx.account_title || tx.user_name || 'N/A',
                              trxId: tx.trx_id || 'N/A',
                              timestamp: tx.created_at,
                              method: tx.payment_method,
                              amount: tx.amount
                            });
                            setZoomLevel(1);
                          }}
                          className="relative group cursor-pointer rounded-xl overflow-hidden border border-[#00e5ff]/40 bg-black/60 max-h-36 flex items-center justify-center"
                        >
                          <img
                            src={tx.screenshot_url}
                            alt="Deposit Screenshot"
                            className="w-full h-32 object-cover group-hover:scale-105 transition-all duration-200"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs">
                            <Eye className="w-4 h-4 text-[#00e5ff]" />
                            <span>Click to Expand & Zoom</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-400/80 italic bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        ⚠️ No screenshot image attached with this request.
                      </p>
                    )}

                     {/* Action Buttons */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => handleApproveTxClick(e, tx.id)}
                        disabled={processingTxIds.includes(tx.id)}
                        className={`flex-1 py-2.5 rounded-xl text-white font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all ${
                          processingTxIds.includes(tx.id)
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95'
                        }`}
                      >
                        {processingTxIds.includes(tx.id) ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            PROCESSING...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            ACCEPT REQUEST & CREDIT PKR
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleRejectTxClick(e, tx.id)}
                        disabled={processingTxIds.includes(tx.id)}
                        className={`py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                          processingTxIds.includes(tx.id)
                            ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                            : 'bg-red-600/30 text-red-300 border-red-500/50 hover:bg-red-600/40 active:scale-95'
                        }`}
                      >
                        <X className="w-4 h-4" />
                        REJECT
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: WITHDRAWAL REQUESTS */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[#07192e] p-2.5 rounded-xl border border-[#00e5ff]/20">
                <span className="text-xs font-black text-[#00e5ff] uppercase tracking-wider">
                  PENDING WITHDRAWAL REQUESTS ({pendingWithdrawalTransactions.length})
                </span>
                <span className="text-[10px] text-gray-400 font-medium">Verify payout account details</span>
              </div>

              {pendingWithdrawalTransactions.length === 0 ? (
                <div className="text-center py-8 bg-[#07192e]/40 rounded-xl border border-gray-800">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-white">No Pending Withdrawal Requests</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">All player payout requests have been processed.</p>
                </div>
              ) : (
                pendingWithdrawalTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-[#07192e] to-[#020710] border border-red-500/40 space-y-3 text-xs shadow-lg"
                  >
                    {/* Card Header */}
                    <div className="flex justify-between items-start pb-2 border-b border-gray-800">
                      <div>
                        <span className="text-[10px] font-extrabold text-red-400 tracking-wider uppercase block">
                          WITHDRAWAL PAYOUT • {tx.payment_method}
                        </span>
                        <h4 className="text-base font-black text-white">
                          RS. {(parseAmount(tx.amount) ?? 0).toLocaleString()} <span className="text-xs text-[#00e5ff] font-bold">PKR</span>
                        </h4>
                      </div>
                      <span className="text-[10px] font-extrabold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40 uppercase">
                        PENDING PAYOUT
                      </span>
                    </div>

                    {/* Request Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#030a16] p-2.5 rounded-xl border border-gray-800/80">
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Player Username</span>
                        <span className="font-extrabold text-white">{renderTxPlayer(tx)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">User Email</span>
                        <span className="font-semibold text-gray-300 truncate block">{tx.user_email || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Receiver Account Title</span>
                        <span className="font-bold text-emerald-400">{tx.account_title || tx.user_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase font-bold">Account Phone Number</span>
                        <span className="font-black text-[#00e5ff] tracking-wider">{tx.account_number || 'N/A'}</span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-gray-800/60 flex justify-between items-center text-[10px] text-gray-400">
                        <span>Requested: {new Date(tx.created_at).toLocaleString()}</span>
                        <span>Payout via: {tx.payment_method}</span>
                      </div>
                    </div>

                    {/* Screenshot Thumbnail */}
                    {tx.screenshot_url ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-400 block">Profile Balance Screenshot:</span>
                        <div
                          onClick={() => {
                            setPreviewScreenshot({
                              url: tx.screenshot_url!,
                              title: `Withdrawal Proof - RS. ${tx.amount} (${tx.payment_method})`,
                              senderName: tx.account_title || tx.user_name || 'N/A',
                              accountNumber: tx.account_number || 'N/A',
                              timestamp: tx.created_at,
                              method: tx.payment_method,
                              amount: tx.amount
                            });
                            setZoomLevel(1);
                          }}
                          className="relative group cursor-pointer rounded-xl overflow-hidden border border-[#00e5ff]/40 bg-black/60 max-h-36 flex items-center justify-center"
                        >
                          <img
                            src={tx.screenshot_url}
                            alt="Profile Balance Screenshot"
                            className="w-full h-32 object-cover group-hover:scale-105 transition-all duration-200"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs">
                            <Eye className="w-4 h-4 text-[#00e5ff]" />
                            <span>Click to Expand & Zoom</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-400/80 italic bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        ⚠️ No profile screenshot attached with this request.
                      </p>
                    )}

                     {/* Action Buttons */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => handleApproveTxClick(e, tx.id)}
                        disabled={processingTxIds.includes(tx.id)}
                        className={`flex-1 py-2.5 rounded-xl text-white font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all ${
                          processingTxIds.includes(tx.id)
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95'
                        }`}
                      >
                        {processingTxIds.includes(tx.id) ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            PROCESSING...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            ACCEPT REQUEST & CONFIRM PAYOUT
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleRejectTxClick(e, tx.id)}
                        disabled={processingTxIds.includes(tx.id)}
                        className={`py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                          processingTxIds.includes(tx.id)
                            ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                            : 'bg-red-600/30 text-red-300 border-red-500/50 hover:bg-red-600/40 active:scale-95'
                        }`}
                        title="Rejects payout & refunds deducted balance back to user"
                      >
                        <X className="w-4 h-4" />
                        REJECT & REFUND
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: TRANSACTION HISTORY */}
          {activeTab === 'tx_history' && (
            <div className="space-y-3">
              {/* Top Bar Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#07192e] p-3 rounded-xl border border-indigo-500/30 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      COMPREHENSIVE TRANSACTION HISTORY
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-extrabold px-2 py-0.5 rounded-full border border-indigo-500/40">
                      {historyTransactions.length} Records
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Real-time consolidated log of all approved, completed, and rejected deposits and withdrawals.
                  </p>
                </div>

                <button
                  onClick={() => fetchTransactionHistory()}
                  disabled={isLoadingHistory}
                  className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all self-end sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {/* Filters & Search Row */}
              <div className="flex flex-col md:flex-row gap-2 justify-between items-stretch md:items-center bg-[#030a16] p-2.5 rounded-xl border border-gray-800">
                {/* Category Filter Buttons */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setHistoryFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      historyFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-white'
                    }`}
                  >
                    All ({historyTransactions.length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('deposits')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      historyFilter === 'deposits'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-emerald-400'
                    }`}
                  >
                    <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                    Deposits Only ({historyTransactions.filter(t => t.type === 'deposit').length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('withdrawals')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      historyFilter === 'withdrawals'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-amber-400'
                    }`}
                  >
                    <ArrowUpRight className="w-3 h-3 text-amber-400" />
                    Withdrawals Only ({historyTransactions.filter(t => t.type === 'withdrawal').length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('pending')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      historyFilter === 'pending'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-amber-400'
                    }`}
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    Pending ({historyTransactions.filter(t => t.status === 'pending' || t.status === 'PENDING').length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('approved')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      historyFilter === 'approved'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-teal-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-teal-400" />
                    Approved ({historyTransactions.filter(t => t.status === 'approved' || t.status === 'completed').length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('rejected')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      historyFilter === 'rejected'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-400 hover:text-red-400'
                    }`}
                  >
                    <XCircle className="w-3 h-3 text-red-400" />
                    Rejected ({historyTransactions.filter(t => t.status === 'rejected').length})
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search player, email, TRX ID..."
                    className="w-full bg-[#07192e] border border-gray-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]"
                  />
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Record List / Cards */}
              {isLoadingHistory ? (
                <div className="text-center py-10 bg-[#07192e]/40 rounded-xl border border-gray-800">
                  <RefreshCw className="w-8 h-8 text-[#00e5ff] animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold text-white">Loading...</p>
                </div>
              ) : historyTransactions.filter((tx) => {
                if (historyFilter === 'deposits' && tx.type !== 'deposit') return false;
                if (historyFilter === 'withdrawals' && tx.type !== 'withdrawal') return false;
                if (historyFilter === 'pending' && tx.status !== 'pending' && tx.status !== 'PENDING') return false;
                if (historyFilter === 'approved' && tx.status !== 'approved' && tx.status !== 'completed') return false;
                if (historyFilter === 'rejected' && tx.status !== 'rejected') return false;

                if (historySearch.trim()) {
                  const q = historySearch.toLowerCase().trim();
                  const matchUsername = (tx.username || '').toLowerCase().includes(q);
                  const matchEmail = (tx.user_email || '').toLowerCase().includes(q);
                  const matchName = (tx.user_name || '').toLowerCase().includes(q);
                  const matchTrx = (tx.trx_id || '').toLowerCase().includes(q);
                  const matchAccount = (tx.account_number || '').toLowerCase().includes(q);
                  const matchMethod = (tx.payment_method || '').toLowerCase().includes(q);
                  const matchAmount = String(tx.amount || '').includes(q);
                  if (!matchUsername && !matchEmail && !matchName && !matchTrx && !matchAccount && !matchMethod && !matchAmount) {
                    return false;
                  }
                }
                return true;
              }).length === 0 ? (
                <div className="text-center py-10 bg-[#07192e]/40 rounded-xl border border-gray-800">
                  <ScrollText className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-white">No Matching Transactions Found</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Try clearing filters or search terms.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {historyTransactions.filter((tx) => {
                    if (historyFilter === 'deposits' && tx.type !== 'deposit') return false;
                    if (historyFilter === 'withdrawals' && tx.type !== 'withdrawal') return false;
                    if (historyFilter === 'pending' && tx.status !== 'pending' && tx.status !== 'PENDING') return false;
                    if (historyFilter === 'approved' && tx.status !== 'approved' && tx.status !== 'completed') return false;
                    if (historyFilter === 'rejected' && tx.status !== 'rejected') return false;

                    if (historySearch.trim()) {
                      const q = historySearch.toLowerCase().trim();
                      const matchUsername = (tx.username || '').toLowerCase().includes(q);
                      const matchEmail = (tx.user_email || '').toLowerCase().includes(q);
                      const matchName = (tx.user_name || '').toLowerCase().includes(q);
                      const matchTrx = (tx.trx_id || '').toLowerCase().includes(q);
                      const matchAccount = (tx.account_number || '').toLowerCase().includes(q);
                      const matchMethod = (tx.payment_method || '').toLowerCase().includes(q);
                      const matchAmount = String(tx.amount || '').includes(q);
                      if (!matchUsername && !matchEmail && !matchName && !matchTrx && !matchAccount && !matchMethod && !matchAmount) {
                        return false;
                      }
                    }
                    return true;
                  }).map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-2xl bg-[#030a16] border border-gray-800 hover:border-gray-700 transition-all space-y-2.5 text-xs shadow-md"
                    >
                      {/* Card Header */}
                      <div className="flex justify-between items-center pb-2 border-b border-gray-800/80">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                            tx.type === 'deposit'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {tx.type === 'deposit' ? <ArrowDownLeft className="w-3 h-3 text-emerald-400" /> : <ArrowUpRight className="w-3 h-3 text-amber-400" />}
                            {tx.type.toUpperCase()} • {tx.payment_method || 'JazzCash/EasyPaisa'}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          tx.status === 'approved' || tx.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : tx.status === 'rejected'
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}>
                          {tx.status === 'approved' || tx.status === 'completed' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              APPROVED
                            </>
                          ) : tx.status === 'rejected' ? (
                            <>
                              <XCircle className="w-3 h-3 text-red-400" />
                              REJECTED
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                              PENDING
                            </>
                          )}
                        </span>
                      </div>

                      {/* Main Details Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#07192e]/60 p-2.5 rounded-xl border border-gray-800/60">
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase font-bold block">Player</span>
                          <span className="font-bold text-white truncate block">{renderTxPlayer(tx)}</span>
                          <span className="text-[10px] text-gray-400 truncate block">{tx.user_email || 'No Email'}</span>
                        </div>

                        <div>
                          <span className="text-[9px] text-gray-500 uppercase font-bold block">Amount</span>
                          <span className="font-black text-amber-400 text-sm block">
                            RS. {(parseAmount(tx.amount) ?? 0).toLocaleString()} <span className="text-[10px] text-[#00e5ff]">PKR</span>
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] text-gray-500 uppercase font-bold block">
                            {tx.type === 'deposit' ? 'TRX ID / TID' : 'Account Number'}
                          </span>
                          <span className="font-black text-[#00e5ff] tracking-wider truncate block">
                            {tx.type === 'deposit' ? (tx.trx_id || 'N/A') : (tx.account_number || 'N/A')}
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] text-gray-500 uppercase font-bold block">Timestamp</span>
                          <span className="font-medium text-gray-300 text-[10px] truncate block">
                            {new Date(tx.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex justify-between items-center pt-1">
                        <div>
                          {tx.screenshot_url ? (
                            <button
                              onClick={() => {
                                setPreviewScreenshot({
                                  url: tx.screenshot_url,
                                  title: `${tx.type.toUpperCase()} Proof - RS. ${tx.amount}`,
                                  senderName: tx.sender_name || tx.account_title || tx.user_name || 'N/A',
                                  accountNumber: tx.account_number || 'N/A',
                                  trxId: tx.trx_id || 'N/A',
                                  timestamp: tx.created_at,
                                  method: tx.payment_method,
                                  amount: tx.amount
                                });
                                setZoomLevel(1);
                              }}
                              className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View Proof
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-500 italic">No proof attached</span>
                          )}
                        </div>

                        <button
                          onClick={() => setSelectedDetailTx(tx)}
                          className="px-3.5 py-1.5 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center bg-[#07192e] p-3 rounded-xl border border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    ALL PROCESSED TRANSACTION AUDIT LOGS
                  </span>
                  {isLoadingAudit && (
                    <RefreshCw className="w-3 h-3 text-[#00e5ff] animate-spin" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-medium bg-[#030a16] px-2 py-0.5 rounded border border-gray-800">
                    History ({auditLogsData.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchAuditLogs(true)}
                    className="p-1.5 rounded-lg bg-[#030a16] text-gray-300 hover:text-[#00e5ff] border border-gray-800 hover:border-[#00e5ff]/40 transition-all text-xs"
                    title="Refresh Audit Logs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {isLoadingAudit && auditLogsData.length === 0 ? (
                <div className="text-center py-10 bg-[#030a16] rounded-xl border border-gray-800 text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 text-[#00e5ff] animate-spin" />
                  <span>Loading live audit logs from Supabase...</span>
                </div>
              ) : auditLogsData.length === 0 ? (
                <div className="text-center py-8 bg-[#030a16] rounded-xl border border-gray-800 text-xs text-gray-400">
                  No historical transaction audit logs recorded yet.
                </div>
              ) : (
                auditLogsData.map((tx) => {
                  const isCredit = ['deposit', 'match_winning', 'admin_credit', 'reward', 'reward_adjustment', 'refund'].includes(String(tx.type).toLowerCase());
                  const formattedUser = renderTxPlayer(tx);

                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-[#030a16] border border-gray-800/90 flex justify-between items-center text-xs hover:border-gray-700 transition-all gap-2"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-black uppercase text-[10px] px-1.5 py-0.5 rounded border ${
                            isCredit
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                              : 'bg-red-500/10 text-red-400 border-red-500/30'
                          }`}>
                            {tx.type}
                          </span>
                          {tx.payment_method && (
                            <span className="text-[9px] bg-gray-800/80 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                              {tx.payment_method}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-[11px] text-gray-300 truncate">
                          User: <strong className="text-white font-bold">{formattedUser}</strong>
                          {(tx.trx_id || tx.account_number) && (
                            <span className="text-gray-400 font-normal"> | TRX: <span className="text-gray-200 font-mono">{tx.trx_id || tx.account_number}</span></span>
                          )}
                        </p>
                        
                        <p className="text-[9px] text-gray-500">
                          {new Date(tx.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`font-black text-xs ${
                          isCredit ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {isCredit ? '+' : '-'}RS. {tx.amount}
                        </p>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded inline-block mt-1 ${
                          tx.status === 'approved' || tx.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-500/20 text-red-300 border border-red-500/40'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 9: ANNOUNCEMENT SYSTEM MANAGER */}
          {activeTab === 'announcements' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!annTitle.trim() || !annContent.trim() || isSubmittingAnn) return;
                  setIsSubmittingAnn(true);
                  try {
                    const newAnn = {
                      title: annTitle.trim(),
                      content: annContent.trim()
                    };
                    if (onSaveAnnouncement) {
                      await onSaveAnnouncement(newAnn as any);
                    }
                    setAnnTitle('');
                    setAnnContent('');
                  } catch (err) {
                    console.error('Error submitting announcement:', err);
                  } finally {
                    setIsSubmittingAnn(false);
                  }
                }}
                className="space-y-3 bg-[#07192e]/40 p-3.5 rounded-xl border border-[#00e5ff]/20"
              >
                <h3 className="text-xs font-black text-[#00e5ff] tracking-wider uppercase flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-[#00e5ff]" />
                  Publish New Announcement
                </h3>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Announcement Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Server Maintenance or Tournament Delayed"
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Detailed Message / Content *</label>
                  <textarea
                    placeholder="Enter the full announcement details here..."
                    rows={3}
                    value={annContent}
                    onChange={(e) => setAnnContent(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff] resize-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAnn}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs tracking-wider shadow-md hover:brightness-110 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmittingAnn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#030a16]" />
                      PUBLISHING...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      PUBLISH ANNOUNCEMENT
                    </>
                  )}
                </button>
              </form>

              {/* Active Announcements List */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-xs font-black text-white tracking-wider uppercase">
                    Active Announcements ({announcements.length})
                  </h3>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {announcements.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500 bg-[#07192e]/10 border border-dashed border-gray-800 rounded-xl">
                      No announcements active. Use the form above to post one!
                    </div>
                  ) : (
                    announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className="p-3 rounded-xl bg-[#07192e]/20 border border-gray-800 flex justify-between items-start gap-3 hover:border-gray-700/60 transition-all animate-in fade-in"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{ann.title}</h4>
                          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">{ann.content}</p>
                          <span className="text-[9px] text-gray-500 block mt-2">
                            {new Date(ann.created_at).toLocaleString()}
                          </span>
                        </div>
                        {deleteConfirmAnnouncementId === ann.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-red-400 mr-2">Delete?</span>
                            <button
                              onClick={() => {
                                console.log('[ANNOUNCEMENT DELETE] confirmation accepted', ann.id);
                                if (onDeleteAnnouncement) {
                                  console.log('[ANNOUNCEMENT DELETE] calling parent handler', ann.id);
                                  onDeleteAnnouncement(ann.id);
                                  setDeleteConfirmAnnouncementId(null);
                                } else {
                                  console.error('[ANNOUNCEMENT DELETE] ERROR: onDeleteAnnouncement prop is undefined or falsy');
                                }
                              }}
                              className="px-2.5 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all active:scale-95"
                              type="button"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => {
                                console.log('[ANNOUNCEMENT DELETE] confirmation cancelled');
                                setDeleteConfirmAnnouncementId(null);
                              }}
                              className="px-2.5 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold transition-all active:scale-95"
                              type="button"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              console.log('[DELETE BUTTON] CLICKED', ann.id);
                              setDeleteConfirmAnnouncementId(ann.id);
                            }}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 active:scale-95 transition-all"
                            type="button"
                            title="Delete Announcement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: POLL SYSTEM MANAGER */}
          {activeTab === 'polls' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* SECTION 1: CREATE NEW POLL */}
              <div className="bg-[#07192e]/40 p-4 rounded-xl border border-[#00e5ff]/20 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#00e5ff]/10 pb-2.5">
                  <BarChart2 className="w-4 h-4 text-[#00e5ff]" />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Create New Community Poll
                  </h3>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!pollQuestion.trim() || isSubmittingPoll) return;
                    const validOpts = pollOptionsText.map((o) => o.trim()).filter(Boolean);
                    if (validOpts.length < 2) {
                      alert('Please provide at least 2 non-empty options for the poll.');
                      return;
                    }
                    setIsSubmittingPoll(true);
                    try {
                      if (onCreatePoll) {
                        await onCreatePoll(pollQuestion.trim(), validOpts);
                      }
                      setPollQuestion('');
                      setPollOptionsText(['', '']);
                    } catch (err: any) {
                      console.error('Error creating poll:', err);
                      alert(`Failed to publish poll: ${err?.message || 'Database error'}`);
                    } finally {
                      setIsSubmittingPoll(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Poll Question <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="e.g. Which map should we host for tomorrow's 50K Tournament?"
                      className="w-full bg-[#030a16] border border-gray-800 focus:border-[#00e5ff] rounded-xl px-3 py-2 text-xs text-white outline-none transition-all"
                    />
                  </div>

                  {/* Options (2 to 6) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Poll Options (2 to 6) <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[9px] text-gray-500 font-mono">
                        {pollOptionsText.length}/6 options
                      </span>
                    </div>

                    {pollOptionsText.map((optText, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-[10px] font-black font-mono text-[#00e5ff] w-4 text-center">
                          #{index + 1}
                        </span>
                        <input
                          type="text"
                          required
                          value={optText}
                          onChange={(e) => {
                            const updated = [...pollOptionsText];
                            updated[index] = e.target.value;
                            setPollOptionsText(updated);
                          }}
                          placeholder={`Option ${index + 1}`}
                          className="flex-1 bg-[#030a16] border border-gray-800 focus:border-[#00e5ff] rounded-xl px-3 py-2 text-xs text-white outline-none transition-all"
                        />
                        {pollOptionsText.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPollOptionsText(pollOptionsText.filter((_, idx) => idx !== index));
                            }}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                            title="Remove Option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {pollOptionsText.length < 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (pollOptionsText.length < 6) {
                            setPollOptionsText([...pollOptionsText, '']);
                          }
                        }}
                        className="mt-1 px-3 py-1.5 rounded-xl bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] text-[10px] font-bold border border-[#00e5ff]/30 flex items-center gap-1.5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Option
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingPoll}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs tracking-wider shadow-md hover:brightness-110 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
                  >
                    {isSubmittingPoll ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#030a16]" />
                        PUBLISHING POLL...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        PUBLISH POLL
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* SECTION 2: ACTIVE & PAST POLLS LIST */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  Active & Community Polls ({polls.length})
                </h4>

                {polls.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500 bg-[#07192e]/10 border border-dashed border-gray-800 rounded-xl">
                    No polls created yet. Use the form above to publish a new poll!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {polls.map((poll) => {
                      const totalVotes = poll.total_votes || poll.votes?.length || 0;

                      return (
                        <div
                          key={poll.id}
                          className="p-4 rounded-xl bg-[#07192e]/30 border border-gray-800 space-y-3"
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                    poll.is_active
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                  }`}
                                >
                                  {poll.is_active ? '● Active' : '○ Closed'}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {totalVotes} Total Votes
                                </span>
                              </div>
                              <h5 className="text-xs font-bold text-white leading-snug">
                                {poll.question}
                              </h5>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {poll.is_active && onDeactivatePoll && (
                                <button
                                  onClick={async () => {
                                    if (confirm('Deactivate/Close this poll? Players will no longer be able to vote.')) {
                                      await onDeactivatePoll(poll.id);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold"
                                  title="Close Poll"
                                >
                                  Close Poll
                                </button>
                              )}
                              {onDeletePoll && (
                                deleteConfirmPollId === poll.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-red-400">Delete?</span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        console.log('[POLL DELETE] starting', poll.id);
                                        await onDeletePoll(poll.id);
                                        setDeleteConfirmPollId(null);
                                      }}
                                      className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold transition-all active:scale-95"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        console.log('[POLL DELETE] cancelled', poll.id);
                                        setDeleteConfirmPollId(null);
                                      }}
                                      className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-[10px] font-bold transition-all active:scale-95"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      console.log('[POLL DELETE BUTTON] CLICKED', poll.id, poll.question);
                                      setDeleteConfirmPollId(poll.id);
                                    }}
                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                                    title="Delete Poll"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Options Progress */}
                          <div className="space-y-2 pt-1">
                            {poll.options.map((opt) => {
                              const optVotes = poll.votes?.filter((v) => v.option_id === opt.id).length || 0;
                              const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;

                              return (
                                <div key={opt.id} className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="font-medium text-gray-300">{opt.option_text}</span>
                                    <span className="font-mono text-gray-400 font-bold">
                                      {optVotes} votes ({pct}%)
                                    </span>
                                  </div>
                                  <div className="h-2 w-full bg-[#030a16] rounded-full overflow-hidden border border-gray-800">
                                    <div
                                      className="h-full bg-gradient-to-r from-[#00e5ff] to-[#0088ff] transition-all duration-300"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Voter List Breakdown */}
                          {poll.voters && poll.voters.length > 0 && (
                            <div className="pt-2 border-t border-gray-800/60 space-y-1.5">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                Voters Breakdown ({poll.voters.length})
                              </span>
                              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                {poll.voters.map((v, idx) => (
                                  <div
                                    key={v.user_id + idx}
                                    className="flex items-center justify-between text-[10px] bg-[#030a16]/60 p-1.5 rounded-lg border border-gray-800/40"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-[#07192e] text-[#00e5ff] font-bold flex items-center justify-center overflow-hidden shrink-0 border border-[#00e5ff]/20">
                                        {v.avatar_url ? (
                                          <img src={v.avatar_url} alt={v.username} className="w-full h-full object-cover" />
                                        ) : (
                                          <span>{(v.username || 'P').charAt(0).toUpperCase()}</span>
                                        )}
                                      </div>
                                      <span className="font-bold text-gray-200">@{v.username}</span>
                                    </div>
                                    <span className="text-gray-400 font-medium truncate max-w-[150px]">
                                      chose: <span className="text-[#00e5ff]">{v.option_text || 'Option'}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: LIVE BROADCAST ENGINE (PHASE 2) */}
          {activeTab === 'live_broadcast' && (
            <LiveBroadcastPanel
              matches={matches}
              userProfile={userProfile}
            />
          )}

          {/* TAB 10: LIVE STREAM SYSTEM MANAGER */}
          {activeTab === 'livestreams' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (isPublishingStream) return;
                  if (!streamTitle.trim() || !streamUrl.trim()) return;
                  
                  setIsPublishingStream(true);
                  try {
                    const thumb = getYoutubeThumbnail(streamUrl.trim());
                    const formattedViewers = formatStreamViewers(streamViewers.trim());
                    const newStream: LiveStream = {
                      id: 'stream-' + Date.now(),
                      title: streamTitle.trim(),
                      youtube_url: streamUrl.trim(),
                      viewers_count: formattedViewers,
                      thumbnail_url: thumb,
                      is_active: true,
                      created_at: new Date().toISOString()
                    };
                    if (onSaveLiveStream) {
                      await Promise.resolve(onSaveLiveStream(newStream));
                    }
                    setStreamTitle('');
                    setStreamUrl('');
                    setStreamViewers('');
                  } catch (err) {
                    console.error('Error publishing live stream:', err);
                  } finally {
                    setIsPublishingStream(false);
                  }
                }}
                className="space-y-3 bg-[#07192e]/40 p-3.5 rounded-xl border border-[#00e5ff]/20"
              >
                <h3 className="text-xs font-black text-[#00e5ff] tracking-wider uppercase flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-[#00e5ff]" />
                  Publish New Live Stream
                </h3>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Stream Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. MVP Daily Esports Cup - Round 4"
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                    disabled={isPublishingStream}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff] disabled:opacity-50"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">YouTube Video URL *</label>
                  <input
                    type="url"
                    placeholder="e.g. https://www.youtube.com/watch?v=gT8Y2_Vd93o"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    disabled={isPublishingStream}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff] disabled:opacity-50"
                    required
                  />
                  <p className="text-[9px] text-gray-500 mt-1">Supports standard watch links, mobile youtu.be links, and youtube.com/live links. Thumbnail is auto-extracted.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Live Viewers Badge (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 208 Watching, 1.2K Watching, 5K Watching"
                    value={streamViewers}
                    onChange={(e) => setStreamViewers(e.target.value)}
                    disabled={isPublishingStream}
                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff] disabled:opacity-50"
                  />
                  <p className="text-[9px] text-gray-400 mt-1">Shows on card badge (e.g. 208 Watching, 1.2K Watching). "Watching" is automatically included if only number is entered.</p>
                </div>

                <button
                  type="submit"
                  disabled={isPublishingStream}
                  className={`w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs tracking-wider shadow-md flex items-center justify-center gap-2 transition-all ${
                    isPublishingStream
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:brightness-110 active:scale-[0.99]'
                  }`}
                >
                  {isPublishingStream ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#030a16]" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>PUBLISH LIVE STREAM</span>
                    </>
                  )}
                </button>
              </form>

              {/* Active Streams List */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-xs font-black text-white tracking-wider uppercase">
                    Active Streams ({liveStreams.length})
                  </h3>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {liveStreams.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500 bg-[#07192e]/10 border border-dashed border-gray-800 rounded-xl">
                      No live streams published yet. Add one above!
                    </div>
                  ) : (
                    liveStreams.map((stream) => (
                      <div
                        key={stream.id}
                        className="p-3 rounded-xl bg-[#07192e]/20 border border-gray-800 flex justify-between items-center gap-3 hover:border-gray-700/60 transition-all animate-in fade-in"
                      >
                        <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0 bg-gray-900 border border-gray-800">
                          <img src={stream.thumbnail_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{stream.title}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] text-[#00e5ff] font-extrabold uppercase bg-[#00e5ff]/10 px-1 rounded">
                              {formatStreamViewers(stream.viewers_count) || 'LIVE'}
                            </span>
                            <span className="text-[9px] text-gray-500 truncate" title={stream.youtube_url}>
                              {stream.youtube_url}
                            </span>
                          </div>
                        </div>
                        {deleteConfirmLiveStreamId === stream.id ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-bold text-red-400">Delete?</span>
                            <button
                              type="button"
                              onClick={async () => {
                                console.log('[LIVE STREAM DELETE] clicked', stream.id);
                                console.log('[LIVE STREAM DELETE] starting', stream.id);
                                if (onDeleteLiveStream) {
                                  onDeleteLiveStream(stream.id);
                                }
                                setDeleteConfirmLiveStreamId(null);
                              }}
                              className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold transition-all active:scale-95"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                console.log('[LIVE STREAM DELETE] cancelled', stream.id);
                                setDeleteConfirmLiveStreamId(null);
                              }}
                              className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-[10px] font-bold transition-all active:scale-95"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              console.log('[LIVE STREAM DELETE BUTTON] CLICKED', stream.id, stream.title);
                              setDeleteConfirmLiveStreamId(stream.id);
                            }}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 active:scale-95 transition-all flex-shrink-0"
                            title="Delete Stream"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: REWARD DISPATCH / WALLET ADJUSTMENT */}
          {activeTab === 'rewards' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <form
                onSubmit={handleRewardSubmit}
                className="space-y-4 bg-[#07192e]/40 p-5 rounded-xl border border-amber-500/20"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white tracking-wider uppercase">
                      Send Reward / Manage Balance
                    </h3>
                    <p className="text-[10px] text-gray-400">Instantly adjust any player's wallet balance by username.</p>
                  </div>
                </div>

                {rewardSuccessMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{rewardSuccessMsg}</span>
                  </div>
                )}

                {rewardErrorMsg && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-red-400">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{rewardErrorMsg}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1">Enter Username *</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                      <input
                        type="text"
                        placeholder="e.g. MVP_JOKER"
                        value={rewardUsername}
                        onChange={(e) => setRewardUsername(e.target.value)}
                        className="w-full pl-9 p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1.5">Action Type *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRewardActionType('add')}
                        className={`py-2.5 rounded-lg border text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                          rewardActionType === 'add'
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                            : 'bg-[#020710] border-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Money (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewardActionType('deduct')}
                        className={`py-2.5 rounded-lg border text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                          rewardActionType === 'deduct'
                            ? 'bg-red-500/20 border-red-500/50 text-red-400'
                            : 'bg-[#020710] border-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        Deduct Money (-)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1">Amount (RS) *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 500"
                        value={rewardAmount || ''}
                        onChange={(e) => setRewardAmount(Number(e.target.value))}
                        className="w-full pl-9 p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs font-black focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessingReward}
                  className={`w-full py-3 rounded-xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all ${
                    isProcessingReward
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : rewardActionType === 'add'
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-black shadow-emerald-500/20 hover:brightness-110'
                        : 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-red-500/20 hover:brightness-110'
                  }`}
                >
                  {isProcessingReward ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      PROCESSING...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {rewardActionType === 'add' ? 'SEND REWARD / UPDATE BALANCE' : 'DEDUCT MONEY / UPDATE BALANCE'}
                    </>
                  )}
                </button>
              </form>

              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                <h4 className="text-[10px] font-black text-amber-400 uppercase mb-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Admin Usage Notice
                </h4>
                <ul className="text-[9px] text-gray-400 space-y-1 list-disc pl-3">
                  <li>Wallet adjustments are recorded permanently in the player's transaction history.</li>
                  <li>Deductions cannot exceed the player's current wallet balance.</li>
                  <li>Verify the username twice before sending high-value rewards.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB: BAN PLAYERS */}
          {activeTab === 'bans' && (
            <div className="space-y-6">
              {/* SEARCH SECTION */}
              <div className="bg-[#07192e] p-4 rounded-2xl border border-red-500/20 space-y-3">
                <div className="flex items-center gap-2 text-red-500">
                  <Search className="w-5 h-5" />
                  <h3 className="text-sm font-black tracking-tight uppercase text-white">Search Player Profile</h3>
                </div>

                <form onSubmit={handleSearchPlayer} className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Enter @username or PUBG ID to search player..."
                      value={banUsername}
                      onChange={(e) => {
                        setBanUsername(e.target.value);
                        if (searchPlayerError) setSearchPlayerError(null);
                      }}
                      className="w-full pl-9 p-3 rounded-xl bg-[#030a16] border border-gray-800 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingPlayer || !banUsername.trim()}
                    className={`px-5 py-3 rounded-xl font-black text-xs tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 shrink-0 ${
                      isSearchingPlayer
                        ? 'bg-cyan-600/60 text-white cursor-wait opacity-90'
                        : !banUsername.trim()
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black hover:brightness-110 active:scale-95'
                    }`}
                  >
                    {isSearchingPlayer ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>SEARCHING...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>SEARCH PLAYER</span>
                      </>
                    )}
                  </button>
                </form>

                {searchPlayerError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {searchPlayerError}
                  </div>
                )}
              </div>

              {/* SEARCHED PLAYER CARD */}
              {searchedPlayer && (
                <div className="bg-[#07192e] p-4 rounded-2xl border border-[#00e5ff]/30 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-black font-black text-sm">
                        {searchedPlayer.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white flex items-center gap-2">
                          @{searchedPlayer.username}
                          <span className="text-xs font-normal text-gray-400">({searchedPlayer.name || 'No Name'})</span>
                        </h4>
                        <p className="text-[10px] text-gray-400 font-medium">PUBG ID: <span className="text-cyan-400 font-bold">{searchedPlayer.pubg_id_name || 'N/A'}</span> ({searchedPlayer.pubg_id_number || 'N/A'})</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {searchedPlayer.is_banned ? (
                        <>
                          <span className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[10px] font-black uppercase flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            Banned ({formatRemainingBanTime(searchedPlayer.ban_expires_at)})
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(unbanningId && (unbanningId === searchedPlayer.id || unbanningId === searchedPlayer.username))}
                            onClick={(e) => {
                              console.log('🟢 [UNBAN BUTTON CLICKED - Searched Player Card]', { id: searchedPlayer.id, username: searchedPlayer.username });
                              e.preventDefault();
                              e.stopPropagation();
                              triggerRemoveBanConfirm(searchedPlayer.id, searchedPlayer.username, searchedPlayer.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500 hover:text-black text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {unbanningId === searchedPlayer.id || unbanningId === searchedPlayer.username ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-emerald-300" />
                                <span>Unbanning...</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3 h-3" />
                                <span>Unban 🔓</span>
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] font-black uppercase flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Active Account
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSearchedPlayer(null)}
                        className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1"
                        title="Clear player card"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Player Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-[#030a16] border border-gray-800 text-center">
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Wallet Balance</div>
                      <div className="text-sm font-black text-emerald-400">RS. {searchedPlayer.wallet_balance}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#030a16] border border-gray-800 text-center">
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Total Matches</div>
                      <div className="text-sm font-black text-cyan-400">{searchedPlayer.total_matches}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#030a16] border border-gray-800 text-center">
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Total Kills</div>
                      <div className="text-sm font-black text-amber-400">{searchedPlayer.total_kills}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#030a16] border border-gray-800 text-center">
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Total Wins</div>
                      <div className="text-sm font-black text-purple-400">{searchedPlayer.total_wins}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* BAN / ACTION FORM */}
              <form onSubmit={handleApplyBan} className="bg-[#07192e] p-4 rounded-2xl border border-red-500/20 space-y-4">
                <div className="flex items-center gap-2 mb-2 text-red-500">
                  <Ban className="w-5 h-5" />
                  <h3 className="text-sm font-black tracking-tight uppercase text-white">Apply Ban or Account Action</h3>
                </div>

                {!searchedPlayer && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Please search a player username above to verify player data before banning or deleting.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1 uppercase tracking-wider">Target Player Username</label>
                    <input
                      type="text"
                      readOnly={Boolean(searchedPlayer)}
                      placeholder="Search username above..."
                      value={searchedPlayer ? `@${searchedPlayer.username}` : banUsername}
                      onChange={(e) => setBanUsername(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-800 text-white text-xs font-black focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-300 block mb-1 uppercase tracking-wider">Ban Duration Options *</label>
                    <select
                      value={banDuration}
                      onChange={(e) => setBanDuration(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-800 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all"
                    >
                      <option value="1 Day">1 Day Ban</option>
                      <option value="3 Days">3 Days Ban</option>
                      <option value="7 Days">7 Days Ban</option>
                      <option value="15 Days">15 Days Ban</option>
                      <option value="30 Days">30 Days Ban</option>
                      <option value="Permanent Delete Account">Permanent Delete Account 💥</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1 uppercase tracking-wider">Ban Reason / Internal Note</label>
                  <input
                    type="text"
                    placeholder="e.g. Using hacks / Teaming up in Solo match"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#030a16] border border-gray-800 text-white text-xs focus:outline-none focus:border-red-500 transition-all"
                  />
                </div>

                {banDuration === 'Permanent Delete Account' ? (
                  <button
                    type="submit"
                    disabled={isApplyingBan}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-700 to-red-900 text-white font-black text-xs tracking-wider shadow-lg shadow-red-900/40 hover:brightness-110 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {isApplyingBan ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>PERMANENTLY DELETING ACCOUNT...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>PERMANENTLY DELETE ACCOUNT 💥</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isApplyingBan}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 text-white font-black text-xs tracking-wider shadow-lg shadow-red-500/20 hover:brightness-110 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {isApplyingBan ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>APPLYING BAN TO PLAYER...</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4" />
                        <span>APPLY BAN 🚫</span>
                      </>
                    )}
                  </button>
                )}
              </form>

              {/* Banned Players List */}
              <div className="space-y-3 pb-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <UserX className="w-4 h-4 text-red-500" />
                    Currently Banned Players ({bannedPlayers.length})
                  </h3>
                  <button
                    onClick={loadBansList}
                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {bannedPlayers.length === 0 ? (
                  <div className="p-8 text-center bg-[#07192e] rounded-2xl border border-gray-800">
                    <UserCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-20" />
                    <p className="text-xs text-gray-500 font-bold">No active bans found in Supabase. The server is clean!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-[#030a16]">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="bg-[#07192e] text-gray-400 font-bold uppercase tracking-widest border-b border-gray-800">
                          <th className="px-4 py-3">Player</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Remaining Time</th>
                          <th className="px-4 py-3">Reason</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {bannedPlayers.map((ban) => (
                          <tr key={ban.id || ban.username} className="hover:bg-[#07192e]/50 transition-colors">
                            <td className="px-4 py-3 font-black text-red-400">
                              @{ban.username}
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-300">{ban.duration}</td>
                            <td className="px-4 py-3 font-bold">
                              {ban.expires_at === null ? (
                                <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-black uppercase">PERMANENT</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-black">
                                  {formatRemainingBanTime(ban.expires_at)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 truncate max-w-[150px]">{ban.reason}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                disabled={Boolean(unbanningId && (unbanningId === ban.id || unbanningId === ban.username || unbanningId === ban.user_id))}
                                onClick={(e) => {
                                  console.log('🟢 [UNBAN BUTTON CLICKED - Currently Banned Table]', { banId: ban.id, username: ban.username, userId: ban.user_id });
                                  e.preventDefault();
                                  e.stopPropagation();
                                  triggerRemoveBanConfirm(ban.id, ban.username, ban.user_id);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-black transition-all flex items-center justify-center gap-1 ml-auto font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {unbanningId === ban.id || unbanningId === ban.username || unbanningId === ban.user_id ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-300" />
                                    <span>Unbanning...</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3 h-3" />
                                    <span>Unban 🔓</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PLAYER CHAT REQUESTS */}
          {activeTab === 'chats' && (
            <AdminChatPanel />
          )}

          {/* TAB: MANAGE RULES */}
          {activeTab === 'manage_rules' && (
            <AdminRulesPanel />
          )}
        </div>
      </div>

      {/* TRANSACTION DETAILS POPUP MODAL */}
      {selectedDetailTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#07192e] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#030a16]">
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-[#00e5ff]" />
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Transaction Details</h3>
                  <span className="text-[10px] text-gray-400 font-medium font-mono">ID: {selectedDetailTx.id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailTx(null)}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Type & Status Banner */}
              <div className="flex justify-between items-center p-3 rounded-xl bg-[#030a16] border border-gray-800">
                <div>
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md inline-block ${
                    selectedDetailTx.type === 'deposit'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {selectedDetailTx.type === 'deposit' ? 'DEPOSIT TRANSACTION' : 'WITHDRAWAL TRANSACTION'}
                  </span>
                  <div className="text-xl font-black text-white mt-1">
                    RS. {(parseAmount(selectedDetailTx.amount) ?? 0).toLocaleString()} <span className="text-xs text-[#00e5ff]">PKR</span>
                  </div>
                </div>

                <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border flex items-center gap-1 ${
                  selectedDetailTx.status === 'approved' || selectedDetailTx.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  {selectedDetailTx.status === 'approved' || selectedDetailTx.status === 'completed' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> APPROVED
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> REJECTED
                    </>
                  )}
                </span>
              </div>

              {/* Player Info Box */}
              <div className="p-3 bg-[#030a16] border border-gray-800 rounded-xl space-y-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  Player Profile Details
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Username</span>
                    <span className="font-bold text-emerald-400">{renderTxPlayer(selectedDetailTx)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Full Name</span>
                    <span className="font-bold text-white">{selectedDetailTx.user_name || 'N/A'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Email Address</span>
                    <span className="font-bold text-gray-300 break-all">{selectedDetailTx.user_email || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Payment Credentials Box */}
              <div className="p-3 bg-[#030a16] border border-gray-800 rounded-xl space-y-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-[#00e5ff]" />
                  Payment Credentials
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Payment Method</span>
                    <span className="font-bold text-white">{selectedDetailTx.payment_method || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Timestamp</span>
                    <span className="font-bold text-gray-300 text-[10px]">
                      {new Date(selectedDetailTx.created_at).toLocaleString()}
                    </span>
                  </div>
                  {selectedDetailTx.type === 'deposit' ? (
                    <>
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">TRX ID / TID</span>
                        <span className="font-black text-[#00e5ff] tracking-wider">{selectedDetailTx.trx_id || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Sender Name</span>
                        <span className="font-bold text-emerald-300">{selectedDetailTx.sender_name || selectedDetailTx.account_title || 'N/A'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Account Number</span>
                        <span className="font-black text-[#00e5ff] tracking-wider">{selectedDetailTx.account_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Account Title</span>
                        <span className="font-bold text-emerald-300">{selectedDetailTx.account_title || 'N/A'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Payment Screenshot Proof */}
              <div className="p-3 bg-[#030a16] border border-gray-800 rounded-xl space-y-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Payment Screenshot Proof
                </h4>
                {selectedDetailTx.screenshot_url ? (
                  <div className="space-y-2">
                    <div 
                      onClick={() => {
                        setPreviewScreenshot({
                          url: selectedDetailTx.screenshot_url!,
                          title: `${selectedDetailTx.type.toUpperCase()} Proof - RS. ${selectedDetailTx.amount}`,
                          senderName: selectedDetailTx.sender_name || selectedDetailTx.account_title || selectedDetailTx.user_name || 'N/A',
                          accountNumber: selectedDetailTx.account_number || 'N/A',
                          trxId: selectedDetailTx.trx_id || 'N/A',
                          timestamp: selectedDetailTx.created_at,
                          method: selectedDetailTx.payment_method,
                          amount: selectedDetailTx.amount
                        });
                        setZoomLevel(1);
                      }}
                      className="relative cursor-pointer group border border-gray-700 rounded-xl overflow-hidden bg-black max-h-48 flex items-center justify-center p-1"
                    >
                      <img
                        src={selectedDetailTx.screenshot_url}
                        alt="Payment Proof"
                        className="max-h-44 object-contain rounded group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white font-bold text-xs">
                        <ZoomIn className="w-4 h-4" /> Click to Expand Lightbox
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded-lg">
                    No screenshot proof uploaded for this transaction.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-gray-800 bg-[#030a16] flex justify-end">
              <button
                onClick={() => setSelectedDetailTx(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREENSHOT LIGHTBOX MODAL */}
      {previewScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-3 animate-in fade-in duration-200">
          {/* Lightbox Header Controls */}
          <div className="w-full max-w-xl flex justify-between items-center bg-[#07192e] p-3 rounded-t-2xl border border-gray-800">
            <h4 className="text-xs font-bold text-white truncate max-w-[280px] sm:max-w-md">
              {previewScreenshot.title}
            </h4>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-bold text-xs flex items-center gap-1"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.5))}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-bold text-xs flex items-center gap-1"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 font-bold text-xs"
                title="Reset Zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewScreenshot(null)}
                className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Viewport */}
          <div className="w-full max-w-xl h-[60vh] bg-black border-x border-gray-800 overflow-auto flex items-center justify-center p-4">
            <img
              src={previewScreenshot.url}
              alt="Expanded Screenshot Preview"
              style={{ transform: `scale(${zoomLevel})` }}
              className="max-w-full max-h-full object-contain transition-transform duration-150 rounded"
            />
          </div>

          {/* Lightbox Metadata Footer */}
          <div className="w-full max-w-xl bg-[#030a16] border-x border-b border-gray-800 p-3 rounded-b-2xl text-xs grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[9px] text-gray-500 uppercase font-bold block">Sender / Holder Name</span>
              <span className="font-bold text-emerald-400 truncate block">{previewScreenshot.senderName || 'N/A'}</span>
            </div>
            {previewScreenshot.accountNumber && (
              <div>
                <span className="text-[9px] text-gray-500 uppercase font-bold block">Account Number</span>
                <span className="font-black text-[#00e5ff] tracking-wider block">{previewScreenshot.accountNumber}</span>
              </div>
            )}
            {previewScreenshot.trxId && (
              <div>
                <span className="text-[9px] text-gray-500 uppercase font-bold block">Trx ID / TID</span>
                <span className="font-black text-[#00e5ff] tracking-wider block">{previewScreenshot.trxId}</span>
              </div>
            )}
            <div>
              <span className="text-[9px] text-gray-500 uppercase font-bold block">Payment Method</span>
              <span className="font-bold text-white block">{previewScreenshot.method || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-500 uppercase font-bold block">Timestamp</span>
              <span className="font-medium text-gray-300 block truncate">
                {previewScreenshot.timestamp ? new Date(previewScreenshot.timestamp).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-gray-500 uppercase font-bold block">Amount</span>
              <span className="font-black text-amber-400 block">
                RS. {(parseAmount(previewScreenshot.amount) ?? 0).toLocaleString()} PKR
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Unban Confirmation Overlay Modal */}
      {unbanConfirmTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-gray-800 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">
              Confirm Unban
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              Are you sure you want to unban <strong className="text-emerald-400">{unbanConfirmTarget.displayName}</strong>? This will instantly restore their profile, clear active restrictions, and set their status to active.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={Boolean(unbanningId)}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await handleRemoveBan(unbanConfirmTarget.id, unbanConfirmTarget.username, unbanConfirmTarget.userId);
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {unbanningId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Unbanning...</span>
                  </>
                ) : (
                  <span>Yes, Unban 🔓</span>
                )}
              </button>
              <button
                type="button"
                disabled={Boolean(unbanningId)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUnbanConfirmTarget(null);
                }}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer transition-all border border-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Published Match Result Confirmation Modal */}
      {deletingResultItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-red-500/50 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-400" />
            </div>

            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">
              Delete Match Result
            </h3>
            <p className="text-xs text-red-400 font-bold mb-4">
              Permanent Delete from Supabase
            </p>

            <div className="bg-[#040c1a] border border-gray-800 rounded-xl p-3.5 text-left text-xs space-y-1.5 mb-5">
              <p className="font-extrabold text-white text-sm">
                {deletingResultItem.match_title}
              </p>
              <p className="text-gray-400 text-[11px]">
                Match ID: <code className="text-[#00e5ff] font-mono">{deletingResultItem.match_id}</code>
              </p>
              {(deletingResultItem.squad_type || deletingResultItem.match_type) && (
                <p className="text-gray-400 text-[11px]">
                  Type: <span className="text-gray-200 font-medium">{deletingResultItem.squad_type || deletingResultItem.match_type}</span>
                </p>
              )}
              {(deletingResultItem.screenshot_url || deletingResultItem.result_image_url) && (
                <p className="text-amber-300/90 text-[10px]">
                  📷 Associated result image file will be cleaned up from Supabase Storage bucket.
                </p>
              )}
              <div className="pt-2 border-t border-gray-800 text-red-300 text-[10px] space-y-0.5">
                <p>• Row will be removed from Supabase <code className="font-mono">match_results</code> table.</p>
                <p>• Players Results tab will stop showing this result immediately.</p>
                <p className="text-gray-400 italic">• Wallet balances will remain unaffected.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={isExecutingDeleteResult}
                onClick={handleConfirmDeleteResult}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:brightness-110 active:scale-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecutingDeleteResult ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isExecutingDeleteResult}
                onClick={() => setDeletingResultItem(null)}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer transition-all border border-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

