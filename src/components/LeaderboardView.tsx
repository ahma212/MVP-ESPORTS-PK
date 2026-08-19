import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Crosshair,
  Crown,
  Sparkles,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Swords,
  Flame,
  Award,
  Zap,
  DollarSign,
  Gamepad2,
  Medal,
  ShieldCheck,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { getMatchResults, fetchLeaderboardVideosApi, isSupabaseConfigured, supabase, normalizeLeaderboardCategory } from '../lib/supabase';
import { UserProfile, MatchResult, LeaderboardVideo } from '../types';
import { MatchScoreboard } from './MatchScoreboard';

interface LeaderboardViewProps {
  userProfile?: UserProfile | null;
  onGoHome?: () => void;
}

type RankingCategory = 'kills' | 'matches' | 'wins' | 'rewards' | 'reward';

const DEFAULT_CATEGORY_FALLBACK_VIDEOS: Record<string, string> = {
  kills: 'https://assets.mixkit.co/videos/preview/mixkit-energy-pulses-of-red-light-42410-large.mp4',
  matches: 'https://assets.mixkit.co/videos/preview/mixkit-glowing-cyber-grid-background-42318-large.mp4',
  wins: 'https://assets.mixkit.co/videos/preview/mixkit-golden-shimmering-particles-background-42487-large.mp4',
  rewards: 'https://assets.mixkit.co/videos/preview/mixkit-gold-dust-particles-floating-in-air-42353-large.mp4',
  reward: 'https://assets.mixkit.co/videos/preview/mixkit-gold-dust-particles-floating-in-air-42353-large.mp4',
};

const MASTER_FALLBACK_VIDEO = 'https://assets.mixkit.co/videos/preview/mixkit-golden-shimmering-particles-background-42487-large.mp4';

const getLeaderboardVideo = (category: RankingCategory): string => {
  return DEFAULT_CATEGORY_FALLBACK_VIDEOS[category] || MASTER_FALLBACK_VIDEO;
};

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ userProfile, onGoHome }) => {
  const [activeCategory, setActiveCategory] = useState<RankingCategory>('kills');
  const [viewMode, setViewMode] = useState<'leaderboard' | 'match_results'>('match_results');
  const [customVideos, setCustomVideos] = useState<LeaderboardVideo[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>(() => getMatchResults().filter((r) => r.is_published));

  useEffect(() => {
    let isMounted = true;
    const loadCustomVideos = async () => {
      try {
        const vids = await fetchLeaderboardVideosApi();
        if (isMounted) {
          setCustomVideos(vids);
        }
      } catch (err) {
        console.error('Error loading custom leaderboard videos in Player UI:', err);
      }
    };
    loadCustomVideos();

    const handleStorageChange = () => {
      loadCustomVideos();
    };
    window.addEventListener('storage', handleStorageChange);

    // Realtime subscription for immediate sync when admin publishes/deletes video
    let channel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        channel = supabase
          .channel('public:leaderboard_videos_sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'leaderboard_videos' },
            () => {
              loadCustomVideos();
            }
          )
          .subscribe();
      } catch (subErr) {
        console.warn('Realtime subscription error on leaderboard_videos:', subErr);
      }
    }

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchLiveMatchResults = async () => {
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data, error } = await supabase
            .from('match_results')
            .select('*')
            .eq('is_published', true)
            .order('published_at', { ascending: false });

          if (!error && data && isMounted) {
            setMatchResults(data);
          }
        } catch (err) {
          console.warn('LeaderboardView match_results load error:', err);
        }
      }
    };

    fetchLiveMatchResults();
    return () => { isMounted = false; };
  }, [viewMode]);

  const getActiveRank1VideoUrl = (category: RankingCategory): string => {
    const { aliases } = normalizeLeaderboardCategory(category);
    const customVid = customVideos.find((v) => (
      aliases.includes(v.category?.toLowerCase()?.trim())
    ) && Number(v.rank) === 1);

    return customVid?.video_url || '';
  };

  const currentProfile = userProfile || null;

  // Fetch real user profiles from Supabase database
  const [realProfiles, setRealProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchRealProfiles = async () => {
      setLoadingProfiles(true);
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*');

          if (!error && data && isMounted) {
            const mappedProfiles: UserProfile[] = data
              .filter((p: any) => !p.is_banned)
              .map((p: any) => {
                const rawUsername = (p.username || p.name || '').toString().trim();
                const platformUsername = rawUsername ? rawUsername.replace(/^@+/, '') : '';
                const pubgName = (
                  p.pubg_id_name ||
                  p.pubg_name ||
                  p.pubg_id ||
                  p.display_pubg_name ||
                  p.pubg_ign ||
                  ''
                ).toString().trim();
                const pubgIdNum = (p.pubg_id_number || p.pubg_id || 'N/A').toString().trim();
                const matchesCount = Number(p.matches_played ?? p.total_matches ?? 0);
                const killsCount = Number(p.total_kills ?? 0);
                const winsCount = Number(p.total_wins ?? 0);
                const earningsCount = Number(p.total_earnings ?? 0);

                return {
                  id: p.id,
                  email: p.email || '',
                  username: platformUsername,
                  name: p.name || platformUsername,
                  pubg_id_name: pubgName,
                  pubg_id_number: pubgIdNum,
                  wallet_balance: Number(p.wallet_balance ?? 0),
                  role: 'player',
                  total_matches: matchesCount,
                  matches_played: matchesCount,
                  total_wins: winsCount,
                  total_kills: killsCount,
                  total_earnings: earningsCount,
                  avatar_url: p.avatar_url || undefined,
                  created_at: p.created_at || new Date().toISOString(),
                  is_banned: Boolean(p.is_banned)
                };
              });

            setRealProfiles(mappedProfiles);
            setLoadingProfiles(false);
            return;
          }
        } catch (err) {
          console.warn('LeaderboardView fetch profiles error:', err);
        }
      }

      if (isMounted) {
        setRealProfiles([]);
        setLoadingProfiles(false);
      }
    };

    fetchRealProfiles();
    return () => { isMounted = false; };
  }, [viewMode]);

  // Sort profiles based on active tab category (only kills, matches, wins, rewards)
  const sortedProfiles = [...realProfiles].sort((a, b) => {
    if (activeCategory === 'kills') {
      return (b.total_kills || 0) - (a.total_kills || 0);
    } else if (activeCategory === 'matches') {
      const bM = Number((b as any).matches_played ?? b.total_matches ?? 0);
      const aM = Number((a as any).matches_played ?? a.total_matches ?? 0);
      return bM - aM;
    } else if (activeCategory === 'wins') {
      return (b.total_wins || 0) - (a.total_wins || 0);
    } else {
      // Highest Reward -> sort by wallet_balance DESC
      const bW = Number(b.wallet_balance ?? 0);
      const aW = Number(a.wallet_balance ?? 0);
      return bW - aW;
    }
  });

  // Effective active logged-in user profile
  const activeUser = userProfile || currentProfile;

  // Calculate 1-based rank for active user in sortedProfiles for current activeCategory
  const myRankIndex = activeUser ? sortedProfiles.findIndex((p) => {
    if (activeUser.id && p.id === activeUser.id) return true;
    if (activeUser.username && p.username?.toLowerCase() === activeUser.username.toLowerCase()) return true;
    if (activeUser.pubg_id_name && p.pubg_id_name?.toLowerCase() === activeUser.pubg_id_name.toLowerCase()) return true;
    return false;
  }) : -1;

  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : null;
  const totalPlayers = sortedProfiles.length;

  // Active category color theme config
  const categoryTheme = (() => {
    switch (activeCategory) {
      case 'kills':
        return {
          name: 'Highest Kills',
          sectionTitle: 'KILL KING OF ARENA',
          badgeTitle: '👑 KILL KING OF ARENA',
          primaryText: 'text-rose-400',
          ringColor: 'ring-rose-500',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          kingBadgeBg: 'bg-gradient-to-r from-red-600 via-rose-500 to-red-700 text-white border-red-300 shadow-[0_0_15px_rgba(244,63,94,0.6)]',
          kingGlow: 'shadow-[0_0_28px_rgba(244,63,94,0.65)] border-rose-500/60',
          kingCardBg: 'bg-gradient-to-r from-red-950/90 via-rose-950/70 to-slate-950/90',
          silverCardBg: 'bg-[#08101e] border-slate-700/60',
          bronzeCardBg: 'bg-[#08101e] border-amber-900/50',
          tier4CardBg: 'from-rose-950/25 via-[#041224] to-[#030a16]',
          tier4Border: 'border-rose-500/35 hover:border-rose-400/60 shadow-[0_0_10px_rgba(244,63,94,0.1)]',
          tier4RankBadge: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
          hallHeaderBg: 'text-rose-400',
          myRankBorder: 'border-rose-500/40',
          myRankIcon: 'text-rose-400',
          myRankPill: 'bg-gradient-to-r from-rose-500/20 to-red-600/20 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)]',
          conicKing: 'king-spinner-kills',
          conicSilver: 'bg-[conic-gradient(from_0deg,#e2e8f0,#f43f5e,#cbd5e1,transparent_40%,#e2e8f0_60%,transparent_90%)]',
          conicBronze: 'bg-[conic-gradient(from_0deg,#d97706,#f43f5e,#b45309,transparent_40%,#d97706_60%,transparent_90%)]',
        };
      case 'wins':
        return {
          name: 'Highest Match Wins',
          sectionTitle: 'WIN KING OF ARENA',
          badgeTitle: '👑 CHAMPION OF CHAMPIONS',
          primaryText: 'text-amber-400',
          ringColor: 'ring-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          kingBadgeBg: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-black border-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.6)]',
          kingGlow: 'shadow-[0_0_28px_rgba(245,158,11,0.7)] border-amber-400/60',
          kingCardBg: 'bg-gradient-to-r from-amber-950/90 via-yellow-950/70 to-slate-950/90',
          silverCardBg: 'bg-[#08101e] border-slate-700/60',
          bronzeCardBg: 'bg-[#08101e] border-amber-900/50',
          tier4CardBg: 'from-amber-950/25 via-[#041224] to-[#030a16]',
          tier4Border: 'border-amber-500/35 hover:border-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.1)]',
          tier4RankBadge: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
          hallHeaderBg: 'text-amber-400',
          myRankBorder: 'border-amber-500/40',
          myRankIcon: 'text-amber-400',
          myRankPill: 'bg-gradient-to-r from-amber-500/20 to-orange-600/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]',
          conicKing: 'king-spinner-wins',
          conicSilver: 'bg-[conic-gradient(from_0deg,#e2e8f0,#fbbf24,#cbd5e1,transparent_40%,#e2e8f0_60%,transparent_90%)]',
          conicBronze: 'bg-[conic-gradient(from_0deg,#d97706,#fbbf24,#b45309,transparent_40%,#d97706_60%,transparent_90%)]',
        };
      case 'matches':
        return {
          name: 'Highest Match Play',
          sectionTitle: 'MATCH MASTER',
          badgeTitle: '👑 MATCH MASTER',
          primaryText: 'text-[#00e5ff]',
          ringColor: 'ring-[#00e5ff]',
          badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          kingBadgeBg: 'bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-600 text-black border-cyan-300 shadow-[0_0_15px_rgba(0,229,255,0.6)]',
          kingGlow: 'shadow-[0_0_28px_rgba(0,229,255,0.7)] border-[#00e5ff]/60',
          kingCardBg: 'bg-gradient-to-r from-cyan-950/90 via-blue-950/70 to-slate-950/90',
          silverCardBg: 'bg-[#08101e] border-slate-700/60',
          bronzeCardBg: 'bg-[#08101e] border-amber-900/50',
          tier4CardBg: 'from-cyan-950/25 via-[#041224] to-[#030a16]',
          tier4Border: 'border-cyan-500/35 hover:border-cyan-400/60 shadow-[0_0_10px_rgba(0,229,255,0.1)]',
          tier4RankBadge: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
          hallHeaderBg: 'text-cyan-400',
          myRankBorder: 'border-[#00e5ff]/40',
          myRankIcon: 'text-[#00e5ff]',
          myRankPill: 'bg-gradient-to-r from-[#00e5ff]/20 to-blue-600/20 text-[#00e5ff] border-[#00e5ff]/50 shadow-[0_0_12px_rgba(0,229,255,0.3)]',
          conicKing: 'king-spinner-matches',
          conicSilver: 'bg-[conic-gradient(from_0deg,#e2e8f0,#00e5ff,#cbd5e1,transparent_40%,#e2e8f0_60%,transparent_90%)]',
          conicBronze: 'bg-[conic-gradient(from_0deg,#d97706,#00e5ff,#b45309,transparent_40%,#d97706_60%,transparent_90%)]',
        };
      case 'rewards':
      default:
        return {
          name: 'Highest Reward',
          sectionTitle: 'REWARD KING OF ARENA',
          badgeTitle: '👑 PRIZE KING',
          primaryText: 'text-emerald-400',
          ringColor: 'ring-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          kingBadgeBg: 'bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 text-white border-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.6)]',
          kingGlow: 'shadow-[0_0_28px_rgba(16,185,129,0.7)] border-emerald-400/60',
          kingCardBg: 'bg-gradient-to-r from-emerald-950/90 via-green-950/70 to-slate-950/90',
          silverCardBg: 'bg-[#08101e] border-slate-700/60',
          bronzeCardBg: 'bg-[#08101e] border-amber-900/50',
          tier4CardBg: 'from-emerald-950/25 via-[#041224] to-[#030a16]',
          tier4Border: 'border-emerald-500/35 hover:border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
          tier4RankBadge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
          hallHeaderBg: 'text-emerald-400',
          myRankBorder: 'border-emerald-500/40',
          myRankIcon: 'text-emerald-400',
          myRankPill: 'bg-gradient-to-r from-emerald-500/20 to-green-600/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
          conicKing: 'king-spinner-rewards',
          conicSilver: 'bg-[conic-gradient(from_0deg,#e2e8f0,#34d399,#cbd5e1,transparent_40%,#e2e8f0_60%,transparent_90%)]',
          conicBronze: 'bg-[conic-gradient(from_0deg,#d97706,#34d399,#b45309,transparent_40%,#d97706_60%,transparent_90%)]',
        };
    }
  })();

  const [expandedMatchIds, setExpandedMatchIds] = useState<Record<string, boolean>>(() => {
    if (matchResults && matchResults.length > 0) return { [matchResults[0].match_id]: true };
    return {};
  });

  const toggleExpandMatch = (matchId: string) => {
    setExpandedMatchIds((prev) => ({
      ...prev,
      [matchId]: !prev[matchId]
    }));
  };

  // Helper to resolve PUBG name (big title) and platform @username (smaller muted text)
  const getPlayerDisplayNames = (player: UserProfile) => {
    const pubgName = (
      (player as any).pubg_name ||
      player.pubg_id_name ||
      player.name ||
      'Player'
    ).toString().trim();

    return {
      title: pubgName,
      subtitle: null,
      hasPubgName: true
    };
  };

  // Helper to get formatted stat text for active category
  const getStatDisplay = (player: UserProfile) => {
    const matches = Number((player as any).matches_played ?? player.total_matches ?? 0);
    const kills = Number(player.total_kills || 0);
    const wins = Number(player.total_wins || 0);
    const walletBalance = Number(player.wallet_balance ?? 0);

    switch (activeCategory) {
      case 'kills':
        return {
          primary: `${kills} KILLS`,
          secondary: `${wins} Wins • ${matches} Matches`,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10 border-red-500/30'
        };
      case 'matches':
        return {
          primary: `${matches} MATCHES`,
          secondary: `${kills} Kills • ${wins} Wins`,
          color: 'text-[#00e5ff]',
          bgColor: 'bg-[#00e5ff]/10 border-[#00e5ff]/30'
        };
      case 'wins':
        return {
          primary: `${wins} WINS`,
          secondary: `${kills} Kills • ${matches} Matches`,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10 border-emerald-500/30'
        };
      case 'rewards':
        return {
          primary: `RS. ${walletBalance.toLocaleString()} PKR`,
          secondary: `${kills} Kills • ${wins} Wins`,
          color: 'text-amber-400',
          bgColor: 'bg-amber-500/10 border-amber-500/30'
        };
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#07192e] p-3 rounded-2xl border border-[#00e5ff]/30 shadow-xl">
        <div className="flex items-center gap-3">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="p-2 rounded-xl bg-[#030a16] border border-gray-700 text-gray-300 hover:text-white hover:border-[#00e5ff] transition-all active:scale-95 flex items-center justify-center"
              title="Back to Home Arena"
            >
              <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
            </button>
          )}
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2 uppercase tracking-wide">
              <Trophy className="w-5 h-5 text-amber-400 animate-pulse" />
              TOP 100 ESPORTS LEADERBOARD
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Live automated rankings synced directly from official match scoreboards
            </p>
          </div>
        </div>

        {/* View Switcher (MATCH RESULTS FIRST, TOP 100 RANKINGS SECOND) */}
        <div className="flex bg-[#030a16] p-1 rounded-xl border border-gray-800 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('match_results')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'match_results'
                ? 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>MATCH RESULTS ({matchResults.length})</span>
          </button>
          <button
            onClick={() => setViewMode('leaderboard')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'leaderboard'
                ? 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>TOP 100 RANKINGS</span>
          </button>
        </div>
      </div>

      {/* LEADERBOARD VIEW MODE */}
      {viewMode === 'leaderboard' && (
        <div className="space-y-4">
          {/* 4 RANKING CATEGORY TABS ONLY (NO POINTS) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-[#030a16] p-1.5 rounded-2xl border border-gray-800 shadow-inner">
            <button
              onClick={() => setActiveCategory('kills')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                activeCategory === 'kills'
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border-red-400 shadow-lg shadow-red-600/30'
                  : 'bg-[#07192e]/60 text-gray-400 border-transparent hover:text-white hover:border-gray-700'
              }`}
            >
              <Flame className={`w-4 h-4 ${activeCategory === 'kills' ? 'text-white' : 'text-rose-400'}`} />
              <span>HIGHEST KILLS</span>
            </button>

            <button
              onClick={() => setActiveCategory('wins')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                activeCategory === 'wins'
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black border-yellow-300 shadow-lg shadow-amber-500/30'
                  : 'bg-[#07192e]/60 text-gray-400 border-transparent hover:text-white hover:border-gray-700'
              }`}
            >
              <Trophy className={`w-4 h-4 ${activeCategory === 'wins' ? 'text-black' : 'text-amber-400'}`} />
              <span>HIGHEST MATCH WINS</span>
            </button>

            <button
              onClick={() => setActiveCategory('matches')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                activeCategory === 'matches'
                  ? 'bg-gradient-to-r from-[#00e5ff] via-[#00aaff] to-[#0088ff] text-[#030a16] border-cyan-300 shadow-lg shadow-[#00e5ff]/30'
                  : 'bg-[#07192e]/60 text-gray-400 border-transparent hover:text-white hover:border-gray-700'
              }`}
            >
              <Gamepad2 className={`w-4 h-4 ${activeCategory === 'matches' ? 'text-[#030a16]' : 'text-[#00e5ff]'}`} />
              <span>HIGHEST MATCH PLAY</span>
            </button>

            <button
              onClick={() => setActiveCategory('rewards')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                activeCategory === 'rewards'
                  ? 'bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                  : 'bg-[#07192e]/60 text-gray-400 border-transparent hover:text-white hover:border-gray-700'
              }`}
            >
              <DollarSign className={`w-4 h-4 ${activeCategory === 'rewards' ? 'text-white' : 'text-emerald-400'}`} />
              <span>HIGHEST REWARD</span>
            </button>
          </div>

          {/* ACTIVE LOGGED-IN PLAYER MY RANK INDICATOR */}
          <div className={`p-3 rounded-xl bg-gradient-to-r from-[#07192e] via-[#041224] to-[#07192e] border ${categoryTheme.myRankBorder} flex items-center justify-between text-xs shadow-md`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full bg-white/10 border ${categoryTheme.myRankBorder} flex items-center justify-center ${categoryTheme.myRankIcon}`}>
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">
                  MY RANK ({categoryTheme.name.toUpperCase()})
                </span>
                <p className="font-black text-white text-xs">
                  {activeUser ? (activeUser.pubg_id_name || activeUser.name || 'Player') : 'Guest Player'}
                </p>
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 border shadow-sm ${
              myRank
                ? categoryTheme.myRankPill
                : 'bg-gray-800/60 text-gray-400 border-gray-700'
            }`}>
              <Crown className={`w-3.5 h-3.5 ${myRank ? 'text-amber-400' : 'text-gray-500'}`} />
              <span>
                {myRank ? `My Rank #${myRank} / ${totalPlayers}` : 'My Rank — (Unranked)'}
              </span>
            </div>
          </div>

          {/* TOP 10 VIP ANIMATED PODIUM / CARDS SECTION */}
          {sortedProfiles.length === 0 ? (
            <div className="text-center py-12 bg-[#07192e]/40 rounded-2xl border border-gray-800 p-6">
              <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <h3 className="text-sm font-black text-white">No Player Profiles Found</h3>
              <p className="text-xs text-gray-400 mt-1">
                Registered players will appear here automatically as they join matches.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {/* SECTION HEADER (ABOVE #1 CARD): CATEGORY CROWN TITLE */}
                <div className="flex items-center justify-between px-1">
                  <h3 className={`text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 ${categoryTheme.hallHeaderBg}`}>
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>{categoryTheme.sectionTitle}</span>
                  </h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${categoryTheme.badgeBg}`}>
                    {myRank ? `My Rank #${myRank}` : 'Unranked'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {sortedProfiles.slice(0, 10).map((player, idx) => {
                    const rank = idx + 1;
                    const stat = getStatDisplay(player);
                    const names = getPlayerDisplayNames(player);

                    // #1 RANKED PLAYER (THE KING) - VIP CARD WITH OUTER FIRE BORDER RING ONLY
                    if (rank === 1) {
                      const rank1VideoUrl = getActiveRank1VideoUrl(activeCategory);

                      return (
                        <div key={player.id || rank} className={`relative rounded-2xl p-[3px] bg-slate-950 ${categoryTheme.kingGlow} transition-all duration-300 overflow-hidden`}>
                          {/* Dedicated Outer Border Ring Mask Layer (no light in card center) */}
                          <div className="energy-border-ring-lg">
                            <div className={`fire-border-spinner ${categoryTheme.conicKing}`} />
                          </div>

                          {/* Inner Card - Video + Avatar + Names + Stat (100% clear center) */}
                          <div className={`relative z-10 w-full h-full rounded-[13px] p-4 sm:p-5 overflow-hidden flex flex-col justify-between min-h-[140px] sm:min-h-[155px] ${rank1VideoUrl ? 'bg-slate-950/40' : 'bg-[#08101e]'}`}>
                            {/* Video background - Active Category #1 VIP Video (HD & clearly visible) */}
                            {rank1VideoUrl ? (
                              <video
                                key={rank1VideoUrl}
                                autoPlay
                                loop
                                muted
                                playsInline
                                preload="auto"
                                controls={false}
                                className="absolute inset-0 w-full h-full object-cover opacity-90 z-0 pointer-events-none rounded-[13px]"
                                src={rank1VideoUrl}
                              />
                            ) : null}

                            {/* Light subtle gradient overlay (soft top and bottom for readability, clear center) */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50 pointer-events-none z-0" />

                            {/* Top Row: Avatar & PUBG Name + Floating Crown ABOVE Avatar */}
                            <div className="flex items-center justify-between gap-3 relative z-10 pt-2">
                              <div className="flex items-center gap-3.5 min-w-0">
                                {/* Avatar with Ring & Floating Animated Crown ABOVE */}
                                <div className="relative flex-shrink-0 pt-2">
                                  {/* Floating Crown Sticker ABOVE Avatar */}
                                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center justify-center animate-crown-bounce select-none">
                                    <span className="text-2xl sm:text-3xl filter drop-shadow-[0_0_12px_rgba(251,191,36,0.95)]">👑</span>
                                    <span className="absolute -top-1 -right-2 text-xs animate-royal-sparkle">✨</span>
                                  </div>

                                  <img
                                    src={
                                      player.avatar_url ||
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.id || 'player')}`
                                    }
                                    alt={names.title}
                                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-3 ring-amber-400 ring-offset-2 ring-offset-black/80 shadow-2xl"
                                  />
                                  <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black font-black text-[9px] px-1.5 py-0.5 rounded-full border border-yellow-200 shadow-md uppercase flex items-center gap-0.5">
                                    👑 #1
                                  </div>
                                </div>

                                {/* Name Information: PUBG Name (large) + @username */}
                                <div className="min-w-0">
                                  <h3 className="text-lg sm:text-2xl font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] tracking-wide truncate">
                                    {names.title}
                                  </h3>
                                  {names.subtitle && (
                                    <p className="text-xs sm:text-sm font-medium text-amber-200/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] truncate mt-0.5">
                                      {names.subtitle}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Bottom Corner: ONLY Category Stat Count (e.g. "126 KILLS") */}
                            <div className="flex justify-end items-end relative z-10 mt-3 sm:mt-1">
                              <span className={`text-xl sm:text-2xl md:text-3xl font-black font-mono tracking-tight ${categoryTheme.primaryText} drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]`}>
                                {stat.primary}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // #2 RANKED PLAYER - SILVER VIP CARD WITH COOL SUNGLASSES ANIMATED EMOJI
                    if (rank === 2) {
                      return (
                        <div key={player.id || rank} className="relative rounded-xl p-[2px] bg-slate-950 shadow-xl overflow-hidden">
                          {/* Border Ring Mask Layer */}
                          <div className="energy-border-ring">
                            <div className={`energy-border-spinner ${categoryTheme.conicSilver}`} />
                          </div>

                          {/* Solid Inner Card Container */}
                          <div className={`relative z-10 w-full h-full rounded-[10px] p-3.5 sm:p-4 overflow-hidden ${categoryTheme.silverCardBg}`}>
                            <div className="flex items-center justify-between gap-3 relative z-10 drop-shadow-md">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative flex-shrink-0">
                                  {/* Cool Sunglasses Overlay near Avatar */}
                                  <div className="absolute -top-3 -right-2 z-20 pointer-events-none animate-cool-nod select-none">
                                    <span className="text-lg sm:text-xl filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">😎</span>
                                  </div>

                                  <img
                                    src={
                                      player.avatar_url ||
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.id || 'player')}`
                                    }
                                    alt={names.title}
                                    className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-slate-300 ring-offset-2 ring-offset-black shadow-md"
                                  />
                                  <div className="absolute -top-2 -left-1 bg-slate-200 text-black font-black text-[9px] px-1.5 py-0.5 rounded-full border border-white shadow uppercase">
                                    🥈 #2
                                  </div>
                                </div>

                                <div className="min-w-0">
                                  <span className="bg-gradient-to-r from-slate-300 via-gray-100 to-slate-400 text-black text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-slate-200 shadow-sm inline-flex items-center gap-1">
                                    🥈 SILVER VIP
                                  </span>
                                  <h4 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                                    {names.title}
                                  </h4>
                                  {names.subtitle ? (
                                    <p className="text-[10px] text-gray-300 font-medium truncate">{names.subtitle}</p>
                                  ) : (
                                    <p className="text-[10px] text-gray-300">PUBG ID: {player.pubg_id_number || 'N/A'}</p>
                                  )}
                                </div>
                              </div>

                              {/* Right side: Cool Confident Animated Badge + Stat */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-400/40 shadow animate-cool-nod select-none">
                                  <span className="text-base">😎</span>
                                  <span className="text-[9px] font-black text-slate-200 tracking-wider uppercase">COOL BOSS</span>
                                </div>

                                <div className="text-right flex-shrink-0 bg-black/80 px-3 py-2 rounded-lg border border-slate-400/30">
                                  <span className={`text-xs sm:text-sm font-black block font-mono ${categoryTheme.primaryText}`}>
                                    {stat.primary}
                                  </span>
                                  <span className="text-[9px] text-gray-400 block">{stat.secondary}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // #3 RANKED PLAYER - BRONZE VIP CARD WITH LAUGHING SHAKE & HAND WAVE EMOJI
                    if (rank === 3) {
                      return (
                        <div key={player.id || rank} className="relative rounded-xl p-[2px] bg-slate-950 shadow-lg overflow-hidden">
                          {/* Border Ring Mask Layer */}
                          <div className="energy-border-ring">
                            <div className={`energy-border-spinner-slow ${categoryTheme.conicBronze}`} />
                          </div>

                          {/* Solid Inner Card Container */}
                          <div className={`relative z-10 w-full h-full rounded-[10px] p-3.5 sm:p-4 overflow-hidden ${categoryTheme.bronzeCardBg}`}>
                            <div className="flex items-center justify-between gap-3 relative z-10 drop-shadow-md">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative flex-shrink-0">
                                  {/* Laughing Emoji + Pointing Down Finger Overlay */}
                                  <div className="absolute -top-3.5 -right-3 z-20 pointer-events-none flex items-center select-none">
                                    <span className="text-lg sm:text-xl animate-laugh-shake inline-block filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">🤣</span>
                                    <span className="text-base sm:text-lg animate-point-down inline-block -ml-1 filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">👇</span>
                                  </div>

                                  <img
                                    src={
                                      player.avatar_url ||
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.id || 'player')}`
                                    }
                                    alt={names.title}
                                    className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-amber-600 ring-offset-2 ring-offset-black shadow-md"
                                  />
                                  <div className="absolute -top-2 -left-1 bg-amber-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400 shadow uppercase">
                                    🥉 #3
                                  </div>
                                </div>

                                <div className="min-w-0">
                                  <span className="bg-gradient-to-r from-amber-700 via-amber-600 to-amber-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-500 shadow-sm inline-flex items-center gap-1">
                                    🥉 BRONZE VIP
                                  </span>
                                  <h4 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                                    {names.title}
                                  </h4>
                                  {names.subtitle ? (
                                    <p className="text-[10px] text-amber-200/80 font-medium truncate">{names.subtitle}</p>
                                  ) : (
                                    <p className="text-[10px] text-amber-200/80">PUBG ID: {player.pubg_id_number || 'N/A'}</p>
                                  )}
                                </div>
                              </div>

                              {/* Right side: Funny Laugh & Pointing Down Animated Sticker + Stat */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="hidden sm:flex items-center gap-1 bg-amber-900/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-500/40 shadow select-none">
                                  <span className="text-base animate-laugh-shake inline-block">🤣</span>
                                  <span className="text-sm animate-point-down inline-block">👇</span>
                                  <span className="text-[9px] font-black text-amber-200 tracking-wider uppercase">3RD PLACE!</span>
                                </div>

                                <div className="text-right flex-shrink-0 bg-black/80 px-3 py-2 rounded-lg border border-amber-600/30">
                                  <span className={`text-xs sm:text-sm font-black block font-mono ${categoryTheme.primaryText}`}>
                                    {stat.primary}
                                  </span>
                                  <span className="text-[9px] text-gray-400 block">{stat.secondary}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // #4 TO #10 RANKED PLAYERS
                    return (
                      <div
                        key={player.id || rank}
                        className={`relative rounded-xl bg-gradient-to-r ${categoryTheme.tier4CardBg} border ${categoryTheme.tier4Border} p-3 overflow-hidden transition-all duration-300 flex items-center justify-between text-xs`}
                      >
                        {/* Dark Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/70 to-slate-950/90 pointer-events-none z-0" />

                        <div className="flex items-center justify-between text-xs relative z-10 w-full">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center flex-shrink-0 border ${categoryTheme.tier4RankBadge}`}>
                              #{rank}
                            </span>

                            <img
                              src={
                                player.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.id || 'player')}`
                              }
                              alt={names.title}
                              className="w-9 h-9 rounded-full object-cover border border-gray-700 shrink-0"
                            />

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-white truncate">
                                  {names.title}
                                </h4>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase border ${categoryTheme.tier4RankBadge}`}>
                                  VIP #{rank}
                                </span>
                              </div>
                              {names.subtitle ? (
                                <p className="text-[10px] text-gray-400 truncate">{names.subtitle}</p>
                              ) : (
                                <p className="text-[10px] text-gray-400 truncate">PUBG ID: {player.pubg_id_number || 'N/A'}</p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <span className={`font-black text-xs block font-mono ${categoryTheme.primaryText}`}>
                              {stat.primary}
                            </span>
                            <span className="text-[9px] text-gray-400 block">{stat.secondary}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* #11 TO #100 RANKED PLAYERS LIST */}
              {sortedProfiles.length > 10 && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                    RANKS #11 TO #{Math.min(100, sortedProfiles.length)}
                  </h3>

                  <div className="space-y-1.5">
                    {sortedProfiles.slice(10, 100).map((player, idx) => {
                      const rank = idx + 11;
                      const stat = getStatDisplay(player);
                      const names = getPlayerDisplayNames(player);

                      return (
                        <div
                          key={player.id || rank}
                          className="p-2.5 rounded-xl bg-[#030a16] border border-gray-800/80 hover:border-gray-700 flex items-center justify-between text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 text-center font-mono text-gray-500 font-bold text-xs shrink-0">
                              #{rank}
                            </span>

                            <img
                              src={
                                player.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.id || 'player')}`
                              }
                              alt={names.title}
                              className="w-7 h-7 rounded-full object-cover border border-gray-800 shrink-0"
                            />

                            <div className="min-w-0">
                              <h4 className="font-bold text-gray-200 text-xs truncate">
                                {names.title}
                              </h4>
                              {names.subtitle && (
                                <p className="text-[9px] text-gray-400 truncate">
                                  {names.subtitle}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-xs text-gray-300 block">
                              {stat.primary}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MATCH RESULTS / SCOREBOARDS VIEW MODE */}
      {viewMode === 'match_results' && (
        <div className="space-y-6">
          <div className="p-3 rounded-xl bg-[#030a16] border border-gray-800 text-xs text-gray-300 flex items-center gap-2">
            <Swords className="w-4 h-4 text-[#00e5ff] shrink-0" />
            <p>
              Official completed tournament scoreboards, chicken dinner winners, and kill breakdowns.
            </p>
          </div>

          {matchResults.length === 0 ? (
            <div className="text-center py-12 bg-[#07192e]/40 rounded-2xl border border-gray-800 p-6">
              <Crosshair className="w-10 h-10 text-gray-600 mx-auto mb-3 animate-pulse" />
              <h3 className="text-sm font-black text-white">No Completed Match Results Yet</h3>
              <p className="text-xs text-gray-400 mt-1">
                Completed matches published by Admins will display here automatically.
              </p>
            </div>
          ) : (
            matchResults.map((match, idx) => (
              <div key={match.match_id || idx} className="mb-6">
                <MatchScoreboard
                  matchResult={match}
                  defaultExpanded={idx === 0}
                  cardIndex={idx}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
