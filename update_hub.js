const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { supabase, isSupabaseConfigured, getAllProfiles } from '../lib/supabase';
import { Users, Search, Activity, Sparkles, Copy, Check, ShieldAlert, Award, RefreshCw, Mail, Calendar, CircleDot } from 'lucide-react';

interface AdminPlayersHubProps {
  onOpenRewards?: (username: string) => void;
  onOpenBans?: (username: string) => void;
}

export const AdminPlayersHub: React.FC<AdminPlayersHubProps> = ({
  onOpenRewards,
  onOpenBans
}) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activePlayers, setActivePlayers] = useState<UserProfile[]>([]);
  const [totalPlayersCount, setTotalPlayersCount] = useState<number>(0);
  const [newPlayersTodayCount, setNewPlayersTodayCount] = useState<number>(0);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newPlayerAlert, setNewPlayerAlert] = useState<string | null>(null);

  // 1. STATS METRICS ENGINE & 2. LIVE SEARCH ENGINE
  const loadProfilesData = async (query = '') => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured() || !supabase) {
         setProfiles(getAllProfiles());
         return;
      }

      // TOTAL REGISTERED PLAYERS
      const { count: totalCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      if (totalCount !== null) setTotalPlayersCount(totalCount);

      // NEW REGISTRATIONS TODAY
      const startOfDayISO = new Date();
      startOfDayISO.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDayISO.toISOString());
      if (todayCount !== null) setNewPlayersTodayCount(todayCount);

      // LIVE SEARCH ENGINE
      let dbQuery = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (query.trim()) {
        const cleanQuery = query.trim().toLowerCase().replace('@', '');
        dbQuery = dbQuery.or(
          \`username.ilike.%${cleanQuery}%,name.ilike.%${cleanQuery}%,pubg_id_name.ilike.%${cleanQuery}%,pubg_id_number.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%\`
        );
      }
      
      const { data, error } = await dbQuery;
      if (!error && data) {
        setProfiles(data as UserProfile[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProfilesData(searchQuery);
    }, 500); // Debounce search
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // 3. REALTIME SYNC
    let profilesSubscription: any = null;
    let presenceChannel: any = null;

    if (isSupabaseConfigured() && supabase) {
      try {
        // Listen to postgres_changes on the profiles table
        profilesSubscription = supabase
          .channel('public:profiles:hub')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'profiles' },
            (payload) => {
              const newProf = payload.new as any;
              
              if (payload.eventType === 'INSERT') {
                 setTotalPlayersCount(prev => prev + 1);
                 setNewPlayersTodayCount(prev => prev + 1);
                 
                 const alertMsg = \`🎉 New Player Registered: \${newProf.name || 'Gamer'} (@\${newProf.username || 'unknown'})\`;
                 setNewPlayerAlert(alertMsg);
                 setTimeout(() => setNewPlayerAlert(null), 8000);
                 
                 setProfiles(prev => [newProf as UserProfile, ...prev]);
              } else if (payload.eventType === 'UPDATE') {
                 setProfiles(prev => prev.map(p => p.id === newProf.id ? { ...p, ...newProf } as UserProfile : p));
                 setActivePlayers(prev => prev.map(p => p.id === newProf.id ? { ...p, ...newProf } as UserProfile : p));
              }
            }
          )
          .subscribe();

        // Connect Supabase Realtime Presence channel
        presenceChannel = supabase.channel('online-users');
        
        presenceChannel.on('presence', { event: 'sync' }, () => {
          const newState = presenceChannel.presenceState();
          const uniqueIds = new Set<string>();
          
          Object.values(newState).forEach((presences: any) => {
             presences.forEach((p: any) => {
               if (p.user_id) uniqueIds.add(p.user_id);
               if (p.id) uniqueIds.add(p.id);
             });
          });
          
          const idsArray = Array.from(uniqueIds);
          if (idsArray.length > 0) {
             supabase.from('profiles').select('*').in('id', idsArray).then(({ data }) => {
               if (data) setActivePlayers(data as UserProfile[]);
             });
          } else {
             setActivePlayers([]);
          }
        }).subscribe();

      } catch (err) {
        console.error('Realtime profiles error:', err);
      }
    }

    return () => {
      if (profilesSubscription) supabase?.removeChannel(profilesSubscription);
      if (presenceChannel) supabase?.removeChannel(presenceChannel);
    };
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* REAL-TIME NEW REGISTRATION ALERT BANNER */}
      {newPlayerAlert && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/30 via-teal-500/20 to-emerald-500/30 border-2 border-emerald-400 text-white shadow-lg flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-300 animate-spin" />
            <span className="text-xs sm:text-sm font-black text-emerald-200">
              {newPlayerAlert}
            </span>
          </div>
          <button
            onClick={() => setNewPlayerAlert(null)}
            className="text-xs bg-emerald-950/80 hover:bg-emerald-900 px-2.5 py-1 rounded-lg text-emerald-300 font-bold border border-emerald-500/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HEADER STATS & SEARCH BAR */}
      <div className="bg-[#030a16] p-3.5 rounded-2xl border border-[#00e5ff]/30 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00e5ff] animate-pulse" />
              <h3 className="text-sm font-black text-white tracking-wide uppercase">
                Player Monitoring & Activity Hub
              </h3>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">
              Real-time online presence, explicit usernames, PUBG credentials & live registrations
            </p>
          </div>

          <button
            onClick={() => loadProfilesData(searchQuery)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07192e] hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 text-xs font-bold transition-all active:scale-95"
          >
            <RefreshCw className={\`w-3.5 h-3.5 \${isLoading ? 'animate-spin' : ''}\`} />
            <span>Sync Players</span>
          </button>
        </div>

        {/* Quick Counters Bar */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2 rounded-xl bg-[#07192e]/80 border border-emerald-500/40 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <span className="text-[10px] text-gray-400 block font-bold uppercase">Online Now</span>
              <span className="text-sm font-black text-emerald-400">{activePlayers.length} Active</span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#07192e]/80 border border-[#00e5ff]/30 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#00e5ff]" />
            <div>
              <span className="text-[10px] text-gray-400 block font-bold uppercase">Total Registered</span>
              <span className="text-sm font-black text-[#00e5ff]">{totalPlayersCount} Players</span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#07192e]/80 border border-amber-500/30 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-[10px] text-gray-400 block font-bold uppercase">New Registrations</span>
              <span className="text-sm font-black text-amber-400">
                {newPlayersTodayCount} Today
              </span>
            </div>
          </div>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search player by @username, Display Name, or PUBG UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#07192e] border border-gray-700 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-[#00e5ff] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* DUAL-BOX PLAYER HUB CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* ================= BOX 1: ACTIVE PLAYERS (ONLINE NOW) ================= */}
        <div className="bg-[#030a16] rounded-2xl border-2 border-emerald-500/40 p-3.5 space-y-3 flex flex-col h-[520px]">
          <div className="flex justify-between items-center pb-2 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                Box 1: Active Players (Online Now)
              </h4>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/40">
              {activePlayers.length} Online
            </span>
          </div>

          {activePlayers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2">
              <CircleDot className="w-8 h-8 text-gray-600 animate-pulse" />
              <p className="text-xs font-bold">No active players online right now.</p>
              <p className="text-[10px] text-gray-600">
                Players will automatically show here when logged into the app.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {activePlayers.map((player) => (
                <div
                  key={player.id}
                  className="p-3 rounded-xl bg-[#07192e]/90 border border-emerald-500/30 hover:border-emerald-400/60 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <img
                          src={player.avatar_url || \`https://api.dicebear.com/7.x/avataaars/svg?seed=\${encodeURIComponent(player.username)}\`}
                          alt={player.name}
                          className="w-10 h-10 rounded-xl object-cover border border-emerald-400/50"
                        />
                        <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#07192e] animate-pulse" />
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h5 className="text-xs font-black text-white">{player.name}</h5>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black font-mono border border-emerald-500/30">
                            @{player.username}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-300 font-mono mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">IGN Name:</span>
                            <span className="text-[#00e5ff] font-bold">{player.pubg_id_name || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">PUBG UID:</span>
                            <span className="text-[#00e5ff] font-bold">{player.pubg_id_number || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
                        🟢 ONLINE NOW
                      </span>
                      <span className="block text-[9px] text-gray-400 font-mono mt-1">
                        Bal: <span className="text-emerald-400 font-extrabold">RS {player.wallet_balance}</span>
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-800 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(\`@\${player.username}\`, \`user-\${player.id}\`)}
                        className="px-2 py-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/10 flex items-center gap-1 font-bold"
                      >
                        {copiedText === \`user-\${player.id}\` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>@{player.username}</span>
                      </button>

                      <button
                        onClick={() => handleCopy(player.pubg_id_number || '', \`uid-\${player.id}\`)}
                        className="px-2 py-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-amber-300 hover:bg-amber-500/10 flex items-center gap-1 font-bold"
                      >
                        {copiedText === \`uid-\${player.id}\` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>UID</span>
                      </button>
                    </div>

                    {onOpenRewards && (
                      <button
                        onClick={() => onOpenRewards(player.username)}
                        className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold flex items-center gap-1"
                      >
                        <Award className="w-3 h-3" />
                        <span>Send RS</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= BOX 2: ALL REGISTERED PLAYERS ================= */}
        <div className="bg-[#030a16] rounded-2xl border-2 border-[#00e5ff]/30 p-3.5 space-y-3 flex flex-col h-[520px]">
          <div className="flex justify-between items-center pb-2 border-b border-[#00e5ff]/20">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00e5ff]" />
              <h4 className="text-xs font-black text-[#00e5ff] uppercase tracking-wider">
                Box 2: All Registered Players
              </h4>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#00e5ff]/20 text-[#00e5ff] font-extrabold text-[10px] border border-[#00e5ff]/40">
              {profiles.length} (Filtered)
            </span>
          </div>

          {profiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2">
              <Users className="w-8 h-8 text-gray-600" />
              <p className="text-xs font-bold">No players match search criteria.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {profiles.map((player) => {
                const online = activePlayers.some(p => p.id === player.id);
                const isNewPlayer = player.created_at && Date.now() - new Date(player.created_at).getTime() < 86400000;

                return (
                  <div
                    key={player.id}
                    className={\`p-3 rounded-xl bg-[#07192e] border transition-all space-y-2 \${
                      isNewPlayer
                        ? 'border-amber-400 bg-gradient-to-r from-amber-500/10 via-[#07192e] to-[#07192e]'
                        : 'border-gray-800 hover:border-gray-700'
                    }\`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <img
                            src={player.avatar_url || \`https://api.dicebear.com/7.x/avataaars/svg?seed=\${encodeURIComponent(player.username)}\`}
                            alt={player.name}
                            className="w-10 h-10 rounded-xl object-cover border border-gray-700"
                          />
                          <span
                            className={\`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#07192e] \${
                              online ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'
                            }\`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-xs font-black text-white">{player.name}</h5>
                            <span className="px-1.5 py-0.2 rounded bg-[#00e5ff]/20 text-[#00e5ff] text-[10px] font-black font-mono border border-[#00e5ff]/30">
                              @{player.username}
                            </span>
                            {isNewPlayer && (
                              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-wider border border-amber-400 animate-pulse">
                                NEW
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-gray-300 font-mono mt-0.5 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">IGN Name:</span>
                              <span className="text-[#00e5ff] font-bold">{player.pubg_id_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">PUBG UID:</span>
                              <span className="text-[#00e5ff] font-bold">{player.pubg_id_number || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <span
                          className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border \${
                            online
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }\`}
                        >
                          {online ? '🟢 ONLINE' : '⚪ OFFLINE'}
                        </span>
                        <span className="block text-[9px] text-gray-400 font-mono">
                          Bal: <span className="text-emerald-400 font-extrabold">RS {player.wallet_balance}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-gray-400 font-mono px-1">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-gray-500" />
                        <span>{player.email}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        <span>Joined {new Date(player.created_at || Date.now()).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(\`@\${player.username}\`, \`all-user-\${player.id}\`)}
                          className="px-2 py-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/10 flex items-center gap-1 font-bold"
                        >
                          {copiedText === \`all-user-\${player.id}\` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>@{player.username}</span>
                        </button>

                        <button
                          onClick={() => handleCopy(player.pubg_id_number || '', \`all-uid-\${player.id}\`)}
                          className="px-2 py-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-amber-300 hover:bg-amber-500/10 flex items-center gap-1 font-bold"
                        >
                          {copiedText === \`all-uid-\${player.id}\` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>UID</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {onOpenRewards && (
                          <button
                            onClick={() => onOpenRewards(player.username)}
                            className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold flex items-center gap-1"
                          >
                            <Award className="w-3 h-3" />
                            <span>Reward</span>
                          </button>
                        )}

                        {onOpenBans && (
                          <button
                            onClick={() => onOpenBans(player.username)}
                            className="px-2 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 font-bold flex items-center gap-1"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>Ban</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
`

fs.writeFileSync('src/components/AdminPlayersHub.tsx', code);
