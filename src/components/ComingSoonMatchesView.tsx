import React, { useState, useEffect, useCallback } from 'react';
import { Match } from '../types';
import { ArrowLeft, Clock, Hourglass, Trophy, Sparkles, Lock, Calendar, RefreshCw, Gamepad2, Users, Coins } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface ComingSoonMatchesViewProps {
  matches: Match[];
  onGoHome: () => void;
  onSelectMatch?: (match: Match) => void;
  onRefresh?: () => void;
}

// Robust timestamp parser supporting numbers (ms or seconds), numeric strings, and ISO dates
export const parseTimestamp = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    // If timestamp is in seconds (e.g. 1755355200), convert to ms
    if (val < 10000000000) return val * 1000;
    return val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      if (num < 10000000000) return num * 1000;
      return num;
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
};

// Computes match scheduled start timestamp using the exact same priority logic as home MatchCard
export const getMatchStartTimestamp = (match: Match): number => {
  if (!match) return 0;

  // 1. Explicit start_timestamp
  const startTs = parseTimestamp(match.start_timestamp);
  if (startTs) return startTs;

  // 2. start_time
  const startTime = parseTimestamp(match.start_time);
  if (startTime) return startTime;

  // 3. scheduled_at (if present)
  const sched = parseTimestamp((match as any).scheduled_at);
  if (sched) return sched;

  // 4. timestamp
  const ts = parseTimestamp(match.timestamp);
  if (ts) return ts;

  // 5. match_time string (if parseable)
  if (typeof match.match_time === 'string' && match.match_time.trim() !== '') {
    const parsed = parseTimestamp(match.match_time);
    if (parsed) return parsed;
  }

  return 0;
};

export interface ComingSoonMatchItem {
  match: Match;
  targetTime: number;
  diffMs: number;
  isDelayedRegistration: boolean;
}

// 24-HOUR COMING SOON RULE:
// 1. Include match if start time is in FUTURE AND remaining time until start is <= 24 hours (24 * 3600 * 1000)
// 2. Also keep matches with registration_opens_at countdown if delayed booking is active in future
// 3. Exclude matches that already started, are live, or completed (diff <= 0)
// 4. Exclude matches whose start is more than 24 hours away
// 5. When remaining time hits 0, match is removed from Coming Soon
export const getComingSoonMatchInfo = (m: Match, now: number): ComingSoonMatchItem | null => {
  if (!m) return null;
  if (m.status === 'completed' || m.is_ended || m.status === 'live') return null;

  // 1. Delayed registration countdown check
  const regOpens = parseTimestamp(m.registration_opens_at);
  if (regOpens !== null && regOpens > now) {
    const diff = regOpens - now;
    return {
      match: m,
      targetTime: regOpens,
      diffMs: diff,
      isDelayedRegistration: true
    };
  }

  // 2. Match start time check (within next 24 hours)
  const startTs = getMatchStartTimestamp(m);
  if (startTs > now) {
    const diff = startTs - now;
    // Must be <= 24 hours (86,400,000 ms) and > 0
    if (diff <= 24 * 60 * 60 * 1000) {
      return {
        match: m,
        targetTime: startTs,
        diffMs: diff,
        isDelayedRegistration: false
      };
    }
  }

  // 3. Status is 'upcoming_announcement' with a start timestamp within 24 hours
  if (m.status === 'upcoming_announcement') {
    if (startTs > now) {
      const diff = startTs - now;
      if (diff <= 24 * 60 * 60 * 1000) {
        return {
          match: m,
          targetTime: startTs,
          diffMs: diff,
          isDelayedRegistration: false
        };
      }
    }
  }

  return null;
};

// Map tag styling helper
const getMapBadgeColor = (map: string) => {
  switch ((map || '').toLowerCase()) {
    case 'erangel':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'miramar':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'sanhok':
      return 'bg-green-500/20 text-green-300 border-green-500/40';
    case 'livik':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    case 'warehouse':
      return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    case 'wow':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
    default:
      return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  }
};

export const ComingSoonMatchesView: React.FC<ComingSoonMatchesViewProps> = ({
  matches: initialMatches,
  onGoHome,
  onSelectMatch,
  onRefresh
}) => {
  const [now, setNow] = useState<number>(Date.now());
  const [matchesList, setMatchesList] = useState<Match[]>(initialMatches || []);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Live 1-second interval timer for real-time countdown calculation
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Synchronize when parent prop updates
  useEffect(() => {
    if (initialMatches && initialMatches.length > 0) {
      setMatchesList(initialMatches);
    }
  }, [initialMatches]);

  // Pull fresh matches directly from Supabase (single source of truth)
  const refreshFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        setMatchesList(data);
      }
      if (onRefresh) onRefresh();
    } catch (e) {
      console.warn('Error refreshing coming soon matches from Supabase:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [onRefresh]);

  // Load latest from Supabase on mount
  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Realtime subscription for matches table
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    let channel: any = null;
    try {
      channel = supabase
        .channel('coming_soon_matches_realtime_v2')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'matches'
          },
          () => {
            refreshFromSupabase();
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel error in ComingSoonMatchesView:', err);
    }

    return () => {
      if (channel) {
        supabase?.removeChannel(channel);
      }
    };
  }, [refreshFromSupabase]);

  // Filter matches starting within next 24 hours (or active delayed registration)
  const comingSoonItems: ComingSoonMatchItem[] = matchesList
    .map((m) => getComingSoonMatchInfo(m, now))
    .filter((item): item is ComingSoonMatchItem => item !== null)
    .sort((a, b) => a.targetTime - b.targetTime); // Closest start time first

  // Helper to format remaining time into HH:MM:SS or DDd HH:MM:SS matching home card
  const formatCountdown = (targetTimestamp: number) => {
    const diff = Math.max(0, targetTimestamp - now);
    if (diff === 0) {
      return { expired: true, text: '00:00:00', days: 0, hours: '00', mins: '00', secs: '00' };
    }

    const totalSeconds = Math.floor(diff / 1000);
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

  return (
    <div className="space-y-4 animate-in fade-in duration-200 pb-16">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between bg-[#07192e] p-3.5 rounded-2xl border border-[#00e5ff]/30 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoHome}
            className="p-2 rounded-xl bg-[#030a16] border border-gray-700 text-gray-300 hover:text-white hover:border-[#00e5ff] transition-all active:scale-95 flex items-center justify-center"
            title="Back to Home Arena"
          >
            <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-[#00e5ff] animate-pulse" />
              <h2 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
                COMING SOON MATCHES
              </h2>
              <span className="bg-[#00e5ff]/20 text-[#00e5ff] text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-[#00e5ff]/40">
                {comingSoonItems.length} UPCOMING
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Tournaments starting within next 24 hours • Live countdown
            </p>
          </div>
        </div>

        <button
          onClick={refreshFromSupabase}
          disabled={isSyncing}
          className="p-2 rounded-xl bg-[#030a16] border border-gray-800 hover:border-[#00e5ff]/50 text-gray-400 hover:text-[#00e5ff] transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title="Refresh matches from Supabase"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#00e5ff]' : ''}`} />
          <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Info Notice Banner */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-amber-950/60 via-[#07192e] to-[#030a16] border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200/90 shadow-md">
        <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-amber-300 text-[11px] uppercase tracking-wide">
            24-HOUR COUNTDOWN ARENA
          </p>
          <p className="text-[10px] text-gray-300 mt-0.5 leading-relaxed">
            All matches scheduled to start within the next 24 hours appear here with a real-time countdown. Grab your slot before rooms fill up!
          </p>
        </div>
      </div>

      {/* Matches List */}
      <div className="space-y-4">
        {comingSoonItems.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 px-4 bg-[#07192e]/40 rounded-2xl border border-gray-800 space-y-3 shadow-inner">
            <div className="w-14 h-14 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center mx-auto text-[#00e5ff]">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">No Matches Starting In Next 24 Hours</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                No active countdown matches found within the 24-hour window. Explore all scheduled tournaments in the Esports Arena!
              </p>
            </div>
            <button
              onClick={onGoHome}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-black text-xs shadow-md uppercase tracking-wider active:scale-95 transition-all"
            >
              EXPLORE ARENA MATCHES
            </button>
          </div>
        ) : (
          comingSoonItems.map(({ match: m, targetTime, isDelayedRegistration }) => {
            const countdown = formatCountdown(targetTime);
            const isFull = m.booked_slots >= m.max_slots;

            return (
              <div
                key={m.id}
                className="relative rounded-2xl bg-gradient-to-br from-[#07192e] via-[#041224] to-[#020710] border border-[#00e5ff]/30 overflow-hidden shadow-xl space-y-0 hover:border-[#00e5ff]/60 transition-all"
              >
                {/* Match Banner Top Section */}
                <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-gray-900">
                  <img
                    src={
                      m.banner_url ||
                      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80'
                    }
                    alt={m.title}
                    className="w-full h-full object-cover brightness-75 hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#041224] via-black/40 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                    <span className="bg-[#00e5ff] text-[#030a16] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow">
                      {m.squad_type}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${getMapBadgeColor(m.map)}`}>
                      {m.map}
                    </span>
                    <span className="bg-gray-800/80 text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-700 backdrop-blur-sm uppercase">
                      {m.type}
                    </span>
                    {m.type === 'tournament' && (
                      <span className="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 shadow">
                        <Trophy className="w-3 h-3" /> TOURNAMENT
                      </span>
                    )}
                  </div>

                  <div className="absolute top-2.5 right-2.5">
                    <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black text-[10px] px-2.5 py-1 rounded-full shadow flex items-center gap-1 uppercase tracking-wide font-mono">
                      <Clock className="w-3 h-3 text-[#00e5ff] animate-pulse" />
                      STARTS IN {countdown.text}
                    </span>
                  </div>

                  {/* Title overlay on banner bottom */}
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <h3 className="text-base sm:text-lg font-black text-white drop-shadow-md truncate">
                      {m.title}
                    </h3>
                    <p className="text-[10px] text-gray-300 font-semibold flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#00e5ff]" />
                        {m.match_time}
                      </span>
                      <span>•</span>
                      <span>{m.version}</span>
                    </p>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-3.5 space-y-3">
                  {/* BIG LIVE COUNTDOWN TIMER BLOCK */}
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-black/80 via-[#07192e] to-black/80 border border-[#00e5ff]/40 text-center shadow-inner">
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-black text-amber-400 tracking-wider uppercase mb-1.5">
                      <Hourglass className="w-4 h-4 text-[#00e5ff] animate-spin" />
                      <span>{isDelayedRegistration ? 'REGISTRATION OPENS IN' : 'MATCH STARTS IN'}</span>
                    </div>

                    {/* Big Countdown Digits */}
                    <div className="flex items-center justify-center gap-2 py-1">
                      {countdown.days > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-2xl sm:text-3xl font-black text-white font-mono bg-[#030a16] px-3 py-1 rounded-lg border border-gray-800 min-w-[44px] shadow">
                            {countdown.days}d
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase mt-1">DAYS</span>
                        </div>
                      )}
                      <div className="flex flex-col items-center">
                        <span className="text-2xl sm:text-3xl font-black text-[#00e5ff] font-mono bg-[#030a16] px-3 py-1 rounded-lg border border-[#00e5ff]/40 min-w-[44px] shadow">
                          {countdown.hours}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase mt-1">HOURS</span>
                      </div>
                      <span className="text-xl font-black text-[#00e5ff] -mt-4">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-2xl sm:text-3xl font-black text-[#00e5ff] font-mono bg-[#030a16] px-3 py-1 rounded-lg border border-[#00e5ff]/40 min-w-[44px] shadow">
                          {countdown.mins}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase mt-1">MINS</span>
                      </div>
                      <span className="text-xl font-black text-[#00e5ff] -mt-4">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono bg-[#030a16] px-3 py-1 rounded-lg border border-amber-500/40 min-w-[44px] shadow">
                          {countdown.secs}
                        </span>
                        <span className="text-[9px] text-amber-400 font-bold uppercase mt-1">SECS</span>
                      </div>
                    </div>

                    <div className="mt-1 text-[10px] text-gray-400 font-medium">
                      {isDelayedRegistration
                        ? 'Booking opens automatically when timer reaches zero'
                        : 'Room details will be unlocked prior to match commencement'}
                    </div>
                  </div>

                  {/* Financial & Slot Details Grid */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-[#030a16] border border-gray-800">
                      <span className="text-[9px] text-gray-400 block font-bold uppercase">ENTRY FEE</span>
                      <span className="text-xs font-black text-emerald-400">
                        RS. {m.entry_fee} <span className="text-[9px]">PKR</span>
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#030a16] border border-gray-800">
                      <span className="text-[9px] text-gray-400 block font-bold uppercase">PRIZE POOL</span>
                      <span className="text-xs font-black text-amber-400">
                        RS. {Number(m.prizes?.total_pool ?? m.entry_fee ?? 0).toLocaleString()} <span className="text-[9px]">PKR</span>
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#030a16] border border-gray-800">
                      <span className="text-[9px] text-gray-400 block font-bold uppercase">SLOTS</span>
                      <span className="text-xs font-black text-white">
                        {m.booked_slots} / {m.max_slots}
                      </span>
                    </div>
                  </div>

                  {/* Multi-maps info if tournament */}
                  {m.maps && m.maps.length > 0 && (
                    <div className="text-[10px] text-gray-300 bg-[#030a16] p-2 rounded-lg border border-gray-800/80 flex items-center justify-between">
                      <span className="font-bold text-gray-400">Match Maps Rotation:</span>
                      <span className="font-black text-[#00e5ff]">{m.maps.join(' ➔ ')}</span>
                    </div>
                  )}

                  {/* Action Button: Book Slot Now or View Details */}
                  {isDelayedRegistration ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl bg-[#030a16] border border-gray-800 text-gray-400 font-extrabold text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-90 shadow"
                    >
                      <Lock className="w-4 h-4 text-amber-400" />
                      <span>BOOKING OPENS WHEN TIMER ENDS</span>
                    </button>
                  ) : isFull ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-90 shadow"
                    >
                      <Lock className="w-4 h-4 text-amber-400" />
                      <span>MATCH SLOTS FULL</span>
                    </button>
                  ) : onSelectMatch ? (
                    <button
                      onClick={() => onSelectMatch(m)}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] hover:from-[#33ecff] hover:to-[#1a94ff] text-[#030a16] font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#00e5ff]/20 active:scale-[0.98] transition-all uppercase tracking-wide"
                    >
                      <Gamepad2 className="w-4 h-4 text-[#030a16]" />
                      <span>SLOT BOOK NOW • RS. {m.entry_fee} PKR</span>
                    </button>
                  ) : null}

                  {onSelectMatch && !isDelayedRegistration && (
                    <button
                      onClick={() => onSelectMatch(m)}
                      className="w-full py-1.5 rounded-lg bg-[#07192e] hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 text-[11px] font-bold transition-all text-center"
                    >
                      View Full Prize Pool & Match Rules
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
