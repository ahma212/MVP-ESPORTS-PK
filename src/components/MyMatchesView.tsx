import React, { useState, useEffect, useCallback } from 'react';
import { Match, SlotBooking, UserProfile } from '../types';
import { Gamepad2, Copy, Check, Clock, Trophy, ChevronRight, Sparkles, ArrowLeft, RefreshCw, Lock, AlertCircle, Shield } from 'lucide-react';
import { getMatchResults, fetchUserBookedMatchesFromSupabase, supabase, isSupabaseConfigured } from '../lib/supabase';
import { MatchScoreboard } from './MatchScoreboard';

interface MyMatchesViewProps {
  bookedMatches: { match: Match; booking: SlotBooking }[];
  userProfile?: UserProfile | null;
  onSelectMatch: (match: Match) => void;
  onExploreArena: () => void;
  onRefresh?: () => void;
}

export const MyMatchesView: React.FC<MyMatchesViewProps> = ({
  bookedMatches: initialBookedMatches,
  userProfile,
  onSelectMatch,
  onExploreArena,
  onRefresh
}) => {
  const [copiedIdMap, setCopiedIdMap] = useState<Record<string, boolean>>({});
  const [matchTab, setMatchTab] = useState<'upcoming' | 'live' | 'completed'>('upcoming');
  const [now, setNow] = useState<number>(Date.now());
  const [bookedMatchesList, setBookedMatchesList] = useState<{ match: Match; booking: SlotBooking }[]>(initialBookedMatches || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialBookedMatches || initialBookedMatches.length === 0);

  // 1-second live ticker for real-time countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update state whenever initial props change
  useEffect(() => {
    if (initialBookedMatches) {
      setBookedMatchesList(initialBookedMatches);
    }
  }, [initialBookedMatches]);

  // Fetch confirmed slot bookings
  const loadUserBookings = useCallback(async (showLoading = false) => {
    if (!userProfile?.id) return;
    if (showLoading) setIsLoading(true);

    try {
      const freshData = await fetchUserBookedMatchesFromSupabase(userProfile.id);
      setBookedMatchesList(freshData);
    } catch (err) {
      console.error('Error fetching booked matches:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [userProfile?.id]);

  // Load bookings on mount or when user changes
  useEffect(() => {
    loadUserBookings(bookedMatchesList.length === 0);
  }, [userProfile?.id, loadUserBookings]);

  // Real-time Postgres subscriptions for user's slot bookings
  useEffect(() => {
    if (!userProfile?.id || !isSupabaseConfigured() || !supabase) return;

    let channel: any = null;
    try {
      channel = supabase
        .channel(`my_matches_sync_${userProfile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'slot_bookings',
            filter: `user_id=eq.${userProfile.id}`
          },
          () => {
            loadUserBookings(false);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'slot_bookings',
            filter: `player_id=eq.${userProfile.id}`
          },
          () => {
            loadUserBookings(false);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'matches'
          },
          () => {
            loadUserBookings(false);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel error in MyMatchesView:', err);
    }

    return () => {
      if (channel) {
        supabase?.removeChannel(channel);
      }
    };
  }, [userProfile?.id, loadUserBookings]);

  const handleCopy = (text: string, matchId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdMap((prev) => ({ ...prev, [matchId]: true }));
    setTimeout(() => {
      setCopiedIdMap((prev) => ({ ...prev, [matchId]: false }));
    }, 2000);
  };

  const allMatchResults = getMatchResults();

  const getMatchTimeDiff = (m: Match) => {
    const startTimestamp =
      m.start_timestamp ||
      (typeof m.start_time === 'number'
        ? m.start_time
        : typeof m.start_time === 'string' && !isNaN(Date.parse(m.start_time))
        ? Date.parse(m.start_time)
        : m.timestamp) ||
      Date.now() + 3600000;
    return startTimestamp - now;
  };

  const isMatchEnded = (m: Match) => {
    const diff = getMatchTimeDiff(m);
    return m.status === 'completed' || diff <= -30 * 60 * 1000 || (Boolean(m.is_ended) && diff <= 0);
  };

  const isMatchLiveNow = (m: Match) => {
    const diff = getMatchTimeDiff(m);
    return !isMatchEnded(m) && (diff <= 0 || m.status === 'live');
  };

  // Helper to format remaining time into detailed HH:MM:SS or DDd HH:MM:SS
  const formatCountdown = (diffMs: number) => {
    if (diffMs <= 0) {
      return { expired: true, text: '00:00:00', days: 0, hours: '00', mins: '00', secs: '00' };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    let text = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    if (days > 0) {
      text = `${days}d ${text}`;
    }

    return {
      expired: false,
      text,
      days,
      hours: pad(hours),
      mins: pad(minutes),
      secs: pad(seconds)
    };
  };

  // Group multiple bookings of the SAME match into one card.
  // Example: if you book one slot for yourself and one for your friend
  // in the same match, the UI still shows only ONE match card.
  const groupedBookedMatches = (() => {
    const map = new Map<string, { match: Match; bookings: SlotBooking[] }>();

    for (const item of bookedMatchesList) {
      const matchKey = String(item.match.id);
      const existing = map.get(matchKey);

      if (existing) {
        existing.bookings.push(item.booking);
      } else {
        map.set(matchKey, {
          match: item.match,
          bookings: [item.booking]
        });
      }
    }

    return Array.from(map.values());
  })();

  // Filter UNIQUE matches by status tab (not individual bookings).
  const filteredMatches = groupedBookedMatches.filter(({ match }) => {
    const isEnded = isMatchEnded(match);
    const isLive = isMatchLiveNow(match);

    if (matchTab === 'upcoming') {
      return !isEnded && !isLive;
    }
    if (matchTab === 'live') {
      return isLive;
    }
    if (matchTab === 'completed') {
      return isEnded;
    }
    return true;
  });

  // Tab counters are UNIQUE MATCH counts.
  // Two bookings in one match = 1 Upcoming/Live/Completed match.
  const upcomingCount = groupedBookedMatches.filter(
    ({ match }) => !isMatchEnded(match) && !isMatchLiveNow(match)
  ).length;
  const liveCount = groupedBookedMatches.filter(({ match }) => isMatchLiveNow(match)).length;
  const completedCount = groupedBookedMatches.filter(({ match }) => isMatchEnded(match)).length;

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          {onExploreArena && (
            <button
              type="button"
              onClick={onExploreArena}
              className="p-2 rounded-xl bg-[#07192e] border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all cursor-pointer"
              title="Back to Available Matches"
            >
              <ArrowLeft className="w-4 h-4 text-[#00e5ff]" />
            </button>
          )}
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2 tracking-wide uppercase">
              <Gamepad2 className="w-5 h-5 text-[#00e5ff]" />
              MY BOOKED MATCHES
            </h2>
            <p className="text-xs text-gray-400">
              Confirmed slots & room credentials
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => loadUserBookings(true)}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-[#07192e] border border-gray-700 hover:border-[#00e5ff] text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Refresh bookings"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00e5ff] ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <span className="px-2.5 py-1 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-xs font-extrabold text-[#00e5ff]">
            {groupedBookedMatches.length} Booked
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-[#020710] p-1 rounded-xl border border-gray-800 gap-1 shadow-inner">
        <button
          type="button"
          onClick={() => setMatchTab('upcoming')}
          className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            matchTab === 'upcoming'
              ? 'bg-[#00e5ff] text-[#030a16] shadow-md shadow-[#00e5ff]/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>Upcoming</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${matchTab === 'upcoming' ? 'bg-[#030a16] text-[#00e5ff]' : 'bg-gray-800 text-gray-300'}`}>
            {upcomingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMatchTab('live')}
          className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            matchTab === 'live'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-500/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${liveCount > 0 ? 'bg-red-400 animate-ping' : 'bg-gray-500'}`} />
            Live
          </span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${matchTab === 'live' ? 'bg-black text-red-300' : 'bg-gray-800 text-gray-300'}`}>
            {liveCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMatchTab('completed')}
          className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            matchTab === 'completed'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>Completed</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${matchTab === 'completed' ? 'bg-black text-purple-300' : 'bg-gray-800 text-gray-300'}`}>
            {completedCount}
          </span>
        </button>
      </div>

      {/* Loading state indicator */}
      {isLoading && bookedMatchesList.length === 0 ? (
        <div className="py-12 text-center bg-[#07192e]/40 rounded-2xl border border-gray-800 p-6 space-y-3">
          <RefreshCw className="w-8 h-8 text-[#00e5ff] animate-spin mx-auto" />
          <h3 className="text-sm font-bold text-white">Fetching Your Confirmed Bookings...</h3>
        </div>
      ) : filteredMatches.length === 0 ? (
        /* Empty State */
        <div className="py-12 text-center bg-[#07192e]/40 rounded-2xl border border-gray-800 p-6 space-y-4 shadow-md min-h-[220px] flex flex-col items-center justify-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] shrink-0">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              {matchTab === 'upcoming'
                ? 'No Upcoming Booked Slots Found'
                : matchTab === 'live'
                ? 'No Live Matches In Progress'
                : 'No Completed Match History Yet'}
            </h3>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              {matchTab === 'upcoming'
                ? 'You have not booked any upcoming tournaments. Join daily PUBG cash matches and claim your slot now!'
                : matchTab === 'live'
                ? 'None of your booked matches are currently live in the arena.'
                : 'Completed match scorecards and prize payouts will appear here once matches finish.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onExploreArena}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs shadow-md shadow-[#00e5ff]/20 hover:brightness-110 active:scale-[0.98] transition-colors uppercase tracking-wide cursor-pointer select-none inline-flex items-center justify-center"
          >
            BROWSE MATCHES & BOOK SLOT
          </button>
        </div>
      ) : (
        /* Matches List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0">
          {filteredMatches.map(({ match, bookings }) => {
            const isCompleted = isMatchEnded(match);
            const isLive = isMatchLiveNow(match);
            const timeDiff = getMatchTimeDiff(match);
            const countdown = formatCountdown(timeDiff);
            const hasRoomCredentials = Boolean(match.room_id || match.room_credentials?.some(c => c.room_id));

            // The first booking is used for compatibility with existing match-level fields.
            const primaryBooking = bookings[0];

            // Optional match artwork. The cast keeps this compatible with existing Match types
            // even if the image field is not declared in the shared type yet.
            const matchVisualUrl =
              (match as Match & {
                banner_url?: string;
                image_url?: string;
                image?: string;
                banner?: string;
              }).banner_url ||
              (match as Match & {
                banner_url?: string;
                image_url?: string;
                image?: string;
                banner?: string;
              }).image_url ||
              (match as Match & {
                banner_url?: string;
                image_url?: string;
                image?: string;
                banner?: string;
              }).image ||
              (match as Match & {
                banner_url?: string;
                image_url?: string;
                image?: string;
                banner?: string;
              }).banner;

            // Lookup result for this match. All bookings belonging to this match are
            // considered when finding the players' results.
            const matchResult = allMatchResults.find((r) => String(r.match_id) === String(match.id));
            const playerStatsList =
              matchResult?.results?.filter((p) =>
                bookings.some((booking) => {
                  const playerIgn = String(booking.player_ign || '').toLowerCase();
                  const teamName = String(booking.team_name || '').toLowerCase();
                  const resultIgn = String(p.player_ign || '').toLowerCase();

                  return resultIgn === playerIgn || (teamName && resultIgn === teamName);
                })
              ) || [];
            return (
              <div
                key={match.id}
                className="rounded-2xl bg-gradient-to-b from-[#07192e] via-[#040e1a] to-[#020710] border border-[#00e5ff]/40 p-4 space-y-3 shadow-xl relative overflow-hidden"
              >
                {/* Match Picture / Banner */}
                {matchVisualUrl && (
                  <div className="w-full h-28 sm:h-32 -mt-1 rounded-xl overflow-hidden border border-[#00e5ff]/25 bg-[#020710]">
                    <img
                      src={matchVisualUrl}
                      alt={match.title || 'Match'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Status Bar */}
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-[#00e5ff] uppercase tracking-wider bg-[#00e5ff]/15 px-2 py-0.5 rounded border border-[#00e5ff]/40">
                      {bookings.length > 1
                        ? `${bookings.length} SLOTS CONFIRMED`
                        : `SLOT #${primaryBooking.slot_number} CONFIRMED`}
                    </span>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800 uppercase">
                      {match.squad_type}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1 ${
                      isCompleted
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : isLive
                        ? 'bg-red-900/50 text-red-300 border border-red-500/40 animate-pulse'
                        : hasRoomCredentials
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isCompleted ? (
                      '● MATCH FINISHED'
                    ) : isLive ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                        MATCH LIVE 🔴
                      </>
                    ) : hasRoomCredentials ? (
                      '● ROOM DETAILS READY 🔑'
                    ) : (
                      'UPCOMING MATCH'
                    )}
                  </span>
                </div>

                {/* Match Title & Schedule Info */}
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">{match.title}</h3>
                  <p className="text-xs text-gray-300 flex items-center gap-1.5 mt-0.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#00e5ff]" />
                    <span>{match.match_time}</span>
                    <span>•</span>
                    <span className="text-[#00e5ff] font-bold">{match.map}</span>
                    <span>•</span>
                    <span>{match.version}</span>
                  </p>
                </div>

                {/* UPCOMING MATCH COUNTDOWN TIMER (High Priority Requirement) */}
                {!isCompleted && !isLive && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-black/80 via-[#07192e] to-black/80 border border-[#00e5ff]/30 text-center shadow-inner">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-extrabold text-[#00e5ff] uppercase tracking-wider mb-1">
                      <Clock className="w-3.5 h-3.5 text-[#00e5ff] animate-pulse" />
                      <span>MATCH STARTS IN</span>
                    </div>

                    <div className="flex items-center justify-center gap-2 py-0.5">
                      {countdown.days > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-lg font-black text-white font-mono bg-[#030a16] px-2 py-0.5 rounded border border-gray-800">
                            {countdown.days}d
                          </span>
                          <span className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">DAYS</span>
                        </div>
                      )}
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-[#00e5ff] font-mono bg-[#030a16] px-2 py-0.5 rounded border border-[#00e5ff]/40 min-w-[34px]">
                          {countdown.hours}
                        </span>
                        <span className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">HOURS</span>
                      </div>
                      <span className="text-base font-black text-[#00e5ff] -mt-2">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-[#00e5ff] font-mono bg-[#030a16] px-2 py-0.5 rounded border border-[#00e5ff]/40 min-w-[34px]">
                          {countdown.mins}
                        </span>
                        <span className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">MINS</span>
                      </div>
                      <span className="text-base font-black text-[#00e5ff] -mt-2">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-amber-400 font-mono bg-[#030a16] px-2 py-0.5 rounded border border-amber-500/40 min-w-[34px]">
                          {countdown.secs}
                        </span>
                        <span className="text-[8px] text-amber-400 font-bold uppercase mt-0.5">SECS</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* All players/slots booked for this SAME match */}
                <div className="space-y-2 p-2.5 rounded-xl bg-[#020710] border border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-400 font-semibold uppercase">
                      {bookings.length > 1 ? 'BOOKED PLAYERS' : 'REGISTERED PLAYER'}
                    </span>
                    <span className="text-[9px] font-black text-[#00e5ff]">
                      {bookings.length} {bookings.length === 1 ? 'SLOT' : 'SLOTS'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {bookings.map((booking, bookingIndex) => (
                      <div
                        key={booking.id || `${match.id}-${booking.slot_number}-${bookingIndex}`}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-black/40 border border-gray-800 px-2.5 py-2"
                      >
                        <span className="text-[9px] font-black text-gray-400 whitespace-nowrap">
                          SLOT #{booking.slot_number}
                        </span>
                        <div className="min-w-0">
                          <span className="text-[9px] text-gray-500 block uppercase">IGN</span>
                          <span className="font-bold text-white truncate block">
                            {booking.player_ign || 'Registered'}
                          </span>
                        </div>
                        <div className="text-right min-w-0">
                          <span className="text-[9px] text-gray-500 block uppercase">UID</span>
                          <span className="font-bold text-[#00e5ff] truncate block max-w-[110px]">
                            {booking.player_uid || 'Registered'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COMPLETED MATCH STATS PANEL */}
                {isCompleted && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/50 to-indigo-950/50 border border-purple-500/40 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[10px] font-black text-purple-300 flex items-center gap-1.5 uppercase">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          YOUR MATCH PERFORMANCE
                        </span>
                        {playerStatsList.some((stats) => stats?.is_winner) && (
                          <span className="text-[9px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> #1 WINNER
                          </span>
                        )}
                      </div>

                      {playerStatsList.length > 0 ? (
                        <div className="space-y-2">
                          {playerStatsList.map((stats, statsIndex) => (
                            <div
                              key={`${stats.player_ign}-${statsIndex}`}
                              className="rounded-lg bg-black/40 border border-purple-500/30 p-2"
                            >
                              <div className="text-[10px] font-black text-white truncate mb-1.5">
                                {stats.player_ign}
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="p-1.5 rounded-lg bg-black/50 border border-purple-500/20">
                                  <span className="text-[8px] text-gray-400 block font-bold uppercase">KILLS</span>
                                  <span className="font-black text-white text-sm">{stats.kills || 0}</span>
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/50 border border-purple-500/20">
                                  <span className="text-[8px] text-gray-400 block font-bold uppercase">RANK</span>
                                  <span className="font-black text-purple-300 text-sm">#{stats.rank || 1}</span>
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/50 border border-purple-500/20">
                                  <span className="text-[8px] text-gray-400 block font-bold uppercase">PRIZE WON</span>
                                  <span className="font-black text-emerald-400 text-sm">RS. {stats.earnings || 0}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-2 text-[11px] text-purple-300 font-medium flex items-center justify-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                          <span>Results verification in progress by Host/Admin.</span>
                        </div>
                      )}
                    </div>

                    {matchResult && (
                      <MatchScoreboard matchResult={matchResult} defaultExpanded={false} />
                    )}
                  </div>
                )}

                {/* Dynamic Multi-Match Room ID Cards (For Upcoming & Live) */}
                {!isCompleted && (() => {
                  const mapsList =
                    match.maps && match.maps.length > 0
                      ? match.maps
                      : match.type === 'tournament'
                      ? ['Erangel', 'Miramar', 'Rondo']
                      : [match.map];

                  return (
                    <div className="space-y-2">
                      {mapsList.map((mapName, idx) => {
                        const cred = match.room_credentials?.[idx];
                        let roomId = cred?.room_id;
                        let roomPass = cred?.room_password;
                        const releaseTimeMs = cred?.release_time_ms;

                        if (idx === 0 && !roomId && match.room_id) {
                          roomId = match.room_id;
                          roomPass = match.room_password;
                        }

                        const hasCredentials = Boolean(roomId);
                        const isTimeUnlocked = !releaseTimeMs || now >= releaseTimeMs;
                        const isPublished = hasCredentials && isTimeUnlocked;
                        const isWaitingTimer = hasCredentials && !isTimeUnlocked;

                        let timerDisplay = '';
                        if (isWaitingTimer && releaseTimeMs) {
                          const diffSec = Math.max(0, Math.floor((releaseTimeMs - now) / 1000));
                          const m = Math.floor(diffSec / 60);
                          const s = diffSec % 60;
                          timerDisplay = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                        }

                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border text-xs transition-all ${
                              isPublished
                                ? 'bg-emerald-950/50 border-emerald-500/60 shadow-lg'
                                : isWaitingTimer
                                ? 'bg-amber-950/40 border-amber-500/50'
                                : 'bg-[#020710] border-gray-800'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[9px] font-black text-[#00e5ff] uppercase tracking-wider bg-[#00e5ff]/15 px-2 py-0.5 rounded border border-[#00e5ff]/30">
                                MATCH #{idx + 1} &bull; {mapName.toUpperCase()}
                              </span>
                              <span
                                className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase ${
                                  isPublished
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : isWaitingTimer
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                                }`}
                              >
                                {isPublished
                                  ? '● ROOM UNLOCKED'
                                  : isWaitingTimer
                                  ? `🔒 UNLOCKS IN ${timerDisplay}`
                                  : '🔒 AWAITING RELEASE'}
                              </span>
                            </div>

                            {isPublished ? (
                              <div className="mt-2 space-y-2">
                                {/* Room ID */}
                                <div className="flex justify-between items-center gap-2 p-2 rounded-lg bg-black/60 border border-emerald-500/40">
                                  <div className="min-w-0">
                                    <span className="text-[8px] text-emerald-400 font-black uppercase block">
                                      ROOM ID
                                    </span>
                                    <span className="text-xs font-black text-white font-mono break-all">
                                      {roomId}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(String(roomId), `${match.id}-${idx}-id`)}
                                    className="shrink-0 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-emerald-500/40 hover:bg-emerald-500/30 active:scale-95 transition-all"
                                  >
                                    {copiedIdMap[`${match.id}-${idx}-id`] ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                {/* Password */}
                                <div className="flex justify-between items-center gap-2 p-2 rounded-lg bg-black/60 border border-emerald-500/40">
                                  <div className="min-w-0">
                                    <span className="text-[8px] text-emerald-400 font-black uppercase block">
                                      PASSWORD
                                    </span>
                                    <span className="text-xs font-black text-white font-mono break-all">
                                      {roomPass || 'No password'}
                                    </span>
                                  </div>
                                  {roomPass ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(String(roomPass), `${match.id}-${idx}-password`)}
                                      className="shrink-0 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-emerald-500/40 hover:bg-emerald-500/30 active:scale-95 transition-all"
                                    >
                                      {copiedIdMap[`${match.id}-${idx}-password`] ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" />
                                          <span>Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-[9px] text-gray-500 font-bold uppercase">
                                      None
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : isWaitingTimer ? (
                              <p className="text-[10px] text-amber-300 font-bold mt-1.5 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                Room ID scheduled by host. Unlocks automatically in{' '}
                                <strong className="text-[#00e5ff] font-mono">{timerDisplay}</strong>.
                              </p>
                            ) : (
                              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                <Lock className="w-3 h-3 text-gray-500" />
                                Host will publish Room ID and Password prior to match start.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* View Details Button */}
                <button
                  onClick={() => onSelectMatch(match)}
                  className="w-full py-2.5 rounded-xl bg-[#07192e] hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                >
                  <span>View Full Prize Pool & Match Rules</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
