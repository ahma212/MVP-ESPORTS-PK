import React from 'react';
import { Home, Gamepad2, Wallet, Trophy, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile' | 'coming-soon' | 'watch-live';
  onChangeTab: (tab: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile') => void;
  bookedCount: number;
}
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab, bookedCount }) => {
  const tabs: Array<{
    id: 'home' | 'my-matches' | 'wallet' | 'leaderboard' | 'profile';
    label: string;
    icon: any;
    badge?: number;
  }> = [
    { id: 'home', label: 'Arena', icon: Home },
    { id: 'my-matches', label: 'My Matches', icon: Gamepad2, badge: bookedCount },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'leaderboard', label: 'Results', icon: Trophy },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#030a16]/95 backdrop-blur-md border-t border-[#00e5ff]/20 pt-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto flex justify-around items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id as any)}
              className={`flex flex-col items-center gap-1 transition-all relative py-1 px-2 rounded-lg ${
                isActive
                  ? 'text-[#00e5ff] font-bold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 bg-[#00e5ff] text-[#030a16] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#030a16]">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] tracking-tight">{tab.label}</span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
