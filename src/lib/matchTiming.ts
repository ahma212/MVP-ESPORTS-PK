import { Match } from '../types';

const MAP_PLAY_MS = 30 * 60 * 1000;
const DEFAULT_GAP_MS = 15 * 60 * 1000;

export function getMatchStartTimestamp(match: Match, now = Date.now()): number {
  return (
    match.start_timestamp ||
    (typeof match.start_time === 'number'
      ? match.start_time
      : typeof match.start_time === 'string' && !isNaN(Date.parse(match.start_time))
      ? Date.parse(match.start_time)
      : match.timestamp) ||
    now + 3600000
  );
}

export function getTournamentMapsCount(match: Match): number {
  if (match.maps && match.maps.length > 0) return match.maps.length;
  if (match.type === 'tournament') return 3;
  return 1;
}

export function getMatchPlayWindowMs(match: Match): number {
  if (match.type === 'tournament') {
    const mapsCount = getTournamentMapsCount(match);
    const gapMins = Number(match.gap_minutes);
    const gapMs =
      Number.isFinite(gapMins) && gapMins >= 0
        ? gapMins * 60 * 1000
        : DEFAULT_GAP_MS;
    return mapsCount * MAP_PLAY_MS + Math.max(0, mapsCount - 1) * gapMs;
  }
  return MAP_PLAY_MS;
}

export function isMatchPlayEnded(match: Match, now = Date.now()): boolean {
  if (match.status === 'completed') return true;
  const start = getMatchStartTimestamp(match, now);
  const diff = start - now;
  if (Boolean(match.is_ended) && diff <= 0) return true;
  return now >= start + getMatchPlayWindowMs(match);
}

export function isMatchPlayLive(match: Match, now = Date.now()): boolean {
  if (isMatchPlayEnded(match, now)) return false;
  const start = getMatchStartTimestamp(match, now);
  return now >= start || match.status === 'live';
}
export function getTournamentGapMs(match: Match): number {
  const gapMins = Number(match.gap_minutes);
  if (Number.isFinite(gapMins) && gapMins >= 0) return gapMins * 60 * 1000;
  return DEFAULT_GAP_MS;
}

export function getTournamentMapWindow(match: Match, mapIndex: number) {
  const start = getMatchStartTimestamp(match);
  const play = MAP_PLAY_MS;
  const gap = getTournamentGapMs(match);
  const startsAt = start + mapIndex * (play + gap);
  const endsAt = startsAt + play;
  return { startsAt, endsAt };
}

export function getTournamentMapPhase(
  match: Match,
  mapIndex: number,
  now = Date.now()
) {
  const { startsAt, endsAt } = getTournamentMapWindow(match, mapIndex);
  if (now >= endsAt) {
    return { phase: 'ended' as const, startsAt, endsAt, remainingMs: 0 };
  }
  if (now >= startsAt) {
    return { phase: 'live' as const, startsAt, endsAt, remainingMs: endsAt - now };
  }
  return { phase: 'upcoming' as const, startsAt, endsAt, remainingMs: startsAt - now };
}