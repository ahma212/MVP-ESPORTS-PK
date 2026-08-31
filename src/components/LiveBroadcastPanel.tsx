import React, { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Match, UserProfile } from '../types';

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
  session_id: string;
  broadcast_match_id?: string | null;
  team_id?: string | null;
  profile_id?: string | null;
  player_uid?: string | null;
  player_name: string;
  current_match_kills: number;
  is_alive: boolean;
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
  if (Array.isArray(match?.maps) && match.maps.length) return match.maps.map((m: any) => cleanName(m)).filter(Boolean);
  if (match?.map) return [cleanName(match.map)];
  return ['Erangel'];
};

const getMatchTypeLabel = (match: any) => cleanName(match?.type || match?.match_type || 'match').toUpperCase();
const getSquadTypeLabel = (match: any) => cleanName(match?.squad_type || '').toUpperCase();

const teamKeyFromBooking = (booking: any, fallbackIndex: number, squadSize: number) => {
  const explicit = cleanName(booking?.team_name);
  if (explicit) return explicit;
  const slot = Number(booking?.slot_number || fallbackIndex + 1);
  return `TEAM #${Math.ceil(slot / Math.max(1, squadSize))}`;
};

const logoCandidates = (team: any) => {
  const value = team?.team_logo_url || team?.logo_url || team?.team_logo || team?.logo;
  return cleanName(value);
};

export const LiveBroadcastPanel: React.FC<LiveBroadcastPanelProps> = ({ matches, userProfile }) => {
  const isAdmin = Boolean((userProfile as any)?.is_admin === true || (userProfile as any)?.role === 'admin');

  const selectableMatches = useMemo(() => {
    return (matches || []).filter((m: any) => m && m.status !== 'cancelled');
  }, [matches]);

  const tournamentGroups = useMemo(() => {
    const grouped = new Map<string, { key: string; title: string; matches: Match[] }>();
    selectableMatches.forEach((match: any, index) => {
      const tournamentId = cleanName(match?.tournament_id || match?.tournamentId || match?.tournament?.id);
      const tournamentTitle = cleanName(match?.tournament_title || match?.tournamentTitle || match?.tournament?.title);
      const isTournament = match?.type === 'tournament' || Boolean(tournamentId) || Boolean(tournamentTitle) || (Array.isArray(match?.maps) && match.maps.length > 1);
      if (!isTournament) return;
      const key = tournamentId || tournamentTitle || `tournament-${match?.id || index}`;
      const existing = grouped.get(key);
      if (existing) existing.matches.push(match);
      else grouped.set(key, { key, title: tournamentTitle || `Tournament ${grouped.size + 1}`, matches: [match] });
    });
    return Array.from(grouped.values());
  }, [selectableMatches]);

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [liveAction, setLiveAction] = useState(false);
  const [testKillerId, setTestKillerId] = useState('');
  const [testVictimId, setTestVictimId] = useState('');
  const [pointsAdjustment, setPointsAdjustment] = useState('0');
  const [visible, setVisible] = useState({ scoreboard: false, top3: false, bottom: true });

  const activeTournament = useMemo(() => {
    return tournamentGroups.find((group) => group.key === selectedTournamentKey) || null;
  }, [tournamentGroups, selectedTournamentKey]);

  const currentMatch = useMemo(() => {
    return selectableMatches.find((m: any) => m.id === selectedMatchId) || activeTournament?.matches[0] || null;
  }, [selectableMatches, selectedMatchId, activeTournament]);

  const squadSize = useMemo(() => {
    const type = getSquadTypeLabel(currentMatch);
    if (type === 'DUO') return 2;
    if (type === 'SOLO') return 1;
    return 4;
  }, [currentMatch]);

  const loadSession = async (sessionId: string) => {
    if (!supabase || !sessionId) return;
    const [{ data: sessionData }, { data: matchData }, { data: teamData }, { data: playerData }] = await Promise.all([
      supabase.from('live_broadcast_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('live_broadcast_matches').select('*').eq('session_id', sessionId).order('match_number', { ascending: true }),
      supabase.from('live_broadcast_teams').select('*').eq('session_id', sessionId).order('rank', { ascending: true, nullsFirst: false }),
      supabase.from('live_broadcast_players').select('*').eq('session_id', sessionId).order('player_name', { ascending: true }),
    ]);
    if (sessionData) {
      setSession(sessionData as BroadcastSessionRow);
      setStreamUrl(sessionData.stream_url || '');
      setVisible({
        scoreboard: Boolean(sessionData.scoreboard_enabled),
        top3: Boolean(sessionData.top_three_enabled),
        bottom: Boolean(sessionData.bottom_bar_enabled),
      });
    }
    setBroadcastMatches((matchData || []) as BroadcastMatchRow[]);
    setTeams((teamData || []) as BroadcastTeamRow[]);
    setPlayers((playerData || []) as BroadcastPlayerRow[]);
  };

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
    const firstTournament = tournamentGroups[0];
    if (!selectedTournamentKey && firstTournament) {
      setSelectedTournamentKey(firstTournament.key);
      setSelectedMatchId(firstTournament.matches[0]?.id || '');
    }
  }, [tournamentGroups, selectedTournamentKey]);

  useEffect(() => {
    const count = activeTournament?.matches.length || (currentMatch ? 1 : 0);
    if (count > 0) setTotalMatches(Math.max(1, Math.min(20, count)));
  }, [activeTournament, currentMatch]);

  useEffect(() => {
    if (currentMatch) setSelectedMapIndex(0);
  }, [selectedMatchId]);

  const show = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const buildSessionTeamsAndPlayers = async (newSessionId: string, targetMatches: Match[]) => {
    if (!supabase || !targetMatches.length) return;
    const uniqueTeamMap = new Map<string, { name: string; logo: string }>();
    const playerRows: Array<any> = [];
    const matchRows: Array<any> = [];

    // Create one live-match record for every selected tournament match.
    // Player/team snapshots are intentionally loaded from the first match only
    // so the same tournament roster carries forward across Match 1 -> Match 2 -> ...
    for (let matchIndex = 0; matchIndex < targetMatches.length; matchIndex += 1) {
      const match: any = targetMatches[matchIndex];
      const maps = getMatchMaps(match);
      matchRows.push({
        session_id: newSessionId,
        match_id: String(match.id),
        match_number: matchIndex + 1,
        map: maps[0] || cleanName(match?.map) || 'Erangel',
        match_type: getMatchTypeLabel(match),
        squad_type: getSquadTypeLabel(match),
        status: matchIndex === 0 ? 'live' : 'pending',
        started_at: matchIndex === 0 ? new Date().toISOString() : null,
        scoring_snapshot: rules,
      });
    }

    const rosterMatch: any = targetMatches[0];
    const { data: bookingData, error: bookingError } = await supabase
      .from('slot_bookings')
      .select('*')
      .eq('match_id', String(rosterMatch.id))
      .eq('status', 'confirmed')
      .order('slot_number', { ascending: true });
    if (bookingError) throw bookingError;

    (bookingData || []).forEach((booking: any, bookingIndex: number) => {
      const teamName = teamKeyFromBooking(booking, bookingIndex, squadSize);
      if (!uniqueTeamMap.has(teamName)) {
        uniqueTeamMap.set(teamName, { name: teamName, logo: logoCandidates(booking) });
      }
      playerRows.push({
        session_id: newSessionId,
        match_id: String(rosterMatch.id),
        team_key: teamName,
        player_uid: cleanName(booking.player_uid) || null,
        player_name: cleanName(booking.player_ign) || cleanName(booking.player_name) || `Player ${bookingIndex + 1}`,
        profile_id: booking.player_id || booking.user_id || null,
        current_match_kills: 0,
        is_alive: true,
        tournament_kills: 0,
      });
    });

    const { data: createdMatches, error: matchInsertError } = await supabase.from('live_broadcast_matches').insert(matchRows).select('*');
    if (matchInsertError) throw matchInsertError;
    const firstCreated = (createdMatches || [])[0] as BroadcastMatchRow | undefined;

    const teamInsertRows = Array.from(uniqueTeamMap.entries()).map(([teamKey, value]) => ({
      session_id: newSessionId,
      broadcast_match_id: firstCreated?.id || null,
      team_key: teamKey,
      team_name: value.name,
      team_logo_url: value.logo || null,
      current_match_kills: 0,
      current_match_points: 0,
      current_alive_players: squadSize,
      tournament_total_kills: 0,
      tournament_total_points: 0,
      is_eliminated: false,
    }));

    const { data: createdTeams, error: teamInsertError } = await supabase.from('live_broadcast_teams').insert(teamInsertRows).select('*');
    if (teamInsertError) throw teamInsertError;

    const createdTeamMap = new Map((createdTeams || []).map((row: any) => [row.team_key, row]));
    const playerInsertRows = playerRows.map((row) => ({
      session_id: newSessionId,
      broadcast_match_id: firstCreated?.id || null,
      team_id: createdTeamMap.get(row.team_key)?.id || null,
      profile_id: row.profile_id,
      player_uid: row.player_uid,
      player_name: row.player_name,
      current_match_kills: 0,
      is_alive: true,
      tournament_kills: 0,
    }));

    if (playerInsertRows.length) {
      const { error: playerInsertError } = await supabase.from('live_broadcast_players').insert(playerInsertRows);
      if (playerInsertError) throw playerInsertError;
    }
  };

  const createSession = async () => {
    if (!isAdmin || !supabase || !isSupabaseConfigured()) {
      show('error', 'Admin access and Supabase connection are required.');
      return;
    }
    const targetMatches = activeTournament?.matches?.length ? activeTournament.matches : currentMatch ? [currentMatch] : [];
    if (!targetMatches.length) {
      show('error', 'Select a tournament or match first.');
      return;
    }

    setLoading(true);
    try {
      const requestedCount = Math.max(1, Math.min(totalMatches, targetMatches.length));
      const selectedMatches = targetMatches.slice(0, requestedCount);
      const firstMatch: any = selectedMatches[0];
      const { data, error } = await supabase.from('live_broadcast_sessions').insert({
        tournament_id: (firstMatch as any)?.tournament_id || (firstMatch as any)?.tournamentId || null,
        tournament_title: activeTournament?.title || cleanName((firstMatch as any)?.tournament_title) || firstMatch?.title || 'MVP ESPORTS Broadcast',
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

  const getCurrentBroadcastMatch = () => {
    if (!session) return null;
    return broadcastMatches.find((item) => item.match_number === session.current_match_number) || broadcastMatches[0] || null;
  };

  const currentBroadcastMatch = getCurrentBroadcastMatch();
  const sessionTeams = teams.filter((team) => !currentBroadcastMatch || team.broadcast_match_id === currentBroadcastMatch.id || !team.broadcast_match_id);
  const sessionPlayers = players.filter((player) => !currentBroadcastMatch || player.broadcast_match_id === currentBroadcastMatch.id || !player.broadcast_match_id);

  const addEvent = async (event: Record<string, any>) => {
    if (!session?.id || !supabase) return null;
    const { data, error } = await supabase.from('live_broadcast_events').insert({
      session_id: session.id,
      broadcast_match_id: currentBroadcastMatch?.id || null,
      created_by: (userProfile as any)?.id || null,
      ...event,
    }).select('*').single();
    if (error) throw error;
    return data;
  };

  const applyKill = async () => {
    if (!session || !currentBroadcastMatch || !supabase || !testKillerId) {
      show('error', 'Select a killer player first.');
      return;
    }
    const killer = sessionPlayers.find((p) => p.id === testKillerId);
    const victim = testVictimId ? sessionPlayers.find((p) => p.id === testVictimId) : null;
    if (!killer) {
      show('error', 'Killer player was not found.');
      return;
    }
    if (victim && victim.id === killer.id) {
      show('error', 'Killer and victim cannot be the same player.');
      return;
    }
    setLiveAction(true);
    try {
      await addEvent({
        event_type: 'kill',
        source: 'admin',
        killer_player_id: killer.id,
        victim_player_id: victim?.id || null,
        killer_team_id: killer.team_id || null,
        victim_team_id: victim?.team_id || null,
        kill_delta: 1,
        point_delta: Number(rules.find((rule) => rule.type === 'kill' && rule.enabled)?.points || 0),
        detection_confidence: 1,
        event_payload: { manual: true, phase: 'phase2-test-control' },
      });

      const killerTeam = killer.team_id ? sessionTeams.find((team) => team.id === killer.team_id) : null;
      if (killerTeam) {
        await supabase.from('live_broadcast_teams').update({
          current_match_kills: Number(killerTeam.current_match_kills || 0) + 1,
          current_match_points: Number(killerTeam.current_match_points || 0) + Number(rules.find((rule) => rule.type === 'kill' && rule.enabled)?.points || 0),
          tournament_total_kills: Number(killerTeam.tournament_total_kills || 0) + 1,
          tournament_total_points: Number(killerTeam.tournament_total_points || 0) + Number(rules.find((rule) => rule.type === 'kill' && rule.enabled)?.points || 0),
        }).eq('id', killerTeam.id);
      }

      await supabase.from('live_broadcast_players').update({
        current_match_kills: Number(killer.current_match_kills || 0) + 1,
        tournament_kills: Number(killer.tournament_kills || 0) + 1,
      }).eq('id', killer.id);

      if (victim?.id) {
        await supabase.from('live_broadcast_players').update({ is_alive: false }).eq('id', victim.id);
      }

      if (victim?.team_id) {
        const victimTeam = sessionTeams.find((team) => team.id === victim.team_id);
        if (victimTeam) {
          await supabase.from('live_broadcast_teams').update({
            current_alive_players: Math.max(0, Number(victimTeam.current_alive_players || 0) - 1),
          }).eq('id', victimTeam.id);
        }
      }

      show('success', `${killer.player_name} +1 kill${victim ? ` • ${victim.player_name} eliminated` : ''}.`);
      setTestVictimId('');
      await loadSession(session.id);
    } catch (error: any) {
      console.error('[MVP LIVE] applyKill error:', error);
      show('error', error?.message || 'Failed to add live kill.');
    } finally {
      setLiveAction(false);
    }
  };

  const adjustTeamPoints = async (teamId: string, delta: number) => {
    if (!session || !supabase || !teamId || !Number.isFinite(delta)) return;
    const team = sessionTeams.find((item) => item.id === teamId);
    if (!team) return;
    setLiveAction(true);
    try {
      await addEvent({
        event_type: 'points_adjustment',
        source: 'admin',
        killer_team_id: team.id,
        point_delta: delta,
        event_payload: { manual: true, reason: 'Admin score correction' },
      });
      await supabase.from('live_broadcast_teams').update({
        current_match_points: Math.max(0, Number(team.current_match_points || 0) + delta),
        tournament_total_points: Math.max(0, Number(team.tournament_total_points || 0) + delta),
      }).eq('id', team.id);
      await loadSession(session.id);
      show('success', `${team.team_name} points adjusted by ${delta >= 0 ? '+' : ''}${delta}.`);
    } catch (error: any) {
      console.error('[MVP LIVE] adjustTeamPoints error:', error);
      show('error', error?.message || 'Failed to adjust points.');
    } finally {
      setLiveAction(false);
    }
  };

  const advanceMatch = async () => {
    if (!session || !supabase) return;
    const nextNumber = session.current_match_number + 1;
    const nextMatch = broadcastMatches.find((item) => item.match_number === nextNumber);
    if (!nextMatch) {
      show('info', 'There is no next match configured in this broadcast session.');
      return;
    }
    const nextSource: any = selectableMatches.find((m: any) => String(m.id) === String(nextMatch.match_id));
    setLiveAction(true);
    try {
      if (currentBroadcastMatch) {
        await supabase.from('live_broadcast_matches').update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        }).eq('id', currentBroadcastMatch.id);
      }
      await supabase.from('live_broadcast_matches').update({
        status: 'live',
        started_at: new Date().toISOString(),
      }).eq('id', nextMatch.id);

      await supabase.from('live_broadcast_sessions').update({
        current_match_number: nextNumber,
        current_match_id: String(nextMatch.match_id),
        current_map: nextMatch.map || cleanName(nextSource?.map) || 'Erangel',
        current_match_type: nextMatch.match_type || getMatchTypeLabel(nextSource),
        current_squad_type: nextMatch.squad_type || getSquadTypeLabel(nextSource),
        status: 'live',
      }).eq('id', session.id);

      // Reset ONLY the new current-match fields. Tournament totals remain intact.
      // All player snapshots belong to the tournament session, so reset only
      // current-match state while preserving cumulative tournament kills.
      for (const player of players) {
        await supabase.from('live_broadcast_players').update({
          current_match_kills: 0,
          is_alive: true,
          tournament_match_count: Number((player as any).tournament_match_count || 0) + 1,
        }).eq('id', player.id);
      }
      for (const team of sessionTeams) {
        await supabase.from('live_broadcast_teams').update({
          current_match_kills: 0,
          current_match_points: 0,
          current_alive_players: squadSize,
          is_eliminated: false,
        }).eq('id', team.id);
      }

      await loadSession(session.id);
      show('success', `MATCH ${nextNumber} is now live. Tournament totals were preserved.`);
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
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Tournament</label>
              <select value={selectedTournamentKey} onChange={(e) => { setSelectedTournamentKey(e.target.value); const group = tournamentGroups.find((g) => g.key === e.target.value); setSelectedMatchId(group?.matches[0]?.id || ''); }} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400">
                <option value="">Select tournament</option>
                {tournamentGroups.map((group) => <option key={group.key} value={group.key}>{group.title} • {group.matches.length} match{group.matches.length === 1 ? '' : 'es'}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Starting Match</label>
              <select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400">
                <option value="">Select match</option>
                {(activeTournament?.matches || selectableMatches).map((match: any) => <option key={match.id} value={match.id}>{match.title || `Match ${match.id}`} • {getMatchMaps(match)[0] || 'Erangel'} • {getMatchTypeLabel(match)}</option>)}
              </select>
            </div>
          </div>

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

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={createSession} disabled={loading || Boolean(session)} className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#03101d] shadow-lg disabled:cursor-not-allowed disabled:opacity-40">{loading ? 'Creating…' : session ? 'Session Created' : 'Create Broadcast Session'}</button>
            {session && <button type="button" onClick={() => updateSession({ status: 'live', overlay_enabled: true, scoreboard_enabled: true })} disabled={liveAction} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-emerald-300 disabled:opacity-40">GO LIVE</button>}
            {session && <button type="button" onClick={() => updateSession({ status: 'paused' })} disabled={liveAction} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-amber-300 disabled:opacity-40">PAUSE</button>}
            {session && <button type="button" onClick={() => updateSession({ status: 'completed', overlay_enabled: false })} disabled={liveAction} className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-[10px] font-black uppercase text-red-300 disabled:opacity-40">END BROADCAST</button>}
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
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-2.5 text-[9px] leading-relaxed text-gray-400">The per-match scoring snapshot is stored with the broadcast match, so later rule edits do not rewrite old match history.</div>
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

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-gray-800 bg-[#030a16] p-4">
              <div className="mb-3 flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-wider text-white">Live Team Leaderboard</h4><p className="text-[9px] text-gray-500">Team → Kills → Points → Alive</p></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-300">REALTIME</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[10px]">
                  <thead><tr className="border-b border-gray-800 text-[9px] uppercase tracking-wider text-gray-500"><th className="px-2 py-2">#</th><th className="px-2 py-2">Team</th><th className="px-2 py-2">Kills</th><th className="px-2 py-2">Points</th><th className="px-2 py-2">Alive</th><th className="px-2 py-2">Correction</th></tr></thead>
                  <tbody>
                    {sessionTeams.sort((a, b) => Number(b.tournament_total_points) - Number(a.tournament_total_points)).map((team, index) => (
                      <tr key={team.id} className="border-b border-gray-900 hover:bg-cyan-400/5">
                        <td className="px-2 py-2 font-black text-gray-500">{index + 1}</td>
                        <td className="px-2 py-2"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-gray-700 bg-[#07192e] text-[9px] font-black text-cyan-300">{team.team_logo_url ? <img src={team.team_logo_url} alt="" className="h-full w-full object-cover" /> : 'M'}</div><div><div className="font-black text-white">{team.team_name}</div><div className="text-[8px] text-gray-500">Tournament Total</div></div></div></td>
                        <td className="px-2 py-2 font-black text-cyan-300">{team.current_match_kills}</td>
                        <td className="px-2 py-2 font-black text-amber-300">{team.tournament_total_points}</td>
                        <td className="px-2 py-2 font-black text-emerald-300">{team.current_alive_players}</td>
                        <td className="px-2 py-2"><div className="flex gap-1"><button type="button" onClick={() => adjustTeamPoints(team.id, Number(pointsAdjustment || 0))} disabled={!Number(pointsAdjustment) || liveAction} className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[8px] font-black text-amber-300 disabled:opacity-30">APPLY</button><button type="button" onClick={() => adjustTeamPoints(team.id, 1)} disabled={liveAction} className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-black text-emerald-300">+1</button><button type="button" onClick={() => adjustTeamPoints(team.id, -1)} disabled={liveAction} className="rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-1 text-[8px] font-black text-red-300">-1</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><input type="number" value={pointsAdjustment} onChange={(e) => setPointsAdjustment(e.target.value)} placeholder="Points ±" className="w-24 rounded-lg border border-gray-700 bg-[#07192e] px-2.5 py-2 text-[10px] font-black text-white" /><span className="text-[9px] text-gray-500">Select any team row and use APPLY for manual correction.</span></div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4 space-y-3">
              <div><h4 className="text-xs font-black uppercase tracking-wider text-white">Kill Control / Test Input</h4><p className="mt-1 text-[9px] text-gray-500">Phase 2 manual engine. Automatic OCR attaches later.</p></div>
              <select value={testKillerId} onChange={(e) => setTestKillerId(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white"><option value="">Select killer</option>{sessionPlayers.map((player) => <option key={player.id} value={player.id}>{player.player_name}</option>)}</select>
              <select value={testVictimId} onChange={(e) => setTestVictimId(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-[#07192e] px-3 py-2.5 text-xs font-bold text-white"><option value="">No victim / unknown</option>{sessionPlayers.map((player) => <option key={player.id} value={player.id}>{player.player_name}</option>)}</select>
              <button type="button" onClick={applyKill} disabled={liveAction || !testKillerId} className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-[#020710] disabled:cursor-not-allowed disabled:opacity-40">+ CONFIRMED KILL</button>
              <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-[9px] leading-relaxed text-gray-400"><span className="font-black text-amber-300">Rule:</span> This Phase 2 button represents a confirmed elimination. Knock/uncertain events must not be auto-counted as a kill.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#030a16] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><h4 className="text-xs font-black uppercase tracking-wider text-white">Broadcast Preview State</h4><p className="text-[9px] text-gray-500">This is the data/state source the future transparent overlay will consume.</p></div>
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
