import React from 'react';
import { Lock, Unlock, Check, Trash2, Plus, User, Crown, Shield } from 'lucide-react';
import { SlotBooking, UserProfile } from '../types';
import { getAllProfiles } from '../lib/supabase';

export interface PubgSeatGridProps {
  /** Mode of the grid */
  mode: 'player_select' | 'admin_manager' | 'admin_lock' | 'read_only';
  /** Squad type: 'SOLO' | 'DUO' | 'SQUAD' or match type */
  squadType?: string;
  /** Match type from match object (fallback if squadType not explicit) */
  matchType?: string;
  /** Maximum total slots (e.g. 50, 100) */
  maxSlots: number;
  /** Array of locked slot numbers */
  lockedSlots?: number[];
  /** Array of existing slot bookings */
  bookings?: SlotBooking[];
  /** Array of currently selected slot numbers (in player_select mode) */
  selectedSlots?: number[];
  /** Callback when a slot box is clicked */
  onSlotClick?: (slotNum: number) => void;
  /** Current logged in user ID to highlight user's own booked slot */
  currentUserId?: string;
  /** Admin callback: Trigger manual assignment on empty slot */
  onAdminAssignSlot?: (slotNum: number) => void;
  /** Admin callback: Trigger deletion of a booked slot */
  onAdminDeleteSlot?: (slotNum: number) => void;
  /** Admin callback: Toggle lock for an entire team */
  onToggleTeamLock?: (slotsInTeam: number[]) => void;
  /** Currently editing slot number in admin mode */
  editingSlotNum?: number | null;
  /** All user profiles for resolving @username */
  allProfiles?: UserProfile[];
}

export const PubgSeatGrid: React.FC<PubgSeatGridProps> = ({
  mode,
  squadType,
  matchType,
  maxSlots = 100,
  lockedSlots = [],
  bookings = [],
  selectedSlots = [],
  onSlotClick,
  currentUserId,
  onAdminAssignSlot,
  onAdminDeleteSlot,
  onToggleTeamLock,
  editingSlotNum,
  allProfiles = [],
}) => {
  // Normalize match type to SOLO, DUO, or SQUAD
  const rawType = (squadType || matchType || 'SQUAD').toUpperCase();
  const isSolo = rawType === 'SOLO';
  const isDuo = rawType === 'DUO';
  const teamSize = isSolo ? 1 : isDuo ? 2 : 4;

  const lockedSet = new Set(lockedSlots);
  const selectedSet = new Set(selectedSlots);

  // Group bookings by slot_number for O(1) lookup
  const bookingMap = React.useMemo(() => {
    const map = new Map<number, SlotBooking>();
    for (const b of bookings) {
      if (b.slot_number) {
        map.set(b.slot_number, b);
      }
    }
    return map;
  }, [bookings]);

  // Helper to resolve player display details
  const getPlayerDisplay = (slotNum: number) => {
    const booking = bookingMap.get(slotNum);
    if (!booking) return null;

    let matchedUsername = '';
    let matchedPubgName = '';
    let matchedProfile: UserProfile | null = null;

    const profilesList = (allProfiles && allProfiles.length > 0) ? allProfiles : getAllProfiles();

    if (profilesList && profilesList.length > 0) {
      const cleanIgn = booking.player_ign?.trim().toLowerCase();
      const cleanUid = booking.player_uid?.trim();
      const targetUserId = booking.player_id || booking.user_id;

      const prof = profilesList.find((p) => {
        if (targetUserId && p.id === targetUserId) return true;
        if (booking.player_id && p.id === booking.player_id) return true;
        if (booking.user_id && p.id === booking.user_id) return true;

        if (cleanUid && p.pubg_id_number && String(p.pubg_id_number).trim() === cleanUid) return true;

        if (cleanIgn) {
          if (p.pubg_id_name && p.pubg_id_name.trim().toLowerCase() === cleanIgn) return true;
          if (p.pubg_name && p.pubg_name.trim().toLowerCase() === cleanIgn) return true;
          if (p.username && p.username.trim().toLowerCase() === cleanIgn) return true;
        }
        return false;
      });

      if (prof) {
        matchedProfile = prof;
        if (prof.username) {
          const u = prof.username.trim();
          matchedUsername = u.startsWith('@') ? u : `@${u}`;
        }
        if (prof.pubg_name) {
          matchedPubgName = prof.pubg_name.trim();
        } else if (prof.pubg_id_name) {
          matchedPubgName = prof.pubg_id_name.trim();
        }
      }
    }

    const isOwnBooking =
      Boolean(currentUserId) &&
      (booking.user_id === currentUserId || booking.player_id === currentUserId);

    // 1. TOP (main title): full PUBG name / IGN (Use booking.player_ign OR profile.pubg_name)
    const fullPubgName = booking.player_ign || matchedPubgName || matchedProfile?.name || 'Player';

    return {
      ign: fullPubgName,
      teamName: booking.team_name,
      uid: booking.player_uid,
      username: matchedUsername,
      isOwn: isOwnBooking,
      booking,
      profile: matchedProfile
    };
  };

  // Render a single PUBG-style slot square
  const renderSlotBox = (slotNum: number, teamSlotIndex: number = 0) => {
    const isLocked = lockedSet.has(slotNum);
    const isSelected = selectedSet.has(slotNum);
    const playerData = getPlayerDisplay(slotNum);
    const isOccupied = Boolean(playerData);
    const isEditing = editingSlotNum === slotNum;
    const isFirstSlotInTeam = teamSlotIndex === 0 && teamSize > 1;

    // Determine interactivity & click action
    let isClickable = false;
    let clickHandler: (() => void) | undefined;

    if (mode === 'admin_lock') {
      isClickable = true;
      clickHandler = () => onSlotClick?.(slotNum);
    } else if (mode === 'player_select') {
      if (!isLocked && !isOccupied) {
        isClickable = true;
        clickHandler = () => onSlotClick?.(slotNum);
      }
    } else if (mode === 'admin_manager') {
      if (!isOccupied && !isLocked) {
        isClickable = true;
        clickHandler = () => {
          if (onAdminAssignSlot) {
            onAdminAssignSlot(slotNum);
          } else {
            onSlotClick?.(slotNum);
          }
        };
      }
    }

    // PUBG Silhouette SVG Component
    const Silhouette = () => (
      <svg
        viewBox="0 0 24 24"
        className="w-7 h-7 sm:w-8 sm:h-8 text-gray-500/70 group-hover:text-[#00e5ff]/70 transition-colors pointer-events-none fill-current"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    );

    // 1. LOCKED SLOT
    if (isLocked) {
      const lockCardClass =
        mode === 'admin_lock'
          ? 'bg-red-950/40 border-red-500 text-red-300 hover:bg-red-900/50 cursor-pointer shadow-sm shadow-red-500/20'
          : 'bg-[#080d16]/90 border-gray-800/80 text-gray-500 cursor-not-allowed opacity-75';

      return (
        <div
          key={slotNum}
          onClick={mode === 'admin_lock' ? clickHandler : undefined}
          title={mode === 'admin_lock' ? `Slot #${slotNum} (Locked - Click to Unlock)` : `Slot #${slotNum} (Locked by Host)`}
          className={`relative aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-between transition-all select-none group ${lockCardClass}`}
        >
          {/* Top Row: Slot Number Badge */}
          <div className="w-full flex items-center justify-between text-[9px] font-mono leading-none">
            <span className="font-bold opacity-80">#{slotNum}</span>
            <span className="text-[8px] font-black uppercase text-red-400 bg-red-950/80 px-1 py-0.2 rounded border border-red-500/30">
              LOCK
            </span>
          </div>

          {/* Center: PUBG Lock Emblem */}
          <div className="flex flex-col items-center justify-center my-auto">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-inner">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Bottom text */}
          <span className="text-[8px] font-bold text-red-400/90 uppercase tracking-tighter truncate max-w-full">
            {mode === 'admin_lock' ? 'Click Unlock' : 'Locked'}
          </span>
        </div>
      );
    }

    // 2. BOOKED / OCCUPIED SLOT
    if (isOccupied && playerData) {
      const isCurrentPlayer = playerData.isOwn;

      return (
        <div
          key={slotNum}
          className={`relative rounded-lg border p-1.5 flex flex-col items-center justify-between transition-all select-none overflow-hidden min-h-[110px] ${
            isCurrentPlayer
              ? 'bg-gradient-to-b from-[#0a2744] to-[#041424] border-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.35)] ring-1 ring-[#00e5ff]/50'
              : 'bg-[#08182b] border-[#00e5ff]/30 hover:border-[#00e5ff]/60'
          }`}
          title={`Slot #${slotNum} — ${playerData.ign}${playerData.username ? ` (${playerData.username})` : ''}${playerData.teamName ? ` [${playerData.teamName}]` : ''}`}
        >
          {/* Top Bar: Slot # + Badges + Admin Trash Icon */}
          <div className="w-full flex items-center justify-between text-[9px] font-mono leading-none z-10 mb-0.5">
            <span className="font-extrabold text-[#00e5ff]">#{slotNum}</span>
            <div className="flex items-center gap-1">
              {isFirstSlotInTeam && (
                <span title="Team Leader Slot" className="bg-amber-500/20 text-amber-300 p-0.5 rounded border border-amber-500/30">
                  <Crown className="w-2.5 h-2.5 fill-amber-400" />
                </span>
              )}
              {isCurrentPlayer && (
                <span className="text-[7px] font-black text-black bg-[#00e5ff] px-1 rounded uppercase tracking-tighter">
                  YOU
                </span>
              )}
              {mode === 'admin_manager' && onAdminDeleteSlot && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdminDeleteSlot(slotNum);
                  }}
                  className="text-red-400 hover:text-white hover:bg-red-600/80 p-0.5 rounded transition-all cursor-pointer"
                  title="Remove Player from Slot"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Center: Full Player Identity Display */}
          <div className="flex flex-col items-center justify-center my-auto w-full px-0.5 text-center z-10 min-w-0 space-y-0.5">
            {/* Avatar Badge */}
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-tr from-[#00558f] to-[#00a2ff] border border-[#00e5ff]/40 flex items-center justify-center text-white text-[9px] font-black shadow-sm shrink-0">
              {playerData.ign.charAt(0).toUpperCase()}
            </div>

            {/* Line 1 (TOP): Full PUBG Name / IGN (Allow 2 lines or wider text, no aggressive over-truncation) */}
            <p className="text-[10px] sm:text-[11px] font-black text-white text-center leading-tight break-words line-clamp-2 max-h-[2.4em] w-full drop-shadow-sm px-0.5">
              {playerData.ign}
            </p>

            {/* Line 2: @username when available */}
            {playerData.username ? (
              <p className="text-[8.5px] sm:text-[9px] text-emerald-400 font-mono text-center truncate w-full leading-tight font-bold">
                {playerData.username}
              </p>
            ) : null}

            {/* Line 3: Team Name (optional small secondary line) */}
            {playerData.teamName ? (
              <p className="text-[8px] text-gray-400 font-medium text-center truncate w-full leading-tight">
                {playerData.teamName}
              </p>
            ) : null}
          </div>

          {/* Bottom Bar: Status in non-admin mode */}
          {mode !== 'admin_manager' && (
            <div className="w-full flex items-center justify-end text-[8px] z-10 pt-0.5 border-t border-gray-800/80">
              <span className="text-emerald-400 font-bold">✓ Booked</span>
            </div>
          )}
        </div>
      );
    }

    // 3. SELECTED SLOT (Active selection in progress)
    if (isSelected) {
      return (
        <button
          key={slotNum}
          type="button"
          onClick={clickHandler}
          className="relative aspect-square rounded-lg border-2 border-[#00e5ff] bg-gradient-to-b from-[#00e5ff]/25 to-[#0088ff]/15 p-1.5 flex flex-col items-center justify-between shadow-[0_0_16px_rgba(0,229,255,0.55)] ring-1 ring-white/30 transition-all scale-[1.02] cursor-pointer group select-none text-left"
          title={`Slot #${slotNum} (Selected - Click to unselect)`}
        >
          {/* Top Bar */}
          <div className="w-full flex items-center justify-between text-[9px] font-mono leading-none">
            <span className="font-black text-[#00e5ff]">#{slotNum}</span>
            <span className="text-[8px] font-black bg-[#00e5ff] text-black px-1 rounded uppercase">
              SELECTED
            </span>
          </div>

          {/* Center: Glowing Checkmark */}
          <div className="flex flex-col items-center justify-center my-auto">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#00e5ff] text-[#030a16] flex items-center justify-center font-black shadow-lg shadow-[#00e5ff]/40 animate-pulse">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </div>

          {/* Bottom */}
          <span className="text-[8px] font-black text-[#00e5ff] uppercase tracking-wider text-center w-full">
            READY
          </span>
        </button>
      );
    }

    // 4. EMPTY UNLOCKED SLOT (PUBG Silhouette Box)
    const isClickableState = isClickable;
    const boxCursor = isClickableState ? 'cursor-pointer hover:border-[#00e5ff] hover:bg-[#00e5ff]/5 hover:shadow-[0_0_10px_rgba(0,229,255,0.25)]' : 'cursor-default';

    return (
      <button
        key={slotNum}
        type="button"
        disabled={!isClickableState}
        onClick={clickHandler}
        className={`relative aspect-square rounded-lg border border-gray-700/70 bg-[#071322]/80 p-1.5 flex flex-col items-center justify-between transition-all group select-none ${boxCursor} ${
          isEditing ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/40' : ''
        }`}
        title={
          mode === 'admin_lock'
            ? `Slot #${slotNum} (Open - Click to Lock)`
            : mode === 'admin_manager'
            ? `Slot #${slotNum} (Empty - Click to Assign Player)`
            : `Slot #${slotNum} (Available - Click to Select)`
        }
      >
        {/* Top Bar */}
        <div className="w-full flex items-center justify-between text-[9px] font-mono leading-none">
          <span className="font-bold text-gray-400 group-hover:text-gray-200">#{slotNum}</span>
          {mode === 'admin_manager' && (
            <span className="text-[8px] font-bold text-[#00e5ff] opacity-0 group-hover:opacity-100 transition-opacity">
              + Assign
            </span>
          )}
        </div>

        {/* Center: PUBG Bust Silhouette */}
        <div className="flex flex-col items-center justify-center my-auto">
          <Silhouette />
        </div>

        {/* Bottom */}
        <span className="text-[8px] font-bold text-emerald-400/80 group-hover:text-emerald-300 uppercase tracking-tighter">
          {mode === 'admin_lock' ? 'Open' : mode === 'admin_manager' ? '+ Assign' : 'Available'}
        </span>
      </button>
    );
  };

  // ==========================================
  // 1. SOLO VIEW: Numbered slots only (No Team headers)
  // ==========================================
  if (isSolo) {
    const slotsArray = Array.from({ length: maxSlots }, (_, i) => i + 1);

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          {slotsArray.map((slotNum) => renderSlotBox(slotNum, 0))}
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. DUO & SQUAD VIEW: Grouped by Team Cards
  // ==========================================
  const numTeams = Math.ceil(maxSlots / teamSize);
  const teams = Array.from({ length: numTeams }, (_, t) => {
    const teamNum = t + 1;
    const startSlot = t * teamSize + 1;
    const endSlot = Math.min((t + 1) * teamSize, maxSlots);
    const slotsInTeam = Array.from({ length: endSlot - startSlot + 1 }, (_, i) => startSlot + i);
    return { teamNum, startSlot, endSlot, slotsInTeam };
  });

  return (
    <div
      className={`grid ${
        teamSize === 2
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 md:grid-cols-2'
      } gap-2.5`}
    >
      {teams.map(({ teamNum, startSlot, endSlot, slotsInTeam }) => {
        const bookedCount = slotsInTeam.filter((s) => bookingMap.has(s)).length;
        const lockedCount = slotsInTeam.filter((s) => lockedSet.has(s)).length;
        const totalInTeam = slotsInTeam.length;
        const isFull = bookedCount + lockedCount >= totalInTeam;
        const allLocked = lockedCount === totalInTeam;

        const hasUserBooking =
          Boolean(currentUserId) &&
          slotsInTeam.some((s) => {
            const b = bookingMap.get(s);
            return b && (b.user_id === currentUserId || b.player_id === currentUserId);
          });

        return (
          <div
            key={teamNum}
            className={`rounded-xl border transition-all overflow-hidden ${
              hasUserBooking
                ? 'bg-[#04101e] border-[#00e5ff]/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                : 'bg-[#030c18] border-gray-800/90 hover:border-gray-700/80'
            }`}
          >
            {/* PUBG Muted Team Header Bar */}
            <div className="bg-[#0b1b2d] px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-white tracking-wider uppercase">
                  TEAM {teamNum}
                </span>
                <span className="text-[9px] font-mono text-gray-400">
                  (Slots #{startSlot} - #{endSlot})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Admin Mode: Lock/Unlock Entire Team shortcut */}
                {mode === 'admin_lock' && onToggleTeamLock && (
                  <button
                    type="button"
                    onClick={() => onToggleTeamLock(slotsInTeam)}
                    className="text-[9px] font-bold text-amber-400 hover:text-white px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/30 border border-amber-500/20 cursor-pointer"
                  >
                    {allLocked ? 'Unlock Team' : 'Lock Team'}
                  </button>
                )}

                {/* Team Status Badge */}
                {allLocked ? (
                  <span className="text-[8px] font-black text-red-400 bg-red-950/70 border border-red-500/30 px-1.5 py-0.2 rounded uppercase">
                    LOCKED
                  </span>
                ) : isFull ? (
                  <span className="text-[8px] font-black text-gray-400 bg-gray-900 border border-gray-700 px-1.5 py-0.2 rounded uppercase">
                    FULL
                  </span>
                ) : (
                  <span className="text-[8px] font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded uppercase">
                    {totalInTeam - bookedCount - lockedCount} OPEN
                  </span>
                )}
              </div>
            </div>

            {/* Team Slots Row: exactly 2 slots (DUO) or 4 slots (SQUAD) */}
            <div
              className={`p-2 grid ${
                teamSize === 2 ? 'grid-cols-2' : 'grid-cols-4'
              } gap-1.5`}
            >
              {slotsInTeam.map((slotNum, idx) => renderSlotBox(slotNum, idx))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
