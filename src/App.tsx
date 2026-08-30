import React, { Component, useState, useEffect, useRef, Suspense, lazy, useDeferredValue } from 'react';
import {
  UserProfile,
  Match,
  SlotBooking,
  WalletTransaction,
  MatchType,
  Announcement,
  LiveStream,
  RoomCredential,
  Poll
} from './types';
import {
  supabase,
  isSupabaseConfigured,
  parseAmount,
  updateMatchesCache,
  saveLocalBooking,
  updateLocalTransactionStatus,
  adminApproveDeposit,
  adminRejectDeposit,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  insertDepositRequestToSupabase,
  insertWithdrawalRequestToSupabase,
  uploadScreenshotToSupabase,
  process_wallet_transaction_safeguard,
  getLocalAnnouncements,
  saveLocalAnnouncement,
  deleteLocalAnnouncement,
  getLocalLiveStreams,
  saveLocalLiveStream,
  deleteLocalLiveStream,
  extractYoutubeId,
  getYoutubeThumbnail,
  formatStreamViewers,
  checkBanStatus,
  formatRemainingBanTime,
  getAllProfiles,
  saveAllProfiles,
  getDeletionRequests,
  deleteDeletionRequest,
  createNotification,
  updateUserPresence,
  fetchMatchesAndBookingsFromSupabase,
  updateBookingsCache,
  fetchUserBookingsFromSupabase
} from './lib/supabase';

import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { NoticeBanner } from './components/NoticeBanner';
import { LandingScreen } from './components/LandingScreen';
import { AuthScreen } from './components/AuthScreen';
import { MatchCard } from './components/MatchCard';
import { MatchDetailModal } from './components/MatchDetailModal';
import { WalletModal } from './components/WalletModal';
import { MyMatchesView } from './components/MyMatchesView';
import { ProfileView } from './components/ProfileView';
import { ComingSoonMatchesView, getComingSoonMatchInfo } from './components/ComingSoonMatchesView';
import { EditProfileModal } from './components/EditProfileModal';
import { AnnouncementsModal } from './components/AnnouncementsModal';
import { AdminPinGateway } from './components/AdminPinGateway';
import { PollWidget } from './components/PollWidget';
import { fetchActivePolls, fetchAllPollsAdmin, createPoll, deactivatePoll, deletePoll, castPollVote } from './lib/polls';
import { useSmartLoading } from './context/LoadingContext';
import { MvpLoader } from './components/MvpLoader';
import { usePwaInstall } from './hooks/usePwaInstall';
import { PwaHomeBanner } from './components/PwaHomeBanner';
import { PwaIosGuideModal } from './components/PwaIosGuideModal';

const AdminPanelModal = lazy(() => import('./components/AdminPanelModal').then(m => ({ default: m.AdminPanelModal })));
const FriendsHubModal = lazy(() => import('./components/FriendsHubModal').then(m => ({ default: m.FriendsHubModal })));
const SupportChat = lazy(() => import('./components/SupportChat').then(m => ({ default: m.SupportChat })));
const WatchStreamsView = lazy(() => import('./components/WatchStreamsView').then(m => ({ default: m.WatchStreamsView })));
const LeaderboardView = lazy(() => import('./components/LeaderboardView').then(m => ({ default: m.LeaderboardView })));
import { Search, X, Trophy, ChevronRight, Sparkles, MapPin, Gamepad2, Flame, Play, Clock } from 'lucide-react';


interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
    this.handleReset = this.handleReset.bind(this);
  }

  handleReset() {
    this.setState({ hasError: false, errorMsg: '' });
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, errorMsg: error?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Caught error in ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#030a16] text-white flex flex-col items-center justify-center p-6 text-center space-y-4 select-none">
          <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center font-bold text-xl border border-red-500/40">⚠️</div>
          <h2 className="text-sm font-black uppercase text-red-400 tracking-wider">An Error Occurred</h2>
          <p className="text-xs text-gray-400 max-w-xs">{this.state.errorMsg}</p>
          <button
            onClick={this.handleReset}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-xl transition-all shadow-lg uppercase tracking-wider"
          >
            Retry Arena
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { executeTask, startGlobalLoading, stopGlobalLoading } = useSmartLoading();
  const pwa = usePwaInstall();
  const [session, setSession] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<'landing' | 'auth' | 'home' | 'admin' | 'admin_login'>('auth');
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile' | 'coming-soon' | 'watch-live'>('home');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('login');
  const [matchTab, setMatchTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global Auto-Scroll on Input / Textarea Focus (Brings every typing field to center/top on mobile keyboard open)
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName?.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || target.getAttribute('contenteditable') === 'true';

      if (isInput) {
        // Delay allows mobile soft-keyboard or virtual viewport to finish opening animation
        setTimeout(() => {
          try {
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            });
          } catch {
            // Fallback for older engines
            target.scrollIntoView(false);
          }
        }, 320);
      }
    };

    document.addEventListener('focusin', handleFocusIn, { passive: true });
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // Core Data States
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bookings, setBookings] = useState<SlotBooking[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Modals state
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isWalletOpen, setIsWalletOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isAdminUnlocked, setIsAdminUnlockedState] = useState<boolean>(false);
  const isAdminUnlockedRef = useRef<boolean>(false);
  const setIsAdminUnlocked = (val: boolean) => {
    isAdminUnlockedRef.current = val;
    setIsAdminUnlockedState(val);
  };
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState<boolean>(false);
  const [isWatchStreamsOpen, setIsWatchStreamsOpen] = useState<boolean>(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isFriendsHubOpen, setIsFriendsHubOpen] = useState<boolean>(false);

  // Announcements State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [adminPolls, setAdminPolls] = useState<Poll[]>([]);
  const [isPollsLoading, setIsPollsLoading] = useState(true);

  // Live Streams State
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);

  // Toast Banner State
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'info' | 'error' = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Reset all modal overlays and UI screen state to the main Arena/Home tab
  const resetUiStatesToHome = () => {
    setCurrentScreen('home');
    setActiveBottomTab('home');
    setSelectedMatch(null);
    setIsWalletOpen(false);
    setIsAdminOpen(false);
    setIsSupportOpen(false);
    setIsAnnouncementsOpen(false);
    setIsWatchStreamsOpen(false);
    setIsEditProfileOpen(false);
    setIsFriendsHubOpen(false);
    setIsAdminUnlocked(false);
    setSearchQuery('');
    setMatchTab('all');
  };

  const restoreSavedUiStates = (prof: UserProfile) => {
    try {
      const savedScreen = localStorage.getItem('mvp_currentScreen') as any;
      const savedTab = localStorage.getItem('mvp_activeBottomTab') as any;
      const savedWallet = localStorage.getItem('mvp_isWalletOpen') === 'true';
      const savedAdmin = localStorage.getItem('mvp_isAdminOpen') === 'true';
      const savedAdminUnlocked = localStorage.getItem('mvp_isAdminUnlocked') === 'true';
      const savedSupport = localStorage.getItem('mvp_isSupportOpen') === 'true';
      const savedAnnouncements = localStorage.getItem('mvp_isAnnouncementsOpen') === 'true';
      const savedWatch = localStorage.getItem('mvp_isWatchStreamsOpen') === 'true';
      const savedEditProfile = localStorage.getItem('mvp_isEditProfileOpen') === 'true';
      const savedFriends = localStorage.getItem('mvp_isFriendsHubOpen') === 'true';
      const savedMatchId = localStorage.getItem('mvp_selectedMatchId');

      if (savedScreen && savedScreen !== 'auth' && savedScreen !== 'landing') {
        setCurrentScreen(savedScreen);
      } else {
        setCurrentScreen('home');
      }

      if (savedTab) {
        setActiveBottomTab(savedTab);
      } else {
        setActiveBottomTab('home');
      }

      setIsWalletOpen(savedWallet);
      setIsAdminOpen(savedAdmin);
      setIsAdminUnlocked(savedAdminUnlocked);
      setIsSupportOpen(savedSupport);
      setIsAnnouncementsOpen(savedAnnouncements);
      setIsWatchStreamsOpen(savedWatch);
      setIsEditProfileOpen(savedEditProfile);
      setIsFriendsHubOpen(savedFriends);

      if (savedMatchId) {
        localStorage.setItem('mvp_restore_match_id', savedMatchId);
      }
    } catch (e) {
      console.warn('Error restoring saved UI states:', e);
      resetUiStatesToHome();
    }
  };

  // Persist layout states to localStorage whenever they change
  useEffect(() => {
    if (session && userProfile) {
      try {
        localStorage.setItem('mvp_currentScreen', currentScreen);
        localStorage.setItem('mvp_activeBottomTab', activeBottomTab);
        localStorage.setItem('mvp_isWalletOpen', String(isWalletOpen));
        localStorage.setItem('mvp_isAdminOpen', String(isAdminOpen));
        localStorage.setItem('mvp_isAdminUnlocked', String(isAdminUnlocked));
        localStorage.setItem('mvp_isSupportOpen', String(isSupportOpen));
        localStorage.setItem('mvp_isAnnouncementsOpen', String(isAnnouncementsOpen));
        localStorage.setItem('mvp_isWatchStreamsOpen', String(isWatchStreamsOpen));
        localStorage.setItem('mvp_isEditProfileOpen', String(isEditProfileOpen));
        localStorage.setItem('mvp_isFriendsHubOpen', String(isFriendsHubOpen));
        if (selectedMatch) {
          localStorage.setItem('mvp_selectedMatchId', String(selectedMatch.id));
        } else {
          localStorage.removeItem('mvp_selectedMatchId');
        }
      } catch (e) {
        console.warn('Error persisting layout states:', e);
      }
    }
  }, [
    currentScreen,
    activeBottomTab,
    isWalletOpen,
    isAdminOpen,
    isAdminUnlocked,
    isSupportOpen,
    isAnnouncementsOpen,
    isWatchStreamsOpen,
    isEditProfileOpen,
    isFriendsHubOpen,
    selectedMatch,
    session,
    userProfile
  ]);

  // Restore selectedMatch when matches are asynchronously populated
  useEffect(() => {
    try {
      const restoreMatchId = localStorage.getItem('mvp_restore_match_id');
      if (restoreMatchId && matches && matches.length > 0) {
        const found = matches.find(m => String(m.id) === String(restoreMatchId));
        if (found) {
          setSelectedMatch(found);
        }
        localStorage.removeItem('mvp_restore_match_id');
      }
    } catch (e) {
      console.warn('Error restoring match selection:', e);
    }
  }, [matches]);

  // Handle visibilitychange & pageshow for background / return transitions (soft-refresh)
  useEffect(() => {
    const handleVisibilityOrPageshow = () => {
      if (document.visibilityState === 'visible') {
        if (session && userProfile) {
          // Soft background refresh of state data without displaying fullscreen Connecting/loader overlay
          refreshData(false, false).catch(err => {
            console.warn('Background data sync soft-fail:', err);
          });
          // Dispatch custom events to trigger child panels & direct chats to query latest messages/records
          window.dispatchEvent(new Event('friends_changed'));
          window.dispatchEvent(new Event('messages_changed'));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrPageshow);
    window.addEventListener('pageshow', handleVisibilityOrPageshow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrPageshow);
      window.removeEventListener('pageshow', handleVisibilityOrPageshow);
    };
  }, [session, userProfile]);

  const checkIsAdminRoute = () => {
    const p = window.location.pathname.toLowerCase();
    const h = window.location.hash.toLowerCase();
    const s = window.location.search.toLowerCase();
    return p === '/admin' || p === '/admin-login' || h === '#/admin' || h === '#/admin-login' || s.includes('admin=true');
  };

  // 1. Initial Auth & Data Hydration
  useEffect(() => {
    let isCancelled = false;
    const isReadyAdmin = checkIsAdminRoute();

    const handleAuthFailure = () => {
      setUserProfile(null);
      setSession(null);
      setTransactions([]);
      setBookings([]);
      setSelectedMatch(null);
      setIsWalletOpen(false);
      setIsAdminOpen(false);
      setIsSupportOpen(false);
      setIsAnnouncementsOpen(false);
      setIsWatchStreamsOpen(false);
      setIsEditProfileOpen(false);
      setIsFriendsHubOpen(false);
      setIsAdminUnlocked(false);
      setActiveBottomTab('home');
      setSearchQuery('');
      setMatchTab('all');
      setCurrentScreen('auth');
      setAuthMode('login');
      try {
        localStorage.removeItem('mvp_currentScreen');
        localStorage.removeItem('mvp_activeBottomTab');
        localStorage.removeItem('mvp_isWalletOpen');
        localStorage.removeItem('mvp_isAdminOpen');
        localStorage.removeItem('mvp_isAdminUnlocked');
        localStorage.removeItem('mvp_isSupportOpen');
        localStorage.removeItem('mvp_isAnnouncementsOpen');
        localStorage.removeItem('mvp_isWatchStreamsOpen');
        localStorage.removeItem('mvp_isEditProfileOpen');
        localStorage.removeItem('mvp_isFriendsHubOpen');
        localStorage.removeItem('mvp_selectedMatchId');
      } catch (e) {}
      if (isReadyAdmin) {
        window.history.replaceState({}, '', '/');
        showToast('Access Denied: Please log in with an administrator account.', 'error');
      }
      setIsAuthChecking(false);
    };

    if (isSupabaseConfigured() && supabase) {
      const initAuthAndData = async () => {
        try {
          // Parallelize session retrieval and initial matches/bookings load
          const [sessionRes] = await Promise.all([
            supabase.auth.getSession(),
            refreshData(false, true)
          ]);

          if (isCancelled) return;

          const activeSession = sessionRes.data?.session;
          if (!activeSession || !activeSession.user) {
            handleAuthFailure();
            return;
          }

          // Fetch user profile and user slot bookings concurrently
          const [prof] = await Promise.all([
            fetchProfile(activeSession.user.id, activeSession.user.email, activeSession.user.user_metadata),
            fetchUserBookings(activeSession.user.id)
          ]);

          if (isCancelled) return;

          if (prof) {
            const banCheck = await checkBanStatus(prof.id, prof.username);
            if (banCheck.isBanned || prof.is_banned) {
              await supabase.auth.signOut().catch(() => {});
              setUserProfile(null);
              setSession(null);
              setCurrentScreen('auth');
              setAuthMode('login');
              const remaining = banCheck.banRecord?.expires_at
                ? formatRemainingBanTime(banCheck.banRecord.expires_at)
                : (prof.ban_expires_at ? formatRemainingBanTime(prof.ban_expires_at) : null);
              let banMsg = '';
              if (remaining && remaining !== 'Expired') {
                banMsg = `You are banned by Admin. Try again after ${remaining}.`;
              } else if (banCheck.banRecord?.reason || prof.ban_reason) {
                banMsg = `You are banned. Reason: ${banCheck.banRecord?.reason || prof.ban_reason}.`;
              } else {
                banMsg = `You are banned by Admin. Access is restricted.`;
              }
              setAuthError(banMsg);
              setIsAuthChecking(false);
              return;
            }

            setSession(activeSession);
            setUserProfile(prof);

            const isAdmin = Boolean(prof.is_admin === true);
            if (isReadyAdmin) {
              if (isAdmin) {
                setCurrentScreen('admin_login');
              } else {
                window.history.replaceState({}, '', '/');
                resetUiStatesToHome();
                showToast('Access Denied: Only authorized administrators can access this portal.', 'error');
              }
            } else {
              restoreSavedUiStates(prof);
            }
          } else {
            handleAuthFailure();
          }
        } catch (e) {
          console.warn("Initial session load notice:", e);
          if (!isCancelled) handleAuthFailure();
        } finally {
          if (!isCancelled) setIsAuthChecking(false);
        }
      };

      initAuthAndData();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (_event === 'INITIAL_SESSION') return; // Skip double execution on initial mount

        if (_event === 'SIGNED_OUT') {
          setUserProfile(null);
          setSession(null);
          setBookings([]);
          setSelectedMatch(null);
          setIsWalletOpen(false);
          setIsAdminOpen(false);
          setIsSupportOpen(false);
          setIsAnnouncementsOpen(false);
          setIsWatchStreamsOpen(false);
          setIsEditProfileOpen(false);
          setIsFriendsHubOpen(false);
          setIsAdminUnlocked(false);
          setActiveBottomTab('home');
          setSearchQuery('');
          setMatchTab('all');
          setCurrentScreen('auth');
          setIsAuthChecking(false);
          return;
        }

        if (newSession && newSession.user) {
          try {
            const prof = await fetchProfile(newSession.user.id, newSession.user.email, newSession.user.user_metadata);
            if (prof) {
              const banCheck = await checkBanStatus(prof.id, prof.username);
              if (banCheck.isBanned || prof.is_banned) {
                await supabase.auth.signOut().catch(() => {});
                setUserProfile(null);
                setSession(null);
                setBookings([]);
                setCurrentScreen('auth');
                setAuthMode('login');
                const remaining = banCheck.banRecord?.expires_at
                  ? formatRemainingBanTime(banCheck.banRecord.expires_at)
                  : (prof.ban_expires_at ? formatRemainingBanTime(prof.ban_expires_at) : null);
                let banMsg = '';
                if (remaining && remaining !== 'Expired') {
                  banMsg = `You are banned by Admin. Try again after ${remaining}.`;
                } else if (banCheck.banRecord?.reason || prof.ban_reason) {
                  banMsg = `You are banned. Reason: ${banCheck.banRecord?.reason || prof.ban_reason}.`;
                } else {
                  banMsg = `You are banned by Admin. Access is restricted.`;
                }
                setAuthError(banMsg);
                setIsAuthChecking(false);
                return;
              }

              setSession(newSession);
              setUserProfile(prof);
              await fetchUserBookings(prof.id);
              if (checkIsAdminRoute()) {
                const isAdmin = Boolean(prof.is_admin === true);
                if (isAdmin) {
                  setCurrentScreen(prev => (prev === 'admin' && isAdminUnlockedRef.current) ? 'admin' : 'admin_login');
                } else {
                  window.history.replaceState({}, '', '/');
                  resetUiStatesToHome();
                  showToast('Access Denied: Only authorized administrators can access this portal.', 'error');
                }
              } else if (_event === 'SIGNED_IN') {
                resetUiStatesToHome();
              }
            } else {
              await supabase.auth.signOut().catch(() => {});
              setUserProfile(null);
              setSession(null);
              setBookings([]);
              setCurrentScreen('auth');
            }
          } catch (e) {
            console.warn('onAuthStateChange profile notice:', e);
          } finally {
            setIsAuthChecking(false);
          }
        } else {
          setIsAuthChecking(false);
        }
      });

      return () => {
        isCancelled = true;
        subscription.unsubscribe();
      };
    } else {
      handleAuthFailure();
    }
  }, []);

  // Popstate / Hashchange listener for direct navigation to /admin
  useEffect(() => {
    const handlePopState = () => {
      if (checkIsAdminRoute()) {
        const isAdmin = Boolean(userProfile?.is_admin === true);
        if (!session || !userProfile) {
          window.history.replaceState({}, '', '/');
          setCurrentScreen('auth');
          showToast('Access Denied: Please log in with an administrator account.');
        } else if (!isAdmin) {
          window.history.replaceState({}, '', '/');
          setCurrentScreen('home');
          showToast('Access Denied: Only authorized administrators can access this portal.');
        } else {
          setCurrentScreen(isAdminUnlockedRef.current ? 'admin' : 'admin_login');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, [session, userProfile, isAdminUnlocked]);

  // Security Lockdown Guard for Admin Access
  useEffect(() => {
    if (isAuthChecking) return; // Wait for initial auth check to complete
    if (currentScreen === 'admin' || currentScreen === 'admin_login') {
      const isAdmin = Boolean(userProfile?.is_admin === true);
      if (!session || !userProfile || !isAdmin) {
        if (checkIsAdminRoute()) {
          window.history.replaceState({}, '', '/');
        }
        setIsAdminUnlocked(false);
        setCurrentScreen(userProfile ? 'home' : 'auth');
        showToast('Access Denied: Administrative privileges required.');
      } else if (currentScreen === 'admin' && !isAdminUnlocked) {
        setCurrentScreen('admin_login');
      }
    }
  }, [currentScreen, session, userProfile, isAdminUnlocked, isAuthChecking]);

  // Keep track of the last refresh time
  const lastRefreshRef = useRef<number>(0);
  const refreshDebounceRef = useRef<any>(null);

  const debouncedRefreshData = (showLoading = false) => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
        refreshData(showLoading);
    }, 1000);
  }

  const fetchWithTimeout = <T,>(promise: Promise<T>, ms = 8000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const fetchUserBookings = async (userId: string): Promise<SlotBooking[]> => {
    if (!userId || !isSupabaseConfigured() || !supabase) {
      setBookings([]);
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('slot_bookings')
        .select('*')
        .or(`user_id.eq.${userId},player_id.eq.${userId}`);
      if (error) {
        console.error('Error fetching user slot_bookings from Supabase:', error);
        return [];
      }
      const userBookings = data || [];
      setBookings(userBookings);
      updateBookingsCache(userBookings);
      return userBookings;
    } catch (err) {
      console.error('Exception fetching user slot_bookings from Supabase:', err);
      return [];
    }
  };

  // Hydrate Matches, Bookings, Transactions in high-performance parallel execution
  const refreshData = async (showLoading = false, force = false, overrideUserId?: string) => {
    const now = Date.now();
    const minInterval = showLoading ? 2000 : 6000;
    const targetUserId = overrideUserId || userProfile?.id;

    if (!force && (now - lastRefreshRef.current < minInterval)) {
      return;
    }
    lastRefreshRef.current = now;

    if (!isSupabaseConfigured() || !supabase) {
      setMatches([]);
      setAnnouncements(getLocalAnnouncements());
      setLiveStreams([]);
      setIsPollsLoading(false);
      return;
    }

    try {
      // Execute all core queries in a single parallel wave
      const [
        matchesRes,
        announcementsRes,
        streamsRes,
        activePollsRes,
        adminPollsRes
      ] = await Promise.all([
        supabase.from('matches').select('*').order('created_at', { ascending: false }),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('live_streams').select('*').order('created_at', { ascending: false }),
        fetchActivePolls(),
        userProfile?.is_admin ? fetchAllPollsAdmin() : Promise.resolve([])
      ]);

      if (!matchesRes.error && matchesRes.data) {
        setMatches(matchesRes.data);
      } else if (matchesRes.error) {
        // Fallback retry
        const selectAllRes = await supabase.from('matches').select('*');
        if (selectAllRes.data) setMatches(selectAllRes.data);
      }

      if (!announcementsRes.error && announcementsRes.data) {
        setAnnouncements(announcementsRes.data);
      }

      if (streamsRes.data) {
        const mappedStreams: LiveStream[] = streamsRes.data.map((s: any) => {
          const vId = extractYoutubeId(s.youtube_url || '');
          const cachedViewers = vId ? localStorage.getItem(`mvp_stream_viewers_${vId}`) : null;
          return {
            id: s.id,
            title: s.stream_title || s.title || '',
            youtube_url: s.youtube_url || '',
            thumbnail_url: getYoutubeThumbnail(s.youtube_url || ''),
            viewers_count: formatStreamViewers(cachedViewers || s.viewers_count),
            is_active: true,
            created_at: s.created_at || new Date().toISOString()
          };
        });
        setLiveStreams(mappedStreams);
      } else {
        setLiveStreams([]);
      }

      if (activePollsRes) setPolls(activePollsRes);
      if (adminPollsRes && userProfile?.is_admin) setAdminPolls(adminPollsRes);
      setIsPollsLoading(false);
    } catch (err: any) {
      console.error('Parallel refreshData exception:', err);
      setIsPollsLoading(false);
    }

    if (userProfile || targetUserId) {
      await refreshProfileData(showLoading);
    }
  };

  const refreshProfileData = async (showLoading = false) => {
    if (!userProfile) return;

    if (showLoading && transactions.length === 0) {
      setIsLoadingTransactions(true);
    }

    if (isSupabaseConfigured() && supabase) {
      const targetUserId = userProfile.id;

      let sbTx: any[] = [];
      let sbDep: any[] = [];
      let sbWd: any[] = [];

      try {
        const [profRes, bookingsRes, txRes, depRes, wdRes] = await Promise.all([
          supabase.from('profiles').select('wallet_balance').eq('id', targetUserId).maybeSingle(),
          supabase.from('slot_bookings').select('*').or(`user_id.eq.${targetUserId},player_id.eq.${targetUserId}`),
          supabase.from('wallet_transactions').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(50),
          supabase.from('deposit_requests').select('*').eq('player_id', targetUserId).order('created_at', { ascending: false }).limit(30),
          supabase.from('withdrawal_requests').select('*').eq('player_id', targetUserId).order('created_at', { ascending: false }).limit(30)
        ]);

        if (profRes?.data?.wallet_balance !== undefined) {
          const updatedBal = Number(profRes.data.wallet_balance || 0);
          if (updatedBal !== userProfile.wallet_balance) {
            setUserProfile(prev => prev ? { ...prev, wallet_balance: updatedBal } : null);
          }
        }

        if (!bookingsRes.error && Array.isArray(bookingsRes.data)) {
          setBookings(bookingsRes.data);
          updateBookingsCache(bookingsRes.data);
        }

        if (!txRes.error && txRes.data) sbTx = txRes.data;
        if (!depRes.error && depRes.data) sbDep = depRes.data;
        if (!wdRes.error && wdRes.data) sbWd = wdRes.data;
      } catch (err) {
        console.warn('refreshProfileData parallel fetch exception:', err);
      }

      try {
        const txMap = new Map<string, any>();

        sbDep.forEach((dep: any) => {
          const key = `dep-${dep.id}`;
          txMap.set(key, {
            uniqueKey: key,
            id: dep.id,
            player_id: dep.player_id || dep.user_id,
            user_id: dep.player_id || dep.user_id,
            amount: Number(dep.amount || 0),
            type: 'deposit',
            payment_method: dep.payment_method || 'JazzCash',
            trx_id: dep.trx_id || dep.transaction_id || '',
            account_title: dep.sender_name || dep.account_title || '',
            sender_name: dep.sender_name || dep.account_title || '',
            screenshot_url: dep.screenshot_url || '',
            status: dep.status || 'pending',
            created_at: dep.created_at || new Date().toISOString()
          });
        });

        sbWd.forEach((wd: any) => {
          const key = `wd-${wd.id}`;
          txMap.set(key, {
            uniqueKey: key,
            id: wd.id,
            player_id: wd.player_id || wd.user_id,
            user_id: wd.player_id || wd.user_id,
            amount: Number(wd.amount || 0),
            type: 'withdrawal',
            payment_method: wd.payment_method || 'JazzCash',
            account_number: wd.account_number || '',
            account_title: wd.account_title || '',
            trx_id: wd.trx_id || '',
            screenshot_url: wd.screenshot_url || '',
            status: wd.status || 'pending',
            created_at: wd.created_at || new Date().toISOString()
          });
        });

        sbTx.forEach((tx: any) => {
          const prefix = tx.type === 'withdrawal' ? 'wd' : tx.type === 'deposit' ? 'dep' : (tx.type || 'tx');
          const key = `${prefix}-${tx.id}`;
          if (!txMap.has(key)) {
            txMap.set(key, {
              uniqueKey: key,
              id: tx.id,
              player_id: tx.user_id,
              user_id: tx.user_id,
              amount: Number(tx.amount || 0),
              type: tx.type || 'deposit',
              payment_method: tx.payment_method || 'JazzCash',
              account_number: tx.account_number || '',
              account_title: tx.account_title || tx.sender_name || '',
              sender_name: tx.sender_name || tx.account_title || '',
              username: tx.username || '',
              user_name: tx.user_name || '',
              note: tx.note || '',
              trx_id: tx.trx_id || '',
              screenshot_url: tx.screenshot_url || '',
              status: tx.status || 'pending',
              created_at: tx.created_at || new Date().toISOString()
            });
          } else {
            const existing = txMap.get(key);
            if (existing) {
              if (tx.status) existing.status = tx.status;
              if (tx.payment_method) existing.payment_method = tx.payment_method;
              if (tx.trx_id) existing.trx_id = tx.trx_id;
            }
          }
        });

        const mergedList = Array.from(txMap.values());
        mergedList.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        const formattedTxs: any[] = mergedList.map(t => ({
          id: String(t.uniqueKey || t.id),
          user_id: t.user_id,
          user_email: t.user_email || '',
          user_name: t.user_name || '',
          username: t.username || '',
          amount: Number(t.amount || 0),
          type: t.type || 'deposit',
          payment_method: t.payment_method || 'JazzCash',
          account_number: t.account_number || '',
          account_title: t.account_title || '',
          sender_name: t.sender_name || t.account_title || '',
          trx_id: t.trx_id || '',
          screenshot_url: t.screenshot_url || '',
          status: ['approved', 'completed', 'confirmed'].includes(String(t.status).toLowerCase()) ? 'approved' : String(t.status).toLowerCase() === 'rejected' ? 'rejected' : 'pending',
          note: t.note || '',
          created_at: t.created_at || new Date().toISOString(),
          updated_at: t.updated_at
        }));

        if (formattedTxs.length > 0) {
          setTransactions(formattedTxs);
        }
      } catch (e) {
        console.warn('Formatting transactions exception:', e);
      } finally {
        setIsLoadingTransactions(false);
      }
    } else {
      setIsLoadingTransactions(false);
    }
  };

  useEffect(() => {
    refreshData(true);
  }, [userProfile?.id]);

  // Realtime subscription for transactions tables
  useEffect(() => {
    let txChannel: any = null;
    let refreshTimeout: any = null;

    const debouncedRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        refreshData(false);
      }, 1000);
    };

    if (isSupabaseConfigured() && supabase && userProfile) {
      try {
        // Subscribe to general wallet_transactions changes
        txChannel = supabase
          .channel(`wallet_transactions_realtime:${userProfile.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wallet_transactions'
            },
            (payload: any) => {
              if (payload && ['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
                debouncedRefresh();
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Realtime wallet transaction subscription error:', err);
      }
    }
    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      if (txChannel) {
        supabase?.removeChannel(txChannel);
      }
    };
  }, [userProfile?.id]);

  // Sync wallet transactions across tabs or when local storage updates
  useEffect(() => {
    const handleStorageChange = () => {
      debouncedRefreshData(false);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [userProfile?.id]);

  // Realtime subscription for announcements to instantly broadcast
  useEffect(() => {
    let annChannel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        annChannel = supabase
          .channel('announcements_realtime')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'announcements'
            },
            (payload) => {
              const newAnn = payload.new as Announcement;
              if (newAnn) {
                setAnnouncements(prev => {
                  if (prev.some(a => a.id === newAnn.id)) return prev;
                  return [newAnn, ...prev];
                });
                showToast(`📢 NEW ANNOUNCEMENT: ${newAnn.title}`);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'announcements'
            },
            (payload) => {
              const deletedId = payload.old?.id;
              if (deletedId) {
                setAnnouncements(prev => prev.filter(a => a.id !== deletedId));
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'announcements'
            },
            (payload) => {
              const updatedAnn = payload.new as Announcement;
              if (updatedAnn) {
                setAnnouncements(prev => prev.map(a => a.id === updatedAnn.id ? updatedAnn : a));
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Realtime announcements sub error:', err);
      }
    }
    return () => {
      if (annChannel) {
        supabase?.removeChannel(annChannel);
      }
    };
  }, []);

  // Realtime subscription for live_streams to update live state
  useEffect(() => {
    let streamChannel: any = null;
    let pollsChannel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        streamChannel = supabase
          .channel('live_streams_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'live_streams'
            },
            (payload: any) => {
              console.log('[LIVE STREAM REALTIME EVENT]', payload.eventType, payload.new, payload.old);
              if (payload.eventType === 'DELETE') {
                const deletedId = payload.old?.id;
                if (deletedId) {
                  setLiveStreams(prev => prev.filter(s => s.id !== deletedId));
                }
              } else if (payload.eventType === 'INSERT') {
                const s = payload.new;
                const vId = extractYoutubeId(s.youtube_url || '');
                const cachedViewers = vId ? localStorage.getItem(`mvp_stream_viewers_${vId}`) : null;
                const mappedStream: LiveStream = {
                  id: s.id,
                  title: s.stream_title || s.title || '',
                  youtube_url: s.youtube_url || '',
                  thumbnail_url: getYoutubeThumbnail(s.youtube_url || ''),
                  viewers_count: formatStreamViewers(cachedViewers || s.viewers_count),
                  is_active: true,
                  created_at: s.created_at || new Date().toISOString()
                };
                setLiveStreams(prev => [mappedStream, ...prev.filter(x => x.id !== mappedStream.id)]);
              } else if (payload.eventType === 'UPDATE') {
                const s = payload.new;
                const vId = extractYoutubeId(s.youtube_url || '');
                const cachedViewers = vId ? localStorage.getItem(`mvp_stream_viewers_${vId}`) : null;
                const mappedStream: LiveStream = {
                  id: s.id,
                  title: s.stream_title || s.title || '',
                  youtube_url: s.youtube_url || '',
                  thumbnail_url: getYoutubeThumbnail(s.youtube_url || ''),
                  viewers_count: formatStreamViewers(cachedViewers || s.viewers_count),
                  is_active: true,
                  created_at: s.created_at || new Date().toISOString()
                };
                setLiveStreams(prev => prev.map(x => x.id === s.id ? mappedStream : x));
              }
              // Force background sync bypass throttle
              refreshData(false, true);
            }
          )
          .subscribe();

        pollsChannel = supabase
          .channel('polls_realtime')
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'polls'
            },
            (payload) => {
              const deletedId = payload.old?.id;
              if (deletedId) {
                setPolls(prev => prev.filter(p => p.id !== deletedId));
                setAdminPolls(prev => prev.filter(p => p.id !== deletedId));
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Realtime streams/polls sub error:', err);
      }
    }
    return () => {
      if (streamChannel) {
        supabase?.removeChannel(streamChannel);
      }
      if (pollsChannel) {
        supabase?.removeChannel(pollsChannel);
      }
    };
  }, []);

  // Realtime subscription for matches and slot_bookings
  useEffect(() => {
    let matchesChannel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        matchesChannel = supabase
          .channel('matches_and_slots_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'matches'
            },
            () => {
              debouncedRefreshData(false);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'slot_bookings'
            },
            () => {
              if (userProfile?.id) {
                fetchUserBookings(userProfile.id);
              }
              debouncedRefreshData(false);
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Realtime matches/slots sub error:', err);
      }
    }
    return () => {
      if (matchesChannel) {
        supabase?.removeChannel(matchesChannel);
      }
    };
  }, []);

  // Real-time Ban & Deletion Monitor
  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') {
      const checkStatus = async () => {
        // 1. Check Ban
        const banCheck = await checkBanStatus(userProfile.id, userProfile.username);
        if (banCheck.isBanned) {
          handleLogout();
          const remaining = banCheck.banRecord?.expires_at
            ? formatRemainingBanTime(banCheck.banRecord.expires_at)
            : null;
          const msg = remaining
            ? `You are banned. Try again after ${remaining}.`
            : `Your account has been permanently banned by Admin. (Reason: ${banCheck.banRecord?.reason || 'Banned by Admin'}).`;
          alert(`🚫 BAN ALERT: ${msg}`);
          return;
        }

        // 2. Check if Account still exists (in case of deletion)
        if (isSupabaseConfigured() && supabase) {
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('id, is_banned, ban_expires_at, ban_reason')
              .eq('id', userProfile.id)
              .maybeSingle();
            
            if (!data && !error) {
              handleLogout();
              alert("Your account has been permanently deleted as requested.");
              return;
            }

            if (data && data.is_banned) {
              let isExpired = false;
              if (data.ban_expires_at) {
                isExpired = Date.now() > new Date(data.ban_expires_at).getTime();
              }
              if (!isExpired) {
                handleLogout();
                const reason = data.ban_reason || 'No reason provided';
                const expiry = data.ban_expires_at ? new Date(data.ban_expires_at).toLocaleString() : 'Permanent';
                alert(`🚫 BAN ALERT: Your account has been banned by Admin. Reason: ${reason}. Expiry: ${expiry}`);
                return;
              }
            }
          } catch (err) {
            console.error('Error checking user existence:', err);
          }
        } else {
          const allProfs = getAllProfiles();
          const stillExists = allProfs.find(p => p.id === userProfile.id);
          if (!stillExists) {
            handleLogout();
            alert("Your account has been permanently deleted as requested.");
            return;
          }
        }
  
        // 3. Check for Rejection Alert
        const requests = await getDeletionRequests();
        const rejected = requests.find(r => r.user_id === userProfile.id && r.status === 'rejected');
        if (rejected) {
          alert("🚫 NOTICE: Admin has rejected your account deletion request.");
          // Clear the rejected request from Supabase and local storage
          await deleteDeletionRequest(rejected.id);
        }
      };

      checkStatus();
      updateUserPresence(userProfile.id);
// First-open: push permission auto
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        'serviceWorker' in navigator &&
Notification.permission === 'default'
      ) {
        const askPush = async () => {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js');
await navigator.serviceWorker.ready;
const permission = await Notification.requestPermission();
if (permission !== 'granted') return;
localStorage.setItem('mvp_push_prompted', '1');
            const PUBLIC_VAPID_KEY =
              'BNV-wpFWCVbRfyTYJi-1Q3Iq5OL6zYahjmzVy5O89Ogd1ga739ng' +
              '8RC2nHeoTb3u4L0r3YPULxUOUuab9nMfdHM';

            const padding = '='.repeat((4 - (PUBLIC_VAPID_KEY.length % 4)) % 4);
            const base64 = (PUBLIC_VAPID_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const applicationServerKey = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              applicationServerKey[i] = rawData.charCodeAt(i);
            }

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
              });
            }

            const subJson = subscription.toJSON();
            if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth && supabase) {
              await supabase.from('push_subscriptions').upsert(
                {
                  user_id: userProfile.id,
                  endpoint: subJson.endpoint,
                  p256dh: subJson.keys.p256dh,
                  auth: subJson.keys.auth,
                },
                { onConflict: 'user_id' }
              );
            }
          } catch (e) {
            console.warn('Auto push prompt error:', e);
          }
        };
        setTimeout(askPush, 2500);
      }
      const presenceTimer = setInterval(() => {
        updateUserPresence(userProfile.id);
      }, 25000);
// Realtime Presence — Admin hub Online Now
      let onlineChannel: any = null;
      if (isSupabaseConfigured() && supabase) {
        try {
          onlineChannel = supabase.channel('online-users', {
            config: { presence: { key: userProfile.id } },
          });
          onlineChannel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              await onlineChannel.track({
                user_id: userProfile.id,
                id: userProfile.id,
                username: userProfile.username,
                name: userProfile.name,
                online_at: new Date().toISOString(),
              });
            }
          });
        } catch (err) {
          console.warn('Online presence track error:', err);
        }
      }
      // Realtime subscription for this user's profile row
      let profileChannel: any = null;
      if (isSupabaseConfigured() && supabase) {
        try {
          profileChannel = supabase
            .channel(`profile_realtime:${userProfile.id}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userProfile.id}`
              },
              (payload) => {
                if (payload.eventType === 'DELETE') {
                  handleLogout();
                  alert("🚫 Your account has been permanently deleted as requested.");
                  return;
                }
                const updatedProf = payload.new as any;
                if (updatedProf) {
                  if (updatedProf.is_banned) {
                    let isExpired = false;
                    if (updatedProf.ban_expires_at) {
                      isExpired = Date.now() > new Date(updatedProf.ban_expires_at).getTime();
                    }
                    if (!isExpired) {
                      handleLogout();
                      const reason = updatedProf.ban_reason || 'No reason provided';
                      const expiry = updatedProf.ban_expires_at ? new Date(updatedProf.ban_expires_at).toLocaleString() : 'Permanent';
                      alert(`🚫 BAN ALERT: Your account has been banned by Admin. Reason: ${reason}. Expiry: ${expiry}`);
                    }
                  } else {
                    // Sync profile live in state
                    setUserProfile(prev => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        wallet_balance: Number(updatedProf.wallet_balance) ?? prev.wallet_balance,
                        role: updatedProf.role ?? prev.role,
                        total_matches: Number(updatedProf.total_matches) ?? prev.total_matches,
                        total_wins: Number(updatedProf.total_wins) ?? prev.total_wins,
                        total_kills: Number(updatedProf.total_kills) ?? prev.total_kills,
                        is_banned: updatedProf.is_banned ?? prev.is_banned,
                        ban_expires_at: updatedProf.ban_expires_at ?? prev.ban_expires_at,
                      };
                    });
                  }
                }
              }
            )
            .subscribe();
        } catch (err) {
          console.error('Realtime profile monitoring sub error:', err);
        }
      }

      window.addEventListener('storage', checkStatus);
      return () => {
        window.removeEventListener('storage', checkStatus);
        clearInterval(presenceTimer);
        if (onlineChannel) {
          supabase?.removeChannel(onlineChannel);
        }
        if (profileChannel) {
          supabase?.removeChannel(profileChannel);
        }
      };
    }
  }, [userProfile]);

  // Match countdown (30 mins left) monitor
  useEffect(() => {
    if (matches && matches.length > 0) {
      const checkCountdown = async () => {
        try {
          const storedAlertsRaw = localStorage.getItem('sent_alerts_30m');
          const sentAlerts: string[] = storedAlertsRaw ? JSON.parse(storedAlertsRaw) : [];
          let updated = false;

          for (const match of matches) {
            if (match.status === 'completed') continue;
            if (sentAlerts.includes(match.id)) continue;

            // Compute time diff
            const diffMs = match.timestamp - Date.now();
            const diffMins = diffMs / (1000 * 60);

            // If match starts in <= 30 minutes, and starts in > 0 mins
            if (diffMins <= 30 && diffMins > 0) {
              sentAlerts.push(match.id);
              updated = true;

              if (userProfile?.id) {
                const isBooked = bookings.some(b => b.match_id === match.id && b.user_id === userProfile.id);
                if (isBooked) {
                  await createNotification({
                    user_id: userProfile.id,
                    title: "Match Starts in 30 Min",
                    message: `⏰ 30 Minutes Left! Get ready for ${match.title}. Your room credentials will be visible on your match card.`,
                    is_read: false,
                    type: 'match_credentials',
                    match_id: match.id
                  });
                }
              }
            }
          }

          if (updated) {
            localStorage.setItem('sent_alerts_30m', JSON.stringify(sentAlerts));
          }
        } catch (err) {
          console.warn('Error in countdown monitor:', err);
        }
      };

      // Run check on mount/update and then every 30 seconds
      checkCountdown();
      const timer = setInterval(checkCountdown, 30000);
      return () => clearInterval(timer);
    }
  }, [matches, bookings, userProfile]);

  const fetchProfile = async (userId: string, userEmail?: string, userMetadata?: any) => {
    if (isSupabaseConfigured() && supabase) {
      try {
        const {   data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

        if (error) {
          console.warn("Error querying public.profiles:", error.message);
          return null;
        }

        if (data) {
          const isAdmin = Boolean(data.is_admin === true);

          const prof: UserProfile = {
            id: data.id,
            email: userEmail || userMetadata?.email || '',
            username: data.username || userMetadata?.username || (userEmail ? userEmail.split('@')[0] : ''),
            name: data.name || userMetadata?.full_name || userMetadata?.name || data.username || '',
            pubg_id_name: data.pubg_name || userMetadata?.pubg_id_name || '',
            pubg_id_number: data.pubg_id || userMetadata?.pubg_id_number || '',
            avatar_url: data.avatar_url || null,
            wallet_balance: Number(data.wallet_balance ?? 0),
            role: isAdmin ? 'admin' : 'player',
            is_admin: isAdmin,
            total_matches: data.matches_played || data.total_matches || 0,
            total_wins: data.total_wins || 0,
            total_kills: data.total_kills || 0,
            total_losses: data.total_losses || 0,
            matches_lost: data.matches_lost || 0,
            is_banned: data.is_banned || false,
            ban_expires_at: data.banned_until || null,
            ban_reason: data.ban_reason || null,
            created_at: data.created_at || new Date().toISOString()
          };

          return prof;
        } else {
          console.warn(`No profile record found in public.profiles for user ID: ${userId}`);
          return null;
        }
      } catch (err) {
        console.warn("Failed tLogging into Arenao load profile from database:", err);
        return null;
      }
    }
    return null;
  };

  // Auth Handlers
  const handleSignUp = async (formData: {
    email: string;
    pass: string;
    name: string;
    username: string;
    pubgName: string;
    pubgId: string;
  }) => {
    return executeTask('auth_signup', async () => {
      setLoading(true);
      setAuthError(null);

      const trimmedEmail = formData.email.trim();
      const isAhmadAdmin = false; // Only the real admin ID from Supabase Auth gets admin privileges

      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
          setAuthError("Please enter a valid email address.");
          return;
        }

        if (!isSupabaseConfigured() || !supabase) {
          setAuthError("Supabase is not configured. Please connect Supabase to sign up.");
          return;
        }

        const normalizeUsername = (u: string) => u.replace(/\s+/g, '').toLowerCase().trim();

        const rawUsername = formData.username || '';
        const desiredUsername = rawUsername.trim();

        // 1. No spaces allowed in username
        if (/\s/.test(desiredUsername)) {
          setAuthError("Don't use spaces in username. Write it as one word (example: Ahmadkhan).");
          return;
        }

        const normalizedDesired = normalizeUsername(desiredUsername);

        if (!normalizedDesired || normalizedDesired.length < 3) {
          setAuthError("Username must be at least 3 characters long.");
          return;
        }

        // 2. Only block exact reserved names (Ahmad2, Ahmadkhan, ahmadyt will be ALLOWED)
        const reservedUsernames = ['ahmad', 'ahamd', 'admin', 'administrator', 'mvp', 'owner', 'support'];

        if (reservedUsernames.includes(normalizedDesired)) {
          setAuthError("This username is reserved and cannot be used. Please choose a different username.");
          return;
        }

        // 3. Check existing profiles (if this fails, still continue - database unique index will protect)
        const { data: allProfiles, error: checkError } = await supabase
          .from('profiles')
          .select('id, username');

        if (!checkError && allProfiles) {
          const isTaken = allProfiles.some((p: any) => {
            if (!p.username) return false;
            return normalizeUsername(p.username) === normalizedDesired;
          });

          if (isTaken) {
            setAuthError("This username is already taken. Please choose a different username.");
            return;
          }
        }

        // 1. SignUp with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: formData.pass,
          options: {
            data: {
              full_name: formData.name.trim(),
              username: desiredUsername,
              pubg_id_name: formData.pubgName.trim(),
              pubg_id_number: formData.pubgId.trim()
            }
          }
        });

        if (error) {
          setAuthError(error.message);
          return;
        }

        if (data.user) {
          const userId = data.user.id;
          const userEmail = data.user.email || trimmedEmail;

          let activeSession = data.session;
          if (!activeSession) {
            const loginRes = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password: formData.pass
            });
            if (loginRes.data?.session) {
              activeSession = loginRes.data.session;
            }
          }

          if (activeSession) {
            await supabase.auth.setSession(activeSession);
          }

          const profilePayload = {
            id: userId,
            username: desiredUsername,
            name: formData.name.trim(),
            pubg_name: formData.pubgName.trim(),
            pubg_id: formData.pubgId.trim(),
            avatar_url: null,
            wallet_balance: 0,
            total_kills: 0,
            matches_played: 0,
            total_wins: 0,
            total_losses: 0,
            matches_lost: 0,
            is_admin: false,
            is_banned: false,
            is_new: true
          };

          const { error: profileError } = await supabase
            .from('profiles')
            .upsert([profilePayload], { onConflict: 'id' });

          if (profileError) {
            setAuthError("Account created in Auth, but profile setup failed: " + profileError.message);
            return;
          }

          const prof = await fetchProfile(userId, userEmail, data.user.user_metadata);
          if (!prof || prof.id !== userId) {
            setAuthError("Account created, but profile record could not be verified in public.profiles.");
            return;
          }

          // 3) NEW REGISTER WELCOME (private — ONCE only on signup)
          createNotification({
            user_id: userId,
            title: 'Welcome to MVP ESPORTS PAKISTAN',
            message: 'Welcome to MVP ESPORTS PAKISTAN — are you a legend? Play and win rewards!',
            type: 'general',
            is_read: false
          }).catch(err => console.warn('Error creating new register welcome notification:', err));

          if (activeSession) {
            setUserProfile(prof);
            setSession(activeSession);
            resetUiStatesToHome();
            showToast('Account created successfully! Welcome to the Arena.');
            return;
          } else {
            showToast('Account created! A confirmation email has been sent. Please confirm your email before logging in.');
            setAuthMode('login');
            return;
          }
        }

        showToast('Account created! Please check your email to verify if required, or login now.');
        setAuthMode('login');
      } catch (err: any) {
        setAuthError(err?.message || "Signup failed");
      } finally {
        setLoading(false);
      }
    }, { isGlobal: true, globalMessage: 'Creating your Esports account...' });
  };

  const handleLogin = async (email: string, pass: string) => {
    return executeTask('auth_login', async () => {
      setLoading(true);
      setAuthError(null);

      const trimmedEmail = email.trim();

      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
        if (!trimmedEmail || !emailRegex) {
          setAuthError("Please enter a valid email address.");
          return;
        }

        if (!isSupabaseConfigured() || !supabase) {
          setAuthError("Supabase is not configured. Please connect Supabase to login.");
          return;
        }

        // Login only works for a real existing Supabase Auth account using signInWithPassword
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: pass
        });

        if (error) {
          const errMsg = "Invalid email or password";
          setAuthError(errMsg);
          throw new Error(errMsg);
        }

        if (!data.user) {
          const errMsg = "Invalid email or password";
          setAuthError(errMsg);
          throw new Error(errMsg);
        }

        const prof = await fetchProfile(data.user.id, data.user.email, data.user.user_metadata);
        if (prof) {
          // Check if player is banned in Supabase profiles or bans table
          const banCheck = await checkBanStatus(prof.id, prof.username);
          if (banCheck.isBanned || prof.is_banned) {
            await supabase.auth.signOut().catch(() => {});
            setUserProfile(null);
            setSession(null);
            setBookings([]);
            setTransactions([]);
            setSelectedMatch(null);
            setIsWalletOpen(false);
            setIsAdminOpen(false);
            setIsSupportOpen(false);
            setIsAnnouncementsOpen(false);
            setIsWatchStreamsOpen(false);
            setIsEditProfileOpen(false);
            setIsFriendsHubOpen(false);
            setIsAdminUnlocked(false);
            setActiveBottomTab('home');
            setCurrentScreen('auth');
            setAuthMode('login');

            const remaining = banCheck.banRecord?.expires_at
              ? formatRemainingBanTime(banCheck.banRecord.expires_at)
              : (prof.ban_expires_at ? formatRemainingBanTime(prof.ban_expires_at) : null);

            let banMsg = '';
            if (remaining && remaining !== 'Expired') {
              banMsg = `You are banned by Admin. Try again after ${remaining}.`;
            } else if (banCheck.banRecord?.reason || prof.ban_reason) {
              banMsg = `You are banned. Reason: ${banCheck.banRecord?.reason || prof.ban_reason}.`;
            } else {
              banMsg = `You are banned by Admin. Access is restricted.`;
            }

            setAuthError(banMsg);
            return;
          }

          setUserProfile(prof);
          if (data.session) setSession(data.session);
          await fetchUserBookings(prof.id);
          resetUiStatesToHome();

          if (prof.is_admin === true) {
            showToast('Welcome back, Admin!');
          } else {
            showToast('Login successful!');
          }
        } else {
          await supabase.auth.signOut().catch(() => {});
          const pErr = "Profile not found for this account. Please register an account first.";
          setAuthError(pErr);
          throw new Error(pErr);
        }
      } catch (err: any) {
        if (!authError) {
          setAuthError(err?.message || "Invalid email or password");
        }
        throw err;
      } finally {
        setLoading(false);
      }
    }, { isGlobal: true, globalMessage: 'Logging into Arena...' });
  };

const handleOpenAdmin = () => {
    const isAdmin = Boolean(userProfile?.is_admin === true);
    if (!isAdmin) {
      showToast('Access Denied: Only administrators can access the admin panel.');
      return;
    }
    setCurrentScreen('admin_login');
  };

  function handleLogout() {
    setIsAdminUnlocked(false);
    setSelectedMatch(null);
    setIsWalletOpen(false);
    setIsAdminOpen(false);
    setIsSupportOpen(false);
    setIsAnnouncementsOpen(false);
    setIsWatchStreamsOpen(false);
    setIsEditProfileOpen(false);
    setIsFriendsHubOpen(false);
    setActiveBottomTab('home');
    setSearchQuery('');
    setMatchTab('all');
    if (isSupabaseConfigured() && supabase) {
      supabase.auth.signOut().catch(err => console.warn("Supabase signout notice:", err));
    }
    try {
      const keepRead = localStorage.getItem('app_read_notifications');
      const keepHidden = localStorage.getItem('app_hidden_notifications');
      localStorage.clear();
      sessionStorage.clear();
      if (keepRead) localStorage.setItem('app_read_notifications', keepRead);
      if (keepHidden) localStorage.setItem('app_hidden_notifications', keepHidden);
    } catch (e) {
      console.warn("Storage clear notice:", e);
    }
    setUserProfile(null);
    setSession(null);
    setTransactions([]);
    setBookings([]);
    setCurrentScreen('auth');
    setAuthMode('login');
  };
  // Slot Booking Handler
  const handleBookSlot = async ({
    matchId,
    slotNumber,
    slotNumbers,
    teamName,
    playerIgn,
    playerUid,
    teammateUids,
    teammateProfileIds,
    entryFee
  }: {
    matchId: string;
    slotNumber: number;
    slotNumbers?: number[];
    teamName: string;
    playerIgn: string;
    playerUid: string;
    teammateUids: string[];
    teammateProfileIds?: string[];
    entryFee: number;
  }) => {
    if (!userProfile) return;

    const actualSlots = slotNumbers && slotNumbers.length > 0 ? slotNumbers : [slotNumber];
    const reqKey = `bk-${userProfile.id}-${matchId}-${actualSlots.join('_')}-${Math.floor(Date.now() / 3000)}`;

    return process_wallet_transaction_safeguard(reqKey, async () => {
      const bookingTimeStr = new Date().toISOString();

      if (isSupabaseConfigured() && supabase) {
        try {
          // Run independent reads in parallel with Promise.all
          const [existingRes, matchRes, profileRes] = await Promise.all([
            supabase
              .from('slot_bookings')
              .select('*')
              .eq('match_id', matchId)
              .or(`user_id.eq.${userProfile.id},player_id.eq.${userProfile.id}`),
            supabase
              .from('matches')
              .select('*')
              .eq('id', matchId)
              .maybeSingle(),
            supabase
              .from('profiles')
              .select('wallet_balance')
              .eq('id', userProfile.id)
              .maybeSingle()
          ]);

          if (existingRes.error) {
            throw new Error(`Failed to check existing bookings: ${existingRes.error.message}`);
          }

          const alreadyBookedDb = existingRes.data && existingRes.data.some(b => b.status === 'confirmed');
          if (alreadyBookedDb) {
            throw new Error("You have already booked a slot for this tournament. Multiple bookings are not allowed.");
          }

          if (matchRes.error || !matchRes.data) {
            throw new Error(`Failed to fetch match info: ${matchRes.error?.message || 'Match not found'}`);
          }
          const currentMatch = matchRes.data;

          // Check if any selected slot is in match.locked_slots
          const matchLockedSlots = Array.isArray(currentMatch.locked_slots) ? currentMatch.locked_slots : [];
          for (const sNum of actualSlots) {
            if (matchLockedSlots.includes(sNum)) {
              throw new Error(`Slot #${sNum} is locked by the administrator and cannot be booked.`);
            }
          }

          if (profileRes.error) {
            throw new Error(`Failed to verify wallet balance: ${profileRes.error.message}`);
          }

          const dbBalance = profileRes.data ? Number(profileRes.data.wallet_balance || 0) : 0;
          if (dbBalance < entryFee) {
            throw new Error(`Insufficient wallet balance! Your balance: Rs. ${dbBalance}, Entry Fee: Rs. ${entryFee}`);
          }

          const newBalanceDb = dbBalance - entryFee;

          // d) INSERT into slot_bookings with real teammate profile IDs
          const bookingsToInsert: SlotBooking[] = await Promise.all(actualSlots.map(async (sNum, index) => {
            const isPrimary = index === 0;
            const currentIgn = isPrimary ? playerIgn : (teammateUids[index - 1] || `Teammate ${index}`);

            let playerId = userProfile.id;
            if (!isPrimary) {
              if (teammateProfileIds && teammateProfileIds[index - 1]) {
                playerId = teammateProfileIds[index - 1];
              } else if (teammateUids && teammateUids[index - 1] && isSupabaseConfigured() && supabase) {
                // Fallback lookup by username if teammateProfileIds not passed
                const rawTerm = teammateUids[index - 1].trim();
                const { data: teamProf } = await supabase
                  .from('profiles')
                  .select('id')
                  .ilike('username', rawTerm)
                  .maybeSingle();
                if (teamProf?.id) {
                  playerId = teamProf.id;
                }
              }
            }

            return {
              id: crypto.randomUUID(),
              match_id: matchId,
              user_id: userProfile.id, // Main booker who paid
              player_id: playerId, // Teammate's real profile UUID so they can see booking in their account
              team_name: teamName,
              player_ign: currentIgn,
              player_uid: isPrimary ? playerUid : `uid-${sNum}`,
              slot_number: sNum,
              paid_amount: isPrimary ? entryFee : 0,
              status: 'confirmed' as const,
              booking_time: bookingTimeStr
            };
          }));

          const { error: bookingsErr } = await supabase.from('slot_bookings').insert(bookingsToInsert);
          if (bookingsErr) {
            throw new Error(`Slot booking registration failed: ${bookingsErr.message}`);
          }

          // e) Update profile wallet balance and match booked slots in parallel
          const currentBookedCount = Number(currentMatch.booked_slots || 0);
          const newBookedCount = currentBookedCount + actualSlots.length;

          const [profileUpdateRes, matchUpdateRes] = await Promise.all([
            supabase
              .from('profiles')
              .update({ wallet_balance: newBalanceDb })
              .eq('id', userProfile.id),
            supabase
              .from('matches')
              .update({ booked_slots: newBookedCount })
              .eq('id', matchId)
          ]);

          if (profileUpdateRes.error) {
            // Rollback/Cleanup of inserted bookings to prevent inconsistent states
            await supabase.from('slot_bookings').delete().eq('match_id', matchId).or(`user_id.eq.${userProfile.id},player_id.eq.${userProfile.id}`);
            throw new Error(`Wallet deduction failed: ${profileUpdateRes.error.message}. Slot booking rolled back.`);
          }

          // Record wallet transaction with error handling and fallback column safety
          const slotNumbersStr = actualSlots.map(s => `#${s}`).join(', ');
          const matchTitleStr = currentMatch.title || 'Match';
          const transactionNoteStr = `Slot booking - ${matchTitleStr} - Slots: ${slotNumbersStr}`;

          const newTxId = crypto.randomUUID();
          const newTxPayload = {
            id: newTxId,
            user_id: userProfile.id,
            amount: entryFee,
            type: 'match_entry' as const,
            status: 'approved' as const,
            username: userProfile.username || '',
            user_name: userProfile.name || userProfile.username || '',
            note: transactionNoteStr,
            payment_method: 'Wallet',
            created_at: bookingTimeStr
          };

          try {
            const { error: txErr } = await supabase.from('wallet_transactions').insert([newTxPayload]);
            if (txErr) {
              console.warn("Wallet transaction insert warning (retrying with core fields):", txErr.message);
              // Fallback column safety in case some optional columns don't exist in DB
              const essentialPayload = {
                id: newTxId,
                user_id: userProfile.id,
                amount: entryFee,
                type: 'match_entry' as const,
                status: 'approved' as const,
                created_at: bookingTimeStr
              };
              const { error: retryErr } = await supabase.from('wallet_transactions').insert([essentialPayload]);
              if (retryErr) {
                console.warn("Essential wallet_transactions insert error:", retryErr.message);
              }
            }
          } catch (txEx: any) {
            console.warn("wallet_transactions insert exception:", txEx);
          }

          setTransactions(prev => [{
            ...newTxPayload,
            player_id: userProfile.id,
            amount: Number(entryFee)
          }, ...prev]);

          try {
            createNotification({
              user_id: userProfile.id,
              title: "Slot Booked!",
              message: `🎟️ Slot Booked! You successfully booked a slot for ${currentMatch.title || 'Esports Match'}.`,
              is_read: false,
              type: 'match_credentials',
              match_id: matchId
            }).catch(err => console.warn('Error creating booking notification:', err));
          } catch (e) {}

          // 1) TEAM SLOT BOOKED (private — only teammates)
          if (currentMatch.squad_type !== 'solo' && currentMatch.type !== 'solo') {
            try {
              const teammateIdsToNotify = new Set<string>();

              // Add teammates from current booking payload
              bookingsToInsert.forEach(b => {
                if (b.player_id && b.player_id !== userProfile.id && typeof b.player_id === 'string' && b.player_id.length > 10) {
                  teammateIdsToNotify.add(b.player_id);
                }
              });

              // Add teammates from existing confirmed bookings in DB sharing the same team_name
              if (teamName && teamName.trim() && isSupabaseConfigured() && supabase) {
                const { data: existingTeamBookings } = await supabase
                  .from('slot_bookings')
                  .select('user_id, player_id, team_name')
                  .eq('match_id', matchId)
                  .eq('status', 'confirmed')
                  .ilike('team_name', teamName.trim());

                if (existingTeamBookings && existingTeamBookings.length > 0) {
                  existingTeamBookings.forEach(tb => {
                    if (tb.user_id && tb.user_id !== userProfile.id && typeof tb.user_id === 'string' && tb.user_id.length > 10) {
                      teammateIdsToNotify.add(tb.user_id);
                    }
                    if (tb.player_id && tb.player_id !== userProfile.id && typeof tb.player_id === 'string' && tb.player_id.length > 10) {
                      teammateIdsToNotify.add(tb.player_id);
                    }
                  });
                }
              }

              const bookerUsername = userProfile.username || userProfile.name || 'Teammate';
              teammateIdsToNotify.forEach(tId => {
                createNotification({
                  user_id: tId,
                  title: 'Team Slot Booked',
               message: `@${bookerUsername} booked a slot for your team. Check the match — team is getting ready.`,
                  type: 'slot_booking',
                  is_read: false,
                  match_id: matchId
                }).catch(err => console.warn('Error creating teammate notification:', err));
              });
            } catch (teamNotifErr) {
              console.warn('Team notification exception:', teamNotifErr);
            }
          }

          // Immediately update local state so UI reacts instantly
          setBookings(prev => [...prev, ...bookingsToInsert]);
          updateBookingsCache([...bookings, ...bookingsToInsert]);
          setMatches(prev => prev.map(m => m.id === matchId ? { ...m, booked_slots: newBookedCount } : m));
          setUserProfile(prev => prev ? { ...prev, wallet_balance: newBalanceDb } : null);

        } catch (err: any) {
          alert(err.message || "An unexpected booking error occurred.");
          throw err;
        }
      } else {
        alert("Database connection is not available. Please try again.");
        return;
      }

      // Background light refresh (non-blocking)
      refreshData(false, false).catch(err => console.warn('Background refresh notice:', err));
      showToast(`Slot(s) #${actualSlots.join(', #')} successfully booked for ${teamName}!`);
    });
  };

  // Deposit & Withdrawal Handlers
  const handleSubmitDeposit = async (
    method: 'JazzCash' | 'EasyPaisa',
    amount: number,
    trxId: string,
    senderName: string,
    screenshotUrl?: string
  ) => {
    console.log("Deposit function started");

    const currentUserId = userProfile?.id;
    if (!currentUserId) {
      alert("Please login first");
      throw new Error("Please login first");
    }

    const amt = parseAmount(amount);
    if (amt === null || amt < 100 || amt > 100000) {
      const msg = amt === null ? "Invalid deposit amount" : amt < 100 ? "Minimum amount is 100" : "Maximum amount is 100000";
      showToast(msg, "error");
      throw new Error(msg);
    }

    const cleanTrx = (trxId || '').trim();
    if (!screenshotUrl || !screenshotUrl.trim()) {
      showToast("Upload first payment screenshot for payment proof", "error");
      throw new Error("Upload first payment screenshot for payment proof");
    }
    const reqKey = `dep-${currentUserId}-${amount}-${cleanTrx}`;

    return process_wallet_transaction_safeguard(reqKey, async () => {
      try {
        if (!supabase) {
          throw new Error("Database connection is not active.");
        }

        let finalScreenshotUrl: string | null = null;
        if (screenshotUrl && screenshotUrl.trim()) {
          try {
            finalScreenshotUrl = await uploadScreenshotToSupabase(screenshotUrl, 'deposit-screenshots');
          } catch (uploadErr) {
            console.warn('Screenshot upload warning:', uploadErr);
            finalScreenshotUrl = screenshotUrl;
          }
        }

        // 2. Insert into deposit_requests exactly as specified
        await insertDepositRequestToSupabase({
            player_id: currentUserId,
            username: userProfile.username,
            amount: Number(amount),
            payment_method: method,
            sender_name: (senderName || '').trim(),
            trx_id: cleanTrx,
            screenshot_url: finalScreenshotUrl || null,
            status: 'pending'
        });

        console.log("[Deposit Request] Inserted into deposit_requests successfully");

        // Trigger notification
        try {
          await createNotification({
            user_id: currentUserId,
            title: "Deposit Request Submitted",
            message: `💰 Deposit Request Submitted! Your deposit request of Rs. ${amount} has been sent for admin verification.`,
            is_read: false,
            type: 'deposit'
          });
        } catch (notifErr) {
          console.warn('Notification create warning:', notifErr);
        }

        try {
          await refreshData();
        } catch (refErr) {
          console.warn('refreshData warning after deposit:', refErr);
        }

        showToast(`Deposit request of RS. ${amount} via ${method} submitted for review!`);
      } catch (outerErr: any) {
        console.error("Error in handleSubmitDeposit:", outerErr);
        showToast(`Deposit failed: ${outerErr?.message || 'Network error. Please try again.'}`, 'error');
        throw outerErr;
      }
    });
  };

  const handleSubmitWithdrawal = async (
    method: 'JazzCash' | 'EasyPaisa' | 'SadaPay' | 'NayaPay',
    amount: number,
    accountNumber: string,
    accountTitle: string,
    screenshotUrl?: string
  ) => {
    if (!userProfile) return;

    const amt = parseAmount(amount);
    if (amt === null || amt < 100 || amt > 100000) {
      const msg = amt === null ? "Invalid withdrawal amount" : amt < 100 ? "Minimum amount is 100" : "Maximum amount is 100000";
      showToast(msg, "error");
      throw new Error(msg);
    }

    const reqKey = `wd-${userProfile.id}-${amount}-${accountNumber}-${Math.floor(Date.now() / 3000)}`;

    return process_wallet_transaction_safeguard(reqKey, async () => {
      let finalScreenshotUrl = screenshotUrl;
      if (screenshotUrl) {
        finalScreenshotUrl = await uploadScreenshotToSupabase(screenshotUrl, 'deposit-screenshots');
      }

      // 1. Ensure user_id strictly matches current authenticated Supabase user ID
      let currentUserId = userProfile.id;
      if (isSupabaseConfigured() && supabase) {
        try {
          const authRes = await supabase.auth.getUser();
          if (authRes.data?.user?.id) {
            currentUserId = authRes.data.user.id;
          }
        } catch (e) {
          console.warn("[Withdrawal] Auth user check warning:", e);
        }
      }

      console.log("[Withdrawal] Using user_id for Supabase operations:", currentUserId);

      // Prepare Transaction Record
      const newTx: WalletTransaction = {
        id: crypto.randomUUID(),
        user_id: currentUserId,
        user_email: userProfile.email,
        user_name: userProfile.name,
        username: userProfile.username,
        amount,
        type: 'withdrawal',
        payment_method: method,
        account_number: accountNumber,
        account_title: accountTitle,
        screenshot_url: finalScreenshotUrl,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      // 2. Perform Supabase Operations FIRST
      if (isSupabaseConfigured() && supabase) {
          // Insert into withdrawal_requests
          try {
            await insertWithdrawalRequestToSupabase({
              ...newTx,
              player_id: currentUserId,
              username: userProfile.username || ''
            });
          } catch (insertErr: any) {
              showToast("Withdrawal insert failed: " + (insertErr.message || "Unknown error"), "error");
              throw new Error("Withdrawal insert failed: " + insertErr.message);
          }

          // Insert into wallet_transactions
          const walletTxPayload = {
            id: newTx.id,
            user_id: currentUserId,
            amount,
            type: 'withdrawal',
            payment_method: method,
            account_number: accountNumber,
            account_title: accountTitle,
            screenshot_url: finalScreenshotUrl || null,
            status: 'pending',
            created_at: newTx.created_at
          };

          console.log("[Supabase wallet_transactions Insert Payload]:", walletTxPayload);

          try {
            const { error } = await supabase.from('wallet_transactions').insert([walletTxPayload]);
            if (error) {
              console.warn("[wallet_transactions insert warning]:", error);
            }
          } catch (e: any) {
            console.warn("[wallet_transactions insert exception]:", e);
          }
      }

      // 3. Deduct balance ONLY if inserts successful
      const newBalance = userProfile.wallet_balance - amount;
      const updatedProf = { ...userProfile, wallet_balance: newBalance };
      
      if (isSupabaseConfigured() && supabase) {
        await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', userProfile.id);
      }
      
      setUserProfile(updatedProf);

      await createNotification({
        user_id: userProfile.id,
        title: "Withdrawal Request Submitted",
        message: `💸 Withdrawal Request Submitted! Your withdrawal request of Rs. ${amount} has been submitted for admin verification.`,
        is_read: false,
        type: 'withdrawal'
      });

      refreshData();
      showToast(`Withdrawal request of RS. ${amount} via ${method} submitted!`);
    });
  };

  // Admin Handlers
  const handleCreateMatch = async (newMatchData: Partial<Match>) => {
    const allowedMatchFields = [
      'id',
      'title',
      'type',
      'map',
      'match_time',
      'timestamp',
      'entry_fee',
      'prizes',
      'max_slots',
      'booked_slots',
      'room_id',
      'room_password',
      'status',
      'rules',
      'banner_url',
      'squad_type',
      'version',
      'maps',
      'room_credentials',
      'locked_slots',
      'map_banners',
      'map_max_slots',
      'registration_opens_at',
      'created_at',
      'start_timestamp',
      'is_ended',
      'start_time',
      'gap_minutes'
    ];

    const newMatchRaw: Record<string, any> = {
      id: 'm-' + Date.now(),
      title: (newMatchData.title || 'NEW CASH MATCH').trim(),
      type: newMatchData.type || 'squad',
      map: newMatchData.map || 'Erangel',
      match_time: newMatchData.match_time || 'Today | 09:00 PM',
      timestamp: newMatchData.timestamp || (Date.now() + 86400000),
      entry_fee: Number(newMatchData.entry_fee) || 100,
      prizes: newMatchData.prizes || { first_prize: 2000, per_kill_prize: 50, total_pool: 5000 },
      max_slots: Number(newMatchData.max_slots) || 100,
      booked_slots: 0,
      status: 'upcoming',
      squad_type: newMatchData.squad_type || 'SQUAD',
      version: 'PUBG Mobile 3.5',
      banner_url: newMatchData.banner_url || null,
      maps: newMatchData.maps || (newMatchData.type === 'tournament' ? ['Erangel', 'Miramar', 'Rondo'] : null),
      map_banners: newMatchData.map_banners || null,
      map_max_slots: newMatchData.map_max_slots || null,
      locked_slots: newMatchData.locked_slots || null,
      gap_minutes: newMatchData.gap_minutes !== undefined ? Number(newMatchData.gap_minutes) : null,
      room_credentials: newMatchData.room_credentials || null,
      rules: newMatchData.rules || [
        'Mobile devices only (No Emulators).',
        'Room ID & password shared 15 mins before match start admin pov mag sakta ha es lie har player ko video recording karni parhy gi jo pov nhi dega osko reward nhi mely ga play fair , play hard , win big reward 💸.'
      ],
      registration_opens_at: newMatchData.registration_opens_at || null,
      start_timestamp: newMatchData.start_timestamp || null,
      is_ended: false,
      start_time: newMatchData.start_time || null
    };

    const cleanMatch = Object.fromEntries(
      Object.entries(newMatchRaw)
        .filter(([key, val]) => allowedMatchFields.includes(key) && val !== undefined)
    );

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('matches')
          .insert([cleanMatch])
          .select()
          .single();
        if (error) {
          console.error('Supabase matches INSERT error:', error);
          throw error;
        }
      } catch (err: any) {
        console.error('Failed to create match in Supabase:', err);
        alert(`Failed to create match in Supabase: ${err.message || JSON.stringify(err)}`);
        throw err;
      }
    } else {
      alert('Supabase is not connected.');
      throw new Error('Supabase is not connected.');
    }

    // Refresh immediately to pull matches from Supabase
    await refreshData(true, true);

    // Trigger global notification (sirf 1 baar)
    try {
      const matchType = String(newMatchRaw.type || '').toLowerCase();
      const isTournament = matchType === 'tournament';
      const mapLabel = String(newMatchRaw.map || 'Map');
      const squadLabel = String(newMatchRaw.squad_type || '').toUpperCase();

      const activityLabel = isTournament
        ? 'Tournament'
        : matchType === 'solo'
          ? 'Solo Match'
          : matchType === 'duo'
            ? 'Duo Match'
            : matchType === 'squad'
              ? 'Squad Match'
              : matchType === 'tdm'
                ? 'TDM Match'
                : matchType === 'wow'
                  ? 'WOW Match'
                  : 'Match';

      const formatDetails = isTournament
        ? `Map: ${mapLabel}${squadLabel ? ` • ${squadLabel}` : ''}`
        : `Map: ${mapLabel}${squadLabel ? ` • ${squadLabel}` : ''}`;

      await createNotification({
        user_id: null,
        title: isTournament
          ? 'New Tournament Available'
          : `New ${activityLabel} Available`,
        message: isTournament
          ? `New Tournament Available! "${newMatchRaw.title}" is now open for booking. ${formatDetails}.`
          : `${activityLabel} "${newMatchRaw.title}" is now open for booking. ${formatDetails}.`,
        is_read: false,
        type: 'announcement',
        match_id: newMatchRaw.id,
        image: newMatchRaw.banner_url || undefined
      });
    } catch (err) {
      console.warn('Error creating match notification:', err);
    }

    showToast(
      `${String(newMatchRaw.type || '').toLowerCase() === 'tournament' ? 'Tournament' : 'Match'} "${cleanMatch.title}" created successfully!`
    );
  };

  const handlePublishRoomDetails = async (
    matchId: string,
    roomId: string,
    roomPass: string,
    mapIndex: number = 0,
    releaseTimerMinutes: number = 0,
    roomCredentialsOverride?: RoomCredential[]
  ) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    let existingCreds: RoomCredential[] = [];
    let updatedRoomId = match.room_id || '';
    let updatedRoomPass = match.room_password || '';

    if (roomCredentialsOverride && roomCredentialsOverride.length > 0) {
      existingCreds = roomCredentialsOverride.map((c, idx) => {
        const timerMins = Number(c.release_timer_minutes || 0);
        let releaseTime = c.release_time_ms;
        if (c.room_id) {
          if (!releaseTime || timerMins > 0) {
            releaseTime = timerMins > 0 
              ? (c.release_time_ms && c.release_time_ms > Date.now() ? c.release_time_ms : Date.now() + timerMins * 60 * 1000) 
              : Date.now();
          }
        }
        return {
          map_index: idx,
          map_name: c.map_name || (match.maps?.[idx] || match.map),
          room_id: c.room_id || '',
          room_password: c.room_password || '',
          release_timer_minutes: timerMins,
          release_time_ms: c.room_id ? releaseTime : undefined
        };
      });

      // Find first valid room id to set as main match room_id
      const firstValid = existingCreds.find(c => c.room_id);
      if (firstValid) {
        updatedRoomId = firstValid.room_id || '';
        updatedRoomPass = firstValid.room_password || '';
      }
    } else {
      existingCreds = Array.isArray(match.room_credentials) ? [...match.room_credentials] : [];
      const mapsList = match.maps && match.maps.length > 0 
        ? match.maps 
        : match.type === 'tournament' ? ['Erangel', 'Miramar', 'Rondo'] : [match.map];

      const releaseTime = releaseTimerMinutes > 0 ? Date.now() + releaseTimerMinutes * 60 * 1000 : Date.now();

      existingCreds[mapIndex] = {
        map_index: mapIndex,
        map_name: mapsList[mapIndex] || match.map,
        room_id: roomId,
        room_password: roomPass,
        release_timer_minutes: releaseTimerMinutes,
        release_time_ms: releaseTime
      };

      if (mapIndex === 0) {
        updatedRoomId = roomId;
        updatedRoomPass = roomPass;
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('matches')
          .update({ 
            room_id: updatedRoomId, 
            room_password: updatedRoomPass,
            room_credentials: existingCreds,
            status: 'room_published'
          })
          .eq('id', matchId);

        if (error) throw error;
      } catch (err: any) {
        alert(`Failed to publish room details to Supabase: ${err.message || err}`);
        return;
      }
    } else {
      alert('Supabase is not connected.');
      return;
    }

    // Refresh matches from Supabase immediately
    await refreshData(true, true);

    // Create notifications for booked players only (both booker + actual player)
    try {
      let notifyUserIds: string[] = [];

      if (isSupabaseConfigured() && supabase) {
        const { data: matchBookings, error: bErr } = await supabase
          .from('slot_bookings')
          .select('user_id, player_id')
          .eq('match_id', matchId);

        if (bErr) {
          console.warn('Room notify: failed to load slot_bookings:', bErr);
        } else if (Array.isArray(matchBookings)) {
          matchBookings.forEach((b: any) => {
            if (b.user_id && typeof b.user_id === 'string' && b.user_id.length > 10) {
              notifyUserIds.push(b.user_id);
            }
            if (b.player_id && typeof b.player_id === 'string' && b.player_id.length > 10) {
              notifyUserIds.push(b.player_id);
            }
          });
        }
      }

      // Fallback to local state
      if (notifyUserIds.length === 0) {
        bookings
          .filter((b) => b.match_id === matchId)
          .forEach((b) => {
            if (b.user_id) notifyUserIds.push(b.user_id);
            if ((b as any).player_id) notifyUserIds.push((b as any).player_id);
          });
      }

      // Unique IDs only
      const uniqueUserIds = Array.from(new Set(notifyUserIds));

      const matchNo = (mapIndex || 0) + 1;
      const isTour = match.type === 'tournament';

      for (const userId of uniqueUserIds) {
        await createNotification({
          user_id: userId,
          title: isTour
            ? (match.title + ' — Match ' + matchNo + ' Room Ready')
            : 'Room ID & Password Released',
          message: isTour
            ? ('Room ID and password for "' + match.title + '" Match ' + matchNo + ' are ready. Open My Matches → View Slot.')
            : ('Room ID and password for "' + match.title + '" are ready. Check your match card.'),
          is_read: false,
          type: 'match_credentials',
          match_id: matchId,
        });
      }

      console.log(
        '[Room Credentials] Notifications sent to',
        uniqueUserIds.length,
        'players'
      );
    } catch (notifErr) {
      console.warn('Room credentials notification error:', notifErr);
    }

    showToast('Room Credentials Updated in Supabase & Dispatched!');
  };

  const handleEditMatch = async (updatedMatch: Match) => {
    const allowedMatchFields = [
      'id',
      'title',
      'type',
      'map',
      'match_time',
      'timestamp',
      'entry_fee',
      'prizes',
      'max_slots',
      'booked_slots',
      'room_id',
      'room_password',
      'status',
      'rules',
      'banner_url',
      'squad_type',
      'version',
      'maps',
      'room_credentials',
      'locked_slots',
      'map_banners',
      'map_max_slots',
      'registration_opens_at',
      'created_at',
      'start_timestamp',
      'is_ended',
      'start_time',
      'gap_minutes'
    ];

    if (isSupabaseConfigured() && supabase) {
      try {
        const cleanMatch = Object.fromEntries(
          Object.entries(updatedMatch).filter(([key, val]) => allowedMatchFields.includes(key) && val !== undefined)
        );
        const { error } = await supabase
          .from('matches')
          .upsert([cleanMatch]);
        if (error) {
          console.error('Failed to update match in Supabase:', error);
          alert(`Failed to update match in Supabase: ${error.message || JSON.stringify(error)}`);
          throw error;
        }
      } catch (err: any) {
        console.error('Exception in handleEditMatch:', err);
        alert(`Failed to update match: ${err?.message || err}`);
        throw err;
      }
    } else {
      console.error('Supabase is not configured or connected.');
      alert('Supabase is not connected.');
      throw new Error('Supabase is not connected.');
    }

    // Refresh matches & bookings from Supabase immediately!
    await refreshData(true, true);
    showToast(`Match "${updatedMatch.title}" details updated successfully!`);
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      alert('Failed to delete match: Supabase is not connected.');
      return;
    }

    try {
      // 1. Delete dependent slot_bookings first (ignore error if none)
      try {
        await supabase.from('slot_bookings').delete().eq('match_id', matchId);
      } catch (e) {
        console.warn('Ignore slot_bookings deletion error:', e);
      }

      // 2. Delete dependent match_results if any (wrap try/catch; if table missing ignore)
      try {
        await supabase.from('match_results').delete().eq('match_id', matchId);
      } catch (e) {
        console.warn('Ignore match_results deletion error:', e);
      }

      // 3. Delete match row from matches (if error, alert and return, do not throw uncaught)
      const { error: matchErr } = await supabase.from('matches').delete().eq('id', matchId);

      if (matchErr) {
        console.error('Failed to delete match from Supabase:', matchErr);
        alert(`Failed to delete match from Supabase: ${matchErr.message || JSON.stringify(matchErr)}`);
        return;
      }

      // Immediately update local UI state so match disappears instantly
      setMatches(prev => prev.filter(m => m.id !== matchId));

      // Alert exactly: "Match deleted successfully"
      alert('Match deleted successfully');

      // Optional soft refresh from Supabase in try/catch — if refresh fails, do NOT crash; list already updated locally
      try {
        await refreshData(true, true);
      } catch (refreshErr) {
        console.warn('Soft refresh failed but ignored safely:', refreshErr);
      }
    } catch (err: any) {
      console.error('Exception in handleDeleteMatch:', err);
      alert(`Failed to delete match: ${err?.message || err}`);
      // NEVER rethrow errors to the button onClick after user-facing alert
    }
  };

  const handleApproveTransaction = async (txId: string) => {
    startGlobalLoading('Approving Transaction...');
    try {
      return await process_wallet_transaction_safeguard(`approve-tx-${txId}`, async () => {
        let isWithdrawal = false;
        if (isSupabaseConfigured() && supabase) {
          const { data: wd } = await supabase.from('withdrawal_requests').select('id, status').eq('id', txId).maybeSingle();
          if (wd) isWithdrawal = true;
        }

        if (isWithdrawal) {
          // Approve withdrawal: balance remains already deducted, only mark status approved
          const res = await adminApproveWithdrawal(txId, userProfile?.id);
          if (!res.success) {
            if (res.message === "Already processed") {
              alert("Already processed");
              return;
            }
            throw new Error(res.message || "Approval failed");
          }
          await refreshData();
          showToast('✅ Withdrawal Approved & Confirmed!');
        } else {
          // Approve deposit: credit deposit amount once
          const res = await adminApproveDeposit(txId, userProfile?.id);
          if (!res.success) {
            if (res.message === "Already processed") {
              alert("Already processed");
              return;
            }
            throw new Error(res.message || "Approval failed: Player ID not found or balance update error");
          }
          await refreshData();
          showToast('✅ Deposit Approved & PKR Added!');
        }
      });
    } finally {
      stopGlobalLoading();
    }
  };

  const handleRejectTransaction = async (txId: string) => {
    startGlobalLoading('Rejecting Transaction...');
    try {
      return await process_wallet_transaction_safeguard(`reject-tx-${txId}`, async () => {
        let isWithdrawal = false;
        if (isSupabaseConfigured() && supabase) {
          const { data: wd } = await supabase.from('withdrawal_requests').select('id, status').eq('id', txId).maybeSingle();
          if (wd) isWithdrawal = true;
        }

        if (isWithdrawal) {
          // Reject withdrawal: refund held amount EXACTLY ONCE
          const res = await adminRejectWithdrawal(txId, userProfile?.id);
          if (!res.success) {
            if (res.message === "Already processed") {
              alert("Already processed");
              return;
            }
            throw new Error(res.message || "Rejection failed");
          }
          await refreshData();
          showToast('❌ Request Rejected & Refunded!');
        } else {
          // Reject deposit: do not add funds, mark rejected
          const res = await adminRejectDeposit(txId, userProfile?.id);
          if (!res.success) {
            if (res.message === "Already processed") {
              alert("Already processed");
              return;
            }
            throw new Error(res.message || "Rejection failed");
          }
          await refreshData();
          showToast('❌ Request Rejected!');
        }
      });
    } finally {
      stopGlobalLoading();
    }
  };

  const handleRefreshAnnouncements = async () => {
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching announcements:', error);
        showToast(`Error fetching announcements: ${error.message}`, 'error');
      }
      setAnnouncements(data || []);
    }
  };

  const handleSaveAnnouncement = async (annData: any) => {
    if (!isSupabaseConfigured() || !supabase) {
      showToast('Database connection unavailable', 'error');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    console.log('session?', !!session, session?.user?.id);
    if (!session) {
      showToast('Please login again as admin', 'error');
      return;
    }

    const title = (annData.title || '').trim();
    const content = (annData.content || '').trim();

    if (!title || !content) {
      showToast('Title and content are required', 'error');
      return;
    }

    const payload = {
      title,
      content
    };

    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Failed to create announcement in Supabase:', error);
        showToast(`Error publishing: ${error.message} (Code: ${error.code}) ${error.details || ''}`, 'error');
        return;
      }

      if (data) {
        setAnnouncements(prev => [data, ...prev.filter(a => a.id !== data.id)]);
        refreshData(false, true);

        createNotification({
          user_id: null,
          title: data.title || "Announcement",
          message: `📢 Global Update: ${data.content}`,
          is_read: false,
          type: 'announcement',
          announcement_id: data.id
        }).then(() => {
          window.dispatchEvent(new Event('notifications_changed'));
        }).catch(err => console.warn('createNotification exception:', err));

        showToast('Announcement Published and Synced Live!');
      }
    } catch (err: any) {
      console.error('Exception publishing announcement:', err);
      showToast(`Error: ${err?.message || 'Failed to publish announcement'}`, 'error');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!id) return;
    
    if (!isSupabaseConfigured() || !supabase) {
      showToast('Database connection unavailable', 'error');
      return;
    }

    console.log('[ANNOUNCEMENT DELETE] attempting', id);

    try {
      const { data, error } = await supabase.from('announcements').delete().eq('id', id).select();
      
      if (error) {
        console.error('[ANNOUNCEMENT DELETE] failed', {
          id,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        showToast(`Error deleting: ${error.message}`, 'error');
        return;
      }

      console.log('[ANNOUNCEMENT DELETE] success', id, 'data:', data);
      
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      refreshData(false, true);
      window.dispatchEvent(new Event('notifications_changed'));
      showToast('Successfully deleted announcement');
    } catch (err: any) {
      console.error('[ANNOUNCEMENT DELETE] exception', err);
      showToast(`Error: ${err?.message || 'Failed to delete announcement'}`, 'error');
    }
  };

  const handleCreatePoll = async (question: string, options: string[]) => {
    try {
      const newPoll = await createPoll(question, options, userProfile?.id);
      console.log(`Poll created successfully with id: ${newPoll.id}`);
      
      try {
        await createNotification({
          user_id: null,
          title: "New Public Poll",
          message: `🗳️ A new poll has been published: "${question}". Cast your vote now!`,
          is_read: false,
          type: 'announcement'
        });
      } catch (nErr) {
        console.warn('Failed to send poll notification:', nErr);
      }

      showToast('Poll published');
      // Reload polls list from Supabase
      refreshData(false, true);
    } catch (err: any) {
      showToast(`Error creating poll: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleDeactivatePoll = async (pollId: string) => {
    try {
      await deactivatePoll(pollId);
      setPolls(prev => prev.filter(p => p.id !== pollId));
      setAdminPolls(prev => prev.map(p => p.id === pollId ? { ...p, is_active: false } : p));
      showToast('Poll deactivated!');
    } catch (err: any) {
      showToast(`Error deactivating poll: ${err.message}`, 'error');
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    try {
      await deletePoll(pollId);
      setPolls(prev => prev.filter(p => p.id !== pollId));
      setAdminPolls(prev => prev.filter(p => p.id !== pollId));
      refreshData(false, true);
      showToast('Poll deleted!');
    } catch (err: any) {
      showToast(`Error deleting poll: ${err.message}`, 'error');
    }
  };

  const handleCastPollVote = async (pollId: string, optionId: string) => {
    if (!userProfile) {
      showToast('You must be logged in to vote.', 'error');
      return;
    }
    try {
      await castPollVote(pollId, optionId, userProfile.id);
      showToast('Vote submitted!');
      // Optimistically refresh polls or just do refreshData
      refreshData(false, true);
    } catch (err: any) {
      showToast(`Error voting: ${err.message}`, 'error');
    }
  };

  const handleSaveLiveStream = async (streamData: LiveStream) => {
    if (!isSupabaseConfigured() || !supabase) {
      showToast('Database connection unavailable', 'error');
      return;
    }

    const title = (streamData.title || '').trim();
    const url = (streamData.youtube_url || '').trim();
    if (!title || !url) {
      showToast('Title and URL are required', 'error');
      return;
    }

    // Validate YouTube URL
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      showToast('Invalid YouTube or YouTube Live URL', 'error');
      return;
    }

    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const payload = {
      stream_title: title,
      youtube_url: url
    };

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log("CURRENT SUPABASE USER:", {
        id: user?.id,
        email: user?.email,
        error
      });
    } catch (e) {
      console.error('[LIVE STREAM AUTH EXCEPTION]', e);
    }

    try {
      const { data, error } = await supabase
        .from('live_streams')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Failed to publish live stream to Supabase:', error);
        showToast(`Error publishing: ${error.message} (Code: ${error.code}) ${error.details || ''}`, 'error');
        return;
      }

      if (data) {
        const formattedViewers = formatStreamViewers(streamData.viewers_count);
        if (videoId && formattedViewers) {
          try {
            localStorage.setItem(`mvp_stream_viewers_${videoId}`, formattedViewers);
          } catch (e) {}
        }

        const mappedStream: LiveStream = {
          id: data.id,
          title: data.stream_title || data.title || title,
          youtube_url: data.youtube_url || url,
          thumbnail_url: getYoutubeThumbnail(data.youtube_url || url) || thumbUrl,
          viewers_count: formattedViewers,
          is_active: true,
          created_at: data.created_at || new Date().toISOString()
        };

        setLiveStreams(prev => [mappedStream, ...prev.filter(s => s.id !== mappedStream.id)]);
        
        createNotification({
          user_id: null,
          title: "Match is LIVE!",
          message: `🔴 Match is LIVE! Join the stream now to watch ${mappedStream.title}.`,
          is_read: false,
          type: 'announcement'
        }).catch(err => console.warn('Notification creation warning:', err));

        refreshData(false, true);
        showToast('Live Stream Published Successfully!');
      }
    } catch (err: any) {
      console.error('Exception publishing live stream:', err);
      showToast(`Error: ${err?.message || 'Failed to publish live stream'}`, 'error');
    }
  };

  const handleDeleteLiveStream = async (id: string) => {
    if (!id) return;

    if (!isSupabaseConfigured() || !supabase) {
      showToast('Database connection unavailable', 'error');
      return;
    }

    console.log('[LIVE STREAM DELETE] clicked', id);
    console.log('[LIVE STREAM DELETE] starting', id);

    try {
      const { data, error } = await supabase
        .from('live_streams')
        .delete()
        .eq('id', id)
        .select();

      console.log('[LIVE STREAM DELETE] result', {
        data,
        error
      });

      if (error) {
        console.error('[LIVE STREAM DELETE] failed', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        showToast(`Error deleting: ${error.message} (Code: ${error.code}) ${error.details || ''}`, 'error');
        return;
      }

      const deletedStream = liveStreams.find(s => s.id === id);
      if (deletedStream?.youtube_url) {
        const vId = extractYoutubeId(deletedStream.youtube_url);
        if (vId) {
          try {
            localStorage.removeItem(`mvp_stream_viewers_${vId}`);
          } catch (e) {}
        }
      }

      setLiveStreams(prev => prev.filter(s => s.id !== id));
      refreshData(false, true);
      showToast('Live Stream Deleted Successfully');
    } catch (err: any) {
      console.error('[LIVE STREAM DELETE] exception', err);
      showToast(`Error: ${err?.message || 'Failed to delete stream'}`, 'error');
    }
  };

  // Navigation helper to directly scroll and focus the Match Search section on Home Arena
  const handleNavigateToMatchSearch = () => {
    setActiveBottomTab('home');
    setMatchTab('all');
    setTimeout(() => {
      if (searchContainerRef.current) {
        searchContainerRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        const inputEl = searchContainerRef.current.querySelector('input');
        if (inputEl) {
          inputEl.focus();
        }
      }
    }, 120);
  };

  // Case-insensitive, multi-keyword and partial search matching function
  const doesMatchSearch = (m: Match, queryText: string): boolean => {
    if (!queryText || !queryText.trim()) return true;
    const cleanQuery = queryText.trim().toLowerCase();
    const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);

    const title = (m.title || '').toLowerCase();
    const type = (m.type || '').toLowerCase();
    const map = (m.map || '').toLowerCase();
    const squadType = (m.squad_type || '').toLowerCase();
    const mapsList = Array.isArray(m.maps) ? m.maps.join(' ').toLowerCase() : '';
    const version = (m.version || '').toLowerCase();
    const matchTime = (m.match_time || '').toLowerCase();
    const rulesText = Array.isArray(m.rules) ? m.rules.join(' ').toLowerCase() : typeof m.rules === 'string' ? String(m.rules).toLowerCase() : '';

    const searchableBlob = `${title} ${type} ${map} ${squadType} ${mapsList} ${version} ${matchTime} ${rulesText}`;

    return queryTokens.every((token) => searchableBlob.includes(token));
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const trimmedSearchQuery = deferredSearchQuery.trim();
  const isSearching = trimmedSearchQuery.length > 0;

  // Autocomplete suggestions generated directly from real Supabase matches
  const searchSuggestions = isSearching
    ? matches.filter((m) => doesMatchSearch(m, trimmedSearchQuery))
    : [];

  // Helper to determine if match has an active, running countdown in Coming Soon
  const isMatchInComingSoonWindow = (m: Match): boolean => {
    return getComingSoonMatchInfo(m, Date.now()) !== null;
  };

  const comingSoonCount = matches.filter(isMatchInComingSoonWindow).length;

  // Filtering matches:
  // When searching: search takes top priority across ALL categories
  // When search is empty: category filter tab takes effect
  const filteredMatches = matches.filter((m) => {
    if (isSearching) {
      return doesMatchSearch(m, trimmedSearchQuery);
    }
    // Only exclude matches whose delayed registration is still locked in the future
    const csInfo = getComingSoonMatchInfo(m, Date.now());
    if (csInfo && csInfo.isDelayedRegistration) {
      return false;
    }
    if (matchTab === 'all') return true;
    if (matchTab === 'tournament' || matchTab === 'tournaments') {
      return m.type?.toLowerCase() === 'tournament';
    }
    return m.type?.toLowerCase() === matchTab.toLowerCase();
  });

  // User's booked matches pair - strictly confirmed Supabase bookings for the logged in user
  const myBookedMatches = bookings
    .filter((b) => b.status === 'confirmed' || !b.status || (b.status as any) === '')
    .filter((b) => !userProfile?.id || String(b.user_id) === String(userProfile.id) || String(b.player_id) === String(userProfile.id))
    .map((b) => {
      const m = matches.find((m) => String(m.id) === String(b.match_id));
      return m ? { match: m, booking: b } : null;
    })
    .filter(Boolean) as { match: Match; booking: SlotBooking }[];

  const isDemo = !isSupabaseConfigured();

  const currentSelectedMatch = selectedMatch ? matches.find(m => m.id === selectedMatch.id) || selectedMatch : null;

  if (isAuthChecking) {
    return <MvpLoader message="Connecting to Arena..." fullScreen={true} />;
  }

  return (
<ErrorBoundary>
      <div 
        className="min-h-screen bg-[#030a16] text-white flex justify-center items-start font-sans select-none antialiased"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Mobile-first centered frame container */}
        <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl min-h-screen bg-gradient-to-b from-[#06182e] via-[#030a16] to-[#01050d] border-x border-[#00e5ff]/20 flex flex-col p-3 sm:p-4 md:p-6 relative shadow-2xl shadow-[#00e5ff]/10">
          
          {/* Toast Notification Alert */}
          {toast && (
            <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] font-black text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in slide-in-from-top duration-200 border ${
              toast.type === 'error'
                ? 'bg-red-600 text-white border-red-400 shadow-red-600/50'
                : 'bg-[#00e5ff] text-[#030a16] border-white/50 shadow-[#00e5ff]/30'
            }`}>
              <span>{toast.type === 'error' ? '❌' : '⚡'}</span>
              <span>{toast.message}</span>
            </div>
          )}

        {/* 1. LANDING SCREEN */}
        {currentScreen === 'landing' && (
          <LandingScreen onEnterArena={() => setCurrentScreen('auth')} />
        )}

        {/* 2. AUTHENTICATION SCREEN */}
        {currentScreen === 'auth' && (
          <AuthScreen
            authMode={authMode}
            setAuthMode={(mode) => {
              setAuthError(null);
              setAuthMode(mode);
            }}
            onSignUp={handleSignUp}
            onLogin={handleLogin}
            onBackToLanding={async () => {
              setAuthError(null);
              setUserProfile(null);
              setSession(null);
              localStorage.removeItem('mvp_esports_profile');
              localStorage.removeItem('mvp_esports_session');
              if (supabase) {
                try {
                  await supabase.auth.signOut();
                } catch (e) {
                  console.warn("signOut error during onBackToLanding:", e);
                }
              }
              setCurrentScreen('landing');
            }}
            loading={loading}
            authError={authError}
          />
        )}

        {/* 2.5 ADMIN PIN LOGIN GATEWAY */}
        {currentScreen === 'admin_login' && userProfile?.is_admin === true && (
          <AdminPinGateway
            userProfile={userProfile}
            onUnlockAdmin={() => {
              setIsAdminUnlocked(true);
              setCurrentScreen('admin');
              if (window.location.pathname !== '/admin') {
                window.history.pushState({}, '', '/admin');
              }
              showToast('🔑 Administrative access granted!');
            }}
            onBackToLogin={() => {
              if (window.location.pathname === '/admin' || window.location.pathname === '/admin-login') {
                window.history.replaceState({}, '', '/');
              }
              setCurrentScreen('home');
            }}
          />
        )}

        {/* 3. MAIN ESPORTS ARENA & DASHBOARD */}
        {currentScreen === 'home' && (
          <div className="flex flex-col flex-1 pb-16">
            
            {/* Top Navigation */}
            <Navbar
              userProfile={userProfile}
              activeTab={activeBottomTab}
              onOpenWallet={() => setIsWalletOpen(true)}
              onOpenProfile={() => setActiveBottomTab('profile')}
              onOpenAdmin={handleOpenAdmin}
              onOpenSupport={() => setIsSupportOpen(true)}
              onLogout={handleLogout}
              onNavigateTab={(tab) => setActiveBottomTab(tab)}
              isDemoMode={isDemo}
              onOpenAnnouncements={() => setIsAnnouncementsOpen(true)}
              onOpenLiveStreams={() => setActiveBottomTab('watch-live')}
              onOpenFriendsHub={() => setIsFriendsHubOpen(true)}
              onInstallPwa={pwa.triggerInstall}
              canInstallPwa={pwa.canInstall}
              pwaLabel={pwa.platformLabel}
            />

            {/* TAB CONTENT RENDER */}
            <main className="mt-2 flex-1 space-y-3">
              
              {/* ARENA HOME TAB */}
              {activeBottomTab === 'home' && (
                <>
                  {/* HERO BANNER */}
                  <div className="relative rounded-2xl overflow-hidden border border-[#00e5ff]/30 bg-cover bg-center"
                    style={{
                      backgroundImage: 'linear-gradient(to bottom, rgba(3, 10, 22, 0.8), rgba(6, 24, 46, 0.95)), url("https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80")'
                    }}
                  >
                    <div className="p-4 sm:p-5 flex flex-col justify-center min-h-[110px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                          LIVE TOURNAMENTS
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
                        MVP ESPORTS <span className="text-[#00e5ff] text-[10px] bg-[#00e5ff]/10 px-1.5 py-0.5 rounded border border-[#00e5ff]/30">PK</span>
                      </h2>
                      <p className="text-[10px] text-gray-300 font-bold mt-1.5 leading-relaxed">
                        Daily Cash Tournaments <span className="text-[#00e5ff]">|</span> Instant Slot Booking <span className="text-[#00e5ff]">|</span> JazzCash & EasyPaisa Payouts
                      </p>
                    </div>
                  </div>

                  <NoticeBanner
                    noticeText={announcements.length > 0
                      ? announcements.map(a => `📢 ${a.title.toUpperCase()}: ${a.content}`).join('    ★    ')
                      : 'Daily Cash Tournaments Active! Instant JazzCash & EasyPaisa Payouts.'
                    }
                    onOpenDeposit={() => setIsWalletOpen(true)}
                    onOpenAnnouncements={() => setIsAnnouncementsOpen(true)}
                  />

                  {/* ACTIVE POLL WIDGET */}
                  {!isPollsLoading && polls.filter(p => p.is_active).length > 0 && (
                    <PollWidget
                      polls={polls.filter(p => p.is_active).slice(0, 1)}
                      userProfile={userProfile}
                      onVote={handleCastPollVote}
                    />
                  )}

                  {/* LIVE STREAM WATCH CARD - PREMIUM VIP BROADCAST */}
                  {liveStreams && liveStreams.length > 0 && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0a1b30] via-[#051120] to-[#020712] border border-red-500/35 shadow-[0_0_30px_rgba(239,68,68,0.15)] group hover:border-red-500/55 transition-all duration-300 animate-in fade-in">
                      {/* Top VIP Neon Glow Accent */}
                      <div className="h-0.5 w-full bg-gradient-to-r from-red-600 via-[#00e5ff] to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />

                      <div className="p-3.5 sm:p-4">
                        {/* Header Eyebrow Row */}
                        <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-red-500/15">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                            <span className="text-[11px] font-black text-white tracking-widest uppercase flex items-center gap-1.5">
                              <span className="text-red-500 font-extrabold">MVP</span> LIVE BROADCAST
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {liveStreams[0].viewers_count && (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-extrabold text-[10px] tracking-wide flex items-center gap-1">
                                <Flame className="w-3 h-3 text-red-500" />
                                {formatStreamViewers(liveStreams[0].viewers_count)}
                              </span>
                            )}
                            {liveStreams.length > 1 && (
                              <button
                                onClick={() => setActiveBottomTab('watch-live')}
                                className="px-2.5 py-0.5 rounded-full bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 border border-[#00e5ff]/30 text-[#00e5ff] font-extrabold text-[9px] uppercase tracking-wider transition-colors"
                              >
                                All Streams ({liveStreams.length})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Main Content: 16:9 Thumbnail & Information */}
                        <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 items-stretch">
                          {/* Full Unclipped Thumbnail with 16:9 Aspect Ratio */}
                          <a
                            href={liveStreams[0].youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative w-full sm:w-56 md:w-64 aspect-video rounded-xl overflow-hidden bg-black/90 border border-red-500/25 flex-shrink-0 group/thumb block cursor-pointer shadow-md"
                          >
                            <img
                              src={liveStreams[0].thumbnail_url}
                              alt={liveStreams[0].title}
                              className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500"
                              referrerPolicy="no-referrer"
                            />
                            
                            {/* Ambient Vignette & Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

                            {/* Strong LIVE BROADCAST Badge */}
                            <div className="absolute top-2.5 left-2.5 bg-red-600/95 backdrop-blur-sm text-white font-black text-[9px] tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1.5 shadow-lg shadow-red-600/50 uppercase border border-red-400/40">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                              <span>LIVE BROADCAST</span>
                            </div>

                            {/* YouTube Play Icon on Hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover/thumb:opacity-100 group-hover/thumb:scale-110 transition-all pointer-events-none">
                              <div className="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xl shadow-red-600/50 border border-white/20">
                                <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                              </div>
                            </div>

                            {/* Exact Viewers Badge Over Thumbnail */}
                            {liveStreams[0].viewers_count && (
                              <div className="absolute bottom-2 left-2 bg-black/85 backdrop-blur-md text-[#ffe600] font-black text-[9px] tracking-wide px-2 py-0.5 rounded-md border border-[#ffe600]/30 shadow-md flex items-center gap-1">
                                <Flame className="w-3 h-3 text-[#ffe600]" />
                                <span>{formatStreamViewers(liveStreams[0].viewers_count)}</span>
                              </div>
                            )}
                          </a>

                          {/* Stream Details & Action Button */}
                          <div className="flex-1 flex flex-col justify-between min-w-0 py-0.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-black tracking-widest uppercase border border-red-500/20">
                                  OFFICIAL MATCH
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium truncate">
                                  YouTube Live Stream
                                </span>
                              </div>

                              <h3 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug line-clamp-2 drop-shadow-sm group-hover:text-red-300 transition-colors">
                                {liveStreams[0].title}
                              </h3>

                              <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed hidden sm:block">
                                Catch the live PUBG tournament match now. Watch pro squads fight for the victory crown!
                              </p>
                            </div>

                            {/* Action Row */}
                            <div className="mt-3 sm:mt-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-gray-800/80 flex items-center gap-2.5 flex-wrap">
                              <a
                                href={liveStreams[0].youtube_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-red-600 to-[#d60000] hover:from-red-500 hover:to-red-600 text-white text-xs font-black tracking-wider uppercase shadow-lg shadow-red-600/30 hover:shadow-red-600/50 hover:brightness-110 active:scale-[0.98] transition-all"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>WATCH ON YOUTUBE</span>
                              </a>

                              {liveStreams.length > 1 && (
                                <button
                                  onClick={() => setActiveBottomTab('watch-live')}
                                  className="px-3.5 py-2.5 rounded-xl bg-[#07192e] hover:bg-[#0c2746] text-gray-300 hover:text-white text-xs font-bold border border-gray-800 hover:border-[#00e5ff]/30 transition-all active:scale-[0.98] uppercase flex items-center gap-1.5"
                                >
                                  <span>Broadcasts</span>
                                  <span className="px-1.5 py-0.2 rounded bg-gray-800 text-[10px] text-[#00e5ff] font-black">
                                    {liveStreams.length}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search Bar & Autocomplete Suggestions */}
                  <div ref={searchContainerRef} className="relative z-30 mb-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search tournament, map or match..."
                        value={searchQuery}
                        onFocus={() => setIsSearchFocused(true)}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setIsSearchFocused(true);
                        }}
                        className={`w-full p-2.5 pl-9 pr-9 rounded-xl bg-[#07192e] border ${
                          isSearchFocused
                            ? 'border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                            : 'border-[#00e5ff]/30'
                        } text-white text-xs focus:outline-none placeholder:text-gray-500 transition-all`}
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#00e5ff]" />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setIsSearchFocused(false);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {isSearchFocused && isSearching && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#07192e] border border-[#00e5ff]/40 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md max-h-80 flex flex-col">
                        <div className="px-3 py-2 bg-[#030a16]/90 border-b border-gray-800/80 flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#00e5ff] flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-[#00e5ff]" />
                            Suggestions ({searchSuggestions.length})
                          </span>
                          <span className="text-[9px] text-gray-400 font-semibold truncate max-w-[140px]">
                            "{trimmedSearchQuery}"
                          </span>
                        </div>

                        <div className="overflow-y-auto divide-y divide-gray-800/60 no-scrollbar max-h-64">
                          {searchSuggestions.length === 0 ? (
                            <div className="p-4 text-center space-y-1">
                              <p className="text-xs font-bold text-gray-300">
                                No tournaments found for "{trimmedSearchQuery}"
                              </p>
                              <p className="text-[10px] text-gray-500">
                                Try searching by title, map (e.g. WOW, Erangel), or game mode.
                              </p>
                            </div>
                          ) : (
                            searchSuggestions.map((m) => {
                              const isWow = m.type === 'wow';
                              const typeLabel = isWow ? 'WOW' : (m.squad_type || m.type?.toUpperCase() || 'SQUAD');
                              const mapLabel = isWow ? 'WOW' : (m.map?.toUpperCase() || 'ERANGEL');
                              const firstPrize = m.prizes?.first_prize || m.prizes?.total_pool || 0;

                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setSearchQuery(m.title);
                                    setIsSearchFocused(false);
                                    setSelectedMatch(m);
                                  }}
                                  className="w-full text-left p-2.5 hover:bg-[#00e5ff]/10 active:bg-[#00e5ff]/20 transition-all flex items-center justify-between gap-2 group"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-lg bg-[#030a16] border border-[#00e5ff]/30 flex items-center justify-center shrink-0 group-hover:border-[#00e5ff] transition-colors">
                                      {isWow ? (
                                        <Sparkles className="w-4 h-4 text-pink-400" />
                                      ) : (
                                        <Trophy className="w-4 h-4 text-amber-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-white group-hover:text-[#00e5ff] truncate transition-colors">
                                        {m.title}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded border uppercase ${
                                          isWow 
                                            ? 'bg-pink-500/20 text-pink-300 border-pink-500/40' 
                                            : 'bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/30'
                                        }`}>
                                          {typeLabel}
                                        </span>
                                        <span className="text-[8px] font-bold text-gray-400 bg-gray-800/60 px-1.5 py-0.2 rounded border border-gray-700/40 uppercase">
                                          {mapLabel}
                                        </span>
                                        {m.match_time && (
                                          <span className="text-[8px] font-semibold text-gray-400 flex items-center gap-0.5">
                                            • {m.match_time}
                                          </span>
                                        )}
                                        {firstPrize > 0 && (
                                          <span className="text-[8px] font-bold text-amber-300">
                                            • 🏆 {firstPrize} PKR
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="shrink-0 flex items-center text-gray-500 group-hover:text-[#00e5ff] transition-colors">
                                    <ChevronRight className="w-4 h-4" />
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Match Filter Tabs */}
                  <div className="flex gap-1.5 overflow-x-auto py-1 no-scrollbar border-b border-gray-800/80 mb-2 items-center">
                    {[
                      { id: 'all', label: 'ALL' },
                      { id: 'tournament', label: 'TOURNAMENTS' },
                      { id: 'squad', label: 'SQUAD' },
                      { id: 'duo', label: 'DUO' },
                      { id: 'solo', label: 'SOLO' },
                      { id: 'tdm', label: 'TDM' },
                      { id: 'wow', label: 'WOW MATCHES' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setMatchTab(tab.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all whitespace-nowrap ${
                          matchTab === tab.id
                            ? 'bg-[#00e5ff] text-[#030a16] shadow-md shadow-[#00e5ff]/30'
                            : 'bg-[#07192e] text-gray-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}

                    {/* Quick Coming Soon Matches Tab */}
                    {comingSoonCount > 0 && (
                      <button
                        onClick={() => setActiveBottomTab('coming-soon')}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all whitespace-nowrap bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1.5 shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>COMING SOON</span>
                        <span className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.2 rounded-full">
                          {comingSoonCount}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Active Search Priority Notification */}
                  {isSearching && (
                    <div className="flex items-center justify-between bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-3 py-1.5 rounded-lg text-xs mb-2">
                      <span className="text-[11px] font-bold text-[#00e5ff] flex items-center gap-1.5">
                        <Search className="w-3 h-3" />
                        Search Results for "{trimmedSearchQuery}" ({filteredMatches.length})
                      </span>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setIsSearchFocused(false);
                        }}
                        className="text-[10px] font-bold text-gray-400 hover:text-white underline uppercase"
                      >
                        Clear Search
                      </button>
                    </div>
                  )}

                  {/* Matches List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 space-y-0">
                    {filteredMatches.length === 0 ? (
                      <div className="p-8 text-center space-y-2 bg-[#07192e]/40 rounded-2xl border border-gray-800/60">
                        <p className="text-xs font-bold text-gray-300">
                          {isSearching
                            ? `No matches found for "${searchQuery}".`
                            : `No matches found in category "${matchTab.toUpperCase()}".`}
                        </p>
                        {isSearching ? (
                          <button
                            onClick={() => {
                              setSearchQuery('');
                              setIsSearchFocused(false);
                            }}
                            className="px-3 py-1 bg-[#00e5ff]/20 text-[#00e5ff] text-[10px] font-bold rounded-lg border border-[#00e5ff]/30 hover:bg-[#00e5ff]/30 transition-colors"
                          >
                            Clear Search Filter
                          </button>
                        ) : (
                          <p className="text-[10px] text-gray-500">
                            Check back soon or explore other categories.
                          </p>
                        )}
                      </div>
                    ) : (
                      filteredMatches.map((m) => {
                        const userBooking = bookings.find((b) => 
                          String(b.match_id) === String(m.id) &&
                          (String(b.user_id) === String(userProfile?.id) || String(b.player_id) === String(userProfile?.id)) &&
                          (b.status === 'confirmed' || b.status == null || (b.status as any) === '')
                        );
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            onSelectMatch={(match) => setSelectedMatch(match)}
                            isBookedByMe={Boolean(userBooking)}
                            bookedSlotNum={userBooking?.slot_number}
                          />
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* COMING SOON MATCHES TAB */}
              {activeBottomTab === 'coming-soon' && (
                <ComingSoonMatchesView
                  matches={matches}
                  onGoHome={handleNavigateToMatchSearch}
                  onSelectMatch={(match) => setSelectedMatch(match)}
                  onRefresh={() => refreshData(false, true)}
                />
              )}

              {/* MY MATCHES TAB */}
              {activeBottomTab === 'my-matches' && (
                <MyMatchesView
                  bookedMatches={myBookedMatches}
                  userProfile={userProfile}
                  onSelectMatch={(match) => setSelectedMatch(match)}
                  onExploreArena={handleNavigateToMatchSearch}
                  onRefresh={() => refreshData(false, true)}
                />
              )}

              {/* WALLET TAB */}
              {activeBottomTab === 'wallet' && (
                <div className="pt-2">
                  <button
                    onClick={() => setIsWalletOpen(true)}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-sm shadow-xl shadow-[#00e5ff]/20 mb-4"
                  >
                    OPEN FULL CASH WALLET & HISTORY
                  </button>
                </div>
              )}

              {/* LEADERBOARD TAB */}
              {activeBottomTab === 'leaderboard' && (
                <Suspense fallback={<div className="p-8 text-center text-cyan-400 font-bold">Loading Leaderboard...</div>}>
                  <LeaderboardView userProfile={userProfile} onGoHome={handleNavigateToMatchSearch} />
                </Suspense>
              )}

              {/* PROFILE TAB */}
              {activeBottomTab === 'profile' && (
                <ProfileView
                  userProfile={userProfile}
                  onOpenWallet={() => setIsWalletOpen(true)}
                  onOpenAdmin={handleOpenAdmin}
                  onOpenEditProfile={() => setIsEditProfileOpen(true)}
                  onGoHome={handleNavigateToMatchSearch}
                  onUpdateProfile={(p) => {
                    setUserProfile(p);
                    refreshData();
                  }}
                />
              )}

              {/* WATCH STREAMS TAB (FULL SCREEN) */}
              {activeBottomTab === 'watch-live' && (
                <Suspense fallback={<div className="p-8 text-center text-cyan-400 font-bold">Loading Streams...</div>}>
                  <WatchStreamsView
                    liveStreams={liveStreams}
                    onBackToHome={() => setActiveBottomTab('home')}
                  />
                </Suspense>
              )}

            </main>

            {/* Bottom Navigation */}
            <BottomNav
              activeTab={activeBottomTab}
              onChangeTab={(tab) => {
                if (tab === 'wallet') {
                  setIsWalletOpen(true);
                } else {
                  setActiveBottomTab(tab);
                }
              }}
              bookedCount={myBookedMatches.length}
            />

          </div>
        )}

        {/* MODALS */}
        {currentSelectedMatch && (
          <MatchDetailModal
            match={currentSelectedMatch}
            onClose={() => setSelectedMatch(null)}
            userProfile={userProfile}
            userBookings={bookings.filter((b) => 
              String(b.match_id) === String(currentSelectedMatch?.id) && 
              (String(b.user_id) === String(userProfile?.id) || String(b.player_id) === String(userProfile?.id)) &&
              (b.status === 'confirmed' || b.status == null || (b.status as any) === '')
            )}
            onBookSlot={handleBookSlot}
            onOpenDeposit={() => {
              setSelectedMatch(null);
              setIsWalletOpen(true);
            }}
          />
        )}

        <WalletModal
          isOpen={isWalletOpen}
          onClose={() => setIsWalletOpen(false)}
          userProfile={userProfile}
          transactions={transactions}
          isLoadingTransactions={isLoadingTransactions}
          onRefreshTransactions={() => refreshProfileData(true)}
          onSubmitDeposit={handleSubmitDeposit}
          onSubmitWithdrawal={handleSubmitWithdrawal}
        />

        {currentScreen === 'admin' && userProfile?.is_admin === true && isAdminUnlocked && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center text-cyan-400 font-bold z-50">Loading Admin Portal...</div>}>
            <AdminPanelModal
              isOpen={true}
              onClose={() => {
                setIsAdminUnlocked(false);
                setCurrentScreen('home');
                if (window.location.pathname === '/admin' || window.location.pathname === '/admin-login') {
                  window.history.replaceState({}, '', '/');
                }
              }}
              matches={matches}
              transactions={transactions}
              onCreateMatch={handleCreateMatch}
              onEditMatch={handleEditMatch}
              onDeleteMatch={handleDeleteMatch}
              onPublishRoomDetails={handlePublishRoomDetails}
              onApproveTransaction={handleApproveTransaction}
              onRejectTransaction={handleRejectTransaction}
              announcements={announcements}
              onSaveAnnouncement={handleSaveAnnouncement}
              onDeleteAnnouncement={handleDeleteAnnouncement}
              onRefreshAnnouncements={handleRefreshAnnouncements}
              polls={adminPolls}
              onCreatePoll={handleCreatePoll}
              onDeactivatePoll={handleDeactivatePoll}
              onDeletePoll={handleDeletePoll}
              liveStreams={liveStreams}
              onSaveLiveStream={handleSaveLiveStream}
              onDeleteLiveStream={handleDeleteLiveStream}
              userProfile={userProfile}
              onDataRefresh={() => {
                refreshData(true, true);
              }}
            />
          </Suspense>
        )}

        {userProfile && (
          <EditProfileModal
            isOpen={isEditProfileOpen}
            onClose={() => setIsEditProfileOpen(false)}
            userProfile={userProfile}
            onUpdate={(p) => {
              setUserProfile(p); 
              refreshData();
              showToast('✅ Profile Updated Successfully!');
            }}
          />
        )}

        {userProfile && (
          <Suspense fallback={null}>
            <FriendsHubModal
              isOpen={isFriendsHubOpen}
              onClose={() => setIsFriendsHubOpen(false)}
              userProfile={userProfile}
            />
          </Suspense>
        )}

        {/* Support Chat Drawer */}
        {userProfile && (
          <Suspense fallback={null}>
            <SupportChat
              isOpen={isSupportOpen}
              onClose={() => setIsSupportOpen(false)}
              userProfile={userProfile}
            />
          </Suspense>
        )}

        <AnnouncementsModal
          isOpen={isAnnouncementsOpen}
          onClose={() => setIsAnnouncementsOpen(false)}
          announcements={announcements}
        />

        {/* PWA Floating Home Prompt */}
        {currentScreen === 'home' && activeBottomTab === 'home' && pwa.canInstall && !pwa.isDismissed && (
          <PwaHomeBanner
            platformLabel={pwa.platformLabel}
            isIos={pwa.isIos}
            onInstall={pwa.triggerInstall}
            onDismiss={pwa.dismissPrompt}
          />
        )}

        {/* PWA iOS / Instruction Modal */}
        <PwaIosGuideModal
          isOpen={pwa.showIosModal}
          onClose={() => pwa.setShowIosModal(false)}
          platformLabel={pwa.platformLabel}
          isIos={pwa.isIos}
        />

      </div>
    </div>
    </ErrorBoundary>
  );
}
