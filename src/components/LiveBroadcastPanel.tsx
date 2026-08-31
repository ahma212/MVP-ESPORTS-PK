import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, ChevronDown, CircleStop, Eye, EyeOff, Flame, Pause, Play, RotateCcw, Save, Settings2, ShieldCheck, SkipForward, Sparkles, Trophy, Users, X } from 'lucide-react';
import { Match, SlotBooking, UserProfile } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type LiveSession = {
  id: string;
  tournament_id?: string | null;
  tournament_title?: string | null;
  total_matches: number;
  current_match_number: number;
  current_match_id?: string | null;
  current_map?: string | null;
  current_match_type?: string | null;
  current_squad_type?: string | null;
  status: 'draft' | 'ready' | 'live' | 'paused' | 'completed' | 'cancelled';
  overlay_enabled: boolean;
  top_three_enabled: boolean;
  bottom_bar_enabled: boolean;
  scoreboard_enabled: boolean;
  active_banner_type?: string | null;
  active_banner_team_id?: string | null;
  active_banner_kills?: number | null;
  stream_url?: string | null;
};

type TeamStat = {
  id: string;
  team_key: string;
  team_name: string;
  team_logo_url?: string | null;
  current_match_kills: number;
  current_match_points: number;
  current_alive_players: number;
  tournament_total_kills: number;
  tournament_total_points: number;
  rank?: number | null;
};

type PlayerStat = {
  id: string;
  team_id?: string | null;
  profile_id?: string | null;
  player_uid?: string | null;
  player_name: string;
  current_match_kills: number;
  tournament_kills: number;
  is_alive: boolean;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  matches: Match[];
  userProfile?: UserProfile | null;
}

const TEAM_PLACEHOLDER = 'UNASSIGNED';

function normaliseTeamName(value?: string | null) {
  const name = String(value || '').trim();
  return name || TEAM_PLACEHOLDER;
}

function displayMap(match?: Match | null) {
  if (!match) return '—';
  return match.map || match.maps?.[0] || '—';
}

function isAdmin(profile?: UserProfile | null) {
  return Boolean(profile?.is_admin === true || profile?.role === 'admin');
}

export const LiveBroadcastPanel: React.FC<Props> = ({ isOpen, onClose, matches, userProfile }) => {
  const adminAllowed = isAdmin(userProfile);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [totalMatches, setTotalMatches] = useState(1);
  const [killPoints, setKillPoints] = useState(1);
  const [savingScoreRules, setSavingScoreRules] = useState(false);
  const [placementPoints, setPlacementPoints] = useState<Record<number, number>>({ 1: 10, 2: 6, 3: 5, 4: 4, 5: 3 });
  const [streamUrl, setStreamUrl] = useState('');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [teams, setTeams] = useState<TeamStat[]>([]);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manualKillerId, setManualKillerId] = useState('');
  const [manualVictimId, setManualVictimId] = useState('');
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  const activeMatches = useMemo(() => {
    return (matches || []).filter(m => m.status !== 'completed' && !m.is_ended);
  }, [matches]);

  const currentMatch = useMemo(() => {
    if (!session?.current_match_id) return null;
    return matches.find(m => m.id === session.current_match_id) || null;
  }, [matches, session?.current_match_id]);

  const selectableTournamentGroups = useMemo(() => {
    const groups = new Map<string, Match[]>();
    activeMatches.forEach(match => {
      const key = String(match.title || 'Untitled Tournament').trim();
      const arr = groups.get(key) || [];
      arr.push(match);
      groups.set(key, arr);
    });
    return Array.from(groups.entries()).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.timestamp - b.timestamp),
    }));
  }, [activeMatches]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setNotice('');
  }, [isOpen]);

  const currentMatchIndex = session ? Math.max(0, session.current_match_number - 1) : 0;

  const currentSelectedSequence = useMemo(() => {
    if (!selectedMatchIds.length) return [];
    return selectedMatchIds
      .map(id => matches.find(m => m.id === id))
      .filter(Boolean) as Match[];
  }, [matches, selectedMatchIds]);

  const loadSessionState = async (sessionId: string) => {
    if (!supabase) return;
    const [{ data: sessionData, error: sessionError }, { data: teamData, error: teamError }, { data: playerData, error: playerError }] = await Promise.all([
      supabase.from('live_broadcast_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('live_broadcast_teams').select('*').eq('session_id', sessionId).order('tournament_total_points', { ascending: false }),
      supabase.from('live_broadcast_players').select('*').eq('session_id', sessionId).order('player_name')
    ]);

    if (sessionError) throw sessionError;
    if (teamError) throw teamError;
    if (playerError) throw playerError;

    setSession(sessionData as LiveSession);
    setTeams((teamData || []) as TeamStat[]);
    setPlayers((playerData || []) as PlayerStat[]);
  };

  const startSession = async () => {
    if (!adminAllowed || !supabase) return;
    if (!selectedMatchIds.length) {
      setError('Pehle kam az kam ek match select karein.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sequence = currentSelectedSequence;
      const first = sequence[0];
      const now = new Date().toISOString();

      const { data: sessionRow, error: sessionError } = await supabase
        .from('live_broadcast_sessions')
        .insert([{
          tournament_title: first?.title || 'MVP ESPORTS LIVE',
          total_matches: Math.min(Math.max(totalMatches, 1), sequence.length),
          current_match_number: 1,
          current_match_id: first.id,
          current_map: displayMap(first),
          current_match_type: first.type,
          current_squad_type: first.squad_type,
          status: 'ready',
          overlay_enabled: false,
          scoreboard_enabled: false,
          top_three_enabled: false,
          bottom_bar_enabled: true,
          stream_url: streamUrl.trim() || null,
          created_by: userProfile?.id || null,
          created_at: now,
          updated_at: now,
        }])
        .select('*')
        .single();
      if (sessionError) throw sessionError;
      if (!sessionRow) throw new Error('Live session create nahi hui.');

      const sessionId = sessionRow.id as string;
      const chosenSequence = sequence.slice(0, Math.min(totalMatches, sequence.length));

      const { error: matchInsertError } = await supabase.from('live_broadcast_matches').insert(
        chosenSequence.map((m, idx) => ({
          session_id: sessionId,
          match_id: m.id,
          match_number: idx + 1,
          map: displayMap(m),
          match_type: m.type,
          squad_type: m.squad_type,
          status: idx === 0 ? 'ready' : 'pending',
          scoring_snapshot: {
            kill_points: killPoints,
            placement_points: placementPoints,
          },
          final_snapshot: {},
          created_at: now,
          updated_at: now,
        }))
      );
      if (matchInsertError) throw matchInsertError;

      const firstBookings = await loadBookings(first.id);
      await seedParticipants(sessionId, sessionRow, first, firstBookings);
      await saveScoringRules(sessionId);
      await loadSessionState(sessionId);
      setNotice('Live Broadcast session ready hai.');
    } catch (e: any) {
      setError(e?.message || 'Live session create nahi ho saki.');
    } finally {
      setBusy(false);
    }
  };

  const loadBookings = async (matchId: string): Promise<SlotBooking[]> => {
    if (!supabase) return [];
    const { data, error: bookingsError } = await supabase
      .from('slot_bookings')
      .select('*')
      .eq('match_id', matchId)
      .eq('status', 'confirmed')
      .order('slot_number', { ascending: true });
    if (bookingsError) throw bookingsError;
    return (data || []) as SlotBooking[];
  };

  const seedParticipants = async (sessionId: string, sessionRow: any, match: Match, bookings: SlotBooking[]) => {
    if (!supabase) return;
    const squadSize = match.squad_type === 'SQUAD' ? 4 : match.squad_type === 'DUO' ? 2 : 1;
    const validBookings = bookings.filter(b => b.player_ign && b.player_ign.trim());
    const groups = new Map<string, SlotBooking[]>();

    validBookings.forEach(b => {
      const key = normaliseTeamName(b.team_name || `TEAM #${Math.ceil((b.slot_number || 1) / squadSize)}`);
      const arr = groups.get(key) || [];
      arr.push(b);
      groups.set(key, arr);
    });

    const teamRows = Array.from(groups.entries()).map(([teamName, members]) => ({
      session_id: sessionId,
      broadcast_match_id: null,
      team_key: teamName,
      team_name: teamName,
      current_match_kills: 0,
      current_match_points: 0,
      current_alive_players: members.length,
      tournament_total_kills: 0,
      tournament_total_points: 0,
      is_eliminated: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (teamRows.length) {
      const { data: insertedTeams, error: teamError } = await supabase
        .from('live_broadcast_teams')
        .insert(teamRows)
        .select('*');
      if (teamError) throw teamError;

      const teamMap = new Map<string, any>((insertedTeams || []).map((t: any) => [t.team_key, t]));
      const playerRows = validBookings.map(b => {
        const teamName = normaliseTeamName(b.team_name || `TEAM #${Math.ceil((b.slot_number || 1) / squadSize)}`);
        return {
          session_id: sessionId,
          broadcast_match_id: null,
          team_id: teamMap.get(teamName)?.id || null,
          profile_id: b.player_id || b.user_id || null,
          player_uid: b.player_uid || null,
          player_name: b.player_ign,
          current_match_kills: 0,
          is_alive: true,
          tournament_kills: 0,
          tournament_match_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      if (playerRows.length) {
        const { error: playerError } = await supabase.from('live_broadcast_players').insert(playerRows);
        if (playerError) throw playerError;
      }
    }
  };

  const saveScoringRules = async (sessionId: string) => {
    if (!supabase) return;
    const rows = [
      { session_id: sessionId, rule_type: 'kill', placement_position: null, points: killPoints, is_enabled: true },
      ...Object.entries(placementPoints).map(([position, points]) => ({
        session_id: sessionId,
        rule_type: 'placement',
        placement_position: Number(position),
        points,
        is_enabled: true,
      })),
    ];
    const { error: ruleError } = await supabase.from('live_broadcast_scoring_rules').insert(rows);
    if (ruleError) throw ruleError;
  };

  const updateSession = async (patch: Partial<LiveSession>) => {
    if (!supabase || !session) return;
    const { error: updateError } = await supabase.from('live_broadcast_sessions').update(patch).eq('id', session.id);
    if (updateError) throw updateError;
    await loadSessionState(session.id);
  };

  const refreshParticipantsForMatch = async (match: Match, nextMatchNumber: number) => {
    if (!supabase || !session) return;
    const bookings = await loadBookings(match.id);
    const [{ data: existingTeams, error: existingTeamsError }, { data: existingPlayers, error: existingPlayersError }] = await Promise.all([
      supabase.from('live_broadcast_teams').select('*').eq('session_id', session.id),
      supabase.from('live_broadcast_players').select('*').eq('session_id', session.id),
    ]);
    if (existingTeamsError) throw existingTeamsError;
    if (existingPlayersError) throw existingPlayersError;

    // Reset only CURRENT-MATCH values. Tournament totals are intentionally preserved.
    if (existingTeams?.length) {
      const { error } = await supabase.from('live_broadcast_teams').update({
        current_match_kills: 0,
        current_match_points: 0,
        current_alive_players: 0,
        is_eliminated: false,
      }).eq('session_id', session.id);
      if (error) throw error;
    }

    if (existingPlayers?.length) {
      const { error } = await supabase.from('live_broadcast_players').update({
        current_match_kills: 0,
        is_alive: false,
      }).eq('session_id', session.id);
      if (error) throw error;
    }

    const squadSize = match.squad_type === 'SQUAD' ? 4 : match.squad_type === 'DUO' ? 2 : 1;
    const groups = new Map<string, SlotBooking[]>();
    bookings.filter(b => b.player_ign && b.player_ign.trim()).forEach(b => {
      const key = normaliseTeamName(b.team_name || `TEAM #${Math.ceil((b.slot_number || 1) / squadSize)}`);
      const arr = groups.get(key) || [];
      arr.push(b);
      groups.set(key, arr);
    });

    const teamMap = new Map<string, TeamStat>();
    (existingTeams || []).forEach(t => teamMap.set(t.team_key, t as TeamStat));

    for (const [teamName, members] of groups.entries()) {
      const existing = teamMap.get(teamName);
      if (existing) {
        const { error } = await supabase.from('live_broadcast_teams').update({
          current_match_kills: 0,
          current_match_points: 0,
          current_alive_players: members.length,
          is_eliminated: false,
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('live_broadcast_teams').insert([{
          session_id: session.id,
          broadcast_match_id: null,
          team_key: teamName,
          team_name: teamName,
          current_match_kills: 0,
          current_match_points: 0,
          current_alive_players: members.length,
          tournament_total_kills: 0,
          tournament_total_points: 0,
          is_eliminated: false,
        }]).select('*').single();
        if (error) throw error;
        if (data) teamMap.set(teamName, data as TeamStat);
      }
    }

    const existingByKey = new Map<string, PlayerStat>();
    (existingPlayers || []).forEach((p: any) => {
      const key = `${p.player_uid || ''}|${String(p.player_name || '').trim().toLowerCase()}`;
      existingByKey.set(key, p as PlayerStat);
    });

    for (const b of bookings.filter(b => b.player_ign && b.player_ign.trim())) {
      const teamName = normaliseTeamName(b.team_name || `TEAM #${Math.ceil((b.slot_number || 1) / squadSize)}`);
      const team = teamMap.get(teamName);
      const key = `${b.player_uid || ''}|${String(b.player_ign || '').trim().toLowerCase()}`;
      const previous = existingByKey.get(key);
      if (previous) {
        const { error } = await supabase.from('live_broadcast_players').update({
          team_id: team?.id || null,
          current_match_kills: 0,
          is_alive: true,
          profile_id: b.player_id || b.user_id || previous.profile_id || null,
          player_uid: b.player_uid || previous.player_uid || null,
          player_name: b.player_ign,
        }).eq('id', previous.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('live_broadcast_players').insert([{
          session_id: session.id,
          broadcast_match_id: null,
          team_id: team?.id || null,
          profile_id: b.player_id || b.user_id || null,
          player_uid: b.player_uid || null,
          player_name: b.player_ign,
          current_match_kills: 0,
          is_alive: true,
          tournament_kills: 0,
          tournament_match_count: 0,
        }]);
        if (error) throw error;
      }
    }

    const { data: matchRow, error: matchRowError } = await supabase
      .from('live_broadcast_matches')
      .select('*')
      .eq('session_id', session.id)
      .eq('match_number', nextMatchNumber)
      .single();
    if (matchRowError) throw matchRowError;

    await supabase.from('live_broadcast_matches').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', matchRow.id);
    await supabase.from('live_broadcast_sessions').update({
      current_match_number: nextMatchNumber,
      current_match_id: match.id,
      current_map: displayMap(match),
      current_match_type: match.type,
      current_squad_type: match.squad_type,
      status: 'live',
    }).eq('id', session.id);
    await loadSessionState(session.id);
  };

  const setLive = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await updateSession({ status: 'live', overlay_enabled: true, scoreboard_enabled: true });
      setNotice('Broadcast LIVE ho gaya.');
    } catch (e: any) {
      setError(e?.message || 'Live start nahi ho saka.');
    } finally { setBusy(false); }
  };

  const pauseLive = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try { await updateSession({ status: 'paused' }); setNotice('Broadcast paused.'); }
    catch (e: any) { setError(e?.message || 'Pause failed.'); }
    finally { setBusy(false); }
  };

  const toggleOverlay = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try { await updateSession({ overlay_enabled: !session.overlay_enabled }); }
    catch (e: any) { setError(e?.message || 'Overlay setting change nahi hui.'); }
    finally { setBusy(false); }
  };

  const addKill = async () => {
    if (!supabase || !session || !manualKillerId) {
      setError('Killer player select karein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const killer = players.find(p => p.id === manualKillerId);
      const victim = manualVictimId ? players.find(p => p.id === manualVictimId) : null;
      if (!killer) throw new Error('Killer player nahi mila.');
      if (victim && victim.id === killer.id) throw new Error('Killer aur victim same player nahi ho sakte.');

      const { data: event, error: eventError } = await supabase.from('live_broadcast_events').insert([{
        session_id: session.id,
        broadcast_match_id: session.current_match_id ? (await getBroadcastMatchId(session.id, session.current_match_number)) : null,
        event_type: 'kill',
        source: 'admin',
        killer_player_id: killer.id,
        victim_player_id: victim?.id || null,
        killer_team_id: killer.team_id || null,
        victim_team_id: victim?.team_id || null,
        kill_delta: 1,
        point_delta: killPoints,
        event_payload: { manually_added: true },
        created_by: userProfile?.id || null,
      }]).select('*').single();
      if (eventError) throw eventError;
      if (!event) throw new Error('Kill event save nahi hua.');

      if (killer.team_id) {
        const team = teams.find(t => t.id === killer.team_id);
        if (team) {
          await supabase.from('live_broadcast_teams').update({
            current_match_kills: team.current_match_kills + 1,
            current_match_points: Number(team.current_match_points) + Number(killPoints),
            tournament_total_kills: team.tournament_total_kills + 1,
            tournament_total_points: Number(team.tournament_total_points) + Number(killPoints),
          }).eq('id', team.id);
        }
      }

      await supabase.from('live_broadcast_players').update({
        current_match_kills: killer.current_match_kills + 1,
        tournament_kills: killer.tournament_kills + 1,
      }).eq('id', killer.id);

      if (victim) {
        await supabase.from('live_broadcast_players').update({ is_alive: false }).eq('id', victim.id);
        if (victim.team_id) {
          const victimTeam = teams.find(t => t.id === victim.team_id);
          if (victimTeam) {
            await supabase.from('live_broadcast_teams').update({
              current_alive_players: Math.max(0, victimTeam.current_alive_players - 1),
            }).eq('id', victimTeam.id);
          }
        }
      }

      setManualKillerId('');
      setManualVictimId('');
      await loadSessionState(session.id);
      setNotice('Kill event realtime save/update ho gaya.');
    } catch (e: any) {
      setError(e?.message || 'Kill add nahi ho saki.');
    } finally { setBusy(false); }
  };

  const getBroadcastMatchId = async (sessionId: string, matchNumber: number) => {
    if (!supabase) return null;
    const { data, error: fetchError } = await supabase.from('live_broadcast_matches').select('id').eq('session_id', sessionId).eq('match_number', matchNumber).single();
    if (fetchError) throw fetchError;
    return data?.id || null;
  };

  const nextMatch = async () => {
    if (!session) return;
    const nextNumber = session.current_match_number + 1;
    const next = currentSelectedSequence[nextNumber - 1];
    if (!next) {
      setError('Selected tournament matches khatam ho gaye hain.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await refreshParticipantsForMatch(next, nextNumber);
      setNotice(`Match ${nextNumber} — ${displayMap(next)} live hai.`);
    } catch (e: any) { setError(e?.message || 'Next match start nahi ho saka.'); }
    finally { setBusy(false); }
  };

  const endSession = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await updateSession({ status: 'completed', overlay_enabled: false });
      setNotice('Broadcast session completed. Data محفوظ hai.');
    } catch (e: any) { setError(e?.message || 'Session end nahi hui.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!session || !supabase) return;
    const channel = supabase
      .channel(`live-broadcast-session-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_sessions', filter: `id=eq.${session.id}` }, () => loadSessionState(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_teams', filter: `session_id=eq.${session.id}` }, () => loadSessionState(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_broadcast_players', filter: `session_id=eq.${session.id}` }, () => loadSessionState(session.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  if (!isOpen) return null;

  if (!adminAllowed) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-[#050b14] p-6 text-center shadow-2xl">
          <ShieldCheck className="w-10 h-10 mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-black text-white">Admin Only</h2>
          <p className="text-sm text-gray-400 mt-2">Live Broadcast Control sirf authorized admin account ke liye available hai.</p>
          <button onClick={onClose} className="mt-5 px-5 py-2.5 rounded-xl bg-gray-800 text-white font-bold">Close</button>
      </div>
    );
  }

  return (
    <div className="w-full text-white">
      <div className="w-full overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#030812] shadow-[0_0_80px_rgba(0,229,255,0.12)] flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-cyan-400/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-purple-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase font-black text-cyan-300">MVP ESPORTS • LIVE BROADCAST</div>
              <h2 className="text-xl font-black">Tournament Broadcast Control Room</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {!session && (
            <>
              <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-5">
                <section className="rounded-2xl border border-cyan-400/15 bg-[#07111f] p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-4"><Trophy className="w-5 h-5 text-amber-300" /><h3 className="font-black">Tournament / Match Sequence</h3></div>
                  <p className="text-xs text-gray-400 mb-4">Existing MVP ESPORTS matches se sequence select karein. Existing bookings/player data isi live session mein snapshot honge.</p>
                  <div className="space-y-3 max-h-72 overflow-y-auto">
                    {selectableTournamentGroups.map(group => (
                      <div key={group.title} className="rounded-xl border border-white/5 bg-black/20 p-3">
                        <div className="text-sm font-black mb-2">{group.title}</div>
                        <div className="space-y-2">
                          {group.items.map(match => {
                            const selected = selectedMatchIds.includes(match.id);
                            const idx = selectedMatchIds.indexOf(match.id);
                            return (
                              <button
                                key={match.id}
                                onClick={() => setSelectedMatchIds(prev => selected ? prev.filter(id => id !== match.id) : [...prev, match.id])}
                                className={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition ${selected ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'}`}
                              >
                                <div>
                                  <div className="text-xs font-black">{selected ? `MATCH ${idx + 1}` : 'ADD'} • {match.title}</div>
                                  <div className="text-[10px] text-gray-400 mt-1">{String(match.type).toUpperCase()} • {displayMap(match)} • {match.squad_type}</div>
                                </div>
                                {selected ? <CheckCircle2 className="w-5 h-5 text-cyan-300" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-purple-400/15 bg-[#07111f] p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-purple-300" /><h3 className="font-black">Broadcast Setup</h3></div>
                  <label className="text-xs text-gray-300">Selected matches
                    <input type="number" min={1} max={selectedMatchIds.length || 1} value={totalMatches} onChange={e => setTotalMatches(Math.max(1, Number(e.target.value)))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-gray-300">Kill Points
                    <input type="number" min={0} step="0.01" value={killPoints} onChange={e => setKillPoints(Math.max(0, Number(e.target.value)))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <div>
                    <div className="text-xs font-bold text-gray-300 mb-2">Placement Points</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(placementPoints).map(([position, value]) => (
                        <label key={position} className="text-[10px] text-gray-400">TOP {position}
                          <input type="number" min={0} value={value} onChange={e => setPlacementPoints(prev => ({ ...prev, [Number(position)]: Math.max(0, Number(e.target.value)) }))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white" />
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="text-xs text-gray-300">Live Stream URL (optional)
                    <input value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://youtube.com/..." className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <button disabled={busy || !selectedMatchIds.length} onClick={startSession} className="w-full rounded-xl px-4 py-3 font-black text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-black disabled:opacity-40 flex items-center justify-center gap-2">
                    <Play className="w-4 h-4" /> CREATE LIVE SESSION
                  </button>
                </section>
              </div>
            </>
          )}

          {session && (
            <>
              <div className="grid md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] text-gray-500 font-bold">MATCH</div><div className="text-2xl font-black mt-1">{session.current_match_number} / {session.total_matches}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] text-gray-500 font-bold">MAP</div><div className="text-lg font-black mt-1">{session.current_map || '—'}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] text-gray-500 font-bold">FORMAT</div><div className="text-lg font-black mt-1">{session.current_squad_type || '—'}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] text-gray-500 font-bold">STATUS</div><div className={`text-lg font-black mt-1 ${session.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}`}>{session.status.toUpperCase()}</div></div>
              </div>

              <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-cyan-500/10 via-transparent to-purple-500/10 p-4 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[220px]"><div className="text-[10px] tracking-widest text-cyan-300 font-black">{session.tournament_title || 'MVP ESPORTS'}</div><div className="font-black text-lg">MATCH {session.current_match_number} • {session.current_map} • {String(session.current_match_type || '').toUpperCase()}</div></div>
                <button disabled={busy || session.status === 'completed'} onClick={setLive} className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-black text-xs flex items-center gap-2"><Play className="w-4 h-4" /> GO LIVE</button>
                <button disabled={busy || session.status !== 'live'} onClick={pauseLive} className="px-4 py-2.5 rounded-xl bg-amber-400 text-black font-black text-xs flex items-center gap-2"><Pause className="w-4 h-4" /> PAUSE</button>
                <button disabled={busy || session.status === 'completed'} onClick={toggleOverlay} className={`px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 ${session.overlay_enabled ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white'}`}>{session.overlay_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />} OVERLAY {session.overlay_enabled ? 'ON' : 'OFF'}</button>
                <button disabled={busy || session.status === 'completed'} onClick={endSession} className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-black text-xs flex items-center gap-2"><CircleStop className="w-4 h-4" /> END</button>
              </div>

              <div className="grid lg:grid-cols-[1fr_360px] gap-5">
                <section className="rounded-2xl border border-white/10 bg-[#07111f] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-300" /><span className="font-black">LIVE TEAM LEADERBOARD</span></div><span className="text-[10px] text-gray-500">{teams.length} TEAMS</span></div>
                  <div className="p-3 space-y-2 max-h-[430px] overflow-y-auto">
                    {teams.map((team, idx) => (
                      <div key={team.id} className="rounded-xl border border-white/5 bg-black/20 p-3 flex items-center gap-3">
                        <div className="w-8 text-center text-sm font-black text-amber-300">#{idx + 1}</div>
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400/20 to-purple-400/20 border border-white/10 flex items-center justify-center font-black">{team.team_name.slice(0, 2).toUpperCase()}</div>
                        <div className="flex-1 min-w-0"><div className="font-black truncate">{team.team_name}</div><div className="text-[10px] text-gray-500">ALIVE {team.current_alive_players}</div></div>
                        <div className="text-right"><div className="text-[10px] text-gray-500">KILLS</div><div className="font-black text-cyan-300">{team.current_match_kills}</div></div>
                        <div className="text-right min-w-14"><div className="text-[10px] text-gray-500">PTS</div><div className="font-black text-white">{team.tournament_total_points}</div></div>
                      </div>
                    ))}
                    {!teams.length && <div className="text-sm text-gray-500 text-center py-10">No teams loaded.</div>}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="rounded-2xl border border-cyan-400/15 bg-[#07111f] p-4">
                    <div className="flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-orange-300" /><span className="font-black">ADMIN KILL CONTROL</span></div>
                    <select value={manualKillerId} onChange={e => setManualKillerId(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm">
                      <option value="">Select Killer</option>
                      {players.filter(p => p.is_alive).map(p => <option key={p.id} value={p.id}>{p.player_name}</option>)}
                    </select>
                    <select value={manualVictimId} onChange={e => setManualVictimId(e.target.value)} className="mt-2 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm">
                      <option value="">Victim optional</option>
                      {players.filter(p => p.is_alive && p.id !== manualKillerId).map(p => <option key={p.id} value={p.id}>{p.player_name}</option>)}
                    </select>
                    <button disabled={busy || !manualKillerId || session.status === 'completed'} onClick={addKill} className="mt-3 w-full rounded-xl bg-gradient-to-r from-orange-400 to-red-500 text-black font-black text-xs px-4 py-3 disabled:opacity-40">+ CONFIRM KILL EVENT</button>
                    <p className="text-[10px] text-gray-500 mt-2">Phase 2 manual fallback. Automatic video/OCR detection Phase 7 mein connect hoga.</p>
                  </div>

                  <div className="rounded-2xl border border-amber-400/15 bg-[#07111f] p-4">
                    <div className="flex items-center gap-2 mb-3"><Settings2 className="w-4 h-4 text-amber-300" /><span className="font-black">LIVE SCORING RULES</span></div>
                    <div className="flex gap-2 items-end">
                      <label className="flex-1 text-[10px] text-gray-400">KILL POINTS
                        <input type="number" min={0} step="0.01" value={killPoints} onChange={e => setKillPoints(Math.max(0, Number(e.target.value)))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-white" />
                      </label>
                      <button disabled={savingScoreRules} onClick={async () => {
                        if (!supabase || !session) return;
                        setSavingScoreRules(true); setError('');
                        try {
                          await supabase.from('live_broadcast_scoring_rules').delete().eq('session_id', session.id);
                          await saveScoringRules(session.id);
                          await supabase.from('live_broadcast_matches').update({ scoring_snapshot: { kill_points: killPoints, placement_points: placementPoints } }).eq('session_id', session.id).eq('match_number', session.current_match_number);
                          setNotice('Live scoring rules update ho gaye.');
                        } catch (e: any) { setError(e?.message || 'Scoring rules save nahi ho sake.'); }
                        finally { setSavingScoreRules(false); }
                      }} className="px-3 py-2 rounded-lg bg-amber-400 text-black font-black text-[10px] disabled:opacity-40"><Save className="w-3 h-3 inline mr-1" /> SAVE</button>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {Object.entries(placementPoints).map(([position, value]) => (
                        <label key={position} className="text-[9px] text-gray-500">TOP {position}
                          <input type="number" min={0} value={value} onChange={e => setPlacementPoints(prev => ({ ...prev, [Number(position)]: Math.max(0, Number(e.target.value)) }))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white" />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#07111f] p-4">
                    <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-purple-300" /><span className="font-black">PLAYER STATE</span><button onClick={() => setShowAllPlayers(v => !v)} className="ml-auto text-[10px] text-cyan-300">{showAllPlayers ? 'HIDE' : 'SHOW'}</button></div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {(showAllPlayers ? players : players.slice(0, 8)).map(p => <div key={p.id} className="flex items-center justify-between text-xs rounded-lg bg-white/[0.02] px-2 py-1.5"><span className="truncate pr-2">{p.player_name}</span><span className={p.is_alive ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>{p.is_alive ? 'ALIVE' : 'OUT'} • {p.current_match_kills} K</span></div>)}
                    </div>
                  </div>
                </section>
              </div>

              <div className="rounded-2xl border border-purple-400/15 bg-[#07111f] p-4 flex flex-wrap items-center gap-3">
                <div className="mr-auto"><div className="text-[10px] text-purple-300 tracking-widest font-black">TOURNAMENT PROGRESSION</div><div className="font-black">Match {session.current_match_number} of {session.total_matches}</div></div>
                <button disabled={busy || session.status === 'completed' || currentMatchIndex >= currentSelectedSequence.length - 1} onClick={nextMatch} className="px-4 py-2.5 rounded-xl bg-purple-500 text-white font-black text-xs flex items-center gap-2 disabled:opacity-40"><SkipForward className="w-4 h-4" /> NEXT MATCH</button>
                <button disabled={busy} onClick={() => loadSessionState(session.id)} className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-black text-xs flex items-center gap-2"><RotateCcw className="w-4 h-4" /> REFRESH</button>
              </div>
            </>
          )}

          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
          {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300 flex items-center gap-2"><Save className="w-4 h-4" /> {notice}</div>}

          <div className="text-[10px] text-gray-600 flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> Existing MVP ESPORTS booking/wallet/deposit/withdrawal tables are not modified by this module.</div>
        </div>
      </div>
    </div>
  );
};
