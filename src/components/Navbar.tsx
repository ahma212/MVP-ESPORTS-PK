import React, { useState, useEffect } from 'react';
import { UserProfile, Notification } from '../types';
import { Wallet, Menu, X, Shield, LogOut, User, Gamepad2, Trophy, ChevronRight, Clock, Hourglass, Megaphone, Video, MessageSquare, Trash2, ScrollText, Bell, Users, Download, Crown } from 'lucide-react';
import { DeletionRequestModal } from './DeletionRequestModal';
import { RulesModal } from './RulesModal';
import { NotificationModal } from './NotificationModal';
import { getNotifications, getUnreadFriendChatCountsApi, getPendingFriendRequestsCountApi, supabase, isSupabaseConfigured, parseAmount } from '../lib/supabase';

interface NavbarProps {
  userProfile: UserProfile | null;
  activeTab?: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile' | 'coming-soon' | 'watch-live';
  onOpenWallet: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onNavigateTab?: (tab: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile' | 'coming-soon' | 'watch-live') => void;
  isDemoMode: boolean;
  onOpenAnnouncements?: () => void;
  onOpenLiveStreams?: () => void;
  onOpenSupport?: () => void;
  onOpenFriendsHub?: () => void;
  onInstallPwa?: () => void;
  canInstallPwa?: boolean;
  pwaLabel?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  userProfile,
  activeTab = 'home',
  onOpenWallet,
  onOpenProfile,
  onOpenAdmin,
  onLogout,
  onNavigateTab,
  isDemoMode,
  onOpenAnnouncements,
  onOpenLiveStreams,
  onOpenSupport,
  onOpenFriendsHub,
  onInstallPwa,
  canInstallPwa = false,
  pwaLabel = 'Download & Install App'
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hiddenPublicIds, setHiddenPublicIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('app_hidden_notifications') || '[]');
    } catch {
      return [];
    }
  });
  const [readPublicIds, setReadPublicIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('app_read_notifications') || '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('app_read_notifications', JSON.stringify(readPublicIds));
  }, [readPublicIds]);

  useEffect(() => {
    localStorage.setItem('app_hidden_notifications', JSON.stringify(hiddenPublicIds));
  }, [hiddenPublicIds]);NotificationModal
  const [socialUnreadCount, setSocialUnreadCount] = useState<number>(0);

  const loadSocialUnreadCount = async () => {
    if (!userProfile) return;
    try {
      const { totalUnread } = await getUnreadFriendChatCountsApi(userProfile.id);
      const pendingReqs = await getPendingFriendRequestsCountApi(userProfile.id);
      setSocialUnreadCount(totalUnread + pendingReqs);
    } catch (e) {
      console.warn('Error loading social unread count:', e);
    }
  };

  useEffect(() => {
    if (userProfile) {
      loadNotifications();
      loadSocialUnreadCount();

      const handleSync = () => {
        loadNotifications();
        loadSocialUnreadCount();
      };

      window.addEventListener('notifications_changed', handleSync);
      window.addEventListener('friends_changed', handleSync);
      window.addEventListener('storage', handleSync);

      // Realtime subscription for notifications & social chats
      let channel: any = null;
      let fcChannel: any = null;
      let dmChannel: any = null;
      let reqChannel: any = null;

      if (isSupabaseConfigured() && supabase) {
        channel = supabase
          .channel(`notifications_realtime:${userProfile.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'notifications' },
            (payload) => {
              const newN = payload.new as any;
              const oldN = payload.old as any;
              const affectedUser = (newN && (newN.user_id === userProfile.id || !newN.user_id)) ||
                                    (oldN && (oldN.user_id === userProfile.id || !oldN.user_id));
              if (affectedUser) {
                loadNotifications();
              }
            }
          )
          .subscribe();

        fcChannel = supabase
          .channel(`fc_realtime:${userProfile.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_chats' }, () => {
            loadSocialUnreadCount();
          })
          .subscribe();

        reqChannel = supabase
          .channel(`req_realtime:${userProfile.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
            loadSocialUnreadCount();
          })
          .subscribe();
      }

      return () => {
        window.removeEventListener('notifications_changed', handleSync);
        window.removeEventListener('friends_changed', handleSync);
        window.removeEventListener('storage', handleSync);
        if (channel) supabase.removeChannel(channel);
        if (fcChannel) supabase.removeChannel(fcChannel);
        if (reqChannel) supabase.removeChannel(reqChannel);
      };
    }
  }, [userProfile?.id]);

  const loadNotifications = async () => {
    if (!userProfile) return;
    const data = await getNotifications(userProfile.id);
    setNotifications(data);
  };

  const visibleNotifications = notifications
    .filter(n => !hiddenPublicIds.includes(n.id))
    .map(n => readPublicIds.includes(n.id) ? { ...n, is_read: true } : n);

  const unreadCount = visibleNotifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  const handleNavClick = (action: () => void) => {
    action();
    setIsDrawerOpen(false);
  };

  const handleTabClick = (tab: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile' | 'coming-soon' | 'watch-live') => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    }
    setIsDrawerOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#030a16]/95 backdrop-blur-md border-b border-[#00e5ff]/20 px-4 py-2.5 shadow-lg shadow-[#00e5ff]/5">
        <div className="flex justify-between items-center max-w-md mx-auto">
          {/* Left: Logo & App Title */}
          <div className="flex items-center gap-2">
            <div 
              onClick={() => onNavigateTab?.('home')}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00e5ff] via-[#0088ff] to-[#0033aa] p-[1.5px] shadow-md shadow-[#00e5ff]/20 flex-shrink-0">
                <div className="w-full h-full bg-[#030a16] rounded-[10px] flex items-center justify-center font-black text-[#00e5ff] text-[10px] tracking-tighter">
                  MVP
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h1 className="text-xs font-black text-white tracking-wider flex items-center gap-1">
                    MVP ESPORTS <span className="text-[#00e5ff] text-[9px] bg-[#00e5ff]/10 px-1 rounded border border-[#00e5ff]/30">PK</span>
                  </h1>
                </div>
                <p className="text-[9px] text-gray-400 font-medium">
                  {activeTab === 'my-matches'
                    ? 'My Booked Matches'
                    : activeTab === 'leaderboard'
                    ? 'Leaderboard & Rankings'
                    : activeTab === 'profile'
                    ? 'Player Profile & Stats'
                    : 'PUBG Mobile Arena'}
                </p>
              </div>
            </div>
          </div>

          {/* Right Layout (In Row Order): 1. Wallet Badge  2. Profile Avatar  3. 3-Line Menu Icon */}
          <div className="flex items-center gap-2">
            {/* Bell Icon */}
            <button
              onClick={() => setIsNotificationModalOpen(true)}
              className="relative p-2 rounded-full hover:bg-gray-800 transition-all animate-none"
            >
              <Bell className="w-5 h-5 text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-md animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* 1. Wallet Badge */}
            <button
              onClick={onOpenWallet}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#07192e] border border-[#00e5ff]/40 text-[11px] font-bold text-[#00e5ff] hover:bg-[#00e5ff]/10 hover:border-[#00e5ff] transition-all active:scale-95 shadow-inner"
              title="Open Wallet"
            >
              <Wallet className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>RS. {(parseAmount(userProfile?.wallet_balance) ?? 0).toLocaleString()}</span>
            </button>

            {/* 2. Profile Avatar */}
            <button
              onClick={onOpenProfile}
              className="w-8 h-8 min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] aspect-square rounded-full overflow-hidden shrink-0 border border-cyan-400/60 shadow-sm bg-slate-900 flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
              title="View Profile & Stats"
            >
              <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center font-black text-[#00e5ff] text-xs overflow-hidden aspect-square">
                {userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover object-center rounded-full block aspect-square" />
                ) : (
                  userProfile?.username?.charAt(0).toUpperCase() || <User className="w-4 h-4 text-[#00e5ff]" />
                )}
              </div>
            </button>

            {/* 3. 3-Line Hamburger Menu Icon */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="relative p-1.5 rounded-xl bg-sky-400/20 border border-sky-400 text-sky-300 hover:bg-sky-400/30 hover:text-white hover:border-cyan-300 transition-all active:scale-95 shadow-sm shadow-sky-400/25 group cursor-pointer"
              title="Open Side Menu"
            >
              <Menu className="w-5 h-5 text-sky-300 group-hover:scale-105 transition-transform" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-black shadow-lg shadow-red-600/50 animate-pulse border border-white/40">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Demo / Config Indicator Bar - Removed for clean production layout */}
      </header>

      {/* 3-LINE HAMBURGER SIDE NAVIGATION DRAWER */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-end overflow-hidden"
          onTouchMove={(e) => e.preventDefault()}
        >
          {/* Dark Blur Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            onTouchStart={(e) => {
              e.preventDefault();
              setIsDrawerOpen(false);
            }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
          />

          {/* Drawer Slide-in Container */}
          <div 
            className="relative w-72 max-w-[80vw] h-full bg-[#040e1a] border-l border-[#00e5ff]/30 p-4 z-50 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 text-white overflow-y-auto"
            onTouchMove={(e) => e.stopPropagation()}
          >
            
            <div className="space-y-4">
              {/* Drawer Top Header & Close */}
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <div 
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 select-none active:scale-95 transition-transform"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 border border-[#00e5ff]/40 flex items-center justify-center text-[#00e5ff]">
                    <Gamepad2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white">NAVIGATION MENU</h3>
                    <p className="text-[9px] text-gray-400">MVP Esports PK</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* User Profile Mini Badge in Drawer */}
              {userProfile && (
                <div
                  onClick={() => handleTabClick('profile')}
                  className="p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 flex items-center gap-3 cursor-pointer hover:border-[#00e5ff]/60 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 flex-shrink-0">
                    <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-sm overflow-hidden">
                      {userProfile.avatar_url ? (
                        <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        userProfile.username?.charAt(0).toUpperCase() || 'P'
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-white truncate">{userProfile.username}</h4>
                    <p className="text-[10px] text-gray-400 truncate">PUBG: {userProfile.pubg_id_name || 'N/A'}</p>
                    <p className="text-[10px] text-[#00e5ff] font-bold">RS. {(parseAmount(userProfile?.wallet_balance) ?? 0).toLocaleString()}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </div>
              )}

              {/* Navigation Links */}
              <div className="space-y-1.5 pt-1">

                {canInstallPwa && (
                  <button
                    onClick={() => handleNavClick(onInstallPwa || (() => {}))}
                    className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 via-[#00c8ff] to-blue-600 text-white font-black text-xs flex items-center justify-between transition-all shadow-[0_0_16px_rgba(0,200,255,0.4)] hover:brightness-110 hover:shadow-[0_0_22px_rgba(0,200,255,0.65)] active:scale-98 border border-sky-300/60 mb-2 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-black/20 border border-white/40 flex items-center justify-center shrink-0 shadow-inner">
                        <Download className="w-3.5 h-3.5 text-white" />
                      </div>
                      <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300/40 animate-sticker-crown shrink-0 drop-shadow-[0_0_6px_rgba(252,211,77,0.9)]" />
                      <span className="truncate text-white font-black tracking-wide">{pwaLabel}</span>
                    </div>
                    <span className="text-[9px] bg-sky-950/60 text-sky-100 px-2 py-0.5 rounded-md font-black uppercase border border-sky-300/50 shrink-0 shadow-sm">
                      INSTALL
                    </span>
                  </button>
                )}

                <button
                  onClick={() => handleNavClick(onOpenFriendsHub || (() => {}))}
                  className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff]/20 to-transparent hover:from-[#00e5ff]/30 text-xs font-black text-[#00e5ff] flex items-center justify-between transition-all border border-[#00e5ff]/40 shadow-md shadow-[#00e5ff]/10"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4.5 h-4.5 text-[#00e5ff]" />
                    <span>Friends & Social Discussion</span>
                  </div>
                  {socialUnreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-md">
                      {socialUnreadCount > 9 ? '9+' : socialUnreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleTabClick('home')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <Gamepad2 className="w-4 h-4 text-[#00e5ff]" />
                  <span>Esports Arena Home</span>
                </button>

                <button
                  onClick={() => handleTabClick('profile')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <User className="w-4 h-4 text-[#00e5ff]" />
                  <span>Player Profile & Stats</span>
                </button>

                <button
                  onClick={() => handleNavClick(onOpenAnnouncements || (() => {}))}
                  className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff]/10 to-transparent hover:from-[#00e5ff]/20 text-xs font-black text-[#00e5ff] flex items-center gap-3 transition-all border border-[#00e5ff]/30 shadow-sm"
                >
                  <Megaphone className="w-4.5 h-4.5 text-[#00e5ff] animate-bounce" />
                  <span>Announcements</span>
                </button>

                <button
                  onClick={() => handleNavClick(() => setIsNotificationModalOpen(true))}
                  className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff]/10 to-transparent hover:from-[#00e5ff]/20 text-xs font-black text-[#00e5ff] flex items-center gap-3 transition-all border border-[#00e5ff]/30 shadow-sm"
                >
                  <Bell className="w-4.5 h-4.5 text-[#00e5ff]" />
                  <div className="flex items-center justify-between flex-1">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-md">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => handleTabClick('watch-live')}
                  className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-red-500/10 to-transparent hover:from-red-500/20 text-xs font-black text-red-400 flex items-center gap-3 transition-all border border-red-500/35 shadow-sm"
                >
                  <Video className="w-4.5 h-4.5 text-red-500 animate-pulse" />
                  <span>Watch Live Streams</span>
                </button>

                <button
                  onClick={() => handleTabClick('coming-soon')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e] hover:bg-[#07192e]/90 text-xs font-bold text-white flex items-center justify-between transition-all border border-[#00e5ff]/30 shadow-md shadow-[#00e5ff]/5"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>Coming Soon Matches</span>
                  </div>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-extrabold uppercase border border-amber-500/30">
                    Timer
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick('my-matches')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <Trophy className="w-4 h-4 text-emerald-400" />
                  <span>My Booked Matches</span>
                </button>

                <button
                  onClick={() => handleNavClick(onOpenWallet)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>Cash Wallet & Deposit</span>
                </button>

                <button
                  onClick={() => handleTabClick('leaderboard')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <Trophy className="w-4 h-4 text-purple-400" />
                  <span>Leaderboard & Rankings</span>
                </button>

                <button
                  onClick={() => handleNavClick(onOpenSupport || (() => {}))}
                  className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff]/20 to-transparent hover:from-[#00e5ff]/30 text-xs font-black text-white flex items-center gap-3 transition-all border border-[#00e5ff]/40 shadow-md shadow-[#00e5ff]/10"
                >
                  <MessageSquare className="w-4.5 h-4.5 text-[#00e5ff]" />
                  <span>Support / Chat with Admin</span>
                </button>

                <button
                  onClick={() => handleNavClick(() => setIsRulesModalOpen(true))}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#07192e]/60 hover:bg-[#07192e] text-xs font-bold text-gray-200 flex items-center gap-3 transition-all border border-transparent hover:border-gray-800"
                >
                  <ScrollText className="w-4 h-4 text-blue-400" />
                  <span>Rules & Regulations 📜</span>
                </button>

                <div className="my-2 border-t border-gray-800/80" />

                {/* Removed conditional admin panel rendering */}

              </div>
            </div>

            {/* Bottom Drawer Logout */}
            <div className="pt-4 border-t border-gray-800 space-y-2">
              {userProfile?.is_admin === true && (
                <button
                  onClick={() => handleNavClick(onOpenAdmin)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border border-amber-500/50 text-amber-300 hover:text-amber-200 hover:border-amber-400 text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-95 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>ADMIN PANEL 🛡️</span>
                </button>
              )}
              {userProfile && !userProfile.is_admin && (
                <button
                  onClick={() => handleNavClick(() => setIsDeletionModalOpen(true))}
                  className="w-full py-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400/80 hover:text-red-400 hover:border-red-500/40 text-xs font-bold flex items-center justify-center gap-2 transition-all group"
                >
                  <Trash2 className="w-4 h-4 group-hover:animate-pulse" />
                  <span>Request Account Deletion 🗑️</span>
                </button>
              )}
<button
  onClick={() => handleNavClick(onLogout)}
  className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-all"
>
  <LogOut className="w-4 h-4 text-red-400" />
  <span>Logout Account</span>
</button>
            </div>

          </div>
        </div>
      )}

      {userProfile && (
        <DeletionRequestModal
          isOpen={isDeletionModalOpen}
          onClose={() => setIsDeletionModalOpen(false)}
          userProfile={userProfile}
        />
      )}

      <RulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />

      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        notifications={visibleNotifications}
        onRefresh={loadNotifications}
        onMarkPublicRead={(id) => setReadPublicIds(prev => [...prev, id])}
        onHidePublic={(id) => setHiddenPublicIds(prev => [...prev, id])}
        onMarkAllPublicRead={(ids) => setReadPublicIds(prev => [...prev, ...ids])}
      />

    </>
  );
};

