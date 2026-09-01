import {
  supabase,
  isSupabaseConfigured,
  callApplyLiveBroadcastEvent,
  callReverseLiveBroadcastEvent,
  callAdvanceLiveBroadcastMatch,
  callSnapshotLiveBroadcastMatch,
  getLiveBroadcastRoster,
  resolveLiveBroadcastPlayerIdentity,
  type LiveBroadcastPlayerIdentity,
} from './supabase';

/**
 * Shared Phase 3 broadcast engine facade.
 *
 * IMPORTANT:
 * - This file does NOT implement a second scoring system.
 * - All authoritative scoring/state changes are performed by the
 *   Supabase RPC functions installed in Phase 3.
 * - Team/Player Number is derived from slot_number and never stored as a
 *   new database column by this module.
 * - No localStorage/mock fallback is used for broadcast state.
 */

export type ApplyLiveBroadcastEventParams = {
  sessionId: string;
  broadcastMatchId?: string | null;
  eventType?: string;
  source?: string;
  killerPlayerId?: string | null;
  victimPlayerId?: string | null;
  killerTeamId?: string | null;
  victimTeamId?: string | null;
  killDelta?: number;
  pointDelta?: number;
  placementPosition?: number | null;
  detectionConfidence?: number | null;
  externalEventId?: string | null;
  payload?: Record<string, any> | null;
};

function requireBroadcastConnection(sessionId: string) {
  if (!sessionId) {
    throw new Error('Broadcast session ID is required.');
  }
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not connected. Live broadcast cannot continue.');
  }
}

function normalizeEventType(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function assertValidDelta(value: unknown, fieldName: string, allowNegative = true): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  if (!allowNegative && numeric < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
  return numeric;
}

/**
 * Resolve a player from Team Number + Player Number, optionally cross-checking
 * the display name/UID. This is intended for the future detector/review layer.
 *
 * It deliberately fails closed: an ambiguous or missing identity must not be
 * turned into an automatic kill.
 */
export async function resolveBroadcastPlayerByTeamAndNumber(params: {
  matchId: string;
  squadType?: string | null;
  teamNumber: number;
  playerNumber: number;
  playerName?: string | null;
  playerUid?: string | null;
}): Promise<LiveBroadcastPlayerIdentity | null> {
  const teamNumber = Number(params.teamNumber);
  const playerNumber = Number(params.playerNumber);

  if (!Number.isInteger(teamNumber) || teamNumber < 1) {
    throw new Error('Invalid Team Number.');
  }
  if (!Number.isInteger(playerNumber) || playerNumber < 1) {
    throw new Error('Invalid Player Number.');
  }

  const roster = await getLiveBroadcastRoster(params.matchId, params.squadType);

  const numberMatches = roster.filter(
    (player) =>
      Number(player.team_number) === teamNumber &&
      Number(player.player_number) === playerNumber
  );

  if (numberMatches.length !== 1) {
    return null;
  }

  const candidate = numberMatches[0];
  const suppliedName = String(params.playerName || '').trim().toLowerCase();
  const suppliedUid = String(params.playerUid || '').trim().toLowerCase();

  // UID is the strongest optional cross-check; then IGN/name.
  if (suppliedUid && String(candidate.player_uid || '').trim().toLowerCase() !== suppliedUid) {
    return null;
  }

  if (suppliedName) {
    const candidateName = String(candidate.player_name || '').trim().toLowerCase();
    if (candidateName && candidateName !== suppliedName) {
      return null;
    }
  }

  return candidate;
}

/**
 * Apply one authoritative live event through the Phase 3 Supabase function.
 * Knock/kill/revive/elimination semantics are NOT reimplemented here.
 */
export async function applyLiveBroadcastEvent(
  params: ApplyLiveBroadcastEventParams
): Promise<any> {
  requireBroadcastConnection(params.sessionId);

  const eventType = normalizeEventType(params.eventType || 'kill');
  const allowedEventTypes = new Set([
    'kill',
    'knock',
    'elimination',
    'player_revive',
    'winner',
    'placement',
    'points_adjustment',
    'kill_adjustment',
  ]);

  if (!allowedEventTypes.has(eventType)) {
    throw new Error(`Unsupported live broadcast event type: ${eventType}`);
  }

  const killDelta = assertValidDelta(params.killDelta, 'kill delta');
  const pointDelta = assertValidDelta(params.pointDelta, 'point delta');
  const placementPosition =
    params.placementPosition == null ? null : Number(params.placementPosition);
  const detectionConfidence =
    params.detectionConfidence == null ? null : Number(params.detectionConfidence);

  if (placementPosition !== null && (!Number.isInteger(placementPosition) || placementPosition < 1)) {
    throw new Error('Invalid placement position.');
  }

  if (
    detectionConfidence !== null &&
    (!Number.isFinite(detectionConfidence) || detectionConfidence < 0 || detectionConfidence > 1)
  ) {
    throw new Error('Detection confidence must be between 0 and 1.');
  }

  // Fail closed for confirmed kills: a kill event needs both participants.
  // The Supabase RPC remains the final authority for state changes.
  if (eventType === 'kill') {
    if (!params.killerPlayerId || !params.victimPlayerId) {
      throw new Error('A confirmed kill requires both killer and victim players.');
    }
   
  }

  // A knock is explicitly NOT a kill.
  if (eventType === 'knock' && killDelta !== 0) {
    throw new Error('Knock events cannot award kill credit.');
  }

  // Environment/unknown elimination must not assign a killer or kill credit.
  if (eventType === 'elimination' && killDelta !== 0) {
    throw new Error('Environment elimination cannot award kill credit.');
  }

  return await callApplyLiveBroadcastEvent({
    sessionId: params.sessionId,
    broadcastMatchId: params.broadcastMatchId,
    eventType,
    source: params.source || 'admin',
    killerPlayerId: params.killerPlayerId,
    victimPlayerId: params.victimPlayerId,
    killerTeamId: params.killerTeamId,
    victimTeamId: params.victimTeamId,
    killDelta,
    pointDelta,
    placementPosition,
    detectionConfidence,
    externalEventId: params.externalEventId,
    eventPayload: {
      ...(params.payload || {}),
      engine: 'liveBroadcastEngine',
      engine_version: 1,
    },
  });
}

/** Reverse one recorded event through the authoritative Phase 3 RPC. */
export async function reverseLiveBroadcastEvent(
  sessionId: string,
  eventId: string
): Promise<any> {
  requireBroadcastConnection(sessionId);
  if (!eventId) {
    throw new Error('Broadcast event ID is required for undo.');
  }
  return await callReverseLiveBroadcastEvent(sessionId, eventId);
}

/** Advance the current session to the next preconfigured match. */
export async function advanceLiveBroadcastMatch(sessionId: string): Promise<any> {
  requireBroadcastConnection(sessionId);
  return await callAdvanceLiveBroadcastMatch(sessionId);
}

/** Save the current match snapshot through the authoritative Phase 3 RPC. */
export async function snapshotLiveBroadcastMatch(sessionId: string): Promise<any> {
  requireBroadcastConnection(sessionId);
  return await callSnapshotLiveBroadcastMatch(sessionId);
}

/**
 * Build an identity from an existing booking without changing the database.
 * Useful to keep Team/Player numbering consistent across Admin, detector and
 * overlay code.
 */
export function getBroadcastIdentityFromBooking(
  booking: any,
  squadType: string | null | undefined,
  fallbackIndex = 0
): LiveBroadcastPlayerIdentity {
  return resolveLiveBroadcastPlayerIdentity(booking, squadType, fallbackIndex);
}
