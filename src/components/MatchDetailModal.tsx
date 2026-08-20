import React, { useState, useRef } from 'react';
import { Match, SlotBooking, UserProfile } from '../types';
import { X, Trophy, ShieldAlert, KeyRound, Copy, Check, Users, Clock, AlertTriangle, Crosshair, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { supabase, isSupabaseConfigured, getMatchBookings } from '../lib/supabase';
import { useSmartLoading } from '../context/LoadingContext';
import { PubgSeatGrid } from './PubgSeatGrid';

interface MatchDetailModalProps {
  match: Match | null;
  onClose: () => void;
  userProfile: UserProfile | null;
  userBookings: SlotBooking[];
  onBookSlot: (booking: {
    matchId: string;
    slotNumber: number;
    slotNumbers?: number[];
    teamName: string;
    playerIgn: string;
    playerUid: string;
    teammateUids: string[];
    teammateProfileIds?: string[];
    entryFee: number;
  }) => void;
  onOpenDeposit: () => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  onClose,
  userProfile,
  userBookings,
  onBookSlot,
  onOpenDeposit
}) => {
  const { executeTask, isTaskLoading } = useSmartLoading();
  const [now, setNow] = useState<number>(Date.now());
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const selectedSlot = (selectedSlots || [])[0] || 1;
  const [teamName, setTeamName] = useState<string>((userBookings || [])[0]?.team_name || '');
  const [bookingStep, setBookingStep] = useState<1 | 2>(1);
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [bookingMethod, setBookingMethod] = useState<'username' | 'pubg_id'>('username');
  const [inputUsernames, setInputUsernames] = useState<string[]>([
    userProfile?.username || '',
    '',
    '',
    ''
  ]);
  const [inputPubgNames, setInputPubgNames] = useState<string[]>([
    userProfile?.pubg_id_name || '',
    '',
    '',
    ''
  ]);
  const [loading, setLoading] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string>('');
  const [bookingSuccess, setBookingSuccess] = useState<{
    teamName: string;
    slotNo: string;
    totalDeducted: number;
    maps: string[];
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'details' | 'slots' | 'rules'>('details');
  const [matchBookings, setMatchBookings] = useState<SlotBooking[]>([]);

  // EFFECTS AND TIMERS
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClose = () => {
    setBookingSuccess(null);
    setBookingStep(1);
    setBookingError('');
    setSelectedSlots(userBookings.map(b => b.slot_number));
    onClose();
  };

  React.useEffect(() => {
    if (!match) return;

    setBookingSuccess(null);
    setBookingError('');
    if (userBookings && userBookings.length > 0) {
      setSelectedSlots(userBookings.map(b => b.slot_number));
    }

    const loadMatchBookings = () => {
      if (isSupabaseConfigured() && supabase) {
        supabase.from('slot_bookings')
          .select('*')
          .eq('match_id', match.id)
          .then(({ data, error }) => {
            if (data && !error) {
              const confirmed = data.filter((b: any) => b.status === 'confirmed' || b.status == null || b.status === '');
              setMatchBookings(confirmed);
            } else {
              setMatchBookings(getMatchBookings(match.id));
            }
          });
      } else {
        setMatchBookings(getMatchBookings(match.id));
      }
    };

    loadMatchBookings();

    let channel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        channel = supabase
          .channel(`modal_slot_bookings_${match.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'slot_bookings',
              filter: `match_id=eq.${match.id}`
            },
            () => {
              loadMatchBookings();
            }
          )
          .subscribe();
      } catch (err) {
        console.warn('Realtime match bookings error:', err);
      }
    }

    return () => {
      if (channel) {
        supabase?.removeChannel(channel);
      }
    };
  }, [match?.id, userBookings]);

  React.useEffect(() => {
    if (userProfile) {
      if (userProfile.username) {
        setInputUsernames((prev) => [userProfile.username, prev[1] || '', prev[2] || '', prev[3] || '']);
      }
      if (userProfile.pubg_id_name) {
        setInputPubgNames((prev) => [userProfile.pubg_id_name, prev[1] || '', prev[2] || '', prev[3] || '']);
      }
    }
  }, [userProfile]);

  const gridContainerRef = React.useRef<HTMLDivElement>(null);
  const bookingSubmittingRef = useRef<boolean>(false);

  React.useEffect(() => {
    if (activeSubTab === 'slots' && bookingStep === 2) {
      const timer = setTimeout(() => {
        if (gridContainerRef.current) {
          const firstFreeButton = gridContainerRef.current.querySelector('button:not(:disabled)') as HTMLButtonElement;
          if (firstFreeButton) {
            firstFreeButton.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeSubTab, bookingStep]);

  if (!match) return null;

  const startTimestamp =
    match.start_timestamp ||
    (typeof match.start_time === 'number'
      ? match.start_time
      : typeof match.start_time === 'string' && !isNaN(Date.parse(match.start_time))
      ? Date.parse(match.start_time)
      : match.timestamp) ||
    Date.now() + 3600000;

  const diff = startTimestamp - now;

  // Real-time based Match Status Calculation:
  // Match is ONLY ended if:
  // 1) Countdown / play window has expired (diff <= -30 * 60 * 1000)
  // 2) OR admin explicitly ended the match when scheduled time has arrived/passed (match.is_ended === true && diff <= 0)
  const isEnded =
    (diff <= -30 * 60 * 1000) ||
    (Boolean(match.is_ended) && diff <= 0);

  // Match ONLY starts when its scheduled countdown time expires (diff <= 0) or status is 'live'
  const isStarted =
    !isEnded &&
    (diff <= 0 || match.status === 'live');

  const lockedCount = Array.isArray(match.locked_slots) ? match.locked_slots.length : 0;
  const availableSlots = match.max_slots - lockedCount;

  const isFull = match.booked_slots >= availableSlots;

  const isAlreadyBooked = (userBookings || []).length > 0;

  const totalCost = match.entry_fee * (selectedSlots.length > 0 ? selectedSlots.length : playerCount);
  const hasEnoughBalance = (userProfile?.wallet_balance || 0) >= totalCost;

  const handleCopyKey = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const renderMultiMatchRoomBoxes = (matchItem: Match, isBooked: boolean) => {
    const mapsList = matchItem.maps && matchItem.maps.length > 0 
      ? matchItem.maps 
      : matchItem.type === 'tournament' ? ['Erangel', 'Miramar', 'Rondo'] : [matchItem.map];

    if (!isBooked) {
      return (
        <div className="p-3.5 rounded-xl bg-[#07192e]/60 border border-amber-500/30 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-amber-400 font-bold text-xs">
            <KeyRound className="w-4 h-4" />
            <span>ROOM CREDENTIALS LOCKED</span>
          </div>
          <p className="text-[11px] text-gray-300">
            Book a slot in this tournament to unlock real-time Room ID & Password access.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {mapsList.map((mapName, idx) => {
          const cred = matchItem.room_credentials?.[idx];
          let roomId = cred?.room_id;
          let roomPass = cred?.room_password;
          const releaseTimeMs = cred?.release_time_ms;

          if (idx === 0 && !roomId && matchItem.room_id) {
            roomId = matchItem.room_id;
            roomPass = matchItem.room_password;
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
              className={`p-3.5 rounded-xl border transition-all ${
                isPublished
                  ? 'bg-gradient-to-r from-emerald-950/60 via-[#07192e] to-emerald-950/60 border-emerald-500/50 shadow-lg'
                  : isWaitingTimer
                  ? 'bg-gradient-to-r from-amber-950/40 via-[#07192e] to-amber-950/40 border-amber-500/50'
                  : 'bg-[#020710] border-gray-800'
              }`}
            >
              {/* Box Title Header */}
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-[#00e5ff] uppercase tracking-wider bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-[#00e5ff]/30">
                  MATCH #{idx + 1} &bull; MAP: {mapName.toUpperCase()}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                  isPublished
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                    : isWaitingTimer
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {isPublished ? '● ROOM REVEALED' : isWaitingTimer ? `🔒 UNLOCKS IN ${timerDisplay}` : '🔒 AWAITING RELEASE'}
                </span>
              </div>

              {/* Content Body */}
              {isPublished ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {/* Room ID Box */}
                  <div className="p-2.5 rounded-lg bg-[#020710] border border-emerald-500/30 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">ROOM ID</p>
                      <p className="text-sm font-black text-white">{roomId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(roomId || '', `${idx}-id`)}
                      className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold flex items-center gap-1 border border-emerald-500/30"
                    >
                      {copiedKey === `${idx}-id` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Room Password Box */}
                  <div className="p-2.5 rounded-lg bg-[#020710] border border-emerald-500/30 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">PASSWORD</p>
                      <p className="text-sm font-black text-white">{roomPass || 'N/A'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(roomPass || '', `${idx}-pass`)}
                      className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold flex items-center gap-1 border border-emerald-500/30"
                    >
                      {copiedKey === `${idx}-pass` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ) : isWaitingTimer ? (
                <div className="p-2.5 rounded-lg bg-[#020710] border border-amber-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                    <div>
                      <p className="text-xs font-bold text-amber-300">Room Credentials Set by Host</p>
                      <p className="text-[10px] text-gray-400">Timer active. Credentials unlock automatically in <strong className="text-[#00e5ff] font-mono">{timerDisplay}</strong>.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1">
                  Room ID & Password for Match #{idx + 1} ({mapName}) will be released by host prior to start.
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleInputChange = (index: number, value: string, method: 'username' | 'pubg_id') => {
    if (method === 'username') {
      const updated = [...inputUsernames];
      updated[index] = value;
      setInputUsernames(updated);
    } else {
      const updated = [...inputPubgNames];
      updated[index] = value;
      setInputPubgNames(updated);
    }
  };

  const squadType = (match.squad_type || 'SQUAD').toUpperCase();
  const isWow = match.type === 'wow';
  const isTdm = match.type === 'tdm';
  const isWowOrTdm = isWow || isTdm;
  const maxAllowedSlots = (isWowOrTdm || squadType === 'SQUAD') ? 4 : squadType === 'DUO' ? 2 : 1;

  const handleSlotClick = (slotNum: number) => {
    if (match?.locked_slots?.includes(slotNum)) {
      alert(`Slot #${slotNum} is locked and cannot be booked.`);
      return;
    }
    const isOccupied = matchBookings.some((b) => b.slot_number === slotNum);
    if (isOccupied) return;

    let updated: number[];
    if (selectedSlots.includes(slotNum)) {
      updated = selectedSlots.filter(s => s !== slotNum);
    } else {
      if (selectedSlots.length === 0) {
        const teamSize = squadType === 'SOLO' ? 1 : squadType === 'DUO' ? 2 : 4;
        const teamIndex = Math.floor((slotNum - 1) / teamSize);
        const teamStart = teamIndex * teamSize + 1;
        const teamEnd = Math.min(teamStart + teamSize - 1, match.max_slots);

        const availableInTeam: number[] = [];
        for (let s = teamStart; s <= teamEnd; s++) {
          const locked = match.locked_slots?.includes(s);
          const occupied = matchBookings.some((b) => b.slot_number === s);
          if (!locked && !occupied) {
            availableInTeam.push(s);
          }
        }

        const targetCount = Math.min(playerCount || 1, maxAllowedSlots);
        if (availableInTeam.includes(slotNum) && availableInTeam.length > 1 && targetCount > 1) {
          updated = availableInTeam.slice(0, targetCount).sort((a, b) => a - b);
        } else {
          updated = [slotNum];
        }
      } else {
        const limit = maxAllowedSlots;
        if (selectedSlots.length < limit) {
          updated = [...selectedSlots, slotNum].sort((a, b) => a - b);
        } else {
          if (limit === 1) {
            updated = [slotNum];
          } else {
            updated = [...selectedSlots.slice(1), slotNum].sort((a, b) => a - b);
          }
        }
      }
    }

    setSelectedSlots(updated);
    if (updated.length > 0) {
      setPlayerCount(updated.length);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (bookingSubmittingRef.current || loading) return;

    bookingSubmittingRef.current = true;
    setBookingError('');
    setLoading(true);

    try {
      await executeTask(`slot_booking_${match.id}`, async () => {
        if (isEnded) {
          throw new Error('MATCH HAS ENDED 🏁 - Booking is closed.');
        }
        if (isStarted) {
          throw new Error('MATCH HAS STARTED 🔴 - Booking is closed.');
        }
        if (isFull && !isAlreadyBooked) {
          throw new Error('MATCH FULL 🔒 - All slots are currently taken.');
        }

        if (selectedSlots.length === 0) {
          throw new Error('Please highlight at least one slot in the grid above to book.');
        }

        // 1. Balance Check
        if ((userProfile?.wallet_balance || 0) < totalCost) {
          throw new Error(`Insufficient Balance! Requires RS. ${totalCost} in your wallet.`);
        }

        // 2. Validate Usernames / PUBG IDs based on selected count & resolve saved PUBG ID Names
        const resolvedPubgNames: string[] = [];
        const resolvedProfileIds: string[] = [];

        if (bookingMethod === 'username') {
          for (let i = 0; i < selectedSlots.length; i++) {
            const uname = (inputUsernames[i] || '').trim();
            if (!uname) {
              throw new Error(`Enter Username for Player ${i + 1}`);
            }

            // Current logged-in user match
            if (
              userProfile &&
              userProfile.username?.toLowerCase().replace(/\s+/g, '') === uname.toLowerCase().replace(/\s+/g, '')
            ) {
              const currentRealName =
                (userProfile as any).pubg_name || userProfile.pubg_id_name || userProfile.name || userProfile.username;
              resolvedPubgNames.push(currentRealName);
              resolvedProfileIds.push(userProfile.id);
              continue;
            }

            if (!isSupabaseConfigured() || !supabase) {
              throw new Error('Database not connected');
            }

            // Case-insensitive search
            let foundUser: any = null;

            const { data: d1 } = await supabase
              .from('profiles')
              .select('id, username, pubg_name, name')
              .ilike('username', uname)
              .maybeSingle();

            if (d1) foundUser = d1;

            if (!foundUser) {
              const { data: all } = await supabase
                .from('profiles')
                .select('id, username, pubg_name, name');

              const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();
              foundUser = (all || []).find((p: any) => normalize(p.username) === normalize(uname)) || null;
            }

            if (!foundUser) {
              throw new Error(`This username "${uname}" is not valid. User is not registered on MVP ESPORTS.`);
            }

            // ALWAYS use real PUBG name from profile
            const realPubgName = foundUser.pubg_name || foundUser.name || foundUser.username;
            resolvedPubgNames.push(realPubgName);
            resolvedProfileIds.push(foundUser.id);
          }
        } else {
          for (let i = 0; i < selectedSlots.length; i++) {
            const pubgName = (inputPubgNames[i] || '').trim();
            if (!pubgName) {
              throw new Error(`Enter PUBG ID Name for Player ${i + 1}`);
            }
            resolvedPubgNames.push(pubgName);

            if (i === 0) {
              resolvedProfileIds.push(userProfile?.id || '');
            } else if (isSupabaseConfigured() && supabase) {
              const { data: foundUser } = await supabase
                .from('profiles')
                .select('id, pubg_name, name, username')
                .or(`pubg_name.ilike.${pubgName},name.ilike.${pubgName}`)
                .maybeSingle();
              resolvedProfileIds.push(foundUser?.id || userProfile?.id || '');
            } else {
              resolvedProfileIds.push(userProfile?.id || '');
            }
          }
        }

        // 3. Process Booking Calculation
        const assignedSlotNo = (selectedSlots || [])[0];
        const assignedTeamNo = Math.ceil(assignedSlotNo / 4);

        const mainPlayerIgn = (resolvedPubgNames || [])[0] || (userProfile as any)?.pubg_name || userProfile?.pubg_id_name || userProfile?.name || 'Player';
        const teammateUids = resolvedPubgNames.slice(1);
        const teammateProfileIds = resolvedProfileIds.slice(1);

        const calculatedTeamName = teamName || `Team ${assignedTeamNo} (${mainPlayerIgn})`;

        await onBookSlot({
          matchId: match.id,
          slotNumber: assignedSlotNo,
          slotNumbers: selectedSlots,
          teamName: calculatedTeamName,
          playerIgn: mainPlayerIgn,
          playerUid: userProfile?.pubg_id_number || '5164893012',
          teammateUids,
          teammateProfileIds,
          entryFee: totalCost
        });

        const matchMaps = match.maps && match.maps.length > 0 
          ? match.maps 
          : match.type === 'tournament' ? ['Erangel', 'Miramar', 'Rondo'] : [match.map];

        setBookingSuccess({
          teamName: calculatedTeamName,
          slotNo: `Slots [${selectedSlots.join(', ')}]`,
          totalDeducted: totalCost,
          maps: matchMaps
        });
      });
    } catch (err: any) {
      setBookingError(err.message || 'Booking failed. Please try again.');
    } finally {
      bookingSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 pt-12 z-50 w-full h-screen bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 lg:p-6 animate-in fade-in duration-200">

      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:rounded-2xl max-w-4xl mx-auto bg-[#040e1a] border border-[#00e5ff]/20 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header Bar */}
        <div className="p-3.5 bg-gradient-to-r from-[#07192e] to-[#030a16] border-b border-[#00e5ff]/20 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg bg-[#07192e] border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all shadow-inner"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
            </button>
            <div>
              <span className="text-[10px] font-extrabold text-[#00e5ff] tracking-widest uppercase">
                MATCH DETAILS & SLOT BOOKING
              </span>
              <h2 className="text-sm font-black text-white truncate max-w-[200px]">{match.title}</h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="flex border-b border-gray-800 bg-[#020710]">
          <button
            onClick={() => setActiveSubTab('details')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
              activeSubTab === 'details'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Match Specs
          </button>
          <button
            onClick={() => setActiveSubTab('slots')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
              activeSubTab === 'slots'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {isAlreadyBooked ? 'My Booked Slot' : `Book Slot (${match.booked_slots}/${availableSlots})`}
          </button>
          <button
            onClick={() => setActiveSubTab('rules')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
              activeSubTab === 'rules'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Rules & Regulations
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: DETAILS */}
          {activeSubTab === 'details' && (
            <div className="space-y-4">
              
              {/* Dynamic Multi-Match Room ID & Password Boxes */}
              <div>
                <h4 className="text-xs font-bold text-[#00e5ff] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#00e5ff]" />
                  ROOM ID & PASSWORD DETAILS
                </h4>
                {renderMultiMatchRoomBoxes(match, isAlreadyBooked)}
              </div>

              {/* Match Specs Summary Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-gray-800">
                  <span className="text-[10px] text-gray-400 block font-semibold">MAP & VERSION</span>
                  <span className="font-bold text-white text-sm">{match.map} ({isWow ? 'WOW' : isTdm ? 'TDM' : match.squad_type})</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-gray-800">
                  <span className="text-[10px] text-gray-400 block font-semibold">MATCH TIME</span>
                  <span className="font-bold text-[#00e5ff] text-xs">{match.match_time}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-gray-800">
                  <span className="text-[10px] text-gray-400 block font-semibold">ENTRY FEE</span>
                  <span className="font-bold text-white text-sm">RS. {match.entry_fee} / Player</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-gray-800">
                  <span className="text-[10px] text-gray-400 block font-semibold">TOTAL POOL</span>
                  <span className="font-bold text-emerald-400 text-sm">RS. {Number(match.prizes?.total_pool ?? match.entry_fee ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Full Prize Pool Distribution */}
              <div className="p-3.5 rounded-xl bg-[#020710] border border-gray-800">
                <h4 className="text-xs font-bold text-[#00e5ff] mb-2 flex items-center gap-1 uppercase tracking-wider">
                  <Trophy className="w-3.5 h-3.5" />
                  PRIZE POOL BREAKDOWN
                </h4>
                <div className="space-y-1.5 text-xs">
                  {/* 1st Place / Winner */}
                  {Boolean(match.prizes?.first_prize && match.prizes.first_prize > 0) && (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                      <span className="text-gray-300">
                        🥇 {Boolean((match.prizes?.second_prize && match.prizes.second_prize > 0) || (match.type === 'tournament' && match.prizes?.third_prize && match.prizes.third_prize > 0)) ? '1st Place (Winner)' : 'Winning Prize (1st Place)'}
                      </span>
                      <span className="font-black text-[#00e5ff]">RS. {match.prizes?.first_prize}</span>
                    </div>
                  )}

                  {/* 2nd Place - Strictly ONLY IF second_prize exists and > 0 */}
                  {Boolean(match.prizes?.second_prize && match.prizes.second_prize > 0) && (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                      <span className="text-gray-300">🥈 2nd Place</span>
                      <span className="font-bold text-white">RS. {match.prizes?.second_prize}</span>
                    </div>
                  )}

                  {/* 3rd Place - Strictly ONLY IF third_prize exists and > 0 and type is tournament */}
                  {Boolean(match.type === 'tournament' && match.prizes?.third_prize && match.prizes.third_prize > 0) && (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800/60">
                      <span className="text-gray-300">🥉 3rd Place</span>
                      <span className="font-bold text-gray-400">RS. {match.prizes?.third_prize}</span>
                    </div>
                  )}

                  {/* Per Official Kill - Strictly ONLY IF per_kill_prize exists and > 0 */}
                  {Boolean(match.prizes?.per_kill_prize && match.prizes.per_kill_prize > 0) && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Crosshair className="w-3.5 h-3.5" /> Per Official Kill
                      </span>
                      <span className="font-bold text-emerald-400">RS. {match.prizes?.per_kill_prize} / Kill</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SLOT SELECTION & FORM */}
          {activeSubTab === 'slots' && (
            <div className="space-y-4">
              {/* Show Room ID & Password if booked and published */}
              {isAlreadyBooked && (
                <div className="p-1 rounded-2xl bg-[#00e5ff]/5 border border-[#00e5ff]/20">
                   <div className="p-3">
                      <h4 className="text-[10px] font-black text-[#00e5ff] uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        ROOM CREDENTIALS UNLOCKED
                      </h4>
                      {renderMultiMatchRoomBoxes(match, true)}
                   </div>
                </div>
              )}

              {/* Show Booked Slots at the top if they exist, but DO NOT block new bookings */}
              {userBookings.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-b from-[#07192e] to-[#020710] border border-[#00e5ff]/40 space-y-3 shadow-lg mb-4">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                    <span className="text-xs font-black text-[#00e5ff] uppercase tracking-wider bg-[#00e5ff]/10 px-2.5 py-1 rounded-lg border border-[#00e5ff]/30">
                      {userBookings.length} SLOT{userBookings.length > 1 ? 'S' : ''} ALREADY BOOKED
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      ✓ PAID RS. {userBookings.reduce((sum, b) => sum + b.paid_amount, 0)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#020710] border border-gray-800">
                    <span className="text-[9px] text-gray-400 block font-semibold uppercase mb-2">My Booked Slots</span>
                    <div className="space-y-1.5">
                      {userBookings.map((booking, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-[#07192e] px-3 py-2 rounded-lg border border-gray-700">
                          <span className="text-gray-300 font-bold">• Slot #{booking.slot_number}</span>
                          <span className="text-[#00e5ff] font-extrabold">{booking.player_ign}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Wallet Balance Bar */}
              <div className="p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 flex justify-between items-center text-xs">
                <div>
                  <span className="text-gray-400 text-[10px] block font-medium">Your Wallet Balance:</span>
                  <span className="text-sm font-black text-[#00e5ff]">
                    RS. {(userProfile?.wallet_balance || 0).toLocaleString()}
                  </span>
                </div>
                {(userProfile?.wallet_balance || 0) < totalCost ? (
                  <button
                    type="button"
                    onClick={onOpenDeposit}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[11px] hover:bg-amber-500/30"
                  >
                    + Add RS. {totalCost - (userProfile?.wallet_balance || 0)}
                  </button>
                ) : (
                  <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                    ✓ Balance Available
                  </span>
                )}
              </div>

              {!isAlreadyBooked && (
                <>
                  {/* ERROR / SUCCESS MESSAGES */}
                  {bookingError && (
                    <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{bookingError}</span>
                    </div>
                  )}

                  {bookingSuccess ? (
                    /* SUCCESS RECEIPT VIEW */
                    <div className="text-center py-4 space-y-3 bg-[#020710] p-4 rounded-xl border border-green-500/30">
                      <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500 text-green-400 flex items-center justify-center mx-auto text-xl font-black shadow-lg shadow-green-500/20">
                        ✓
                      </div>
                      <h4 className="text-base font-black text-white">Slot Successfully Booked!</h4>
                      <p className="text-xs text-gray-300">
                        Team: <strong className="text-[#00e5ff]">{bookingSuccess.teamName}</strong> | {bookingSuccess.slotNo}
                      </p>
                      <p className="text-xs text-gray-300">
                        Total Deducted: <strong className="text-emerald-400">RS. {bookingSuccess.totalDeducted}</strong> ({playerCount} Player{playerCount > 1 ? 's' : ''})
                      </p>
                      
                      {/* Room ID Placeholder / Release Status Boxes */}
                      <div className="space-y-2 mt-3">
                        {bookingSuccess.maps.map((mapName, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-left">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">MAP {idx + 1} ({mapName.toUpperCase()}) ROOM DETAILS</p>
                            <p className="text-xs text-[#00e5ff] font-bold mt-0.5">Room ID & Pass: (Admin Will Release 15 mins before match)</p>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleClose}
                        className="w-full py-2.5 rounded-lg bg-[#00e5ff] text-[#030a16] font-bold text-xs mt-3 shadow-md shadow-[#00e5ff]/20 hover:brightness-110"
                      >
                        CLOSE & DONE
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* STEP 1: SELECT PLAYER COUNT BASED ON MATCH TYPE */}
                      {bookingStep === 1 && (
                        <div className="space-y-4">
                          <label className="text-xs font-bold text-gray-300 block">
                            How many players do you want to enter? {maxAllowedSlots > 1 ? `(Up to ${maxAllowedSlots} Players)` : ''}
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {/* Always Show Solo (1 Player) */}
                            <button
                              type="button"
                              onClick={() => {
                                setPlayerCount(1);
                                setBookingError('');
                              }}
                              className={`py-3 rounded-xl text-xs font-black border transition-all ${
                                playerCount === 1
                                  ? 'bg-[#00e5ff] text-[#030a16] border-[#00e5ff] shadow-md shadow-[#00e5ff]/20'
                                  : 'bg-[#07192e] text-gray-300 border-gray-700 hover:border-gray-500'
                              }`}
                            >
                              1 Player (Solo)
                            </button>

                            {/* Show Duo if Max Allowed >= 2 */}
                            {maxAllowedSlots >= 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPlayerCount(2);
                                  setBookingError('');
                                }}
                                className={`py-3 rounded-xl text-xs font-black border transition-all ${
                                  playerCount === 2
                                    ? 'bg-[#00e5ff] text-[#030a16] border-[#00e5ff] shadow-md shadow-[#00e5ff]/20'
                                    : 'bg-[#07192e] text-gray-300 border-gray-700 hover:border-gray-500'
                                }`}
                              >
                                2 Players (Duo)
                              </button>
                            )}

                            {/* Show Trio if Max Allowed >= 3 */}
                            {maxAllowedSlots >= 3 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPlayerCount(3);
                                  setBookingError('');
                                }}
                                className={`py-3 rounded-xl text-xs font-black border transition-all ${
                                  playerCount === 3
                                    ? 'bg-[#00e5ff] text-[#030a16] border-[#00e5ff] shadow-md shadow-[#00e5ff]/20'
                                    : 'bg-[#07192e] text-gray-300 border-gray-700 hover:border-gray-500'
                                }`}
                              >
                                3 Players (Trio)
                              </button>
                            )}

                            {/* Show Squad (4 Players) if Max Allowed >= 4 */}
                            {maxAllowedSlots >= 4 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPlayerCount(4);
                                  setBookingError('');
                                }}
                                className={`py-3 rounded-xl text-xs font-black border transition-all ${
                                  playerCount === 4
                                    ? 'bg-[#00e5ff] text-[#030a16] border-[#00e5ff] shadow-md shadow-[#00e5ff]/20'
                                    : 'bg-[#07192e] text-gray-300 border-gray-700 hover:border-gray-500'
                                }`}
                              >
                                4 Players (Squad / Team)
                              </button>
                            )}
                          </div>

                          <div className="p-3 bg-[#020710] rounded-xl border border-gray-800 text-xs flex justify-between items-center">
                            <span className="text-gray-400">Total Entry Fee:</span>
                            <span className="font-extrabold text-[#00e5ff]">RS. {totalCost}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setBookingError('');
                              setBookingStep(2);
                            }}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 active:scale-[0.98] transition-all"
                          >
                            PROCEED TO SLOTS & NAMES ➔
                          </button>
                        </div>
                      )}

                      {/* STEP 2: SELECT METHOD & ENTER NAMES */}
                      {bookingStep === 2 && (
                        <form onSubmit={handleConfirmBooking} className="space-y-3">
                          {/* METHOD SWITCH */}
                          <div className="flex gap-2 p-1 bg-[#020710] rounded-xl border border-gray-800">
                            <button
                              type="button"
                              onClick={() => {
                                setBookingMethod('username');
                                setBookingError('');
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                bookingMethod === 'username' ? 'bg-[#00e5ff] text-[#030a16]' : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              Slot with Username
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBookingMethod('pubg_id');
                                setBookingError('');
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                bookingMethod === 'pubg_id' ? 'bg-[#00e5ff] text-[#030a16]' : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              Slot with PUBG ID
                            </button>
                          </div>

                          {/* PUBG-STYLE SLOT SELECTION GRID */}
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <div>
                                <label className="text-[11px] font-bold text-gray-300 block">
                                  {squadType === 'SOLO'
                                    ? 'Select 1 Slot Box'
                                    : squadType === 'DUO'
                                    ? `Highlight up to ${playerCount} Slot${playerCount > 1 ? 's' : ''} (DUO Room)`
                                    : `Highlight up to ${playerCount} Slot${playerCount > 1 ? 's' : ''} (SQUAD Room)`}
                                </label>
                                <span className="text-[10px] text-gray-400">
                                  Match Type: <strong className="text-[#00e5ff]">{squadType}</strong>
                                </span>
                              </div>
                              {selectedSlots.length > 0 && (
                                <span className="text-[10px] text-[#00e5ff] font-extrabold bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-[#00e5ff]/30 animate-pulse">
                                  {selectedSlots.length} Selected
                                </span>
                              )}
                            </div>

                            <div
                              ref={gridContainerRef}
                              className="max-h-72 sm:max-h-80 overflow-y-auto p-2.5 bg-[#020710] rounded-xl border border-gray-800 space-y-2.5 custom-scrollbar"
                            >
                              <PubgSeatGrid
                                mode="player_select"
                                squadType={match.squad_type}
                                matchType={match.type}
                                maxSlots={match.max_slots}
                                lockedSlots={match.locked_slots}
                                bookings={matchBookings}
                                selectedSlots={selectedSlots}
                                onSlotClick={handleSlotClick}
                                currentUserId={userProfile?.id}
                              />
                            </div>
                          </div>

                          {/* TEAM NAME (OPTIONAL) */}
                          {playerCount > 1 && (
                            <div>
                              <label className="text-[10px] font-bold text-gray-300 mb-0.5 block">Team / Squad Name</label>
                              <input
                                type="text"
                                placeholder="e.g. MVP ELITE"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                className="w-full p-2 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                              />
                            </div>
                          )}

                          {/* INPUT FIELDS BASED ON PLAYER COUNT */}
                          <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                            {selectedSlots.length === 0 ? (
                              <div className="p-3 rounded-lg border border-dashed border-gray-700 bg-[#07192e]/40 text-center text-xs text-gray-400">
                                👈 Highlight {maxAllowedSlots > 1 ? `up to ${maxAllowedSlots}` : '1'} slot box{maxAllowedSlots > 1 ? 'es' : ''} in the grid above to assign player names.
                              </div>
                            ) : (
                              selectedSlots.map((slotNum, idx) => (
                                <div key={slotNum}>
                                  <label className="text-[10px] text-gray-400 font-semibold block mb-0.5">
                                    Player {idx + 1} Name {idx === 0 ? '(Team Leader & Main)' : `(Booking Slot #${slotNum})`}
                                  </label>
                                  <input
                                    type="text"
                                    placeholder={bookingMethod === 'username' ? `App Username ${idx + 1}` : `PUBG ID Name ${idx + 1}`}
                                    value={bookingMethod === 'username' ? inputUsernames[idx] || '' : inputPubgNames[idx] || ''}
                                    onChange={(e) => handleInputChange(idx, e.target.value, bookingMethod)}
                                    className="w-full p-2.5 rounded-lg bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                                    required
                                  />
                                </div>
                              ))
                            )}
                          </div>

                          <div className="flex justify-between items-center text-xs text-gray-300 pt-2 border-t border-gray-800">
                            <span>Total Entry Fee:</span>
                            <span className="font-extrabold text-[#00e5ff]">RS. {totalCost}</span>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setBookingError('');
                                setBookingStep(1);
                              }}
                              className="w-1/3 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-bold text-xs hover:bg-gray-700"
                            >
                              ← BACK
                            </button>
                            <button
                              type="submit"
                              disabled={loading || isTaskLoading(`slot_booking_${match.id}`)}
                              className={`w-2/3 py-2.5 rounded-xl font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all ${
                                loading || isTaskLoading(`slot_booking_${match.id}`)
                                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110'
                              }`}
                            >
                              {loading || isTaskLoading(`slot_booking_${match.id}`) ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                `CONFIRM & PAY RS. ${totalCost}`
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

        {/* TAB 3: RULES */}
        {activeSubTab === 'rules' && (
            <div className="space-y-3 text-xs text-gray-300">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-amber-200">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                <p className="text-[11px]">
                  Failure to follow PUBG tournament rules results in instant disqualified match slot without entry refund.
                </p>
              </div>

              <ul className="space-y-2 list-disc list-inside bg-[#020710] p-3 rounded-xl border border-gray-800 text-gray-300">
                {match.rules.map((rule, idx) => (
                  <li key={idx} className="leading-relaxed text-[11px]">{rule}</li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Bottom Navigation Buttons */}
        {activeSubTab === 'details' && (
          <div className="p-4 bg-[#030a16] border-t border-gray-800/60 flex justify-end">
            {isAlreadyBooked ? (
              <button
                type="button"
                onClick={() => setActiveSubTab('slots')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                VIEW MY BOOKED SLOT ➔
              </button>
            ) : isEnded ? (
              <button
                type="button"
                disabled
                className="w-full py-3.5 rounded-xl bg-slate-800 text-slate-400 border border-slate-700/50 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed opacity-75"
              >
                MATCH HAS ENDED 🏁
              </button>
            ) : isStarted ? (
              <button
                type="button"
                disabled
                className="w-full py-3.5 rounded-xl bg-red-900/40 text-red-300 border border-red-500/30 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
              >
                MATCH HAS STARTED 🔴
              </button>
            ) : isFull ? (
              <button
                type="button"
                disabled
                className="w-full py-3.5 rounded-xl bg-amber-900/40 text-amber-300 border border-amber-500/30 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                MATCH FULL 🔒
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveSubTab('slots')}
                className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all"
              >
                PROCEED TO BOOK SLOT ➔
              </button>
            )}
          </div>
        )}

        {activeSubTab === 'slots' && isAlreadyBooked && (
          <div className="p-4 bg-[#030a16] border-t border-gray-800/60 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveSubTab('rules')}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              PROCEED TO RULES & REGULATIONS ➔
            </button>
          </div>
        )}

        {activeSubTab === 'rules' && (
          <div className="p-4 bg-[#030a16] border-t border-gray-800/60 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveSubTab('details')}
              className="w-full py-3.5 rounded-xl bg-gray-800 text-gray-200 border border-gray-700/80 font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-gray-700 active:scale-[0.98] transition-all"
            >
              BACK TO MATCH SPECS ➔
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
