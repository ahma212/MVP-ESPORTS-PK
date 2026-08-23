import React from 'react';
import { Match } from '../types';
import { Trophy, Swords, Clock, Users, ShieldAlert, KeyRound, Flame, Crosshair } from 'lucide-react';

interface MatchCardProps {
  match: Match;
  onSelectMatch: (match: Match) => void;
  isBookedByMe?: boolean;
  bookedSlotNum?: number;
}

const getMapImage = (map: string) => {
  switch (map.toLowerCase()) {
    case 'erangel':
      return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=90';
    case 'miramar':
      return 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=90';
    case 'rondo':
      return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=90';
    case 'sanhok':
      return 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=90';
    case 'livik':
      return 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=90';
    case 'warehouse':
      return 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=90';
    case 'wow':
      return 'https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?auto=format&fit=crop&w=1200&q=90';
    default:
      return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=90';
  }
};

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  onSelectMatch,
  isBookedByMe,
  bookedSlotNum
}) => {
  const [now, setNow] = React.useState<number>(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
  // Home MatchCard "MATCH HAS ENDED" must depend ONLY on real time logic:
  // 1) Countdown / play window has expired (diff <= -30 * 60 * 1000)
  // 2) OR admin explicitly ended the match when scheduled time has arrived/passed (match.is_ended === true && diff <= 0)
  const isEnded =
    (diff <= -30 * 60 * 1000) ||
    (Boolean(match.is_ended) && diff <= 0);

  // Match ONLY starts when its scheduled countdown time expires (diff <= 0) or status is 'live'
  const isStarted =
    !isEnded &&
    (diff <= 0 || match.status === 'live');

  const maxSlotsSafe = Math.max(0, Number(match.max_slots) || 0);
  const rawLocked = Array.isArray(match.locked_slots) ? match.locked_slots : [];
  const validLocked = rawLocked.filter(
    (n) => Number(n) >= 1 && Number(n) <= maxSlotsSafe
  );
  const lockedCount = validLocked.length;
  const availableSlots = Math.max(0, maxSlotsSafe - lockedCount);

  const isFull = availableSlots <= 0 || match.booked_slots >= availableSlots;
  const hasRoomCredentials = Boolean(match.room_id || match.room_credentials?.some(c => c.room_id));

  // Determine button state, text, styling, and disable behavior
  let buttonText = 'SLOT BOOK NOW';
  let buttonStyle = 'bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold cursor-pointer shadow-md shadow-cyan-500/20 active:scale-[0.98]';
  let isDisabled = false;

  if (isEnded) {
    buttonText = 'MATCH HAS ENDED 🏁';
    buttonStyle = 'bg-slate-800 text-slate-400 border border-slate-700/50 cursor-not-allowed opacity-75';
    isDisabled = true;
  } else if (isBookedByMe) {
    buttonText = isStarted ? 'MATCH LIVE • VIEW ROOM & SLOT' : 'VIEW SLOT & ROOM DETAILS';
    buttonStyle = isStarted
      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-extrabold cursor-pointer shadow-md shadow-red-500/20 active:scale-[0.98]'
      : 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/50 hover:bg-[#00e5ff]/30 font-extrabold cursor-pointer active:scale-[0.98]';
    isDisabled = false;
  } else if (isStarted) {
    buttonText = 'MATCH HAS STARTED 🔴';
    buttonStyle = 'bg-red-900/40 text-red-300 border border-red-500/30 cursor-not-allowed opacity-80';
    isDisabled = true;
  } else if (isFull) {
    buttonText = 'MATCH FULL 🔒';
    buttonStyle = 'bg-amber-900/40 text-amber-300 border border-amber-500/30 cursor-not-allowed';
    isDisabled = true;
  }

  const formatCountdown = (ms: number) => {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `\( {pad(hrs)}: \){pad(mins)}:${pad(secs)}`;
  };

  const percentageBooked = Math.round((match.booked_slots / Math.max(1, availableSlots)) * 100);

  // Map tag styling
  const getMapBadge = (map: string) => {
    switch (map.toLowerCase()) {
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

  const tournamentMaps = match.maps && match.maps.length > 0 
    ? match.maps 
    : (match.type === 'tournament' ? ['Erangel', 'Miramar', 'Rondo'] : []);

  const activeMaps = tournamentMaps;

  // Dynamically compute active prizes (>0) to maintain 100% card vs modal consistency
  const activePrizes: Array<{ key: string; label: string; value: string; color: string; isKill?: boolean }> = [];
  
  if (match.prizes?.first_prize && match.prizes.first_prize > 0) {
    const hasMultiplePlacements = Boolean(
      (match.prizes?.second_prize && match.prizes.second_prize > 0) ||
      (match.type === 'tournament' && match.prizes?.third_prize && match.prizes.third_prize > 0)
    );
    activePrizes.push({
      key: '1st',
      label: hasMultiplePlacements ? '1ST PRIZE' : 'WINNING PRIZE',
      value: `RS. ${match.prizes?.first_prize}`,
      color: 'text-[#00e5ff]'
    });
  }

  if (match.prizes?.second_prize && match.prizes.second_prize > 0) {
    activePrizes.push({
      key: '2nd',
      label: '2ND PRIZE',
      value: `RS. ${match.prizes?.second_prize}`,
      color: 'text-white'
    });
  }

  if (match.type === 'tournament' && match.prizes?.third_prize && match.prizes.third_prize > 0) {
    activePrizes.push({
      key: '3rd',
      label: '3RD PRIZE',
      value: `RS. ${match.prizes?.third_prize}`,
      color: 'text-gray-300'
    });
  }

  if (match.prizes?.per_kill_prize && match.prizes.per_kill_prize > 0) {
    activePrizes.push({
      key: 'per_kill',
      label: 'PER KILL',
      value: `RS. ${match.prizes?.per_kill_prize}`,
      color: 'text-emerald-400',
      isKill: true
    });
  }

  const isTournament = match.type === 'tournament';

  let imageArea = null;
  try {
    if (isTournament) {
      const mapCount = activeMaps.length;
      let gridColsClass = 'grid-cols-3';
      let cellHeight = 'h-28';
      
      if (mapCount === 1) {
        gridColsClass = 'grid-cols-1';
        cellHeight = 'h-40 sm:h-44';
      } else if (mapCount === 2) {
        gridColsClass = 'grid-cols-2';
        cellHeight = 'h-32 sm:h-36';
      } else if (mapCount === 3) {
        gridColsClass = 'grid-cols-3';
        cellHeight = 'h-28 sm:h-32';
      } else if (mapCount === 4) {
        gridColsClass = 'grid-cols-2';
        cellHeight = 'h-24 sm:h-28';
      } else {
        // 5 or 6 maps
        gridColsClass = 'grid-cols-3';
        cellHeight = 'h-20 sm:h-24';
      }

      imageArea = (
        <div className={`grid ${gridColsClass} gap-1.5 my-3`}>
          {activeMaps.map((mapName, idx) => {
            const bannerUrl = match.map_banners?.[idx] || getMapImage(mapName);
            const badgeColors = [
              'text-[#00e5ff]', 'text-amber-400', 'text-emerald-400', 
              'text-purple-400', 'text-pink-400', 'text-cyan-400'
            ];
            const badgeColor = badgeColors[idx % badgeColors.length];

            return (
              <div key={idx} className={`relative rounded-lg overflow-hidden border border-[#00e5ff]/25 ${cellHeight} group bg-black/40 shadow-[0_0_12px_rgba(0,229,255,0.08)]`}>
                <img 
                  src={bannerUrl} 
                  alt={mapName} 
                  className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getMapImage(mapName);
                  }}
                />
                {/* Clean small badge - no heavy black blanket */}
                <div className="absolute bottom-1.5 left-1 right-1 flex justify-center">
                  <span className={`text-[9px] font-black uppercase tracking-wider text-center px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-sm border border-white/10 ${badgeColor}`}>
                    {idx + 1}. {mapName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      // Single map normal card - clean full image, no black blanket
      imageArea = (
        <div className="relative rounded-xl overflow-hidden border border-[#00e5ff]/30 h-44 sm:h-48 min-h-[11rem] w-full my-2.5 shadow-[0_0_18px_rgba(0,229,255,0.12)]">
          <img 
            src={match.banner_url || getMapImage(match.map)} 
            alt={`${match.map} Map`} 
            className="w-full h-full object-cover object-center"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).src = getMapImage(match.map);
            }}
          />
          {/* Clean small MAP badge - no full-width black gradient */}
          <div className="absolute bottom-2.5 left-2.5">
            <span className="text-[10px] font-black text-white uppercase tracking-wider bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/15 shadow-sm">
              MAP: {match.map.toUpperCase()}
            </span>
          </div>
        </div>
      );
    }
  } catch (err) {
    console.error("MatchCard image render error caught safely:", err);
    imageArea = (
      <div className="h-40 bg-red-950/20 border border-red-500/30 rounded-lg flex items-center justify-center text-xs text-red-300 font-bold my-2.5">
        ⚠️ Failed to render map layout safely
      </div>
    );
  }

  return (
    <div 
      onClick={() => onSelectMatch(match)}
      className={`rounded-xl bg-gradient-to-b from-[#07192e] to-[#040e1a] border relative overflow-hidden shadow-xl transition-all duration-200 hover:border-[#00e5ff]/60 cursor-pointer flex flex-col justify-between ${
        isBookedByMe ? 'border-[#00e5ff] ring-1 ring-[#00e5ff]/50' : 'border-[#00e5ff]/30'
      } ${
        isTournament 
          ? 'p-5 md:p-6 min-h-[460px] md:min-h-[500px] border-amber-500/30 shadow-amber-500/5' 
          : 'p-3'
      }`}
    >
      {/* Top Badges */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${getMapBadge(match.map)}`}>
            {match.squad_type || 'SQUAD'}
          </span>
          {isTournament ? (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1">
              <Trophy className="w-2.5 h-2.5" />
              GRAND TOURNAMENT ({activeMaps.length} MAPS)
            </span>
          ) : (
            <span className="bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 text-[9px] font-black px-2 py-0.5 rounded uppercase">
              {match.type === 'wow' ? 'WOW' : `${match.map.toUpperCase()} MAP`}
            </span>
          )}
          {isEnded ? (
            <span className="bg-slate-800 text-slate-400 border border-slate-700/50 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1">
              MATCH HAS ENDED 🏁
            </span>
          ) : isStarted ? (
            <span className="bg-red-900/40 text-red-300 border border-red-500/30 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 animate-pulse">
              MATCH HAS STARTED 🔴
            </span>
          ) : diff > 24 * 60 * 60 * 1000 ? (
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 font-mono">
              <Clock className="w-2.5 h-2.5" />
              {match.match_time}
            </span>
          ) : (
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 font-mono">
              <Clock className="w-2.5 h-2.5" />
              Starts in {formatCountdown(diff)}
            </span>
          )}

          {isFull && !isStarted && !isEnded && (
            <span className="bg-amber-900/40 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1">
              FULL 🔒
            </span>
          )}

          {isBookedByMe && hasRoomCredentials && !isStarted && !isEnded && (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 animate-pulse">
              <KeyRound className="w-2.5 h-2.5" />
              ROOM ID READY
            </span>
          )}
        </div>

        {isBookedByMe && (
          <div className="w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-full aspect-square bg-[#00e5ff] text-[#030a16] border-2 border-white/40 shadow-lg shadow-[#00e5ff]/20 flex flex-col items-center justify-center shrink-0 text-center leading-none select-none my-auto">
            <span className="text-[10px] font-black leading-none">✓</span>
            <span className="text-[7.5px] font-black tracking-tighter uppercase leading-none mt-0.5">SLOT</span>
            <span className="text-[8.5px] font-black font-mono leading-none mt-0.5">#{bookedSlotNum || 1}</span>
          </div>
        )}
      </div>

      {/* Match Title & Time */}
      <div>
        <h3 className={`font-black text-white tracking-wide mb-0.5 flex items-center gap-1.5 ${isTournament ? 'text-base md:text-lg' : 'text-sm'}`}>
          {match.title}
        </h3>
        <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1 font-medium">
          <Clock className="w-3 h-3 text-[#00e5ff]" />
          Time: {match.match_time}
        </p>
      </div>

      {/* MAP IMAGES PREVIEW */}
      {imageArea}

      {/* Prize Pool Breakdown Grid - Dynamic & Consistent */}
      {activePrizes.length > 0 && (
        <div className={`grid gap-1.5 my-2.5 p-2 bg-[#020710] rounded-lg border border-gray-800 text-center ${
          activePrizes.length === 1 ? 'grid-cols-1' :
          activePrizes.length === 2 ? 'grid-cols-2' :
          activePrizes.length === 3 ? 'grid-cols-3' :
          'grid-cols-4'
        }`}>
          {activePrizes.map((p) => (
            <div key={p.key}>
              <p className="text-[9px] text-gray-400 font-bold uppercase">{p.label}</p>
              <p className={`text-xs font-black ${p.color} flex items-center justify-center gap-0.5`}>
                {p.isKill && <Crosshair className="w-3 h-3 text-emerald-400" />}
                {p.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Entry Fee & slots Count */}
      <div className="flex justify-between items-center text-[11px] my-2 text-gray-300 font-semibold">
        <span>Entry: <strong className="text-[#00e5ff]">RS. {match.entry_fee} / Player</strong></span>
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3 text-gray-400" />
          <strong className={isFull ? 'text-red-400' : 'text-white'}>
            {match.booked_slots}/{availableSlots} Booked
          </strong>
        </span>
      </div>

      {/* Slots Progress Bar */}
      <div className="w-full bg-gray-800/80 rounded-full h-1.5 mb-3 overflow-hidden border border-gray-700/50">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            percentageBooked >= 90
              ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
              : percentageBooked >= 70
              ? 'bg-amber-400'
              : 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] shadow-[0_0_8px_#00e5ff]'
          }`}
          style={{ width: `${Math.min(percentageBooked, 100)}%` }}
        />
      </div>

      {/* Action Button */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isDisabled) {
            onSelectMatch(match);
          } else {
            e.preventDefault();
          }
        }}
        className={`w-full py-2.5 rounded-lg font-black text-xs tracking-wide shadow-md transition-all ${buttonStyle}`}
      >
        {buttonText}
      </button>
    </div>
  );
};