import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Users, Activity, Sparkles, RefreshCw } from 'lucide-react';

export const AdminActivityHub: React.FC = () => {
  const [totalPlayersCount, setTotalPlayersCount] = useState<number>(0);
  const [newPlayersTodayCount, setNewPlayersTodayCount] = useState<number>(0);
  const [activePlayersCount, setActivePlayersCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured() || !supabase) {
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
      
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();

    // REALTIME SYNC
    let profilesSubscription: any = null;
    let presenceChannel: any = null;

    if (isSupabaseConfigured() && supabase) {
      try {
        // Listen to postgres_changes on the profiles table for new registrations
        profilesSubscription = supabase
          .channel('public:profiles:activity_hub')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'profiles' },
            () => {
              setTotalPlayersCount(prev => prev + 1);
              setNewPlayersTodayCount(prev => prev + 1);
            }
          )
          .subscribe();

        // Connect Supabase Realtime Presence channel for active users
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
          
          setActivePlayersCount(uniqueIds.size);
        }).subscribe();

      } catch (err) {
        console.error('Realtime activity hub error:', err);
      }
    }

    return () => {
      if (profilesSubscription) supabase?.removeChannel(profilesSubscription);
      if (presenceChannel) supabase?.removeChannel(presenceChannel);
    };
  }, []);

  return (
    <div className="bg-[#030a16] p-4 rounded-2xl border border-[#00e5ff]/30 space-y-4">
      <div className="flex justify-between items-center pb-2 border-b border-[#00e5ff]/20">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#00e5ff] animate-pulse" />
          <h3 className="text-sm font-black text-white tracking-wide uppercase">
            Platform Activity Metrics
          </h3>
        </div>
        <button
          onClick={loadMetrics}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07192e] hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 text-xs font-bold transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Active Online Players */}
        <div className="p-3 rounded-xl bg-[#07192e]/80 border border-emerald-500/40 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping absolute" />
            <div className="w-3 h-3 rounded-full bg-emerald-500 relative" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Online Now</span>
            <span className="text-lg font-black text-emerald-400">{activePlayersCount} Active</span>
          </div>
        </div>

        {/* Total Registered Players */}
        <div className="p-3 rounded-xl bg-[#07192e]/80 border border-[#00e5ff]/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#00e5ff]/20">
            <Users className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Total Registered</span>
            <span className="text-lg font-black text-[#00e5ff]">{totalPlayersCount} Players</span>
          </div>
        </div>

        {/* New Registrations Today */}
        <div className="p-3 rounded-xl bg-[#07192e]/80 border border-amber-500/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">New Today</span>
            <span className="text-lg font-black text-amber-400">{newPlayersTodayCount} Today</span>
          </div>
        </div>
      </div>
    </div>
  );
};
