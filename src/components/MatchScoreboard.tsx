import React, { useState } from 'react';
import {
  Crown,
  Trophy,
  Swords,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ZoomIn,
  X,
  Clock
} from 'lucide-react';
import { MatchResult, PlayerResult } from '../types';
import { getLocalMatches } from '../lib/supabase';
import { CelebrationOverlay } from './CelebrationOverlay';

interface MatchScoreboardProps {
  matchResult: MatchResult;
  defaultExpanded?: boolean;
  cardIndex?: number;
}

export const MatchScoreboard: React.FC<MatchScoreboardProps> = ({
  matchResult,
  defaultExpanded = false,
  cardIndex = 0
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [isViewingImage, setIsViewingImage] = useState<boolean>(false);

  const displayImageUrl = matchResult.screenshot_url || matchResult.result_image_url;

  // Find parent match config if available
  const allMatches = getLocalMatches();
  const parentMatch = allMatches.find((m) => m.id === matchResult.match_id);

  const isTournament = matchResult.match_type === 'tournament' || parentMatch?.type === 'tournament';
  const squadType = (matchResult.squad_type || parentMatch?.squad_type || 'SQUAD').toUpperCase();
  const matchTitle = matchResult.match_title || 'PUBG Esports Match';
  const mapName = matchResult.map || parentMatch?.map || 'Erangel';
  const tournamentMatchesCount = matchResult.tournament_matches_count || (parentMatch?.maps?.length || 3);

  const matchTime =
    matchResult.match_time ||
    parentMatch?.match_time ||
    (parentMatch?.start_time ? String(parentMatch.start_time) : '') ||
    (matchResult.published_at
      ? new Date(matchResult.published_at).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      : '');

  // Theme styling based on index (0=cyan, 1=red, 2=yellow)
  const themeIndex = (cardIndex || 0) % 3;
  const colorThemes = [
    {
      // 0 = Cyan / Blue
      container: 'border-[#00e5ff]/40 shadow-[#00e5ff]/10 bg-gradient-to-b from-[#07192e] via-[#040e1a] to-[#030a16]',
      badge: 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40',
      timeBadge: 'text-cyan-300 bg-cyan-950/70 border-cyan-500/40',
      toggleBtn: 'from-[#07192e] via-[#0b2440] to-[#07192e] border-[#00e5ff]/40 text-[#00e5ff] hover:border-[#00e5ff]'
    },
    {
      // 1 = Red / Rose
      container: 'border-rose-500/40 shadow-rose-950/20 bg-gradient-to-b from-[#1f070e] via-[#0f0307] to-[#080104]',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      timeBadge: 'text-rose-300 bg-rose-950/70 border-rose-500/40',
      toggleBtn: 'from-[#1f070e] via-[#2d0b15] to-[#1f070e] border-rose-500/40 text-rose-300 hover:border-rose-400'
    },
    {
      // 2 = Yellow / Amber
      container: 'border-amber-500/40 shadow-amber-950/20 bg-gradient-to-b from-[#1f1707] via-[#0f0b03] to-[#080501]',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      timeBadge: 'text-amber-300 bg-amber-950/70 border-amber-500/40',
      toggleBtn: 'from-[#1f1707] via-[#2d200b] to-[#1f1707] border-amber-500/40 text-amber-300 hover:border-amber-400'
    }
  ];
  const theme = colorThemes[themeIndex];

  // Filter out empty / unoccupied results (ONLY render valid booked/added players)
  const validResults = (matchResult.results || []).filter((r) => {
    if (!r || !r.player_ign) return false;
    const ign = r.player_ign.trim().toLowerCase();
    if (!ign || ign === 'unoccupied' || ign.includes('unoccupied slot') || ign.includes('empty slot')) return false;
    return true;
  });

  const squadSize = squadType === 'SQUAD' ? 4 : squadType === 'DUO' ? 2 : 1;

  // Group validResults into teams for SQUAD / DUO
  const teamsMap = new Map<string, PlayerResult[]>();
  validResults.forEach((r, idx) => {
    let key = r.team_name ? r.team_name.trim() : '';
    if (!key && squadSize > 1) {
      const teamNum = Math.ceil((r.slot_number || (idx + 1)) / squadSize);
      key = `TEAM #${teamNum}`;
    } else if (!key) {
      key = `PLAYER #${r.slot_number || (idx + 1)}`;
    }
    if (!teamsMap.has(key)) {
      teamsMap.set(key, []);
    }
    teamsMap.get(key)!.push(r);
  });

  const teamsData = Array.from(teamsMap.entries()).map(([teamName, players], i) => {
    let teamKills = 0;
    let teamPoints = 0;
    let minRank = 999;
    let isTeamWinner = false;
    let winningPrize = '';

    players.forEach((playerRes) => {
      teamKills += playerRes.kills || 0;
      teamPoints += (playerRes.points !== undefined ? playerRes.points : 0);
      if (playerRes.winning_prize && !winningPrize) {
        winningPrize = String(playerRes.winning_prize);
      }
      if (playerRes.rank && playerRes.rank < minRank) {
        minRank = playerRes.rank;
      }
      if (playerRes.is_winner || playerRes.rank === 1) {
        isTeamWinner = true;
      }
    });

    if (minRank === 999) minRank = i + 1;

    return {
      teamNum: i + 1,
      teamName,
      teamKills,
      teamPoints,
      winningPrize,
      teamRank: isTeamWinner ? 1 : minRank,
      isTeamWinner,
      slots: players.map((r) => ({ slotNumber: r.slot_number || 0, result: r }))
    };
  });

  // Sort teams
  const sortedTeams = [...teamsData]
    .sort((a, b) => {
      if (isTournament) {
        if (a.teamPoints !== b.teamPoints) {
          return b.teamPoints - a.teamPoints;
        }
        if (a.isTeamWinner && !b.isTeamWinner) return -1;
        if (!a.isTeamWinner && b.isTeamWinner) return 1;
        return b.teamKills - a.teamKills;
      }

      const aWin = a.isTeamWinner || a.teamRank === 1;
      const bWin = b.isTeamWinner || b.teamRank === 1;
      if (aWin && !bWin) return -1;
      if (!aWin && bWin) return 1;

      if (a.teamRank !== b.teamRank) {
        return a.teamRank - b.teamRank;
      }

      return b.teamKills - a.teamKills;
    })
    .map((team, idx) => {
      const rank = idx + 1;
      return {
        ...team,
        rank,
        displayName: team.teamName && !team.teamName.startsWith('TEAM #')
          ? team.teamName
          : `TEAM #${rank}`
      };
    });

  // Find Winning Team & Winner Player
  const winningTeam = (sortedTeams || [])[0];
  const winnerPlayer =
    validResults.find((r) => r.is_winner || r.rank === 1) || validResults[0];

  const winningTeamPlayers = winningTeam
    ? winningTeam.slots
        .map((s) => s.result)
        .filter((r): r is PlayerResult => Boolean(r))
    : [];

  // Solo Mode sorted list
  const sortedSoloResults = [...validResults]
    .sort((a, b) => {
      if (isTournament) {
        const aPts = a.points || 0;
        const bPts = b.points || 0;
        if (aPts !== bPts) return bPts - aPts;
      }

      const aWin = a.is_winner || a.rank === 1;
      const bWin = b.is_winner || b.rank === 1;
      if (aWin && !bWin) return -1;
      if (!aWin && bWin) return 1;

      if (a.rank && b.rank && a.rank !== b.rank) return a.rank - b.rank;

      return (b.kills || 0) - (a.kills || 0);
    })
    .map((r, idx) => ({
      slotNum: r.slot_number || (idx + 1),
      result: r,
      rank: idx + 1
    }));

  return (
    <div className={`rounded-2xl border shadow-2xl overflow-hidden transition-all ${theme.container}`}>
      {/* Header Info */}
      <div className="p-4 border-b border-gray-800/80 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] mb-1">
              <span className={`px-2 py-0.5 rounded font-black uppercase tracking-wider border ${theme.badge}`}>
                {isTournament ? `🏆 TOURNAMENT (${tournamentMatchesCount} MATCHES)` : `${squadType} MATCH`}
              </span>
              <span className="text-gray-300 font-bold bg-black/50 px-2 py-0.5 rounded border border-gray-800">
                MAP: {mapName}
              </span>
              {matchTime && (
                <span className={`px-2.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 border ${theme.timeBadge}`}>
                  <Clock className="w-3 h-3 text-current shrink-0" />
                  <span>{matchTime}</span>
                </span>
              )}
              {validResults.length > 0 ? (
  <span className="text-gray-400">
    • {validResults.length} PLAYERS ({squadSize > 1 ? `${sortedTeams.length} TEAMS` : 'SOLO'})
  </span>
) : displayImageUrl ? (
  <span className="text-gray-400">• RESULT PUBLISHED</span>
) : null}
            </div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
              {matchTitle}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {displayImageUrl && (
              <button
                type="button"
                onClick={() => setIsViewingImage(true)}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase flex items-center gap-1 hover:bg-cyan-500/30 transition-all shadow cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>View Result</span>
              </button>
            )}
            <span className="text-[10px] text-emerald-400 font-black uppercase bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/40">
              OFFICIAL RESULT
            </span>
          </div>
        </div>

        {/* CELEBRATION OVERLAY (Fireworks, Balloons, Confetti, Crackers & Crowd Cheer Audio) */}
        {isExpanded && (
          <div className="pt-1">
            <CelebrationOverlay triggerKey={`${matchResult.match_id}_${cardIndex}_${isExpanded}`} />
          </div>
        )}

        {/* SINGLE VIP WINNER CARD (NO DUPLICATE) */}
        {(winningTeam || winnerPlayer) && (
          <div className="pt-1">
            <div className="p-3.5 sm:p-4 rounded-xl border-2 border-yellow-400 bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-600/25 shadow-[0_0_25px_rgba(250,204,21,0.25)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-yellow-500 to-amber-300 text-black font-black flex items-center justify-center text-2xl shadow-xl shrink-0 border border-yellow-200">
                  👑
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs sm:text-sm font-black text-yellow-300 uppercase tracking-widest flex items-center gap-1">
                      <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                      WINNER WINNER CHICKEN DINNER
                    </span>
                    <span className="text-[9px] font-black bg-yellow-400 text-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {squadSize === 4 ? '4-PLAYER SQUAD' : squadSize === 2 ? '2-PLAYER DUO' : 'SOLO WINNER'}
                    </span>
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-white truncate">
                    {squadSize > 1
                      ? winningTeam?.displayName || 'WINNING TEAM'
                      : winnerPlayer?.player_ign || 'MATCH WINNER'}
                  </h4>
                  {squadSize > 1 && winningTeamPlayers.length > 0 && (
                    <p className="text-xs text-yellow-200/90 font-bold truncate mt-0.5">
                      Roster: {winningTeamPlayers.map((p) => p.player_ign).join(' • ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Champion Stats / Prize pill */}
              <div className="flex items-center gap-2.5 bg-black/70 px-3.5 py-2 rounded-xl border border-yellow-400/50 shrink-0 self-stretch sm:self-auto justify-between sm:justify-end">
                <div>
                  {isTournament && winningTeam?.teamPoints !== undefined && (
                    <span className="text-xs font-black text-yellow-400 font-mono block">
                      {winningTeam.teamPoints} PTS
                    </span>
                  )}
                  <span className="text-[11px] text-gray-300 font-bold block">
                    {squadSize > 1 ? `${winningTeam?.teamKills || 0} Team Kills` : `${winnerPlayer?.kills || 0} Kills`}
                  </span>
                </div>
                {(winningTeam?.winningPrize || winnerPlayer?.winning_prize) && (
                  <div className="text-right pl-3 border-l border-gray-700">
                    <span className="text-[9px] text-yellow-400 uppercase font-black block">Winning Prize</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {winningTeam?.winningPrize || winnerPlayer?.winning_prize}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OFFICIAL RESULT SCREENSHOT — full width card */}
        {displayImageUrl && (
          <div className="pt-2">
            <div className="rounded-2xl border border-cyan-500/40 bg-[#020710] overflow-hidden shadow-xl shadow-cyan-950/20">
              <div className="flex items-center gap-1.5 text-xs font-black text-cyan-300 uppercase tracking-wider px-3 pt-3 pb-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                <span>OFFICIAL MATCH RESULT</span>
              </div>

              <div
                onClick={() => setIsViewingImage(true)}
                className="relative w-full bg-black cursor-pointer overflow-hidden group"
              >
                <img
                  src={displayImageUrl}
                  alt={`Official Result - ${matchTitle}`}
                  className="w-full h-auto object-contain block"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-full bg-black/80 text-[#00e5ff] text-xs font-bold border border-[#00e5ff]/50 flex items-center gap-1.5 shadow-xl">
                    <ZoomIn className="w-3.5 h-3.5" />
                    Tap to enlarge
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TOURNAMENT RUNNERS UP PODIUM CARDS (2ND & 3RD PLACE ONLY - NO DUPLICATE 1ST PLACE) */}
        {isTournament && squadSize > 1 && sortedTeams.length >= 2 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-300 uppercase tracking-wider">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>RUNNERS UP PODIUM TEAMS</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 2nd Place VIP Silver Card */}
              {sortedTeams[1] && (
                <div className="p-3 rounded-xl bg-gradient-to-b from-slate-400/20 via-[#07192e] to-[#030a16] border-2 border-slate-300 shadow-[0_0_12px_rgba(203,213,225,0.15)] flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-black text-[9px] font-black uppercase flex items-center gap-1 shadow">
                        🥈 2ND PLACE
                      </span>
                      <span className="text-xs font-mono font-black text-slate-300">
                        {sortedTeams[1].teamPoints} PTS
                      </span>
                    </div>
                    <h5 className="font-black text-white text-sm truncate">{sortedTeams[1].displayName}</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">Kills: {sortedTeams[1].teamKills}</p>
                  </div>
                  {sortedTeams[1].winningPrize && (
                    <div className="mt-2 pt-1.5 border-t border-slate-400/30 flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-bold">Winning Prize:</span>
                      <span className="font-black text-emerald-400">{sortedTeams[1].winningPrize}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 3rd Place VIP Bronze Card */}
              {sortedTeams[2] && (
                <div className="p-3 rounded-xl bg-gradient-to-b from-amber-700/20 via-[#07192e] to-[#030a16] border-2 border-amber-600 shadow-[0_0_12px_rgba(217,119,6,0.15)] flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[9px] font-black uppercase flex items-center gap-1 shadow">
                        🥉 3RD PLACE
                      </span>
                      <span className="text-xs font-mono font-black text-amber-400">
                        {sortedTeams[2].teamPoints} PTS
                      </span>
                    </div>
                    <h5 className="font-black text-white text-sm truncate">{sortedTeams[2].displayName}</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">Kills: {sortedTeams[2].teamKills}</p>
                  </div>
                  {sortedTeams[2].winningPrize && (
                    <div className="mt-2 pt-1.5 border-t border-amber-600/30 flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-bold">Winning Prize:</span>
                      <span className="font-black text-emerald-400">{sortedTeams[2].winningPrize}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* EXPAND SCOREBOARD TOGGLE BUTTON */}
      {validResults.length > 0 && (
        <div className="p-2.5 bg-[#020710]/90 border-y border-gray-800/80 flex justify-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`w-full py-2.5 px-4 rounded-xl bg-gradient-to-r ${theme.toggleBtn} font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer`}
          >
            <Swords className="w-4 h-4 text-current" />
            <span>
              {isExpanded
                ? `COLLAPSE SCOREBOARD`
                : `VIEW FULL SCOREBOARD (${validResults.length} PLAYERS / ${
                    squadSize > 1 ? `${sortedTeams.length} TEAMS` : 'SOLO PLAYERS'
                  })`}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-current" />
            ) : (
              <ChevronDown className="w-4 h-4 text-current" />
            )}
          </button>
        </div>
      )}

      {/* FULL SCOREBOARD BREAKDOWN */}
      {isExpanded && validResults.length > 0 && (
        <div className="p-3 bg-[#020710]/95 space-y-3 animate-in fade-in duration-200">
          {/* SQUAD / DUO MODE TEAMS BREAKDOWN */}
          {squadSize > 1 ? (
            <div className="space-y-3">
              {sortedTeams.map((team) => {
                const isWinner = team.rank === 1 || team.isTeamWinner;
                const isSecond = team.rank === 2;
                const isThird = team.rank === 3;

                // Color Themes based on Rank
                let cardStyle = 'bg-[#07192e]/80 border-gray-800 text-gray-300';
                let rankBadge = (
                  <span className="text-[10px] font-black text-gray-400 bg-gray-800 px-2.5 py-0.5 rounded">
                    RANK #{team.rank}
                  </span>
                );

                if (isWinner) {
                  cardStyle =
                    'bg-gradient-to-r from-amber-500/25 via-yellow-400/10 to-amber-600/20 border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.25)]';
                  rankBadge = (
                    <span className="text-[10px] font-black text-black bg-gradient-to-r from-yellow-300 to-amber-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow">
                      👑 WINNER #1 {isTournament ? 'CHAMPION' : 'CHICKEN DINNER'}
                    </span>
                  );
                } else if (isSecond) {
                  cardStyle =
                    'bg-gradient-to-r from-slate-400/20 via-gray-300/10 to-slate-500/20 border-2 border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.2)]';
                  rankBadge = (
                    <span className="text-[10px] font-black text-black bg-slate-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow">
                      🥈 RUNNER UP #2
                    </span>
                  );
                } else if (isThird) {
                  cardStyle =
                    'bg-gradient-to-r from-amber-800/25 via-amber-700/10 to-amber-900/20 border-2 border-amber-600 shadow-[0_0_15px_rgba(217,119,6,0.2)]';
                  rankBadge = (
                    <span className="text-[10px] font-black text-white bg-amber-600 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow">
                      🥉 RUNNER UP #3
                    </span>
                  );
                }

                return (
                  <div
                    key={team.rank}
                    className={`rounded-xl border p-3 space-y-2 transition-all ${cardStyle}`}
                  >
                    {/* Team Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/50 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-black text-white bg-black/60 px-2.5 py-1 rounded-lg border border-gray-700 font-mono">
                          TEAM #{team.rank}
                        </span>
                        <h4 className="text-sm font-black text-white truncate">
                          {team.displayName}
                        </h4>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {rankBadge}
                        {isTournament && team.teamPoints !== undefined && (
                          <span className="text-xs font-black text-yellow-400 bg-[#030a16] px-2 py-0.5 rounded border border-yellow-400/30 font-mono">
                            {team.teamPoints} PTS
                          </span>
                        )}
                        <span className="text-xs font-black text-[#00e5ff] bg-[#030a16] px-2 py-0.5 rounded border border-[#00e5ff]/30 font-mono">
                          {team.teamKills} KILLS
                        </span>
                        {team.winningPrize && (
                          <span className="text-xs font-black text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-500/40 font-mono">
                            Winning Prize: {team.winningPrize}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Team Player Slots Grid (NO Winning Prize per player in squad/duo mode) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {team.slots.map(({ slotNumber, result }) => {
                        return (
                          <div
                            key={result.player_ign + '_' + slotNumber}
                            className="p-2.5 rounded-lg border flex items-center justify-between text-xs bg-[#030a16]/90 border-gray-700"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {slotNumber > 0 && (
                                <span className="text-[10px] font-mono text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800 shrink-0">
                                  S-{slotNumber}
                                </span>
                              )}

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white truncate">
                                    {result.player_ign}
                                  </span>
                                  {isWinner && (
                                    <span className="text-[8px] bg-yellow-400 text-black font-black px-1.5 py-0.2 rounded uppercase flex items-center gap-0.5 shrink-0">
                                      👑 WINNER
                                    </span>
                                  )}
                                </div>
                                {result.username && (
                                  <span className="text-[9px] text-gray-400 font-mono block">
                                    {result.username.startsWith('@') ? result.username : `@${result.username}`}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-black text-[#00e5ff] font-mono block">
                                {result.kills} KILLS
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* SOLO MODE SLOT BREAKDOWN */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedSoloResults.map(({ slotNum, result, rank }) => {
                const isWinner = rank === 1 || (result && (result.is_winner || result.rank === 1));
                const isSecond = rank === 2;
                const isThird = rank === 3;

                let slotStyle = 'bg-[#030a16] border-gray-800';
                if (isWinner) {
                  slotStyle =
                    'bg-gradient-to-r from-amber-500/20 to-yellow-400/10 border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]';
                } else if (isSecond) {
                  slotStyle =
                    'bg-gradient-to-r from-slate-400/20 to-slate-500/10 border-2 border-slate-300';
                } else if (isThird) {
                  slotStyle =
                    'bg-gradient-to-r from-amber-800/20 to-amber-900/10 border-2 border-amber-600';
                }

                return (
                  <div
                    key={rank}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${slotStyle}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-xs font-black text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-800 shrink-0">
                        #{rank}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white truncate">
                            {result.player_ign}
                          </h4>
                          {isWinner && (
                            <span className="text-[8px] bg-yellow-400 text-black font-black px-1.5 py-0.2 rounded uppercase shrink-0">
                              👑 WINNER
                            </span>
                          )}
                        </div>
                        {result.username && (
                          <p className="text-[9px] text-gray-400 truncate">
                            @{result.username.replace('@', '')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-[#00e5ff] font-mono block">
                        {result.kills} KILLS
                      </span>
                      {result.winning_prize && (
                        <span className="text-[10px] font-black text-emerald-400 font-mono block">
                          Winning Prize: {result.winning_prize}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

{/* SCREENSHOT LIGHTBOX — full image + scroll + top X close */}
      {isViewingImage && displayImageUrl && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          {/* Sticky top bar with X */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 bg-black/90 border-b border-gray-800">
            <span className="text-xs font-black text-cyan-300 uppercase tracking-wider truncate pr-2">
              Match Result
            </span>
            <button
              type="button"
              onClick={() => setIsViewingImage(false)}
              className="p-2.5 rounded-full bg-gray-800 hover:bg-red-600 text-white shadow-xl active:scale-95 transition-all"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable full image area */}
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            onClick={() => setIsViewingImage(false)}
          >
            <div
              className="min-h-full w-full flex justify-center py-2 px-1"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={displayImageUrl}
                alt={`Official Match Result - ${matchTitle}`}
                className="w-full max-w-3xl h-auto object-contain select-none"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};