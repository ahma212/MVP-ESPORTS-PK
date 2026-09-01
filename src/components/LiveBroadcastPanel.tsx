import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Match, UserProfile } from '../types';
import { applyLiveBroadcastEvent, reverseLiveBroadcastEvent, advanceLiveBroadcastMatch, snapshotLiveBroadcastMatch } from '../lib/liveBroadcastEngine';

type BroadcastSessionRow = {
  id: string;
  tournament_id?: string | null;
  tournament_title?: string | null;
  total_matches: number;
  current_match_number: number;
  current_match_id?: string | null;
  current_map?: string | null;
  current_match_type?: string | null;
  current_squad_type?: string | null;
  status: string;
  overlay_enabled: boolean;
  top_three_enabled: boolean;
  bottom_bar_enabled: boolean;
  scoreboard_enabled: boolean;
  stream_url?: string | null;
};

type BroadcastMatchRow = {
  id: string;
  session_id: string;
  match_id: string;
  match_number: number;
  map?: string | null;
  match_type?: string | null;
  squad_type?: string | null;
  status: string;
  scoring_snapshot?: Record<string, any>;
};

type BroadcastTeamRow = {
  id: string;
  created_at?: string | null;
  session_id: string;
  broadcast_match_id?: string | null;
  team_key: string;
  team_name: string;
  team_logo_url?: string | null;
  current_match_kills: number;
  current_match_points: number;
  current_alive_players: number;
  tournament_total_kills: number;
  tournament_total_points: number;
  rank?: number | null;
  is_eliminated: boolean;
};

type BroadcastPlayerRow = {
  id: string;
  created_at?: string | null;
  session_id: string;
  broadcast_match_id?: string | null;
  team_id?: string | null;
  profile_id?: string | null;
  player_uid?: string | null;
  player_name: string;
  // Derived identity fields. These are calculated from the original slot_booking
  // roster and are intentionally NOT written to live_broadcast_players columns.
  team_number?: number | null;
  player_number?: number | null;
  slot_number?: number | null;
  current_match_kills: number;
  is_alive: boolean;
  is_knocked?: boolean;
  tournament_kills: number;
};

type LiveBroadcastPanelProps = {
  matches: Match[];
  userProfile?: UserProfile | null;
};

type ScoreRuleDraft = {
  key: string;
  label: string;
  type: 'kill' | 'placement';
  placement_position: number | null;
  points: number;
  enabled: boolean;
};

const DEFAULT_PLACEMENT_RULES: ScoreRuleDraft[] = [1, 2, 3, 4, 5].map((position) => ({
  key: `placement-${position}`,
  label: `Top ${position}`,
  type: 'placement',
  placement_position: position,
  points: position === 1 ? 10 : position === 2 ? 6 : position === 3 ? 5 : position === 4 ? 4 : 3,
  enabled: true,
}));

const DEFAULT_RULES: ScoreRuleDraft[] = [
  {
    key: 'kill',
    label: 'Kill',
    type: 'kill',
    placement_position: null,
    points: 1,
    enabled: true,
  },
  ...DEFAULT_PLACEMENT_RULES,
];

const cleanName = (value: unknown) => String(value ?? '').trim();

const getMatchMaps = (match: any): string[] => {
  if (Array.isArray(match?.maps) && match.maps.length) {
    return match.maps
      .map((m: any) => cleanName(typeof m === 'string' ? m : (m?.name || m?.map || m?.title || m?.label)))
      .filter(Boolean);
  }
  if (match?.map) return [cleanName(match.map)];
  return ['Erangel'];
};

const getMatchTypeLabel = (match: any) => cleanName(match?.type || match?.match_type || 'match').toUpperCase();
const getSquadTypeLabel = (match: any) => cleanName(match?.squad_type || '').toUpperCase();

const teamKeyFromBooking = (booking: any, fallbackIndex: number, squadSize: number) => {
  // TEAM NUMBER is the stable identity. Team name is display data only.
  const identity = getTeamAndPlayerNumber(booking, fallbackIndex, squadSize);
  return `team-${identity.teamNumber}`;
};

const getCanonicalTeamKey = (teamNumber: number) => `team-${Math.max(1, Number(teamNumber) || 1)}`;

const getStoredTeamNumber = (team: any, fallback: number) => {
  const key = cleanName(team?.team_key);
  const keyMatch = key.match(/(?:^|\D)team[-_ ]?(\d+)(?:\D|$)/i);
  if (keyMatch) return Number(keyMatch[1]);
  return parseTeamNumber(team?.team_name, fallback);
};

const chooseCanonicalTeam = (teams: any[], teamNumber: number, fallbackIndex: number) => {
  const candidates = (teams || []).filter((team: any, index: number) =>
    getStoredTeamNumber(team, index + 1) === teamNumber
  );
  if (!candidates.length) return null;
  return [...candidates].sort((a: any, b: any) => {
    const aKey = cleanName(a?.team_key);
    const bKey = cleanName(b?.team_key);
    const canonicalKey = getCanonicalTeamKey(teamNumber);
    if (aKey === canonicalKey && bKey !== canonicalKey) return -1;
    if (bKey === canonicalKey && aKey !== canonicalKey) return 1;
    const aScore = Number(a?.tournament_total_points || 0) * 1000000 + Number(a?.tournament_total_kills || 0) * 1000 + Number(a?.current_match_kills || 0);
    const bScore = Number(b?.tournament_total_points || 0) * 1000000 + Number(b?.tournament_total_kills || 0) * 1000 + Number(b?.current_match_kills || 0);
    if (aScore !== bScore) return bScore - aScore;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
  })[0];
};

const getTeamAndPlayerNumber = (booking: any, fallbackIndex: number, squadSize: number) => {
  const slotNumber = Math.max(1, Number(booking?.slot_number || fallbackIndex + 1));
  const size = Math.max(1, Number(squadSize || 1));
  return {
    slotNumber,
    teamNumber: Math.ceil(slotNumber / size),
    playerNumber: ((slotNumber - 1) % size) + 1,
  };
};

const sourceMatchIdFromBroadcastMatchId = (value: unknown) => {
  const raw = cleanName(value);
  const marker = raw.indexOf('__map_');
  return marker > 0 ? raw.slice(0, marker) : raw;
};

const sameText = (a: unknown, b: unknown) => cleanName(a).trim().toLowerCase() === cleanName(b).trim().toLowerCase();

const logoCandidates = (team: any) => {
  const value = team?.team_logo_url || team?.logo_url || team?.team_logo || team?.logo;
  return cleanName(value);
};

const normalizeSquadSize = (value: unknown) => {
  const type = cleanName(value).toUpperCase();
  if (type === 'SOLO') return 1;
  if (type === 'DUO') return 2;
  return 4;
};

const parseTeamNumber = (teamName: unknown, fallback: number) => {
  const raw = cleanName(teamName);
  const match = raw.match(/(?:TEAM\s*#?|TEAM\s+)(\d+)/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const cleanTeamDisplayName = (teamName: unknown, teamNumber: number) => {
  const raw = cleanName(teamName);
  if (!raw) return `TEAM ${teamNumber}`;
  const generic = raw.match(/^TEAM\s*#?\s*(\d+)\s*(?:\((.*?)\))?$/i);
  if (generic) return cleanName(generic[2]) || `TEAM ${generic[1]}`;
  return raw;
};

const getPlayerOptionLabel = (player: BroadcastPlayerRow) => {
  const playerNumber = Number(player.player_number || 0);
  const pn = playerNumber > 0 ? `PLAYER ${playerNumber}` : 'PLAYER';
  return `${pn} • ${cleanName(player.player_name)}`;
};

type TeamGroupView = {
  team: BroadcastTeamRow;
  teamNumber: number;
  displayName: string;
  players: BroadcastPlayerRow[];
  bookedCount: number;
};

export const LiveBroadcastPanel: React.FC<LiveBroadcastPanelProps> = ({ matches, userProfile }) => {
  const isAdmin = Boolean((userProfile as any)?.is_admin === true || (userProfile as any)?.role === 'admin');

  const selectableMatches = useMemo(() => {
    return (matches || []).filter((m: any) => m && m.status !== 'cancelled');
  }, [matches]);

  const singleMatches = useMemo(() => {
    return selectableMatches.filter((match: any) => cleanName(match?.type).toLowerCase() !== 'tournament');
  }, [selectableMatches]);

  // Tournament records in MVP ESPORTS are stored as one Match row with maps[].
  // Expand those maps into virtual Match 1/2/3... records for broadcasting
  // without modifying the existing matches table.
  type TournamentGroup = { key: string; title: string; source: Match[]; series: any[] };

  const tournamentGroups = useMemo<TournamentGroup[]>(() => {
    const grouped = new Map<string, { key: string; title: string; source: Match[] }>();

    selectableMatches
      .filter((match: any) => cleanName(match?.type).toLowerCase() === 'tournament')
      .forEach((match: any, index: number) => {
        const tournamentId = cleanName(match?.tournament_id || match?.tournamentId || match?.tournament?.id);
        const tournamentTitle = cleanName(
          match?.tournament_title ||
          match?.tournamentTitle ||
          match?.tournament?.title ||
          match?.title
        );
        const key = tournamentId || tournamentTitle || `tournament-${match?.id || index}`;

        const existing = grouped.get(key);
        if (existing) existing.source.push(match);
        else grouped.set(key, { key, title: tournamentTitle || `Tournament ${grouped.size + 1}`, source: [match] });
      });

    return Array.from(grouped.values()).map((group) => {
      const series: any[] = [];

      group.source.forEach((sourceMatch: any) => {
        getMatchMaps(sourceMatch).forEach((mapName) => {
          const matchNumber = series.length + 1;
          series.push({
            ...sourceMatch,
            id: `${String(sourceMatch.id)}__map_${matchNumber}`,
            source_match_id: String(sourceMatch.id),
            map: mapName,
            maps: [mapName],
            tournament_match_number: matchNumber,
            title: `Match ${matchNumber}`,
          });
        });
      });

      return { ...group, series };
    });
  }, [selectableMatches]);

  const [broadcastType, setBroadcastType] = useState<'tournament' | 'single'>('tournament');
  const [selectedTournamentKey, setSelectedTournamentKey] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedMapIndex, setSelectedMapIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(1);
  const [streamUrl, setStreamUrl] = useState('');
  const [rules, setRules] = useState<ScoreRuleDraft[]>(DEFAULT_RULES);
  const [session, setSession] = useState<BroadcastSessionRow | null>(null);
  const [broadcastMatches, setBroadcastMatches] = useState<BroadcastMatchRow[]>([]);
  const [teams, setTeams] = useState<BroadcastTeamRow[]>([]);
  const [players, setPlayers] = useState<BroadcastPlayerRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [liveAction, setLiveAction] = useState(false);
const [testKillerId, setTestKillerId] = useState('');
const [testVictimId, setTestVictimId] = useState('');
const [pointsAdjustment, setPointsAdjustment] = useState('0');

const killerSelectRef = useRef<HTMLSelectElement>(null);
const victimSelectRef = useRef<HTMLSelectElement>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlacement, setSelectedPlacement] = useState('1');
  const [lastEventId, setLastEventId] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  const [visible, setVisible] = useState({ scoreboard: false, top3: false, bottom: true });
  const [restoringExistingSession, setRestoringExistingSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const sessionRef = useRef<BroadcastSessionRow | null>(null);

  const activeTournament = useMemo(() => {
    return tournamentGroups.find((group) => group.key === selectedTournamentKey) || null;
  }, [tournamentGroups, selectedTournamentKey]);

  const currentMatch = useMemo(() => {
    if (broadcastType === 'single') {
      return singleMatches.find((m: any) => String(m.id) === String(selectedMatchId)) || singleMatches[0] || null;
    }

    return activeTournament?.series.find((m: any) => String(m.id) === String(selectedMatchId)) || activeTournament?.series[0] || null;
  }, [broadcastType, singleMatches, selectedMatchId, activeTournament]);

  const squadSize = useMemo(() => {
    const type = getSquadTypeLabel(currentMatch);
    if (type === 'DUO') return 2;
    if (type === 'SOLO') return 1;
    return 4;
  }, [currentMatch]);

  const ensureBroadcastMatchRows = async (sessionData: BroadcastSessionRow) => {
    if (!supabase || !sessionData?.id) return [];

    const { data: existingRows, error: existingError } = await supabase
      .from('live_broadcast_matches')
      .select('*')
      .eq('session_id', sessionData.id)
      .order('match_number', { ascending: true });
    if (existingError) throw existingError;

    const existing = (existingRows || []) as BroadcastMatchRow[];
    const sourceMatches: any[] = sessionData.tournament_id
      ? (activeTournament?.series || [])
      : (currentMatch ? [currentMatch] : []);
    const targetMatches = sourceMatches.length
      ? sourceMatches.slice(0, Math.max(1, Number(sessionData.total_matches || 1)))
      : [];

    const rowsToCreate: any[] = [];
    if (targetMatches.length) {
      targetMatches.forEach((match: any, index: number) => {
        const matchNumber = index + 1;
        if (existing.some((row) => Number(row.match_number) === matchNumber)) return;
        rowsToCreate.push({
          session_id: sessionData.id,
          match_id: String(match.id),
          match_number: matchNumber,
          map: getMatchMaps(match)[0] || cleanName(match?.map) || 'Erangel',
          match_type: getMatchTypeLabel(match),
          squad_type: getSquadTypeLabel(match),
          status: matchNumber === Number(sessionData.current_match_number || 1) ? 'live' : 'pending',
          started_at: matchNumber === Number(sessionData.current_match_number || 1) ? new Date().toISOString() : null,
          scoring_snapshot: rules,
        });
      });
    } else if (sessionData.current_match_id) {
      const matchNumber = Math.max(1, Number(sessionData.current_match_number || 1));
      if (!existing.some((row) => Number(row.match_number) === matchNumber)) {
        rowsToCreate.push({
          session_id: sessionData.id,
          match_id: sourceMatchIdFromBroadcastMatchId(sessionData.current_match_id),
          match_number: matchNumber,
          map: sessionData.current_map || 'Erangel',
          match_type: sessionData.current_match_type || 'MATCH',
          squad_type: sessionData.current_squad_type || 'SQUAD',
          status: String(sessionData.status).toLowerCase() === 'completed' ? 'completed' : 'live',
          started_at: new Date().toISOString(),
          scoring_snapshot: rules,
        });
      }
    }

    if (rowsToCreate.length) {
      const { data: created, error: createError } = await supabase
        .from('live_broadcast_matches')
        .insert(rowsToCreate)
        .select('*');
      if (createError) throw createError;
      return [...existing, ...((created || []) as BroadcastMatchRow[])].sort((a, b) => Number(a.match_number) - Number(b.match_number));
    }

    return existing;
  };

  const loadSession = async (sessionId: string) => {
    if (!supabase || !sessionId) return;
    const sessionResult = await supabase.from('live_broadcast_sessions').select('*').eq('id', sessionId).maybeSingle();
    const matchResult = await supabase
  .from('live_broadcast_matches')
  .select('*')
  .eq('session_id', sessionId)
  .order('match_number', { ascending: true });

const eventResult = await supabase
  .from('live_broadcast_events')
  .select('*')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: false })
  .limit(25);

if (sessionResult.error) throw sessionResult.error;
if (matchResult.error) throw matchResult.error;
if (eventResult.error) throw eventResult.error;
if (!sessionResult.data) {
  throw new Error('Broadcast session was not found in Supabase.');
}

const sessionData = sessionResult.data as BroadcastSessionRow;

// First make sure the broadcast match rows exist.
const matchData = await ensureBroadcastMatchRows(sessionData);

// IMPORTANT:
// Reconcile the real slot_bookings roster BEFORE reading
// live_broadcast_teams and live_broadcast_players.
const reconcileSourceMatchId = sourceMatchIdFromBroadcastMatchId(
  matchData[0]?.match_id || sessionData.current_match_id || ''
);

if (reconcileSourceMatchId) {
  await reconcileLiveBroadcastRoster(
    sessionId,
    reconcileSourceMatchId,
    sessionData.current_squad_type || 'SQUAD'
  );
}
// Now read the updated roster AFTER reconciliation.
const { data: freshTeams, error: freshTeamsError } = await supabase
  .from('live_broadcast_teams')
  .select('*')
  .eq('session_id', sessionId)
  .order('rank', { ascending: true, nullsFirst: false });

const { data: freshPlayers, error: freshPlayersError } = await supabase
  .from('live_broadcast_players')
  .select('*')
  .eq('session_id', sessionId)
  .order('player_name', { ascending: true });

if (freshTeamsError) throw freshTeamsError;
if (freshPlayersError) throw freshPlayersError;

const teamResult = {
  data: freshTeams || [],
  error: null,
};

const playerResult = {
  data: freshPlayers || [],
  error: null,
};
    setSession(sessionData);
    setStreamUrl(sessionData.stream_url || '');
    setVisible({
      scoreboard: Boolean(sessionData.scoreboard_enabled),
      top3: Boolean(sessionData.top_three_enabled),
      bottom: Boolean(sessionData.bottom_bar_enabled),
    });
    const typedMatches = matchData;
    const rawTeams = (teamResult.data || []) as BroadcastTeamRow[];
    const typedPlayers = (playerResult.data || []) as BroadcastPlayerRow[];

    // Rebuild Team Number + Player Number from confirmed slot_bookings.
    // Team number is the stable identity; duplicate legacy broadcast rows are
    // collapsed in memory so the Admin UI never shows duplicate teams/players.
    const rosterSourceMatchId = sourceMatchIdFromBroadcastMatchId(
      typedMatches[0]?.match_id || sessionData?.current_match_id
    );
    const rosterSquadSize = normalizeSquadSize(getSquadTypeLabel(sessionData));
    let rosterBookings: any[] = [];

    if (rosterSourceMatchId && supabase) {
      const { data, error: rosterError } = await supabase
        .from('slot_bookings')
        .select('player_id,user_id,player_uid,player_ign,team_name,slot_number')
        .eq('match_id', rosterSourceMatchId)
        .eq('status', 'confirmed')
        .order('slot_number', { ascending: true });
      if (!rosterError && data) rosterBookings = data;
    }

    const bookingRows = rosterBookings.map((booking, index) => ({
      booking,
      identity: getTeamAndPlayerNumber(booking, index, rosterSquadSize),
    }));

    const teamNumberByTeamId = new Map<string, number>();
    const teamRowsByNumber = new Map<number, BroadcastTeamRow[]>();

    rawTeams.forEach((team, index) => {
      const relatedBooking = bookingRows.find((row) =>
        sameText(row.booking?.team_name, team.team_name)
      );
      const number = relatedBooking?.identity.teamNumber || getStoredTeamNumber(team, index + 1);
      teamNumberByTeamId.set(String(team.id), number);
      const list = teamRowsByNumber.get(number) || [];
      list.push(team);
      teamRowsByNumber.set(number, list);
    });

    // Add any booked team whose team row was not yet present.
    bookingRows.forEach((row) => {
      if (!teamRowsByNumber.has(row.identity.teamNumber)) teamRowsByNumber.set(row.identity.teamNumber, []);
    });

    const canonicalTeams = Array.from(teamRowsByNumber.entries())
      .map(([teamNumber, candidates]) => {
        const chosen = chooseCanonicalTeam(candidates, teamNumber, teamNumber - 1);
        if (chosen) teamNumberByTeamId.set(String(chosen.id), teamNumber);
        return chosen;
      })
      .filter(Boolean) as BroadcastTeamRow[];

    const canonicalTeamIdByNumber = new Map<number, string>();
    canonicalTeams.forEach((team) => {
      const relatedBooking = bookingRows.find((row) => sameText(row.booking?.team_name, team.team_name));
      const teamNumber = relatedBooking?.identity.teamNumber || getStoredTeamNumber(team, canonicalTeams.indexOf(team) + 1);
      canonicalTeamIdByNumber.set(teamNumber, String(team.id));
      teamNumberByTeamId.set(String(team.id), teamNumber);
    });

    const findPlayerCandidates = (booking: any) => typedPlayers.filter((player) =>
      (booking.player_uid && player.player_uid && sameText(player.player_uid, booking.player_uid)) ||
      ((booking.player_id || booking.user_id) && player.profile_id &&
        (sameText(player.profile_id, booking.player_id) || sameText(player.profile_id, booking.user_id))) ||
      (booking.player_ign && player.player_name && sameText(player.player_name, booking.player_ign))
    );

    const usedPlayerIds = new Set<string>();
    const enrichedPlayers: BroadcastPlayerRow[] = [];

    for (const row of bookingRows) {
      const candidates = findPlayerCandidates(row.booking)
        .filter((candidate) => !usedPlayerIds.has(String(candidate.id)))
        .sort((a, b) => {
          const expectedTeamId = canonicalTeamIdByNumber.get(row.identity.teamNumber);
          if (String(a.team_id || '') === String(expectedTeamId || '') && String(b.team_id || '') !== String(expectedTeamId || '')) return -1;
          if (String(b.team_id || '') === String(expectedTeamId || '') && String(a.team_id || '') !== String(expectedTeamId || '')) return 1;
          const aScore = Number(a.tournament_kills || 0) * 1000 + Number(a.current_match_kills || 0);
          const bScore = Number(b.tournament_kills || 0) * 1000 + Number(b.current_match_kills || 0);
          if (aScore !== bScore) return bScore - aScore;
          return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });

      const player = candidates[0];
      if (!player) continue;
      usedPlayerIds.add(String(player.id));
      enrichedPlayers.push({
        ...player,
        team_id: player.team_id || canonicalTeamIdByNumber.get(row.identity.teamNumber) || null,
        team_number: row.identity.teamNumber,
        player_number: row.identity.playerNumber,
        slot_number: row.identity.slotNumber,
      });
    }

    // Backward-compatible fallback for any legacy player that cannot be mapped to a booking.
    typedPlayers.forEach((player) => {
      if (usedPlayerIds.has(String(player.id))) return;
      const teamNumber = teamNumberByTeamId.get(String(player.team_id || ''));
      if (!teamNumber) return;
      const sameTeamPlayers = enrichedPlayers.filter((item) => item.team_number === teamNumber);
      enrichedPlayers.push({
        ...player,
        team_number: teamNumber,
        player_number: sameTeamPlayers.length + 1,
      });
      usedPlayerIds.add(String(player.id));
    });
setBroadcastMatches(typedMatches);
setTeams((teamResult.data || []) as BroadcastTeamRow[]);
setPlayers(enrichedPlayers);
setRecentEvents(eventResult.data || []);
  };


  // Keep a ref to the active broadcast so closing/navigating away from the Admin
  // panel can pause the persisted Supabase session instead of deleting it.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const pauseBroadcastOnDisconnect = async () => {
    const active = sessionRef.current;
    if (!active || !supabase || !isAdmin) return;
    if (!['ready', 'live'].includes(String(active.status).toLowerCase())) return;

    try {
      const { error } = await supabase
        .from('live_broadcast_sessions')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', active.id)
        .in('status', ['ready', 'live']);

      if (error) {
        console.warn('[MVP LIVE] Could not persist PAUSED state on disconnect:', error);
      }
    } catch (error) {
      console.warn('[MVP LIVE] Pause-on-disconnect failed:', error);
    }
  };

  // A React unmount (Admin modal close/navigation) must not destroy the broadcast.
  // Marking it paused makes the session resumable when the admin returns.
  useEffect(() => {
    if (!isAdmin) return;
    return () => {
      void pauseBroadcastOnDisconnect();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !supabase) return;

    const handleOffline = () => {
      void pauseBroadcastOnDisconnect();
    };

    const handleOnline = () => {
      // Realtime/session reload is handled by the existing effects below.
      if (sessionRef.current?.id) void loadSession(sessionRef.current.id);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [isAdmin]);

  const resumeBroadcast = async () => {
    if (!session || !supabase) return;
    setLiveAction(true);
    try {
      const { data, error } = await supabase
        .from('live_broadcast_sessions')
        .update({
          status: 'live',
          overlay_enabled: true,
          scoreboard_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)
        .select('*')
        .single();

      if (error) throw error;
      const resumedSession = data as BroadcastSessionRow;
      await ensureBroadcastMatchRows(resumedSession);
      setSession(resumedSession);
      await loadSession(session.id);
      show('success', 'Existing broadcast resumed from the saved state.');
    } catch (error: any) {
      console.error('[MVP LIVE] resumeBroadcast error:', error);
      show('error', error?.message || 'Failed to resume broadcast.');
    } finally {
      setLiveAction(false);
    }
  };

  const deleteBroadcast = async () => {
    if (!session || !supabase) return;

    const confirmed = window.confirm(
      'DELETE this broadcast session?\n\nThis removes only the broadcast session data. Tournament matches, slot bookings, players, and wallet data will NOT be deleted.'
    );
    if (!confirmed) return;

    setDeletingSession(true);
    try {
      const sessionId = session.id;

      // Delete children explicitly so this remains safe even if the database
      // foreign keys do not all use ON DELETE CASCADE.
      const deleteSteps = [
        'live_broadcast_events',
        'live_broadcast_players',
        'live_broadcast_teams',
        'live_broadcast_scoring_rules',
        'live_broadcast_matches',
      ] as const;

      for (const table of deleteSteps) {
        const { error } = await supabase.from(table).delete().eq('session_id', sessionId);
        if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
      }

      const { error: sessionDeleteError } = await supabase
        .from('live_broadcast_sessions')
        .delete()
        .eq('id', sessionId);

      if (sessionDeleteError) throw sessionDeleteError;

      sessionRef.current = null;
      setSession(null);
      setBroadcastMatches([]);
      setTeams([]);
      setPlayers([]);
      setRecentEvents([]);
      setTestKillerId('');
      setTestVictimId('');
      setLastEventId('');
      show('success', 'Broadcast session deleted. Tournament and booking data remain untouched.');
    } catch (error: any) {
      console.error('[MVP LIVE] deleteBroadcast error:', error);
      show('error', error?.message || 'Failed to delete broadcast.');
    } finally {
      setDeletingSession(false);
    }
  };

  const findAndRestoreExistingBroadcast = async () => {
    if (!isAdmin || !supabase || restoringExistingSession || session) return;

    const match: any = currentMatch;
    if (!match) return;

    setRestoringExistingSession(true);
    try {
      let existing: any = null;
      let queryError: any = null;

      if (broadcastType === 'tournament') {
        const tournamentId = cleanName(
          match?.tournament_id ||
          match?.tournamentId ||
          activeTournament?.source?.[0]?.tournament_id ||
          activeTournament?.source?.[0]?.tournamentId
        );

        if (tournamentId) {
          const result = await supabase
            .from('live_broadcast_sessions')
            .select('*')
            .eq('tournament_id', tournamentId)
            .in('status', ['ready', 'live', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          existing = result.data;
          queryError = result.error;
        }

        // Fallback for older tournament sessions whose tournament_id was not
        // available when they were created.
        if (!existing && !queryError) {
          const result = await supabase
            .from('live_broadcast_sessions')
            .select('*')
            .eq('current_match_id', String(match.id))
            .in('status', ['ready', 'live', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          existing = result.data;
          queryError = result.error;
        }
      } else {
        const sourceId = String(match.id);
        const result = await supabase
          .from('live_broadcast_sessions')
          .select('*')
          .eq('current_match_id', sourceId)
          .is('tournament_id', null)
          .in('status', ['ready', 'live', 'paused'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        existing = result.data;
        queryError = result.error;
      }

      if (queryError) throw queryError;
      if (!existing) return;

      setSession(existing as BroadcastSessionRow);
      setStreamUrl(existing.stream_url || '');

      const sourceMatchId = sourceMatchIdFromBroadcastMatchId(
        String(existing.current_match_id || match.id)
      );

      // Repair an older/incomplete roster when an existing broadcast is reopened.
      await ensureBroadcastMatchRows(existing as BroadcastSessionRow);
      await reconcileLiveBroadcastRoster(
        existing.id,
        sourceMatchId,
        existing.current_squad_type || getSquadTypeLabel(match) || 'SQUAD'
      );

      await loadSession(existing.id);

      show(
        'info',
        String(existing.status).toLowerCase() === 'paused'
          ? 'Existing broadcast restored. Press START AGAIN / RESUME to continue.'
          : 'Existing broadcast restored from Supabase.'
      );
    } catch (error: any) {
      console.error('[MVP LIVE] restore existing broadcast error:', error);
      show('error', error?.message || 'Could not restore an existing broadcast.');
    } finally {
      setRestoringExistingSession(false);
    }
  };

  // Every time the Admin returns to the Live Broadcast tab, first look for a
  // non-completed broadcast for the selected tournament/match.
  useEffect(() => {
    if (!isAdmin || session || !currentMatch) return;
    void findAndRestoreExistingBroadcast();
  }, [
    isAdmin,
    session?.id,
    broadcastType,
    selectedTournamentKey,
    selectedMatchId,
    currentMatch?.id,
  ]);

  useEffect(() => {
    if (!isAdmin || !supabase || !session?.id) return;
    const channel = supabase
      .channel(`mvp-live-broadcast-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_sessions', filter: `id=eq.${session.id}` }, () => loadSession(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_matches', filter: `session_id=eq.${session.id}` }, () => loadSession(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_teams', filter: `session_id=eq.${session.id}` }, () => loadSession(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_players', filter: `session_id=eq.${session.id}` }, () => loadSession(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_events', filter: `session_id=eq.${session.id}` }, () => loadSession(session.id))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, session?.id]);

  useEffect(() => {
    if (broadcastType === 'tournament') {
      const firstTournament = tournamentGroups[0];

      if (!firstTournament) {
        setSelectedTournamentKey('');
        setSelectedMatchId('');
        setTotalMatches(1);
        return;
      }

      const selectedGroup = tournamentGroups.find((group) => group.key === selectedTournamentKey) || firstTournament;

      if (selectedGroup.key !== selectedTournamentKey) setSelectedTournamentKey(selectedGroup.key);

      if (!selectedGroup.series.some((m: any) => String(m.id) === String(selectedMatchId))) {
        setSelectedMatchId(String(selectedGroup.series[0]?.id || ''));
      }

      setTotalMatches(Math.max(1, Math.min(20, selectedGroup.series.length || 1)));
    } else {
      setSelectedTournamentKey('');

      if (!singleMatches.length) {
        setSelectedMatchId('');
        setTotalMatches(1);
        return;
      }

      if (!singleMatches.some((m: any) => String(m.id) === String(selectedMatchId))) {
        setSelectedMatchId(String(singleMatches[0].id));
      }

      setTotalMatches(1);
    }
  }, [broadcastType, tournamentGroups, selectedTournamentKey, selectedMatchId, singleMatches]);

  useEffect(() => {
    if (currentMatch) setSelectedMapIndex(0);
  }, [selectedMatchId]);

  const show = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const buildSessionTeamsAndPlayers = async (newSessionId: string, targetMatches: Match[]) => {
    if (!supabase || !targetMatches.length) return;

    const rosterMatch: any = targetMatches[0];
    const rosterSourceMatchId = sourceMatchIdFromBroadcastMatchId(
  String(rosterMatch?.source_match_id || rosterMatch?.id || '')
);
    const rosterSquadSize = normalizeSquadSize(getSquadTypeLabel(rosterMatch));

    // Build exactly one broadcast-match row per selected match.
    const matchRows: Array<any> = targetMatches.map((match: any, matchIndex: number) => {
      const maps = getMatchMaps(match);
      return {
        session_id: newSessionId,
        match_id: String(match.id),
        match_number: matchIndex + 1,
        map: maps[0] || cleanName(match?.map) || 'Erangel',
        match_type: getMatchTypeLabel(match),
        squad_type: getSquadTypeLabel(match),
        status: matchIndex === 0 ? 'live' : 'pending',
        started_at: matchIndex === 0 ? new Date().toISOString() : null,
        scoring_snapshot: rules,
      };
    });

    const { error: bookingError, data: bookingData } = await supabase
      .from('slot_bookings')
      .select('id,match_id,slot_number,team_name,player_ign,player_uid,player_id,user_id')
      .eq('match_id', rosterSourceMatchId)
      .eq('status', 'confirmed')
      .order('slot_number', { ascending: true });
    if (bookingError) throw bookingError;

    const uniqueTeamMap = new Map<number, { name: string; logo: string }>();
    const playerRows: Array<any> = [];

    (bookingData || []).forEach((booking: any, bookingIndex: number) => {
      const identity = getTeamAndPlayerNumber(booking, bookingIndex, rosterSquadSize);
      const teamNumber = identity.teamNumber;
      const teamName = cleanName(booking?.team_name) || `TEAM ${teamNumber}`;
      if (!uniqueTeamMap.has(teamNumber)) {
        uniqueTeamMap.set(teamNumber, {
          name: teamName,
          logo: logoCandidates(booking),
        });
      }
      playerRows.push({
        session_id: newSessionId,
        team_number: teamNumber,
        player_number: identity.playerNumber,
        slot_number: identity.slotNumber,
        player_uid: cleanName(booking.player_uid) || null,
        player_name: cleanName(booking.player_ign) || `Player ${bookingIndex + 1}`,
        profile_id: booking.player_id || booking.user_id || null,
      });
    });

    const { data: createdMatches, error: matchInsertError } = await supabase
      .from('live_broadcast_matches')
      .insert(matchRows)
      .select('*');
    if (matchInsertError) throw matchInsertError;

    const firstCreated = (createdMatches || [])[0] as BroadcastMatchRow | undefined;

    const teamInsertRows = Array.from(uniqueTeamMap.entries()).map(([teamNumber, value]) => ({
      session_id: newSessionId,
      broadcast_match_id: null,
      team_key: getCanonicalTeamKey(teamNumber),
      team_name: value.name,
      team_logo_url: value.logo || null,
      current_match_kills: 0,
      current_match_points: 0,
      current_alive_players: playerRows.filter((row) => row.team_number === teamNumber).length,
      tournament_total_kills: 0,
      tournament_total_points: 0,
      is_eliminated: false,
    }));

    const { data: createdTeams, error: teamInsertError } = await supabase
      .from('live_broadcast_teams')
      .insert(teamInsertRows)
      .select('*');
    if (teamInsertError) throw teamInsertError;

    const createdTeamMap = new Map<number, any>(
      (createdTeams || []).map((row: any, index: number) => [
        Number((teamInsertRows[index] as any)?.team_key?.replace('team-', '')),
        row,
      ])
    );

    const playerInsertRows = playerRows.map((row) => ({
      session_id: newSessionId,
      broadcast_match_id: firstCreated?.id || null,
      team_id: createdTeamMap.get(Number(row.team_number))?.id || null,
      profile_id: row.profile_id,
      player_uid: row.player_uid,
      player_name: row.player_name,
      current_match_kills: 0,
      is_alive: true,
      is_knocked: false,
      tournament_kills: 0,
    }));

    if (playerInsertRows.length) {
      const { error: playerInsertError } = await supabase
        .from('live_broadcast_players')
        .insert(playerInsertRows);
      if (playerInsertError) throw playerInsertError;
    }
  };

  const reconcileLiveBroadcastRoster = async (sessionId: string, sourceMatchId: string, sourceSquadType: string) => {
    if (!supabase || !sessionId || !sourceMatchId) return;

    const { data: bookings, error } = await supabase
      .from('slot_bookings')
      .select('id,match_id,slot_number,team_name,player_ign,player_uid,player_id,user_id')
      .eq('match_id', sourceMatchId)
      .eq('status', 'confirmed')
      .order('slot_number', { ascending: true });
    if (error) throw error;
    if (!bookings?.length) return;

    const size = normalizeSquadSize(sourceSquadType);
    const { data: existingTeams, error: teamLoadError } = await supabase
      .from('live_broadcast_teams')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (teamLoadError) throw teamLoadError;

    const { data: existingPlayers, error: playerLoadError } = await supabase
      .from('live_broadcast_players')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (playerLoadError) throw playerLoadError;

    const groups = new Map<number, any[]>();
    bookings.forEach((booking: any, index: number) => {
      const identity = getTeamAndPlayerNumber(booking, index, size);
      const list = groups.get(identity.teamNumber) || [];
      list.push({ booking, identity });
      groups.set(identity.teamNumber, list);
    });

    for (const [teamNumber, rows] of groups.entries()) {
      let team = chooseCanonicalTeam(existingTeams || [], teamNumber, teamNumber - 1);
      const firstBooking = rows[0]?.booking;
      const canonicalKey = getCanonicalTeamKey(teamNumber);
      const displayName = cleanName(firstBooking?.team_name) || `TEAM ${teamNumber}`;

      if (!team) {
        const { data: createdTeam, error: teamError } = await supabase
          .from('live_broadcast_teams')
          .insert({
            session_id: sessionId,
            broadcast_match_id: null,
            team_key: canonicalKey,
            team_name: displayName,
            team_logo_url: logoCandidates(firstBooking) || null,
            current_match_kills: 0,
            current_match_points: 0,
            current_alive_players: rows.length,
            tournament_total_kills: 0,
            tournament_total_points: 0,
            is_eliminated: false,
          })
          .select('*')
          .single();
        if (teamError) throw teamError;
        team = createdTeam;
        if (Array.isArray(existingTeams)) existingTeams.push(team);
      } else {
        // Normalize the reusable team identity without changing its live score/state.
        const patch: Record<string, any> = {};
        if (cleanName(team.team_key) !== canonicalKey) patch.team_key = canonicalKey;
        if (!cleanName(team.team_name) && displayName) patch.team_name = displayName;
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString();
          const { data: updatedTeam, error: updateTeamError } = await supabase
            .from('live_broadcast_teams')
            .update(patch)
            .eq('id', team.id)
            .select('*')
            .single();
          if (updateTeamError) throw updateTeamError;
          team = updatedTeam || { ...team, ...patch };
          const teamIndex = (existingTeams || []).findIndex((item: any) => item.id === team.id);
          if (teamIndex >= 0) (existingTeams as any[])[teamIndex] = team;
        }
      }

      let aliveCount = 0;
      for (const row of rows) {
        const booking = row.booking;
        const matchesPlayer = (player: any) => {
          const uidMatch = Boolean(booking.player_uid && player.player_uid && sameText(player.player_uid, booking.player_uid));
          const profileMatch = Boolean(
            (booking.player_id || booking.user_id) &&
            player.profile_id &&
            (sameText(player.profile_id, booking.player_id) || sameText(player.profile_id, booking.user_id))
          );
          const nameMatch = Boolean(player.player_name && booking.player_ign && sameText(player.player_name, booking.player_ign));
          return uidMatch || profileMatch || nameMatch;
        };

        const candidates = (existingPlayers || []).filter(matchesPlayer);
        const canonicalPlayer = candidates.sort((a: any, b: any) => {
          if (a.team_id === team.id && b.team_id !== team.id) return -1;
          if (b.team_id === team.id && a.team_id !== team.id) return 1;
          const aScore = Number(a?.tournament_kills || 0) * 1000 + Number(a?.current_match_kills || 0);
          const bScore = Number(b?.tournament_kills || 0) * 1000 + Number(b?.current_match_kills || 0);
          if (aScore !== bScore) return bScore - aScore;
          return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
        })[0];

        if (canonicalPlayer) {
          if (canonicalPlayer.team_id !== team.id) {
            const { data: updatedPlayer, error: updatePlayerError } = await supabase
              .from('live_broadcast_players')
              .update({ team_id: team.id, updated_at: new Date().toISOString() })
              .eq('id', canonicalPlayer.id)
              .select('*')
              .single();
            if (updatePlayerError) throw updatePlayerError;
            Object.assign(canonicalPlayer, updatedPlayer || {});
          }
          if (canonicalPlayer.is_alive) aliveCount += 1;
        } else {
          const { data: createdPlayer, error: playerError } = await supabase
            .from('live_broadcast_players')
            .insert({
              session_id: sessionId,
              broadcast_match_id: null,
              team_id: team.id,
              profile_id: booking.player_id || booking.user_id || null,
              player_uid: cleanName(booking.player_uid) || null,
              player_name: cleanName(booking.player_ign) || `Player ${row.identity.playerNumber}`,
              current_match_kills: 0,
              is_alive: true,
              is_knocked: false,
              tournament_kills: 0,
            })
            .select('*')
            .single();
          if (playerError) throw playerError;
          if (Array.isArray(existingPlayers)) existingPlayers.push(createdPlayer);
          aliveCount += 1;
        }
      }

      const normalizedAliveCount = Math.max(0, Math.min(rows.length, aliveCount));
      if (Number(team.current_alive_players) !== normalizedAliveCount) {
        const { error: aliveError } = await supabase
          .from('live_broadcast_teams')
          .update({ current_alive_players: normalizedAliveCount, updated_at: new Date().toISOString() })
          .eq('id', team.id);
        if (aliveError) throw aliveError;
      }
    }
  };

  const startNewBroadcast = () => {
    if (session && !['completed', 'cancelled'].includes(String(session.status).toLowerCase())) {
      show('error', 'An existing broadcast is still active. Pause/resume it or delete it before creating a new broadcast.');
      return;
    }
    setSession(null);
    sessionRef.current = null;
    setBroadcastMatches([]);
    setTeams([]);
    setPlayers([]);
    setRecentEvents([]);
    setTestKillerId('');
    setTestVictimId('');
    setLastEventId('');
    setSelectedTournamentKey('');
    setSelectedMatchId('');
    setMessage(null);
  };

  const createSession = async () => {
    if (!isAdmin || !supabase || !isSupabaseConfigured()) {
      show('error', 'Admin access and Supabase connection are required.');
      return;
    }
    const targetMatches = broadcastType === 'tournament'
      ? (activeTournament?.series || [])
      : (currentMatch ? [currentMatch] : []);

    if (!targetMatches.length) {
      show('error', broadcastType === 'tournament' ? 'No tournament matches are available.' : 'No single matches are available.');
      return;
    }

    setLoading(true);
    try {
      const requestedCount = broadcastType === 'tournament'
        ? Math.max(1, Math.min(totalMatches, targetMatches.length))
        : 1;

      const selectedMatches = targetMatches.slice(0, requestedCount);
      const firstMatch: any = selectedMatches[0];
      const { data, error } = await supabase.from('live_broadcast_sessions').insert({
        tournament_id: broadcastType === 'tournament'
          ? ((firstMatch as any)?.tournament_id || (firstMatch as any)?.tournamentId || null)
          : null,
        tournament_title: broadcastType === 'tournament'
          ? (activeTournament?.title || cleanName((firstMatch as any)?.tournament_title) || firstMatch?.title || 'MVP ESPORTS Tournament')
          : null,
        total_matches: requestedCount,
        current_match_number: 1,
        current_match_id: String(firstMatch.id),
        current_map: getMatchMaps(firstMatch)[0],
        current_match_type: getMatchTypeLabel(firstMatch),
        current_squad_type: getSquadTypeLabel(firstMatch),
        status: 'ready',
        overlay_enabled: false,
        scoreboard_enabled: false,
        top_three_enabled: false,
        bottom_bar_enabled: true,
        stream_url: streamUrl.trim() || null,
        created_by: (userProfile as any)?.id || null,
      }).select('*').single();
      if (error) throw error;

      const ruleRows = rules.filter((rule) => rule.enabled).map((rule) => ({
        session_id: data.id,
        rule_type: rule.type,
        placement_position: rule.placement_position,
        points: rule.points,
        is_enabled: true,
      }));
      if (ruleRows.length) {
        const { error: ruleError } = await supabase.from('live_broadcast_scoring_rules').insert(ruleRows);
        if (ruleError) throw ruleError;
      }

      // buildSessionTeamsAndPlayers creates the live_broadcast_matches row(s) and
      // the matching team/player snapshot. Do not reconcile the roster first here,
      // otherwise a new session can receive duplicate team/player rows before the
      // live-match records are created. Existing sessions are repaired on load.
      await buildSessionTeamsAndPlayers(data.id, selectedMatches as Match[]);
      setSession(data as BroadcastSessionRow);
      await loadSession(data.id);
      show('success', `Broadcast session created with ${requestedCount} match${requestedCount === 1 ? '' : 'es'}.`);
    } catch (error: any) {
      console.error('[MVP LIVE] createSession error:', error);
      show('error', error?.message || 'Failed to create broadcast session.');
    } finally {
      setLoading(false);
    }
  };

  const updateSession = async (patch: Record<string, any>) => {
    if (!session?.id || !supabase) return;
    setLiveAction(true);
    try {
      const { data, error } = await supabase.from('live_broadcast_sessions').update(patch).eq('id', session.id).select('*').single();
      if (error) throw error;
      setSession(data as BroadcastSessionRow);
      await loadSession(session.id);
    } catch (error: any) {
      console.error('[MVP LIVE] updateSession error:', error);
      show('error', error?.message || 'Failed to update live session.');
    } finally {
      setLiveAction(false);
    }
  };

  const saveScoringRules = async () => {
    if (!session || !supabase) {
      show('error', 'Create a broadcast session first.');
      return;
    }
    setSavingRules(true);
    try {
      for (const rule of rules) {
        let query = supabase
          .from('live_broadcast_scoring_rules')
          .update({
            rule_type: rule.type,
            placement_position: rule.placement_position,
            points: Number(rule.points || 0),
            is_enabled: Boolean(rule.enabled),
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', session.id)
          .eq('rule_type', rule.type);

        query = rule.placement_position === null
          ? query.is('placement_position', null)
          : query.eq('placement_position', rule.placement_position);

        const { error } = await query;
        if (error) throw error;
      }

      await supabase
        .from('live_broadcast_matches')
        .update({
          scoring_snapshot: rules,
          updated_at: new Date().toISOString(),
        })
        .eq('session_id', session.id)
        .eq('match_number', session.current_match_number);

      show('success', 'Scoring rules saved. New scoring applies to future events; previous match snapshots stay preserved.');
      await loadSession(session.id);
    } catch (error: any) {
      console.error('[MVP LIVE] saveScoringRules error:', error);
      show('error', error?.message || 'Failed to save scoring rules.');
    } finally {
      setSavingRules(false);
    }
  };

  const getCurrentBroadcastMatch = () => {
    if (!session) return null;
    return broadcastMatches.find((item) =>
      Number(item.match_number) === Number(session.current_match_number) ||
      String(item.match_id) === String(session.current_match_id)
    ) || null;
  };

  const currentBroadcastMatch = getCurrentBroadcastMatch();
  // Team/player snapshots belong to the whole broadcast session so tournament
  // totals can carry from Match 1 -> Match 2 -> Match 3 without duplicating rosters.
  const sessionTeams = teams;
  const sessionPlayers = players;

  const teamGroups = useMemo<TeamGroupView[]>(() => {
  return [...sessionTeams]
    .map((team) => {
      const teamPlayers = sessionPlayers
        .filter((player) => player.team_id === team.id)
        .sort(
          (a, b) =>
            Number(a.player_number || 0) - Number(b.player_number || 0)
        );

      const firstPlayer = teamPlayers[0];
      const fallbackTeamNumber =
        firstPlayer?.team_number || (sessionTeams.indexOf(team) + 1);

      const teamNumber = parseTeamNumber(
        team.team_name,
        Number(fallbackTeamNumber || 1)
      );

      // IMPORTANT:
      // Always derive the displayed ALIVE count from the actual player state.
      // This prevents a stale current_alive_players database counter from
      // showing the wrong number after enemy/team/self kills.
      const actualAlivePlayers = teamPlayers.filter(
        (player) => player.is_alive
      ).length;

      return {
        team: {
          ...team,
          current_alive_players: actualAlivePlayers,
        },
        teamNumber,
        displayName: cleanTeamDisplayName(team.team_name, teamNumber),
        players: teamPlayers,
        bookedCount: teamPlayers.length,
      };
    })
    .sort((a, b) => {
      const pointDiff =
        Number(b.team.tournament_total_points || 0) -
        Number(a.team.tournament_total_points || 0);

      if (pointDiff !== 0) return pointDiff;

      const killDiff =
        Number(b.team.tournament_total_kills || 0) -
        Number(a.team.tournament_total_kills || 0);

      if (killDiff !== 0) return killDiff;

      return a.teamNumber - b.teamNumber;
    });
}, [sessionTeams, sessionPlayers]);

  const killerGroups = useMemo(
    () => teamGroups
      .map((group) => ({
        ...group,
        players: group.players.filter((player) => player.is_alive && !player.is_knocked),
      }))
      .filter((group) => group.players.length > 0),
    [teamGroups]
  );

  const victimGroups = useMemo(
    () => teamGroups
      .map((group) => ({
        ...group,
        players: group.players.filter((player) => player.is_alive),
      }))
      .filter((group) => group.players.length > 0),
    [teamGroups]
  );

  const killedEvents = useMemo(() => {
    return recentEvents
      .filter((event: any) => String(event.event_type || '').toLowerCase() === 'kill' && event.victim_player_id)
      .map((event: any) => ({
        event,
        player: sessionPlayers.find((player) => player.id === event.victim_player_id) || null,
      }))
      .filter((item: any) => item.player && !item.player.is_alive);
  }, [recentEvents, sessionPlayers]);

  const getKillPoints = () => Number(rules.find((rule) => rule.type === 'kill' && rule.enabled)?.points || 0);

  const applyKill = async () => {
  if (!session || !currentBroadcastMatch) {
    show('error', 'No active broadcast match is available.');
    return;
  }

  // Read the current DOM values as a safety fallback.
  // This prevents a stale React state from causing
  // "Select a killer player first" after the admin already selected a player.
  const killerId = String(
    killerSelectRef.current?.value || testKillerId || ''
  ).trim();

  const victimId = String(
    victimSelectRef.current?.value || testVictimId || ''
  ).trim();

  if (!killerId) {
    show('error', 'Select a killer player first.');
    return;
  }

  if (!victimId) {
    show('error', 'Select the victim player.');
    return;
  }

  const killer = sessionPlayers.find((p) => String(p.id) === killerId);
  const victim = sessionPlayers.find((p) => String(p.id) === victimId);

  if (!killer) {
    show('error', 'Selected killer player was not found in the current broadcast roster.');
    return;
  }

  if (!victim) {
    show('error', 'Selected victim player was not found in the current broadcast roster.');
    return;
  }

  // IMPORTANT:
  // Same player as killer + victim is allowed by the requested system.
  // It is treated as a self/same-team event:
  // individual kill = +1
  // team enemy kill/points = 0
  const samePlayer = killer.id === victim.id;
  const sameTeamKill = Boolean(
    killer.team_id &&
    victim.team_id &&
    killer.team_id === victim.team_id
  );

  if (!victim.is_alive) {
    show('error', 'That player is already eliminated. Duplicate kill blocked.');
    return;
  }

  setLiveAction(true);

  try {
    const result = await applyLiveBroadcastEvent({
      sessionId: session.id,
      broadcastMatchId: currentBroadcastMatch.id,
      eventType: 'kill',
      source: 'admin',

      killerPlayerId: killer.id,
      victimPlayerId: victim.id,

      killerTeamId: killer.team_id || null,
      victimTeamId: victim.team_id || null,

      // Every confirmed kill gives the selected killer one individual kill.
      killDelta: 1,

      // Enemy kill gets normal kill points.
      // Same-team/self kill gets NO team points.
      pointDelta: (samePlayer || sameTeamKill) ? 0 : getKillPoints(),

      detectionConfidence: 1,

      payload: {
        manual: true,
        confirmed: true,
        same_player: samePlayer,
        same_team: sameTeamKill,
        phase: 'phase3-engine',
        current_match_id: currentBroadcastMatch.match_id,
      },
    });

    setLastEventId(String(result?.event_id || ''));

    // The victim is now removed from active victim/killer lists
    // through the refreshed live roster state.
    setTestKillerId('');
    setTestVictimId('');

    if (killerSelectRef.current) {
      killerSelectRef.current.value = '';
    }

    if (victimSelectRef.current) {
      victimSelectRef.current.value = '';
    }

    await loadSession(session.id);

    show(
      'success',
      samePlayer
        ? `${killer.player_name} +1 individual kill • self event • no team points.`
        : sameTeamKill
          ? `${killer.player_name} +1 individual kill • same-team kill • no team points.`
          : `${killer.player_name} +1 kill • ${victim.player_name} eliminated.`
    );
  } catch (error: any) {
    console.error('[MVP LIVE] applyKill error:', error);
    show('error', error?.message || 'Failed to add live kill.');
  } finally {
    setLiveAction(false);
  }
};

  const applyEnvironmentalElimination = async () => {
    if (!session || !currentBroadcastMatch || !testVictimId) {
      show('error', 'Select the player who was eliminated.');
      return;
    }
    const victim = sessionPlayers.find((p) => p.id === testVictimId);
    if (!victim) return;
    if (!victim.is_alive) {
      show('error', 'Player is already eliminated.');
      return;
    }
    setLiveAction(true);
    try {
      const result = await applyLiveBroadcastEvent({
        sessionId: session.id,
        broadcastMatchId: currentBroadcastMatch.id,
        eventType: 'elimination',
        source: 'admin',
        victimPlayerId: victim.id,
        victimTeamId: victim.team_id || null,
        killDelta: 0,
        pointDelta: 0,
        detectionConfidence: 1,
        payload: { manual: true, cause: 'environment_or_unknown', phase: 'phase3-engine' },
      });
      setLastEventId(String(result?.event_id || ''));
      setTestVictimId('');
      await loadSession(session.id);
      show('success', `${victim.player_name} eliminated without assigning a kill.`);
    } catch (error: any) {
      console.error('[MVP LIVE] environmental elimination error:', error);
      show('error', error?.message || 'Failed to record elimination.');
    } finally {
      setLiveAction(false);
    }
  };

  const revivePlayer = async () => {
    if (!session || !currentBroadcastMatch || !testVictimId) {
      show('error', 'Select a player to revive.');
      return;
    }
    const victim = sessionPlayers.find((p) => p.id === testVictimId);
    if (!victim) return;
    if (victim.is_alive) {
      show('info', 'Player is already alive.');
      return;
    }
    setLiveAction(true);
    try {
      const result = await applyLiveBroadcastEvent({
        sessionId: session.id,
        broadcastMatchId: currentBroadcastMatch.id,
        eventType: 'player_revive',
        source: 'admin',
        victimPlayerId: victim.id,
        victimTeamId: victim.team_id || null,
        payload: { manual: true, phase: 'phase3-engine' },
      });
      setLastEventId(String(result?.event_id || ''));
      setTestVictimId('');
      await loadSession(session.id);
      show('success', `${victim.player_name} marked alive again.`);
    } catch (error: any) {
      console.error('[MVP LIVE] revivePlayer error:', error);
      show('error', error?.message || 'Failed to revive player.');
    } finally {
      setLiveAction(false);
    }
  };

  const restoreKilledPlayer = async (eventId: string, playerName: string) => {
    if (!session || !eventId) return;
    setLiveAction(true);
    try {
      await reverseLiveBroadcastEvent(session.id, eventId);
      setLastEventId('');
      await loadSession(session.id);
      show('success', `${playerName} restored to alive and returned to the active player lists.`);
    } catch (error: any) {
      console.error('[MVP LIVE] restoreKilledPlayer error:', error);
      show('error', error?.message || 'Failed to restore eliminated player.');
    } finally {
      setLiveAction(false);
    }
  };

  const applyPlacement = async () => {
    if (!session || !currentBroadcastMatch || !selectedTeamId) {
      show('error', 'Select a team first.');
      return;
    }
    const team = sessionTeams.find((item) => item.id === selectedTeamId);
    const position = Number(selectedPlacement);
    const rule = rules.find((item) => item.type === 'placement' && item.enabled && item.placement_position === position);
    if (!team || !rule) {
      show('error', 'Selected placement does not have an enabled scoring rule.');
      return;
    }
    setLiveAction(true);
    try {
      const result = await applyLiveBroadcastEvent({
        sessionId: session.id,
        broadcastMatchId: currentBroadcastMatch.id,
        eventType: position === 1 ? 'winner' : 'placement',
        source: 'admin',
        killerTeamId: team.id,
        pointDelta: Number(rule.points || 0),
        placementPosition: position,
        payload: { manual: true, phase: 'phase3-engine' },
      });
      setLastEventId(String(result?.event_id || ''));
      await loadSession(session.id);
      show('success', `${team.team_name} received +${rule.points} placement points for #${position}.`);
    } catch (error: any) {
      console.error('[MVP LIVE] applyPlacement error:', error);
      show('error', error?.message || 'Failed to add placement points.');
    } finally {
      setLiveAction(false);
    }
  };

  const adjustTeamPoints = async (teamId: string, delta: number) => {
    if (!session || !teamId || !Number.isFinite(delta) || delta === 0) return;
    const team = sessionTeams.find((item) => item.id === teamId);
    if (!team) return;
    setLiveAction(true);
    try {
      const result = await applyLiveBroadcastEvent({
        sessionId: session.id,
        broadcastMatchId: currentBroadcastMatch.id,
        eventType: 'points_adjustment',
        source: 'admin',
        killerTeamId: team.id,
        pointDelta: delta,
        payload: { manual: true, reason: 'Admin score correction', phase: 'phase3-engine' },
      });
      setLastEventId(String(result?.event_id || ''));
      await loadSession(session.id);
      show('success', `${team.team_name} points adjusted by ${delta >= 0 ? '+' : ''}${delta}.`);
    } catch (error: any) {
      console.error('[MVP LIVE] adjustTeamPoints error:', error);
      show('error', error?.message || 'Failed to adjust points.');
    } finally {
      setLiveAction(false);
    }
  };

  const undoLastEvent = async () => {
    if (!session) return;
    const eventId = lastEventId || recentEvents[0]?.id;
    if (!eventId) {
      show('info', 'No reversible event is available.');
      return;
    }
    setLiveAction(true);
    try {
      await reverseLiveBroadcastEvent(session.id, String(eventId));
      setLastEventId('');
      await loadSession(session.id);
      show('success', 'Last live event was reversed successfully.');
    } catch (error: any) {
      console.error('[MVP LIVE] undoLastEvent error:', error);
      show('error', error?.message || 'Could not reverse the event.');
    } finally {
      setLiveAction(false);
    }
  };

  const saveCurrentMatchSnapshot = async () => {
    if (!session) return;
    setLiveAction(true);
    try {
      await snapshotLiveBroadcastMatch(session.id);
      await loadSession(session.id);
      show('success', `MATCH ${session.current_match_number} snapshot saved. Historical data remains preserved.`);
    } catch (error: any) {
      console.error('[MVP LIVE] snapshot error:', error);
      show('error', error?.message || 'Failed to save match snapshot.');
    } finally {
      setLiveAction(false);
    }
  };

  const advanceMatch = async () => {
    if (!session) return;
    if (session.current_match_number >= session.total_matches) {
      show('info', 'This is the final configured match.');
      return;
    }
    setLiveAction(true);
    try {
      await snapshotLiveBroadcastMatch(session.id);
      await advanceLiveBroadcastMatch(session.id);
      setLastEventId('');
      setTestKillerId('');
      setTestVictimId('');
      await loadSession(session.id);
      show('success', `MATCH ${session.current_match_number + 1} started. Tournament totals are preserved.`);
    } catch (error: any) {
      console.error('[MVP LIVE] advanceMatch error:', error);
      show('error', error?.message || 'Failed to advance to next match.');
    } finally {
      setLiveAction(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-[#06182c] via-[#030a16] to-[#04111f] p-4 shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-cyan-300 text-[10px] font-black tracking-[0.22em] uppercase">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              MVP ESPORTS • LIVE BROADCAST ENGINE
            </div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-white">Professional Live Control Room</h3>
            <p className="mt-1 text-[11px] text-gray-400">Admin-only. Existing player/team bookings remain the source for the broadcast snapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">Realtime</span>
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2.5 py-1 text-fuchsia-300">VIP UI</span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">Admin Only</span>
          </div>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-3 py-2 text-xs font-bold ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : message.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-gray-800 bg-[#030a16] p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">BROADCAST TYPE</label>
              <select value={broadcastType} onChange={(e) => {
                const nextType = e.target.value as 'tournament' | 'single';
                setBroadcastType(nextType);
                setSelectedMapIndex(0);
                // The next selection effect will restore an existing persisted
                // broadcast instead of forcing the admin to create a new one.
                if (nextType === 'tournament') {
                  const first = tournamentGroups[0];
                  setSelectedTournamentKey(first?.key || '');
                  setSelectedMatchId(String(first?.series[0]?.id || ''));
                  setTotalMatches(Math.max(1, first?.series.length || 1));
                } else {
                  setSelectedTournamentKey('');
                  setSelectedMatchId(String(singleMatches[0]?.id || ''));
                  setTotalMatches(1);
                }
              }} className="w-full rounded-xl border border-fuchsia-400/30 bg-[#100b20] px-3 py-2.5 text-xs font-black uppercase text-white outline-none focus:border-fuchsia-400">
                <option value="tournament">TOURNAMENT</option>
                <option value="single">SINGLE MATCH</option>
              </select>
            </div>

            {broadcastType === 'tournament' ? (
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">TOURNAMENT</label>
                <select value={selectedTournamentKey} onChange={(e) => {
                  const group = tournamentGroups.find((g) => g.key === e.target.value);
                  setSelectedTournamentKey(e.target.value);
                  setSelectedMatchId(String(group?.series[0]?.id || ''));
                  setTotalMatches(Math.max(1, group?.series.length || 1));
                  setSelectedMapIndex(0);
                }} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400">
                  <option value="">Select tournament</option>
                  {tournamentGroups.map((group) => (
                    <option key={group.key} value={group.key}>{group.title} • {group.series.length} match{group.series.length === 1 ? '' : 'es'}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">SINGLE MATCH</label>
                <select value={selectedMatchId} onChange={(e) => { setSelectedMatchId(e.target.value); setSelectedMapIndex(0); }} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400">
                  <option value="">Select match</option>
                  {singleMatches.map((match: any) => (
                    <option key={match.id} value={match.id}>{match.title || `Match ${match.id}`} • {getMatchMaps(match)[0] || 'Erangel'} • {getMatchTypeLabel(match)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">
                {broadcastType === 'tournament' ? 'TOURNAMENT MATCHES' : 'SELECTED MATCH'}
              </label>
              <select value={selectedMatchId} onChange={(e) => { setSelectedMatchId(e.target.value); setSelectedMapIndex(0); }} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400">
                <option value="">Select match</option>
                {(broadcastType === 'tournament' ? (activeTournament?.series || []) : singleMatches).map((match: any, index: number) => (
                  <option key={match.id} value={match.id}>
                    {broadcastType === 'tournament' ? `MATCH ${index + 1}` : (match.title || `MATCH ${match.id}`)} • {getMatchMaps(match)[0] || 'Erangel'} • {getSquadTypeLabel(match) || 'SQUAD'} • {getMatchTypeLabel(match)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentMatch && (
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-wider text-cyan-300">
                    Selected {broadcastType === 'tournament' ? 'Tournament Match' : 'Single Match'}
                  </div>
                  <div className="mt-0.5 text-sm font-black text-white">
                    {broadcastType === 'tournament'
                      ? `MATCH ${Number((currentMatch as any)?.tournament_match_number || 1)}`
                      : (currentMatch as any)?.title || `Match ${currentMatch.id}`}
                    {' • '}{getMatchMaps(currentMatch)[selectedMapIndex] || getMatchMaps(currentMatch)[0] || 'Erangel'}
                  </div>
                </div>
                <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-[8px] font-black uppercase text-fuchsia-300">
                  {getSquadTypeLabel(currentMatch) || 'SQUAD'}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3"><div className="text-[9px] font-black uppercase text-gray-500">Map</div><div className="mt-1 text-sm font-black text-white">{getMatchMaps(currentMatch)[selectedMapIndex] || getMatchMaps(currentMatch)[0] || 'Erangel'}</div></div>
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-3"><div className="text-[9px] font-black uppercase text-gray-500">Mode</div><div className="mt-1 text-sm font-black text-white">{getMatchTypeLabel(currentMatch)}</div></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><div className="text-[9px] font-black uppercase text-gray-500">Format</div><div className="mt-1 text-sm font-black text-white">{getSquadTypeLabel(currentMatch) || 'SQUAD'}</div></div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><div className="text-[9px] font-black uppercase text-gray-500">Matches</div><div className="mt-1 text-sm font-black text-white">{totalMatches}</div></div>
          </div>

          {getMatchMaps(currentMatch).length > 1 && (
            <div className="flex flex-wrap gap-2">
              {getMatchMaps(currentMatch).map((mapName, index) => <button key={`${mapName}-${index}`} type="button" onClick={() => setSelectedMapIndex(index)} className={`rounded-lg border px-3 py-1.5 text-[10px] font-black transition-all ${selectedMapIndex === index ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-gray-700 bg-[#07192e] text-gray-400 hover:text-white'}`}>MAP {index + 1} • {mapName}</button>)}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Live Stream URL (optional in Phase 2)</label>
            <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://youtube.com/live/..." className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400" />
          </div>

          {restoringExistingSession && (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-300">
              RESTORING EXISTING BROADCAST FROM SUPABASE…
            </div>
          )}

          {session && (
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-3 py-2 text-[9px] text-gray-300">
              <span className="font-black text-fuchsia-300">PERSISTENT SESSION:</span>{' '}
              Closing the Admin panel does not delete this broadcast. It is saved in Supabase and can be resumed later.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={session ? startNewBroadcast : createSession}
              disabled={loading || restoringExistingSession}
              title={session && !['completed', 'cancelled'].includes(String(session.status).toLowerCase()) ? 'Delete or finish the current broadcast before creating a new one.' : 'Create a new broadcast session'}
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#03101d] shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Creating…' : restoringExistingSession ? 'Checking…' : session ? 'NEW BROADCAST' : 'CREATE BROADCAST'}
            </button>

            {session && ['paused', 'ready'].includes(String(session.status).toLowerCase()) && (
              <button type="button" onClick={resumeBroadcast} disabled={liveAction} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-emerald-300 disabled:opacity-40">
                START AGAIN / RESUME
              </button>
            )}

            {session && String(session.status).toLowerCase() === 'live' && (
              <button type="button" onClick={() => updateSession({ status: 'paused' })} disabled={liveAction} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-amber-300 disabled:opacity-40">
                PAUSE
              </button>
            )}

            {session && (
              <button type="button" onClick={deleteBroadcast} disabled={deletingSession || liveAction} className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-red-300 disabled:opacity-40">
                {deletingSession ? 'DELETING…' : 'DELETE BROADCAST'}
              </button>
            )}

            {session && (
              <button type="button" onClick={() => updateSession({ status: 'completed', overlay_enabled: false })} disabled={liveAction} className="rounded-xl border border-gray-700 bg-gray-800/70 px-4 py-2.5 text-[10px] font-black uppercase text-gray-300 disabled:opacity-40">
                END BROADCAST
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4 space-y-3">
          <div className="flex items-center justify-between"><h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">Scoring Rules</h4><span className="text-[9px] text-gray-500">Admin editable</span></div>
          {rules.map((rule) => (
            <div key={rule.key} className="grid grid-cols-[1fr_72px_28px] items-center gap-2 rounded-xl border border-gray-800 bg-[#07192e]/70 p-2">
              <div><div className="text-[10px] font-black text-white">{rule.label}</div><div className="text-[8px] text-gray-500">{rule.type === 'kill' ? 'Every confirmed kill' : 'Placement points'}</div></div>
              <input type="number" value={rule.points} onChange={(e) => setRules((prev) => prev.map((item) => item.key === rule.key ? { ...item, points: Number(e.target.value) || 0 } : item))} className="w-full rounded-lg border border-gray-700 bg-[#030a16] px-2 py-1.5 text-center text-xs font-black text-white" />
              <input type="checkbox" checked={rule.enabled} onChange={(e) => setRules((prev) => prev.map((item) => item.key === rule.key ? { ...item, enabled: e.target.checked } : item))} className="h-4 w-4 accent-cyan-400" />
            </div>
          ))}
          <button type="button" onClick={saveScoringRules} disabled={savingRules || !session} className="w-full rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2.5 text-[9px] font-black uppercase text-fuchsia-300 disabled:opacity-30">{savingRules ? 'Saving…' : 'SAVE SCORING RULES'}</button>
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-2.5 text-[9px] leading-relaxed text-gray-400">The per-match scoring snapshot is stored with the broadcast match. Changing the active rules does not rewrite a completed match.</div>
        </div>
      </div>

      {session && (
        <>
          <div className="rounded-2xl border border-cyan-400/20 bg-[#030a16] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Current Broadcast</div><div className="mt-1 text-xl font-black text-white">MATCH {session.current_match_number} • {session.current_map || 'MAP'} • {session.current_squad_type || 'SQUAD'}</div><div className="mt-1 text-[10px] text-gray-500">Status: <span className="font-black text-emerald-300">{session.status.toUpperCase()}</span> • Session: {session.id.slice(0, 8)}…</div></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => updateSession({ overlay_enabled: !session.overlay_enabled })} disabled={liveAction} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${session.overlay_enabled ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-gray-700 bg-[#07192e] text-gray-400'}`}>Overlay {session.overlay_enabled ? 'ON' : 'OFF'}</button>
                <button type="button" onClick={() => updateSession({ scoreboard_enabled: !session.scoreboard_enabled })} disabled={liveAction} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${session.scoreboard_enabled ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-gray-700 bg-[#07192e] text-gray-400'}`}>Table {session.scoreboard_enabled ? 'ON' : 'OFF'}</button>
                <button type="button" onClick={() => updateSession({ top_three_enabled: !session.top_three_enabled })} disabled={liveAction} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${session.top_three_enabled ? 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300' : 'border-gray-700 bg-[#07192e] text-gray-400'}`}>Top 3 {session.top_three_enabled ? 'ON' : 'OFF'}</button>
                <button type="button" onClick={() => updateSession({ bottom_bar_enabled: !session.bottom_bar_enabled })} disabled={liveAction} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${session.bottom_bar_enabled ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-gray-700 bg-[#07192e] text-gray-400'}`}>Bottom Bar {session.bottom_bar_enabled ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          </div>

          {['paused', 'ready'].includes(String(session.status).toLowerCase()) && (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">BROADCAST SAVED</div>
                  <div className="mt-1 text-lg font-black text-white">Session {session.id.slice(0, 8)}… is {String(session.status).toUpperCase()}</div>
                  <div className="mt-1 text-[9px] text-gray-400">All team/player scores and the current match state remain stored in Supabase.</div>
                </div>
                <button type="button" onClick={resumeBroadcast} disabled={liveAction} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-emerald-300 disabled:opacity-40">
                  START AGAIN / RESUME
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-gray-800 bg-[#030a16] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">TOTAL TEAMS RANKED</h4>
                  <p className="text-[9px] text-gray-500">
                    {teamGroups.length} teams • {sessionPlayers.length} booked players • {getSquadTypeLabel(currentMatch) || session?.current_squad_type || 'SQUAD'}
                  </p>
                </div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-300">REALTIME</span>
              </div>

              <div className="space-y-2.5">
                {teamGroups.map((group, index) => (
                  <div key={group.team.id} className="rounded-2xl border border-gray-800 bg-[#061426] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-400/20 bg-[#07192e] text-[10px] font-black text-cyan-300">
                        {group.team.team_logo_url ? <img src={group.team.team_logo_url} alt="" className="h-full w-full object-cover" /> : `T${group.teamNumber}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black uppercase tracking-wider text-cyan-300">#{index + 1} • TEAM {group.teamNumber}</div>
                        <div className="truncate text-sm font-black text-white">{group.displayName}</div>
                        <div className="text-[8px] text-gray-500">{group.bookedCount} booked • {group.team.current_alive_players} alive</div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-2 py-1.5">
                          <div className="text-[7px] font-black uppercase text-gray-500">Kills</div>
                          <div className="text-sm font-black text-cyan-300">{group.team.current_match_kills}</div>
                        </div>
                        <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-2 py-1.5">
                          <div className="text-[7px] font-black uppercase text-gray-500">Points</div>
                          <div className="text-sm font-black text-amber-300">{group.team.tournament_total_points}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-2 py-1.5">
                          <div className="text-[7px] font-black uppercase text-gray-500">Alive</div>
                          <div className="text-sm font-black text-emerald-300">{group.team.current_alive_players}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {group.players.length === 0 ? (
                        <div className="text-[9px] text-gray-600">No booked players in this broadcast roster.</div>
                      ) : group.players.map((player) => {
                        const eliminated = !player.is_alive;
                        const knocked = Boolean(player.is_alive && player.is_knocked);
                        return (
                          <div
                            key={player.id}
                            className={`min-w-[120px] flex-1 rounded-xl border px-2.5 py-2 ${
                              eliminated
                                ? 'border-gray-700/60 bg-gray-900/70 text-gray-500'
                                : knocked
                                  ? 'border-amber-400/25 bg-amber-400/5 text-amber-200'
                                  : 'border-cyan-400/15 bg-[#07192e] text-white'
                            }`}
                          >
                            <div className="text-[8px] font-black uppercase tracking-wider text-gray-500">
                              PLAYER {player.player_number || '?'}
                            </div>
                            <div className={`mt-0.5 truncate text-[10px] font-black ${eliminated ? 'text-gray-500' : 'text-white'}`}>
                              {player.player_name}
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[7px] font-black uppercase">
                              <span className={eliminated ? 'text-gray-600' : knocked ? 'text-amber-300' : 'text-emerald-300'}>
                                {eliminated ? 'ELIMINATED' : knocked ? 'KNOCKED' : 'ALIVE'}
                              </span>
                              <span className={eliminated ? 'text-gray-600' : 'text-cyan-300'}>{player.current_match_kills} K</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-gray-800 bg-[#07192e]/50 p-2 text-[8px] text-gray-500">
                Exact roster only. No empty/fake player slots are generated.
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4 space-y-3">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">KILL CONTROL / TEST INPUT</h4>
                <p className="mt-1 text-[9px] text-gray-500">Choose by Team → Player Number → Player Name. Eliminated players leave both active lists automatically.</p>
              </div>

              <select
  ref={killerSelectRef}
  value={testKillerId}
  onChange={(e) => {
    const value = e.target.value;
    setTestKillerId(value);
    if (killerSelectRef.current) {
      killerSelectRef.current.value = value;
    }
  }}
  className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white"
>
                <option value="">Select killer</option>
                {killerGroups.map((group) => (
                  <optgroup key={`killer-${group.team.id}`} label={`TEAM ${group.teamNumber} • ${group.displayName}`}>
                    {group.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
  ref={victimSelectRef}
  value={testVictimId}
  onChange={(e) => {
    const value = e.target.value;
    setTestVictimId(value);
    if (victimSelectRef.current) {
      victimSelectRef.current.value = value;
    }
  }}
  className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white"
>
                <option value="">Select victim</option>
                {victimGroups.map((group) => (
                  <optgroup key={`victim-${group.team.id}`} label={`TEAM ${group.teamNumber} • ${group.displayName}`}>
                    {group.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <button type="button" onClick={applyKill} disabled={liveAction || !testKillerId || !testVictimId} className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-[#020710] disabled:cursor-not-allowed disabled:opacity-40">
                + CONFIRMED KILL
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={applyEnvironmentalElimination} disabled={liveAction || !testVictimId} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-2 py-2 text-[9px] font-black uppercase text-amber-300 disabled:opacity-30">ENV / NO KILL</button>
                <button type="button" onClick={revivePlayer} disabled={liveAction || !testVictimId} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-2 py-2 text-[9px] font-black uppercase text-emerald-300 disabled:opacity-30">REVIVE</button>
              </div>

              <button type="button" onClick={undoLastEvent} disabled={liveAction} className="w-full rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2.5 text-[9px] font-black uppercase text-red-300 disabled:opacity-30">↩ UNDO LAST EVENT</button>

              <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-[9px] leading-relaxed text-gray-400">
                <span className="font-black text-amber-300">RULES:</span> Knock is not a kill. Environment elimination gives no killer credit. Same-team kill gives the killer an individual kill but no enemy team points.
              </div>

              <div className="rounded-xl border border-gray-800 bg-[#07192e]/40 p-2.5">
                <div className="mb-2 text-[8px] font-black uppercase tracking-wider text-rose-300">KILLED PLAYER LIST</div>
                {killedEvents.length === 0 ? (
                  <div className="text-[8px] text-gray-600">No eliminated players yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {killedEvents.slice(0, 12).map(({ event, player }: any) => (
                      <div key={event.id} className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[8px] font-black text-gray-500">PLAYER {player.player_number || '?'}</div>
                          <div className="truncate text-[9px] font-black text-gray-400 line-through">{player.player_name}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreKilledPlayer(String(event.id), player.player_name)}
                          disabled={liveAction}
                          className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-black text-emerald-300 disabled:opacity-30"
                          title="Restore player"
                        >
                          ↻ RESTORE
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4 space-y-3">
              <div><h4 className="text-xs font-black uppercase tracking-wider text-amber-300">Placement / Winner Control</h4><p className="mt-1 text-[9px] text-gray-500">Apply the Admin-defined placement points without touching previous match history.</p></div>
              <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white">
                <option value="">Select team</option>
                {teamGroups.map((group) => (
                  <option key={group.team.id} value={group.team.id}>
                    TEAM {group.teamNumber} • {group.displayName}
                  </option>
                ))}
              </select>
              <select value={selectedPlacement} onChange={(e) => setSelectedPlacement(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white">
                {rules.filter((rule) => rule.type === 'placement' && rule.enabled).map((rule) => <option key={rule.key} value={String(rule.placement_position)}>#{rule.placement_position} • +{rule.points} pts</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={applyPlacement} disabled={liveAction || !selectedTeamId} className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2.5 text-[9px] font-black uppercase text-[#160b00] disabled:opacity-30">APPLY PLACEMENT</button>
                <button type="button" onClick={saveCurrentMatchSnapshot} disabled={liveAction} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2.5 text-[9px] font-black uppercase text-cyan-300 disabled:opacity-30">SAVE MATCH SNAPSHOT</button>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4">
              <div className="flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-wider text-white">Recent Live Events</h4><p className="text-[9px] text-gray-500">Audit trail • newest first</p></div><span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-[8px] font-black text-fuchsia-300">{recentEvents.length}</span></div>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                {recentEvents.length === 0 ? <div className="rounded-lg border border-gray-800 bg-[#07192e] p-3 text-[9px] text-gray-500">No live events yet.</div> : recentEvents.slice(0, 12).map((event: any) => (
                  <div key={event.id} className="rounded-lg border border-gray-800 bg-[#07192e] p-2.5">
                    <div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase text-cyan-300">{String(event.event_type || '').replaceAll('_',' ')}</span><span className="text-[8px] text-gray-500">{event.source || 'system'}</span></div>
                    <div className="mt-1 text-[9px] text-gray-300">Kill Δ {event.kill_delta ?? 0} • Point Δ {event.point_delta ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><h4 className="text-xs font-black uppercase tracking-wider text-white">Broadcast Preview State</h4><p className="text-[9px] text-gray-500">This is the live data/state source the future transparent overlay will consume.</p></div>
              <div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${visible.scoreboard ? 'bg-cyan-400/10 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>Scoreboard {visible.scoreboard ? 'ON' : 'OFF'}</span><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${visible.top3 ? 'bg-fuchsia-400/10 text-fuchsia-300' : 'bg-gray-800 text-gray-500'}`}>Top 3 {visible.top3 ? 'ON' : 'OFF'}</span><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${visible.bottom ? 'bg-amber-400/10 text-amber-300' : 'bg-gray-800 text-gray-500'}`}>Bottom Bar {visible.bottom ? 'ON' : 'OFF'}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><div className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Match Progress</div><div className="mt-1 text-lg font-black text-white">Match {session.current_match_number} of {session.total_matches}</div><div className="text-[9px] text-gray-500">Previous tournament points remain preserved when the next match starts.</div></div>
              <button type="button" onClick={advanceMatch} disabled={liveAction || session.current_match_number >= session.total_matches} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">NEXT MATCH →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LiveBroadcastPanel;
