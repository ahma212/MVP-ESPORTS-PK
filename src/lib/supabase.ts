import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  UserProfile, Match, SlotBooking, WalletTransaction, 
  MatchResult, PlayerResult, Announcement, LiveStream,
  BanRecord, ChatMessage, AccountDeletionRequest, Notification,
  FriendItem, FriendRequestItem, DirectMessage, LeaderboardVideo, Rule
} from '../types';
import { INITIAL_LEADERBOARD, INITIAL_MATCH_RESULTS } from '../data/initialData';

// Saved keys or defaults
let supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || localStorage.getItem('mvp_supabase_url') || 'https://rsqakcncemlkscobizcr.supabase.co';
let supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || localStorage.getItem('mvp_supabase_key') || 'sb_publishable_uo4Pa8vev48bV3KP75rr8A_G-_72OvB';

export function parseAmount(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).replace(/[^0-9.]/g, '');
  if (str === '') return null;
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes('YOUR_SUPABASE_PROJECT_URL') &&
    !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')
  );
}

export function setOfflineMode(_value: boolean) {
  // Hard-disabled: Always stay online with real Supabase
  try {
    localStorage.removeItem('mvp_offline_mode');
  } catch (e) {}
}

export function saveSupabaseKeys(url: string, key: string) {
  localStorage.setItem('mvp_supabase_url', url);
  localStorage.setItem('mvp_supabase_key', key);
  supabaseUrl = url;
  supabaseAnonKey = key;
  window.location.reload();
}

let clientInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('Failed to initialize real Supabase client, using mock store:', err);
  }
}

export const supabase = clientInstance;

// Local persistent mock database helpers (Fallback / Demo mode)
const STORAGE_KEYS = {
  PROFILE: 'mvp_esports_user_profile',
  ALL_PROFILES: 'mvp_esports_all_profiles',
  MATCHES: 'mvp_esports_matches',
  BOOKINGS: 'mvp_esports_bookings',
  TRANSACTIONS: 'mvp_esports_transactions',
  MATCH_RESULTS: 'mvp_esports_match_results',
  ANNOUNCEMENTS: 'mvp_esports_announcements',
  LIVE_STREAMS: 'mvp_esports_live_streams',
  CHAT: 'mvp_esports_chat_messages',
  DELETION_REQUESTS: 'deletion_requests',
  RULES: 'mvp_esports_rules',
  NOTIFICATIONS: 'mvp_esports_notifications',
  FRIENDS: 'mvp_esports_friends',
  FRIEND_REQUESTS: 'mvp_esports_friend_requests',
  DIRECT_MESSAGES: 'mvp_esports_direct_messages',
  BLOCKED_USERS: 'mvp_esports_blocked_users',
  LEADERBOARD_VIDEOS: 'mvp_leaderboard_videos',
};

// Initialize Mock Store - No-op for pure Supabase integration
export function initMockStore() {
  // Pure Supabase mode - no mock store initialization
}

// Getter & Setter functions for state
export function getLocalMatches(): Match[] {
  return _matchesCache;
}

export function updateMatchesCache(matches: Match[]) {
  _matchesCache = matches;
}

export async function saveLocalMatches(matches: Match[]) {
  if (isSupabaseConfigured() && supabase) {
    for (const match of matches) {
      await supabase.from('matches').upsert([match]);
    }
  }
}



export function getLocalAnnouncements(): Announcement[] { return _announcementsCache; }

export async function saveLocalAnnouncement(ann: Announcement) {
  if (isSupabaseConfigured() && supabase) {
    try {
      const payload: any = {
        title: ann.title,
        content: ann.content,
        created_at: ann.created_at || new Date().toISOString()
      };
      if (ann.id && !ann.id.startsWith('ann-')) {
        payload.id = ann.id;
      }
      const { data, error } = await supabase.from('announcements').upsert([payload]).select().single();
      if (!error && data) {
        _announcementsCache = [data, ..._announcementsCache.filter(a => a.id !== data.id)];
        return data;
      }
    } catch (err) {
      console.error('saveLocalAnnouncement error:', err);
    }
  }
  return ann;
}

export async function deleteLocalAnnouncement(id: string) {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('announcements').delete().eq('id', id);
      _announcementsCache = _announcementsCache.filter(a => a.id !== id);
    } catch (err) {
      console.error('deleteLocalAnnouncement error:', err);
    }
  }
}

export function getLocalLiveStreams(): LiveStream[] { return _liveStreamsCache; }

export async function saveLocalLiveStream(stream: LiveStream) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('live_streams').upsert([{
      stream_title: stream.title,
      youtube_url: stream.youtube_url
    }]);
  }
}

export async function deleteLocalLiveStream(id: string) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('live_streams').delete().eq('id', id);
  }
}

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export function getYoutubeThumbnail(url: string): string {
  const id = extractYoutubeId(url);
  if (id) {
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }
  return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';
}

export function formatStreamViewers(val?: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = String(val).trim();
  if (!cleaned) return undefined;
  if (/watching$/i.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned} Watching`;
}

export function getLocalBookings(userId?: string): SlotBooking[] {
  if (userId) return _bookingsCache.filter(b => String(b.user_id) === String(userId) || String(b.player_id) === String(userId));
  return _bookingsCache;
}

export function updateBookingsCache(bookings: SlotBooking[]) {
  _bookingsCache = bookings;
}

export function getMatchBookings(matchId: string): SlotBooking[] {
  return _bookingsCache.filter(b => String(b.match_id) === String(matchId) && (b.status === 'confirmed' || !b.status));
}

export async function fetchUserBookingsFromSupabase(userId: string): Promise<SlotBooking[]> {
  if (!isSupabaseConfigured() || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('slot_bookings')
      .select('*')
      .or(`user_id.eq.${userId},player_id.eq.${userId}`);
    if (error) {
      console.error('Error fetching user slot_bookings from Supabase:', error);
      return [];
    }
    const userBookings = (data || []).filter(
      (b: any) => b.status === 'confirmed' || !b.status || b.status === ''
    );
    _bookingsCache = [
      ..._bookingsCache.filter(b => String(b.user_id) !== String(userId) && String(b.player_id) !== String(userId)),
      ...userBookings
    ];
    return userBookings;
  } catch (err) {
    console.error('Exception fetching user slot_bookings from Supabase:', err);
    return [];
  }
}

export async function fetchUserBookedMatchesFromSupabase(userId: string): Promise<{ match: Match; booking: SlotBooking }[]> {
  if (!isSupabaseConfigured() || !supabase || !userId) return [];
  try {
    const { data: bookingsData, error: bError } = await supabase
      .from('slot_bookings')
      .select('*')
      .or(`user_id.eq.${userId},player_id.eq.${userId}`);

    if (bError) {
      console.error('Error fetching user slot_bookings for my matches:', bError);
      return [];
    }

    const confirmedBookings: SlotBooking[] = (bookingsData || []).filter(
      (b: any) => b.status === 'confirmed' || !b.status || b.status === ''
    );

    if (confirmedBookings.length === 0) {
      return [];
    }

    const matchIds = Array.from(new Set(confirmedBookings.map((b) => String(b.match_id)).filter(Boolean)));
    if (matchIds.length === 0) return [];

    const { data: matchesData, error: mError } = await supabase
      .from('matches')
      .select('*')
      .in('id', matchIds);

    if (mError) {
      console.error('Error fetching matches for user bookings:', mError);
    }

    const matchesList: Match[] = matchesData || [];

    // Update internal caches
    _bookingsCache = [
      ..._bookingsCache.filter(b => String(b.user_id) !== String(userId) && String(b.player_id) !== String(userId)),
      ...confirmedBookings
    ];

    if (matchesList.length > 0) {
      _matchesCache = [
        ..._matchesCache.filter(m => !matchIds.includes(String(m.id))),
        ...matchesList
      ];
    }

    const result: { match: Match; booking: SlotBooking }[] = [];
    for (const b of confirmedBookings) {
      const match = matchesList.find(m => String(m.id) === String(b.match_id)) || _matchesCache.find(m => String(m.id) === String(b.match_id));
      if (match) {
        result.push({ match, booking: b });
      }
    }

    return result;
  } catch (err) {
    console.error('fetchUserBookedMatchesFromSupabase exception:', err);
    return [];
  }
}

export async function fetchMatchBookingsFromSupabase(matchId: string): Promise<SlotBooking[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('slot_bookings')
        .select('*')
        .eq('match_id', matchId)
        .eq('status', 'confirmed');
      if (!error && Array.isArray(data)) {
        _bookingsCache = [
          ..._bookingsCache.filter(b => String(b.match_id) !== String(matchId)),
          ...data
        ];
        return data;
      }
    } catch (e) {
      console.warn('fetchMatchBookingsFromSupabase error:', e);
    }
  }
  return getMatchBookings(matchId);
}

export async function adminRemoveSlotBooking(matchId: string, slotNum: number) {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('slot_bookings')
        .delete()
        .eq('match_id', matchId)
        .eq('slot_number', slotNum);
      if (error) throw error;
    } catch (e) {
      console.warn('Supabase admin slot delete error:', e);
      throw e;
    }
  }
  _bookingsCache = _bookingsCache.filter(b => !(b.match_id === matchId && b.slot_number === slotNum));
}

export let _matchResultsCache: MatchResult[] = [];

export function getMatchResults(): MatchResult[] {
  return _matchResultsCache;
}
export async function syncProfilesFromMatchResult(matchRes: MatchResult) {
  if (!matchRes.results || matchRes.results.length === 0) return;

  // Practice matches (TDM / WOW / Warehouse) — sirf results mein rahen, profile stats mat add karo
  const practiceTypes = ['tdm', 'wow'];
  const practiceMaps = ['warehouse', 'wow'];
  const matchType = String(matchRes.match_type || '').toLowerCase();
  const matchMap = String(matchRes.map || '').toLowerCase();

  if (practiceTypes.includes(matchType) || practiceMaps.includes(matchMap)) {
    console.log(
      '[syncProfilesFromMatchResult] Skipped profile stats for practice match:',
      matchRes.match_type,
      matchRes.map
    );
    return;
  }

  let supaProfiles: UserProfile[] = [];
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: pData, error: pErr } = await supabase.from('profiles').select('*');
      if (pData && !pErr) {
        supaProfiles = pData;
      } else if (pErr) {
        console.warn('syncProfilesFromMatchResult profiles load error:', pErr);
      }
    } catch (e) {
      console.warn('syncProfilesFromMatchResult profiles load error:', e);
    }
  }

  const allProfs = supaProfiles.length > 0 ? supaProfiles : getAllProfiles();
  const activeProf = getLocalProfile();
  let activeProfUpdated = false;

  // Calculate matches count to increment (1 for single match, or N for multi-map tournaments)
  const matchesToIncrement =
    matchRes.tournament_matches_count && matchRes.tournament_matches_count > 0
      ? matchRes.tournament_matches_count
      : matchRes.match_type === 'tournament'
        ? 3
        : 1;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const pRes of matchRes.results) {
    const killsToAdd = Number(pRes.kills) || 0;
    const isWin = Boolean(pRes.is_winner || pRes.is_win);

    const cleanIgn = pRes.player_ign ? pRes.player_ign.trim().toLowerCase() : '';
    const cleanUsername = pRes.username
      ? pRes.username.replace('@', '').trim().toLowerCase()
      : '';

    // Guest / non-platform player — skip
    if (!cleanUsername && !pRes.user_id) {
      continue;
    }

    const matchedProf = allProfs.find((p) => {
      if (pRes.user_id && p.id === pRes.user_id && uuidRegex.test(p.id)) return true;
      if (cleanUsername && p.username?.toLowerCase() === cleanUsername) return true;
      if (
        cleanIgn &&
        (p.pubg_id_name?.toLowerCase() === cleanIgn ||
          p.username?.toLowerCase() === cleanIgn)
      )
        return true;
      return false;
    });

    if (matchedProf) {
      // Stats ONLY — matches, kills, wins
      // Reward / total_earnings / wallet — NEVER auto-add (admin manually adds reward)
      const currentMatches =
        (matchedProf as any).matches_played !== undefined
          ? Number((matchedProf as any).matches_played)
          : Number(matchedProf.total_matches) || 0;
      const newMatches = currentMatches + matchesToIncrement;

      const currentKills = Number(matchedProf.total_kills) || 0;
      const newKills = currentKills + killsToAdd;

      const currentWins = Number(matchedProf.total_wins) || 0;
      const newWins = isWin ? currentWins + 1 : currentWins;

      matchedProf.total_matches = newMatches;
      (matchedProf as any).matches_played = newMatches;
      matchedProf.total_kills = newKills;
      matchedProf.total_wins = newWins;

      // CRITICAL: Match results MUST NEVER touch wallet_balance or auto-add rewards

      if (
        activeProf &&
        (activeProf.id === matchedProf.id ||
          activeProf.username?.toLowerCase() === matchedProf.username?.toLowerCase() ||
          activeProf.pubg_id_name?.toLowerCase() ===
            matchedProf.pubg_id_name?.toLowerCase())
      ) {
        activeProf.total_matches = newMatches;
        (activeProf as any).matches_played = newMatches;
        activeProf.total_kills = newKills;
        activeProf.total_wins = newWins;
        activeProfUpdated = true;
      }

      if (isSupabaseConfigured() && supabase) {
        try {
          const updatePayload: any = {
            total_matches: newMatches,
            matches_played: newMatches,
            total_kills: newKills,
            total_wins: newWins,
            // total_earnings intentionally NOT updated
          };

          if (matchedProf.id && uuidRegex.test(matchedProf.id)) {
            const { error: idErr } = await supabase
              .from('profiles')
              .update(updatePayload)
              .eq('id', matchedProf.id);

            if (idErr) {
              console.warn(
                `Update by id ${matchedProf.id} failed, trying username:`,
                idErr
              );
              if (matchedProf.username) {
                await supabase
                  .from('profiles')
                  .update(updatePayload)
                  .eq('username', matchedProf.username);
              }
            }
          } else if (matchedProf.username) {
            await supabase
              .from('profiles')
              .update(updatePayload)
              .eq('username', matchedProf.username);
          }
          }
         catch (supabaseErr) {
          console.error(
            '[SYNC ERROR] Failed to push stats update to Supabase:',
            supabaseErr
          );
        }
      }
    }
  }

  saveAllProfiles(allProfs);
  if (activeProfUpdated && activeProf) {
    saveLocalProfile(activeProf);
  }
}
export async function saveMatchResult(result: MatchResult) {
  const existingIndex = _matchResultsCache.findIndex(r => r.match_id === result.match_id);
  if (existingIndex >= 0) {
    _matchResultsCache[existingIndex] = result;
  } else {
    _matchResultsCache.unshift(result);
  }

  const formattedResults = (result.results || []).map((r) => ({
    player_ign: r.player_ign || '',
    username: r.username || '',
    user_id: r.user_id || null,
    kills: Number(r.kills) || 0,
    is_win: Boolean(r.is_winner || (r as any).is_win),
    is_winner: Boolean(r.is_winner || (r as any).is_win),
    prize_display: r.winning_prize !== undefined ? String(r.winning_prize) : ((r as any).prize_display || ''),
    winning_prize: r.winning_prize !== undefined ? String(r.winning_prize) : ((r as any).prize_display || ''),
    team_name: r.team_name || '',
    points: r.points !== undefined ? Number(r.points) : 0,
    slot_number: r.slot_number,
    rank: r.rank
  }));

  const imgUrl = result.screenshot_url || result.result_image_url || null;

  if (isSupabaseConfigured() && supabase) {
    const payload: any = {
      match_id: result.match_id,
      match_title: result.match_title || 'PUBG Match',
      match_type: result.match_type || 'squad',
      squad_type: result.squad_type || 'SQUAD',
      map: result.map || 'Erangel',
      total_prize_pool: result.total_prize_pool || 0,
      published_at: result.published_at || new Date().toISOString(),
      is_published: result.is_published ?? true,
      results: formattedResults,
      screenshot_url: imgUrl,
      result_image_url: imgUrl,
      result_image_aspect: result.result_image_aspect || '16:9',
      match_time: result.match_time || null,
      tournament_matches_count: result.tournament_matches_count || null,
      team_prizes: result.team_prizes || null
    };

    try {
      const { error: upsertErr } = await supabase
        .from('match_results')
        .upsert([payload], { onConflict: 'match_id' });

      if (upsertErr) {
        console.error('Supabase match_results upsert error:', upsertErr);
        throw new Error(upsertErr.message);
      }
    } catch (err: any) {
      console.error('saveMatchResult failed:', err);
      throw new Error(err?.message || 'Failed to save match result to Supabase');
    }
  }

  // Automatically sync profile stats across all matching user records! (NEVER wallet changes!)
  try {
    await syncProfilesFromMatchResult(result);
  } catch (syncErr: any) {
    console.error('syncProfilesFromMatchResult error:', syncErr);
  }

  // Trigger global notification
  try {
    await createNotification({
      user_id: null,
      title: "Match Results Released",
      message: `🏆 Results are OUT for ${result.match_title || 'Match'}! Check the results tab to see the winners and your stats.`,
      is_read: false,
      type: 'announcement',
      match_id: result.match_id
    });
  } catch (notifErr) {
    console.warn('createNotification error:', notifErr);
  }
}

export async function fetchPublishedMatchResultsFromSupabase(): Promise<MatchResult[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('match_results')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (!error && data) {
        _matchResultsCache = data;
        return data;
      } else if (error) {
        console.warn('fetchPublishedMatchResultsFromSupabase error:', error);
      }
    } catch (e) {
      console.warn('fetchPublishedMatchResultsFromSupabase exception:', e);
    }
  }
  return _matchResultsCache.filter(r => r.is_published !== false);
}

export async function deletePublishedMatchResultApi(item: MatchResult): Promise<{ success: boolean; error?: string }> {
  if (!item) return { success: false, error: 'Invalid match result provided for deletion' };

  if (!isSupabaseConfigured() || !supabase) {
    _matchResultsCache = _matchResultsCache.filter(
      r => r.match_id !== item.match_id && (item.id ? (r as any).id !== item.id : true)
    );
    return { success: true };
  }

  try {
    const imgUrl = item.screenshot_url || item.result_image_url;

    // 1. Delete row from match_results in Supabase
    let deleteQuery = supabase.from('match_results').delete();
    if (item.id) {
      deleteQuery = deleteQuery.eq('id', item.id);
    } else if (item.match_id) {
      deleteQuery = deleteQuery.eq('match_id', item.match_id);
    } else {
      return { success: false, error: 'Missing match_id or id for deletion' };
    }

    const { error: deleteErr } = await deleteQuery;
    if (deleteErr) {
      console.error('Error deleting match_result row from Supabase:', deleteErr);
      return { success: false, error: deleteErr.message };
    }

    // 2. Remove screenshot from storage if present AND not referenced by other records
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
      try {
        // Check if image URL is used by any OTHER match_results or matches
        const { data: otherResults } = await supabase
          .from('match_results')
          .select('match_id')
          .or(`screenshot_url.eq.${imgUrl},result_image_url.eq.${imgUrl}`);

        const { data: otherMatches } = await supabase
          .from('matches')
          .select('id')
          .or(`banner_url.eq.${imgUrl}`);

        const usedElsewhere = (otherResults && otherResults.length > 0) || (otherMatches && otherMatches.length > 0);

        if (!usedElsewhere) {
          const storageMatch = imgUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
          if (storageMatch) {
            const bucket = storageMatch[1];
            const rawPath = storageMatch[2];
            if (bucket && rawPath) {
              const decodedPath = decodeURIComponent(rawPath);
              const { error: storageRemoveErr } = await supabase.storage.from(bucket).remove([decodedPath]);
              if (storageRemoveErr) {
                console.warn(`Storage file removal from ${bucket}/${decodedPath} warning:`, storageRemoveErr.message);
              } else {
                console.log(`Successfully removed screenshot file from storage: ${bucket}/${decodedPath}`);
              }
            }
          }
        } else {
          console.log('Storage file retained because it is still referenced by other records:', imgUrl);
        }
      } catch (storageCleanupErr) {
        console.warn('Storage cleanup warning:', storageCleanupErr);
      }
    }

    // 3. Update local memory cache so UI syncs immediately across all components
    _matchResultsCache = _matchResultsCache.filter(
      r => r.match_id !== item.match_id && (item.id ? (r as any).id !== item.id : true)
    );

    return { success: true };
  } catch (err: any) {
    console.error('deletePublishedMatchResultApi exception:', err);
    return { success: false, error: err?.message || 'Failed to delete match result' };
  }
}

const activeRequestKeysMap = new Map<string, number>();

export async function process_wallet_transaction_safeguard<T>(
  requestKey: string,
  actionFn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const lastTime = activeRequestKeysMap.get(requestKey);

  // 1. REJECT DUPLICATE WITHIN 3 SECONDS (3000ms)
  if (lastTime && now - lastTime < 3000) {
    console.warn(`[SAFEGUARD] Duplicate request key detected within 3000ms: "${requestKey}". Transaction blocked.`);
    throw new Error("⛔ Duplicate request detected within 3 seconds. Transaction blocked to protect your wallet balance.");
  }

  // Register request key timestamp
  activeRequestKeysMap.set(requestKey, now);

  // Auto-cleanup key after 5 seconds
  setTimeout(() => {
    activeRequestKeysMap.delete(requestKey);
  }, 5000);

  // 2. BACKEND SAFEGUARD CHECK IN SUPABASE
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: checkData } = await supabase
        .from('wallet_transactions')
        .select('id, created_at')
        .eq('id', requestKey)
        .maybeSingle();

      if (checkData) {
        throw new Error("⛔ Duplicate request key detected on database. Transaction blocked.");
      }
    } catch (e: any) {
      if (e?.message?.includes("Duplicate request")) {
        throw e;
      }
      // Fallback to memory safeguard if custom table schema varies
    }
  }

  // 3. EXECUTE ATOMIC TRANSACTION ACTION
  return await actionFn();
}

export async function adminAdjustWalletBalance(
  username: string,
  amount: number,
  actionType: 'add' | 'deduct'
): Promise<{ success: boolean; message: string; currentBalance?: number }> {
  if (!isSupabaseConfigured() || !supabase) return { success: false, message: 'Database not connected' };

  const cleanUsername = (username || '').trim().replace(/^@+/, '');
  const numAmount = Number(amount);

  if (!cleanUsername) {
    return { success: false, message: 'Invalid username' };
  }

  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, message: 'Enter a valid amount' };
  }

  try {
    const { data: targetProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, username, wallet_balance, total_earnings')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (fetchError || !targetProfile) {
      return { success: false, message: 'Invalid username' };
    }

    const currentBalance = Number(targetProfile.wallet_balance || 0);

    // Strict validation: When admin chooses DEDUCT and amount > player's current wallet_balance
    if (actionType === 'deduct' && numAmount > currentBalance) {
      return {
        success: false,
        message: `Insufficient balance. Player has RS. ${currentBalance}. You tried to deduct RS. ${numAmount}.`,
        currentBalance
      };
    }

    const newBalance = actionType === 'add'
      ? currentBalance + numAmount
      : currentBalance - numAmount;

    const currentEarnings = Number((targetProfile as any).total_earnings || 0);
    const newEarnings = actionType === 'add'
      ? currentEarnings + numAmount
      : currentEarnings;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        wallet_balance: newBalance,
        total_earnings: newEarnings
      })
      .eq('id', targetProfile.id);

    if (updateError) {
      console.error('Error updating player wallet_balance:', updateError);
      return { success: false, message: 'Failed to update player wallet balance' };
    }

    const playerUsername = targetProfile.username || cleanUsername;
    const txPayload: any = {
      user_id: targetProfile.id,
      amount: numAmount,
      type: 'reward_adjustment',
      payment_method: actionType === 'add' ? 'Admin Reward' : 'Admin Deduction',
      username: playerUsername,
      account_title: playerUsername,
      sender_name: 'Admin',
      trx_id: 'RWD-' + Math.floor(100000 + Math.random() * 900000),
      status: 'approved',
      created_at: new Date().toISOString()
    };

    const { error: txError } = await supabase.from('wallet_transactions').insert([txPayload]);
    if (txError) {
      console.warn('Initial wallet_transactions insert warning:', txError);
      const fallbackPayload = {
        user_id: targetProfile.id,
        amount: numAmount,
        type: 'reward_adjustment',
        payment_method: actionType === 'add' ? 'Admin Reward' : 'Admin Deduction',
        username: playerUsername,
        account_title: playerUsername,
        sender_name: 'Admin',
        status: 'approved',
        created_at: new Date().toISOString()
      };
      await supabase.from('wallet_transactions').insert([fallbackPayload]);
    }

    try {
      await createNotification({
        user_id: targetProfile.id,
        title: actionType === 'add' ? '🎁 Reward Received' : '⚠️ Balance Adjusted',
        message: actionType === 'add'
          ? `🎉 You received a reward of RS. ${numAmount} in your wallet!`
          : `ℹ️ Your wallet balance was adjusted by RS. -${numAmount}.`,
        is_read: false,
        type: 'announcement'
      });
    } catch (e) {
      console.warn('Notification sync notice:', e);
    }

    const successMessage = actionType === 'add' ? 'Successfully sent reward' : 'Successfully deducted';
    return { success: true, message: successMessage, currentBalance: newBalance };
  } catch (err: any) {
    console.error('Exception in adminAdjustWalletBalance:', err);
    return { success: false, message: err?.message || 'Invalid username' };
  }
}

export function formatRemainingBanTime(expiresAt: string | number | null): string {
  if (!expiresAt) return "Permanent";
  const expiryMs = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
  if (isNaN(expiryMs)) return "Permanent";

  const diffMs = expiryMs - Date.now();
  if (diffMs <= 0) return "Expired";

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days >= 1) {
    return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (hours >= 1) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${Math.max(1, minutes)} minute${minutes !== 1 ? 's' : ''}`;
  }
}

export async function getBans(): Promise<BanRecord[]> {
  return await fetchBansFromSupabase();
}

export async function fetchBansFromSupabase(): Promise<BanRecord[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    const [bansRes, bannedProfsRes] = await Promise.all([
      supabase.from('bans').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('is_banned', true)
    ]);

    const bansData: BanRecord[] = Array.isArray(bansRes.data) ? bansRes.data : [];
    const bannedProfs = Array.isArray(bannedProfsRes.data) ? bannedProfsRes.data : [];

    const banMap = new Map<string, BanRecord>();

    // 1. Source of truth: profiles where is_banned = true
    bannedProfs.forEach(p => {
      if (p && (p.username || p.id)) {
        const key = (p.username || p.id).toLowerCase();
        const expiresMs = p.ban_expires_at || p.banned_until ? new Date(p.ban_expires_at || p.banned_until).getTime() : null;
        banMap.set(key, {
          id: p.id,
          username: p.username || 'Unknown',
          user_id: p.id,
          reason: p.ban_reason || 'Banned by Admin',
          duration: expiresMs ? 'Temporary Ban' : 'Permanent Ban',
          expires_at: expiresMs,
          created_at: p.updated_at || p.created_at || new Date().toISOString()
        });
      }
    });

    // 2. Enrich/combine with bans table entries
    bansData.forEach(b => {
      if (b && (b.username || b.user_id)) {
        const key = (b.username || b.user_id).toLowerCase();
        if (!banMap.has(key)) {
          // If profile was not found or is_banned was false but a ban row exists
          banMap.set(key, {
            id: b.user_id || b.id, // prefer user_id
            username: b.username,
            user_id: b.user_id || b.id,
            reason: b.reason || 'Banned by Admin',
            duration: b.duration || 'Permanent Ban',
            expires_at: b.expires_at ? (typeof b.expires_at === 'number' ? b.expires_at : new Date(b.expires_at).getTime()) : null,
            created_at: b.created_at || new Date().toISOString()
          });
        } else {
          const existing = banMap.get(key)!;
          // Keep existing.id and existing.user_id as the profile ID (UUID)
          if (b.reason) existing.reason = b.reason;
          if (b.duration) existing.duration = b.duration;
          if (b.expires_at) {
            existing.expires_at = typeof b.expires_at === 'number' ? b.expires_at : new Date(b.expires_at).getTime();
          }
        }
      }
    });

    const result = Array.from(banMap.values());
    _bansCache = result;
    return result;
  } catch (err) {
    console.warn('Error fetching bans from Supabase:', err);
    return _bansCache;
  }
}

export async function searchPlayerByUsername(usernameInput: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const clean = (usernameInput || '').trim().replace(/^@+/, '');
  if (!clean) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.${clean},pubg_name.ilike.${clean},id.eq.${clean}`)
      .maybeSingle();

    if (error || !data) {
      // Fallback: try exact username match case-insensitive
      const { data: list } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', clean)
        .limit(1);

      if (list && list.length > 0) {
        const p = list[0];
        return {
          id: p.id,
          email: p.email || '',
          username: p.username || clean,
          name: p.name || p.username || '',
          pubg_id_name: p.pubg_name || '',
          pubg_id_number: p.pubg_id || '',
          avatar_url: p.avatar_url || null,
          wallet_balance: Number(p.wallet_balance || 0),
          total_matches: Number(p.matches_played || p.total_matches || 0),
          total_kills: Number(p.total_kills || 0),
          total_wins: Number(p.total_wins || 0),
          is_banned: Boolean(p.is_banned),
          ban_expires_at: p.ban_expires_at || p.banned_until || null,
          ban_reason: p.ban_reason || null,
          role: p.is_admin ? 'admin' : 'player',
          is_admin: Boolean(p.is_admin),
          created_at: p.created_at || new Date().toISOString()
        };
      }
      return null;
    }

    return {
      id: data.id,
      email: data.email || '',
      username: data.username || clean,
      name: data.name || data.username || '',
      pubg_id_name: data.pubg_name || '',
      pubg_id_number: data.pubg_id || '',
      avatar_url: data.avatar_url || null,
      wallet_balance: Number(data.wallet_balance || 0),
      total_matches: Number(data.matches_played || data.total_matches || 0),
      total_kills: Number(data.total_kills || 0),
      total_wins: Number(data.total_wins || 0),
      is_banned: Boolean(data.is_banned),
      ban_expires_at: data.ban_expires_at || data.banned_until || null,
      ban_reason: data.ban_reason || null,
      role: data.is_admin ? 'admin' : 'player',
      is_admin: Boolean(data.is_admin),
      created_at: data.created_at || new Date().toISOString()
    };
  } catch (e) {
    console.error('searchPlayerByUsername error:', e);
    return null;
  }
}

export async function saveBan(ban: BanRecord, targetUserId?: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, message: 'Database not connected to Supabase.' };
  }

  const cleanUsername = (ban.username || '').trim().replace(/^@+/, '');
  if (!cleanUsername && !targetUserId) {
    return { success: false, message: 'Please provide a valid username or user ID to ban.' };
  }

  try {
    // Ensure fresh session before write
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.valid) {
      return { success: false, message: sessionCheck.error || 'Admin session expired. Please log in again.' };
    }

    // 1. Locate player profile in Supabase
    let userId = targetUserId;
    if (!userId && cleanUsername) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', cleanUsername)
        .maybeSingle();
      if (prof) userId = prof.id;
    }

    const isoExpiry = ban.expires_at ? new Date(ban.expires_at).toISOString() : null;

    // 2. Update player profile in Supabase
    const profilePayload: any = {
      is_banned: true,
      ban_expires_at: isoExpiry,
      banned_until: isoExpiry,
      ban_reason: ban.reason || 'Banned by Admin'
    };

    let profUpdateSuccess = false;
    let lastError = '';

    if (userId) {
      const { error: saveProfErr } = await supabase.from('profiles').update(profilePayload).eq('id', userId);
      if (!saveProfErr) {
        profUpdateSuccess = true;
      } else {
        lastError = saveProfErr.message;
        console.warn('saveBan profile update by id failed:', saveProfErr.message);
      }
    }

    if (!profUpdateSuccess && cleanUsername) {
      const { error: saveProfErr2 } = await supabase.from('profiles').update(profilePayload).ilike('username', cleanUsername);
      if (!saveProfErr2) {
        profUpdateSuccess = true;
      } else {
        lastError = saveProfErr2.message;
        console.warn('saveBan profile update by username failed:', saveProfErr2.message);
      }
    }

    if (!profUpdateSuccess) {
      return { success: false, message: lastError || 'Failed to update player profile ban status in Supabase.' };
    }

    // 3. Upsert record into Supabase bans table
    const banPayload: any = {
      id: ban.id || crypto.randomUUID(),
      username: cleanUsername,
      user_id: userId || null,
      reason: ban.reason || 'Banned by Admin',
      duration: ban.duration || 'Temporary Ban',
      expires_at: isoExpiry,
      created_at: ban.created_at || new Date().toISOString()
    };

    const { error: banErr } = await supabase.from('bans').upsert([banPayload], { onConflict: 'username' });
    if (banErr) {
      console.warn('Bans table upsert notice:', banErr.message);
      try {
        await supabase.from('bans').insert([banPayload]);
      } catch (e) {}
    }

    await fetchBansFromSupabase();

    return { success: true, message: `Player @${cleanUsername || userId} has been banned (${ban.duration}).` };
  } catch (e: any) {
    console.error('saveBan error:', e);
    return { success: false, message: e?.message || 'Failed to apply ban in Supabase.' };
  }
}

export async function removeBan(id: string, username?: string, userId?: string): Promise<{ success: boolean; message: string }> {
  console.log('[SUPABASE removeBan CALLED]', { id, username, userId });
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, message: 'Database not connected to Supabase.' };
  }

  try {
    // f) await ensureFreshSupabaseSession() before writes
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.valid) {
      return { success: false, message: sessionCheck.error || 'Admin session expired. Please log in again.' };
    }

    // a) Resolve profile UUID:
    // - if userId looks like uuid use it
    // - else select id from profiles where username ilike cleanUsername
    // - else from bans row if present
    let profileUuid = '';
    const cleanUsername = username ? username.trim().replace(/^@+/, '') : '';
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (userId && isUuid(userId)) {
      profileUuid = userId;
    } else if (id && isUuid(id)) {
      profileUuid = id;
    }

    if (!profileUuid && cleanUsername) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();
      if (prof?.id) {
        profileUuid = prof.id;
      }
    }

    if (!profileUuid && id) {
      const { data: banRow } = await supabase
        .from('bans')
        .select('user_id, username')
        .eq('id', id)
        .maybeSingle();
      if (banRow?.user_id && isUuid(banRow.user_id)) {
        profileUuid = banRow.user_id;
      } else if (banRow?.username) {
        const { data: profFromBan } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', banRow.username.trim().replace(/^@+/, ''))
          .maybeSingle();
        if (profFromBan?.id) {
          profileUuid = profFromBan.id;
        }
      }
    }

    if (!profileUuid && id && !isUuid(id)) {
      const { data: fallbackProf } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', id.trim().replace(/^@+/, ''))
        .maybeSingle();
      if (fallbackProf?.id) {
        profileUuid = fallbackProf.id;
      }
    }

    console.log('[SUPABASE removeBan RESOLVED TARGETS]', { profileUuid, cleanUsername, id });

    if (!profileUuid) {
      return { success: false, message: 'Could not resolve a valid player profile UUID.' };
    }

    // b) UPDATE profiles SET
    //      is_banned = false,
    //      ban_expires_at = null,
    //      banned_until = null,
    //      ban_reason = null
    //    WHERE id = <profileUuid>
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        is_banned: false,
        ban_expires_at: null,
        banned_until: null,
        ban_reason: null
      })
      .eq('id', profileUuid);

    // c) If update error → return { success:false, message: error.message }
    if (updateErr) {
      console.error('[removeBan] Profiles update error:', updateErr.message);
      return { success: false, message: updateErr.message };
    }

    // d) Optionally delete from bans where user_id or username matches
    try {
      if (profileUuid) {
        await supabase.from('bans').delete().eq('user_id', profileUuid);
      }
      if (cleanUsername) {
        await supabase.from('bans').delete().ilike('username', cleanUsername);
      }
      if (id) {
        await supabase.from('bans').delete().eq('id', id);
      }
    } catch (cleanupErr) {
      console.warn('[removeBan] Bans deletion cleanup notice:', cleanupErr);
    }

    // e) Re-select profile; success only if is_banned === false
    const { data: verifyProf, error: verifyErr } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', profileUuid)
      .maybeSingle();

    if (verifyErr) {
      return { success: false, message: `Verification failed: ${verifyErr.message}` };
    }

    if (!verifyProf) {
      return { success: false, message: 'Verification failed: Player profile not found after update.' };
    }

    if (verifyProf.is_banned === true) {
      return { success: false, message: 'Verification failed: Player is still marked as banned in profiles table.' };
    }

    // Refresh bans list
    await fetchBansFromSupabase();

    console.log('[SUPABASE removeBan SUCCESSFUL]');
    return { success: true, message: `Player unbanned successfully.` };
  } catch (e: any) {
    console.error('removeBan error:', e);
    return { success: false, message: e?.message || 'Failed to remove ban in Supabase.' };
  }
}

export async function checkBanStatus(usernameOrId: string, optionalUsername?: string): Promise<{ isBanned: boolean; banRecord?: BanRecord | null; profile?: any }> {
  if (!isSupabaseConfigured() || !supabase) return { isBanned: false };

  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const raw1 = (usernameOrId || '').trim().replace(/^@+/, '');
  const raw2 = (optionalUsername || '').trim().replace(/^@+/, '');
  if (!raw1 && !raw2) return { isBanned: false };

  const uuids = Array.from(new Set([raw1, raw2].filter(s => s && isUuid(s))));
  const usernames = Array.from(new Set([raw1, raw2].filter(s => s && !isUuid(s))));

  try {
    // 1. Query profiles table
    const profileConds: string[] = [];
    uuids.forEach(u => profileConds.push(`id.eq.${u}`));
    usernames.forEach(un => profileConds.push(`username.ilike.${un}`));

    if (profileConds.length > 0) {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('id, username, is_banned, ban_expires_at, banned_until, ban_reason')
        .or(profileConds.join(','))
        .maybeSingle();

      if (profErr) {
        console.warn('checkBanStatus profiles query notice:', profErr);
      }

      if (prof) {
        if (prof.is_banned) {
          const expiry = prof.ban_expires_at || prof.banned_until;
          if (expiry) {
            const expiryMs = new Date(expiry).getTime();
            if (Date.now() >= expiryMs) {
              // Ban expired! Auto unban in Supabase
              await removeBan('', prof.username, prof.id);
              return { isBanned: false };
            }
          }
          return {
            isBanned: true,
            profile: prof,
            banRecord: {
              id: prof.id,
              username: prof.username || raw1 || raw2,
              reason: prof.ban_reason || 'Banned by Admin',
              duration: expiry ? 'Temporary Ban' : 'Permanent Ban',
              expires_at: expiry ? new Date(expiry).getTime() : null,
              created_at: new Date().toISOString()
            }
          };
        } else {
          // Profile exists and is_banned is FALSE. Source of truth says NOT BANNED!
          // Delete any leftover matching records in bans table asynchronously for cleanup.
          try {
            if (prof.id) {
              supabase.from('bans').delete().eq('user_id', prof.id).then(() => {});
            }
            if (prof.username) {
              supabase.from('bans').delete().ilike('username', prof.username).then(() => {});
            }
          } catch (e) {}

          return { isBanned: false, profile: prof };
        }
      }
    }

    // 2. Query bans table only if profile was not found (fallback)
    const banConds: string[] = [];
    uuids.forEach(u => banConds.push(`user_id.eq.${u}`));
    usernames.forEach(un => banConds.push(`username.ilike.${un}`));

    if (banConds.length > 0) {
      const { data: banRow, error: banErr } = await supabase
        .from('bans')
        .select('*')
        .or(banConds.join(','))
        .maybeSingle();

      if (banErr) {
        console.warn('checkBanStatus bans query notice:', banErr);
      }

      if (banRow) {
        if (banRow.expires_at) {
          const expiryMs = new Date(banRow.expires_at).getTime();
          if (Date.now() >= expiryMs) {
            await removeBan(banRow.id, banRow.username, banRow.user_id);
            return { isBanned: false };
          }
        }
        return { isBanned: true, banRecord: banRow };
      }
    }

    return { isBanned: false };
  } catch (err) {
    console.warn('checkBanStatus error:', err);
    return { isBanned: false };
  }
}

export async function deleteUserAccountByAdmin(userId: string, username?: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, message: 'Database not connected' };
  }

  try {
    const cleanUsername = (username || '').trim().replace(/^@+/, '');
    let targetId = (userId || '').trim();

    // 1. Resolve target user ID if missing
    if (!targetId && cleanUsername) {
      const { data: foundProf } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();
      if (foundProf?.id) {
        targetId = foundProf.id;
      }
    }

    if (!targetId && !cleanUsername) {
      return { success: false, message: 'No valid user ID or username provided for account deletion.' };
    }

    // 2. Delete from profiles table
    if (targetId) {
      const { error: profDelErr } = await supabase.from('profiles').delete().eq('id', targetId);
      if (profDelErr) console.warn('Profiles delete by ID notice:', profDelErr.message);
    }
    if (cleanUsername) {
      const { error: profDelNameErr } = await supabase.from('profiles').delete().ilike('username', cleanUsername);
      if (profDelNameErr) console.warn('Profiles delete by username notice:', profDelNameErr.message);
    }

    // 3. Delete from bans table
    if (targetId) {
      await supabase.from('bans').delete().eq('user_id', targetId);
    }
    if (cleanUsername) {
      await supabase.from('bans').delete().ilike('username', cleanUsername);
    }

    // 4. Cleanup related user data in Supabase
    if (targetId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
      if (isUuid) {
        await Promise.allSettled([
          supabase.from('slot_bookings').delete().or(`user_id.eq.${targetId},player_id.eq.${targetId}`),
          supabase.from('chat_messages').delete().or(`sender_id.eq.${targetId},receiver_id.eq.${targetId}`),
          supabase.from('wallet_transactions').delete().eq('user_id', targetId),
          supabase.from('deposit_requests').delete().eq('player_id', targetId),
          supabase.from('withdrawal_requests').delete().eq('player_id', targetId),
          supabase.from('friends').delete().or(`user_id.eq.${targetId},friend_id.eq.${targetId}`),
          supabase.from('friend_requests').delete().or(`sender_id.eq.${targetId},receiver_id.eq.${targetId}`)
        ]);
      }
    }

    await fetchBansFromSupabase();
    return { success: true, message: `Account @${cleanUsername || targetId} has been permanently deleted from Supabase.` };
  } catch (err: any) {
    console.error('deleteUserAccountByAdmin error:', err);
    return { success: false, message: err?.message || 'Failed to delete account from Supabase.' };
  }
}

/**
 * CHAT SYSTEM HELPERS - ADMIN_CHATS (100% Real Supabase - Support Chat)
 */
export interface AdminChatMessage {
  id: string;
  player_id: string;
  sender_type: 'player' | 'admin';
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function trimAdminChat(playerId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !playerId || playerId === 'admin') return;

  try {
    // 1) Call: await supabase.rpc('trim_admin_chat', { p_player_id: playerId, p_keep: 50 })
    const { error: rpcError } = await supabase.rpc('trim_admin_chat', {
      p_player_id: playerId,
      p_keep: 50
    });

    if (!rpcError) return;

    // 2) Fallback if RPC fails or missing:
    // select id from admin_chats where player_id = X order by created_at desc
    try {
      const { data: rows, error: selError } = await supabase
        .from('admin_chats')
        .select('id')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });

      if (!selError && Array.isArray(rows) && rows.length > 50) {
        const idsToDelete = rows.slice(50).map((r: any) => r?.id).filter(Boolean);
        if (idsToDelete.length > 0) {
          await supabase
            .from('admin_chats')
            .delete()
            .in('id', idsToDelete);
        }
      }
    } catch (fallbackErr) {
      console.warn('Silent trim_admin_chat fallback warning:', fallbackErr);
    }
  } catch (err) {
    // 3) Silent — do not show error to user if trim fails; still show message send success
    console.warn('Silent trim_admin_chat warning:', err);
  }
}

export async function getAdminChatMessagesForPlayer(playerId: string): Promise<AdminChatMessage[]> {
  if (!isSupabaseConfigured() || !supabase || !playerId) return [];

  const { data, error } = await supabase
    .from('admin_chats')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getAdminChatMessagesForPlayer error:', error.message);
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: String(row.id || ''),
    player_id: String(row.player_id || playerId),
    sender_type: row.sender_type === 'admin' ? 'admin' : 'player',
    message: String(row.message ?? row.message_text ?? ''),
    is_read: Boolean(row.is_read),
    created_at: row.created_at || new Date().toISOString()
  }));
}

export async function getAllAdminChatsRows(): Promise<AdminChatMessage[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('admin_chats')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllAdminChatsRows error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: String(row.id || ''),
    player_id: String(row.player_id || ''),
    sender_type: row.sender_type === 'admin' ? 'admin' : 'player',
    message: String(row.message ?? row.message_text ?? ''),
    is_read: Boolean(row.is_read),
    created_at: row.created_at || new Date().toISOString()
  }));
}

export async function sendPlayerSupportMessage(
  playerId: string,
  messageText: string
): Promise<AdminChatMessage> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Database connection unavailable');
  }

  const cleanText = messageText.trim();
  if (!cleanText) {
    throw new Error('Message cannot be empty');
  }

  const payload = {
    player_id: playerId,
    sender_type: 'player',
    message: cleanText,
    is_read: false,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('admin_chats')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Player support message insert failed:', error.message);
    throw new Error(error.message);
  }

  // Trim thread silently to 50 rows
  trimAdminChat(playerId).catch((e) => console.warn('Silent trim warning:', e));

  return {
    id: String(data.id),
    player_id: String(data.player_id || playerId),
    sender_type: 'player',
    message: String(data.message ?? data.message_text ?? cleanText),
    is_read: Boolean(data.is_read),
    created_at: data.created_at || new Date().toISOString()
  };
}

export async function sendAdminReplyMessage(
  playerId: string,
  messageText: string
): Promise<AdminChatMessage> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Database connection unavailable');
  }

  const cleanText = messageText.trim();
  if (!cleanText) {
    throw new Error('Message cannot be empty');
  }

  const payload = {
    player_id: playerId,
    sender_type: 'admin',
    message: cleanText,
    is_read: false,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('admin_chats')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Admin reply insert failed:', error.message);
    throw new Error(error.message);
  }

  // Trim thread silently to 50 rows
  trimAdminChat(playerId).catch((e) => console.warn('Silent trim warning:', e));

  // Send Notification to player
  try {
    await createNotification({
      user_id: playerId,
      title: "Support Reply",
      message: `💬 Support Team: ${cleanText}`,
      is_read: false,
      type: 'chat'
    });
  } catch (e) {
    console.warn('Failed to dispatch notification for admin support reply:', e);
  }

  return {
    id: String(data.id),
    player_id: String(data.player_id || playerId),
    sender_type: 'admin',
    message: String(data.message ?? data.message_text ?? cleanText),
    is_read: Boolean(data.is_read),
    created_at: data.created_at || new Date().toISOString()
  };
}

export async function markAdminChatAsRead(
  playerId: string,
  forSenderType: 'player' | 'admin'
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !playerId) return;

  try {
    const unreadFromSenderType = forSenderType === 'admin' ? 'player' : 'admin';
    await supabase
      .from('admin_chats')
      .update({ is_read: true })
      .eq('player_id', playerId)
      .eq('sender_type', unreadFromSenderType)
      .eq('is_read', false);
  } catch (err) {
    console.warn('Error marking admin_chats as read:', err);
  }
}

// Legacy wrappers for backward compatibility
export async function getChatMessages(playerId?: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    let rows: AdminChatMessage[] = [];
    if (playerId) {
      rows = await getAdminChatMessagesForPlayer(playerId);
    } else {
      rows = await getAllAdminChatsRows();
    }

    return rows.map((m) => ({
      id: m.id,
      sender_id: m.sender_type === 'admin' ? 'admin' : m.player_id,
      sender_username: m.sender_type === 'admin' ? 'MVP ADMIN' : 'Player',
      sender_pubg_name: '',
      receiver_id: m.sender_type === 'admin' ? m.player_id : 'admin',
      message_text: m.message,
      is_read: m.is_read,
      created_at: m.created_at
    }));
  } catch (e) {
    console.error('getChatMessages exception:', e);
    return [];
  }
}

export async function sendChatMessage(msg: {
  sender_id: string;
  sender_username: string;
  sender_pubg_name?: string;
  receiver_id: string;
  message_text: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const playerId = msg.sender_id === 'admin' ? msg.receiver_id : msg.sender_id;
    if (msg.sender_id === 'admin') {
      const res = await sendAdminReplyMessage(playerId, msg.message_text);
      return {
        success: true,
        data: {
          id: res.id,
          sender_id: 'admin',
          sender_username: 'MVP ADMIN',
          receiver_id: playerId,
          message_text: res.message,
          is_read: res.is_read,
          created_at: res.created_at
        }
      };
    } else {
      const res = await sendPlayerSupportMessage(playerId, msg.message_text);
      return {
        success: true,
        data: {
          id: res.id,
          sender_id: playerId,
          sender_username: msg.sender_username || 'Player',
          receiver_id: 'admin',
          message_text: res.message,
          is_read: res.is_read,
          created_at: res.created_at
        }
      };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Send failed' };
  }
}

export async function markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
  const playerId = senderId === 'admin' ? receiverId : senderId;
  const forSenderType = senderId === 'admin' ? 'player' : 'admin';
  await markAdminChatAsRead(playerId, forSenderType);
}

/**
 * DELETION REQUEST HELPERS
 */
export async function getDeletionRequests(): Promise<AccountDeletionRequest[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('deletion_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('Error fetching deletion requests:', err);
    }
  }
  return [];
}

export async function saveDeletionRequest(req: AccountDeletionRequest) {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('deletion_requests')
        .upsert(req);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error saving deletion request:', err.message || err);
    }
  }
}

export async function updateDeletionRequestStatus(id: string, status: 'accepted' | 'rejected') {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('deletion_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Error updating deletion request:', err);
    }
  }
}

export async function deleteDeletionRequest(id: string) {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('deletion_requests')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Error deleting deletion request:', err);
    }
  }
}

export async function deleteUserAccount(userId: string) {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      
      await supabase
        .from('deletion_requests')
        .delete()
        .eq('user_id', userId);
    } catch (err) {
      console.error('Error deleting account from Supabase:', err);
    }
  }
}

export async function fetchRulesList(): Promise<Rule[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('rules')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        console.error('Error fetching rules from rules table:', error);
        throw error;
      }
      return data || [];
    } catch (err) {
      console.error('Error in fetchRulesList:', err);
      throw err;
    }
  }
  return [];
}

export async function publishRule(title: string, content: string): Promise<Rule> {
  const sessionCheck = await ensureFreshSupabaseSession();
  if (!sessionCheck.valid) {
    throw new Error(sessionCheck.error || 'Session expired. Please log in again.');
  }
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('rules')
        .insert({
          title: title.trim() || 'Platform Rules',
          content: content.trim(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) {
        console.error('Error inserting rule into rules table:', error);
        throw error;
      }
      return data;
    } catch (err) {
      console.error('Error in publishRule:', err);
      throw err;
    }
  }
  throw new Error('Supabase not configured');
}

export async function deleteRule(id: string): Promise<void> {
  const sessionCheck = await ensureFreshSupabaseSession();
  if (!sessionCheck.valid) {
    throw new Error(sessionCheck.error || 'Session expired. Please log in again.');
  }
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('rules')
        .delete()
        .eq('id', id);
      if (error) {
        console.error('Error deleting rule:', error);
        throw error;
      }
    } catch (err) {
      console.error('Error in deleteRule:', err);
      throw err;
    }
  }
}

export async function getRules(): Promise<string> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data } = await supabase
        .from('announcements')
        .select('content')
        .eq('id', 'community-rules')
        .maybeSingle();
      return data?.content || '';
    } catch (err) {
      console.warn('Error fetching rules:', err);
    }
  }
  return '';
}

export async function saveRules(content: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('announcements').upsert({
        id: 'community-rules',
        title: 'Community Rules',
        content,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Error saving rules:', err);
    }
  }
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: rawData, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(rawData)) {
        // 24h se purani hatao
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const oldIds = rawData
          .filter((n: any) => n.created_at && n.created_at < cutoff)
          .map((n: any) => n.id)
          .filter(Boolean);
        if (oldIds.length > 0) {
          await supabase.from('notifications').delete().in('id', oldIds);
        }
        const data = rawData.filter(
          (n: any) => !n.created_at || n.created_at >= cutoff
        );
        // Deduplicate notifications by ID and event proximity
        const seenIds = new Set<string>();
        const deduplicated: Notification[] = [];

        for (const notif of data) {
          if (!notif || !notif.id || seenIds.has(notif.id)) continue;
          seenIds.add(notif.id);

          const notifTime = new Date(notif.created_at).getTime();
          const cleanTitle = (notif.title || '').replace(/[^\w\s]/gi, '').trim().toLowerCase();

          // Check if an identical notification was already accepted within 2 minutes
          const isDuplicateEvent = deduplicated.some(existing => {
            if (existing.match_id && notif.match_id && existing.match_id === notif.match_id && existing.type === notif.type) {
              return true;
            }
            if (existing.type !== notif.type) return false;

            const existingTime = new Date(existing.created_at).getTime();
            const timeDiffSec = Math.abs(notifTime - existingTime) / 1000;

            if (timeDiffSec <= 120) {
              const existingCleanTitle = (existing.title || '').replace(/[^\w\s]/gi, '').trim().toLowerCase();
              if (cleanTitle && existingCleanTitle && (cleanTitle === existingCleanTitle || cleanTitle.includes(existingCleanTitle) || existingCleanTitle.includes(cleanTitle))) {
                return true;
              }
              if (notif.type === 'withdrawal' || notif.type === 'deposit') {
                const isBothApproved = (existing.title?.toLowerCase().includes('approved') || existing.message?.toLowerCase().includes('approved')) &&
                                      (notif.title?.toLowerCase().includes('approved') || notif.message?.toLowerCase().includes('approved'));
                const isBothRejected = (existing.title?.toLowerCase().includes('rejected') || existing.message?.toLowerCase().includes('rejected')) &&
                                      (notif.title?.toLowerCase().includes('rejected') || notif.message?.toLowerCase().includes('rejected'));
                if (isBothApproved || isBothRejected) return true;
              }
            }
            return false;
          });

          if (!isDuplicateEvent) {
            deduplicated.push(notif);
          }
        }

        return deduplicated;
      }
    } catch (err) {
      console.warn('Error fetching notifications:', err);
    }
  }
  return [];
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  }
}

export async function markAllNotificationsForUserRead(userId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase && userId) {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    } catch (err) {
      console.error('Error marking all notifications read:', err);
    }
  }
}

export async function deleteNotification(id: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('notifications').delete().eq('id', id);
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }
}

export async function createNotification(data: Omit<Notification, 'id' | 'created_at'>): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const fiveMinutesAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // ===== USER-SPECIFIC DEDUP =====
    if (data.user_id) {
      let query = supabase
        .from('notifications')
        .select('id, title, message, created_at, type, match_id')
        .eq('user_id', data.user_id)
        .gte('created_at', fiveMinutesAgoIso);

      if (data.type) query = query.eq('type', data.type);
      if (data.match_id) query = query.eq('match_id', data.match_id);

      const { data: recentNotifs, error: queryErr } = await query;

      if (!queryErr && Array.isArray(recentNotifs) && recentNotifs.length > 0) {
        const isDuplicate = recentNotifs.some((existing) => {
          // Same match_id + same type = duplicate
          if (data.match_id && existing.match_id === data.match_id && data.type && existing.type === data.type) {
            return true;
          }

          const cleanExistingTitle = (existing.title || '').replace(/[^\w\s]/gi, '').trim().toLowerCase();
          const cleanNewTitle = (data.title || '').replace(/[^\w\s]/gi, '').trim().toLowerCase();

          if (cleanExistingTitle && cleanNewTitle &&
              (cleanExistingTitle === cleanNewTitle ||
               cleanExistingTitle.includes(cleanNewTitle) ||
               cleanNewTitle.includes(cleanExistingTitle))) {
            return true;
          }

          if (existing.message && data.message && existing.message.trim() === data.message.trim()) {
            return true;
          }

          return false;
        });

        if (isDuplicate) {
          console.log('[createNotification] Skipped duplicate for user:', data.user_id, data.title);
          return;
        }
      }
    } else {
      // ===== GLOBAL DEDUP (match create etc.) =====
      let globalQuery = supabase
        .from('notifications')
        .select('id, title, match_id, created_at')
        .is('user_id', null)
        .gte('created_at', fiveMinutesAgoIso);

      // Pehle match_id se check (sabse strong)
      if (data.match_id) {
        globalQuery = globalQuery.eq('match_id', data.match_id);
      } else {
        globalQuery = globalQuery.eq('title', data.title);
      }

      const { data: recentGlobals } = await globalQuery.limit(1);

      if (recentGlobals && recentGlobals.length > 0) {
        console.log('[createNotification] Skipped duplicate global notification:', data.title, data.match_id);
        return;
      }
    }

    const newNotification: Notification = {
      ...data,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    await supabase.from('notifications').insert([newNotification]);
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

// =========================================
// FRIENDS & VIP PRIVATE CHAT SYSTEM HELPERS (100% Real Supabase)
// =========================================

export async function getFriendsList(userId: string): Promise<FriendItem[]> {
  if (!isSupabaseConfigured() || !supabase || !userId) return [];

  try {
    const { data, error } = await supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) {
      console.error('Error fetching friends list:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const friendIds = Array.from(
      new Set(
        data.map((r: any) => (String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id)))
          .filter(id => id && id !== String(userId))
      )
    );

    if (friendIds.length === 0) {
      return [];
    }

    const { data: profs, error: profsError } = await supabase
      .from('profiles')
      .select('id, username, name, pubg_name, avatar_url')
      .in('id', friendIds);

    if (profsError) {
      console.error('Error fetching profiles for friends:', profsError);
      return [];
    }

    if (!profs || !Array.isArray(profs)) {
      return [];
    }

    return profs.map((p: any) => ({
      id: String(p.id),
      username: (p.username || 'Player').replace(/^@/, ''),
      name: p.name || p.username || 'Player',
      pubg_id_name: (p.pubg_name || p.pubg_id_name || '').trim(),
      pubg_id_number: '',
      avatar_url: p.avatar_url || undefined,
      status: 'online',
      last_seen: 'Online'
    }));
  } catch (e) {
    console.error('Exception in getFriendsList:', e);
  }
  return [];
}

export async function getFriendRequestsList(userId: string): Promise<FriendRequestItem[]> {
  if (!isSupabaseConfigured() || !supabase || !userId) return [];

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getFriendRequestsList error:', error);
      return [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const senderIds = Array.from(new Set(data.map((r: any) => String(r.sender_id)).filter(Boolean)));
    const profilesMap = new Map<string, any>();

    if (senderIds.length > 0) {
      const { data: profs, error: profsErr } = await supabase
        .from('profiles')
        .select('id, username, name, pubg_name, avatar_url')
        .in('id', senderIds);
      if (!profsErr && Array.isArray(profs)) {
        profs.forEach((p) => {
          profilesMap.set(String(p.id), p);
        });
      }
    }

    return data.map((r: any) => {
      const prof = profilesMap.get(String(r.sender_id));
      return {
        id: String(r.id),
        sender_id: String(r.sender_id),
        sender_username: String(prof?.username || r.sender_username || 'Player').replace(/^@/, ''),
        sender_name: prof?.name || prof?.username || r.sender_name || r.sender_username || 'Player',
        sender_avatar: prof?.avatar_url || undefined,
        sender_pubg_name: prof?.pubg_name || r.sender_pubg_name || '',
        sender_pubg_id: '',
        receiver_id: String(r.receiver_id),
        status: r.status || 'pending',
        created_at: r.created_at || new Date().toISOString()
      };
    });
  } catch (e) {
    console.error('Exception in getFriendRequestsList:', e);
  }
  return [];
}

export async function searchPlayers(query: string, currentUserId: string): Promise<FriendItem[]> {
  const cleanQ = (query || '').trim().replace(/^@/, '');
  if (cleanQ.length < 2) return [];
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, name, pubg_name, avatar_url')
      .ilike('username', `%${cleanQ}%`)
      .neq('id', currentUserId)
      .limit(25);

    if (error) {
      console.error('searchPlayers error:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      username: p.username || 'Player',
      name: p.name || p.username || 'Player',
      pubg_id_name: p.pubg_name || '',
      pubg_id_number: '',
      avatar_url: p.avatar_url || '',
      status: 'online',
      last_seen: 'Recently'
    }));
  } catch (e) {
    console.error('searchPlayers exception:', e);
    return [];
  }
}

export async function sendFriendRequestApi(sender: UserProfile, target: FriendItem): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not connected' };
  }

  if (!sender?.id || !target?.id) {
    return { success: false, error: 'Invalid sender or receiver' };
  }

  const senderId = String(sender.id);
  const targetId = String(target.id);
  const senderPubg = (sender.pubg_id_name || (sender as any).pubg_name || '').trim();

  // Clean up any stale previous friend requests between the two users
  try {
    await supabase.from('friend_requests').delete()
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${senderId})`);
  } catch (cleanErr) {
    console.warn('Friend request pre-cleanup note:', cleanErr);
  }

  const payload = {
    sender_id: senderId,
    receiver_id: targetId,
    status: 'pending',
    sender_username: String(sender.username || 'Player').replace(/^@/, ''),
    sender_pubg_name: senderPubg
  };

  try {
    const { error } = await supabase.from('friend_requests').insert([payload]);
    if (error) {
      console.error('Error inserting friend request:', error);
      return { success: false, error: error.message };
    }

    const senderDisplayName = sender.name || sender.username || 'A Player';
    try {
      await createNotification({
        user_id: targetId,
        type: 'chat',
        title: 'New Friend Request',
        message: `📩 ${senderDisplayName} (@${sender.username}) sent you a friend request! Check your Requests tab.`,
        is_read: false
      });
    } catch (nErr) {
      console.warn('Notification error on friend request:', nErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Exception in sendFriendRequestApi:', err);
    return { success: false, error: err?.message || 'Send request failed' };
  }
}

export async function respondFriendRequestApi(
  requestId: string, 
  action: 'accept' | 'reject' | 'accepted' | 'rejected',
  currentUser: UserProfile
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not connected' };
  }

  const isAccept = action === 'accept' || action === 'accepted';
  const finalStatus = isAccept ? 'accepted' : 'rejected';

  try {
    const { data: req, error: reqErr } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !req) {
      return { success: false, error: reqErr?.message || 'Request not found' };
    }

    const { error: updateErr } = await supabase
      .from('friend_requests')
      .update({ status: finalStatus })
      .eq('id', requestId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    
    if (isAccept) {
      const { error: insertFriendErr } = await supabase.from('friends').insert([
        {
          user_id: String(req.receiver_id),
          friend_id: String(req.sender_id)
        },
        {
          user_id: String(req.sender_id),
          friend_id: String(req.receiver_id)
        }
      ]);

      if (insertFriendErr) {
        console.warn('Friends insert warning (may be duplicate key):', insertFriendErr.message);
      }

      const senderName = req.sender_name || req.sender_username || 'Player';
      const currentUserName = currentUser.name || currentUser.username || 'Player';

      try {
        await createNotification({
          user_id: currentUser.id,
          type: 'chat',
          title: 'Friend Request Accepted',
          message: `You accepted ${senderName}'s request! You are now friends.`,
          is_read: false
        });

        await createNotification({
          user_id: req.sender_id,
          type: 'chat',
          title: 'Friend Request Accepted',
          message: `🎉 ${currentUserName} accepted your friend request! Start chatting now.`,
          is_read: false
        });
      } catch (nErr) {
        console.warn('Failed to send notification:', nErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error responding to friend request:', err);
    return { success: false, error: err?.message || 'Failed to respond to request' };
  }
}

/**
 * Blocked Users API - Disabled (no block restrictions)
 */
export async function getBlockedUserIdsApi(_userId: string): Promise<string[]> {
  return [];
}

/**
 * Delete Friend API (Bidirectional delete, cleans friend requests, NO block row)
 */
export async function deleteFriendApi(
  currentUser: UserProfile, 
  targetFriend: FriendItem
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not connected' };
  }

  const currentUserId = String(currentUser.id);
  const targetId = String(targetFriend.id);

  if (!currentUserId || !targetId) {
    return { success: false, error: 'Invalid user IDs' };
  }

  try {
    // 1. Delete from friends table BOTH directions:
    // (user_id = me AND friend_id = other) OR (user_id = other AND friend_id = me)
    const { error: delFriendsErr } = await supabase
      .from('friends')
      .delete()
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${currentUserId})`);

    if (delFriendsErr) {
      console.warn('Friends delete warning:', delFriendsErr.message);
    }

    // 2. Delete related friend_requests between the two users (any status)
    const { error: delRequestsErr } = await supabase
      .from('friend_requests')
      .delete()
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUserId})`);

    if (delRequestsErr) {
      console.warn('Friend requests delete warning:', delRequestsErr.message);
    }

    // 3. Do NOT create any blocked/blacklist row

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting friend in Supabase:', err);
    return { success: false, error: err?.message || 'Failed to delete friend' };
  }
}

// Export alias for compatibility
export const blockAndDeleteFriendApi = deleteFriendApi;

export function extractChatMediaPath(url?: string | null): string | null {
  if (!url) return null;
  if (url.includes('banner') || url.includes('banners/')) return null; // Safety check: NEVER touch banners
  try {
    const parts = url.split('/chat-media/');
    if (parts.length > 1) {
      const path = decodeURIComponent(parts[1].split('?')[0]);
      if (path.startsWith('chat-media-')) return path;
    }
  } catch (e) {
    console.error('Error extracting chat media path:', e);
  }
  return null;
}

export async function cleanUpPrunedChatImages(mediaUrls: string[]): Promise<void> {
  if (!supabase || !isSupabaseConfigured() || !Array.isArray(mediaUrls) || mediaUrls.length === 0) return;

  for (const mediaUrl of mediaUrls) {
    try {
      if (!mediaUrl || mediaUrl.includes('banner') || mediaUrl.includes('banners/')) continue;

      const pathToDelete = extractChatMediaPath(mediaUrl);
      if (!pathToDelete || !pathToDelete.startsWith('chat-media-')) continue;

      // Safety check: check if any remaining row in friend_chats still references this mediaUrl
      const { data: existingRefs } = await supabase
        .from('friend_chats')
        .select('id')
        .eq('media_url', mediaUrl)
        .limit(1);

      if (existingRefs && existingRefs.length > 0) {
        continue;
      }

      // 1. Try calling Edge Function if deployed
      let edgeSuccess = false;
      try {
        const { data: efData, error: efErr } = await supabase.functions.invoke('delete-old-chat-media', {
          body: { mediaUrl, objectPath: pathToDelete }
        });
        if (!efErr && efData?.success) {
          edgeSuccess = true;
        }
      } catch (efErr) {
        // Edge function optional/fallback
      }

      // 2. Client-side storage removal fallback
      if (!edgeSuccess) {
        const { error: removeErr } = await supabase.storage.from('chat-media').remove([pathToDelete]);
        if (removeErr) {
          console.warn('Storage cleanup warning:', removeErr.message);
        } else {
          console.log('Successfully removed old pruned chat media file:', pathToDelete);
        }
      }
    } catch (err) {
      console.warn('Non-fatal error in cleanUpPrunedChatImages:', err);
    }
  }
}

export async function getDirectMessagesApi(user1Id: string, user2Id: string): Promise<DirectMessage[]> {
  if (!isSupabaseConfigured() || !supabase || !user1Id || !user2Id) return [];

  try {
    const { data: fcData, error: fcError } = await supabase
      .from('friend_chats')
      .select('id, sender_id, receiver_id, message, media_url, media_type, is_read, created_at')
      .or(`and(sender_id.eq.${user1Id},receiver_id.eq.${user2Id}),and(sender_id.eq.${user2Id},receiver_id.eq.${user1Id})`)
      .order('created_at', { ascending: true });

    if (fcError) {
      console.error('Error fetching friend_chats from Supabase:', fcError.message);
      return [];
    }

    if (Array.isArray(fcData)) {
      return fcData.map((d: any) => ({
        id: String(d.id),
        sender_id: String(d.sender_id),
        sender_username: 'Player',
        sender_avatar: null,
        receiver_id: String(d.receiver_id),
        message_text: String(d.message || ''),
        media_url: d.media_url || null,
        media_type: (d.media_type?.includes('image') || d.media_url) ? 'image' : undefined,
        created_at: d.created_at || new Date().toISOString(),
        is_read: Boolean(d.is_read)
      }));
    }
  } catch (err) {
    console.error('Exception fetching friend_chats from Supabase:', err);
  }

  return [];
}

export async function sendDirectMessageApi(
  sender: UserProfile, 
  receiverId: string, 
  text: string, 
  mediaUrl?: string, 
  mediaType?: string,
  mediaObjectPath?: string
): Promise<{ success: boolean; error?: string; data?: DirectMessage }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not connected' };
  }

  try {
    const trimmedText = text ? text.trim() : '';

    // Check pre-insert count of messages between these two users to detect messages that will be pruned by 100-message DB trigger
    let preInsertOldMediaUrls: string[] = [];
    try {
      const { data: existingRows } = await supabase
        .from('friend_chats')
        .select('id, media_url')
        .or(`and(sender_id.eq.${sender.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${sender.id})`)
        .order('created_at', { ascending: true });

      if (Array.isArray(existingRows) && existingRows.length >= 100) {
        // Any rows beyond index (length - 99) will be purged by trigger when 101st is inserted
        const toPurge = existingRows.slice(0, existingRows.length - 99);
        preInsertOldMediaUrls = toPurge
          .map(r => r.media_url)
          .filter((url): url is string => Boolean(url && url.includes('chat-media') && !url.includes('banner')));
      }
    } catch (countErr) {
      console.warn('Pre-insert count check non-fatal error:', countErr);
    }

    // Security & Integrity: Always set message to non-null string ('' or '[image]' or text)
    const messageContent = trimmedText !== '' ? trimmedText : (mediaUrl ? '[image]' : '');

    const fcPayload = {
      sender_id: String(sender.id),
      receiver_id: String(receiverId),
      message: messageContent,
      media_url: mediaUrl || null,
      media_type: mediaType || (mediaUrl ? 'image/jpeg' : null),
      is_read: false
    };

    const { data: fcData, error: fcError } = await supabase
      .from('friend_chats')
      .insert([fcPayload])
      .select()
      .single();

    if (fcError) {
      console.error('Friend chat insert error:', fcError);

      // Orphan Cleanup: If image upload succeeded but database insertion fails, safely clean up newly uploaded orphan image
      if (mediaObjectPath || mediaUrl) {
        try {
          const pathToRemove = mediaObjectPath || extractChatMediaPath(mediaUrl);
          if (pathToRemove && pathToRemove.startsWith('chat-media-') && !pathToRemove.includes('banner')) {
            await supabase.storage.from('chat-media').remove([pathToRemove]);
            console.log('Cleaned up orphan image after failed db insert:', pathToRemove);
          }
        } catch (cleanupErr) {
          console.warn('Orphan image cleanup warning:', cleanupErr);
        }
      }

      return { success: false, error: `Failed to send message: ${fcError.message}` };
    }

    const insertedMsg: DirectMessage = {
      id: String(fcData.id),
      sender_id: String(fcData.sender_id),
      sender_username: sender.username || 'Player',
      sender_avatar: sender.avatar_url || null,
      receiver_id: String(fcData.receiver_id),
      message_text: String(fcData.message || ''),
      media_url: fcData.media_url || null,
      media_type: (fcData.media_type?.includes('image') || fcData.media_url) ? 'image' : undefined,
      created_at: fcData.created_at || new Date().toISOString(),
      is_read: false
    };

    const senderDisplayName = sender.name || sender.username || 'Friend';
    try {
      await createNotification({
        user_id: receiverId,
        type: 'chat',
        title: `New Message from @${sender.username}`,
        message: `💬 ${senderDisplayName}: ${trimmedText || '📷 Image attachment'}`,
        is_read: false
      });
    } catch (nErr) {
      console.warn('Failed to notify DM receiver:', nErr);
    }

    // Safely clean up Storage images for pruned messages (>100 limit) asynchronously without blocking
    if (preInsertOldMediaUrls.length > 0) {
      cleanUpPrunedChatImages(preInsertOldMediaUrls).catch(err => {
        console.warn('Background pruned media cleanup warning:', err);
      });
    }

    return { success: true, data: insertedMsg };
  } catch (err: any) {
    console.error('Error in sendDirectMessageApi:', err);
    return { success: false, error: err?.message || 'Failed to send message' };
  }
}

export async function markFriendMessagesAsReadApi(userId: string, friendId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !userId || !friendId) return;

  try {
    await supabase
      .from('friend_chats')
      .update({ is_read: true })
      .eq('sender_id', friendId)
      .eq('receiver_id', userId)
      .eq('is_read', false);
  } catch (e) {
    console.warn('markFriendMessagesAsReadApi friend_chats error:', e);
  }
}

export async function getUnreadFriendChatCountsApi(userId: string): Promise<{ countsByFriend: Record<string, number>; totalUnread: number }> {
  if (!isSupabaseConfigured() || !supabase || !userId) {
    return { countsByFriend: {}, totalUnread: 0 };
  }

  const countsByFriend: Record<string, number> = {};
  let totalUnread = 0;

  try {
    const { data: fcData, error } = await supabase
      .from('friend_chats')
      .select('sender_id')
      .eq('receiver_id', userId)
      .eq('is_read', false);

    if (!error && Array.isArray(fcData)) {
      fcData.forEach((row: any) => {
        const sId = String(row.sender_id);
        countsByFriend[sId] = (countsByFriend[sId] || 0) + 1;
        totalUnread += 1;
      });
    }
  } catch (e) {
    console.warn('getUnreadFriendChatCountsApi friend_chats error:', e);
  }

  return { countsByFriend, totalUnread };
}

export async function getPendingFriendRequestsCountApi(userId: string): Promise<number> {
  if (!isSupabaseConfigured() || !supabase || !userId) return 0;

  try {
    const { count, error } = await supabase
      .from('friend_requests')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    if (!error && typeof count === 'number') {
      return count;
    }
  } catch (e) {
    console.warn('getPendingFriendRequestsCountApi error:', e);
  }

  return 0;
}

export async function uploadChatMediaApi(file: File | Blob, userId: string): Promise<{ url: string; type: string; objectPath: string }> {
  if (!supabase || !isSupabaseConfigured()) {
    throw new Error('Database connection not available');
  }

  let ext = 'jpg';
  if (file instanceof File && file.name) {
    const parts = file.name.split('.');
    if (parts.length > 1) {
      ext = parts.pop()!.toLowerCase();
    }
  } else if (file.type) {
    const mimeExt = file.type.split('/')[1];
    if (mimeExt) ext = mimeExt.toLowerCase().replace('+xml', '');
  }

  const mimeType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const fileName = `chat-media-${userId}-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage.from('chat-media').upload(fileName, file, {
    upsert: true,
    contentType: mimeType
  });

  if (error) {
    console.error('Upload to chat-media bucket failed:', error);
    throw new Error(`Failed to upload to 'chat-media' bucket: ${error.message}. Please verify the bucket exists.`);
  }

  const { data: pData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
  if (!pData || !pData.publicUrl) {
    try {
      await supabase.storage.from('chat-media').remove([fileName]);
    } catch (e) {}
    throw new Error('Failed to retrieve public URL of uploaded image from chat-media bucket.');
  }

  return { url: pData.publicUrl, type: mimeType, objectPath: fileName };
}

export function normalizeLeaderboardCategory(category: string): { primary: string; aliases: string[]; orFilter: string } {
  const clean = (category || '').toLowerCase().trim();

  // Kills aliases
  if (
    clean === 'kills' || 
    clean === 'kill' || 
    clean === 'highest_kills' || 
    clean === 'highest_kill' || 
    clean === 'kill_king' ||
    clean.includes('kill')
  ) {
    const aliases = ['kills', 'kill', 'highest_kills', 'highest_kill', 'kill_king'];
    return {
      primary: 'kills',
      aliases,
      orFilter: aliases.map(a => `category.eq.${a}`).join(',')
    };
  }

  // Matches / Match Play aliases
  if (
    clean === 'matches' || 
    clean === 'match' || 
    clean === 'match_play' || 
    clean === 'highest_match_play' || 
    clean === 'highest_matches' || 
    clean === 'highest_match' || 
    clean === 'match_master' ||
    clean.includes('match') ||
    clean.includes('play')
  ) {
    const aliases = ['matches', 'match', 'match_play', 'highest_match_play', 'highest_matches', 'highest_match', 'match_master'];
    return {
      primary: 'matches',
      aliases,
      orFilter: aliases.map(a => `category.eq.${a}`).join(',')
    };
  }

  // Wins aliases
  if (
    clean === 'wins' || 
    clean === 'win' || 
    clean === 'highest_wins' || 
    clean === 'highest_win' || 
    clean === 'highest_match_wins' || 
    clean === 'highest_match_win' || 
    clean === 'champion' ||
    clean.includes('win') ||
    clean.includes('champ')
  ) {
    const aliases = ['wins', 'win', 'highest_wins', 'highest_win', 'highest_match_wins', 'highest_match_win', 'champion'];
    return {
      primary: 'wins',
      aliases,
      orFilter: aliases.map(a => `category.eq.${a}`).join(',')
    };
  }

  // Reward / Rewards aliases
  if (
    clean === 'reward' || 
    clean === 'rewards' || 
    clean === 'highest_reward' || 
    clean === 'highest_rewards' || 
    clean === 'prize_king' ||
    clean.includes('reward') ||
    clean.includes('prize')
  ) {
    const aliases = ['reward', 'rewards', 'highest_reward', 'highest_rewards', 'prize_king'];
    return {
      primary: 'reward',
      aliases,
      orFilter: aliases.map(a => `category.eq.${a}`).join(',')
    };
  }

  return {
    primary: clean,
    aliases: [clean],
    orFilter: `category.eq.${clean}`
  };
}

export function extractStoragePathFromUrl(url: string, bucketName: string = 'leaderboard_media'): string | null {
  if (!url) return null;
  try {
    const parts = url.split(`/${bucketName}/`);
    if (parts.length > 1) {
      return decodeURIComponent(parts[1].split('?')[0]);
    }
    const urlObj = new URL(url);
    const pathname = decodeURIComponent(urlObj.pathname);
    const idx = pathname.indexOf(`/${bucketName}/`);
    if (idx !== -1) {
      return pathname.substring(idx + bucketName.length + 2);
    }
  } catch (e) {
    console.error('Error extracting storage path:', e);
  }
  return null;
}

export async function fetchLeaderboardVideosApi(): Promise<LeaderboardVideo[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('leaderboard_videos')
        .select('*');

      if (!error && data) {
        const mapped = data.map((d: any) => ({
          category: d.category,
          rank: Number(d.rank),
          video_url: d.video_url || d.url || ''
        }));
        try {
          localStorage.setItem(STORAGE_KEYS.LEADERBOARD_VIDEOS, JSON.stringify(mapped));
        } catch (e) {
          console.error('Error caching leaderboard videos:', e);
        }
        return mapped;
      }
      if (error) {
        console.warn('Supabase fetch leaderboard_videos error:', error);
      }
    } catch (err) {
      console.error('Error fetching leaderboard videos from Supabase:', err);
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEADERBOARD_VIDEOS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading local leaderboard videos:', e);
  }

  return [];
}

export async function ensureFreshSupabaseSession(): Promise<{ valid: boolean; token?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { valid: true };
  }

  try {
    // 1. Inspect existing session validity first to avoid unnecessary network latency
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (!sessionErr && sessionData?.session?.access_token) {
      const expiresAt = sessionData.session.expires_at;
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt && (expiresAt - nowSec > 60)) {
        return { valid: true, token: sessionData.session.access_token };
      }
    }

    // 2. If token expired or expiring within 60s, refresh session
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshData?.session?.access_token) {
      return { valid: true, token: refreshData.session.access_token };
    }

    return { 
      valid: false, 
      error: 'Session expired, please login again' 
    };
  } catch (err: any) {
    console.error('Session refresh error:', err);
    return { 
      valid: false, 
      error: 'Session expired, please login again' 
    };
  }
}

export async function uploadLeaderboardVideoApi(
  category: string, 
  rank: number = 1, 
  file: File,
  onProgress?: (percent: number, stageMessage?: string) => void
): Promise<string> {
  let mediaUrl = '';

  if (isSupabaseConfigured() && supabase) {
    try {
      // Step A: Refresh session before upload/publish
      onProgress?.(5, 'Verifying authentication session...');
      const sessionCheck = await ensureFreshSupabaseSession();
      if (!sessionCheck.valid) {
        throw new Error(sessionCheck.error || 'Session expired, please login again');
      }
      const authToken = sessionCheck.token || supabaseAnonKey;

      const { primary, aliases } = normalizeLeaderboardCategory(category);
      const categoriesToCheck = aliases;

      // 1. Delete old storage file if replacing existing video
      onProgress?.(10, 'Cleaning previous video asset...');
      try {
        const { data: existingRows } = await supabase
          .from('leaderboard_videos')
          .select('video_url')
          .in('category', categoriesToCheck)
          .eq('rank', rank);

        if (existingRows && existingRows.length > 0) {
          const oldFilesToRemove: string[] = [];
          for (const row of existingRows) {
            if (row.video_url) {
              const oldPath = extractStoragePathFromUrl(row.video_url, 'leaderboard_media');
              if (oldPath) oldFilesToRemove.push(oldPath);
            }
          }
          if (oldFilesToRemove.length > 0) {
            await supabase.storage.from('leaderboard_media').remove(oldFilesToRemove);
          }
        }
      } catch (checkErr) {
        console.warn('Warning during old storage cleanup:', checkErr);
      }

      // 2. Upload new video file with progress tracking
      onProgress?.(15, 'Preparing upload to storage bucket...');
      const fileExt = file.name.split('.').pop() || 'mp4';
      const cleanFileName = `leaderboard_${primary}_rank${rank}_${Date.now()}.${fileExt}`;
      
      const uploadSuccess = await new Promise<boolean>((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          const targetUrl = `${supabaseUrl}/storage/v1/object/leaderboard_media/${encodeURIComponent(cleanFileName)}`;
          xhr.open('POST', targetUrl, true);
          xhr.setRequestHeader('apikey', supabaseAnonKey);
          xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
          xhr.setRequestHeader('x-upsert', 'true');
          if (file.type) {
            xhr.setRequestHeader('Content-Type', file.type);
          }

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              // Map upload progress from 15% to 85%
              const ratio = event.loaded / event.total;
              const percent = Math.min(85, Math.max(15, Math.round(15 + ratio * 70)));
              onProgress?.(percent, `Uploading file: ${percent}%`);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(true);
            } else {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.message?.includes('exp') || res.error?.includes('exp')) {
                  reject(new Error('Session expired, please login again'));
                } else {
                  reject(new Error(res.message || res.error || `Upload failed with status ${xhr.status}`));
                }
              } catch {
                reject(new Error(`Storage upload failed with HTTP ${xhr.status}`));
              }
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error during XHR upload'));
          };

          xhr.send(file);
        } catch (err) {
          reject(err);
        }
      }).catch(async (xhrErr) => {
        console.warn('XHR direct upload fallback to SDK upload:', xhrErr);
        if (xhrErr?.message === 'Session expired, please login again') {
          throw xhrErr;
        }
        // Fallback to standard Supabase SDK upload with stage updates
        onProgress?.(35, 'Uploading video to storage bucket (leaderboard_media)...');
        const { data, error } = await supabase.storage
          .from('leaderboard_media')
          .upload(cleanFileName, file, { 
            cacheControl: '3600',
            upsert: true 
          });

        if (error || !data) {
          if (error?.message?.includes('exp') || (error as any)?.statusCode === 401) {
            throw new Error('Session expired, please login again');
          }
          throw new Error(error?.message || 'Storage upload failed');
        }
        return true;
      });

      if (!uploadSuccess) {
        throw new Error('Failed to upload video to storage');
      }

      onProgress?.(88, 'Generating public video URL...');
      const { data: publicData } = supabase.storage
        .from('leaderboard_media')
        .getPublicUrl(cleanFileName);

      if (!publicData?.publicUrl) {
        throw new Error('Failed to obtain public URL from Supabase storage');
      }

      mediaUrl = publicData.publicUrl;
      const now = new Date().toISOString();

      // 3. Upsert into leaderboard_videos
      onProgress?.(92, 'Upserting database record (leaderboard_videos)...');
      const { error: upsertError } = await supabase
        .from('leaderboard_videos')
        .upsert({
          category: primary,
          rank,
          video_url: mediaUrl,
          updated_at: now
        }, { onConflict: 'category,rank' });

      if (upsertError) {
        console.warn('Upsert direct failed, trying delete and insert:', upsertError);
        await supabase
          .from('leaderboard_videos')
          .delete()
          .in('category', categoriesToCheck)
          .eq('rank', rank);

        const { error: insertError } = await supabase
          .from('leaderboard_videos')
          .insert({
            category: primary,
            rank,
            video_url: mediaUrl,
            updated_at: now
          });

        if (insertError) {
          if (insertError.message?.includes('exp')) {
            throw new Error('Session expired, please login again');
          }
          throw new Error(insertError.message);
        }
      }

      onProgress?.(100, 'Video published successfully!');
    } catch (err: any) {
      console.error('Failed to upload/save leaderboard video to Supabase:', err);
      throw err;
    }
  } else {
    throw new Error('Supabase is not configured. Please verify database connection.');
  }

  // Update local storage backup
  try {
    const { primary, aliases } = normalizeLeaderboardCategory(category);
    const raw = localStorage.getItem(STORAGE_KEYS.LEADERBOARD_VIDEOS);
    const localVideos: LeaderboardVideo[] = raw ? JSON.parse(raw) : [];
    const filtered = localVideos.filter(v => !(
      aliases.includes(v.category?.toLowerCase()?.trim()) && 
      Number(v.rank) === rank
    ));
    filtered.push({ category: primary, rank, video_url: mediaUrl });
    localStorage.setItem(STORAGE_KEYS.LEADERBOARD_VIDEOS, JSON.stringify(filtered));
  } catch (err) {
    console.error('Error saving local leaderboard videos:', err);
  }

  window.dispatchEvent(new Event('storage'));
  return mediaUrl;
}

export async function deleteLeaderboardVideoApi(category: string, rank: number = 1): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured. Please verify database connection.');
  }

  try {
    // Step A: Refresh session before deletion
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.valid) {
      throw new Error(sessionCheck.error || 'Session expired, please login again');
    }

    const { aliases, orFilter } = normalizeLeaderboardCategory(category);
    console.log(`[deleteLeaderboardVideoApi] Deleting rank ${rank} for category "${category}" (aliases: ${aliases.join(', ')}, orFilter: ${orFilter})`);

    // 1. Fetch existing rows to identify storage files to delete
    const { data: existingRows, error: fetchErr } = await supabase
      .from('leaderboard_videos')
      .select('video_url')
      .eq('rank', rank)
      .or(orFilter);

    if (fetchErr) {
      console.warn('Error fetching existing video URLs before delete:', fetchErr);
    }

    // 2. Delete storage file from leaderboard_media
    if (existingRows && existingRows.length > 0) {
      const filesToRemove: string[] = [];
      for (const row of existingRows) {
        if (row.video_url) {
          const filePath = extractStoragePathFromUrl(row.video_url, 'leaderboard_media');
          if (filePath) filesToRemove.push(filePath);
        }
      }
      if (filesToRemove.length > 0) {
        console.log('[deleteLeaderboardVideoApi] Removing storage files:', filesToRemove);
        const { error: storageDelErr } = await supabase.storage
          .from('leaderboard_media')
          .remove(filesToRemove);
        if (storageDelErr) {
          console.warn('Failed to delete storage file from leaderboard_media:', storageDelErr);
        }
      }
    }

    // 3. Delete leaderboard_videos rows for that category (all aliases) where rank = 1
    const { error: dbErr } = await supabase
      .from('leaderboard_videos')
      .delete()
      .eq('rank', rank)
      .or(orFilter);

    if (dbErr) {
      console.error('Supabase delete leaderboard video error:', dbErr);
      throw new Error(dbErr.message);
    }
  } catch (err: any) {
    console.error('Error deleting leaderboard video from Supabase:', err);
    throw err;
  }

  // Update local storage backup
  try {
    const { aliases } = normalizeLeaderboardCategory(category);
    const raw = localStorage.getItem(STORAGE_KEYS.LEADERBOARD_VIDEOS);
    const localVideos: LeaderboardVideo[] = raw ? JSON.parse(raw) : [];
    const filtered = localVideos.filter(v => {
      const matchCat = aliases.includes(v.category?.toLowerCase()?.trim());
      return !(matchCat && Number(v.rank) === rank);
    });
    localStorage.setItem(STORAGE_KEYS.LEADERBOARD_VIDEOS, JSON.stringify(filtered));
  } catch (err) {
    console.error('Error clearing local leaderboard videos:', err);
  }

  window.dispatchEvent(new Event('storage'));
  return { success: true, message: 'Video removed successfully' };
}


export async function adminApproveDeposit(txId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
  console.log(`[adminApproveDeposit] Approving deposit for txId: ${txId}, adminId: ${adminId}`);
  try {
    if (!txId) {
      return { success: false, message: "Approval failed: Transaction ID is required" };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Database not connected to Supabase." };
    }

    // 1. Fetch deposit request to get player_id and amount
    let playerId: string | null = null;
    let username: string | null = null;
    let amount = 0;
    let paymentMethod = 'jazzcash';
    let depData: any = null;

    const { data: depReq } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (depReq) {
      if (depReq.status && depReq.status !== 'pending') {
        console.warn(`[adminApproveDeposit] Deposit ${txId} already processed with status: ${depReq.status}`);
        return { success: false, message: "Already processed" };
      }
      depData = depReq;
      playerId = depReq.player_id || depReq.user_id || null;
      username = depReq.username || null;
      amount = parseAmount(depReq.amount) ?? 0;
      paymentMethod = depReq.payment_method || 'jazzcash';
    } else {
      // Fallback: check wallet_transactions table
      const { data: txReq } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', txId)
        .maybeSingle();

      if (txReq) {
        if (txReq.status && txReq.status !== 'pending') {
          return { success: false, message: "Already processed" };
        }
        playerId = txReq.user_id || null;
        username = txReq.username || null;
        amount = parseAmount(txReq.amount) ?? 0;
        paymentMethod = txReq.payment_method || 'jazzcash';
      }
    }

    if (!playerId && username) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle();
      if (p) playerId = p.id;
    }
    
    if (!playerId) {
      console.error('[adminApproveDeposit] Player ID not found for deposit request:', txId);
      return { success: false, message: "Approval failed: Player ID not found" };
    }

    // 2. Mark deposit_requests status as approved
    await supabase.from('deposit_requests').update({ status: 'approved' }).eq('id', txId);

    // 3. Mark wallet_transactions status as approved
    try {
      await supabase.from('wallet_transactions').upsert([{
        id: txId,
        user_id: playerId,
        amount: amount,
        type: 'deposit',
        payment_method: paymentMethod,
        sender_name: depData?.sender_name || '',
        account_title: depData?.sender_name || '',
        trx_id: depData?.trx_id || '',
        screenshot_url: depData?.screenshot_url || null,
        status: 'approved',
        created_at: depData?.created_at || new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('[adminApproveDeposit] wallet_transactions upsert warning:', e);
    }

    // 4. Update player wallet_balance EXACTLY ONCE
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, wallet_balance')
      .eq('id', playerId)
      .maybeSingle();

    if (prof) {
      const currentBal = Number(prof.wallet_balance || 0);
      const newBalance = currentBal + amount;
      await supabase
        .from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', playerId);
      console.log(`[adminApproveDeposit] Credit added Rs. ${amount} to ${playerId}. New balance: ${newBalance}`);
    }

    // 5. Create single notification for the player
    try {
      await createNotification({
        user_id: playerId,
        title: 'Deposit Approved',
        message: `✅ Your deposit of Rs. ${amount} via ${paymentMethod} has been approved and added to your wallet!`,
        is_read: false,
        type: 'deposit'
      });
    } catch (e) {
      console.warn('Notification creation warning:', e);
    }

    return { success: true, message: 'Deposit approved and wallet balance updated successfully!' };
  } catch (err: any) {
    console.error('[adminApproveDeposit] Exception:', err);
    return { success: false, message: err?.message || "Approval failed" };
  }
}

export async function adminRejectDeposit(txId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
  console.log(`[adminRejectDeposit] Rejecting deposit for txId: ${txId}, adminId: ${adminId}`);
  try {
    if (!txId) {
      return { success: false, message: "Rejection failed: Transaction ID is required" };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Database not connected to Supabase." };
    }

    const { data: depReq } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (depReq) {
      if (depReq.status && depReq.status !== 'pending') {
        console.warn(`[adminRejectDeposit] Deposit ${txId} already processed with status: ${depReq.status}`);
        return { success: false, message: "Already processed" };
      }

      const playerId = depReq.player_id || depReq.user_id;
      const amount = parseAmount(depReq.amount) ?? 0;
      const paymentMethod = depReq.payment_method || 'jazzcash';

      await supabase.from('deposit_requests').update({ status: 'rejected' }).eq('id', txId);

      try {
        await supabase.from('wallet_transactions').update({ status: 'rejected' }).eq('id', txId);
      } catch (e) {
        console.warn('[adminRejectDeposit] wallet_transactions sync warning:', e);
      }

      // Funds were never added at deposit request time, so profiles.wallet_balance is not modified

      if (playerId) {
        try {
          await createNotification({
            user_id: playerId,
            title: 'Deposit Rejected',
            message: `❌ Your deposit of Rs. ${amount} via ${paymentMethod} has been rejected.`,
            is_read: false,
            type: 'deposit'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Deposit rejected successfully' };
    }

    const { data: txReq } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (txReq) {
      if (txReq.status && txReq.status !== 'pending') {
        return { success: false, message: "Already processed" };
      }

      await supabase.from('wallet_transactions').update({ status: 'rejected' }).eq('id', txId);

      if (txReq.user_id) {
        try {
          await createNotification({
            user_id: txReq.user_id,
            title: 'Deposit Rejected',
            message: `❌ Your deposit of Rs. ${txReq.amount} has been rejected.`,
            is_read: false,
            type: 'deposit'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Deposit rejected successfully' };
    }

    return { success: false, message: 'Transaction not found' };
  } catch (err: any) {
    console.error('[adminRejectDeposit] Exception:', err);
    return { success: false, message: err?.message || 'Error rejecting deposit' };
  }
}

export async function adminApproveWithdrawal(txId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
  console.log(`[adminApproveWithdrawal] Approving withdrawal for txId: ${txId}, adminId: ${adminId}`);
  try {
    if (!txId) {
      return { success: false, message: "Approval failed: Transaction ID is required" };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Database not connected to Supabase." };
    }

    // 1. Fetch withdrawal request
    const { data: wdReq } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (wdReq) {
      if (wdReq.status && wdReq.status !== 'pending') {
        console.warn(`[adminApproveWithdrawal] Withdrawal ${txId} already processed with status: ${wdReq.status}`);
        return { success: false, message: "Already processed" };
      }

      const playerId = wdReq.player_id || wdReq.user_id;
      const amount = parseAmount(wdReq.amount) ?? 0;
      const paymentMethod = wdReq.payment_method || 'jazzcash';

      // Update withdrawal_requests status to approved
      await supabase.from('withdrawal_requests').update({ status: 'approved' }).eq('id', txId);

      // Update wallet_transactions status to approved
      try {
        await supabase.from('wallet_transactions').update({ status: 'approved' }).eq('id', txId);
      } catch (e) {
        console.warn('[adminApproveWithdrawal] wallet_transactions update warning:', e);
      }

      // DO NOT add amount back to wallet_balance.
      // Balance was already deducted at withdrawal request time.

      if (playerId) {
        try {
          await createNotification({
            user_id: playerId,
            title: 'Withdrawal Approved',
            message: `✅ Your withdrawal of Rs. ${amount} via ${paymentMethod} has been approved and sent!`,
            is_read: false,
            type: 'withdrawal'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Withdrawal approved successfully' };
    }

    // 2. Fallback: check wallet_transactions table if not in withdrawal_requests
    const { data: txReq } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (txReq) {
      if (txReq.status && txReq.status !== 'pending') {
        return { success: false, message: "Already processed" };
      }

      const playerId = txReq.user_id;
      const amount = Number(txReq.amount || 0);
      const paymentMethod = txReq.payment_method || 'jazzcash';

      await supabase.from('wallet_transactions').update({ status: 'approved' }).eq('id', txId);

      if (playerId) {
        try {
          await createNotification({
            user_id: playerId,
            title: 'Withdrawal Approved',
            message: `✅ Your withdrawal of Rs. ${amount} via ${paymentMethod} has been approved and sent!`,
            is_read: false,
            type: 'withdrawal'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Withdrawal approved successfully' };
    }

    return { success: false, message: 'Transaction not found' };
  } catch (err: any) {
    console.error('[adminApproveWithdrawal] Exception:', err);
    return { success: false, message: err?.message || 'Error approving withdrawal' };
  }
}

export async function adminRejectWithdrawal(txId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
  console.log(`[adminRejectWithdrawal] Rejecting withdrawal for txId: ${txId}, adminId: ${adminId}`);
  try {
    if (!txId) {
      return { success: false, message: "Rejection failed: Transaction ID is required" };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Database not connected to Supabase." };
    }

    // 1. Fetch withdrawal request to get player_id and amount
    const { data: wdReq } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (wdReq) {
      if (wdReq.status && wdReq.status !== 'pending') {
        console.warn(`[adminRejectWithdrawal] Withdrawal ${txId} already processed with status: ${wdReq.status}`);
        return { success: false, message: "Already processed" };
      }

      const playerId = wdReq.player_id || wdReq.user_id;
      const amount = parseAmount(wdReq.amount) ?? 0;
      const paymentMethod = wdReq.payment_method || 'jazzcash';

      // Mark withdrawal_requests as rejected
      await supabase.from('withdrawal_requests').update({ status: 'rejected' }).eq('id', txId);

      // Mark wallet_transactions as rejected
      try {
        await supabase.from('wallet_transactions').update({ status: 'rejected' }).eq('id', txId);
      } catch (e) {
        console.warn('[adminRejectWithdrawal] wallet_transactions update warning:', e);
      }

      // Refund held amount EXACTLY ONCE to profiles.wallet_balance
      if (playerId && amount > 0) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, wallet_balance')
          .eq('id', playerId)
          .maybeSingle();

        if (profData) {
          const currentBal = parseAmount(profData.wallet_balance) ?? 0;
          const newBalance = currentBal + amount;
          await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance })
            .eq('id', playerId);
          console.log(`[adminRejectWithdrawal] Successfully refunded Rs. ${amount} to player ${playerId}. Balance went from ${currentBal} to ${newBalance}`);
        }

        // Single notification to player
        try {
          await createNotification({
            user_id: playerId,
            title: 'Withdrawal Rejected',
            message: `❌ Your withdrawal of Rs. ${amount} via ${paymentMethod} has been rejected and Rs. ${amount} has been refunded to your wallet.`,
            is_read: false,
            type: 'withdrawal'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Withdrawal rejected and refunded successfully' };
    }

    // 2. Fallback: check wallet_transactions table if not found in withdrawal_requests
    const { data: txReq } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (txReq) {
      if (txReq.status && txReq.status !== 'pending') {
        return { success: false, message: "Already processed" };
      }

      const playerId = txReq.user_id;
      const amount = Number(txReq.amount || 0);
      const paymentMethod = txReq.payment_method || 'jazzcash';

      await supabase.from('wallet_transactions').update({ status: 'rejected' }).eq('id', txId);

      // Refund if it was a withdrawal (EXACTLY ONCE)
      if (playerId && amount > 0 && txReq.type === 'withdrawal') {
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, wallet_balance')
          .eq('id', playerId)
          .maybeSingle();

        if (profData) {
          const currentBal = Number(profData.wallet_balance || 0);
          const newBalance = currentBal + amount;
          await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance })
            .eq('id', playerId);
          console.log(`[adminRejectWithdrawal] Fallback refunded Rs. ${amount} to player ${playerId}. Balance went from ${currentBal} to ${newBalance}`);
        }

        try {
          await createNotification({
            user_id: playerId,
            title: 'Withdrawal Rejected',
            message: `❌ Your withdrawal of Rs. ${amount} via ${paymentMethod} has been rejected and Rs. ${amount} has been refunded to your wallet.`,
            is_read: false,
            type: 'withdrawal'
          });
        } catch (e) {
          console.warn('Notification sync warning:', e);
        }
      }

      return { success: true, message: 'Withdrawal rejected and refunded successfully' };
    }

    return { success: false, message: 'Transaction not found' };
  } catch (err: any) {
    console.error('[adminRejectWithdrawal] Exception:', err);
    return { success: false, message: err?.message || 'Error rejecting withdrawal' };
  }
}

export async function updateLocalTransactionStatus(txId: string, status: 'approved' | 'rejected') {
  if (!isSupabaseConfigured() || !supabase) return;

  // 1. Check if deposit_request
  const { data: depData } = await supabase.from('deposit_requests').select('id').eq('id', txId).maybeSingle();
  if (depData) {
    if (status === 'approved') {
      const res = await adminApproveDeposit(txId);
      if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
    } else {
      const res = await adminRejectDeposit(txId);
      if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
    }
    return;
  }

  // 2. Check if withdrawal_request
  const { data: wdData } = await supabase.from('withdrawal_requests').select('id').eq('id', txId).maybeSingle();
  if (wdData) {
    if (status === 'approved') {
      const res = await adminApproveWithdrawal(txId);
      if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
    } else {
      const res = await adminRejectWithdrawal(txId);
      if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
    }
    return;
  }

  // 3. Fallback to wallet_transactions
  const { data: txData } = await supabase.from('wallet_transactions').select('*').eq('id', txId).maybeSingle();
  if (txData) {
    if (txData.type === 'withdrawal') {
      if (status === 'approved') {
        const res = await adminApproveWithdrawal(txId);
        if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
      } else {
        const res = await adminRejectWithdrawal(txId);
        if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
      }
    } else {
      if (status === 'approved') {
        const res = await adminApproveDeposit(txId);
        if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
      } else {
        const res = await adminRejectDeposit(txId);
        if (!res.success && res.message !== 'Already processed') throw new Error(res.message);
      }
    }
  }
}

export async function insertDepositRequestToSupabase(req: {
  player_id?: string;
  user_id?: string;
  username?: string;
  amount: number;
  payment_method: string;
  sender_name: string;
  trx_id: string;
  screenshot_url?: string | null;
  status?: string;
}) {
  const amt = parseAmount(req.amount);
  if (amt === null || amt < 100 || amt > 100000) {
    throw new Error(amt === null ? 'Invalid deposit amount' : amt < 100 ? 'Minimum amount is 100' : 'Maximum amount is 100000');
  }

  if (!req.screenshot_url || !req.screenshot_url.trim()) {
    throw new Error('Upload first payment screenshot for payment proof');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database client is not configured or connected.');
  }

  // Prioritize the passed player_id or user_id (e.g. from userProfile prop in UI) over session/auth getUser to avoid admin override
  let currentUserId = req.player_id || req.user_id;

  if (!currentUserId) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      currentUserId = userData?.user?.id;
    } catch (e) {
      console.warn("getUser auth fallback failed:", e);
    }
  }

  if (!currentUserId) {
    throw new Error("Please login first");
  }

  const cleanTrxId = (req.trx_id || '').trim();

  // Check if deposit with same TRX ID already exists in Supabase
  if (cleanTrxId) {
    try {
      const { data: existingTrx } = await supabase
        .from('deposit_requests')
        .select('id, trx_id, status')
        .eq('trx_id', cleanTrxId)
        .maybeSingle();

      if (existingTrx) {
        console.warn('[Supabase] Duplicate TRX ID detected:', cleanTrxId);
        throw new Error(`This Transaction TRX ID (${cleanTrxId}) has already been submitted for a deposit request.`);
      }
    } catch (checkErr: any) {
      if (checkErr?.message?.includes('already been submitted')) {
        throw checkErr;
      }
      console.warn('Duplicate TRX ID check warning:', checkErr);
    }
  }

  const depositPayload: any = {
    player_id: currentUserId,
    user_id: currentUserId,
    username: req.username || '',
    amount: Number(req.amount),
    payment_method: req.payment_method,
    sender_name: (req.sender_name || '').trim(),
    trx_id: cleanTrxId,
    status: req.status || 'pending'
  };
  if (req.screenshot_url) {
    depositPayload.screenshot_url = req.screenshot_url;
  }

  console.log('[Supabase] Inserting deposit request into deposit_requests:', depositPayload);

  let { data, error } = await supabase
    .from('deposit_requests')
    .insert(depositPayload)
    .select();

  if (error) {
    console.warn('[Supabase deposit_requests initial insert error]:', error?.message || error);
    // Retry without potentially invalid columns (like username, user_id), but KEEP screenshot_url
    const retryPayload: any = {
      player_id: currentUserId,
      amount: Number(req.amount),
      payment_method: req.payment_method,
      sender_name: (req.sender_name || '').trim(),
      trx_id: cleanTrxId,
      status: req.status || 'pending'
    };
    if (req.screenshot_url) {
      retryPayload.screenshot_url = req.screenshot_url;
    }
    const retryRes = await supabase
      .from('deposit_requests')
      .insert(retryPayload)
      .select();
    data = retryRes.data;
    error = retryRes.error;
  }

  if (error) {
    console.error("Deposit insert error:", error);
    throw new Error(`Deposit Request Failed: ${error.message}`);
  }

  console.log('[Supabase] Deposit request inserted successfully:', data);

  return data;
}

export async function insertWithdrawalRequestToSupabase(tx: any) {
  if (isSupabaseConfigured() && supabase) {
    const dbTx: any = {
      id: tx.id || crypto.randomUUID(),
      player_id: tx.player_id || tx.user_id,
      username: tx.username || '',
      amount: Number(tx.amount || 0),
      payment_method: tx.payment_method || tx.method || 'JazzCash',
      account_number: tx.account_number || tx.accountNumber || '',
      account_title: tx.account_title || tx.accountTitle || '',
      status: tx.status || 'pending',
      created_at: tx.created_at || new Date().toISOString()
    };
    if (tx.screenshot_url || tx.screenshotUrl) {
      dbTx.screenshot_url = tx.screenshot_url || tx.screenshotUrl;
    }

    // Check if duplicate pending withdrawal exists
    if (dbTx.player_id && dbTx.amount) {
      try {
        const { data: existingWd } = await supabase
          .from('withdrawal_requests')
          .select('id')
          .eq('player_id', dbTx.player_id)
          .eq('status', 'pending')
          .eq('amount', dbTx.amount)
          .eq('account_number', dbTx.account_number)
          .maybeSingle();

        if (existingWd) {
          throw new Error('A pending withdrawal request with the exact same amount and account number is already being processed.');
        }
      } catch (checkErr: any) {
        if (checkErr?.message?.includes('already being processed')) {
          throw checkErr;
        }
      }
    }
    
    console.log('[Supabase withdrawal_requests Insert Payload]:', dbTx);

    let { error } = await supabase.from('withdrawal_requests').insert([dbTx]);
    if (error && error.code === 'PGRST204') {
      // Retry without optional columns if they don't exist
      delete dbTx.screenshot_url;
      const retryRes = await supabase.from('withdrawal_requests').insert([dbTx]);
      error = retryRes.error;
    }

    if (error) {
      console.error('Error inserting withdrawal request to Supabase:', error);
      throw error;
    }
  }
}

export async function uploadScreenshotToSupabase(file: string | File, path?: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return typeof file === 'string' ? file : null;
  }

  try {
    let uploadBody: File | Blob = file as any;
    let contentType = 'image/png';

    if (typeof file === 'string') {
      if (file.startsWith('http://') || file.startsWith('https://')) {
        return file;
      }
      if (file.startsWith('data:')) {
        try {
          const parts = file.split(';base64,');
          contentType = parts[0]?.replace('data:', '') || 'image/png';
          const base64Str = parts[1] || parts[0];
          const raw = window.atob(base64Str);
          const rawLength = raw.length;
          const uInt8Array = new Uint8Array(rawLength);
          for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
          }
          uploadBody = new Blob([uInt8Array], { type: contentType });
        } catch (e) {
          console.warn('Failed to parse base64 image string to Blob:', e);
          return file;
        }
      }
    }

    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const fileName = `deposit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path ? (path.includes('/') ? path : `${path}/${fileName}`) : fileName;

    const { error } = await supabase.storage.from('screenshots').upload(filePath, uploadBody, {
      contentType,
      upsert: true
    });

    if (error) {
      console.warn('Supabase storage upload warning:', error.message);
      // Return base64 string or null if upload fails, to never block deposit submission
      return typeof file === 'string' ? file : null;
    }

    const { data: publicUrlData } = supabase.storage.from('screenshots').getPublicUrl(filePath);
    return publicUrlData?.publicUrl || (typeof file === 'string' ? file : null);
  } catch (err) {
    console.warn('Error uploading screenshot to Supabase storage:', err);
    return typeof file === 'string' ? file : null;
  }
}

export async function compressImageToBlob(file: File | Blob, maxWidth = 1920, quality = 0.88): Promise<Blob> {
  // If file.size > 5MB → throw error to be handled by caller
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Max 5MB per image');
  }

  // 1) Try createImageBitmap preserving natural aspect ratio
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      let targetWidth = bitmap.width;
      let targetHeight = bitmap.height;

      // Scale down proportionally only if larger than maxWidth
      const maxDim = maxWidth || 1920;
      if (targetWidth > maxDim || targetHeight > maxDim) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
          targetWidth = maxDim;
        } else {
          targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
          targetHeight = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        bitmap.close();

        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
        if (blob) return blob;
      } else {
        bitmap.close();
      }
    } catch (e1) {
      console.warn('createImageBitmap failed, trying Image element fallback:', e1);
    }
  }

  // Fallback: try canvas-based scaling preserving aspect ratio
  return await new Promise<Blob>((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let targetWidth = img.naturalWidth || img.width;
          let targetHeight = img.naturalHeight || img.height;

          const maxDim = maxWidth || 1920;
          if (targetWidth > maxDim || targetHeight > maxDim) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
              targetWidth = maxDim;
            } else {
              targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
              targetHeight = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Canvas context is unavailable'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          canvas.toBlob(
            (blob) => {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              img.onload = null;
              img.onerror = null;
              if (blob) resolve(blob);
              else reject(new Error('Failed to export canvas blob'));
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not process image, please use a smaller photo or paste URL'));
      };
      img.src = objectUrl;
    } catch (err) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(err);
    }
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('Failed to parse data URL to Blob:', err);
    return new Blob([], { type: 'image/jpeg' });
  }
}

export async function compressDataUrlToBlob(dataUrl: string, maxWidth = 1920, quality = 0.88): Promise<Blob> {
  try {
    const blob = dataUrlToBlob(dataUrl);
    return await compressImageToBlob(blob, maxWidth, quality);
  } catch (err: any) {
    console.warn('compressDataUrlToBlob exception caught safely:', err);
    return dataUrlToBlob(dataUrl);
  }
}

export async function uploadMatchBannerToSupabase(file: File | Blob | string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Validate file size limit (5MB)
    if (file instanceof File || file instanceof Blob) {
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'Max 5MB allowed' };
      }
    } else if (typeof file === 'string' && file.startsWith('data:')) {
      const approxSize = (file.length - (file.indexOf(',') + 1)) * 0.75;
      if (approxSize > 5 * 1024 * 1024) {
        return { success: false, error: 'Max 5MB allowed' };
      }
    }

    if (!isSupabaseConfigured() || !supabase) {
      if (typeof file === 'string' && (file.startsWith('http://') || file.startsWith('https://'))) {
        return { success: true, url: file };
      }
      return { success: false, error: 'Supabase storage is not connected.' };
    }

    let uploadBlob: Blob;
    let contentType = 'image/jpeg';
    let originalName = 'banner.jpg';

    if (typeof file === 'string') {
      if (file.startsWith('http://') || file.startsWith('https://')) {
        return { success: true, url: file };
      }
      if (file.startsWith('data:')) {
        try {
          uploadBlob = await compressDataUrlToBlob(file);
          contentType = 'image/jpeg';
        } catch (e: any) {
          return { success: false, error: e?.message || 'Failed to process base64 image.' };
        }
      } else {
        return { success: false, error: 'Invalid image format or URL provided.' };
      }
    } else {
      contentType = file.type || 'image/jpeg';
      if (file instanceof File) {
        originalName = file.name || 'banner.jpg';
      }
      try {
        uploadBlob = await compressImageToBlob(file);
        contentType = 'image/jpeg';
      } catch (e) {
        console.warn('Image compression failed, using raw file blob:', e);
        uploadBlob = file;
      }
    }

    const cleanFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `banners/${Date.now()}-${cleanFilename}`;

    // Upload to match-banners with fallbacks to other storage buckets
    const primaryBuckets = ['match-banners', 'chat-media', 'screenshots', 'avatars'];
    let bucketName = '';
    let uploadRes: any = null;

    for (const bucket of primaryBuckets) {
      try {
        const res = await supabase.storage.from(bucket).upload(filePath, uploadBlob, {
          contentType,
          upsert: true
        });
        if (!res.error) {
          bucketName = bucket;
          uploadRes = res;
          break;
        } else {
          console.warn(`Upload attempt to '${bucket}' returned: ${res.error.message}`);
        }
      } catch (e: any) {
        console.warn(`Exception uploading to '${bucket}': ${e?.message}`);
      }
    }

    if (!uploadRes || uploadRes.error || !bucketName) {
      console.error('Supabase banner upload failed across all buckets:', uploadRes?.error);
      return { success: false, error: uploadRes?.error?.message || 'Failed to upload image to Supabase Storage.' };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    if (!publicUrlData || !publicUrlData.publicUrl) {
      return { success: false, error: 'Failed to retrieve public URL from storage.' };
    }

    return { success: true, url: publicUrlData.publicUrl };
  } catch (err: any) {
    console.error('Uncaught exception in uploadMatchBannerToSupabase:', err);
    return { success: false, error: err?.message || 'Error uploading image to Supabase' };
  }
}



export function getLocalTransactions(userId?: string): WalletTransaction[] {
  if (userId) return _txCache.filter(t => t.user_id === userId);
  return _txCache;
}

export async function saveLocalTransaction(tx: WalletTransaction) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('wallet_transactions').insert([tx]);
  }
}

export function getLocalProfile(userId?: string): UserProfile | null {
  if (userId) return _profilesCache.find(p => p.id === userId) || null;
  return _profilesCache.find(p => p.id === 'current_user_id') || null; // Simplified, in app userProfile is passed or activeProfile is used
}

export async function saveLocalProfile(profile: UserProfile) {
  if (isSupabaseConfigured() && supabase) {
    const payload: Record<string, any> = {
      username: profile.username,
      pubg_name: profile.pubg_id_name || '',
      pubg_id: profile.pubg_id_number || '',
      wallet_balance: profile.wallet_balance ?? 0,
      total_kills: profile.total_kills ?? 0,
      matches_played: profile.total_matches ?? 0,
      total_wins: profile.total_wins ?? 0,
      total_losses: profile.total_losses ?? 0,
      matches_lost: profile.matches_lost ?? 0,
      is_banned: Boolean(profile.is_banned),
      is_admin: Boolean(profile.is_admin)
    };
    if (profile.name) payload.name = profile.name;
    if (profile.avatar_url) payload.avatar_url = profile.avatar_url;
    if (profile.last_seen) payload.last_seen = profile.last_seen;
    if (profile.ban_expires_at !== undefined) payload.banned_until = profile.ban_expires_at;
    if (profile.ban_reason !== undefined) payload.ban_reason = profile.ban_reason;

    const { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    if (error) {
      console.warn("saveLocalProfile DB update warning:", error.message);
    }
  }
}

export function getAllProfiles(): UserProfile[] {
  return _profilesCache.map((p) => ({
    ...p,
    total_matches: Number((p as any).matches_played ?? p.total_matches ?? 0),
    matches_played: Number((p as any).matches_played ?? p.total_matches ?? 0),
    total_earnings: Number((p as any).total_earnings ?? 0)
  }));
}

export async function saveAllProfiles(profiles: UserProfile[]) {
  if (isSupabaseConfigured() && supabase) {
    for (const p of profiles) {
      await saveLocalProfile(p);
    }
  }
}

export async function updateUserPresence(userId: string) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);
  }
}

export async function saveLocalBooking(booking: SlotBooking) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('slot_bookings').upsert([booking]);
  }
}

export async function removeLocalBooking(matchId: string, slotNumber: number) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('slot_bookings').delete().eq('match_id', matchId).eq('slot_number', slotNumber);
  }
}

export async function adminSaveSlotBooking(booking: SlotBooking) {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('slot_bookings').delete().eq('match_id', booking.match_id).eq('slot_number', booking.slot_number);
      const payload: any = {
        match_id: booking.match_id,
        slot_number: booking.slot_number,
        player_ign: booking.player_ign,
        player_uid: booking.player_uid || null,
        team_name: booking.team_name || null,
        status: booking.status || 'confirmed',
        user_id: booking.user_id || null,
        player_id: booking.player_id || null,
        paid_amount: booking.paid_amount || 0,
        is_admin_booked: Boolean(booking.is_admin_booked),
        booking_time: booking.booking_time || new Date().toISOString()
      };
      await supabase.from('slot_bookings').insert([payload]);
    } catch (e) {
      console.warn('adminSaveSlotBooking exception:', e);
    }
  }
}

export async function removeAllMatchBookings(matchId: string) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('slot_bookings').delete().eq('match_id', matchId);
  }
}

// --- CACHE LAYER ---
export let _matchesCache: Match[] = [];
export let _profilesCache: UserProfile[] = [];
export let _bookingsCache: SlotBooking[] = [];
export let _txCache: WalletTransaction[] = [];
export let _bansCache: BanRecord[] = [];
export let _announcementsCache: Announcement[] = [];
export let _liveStreamsCache: LiveStream[] = [];
export let _chatCache: ChatMessage[] = [];

export async function fetchAllData() {
  if (isSupabaseConfigured() && supabase) {
    let matchesRes = await supabase.from('matches').select('*').order('created_at', { ascending: false });
    if (matchesRes.error) {
      console.warn('fetchAllData: order by created_at failed, trying timestamp:', matchesRes.error);
      matchesRes = await supabase.from('matches').select('*').order('timestamp', { ascending: false });
      if (matchesRes.error) {
        console.warn('fetchAllData: order by timestamp failed, trying unordered select:', matchesRes.error);
        matchesRes = await supabase.from('matches').select('*');
      }
    }

    const [profs, bookings, tx, bans, ann, streams, chat, resultsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('slot_bookings').select('*'),
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('bans').select('*'),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('live_streams').select('*').order('created_at', { ascending: false }),
      supabase.from('chat_messages').select('*').order('created_at', { ascending: false }),
      supabase.from('match_results').select('*').order('published_at', { ascending: false })
    ]);
    
    if (matchesRes.data) _matchesCache = matchesRes.data;
    if (profs.data) _profilesCache = profs.data;
    if (bookings.data) _bookingsCache = bookings.data;
    if (tx.data) _txCache = tx.data;
    if (bans.data) _bansCache = bans.data;
    if (ann.data) _announcementsCache = ann.data;
    if (streams.data) _liveStreamsCache = streams.data;
    if (chat.data) _chatCache = chat.data;
    if (resultsRes.data) _matchResultsCache = resultsRes.data;
  }
}

export async function fetchMatchesAndBookingsFromSupabase(): Promise<{ matches: Match[], bookings: SlotBooking[] }> {
  if (isSupabaseConfigured() && supabase) {
    try {
      let matchesRes = await supabase.from('matches').select('*').order('created_at', { ascending: false });
      if (matchesRes.error) {
        console.warn('fetchMatchesAndBookingsFromSupabase: order by created_at failed, trying timestamp:', matchesRes.error);
        matchesRes = await supabase.from('matches').select('*').order('timestamp', { ascending: false });
        if (matchesRes.error) {
          console.warn('fetchMatchesAndBookingsFromSupabase: order by timestamp failed, trying unordered select:', matchesRes.error);
          matchesRes = await supabase.from('matches').select('*');
        }
      }

      const bookingsRes = await supabase.from('slot_bookings').select('*');

      if (matchesRes.data) {
        _matchesCache = matchesRes.data;
      }
      if (bookingsRes.data) {
        _bookingsCache = bookingsRes.data;
      }
    } catch (e) {
      console.warn('fetchMatchesAndBookingsFromSupabase error:', e);
    }
  }
  return {
    matches: _matchesCache,
    bookings: _bookingsCache
  };
}
