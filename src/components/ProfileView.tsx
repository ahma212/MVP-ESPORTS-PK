import React from 'react';
import { UserProfile } from '../types';
import { Shield, Copy, Check, ArrowLeft, Edit3 } from 'lucide-react';

interface ProfileViewProps {
  userProfile: UserProfile | null;
  onOpenWallet: () => void;
  onOpenAdmin: () => void;
  onOpenEditProfile: () => void;
  onGoHome?: () => void;
  onUpdateProfile?: (updatedProfile: UserProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  onOpenWallet,
  onOpenAdmin,
  onOpenEditProfile,
  onGoHome,
}) => {
  const [copiedUid, setCopiedUid] = React.useState(false);
  const [copiedIgn, setCopiedIgn] = React.useState(false);

  const handleCopyUid = () => {
    if (userProfile?.pubg_id_number) {
      navigator.clipboard.writeText(userProfile.pubg_id_number);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleCopyIgn = () => {
    if (userProfile?.pubg_id_name) {
      navigator.clipboard.writeText(userProfile.pubg_id_name);
      setCopiedIgn(true);
      setTimeout(() => setCopiedIgn(false), 2000);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Profile Header Box */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#07192e] via-[#040e1a] to-[#07192e] border border-[#00e5ff]/30 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="p-2 rounded-xl bg-[#030a16] border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all shadow-md"
              title="Back to Available Matches"
            >
              <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
            </button>
          )}
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shadow-lg shadow-[#00e5ff]/20 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center text-xl font-black text-[#00e5ff] overflow-hidden">
              {userProfile?.avatar_url ? (
                <img 
                  src={userProfile.avatar_url} 
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const sibling = (e.target as HTMLImageElement).nextElementSibling;
                    if (sibling) sibling.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-full h-full bg-[#030a16] rounded-full flex items-center justify-center text-xl font-black text-[#00e5ff] ${userProfile?.avatar_url ? 'hidden' : ''}`}>
                {userProfile?.username?.charAt(0).toUpperCase() || 'P'}
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">{userProfile?.username || 'Esports Player'}</h2>
              <span className="text-[9px] bg-[#00e5ff]/20 text-[#00e5ff] px-1.5 py-0.5 rounded font-extrabold uppercase border border-[#00e5ff]/30">
                VERIFIED PLAYER
              </span>
            </div>
            <p className="text-xs text-gray-300 font-medium">{userProfile?.name}</p>

            {/* DUAL COPY BUTTONS FOR PUBG ID NAME & PUBG UID */}
            <div className="space-y-1 mt-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-mono">
                  IGN Name: <span className="text-[#00e5ff] font-bold">{userProfile?.pubg_id_name || 'N/A'}</span>
                </span>
                <button
                  onClick={handleCopyIgn}
                  className="p-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/10 active:scale-95 transition-all text-[9px] font-bold flex items-center gap-0.5"
                  title="Copy PUBG IGN Name"
                >
                  {copiedIgn ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIgn ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-mono">
                  PUBG UID: <span className="text-[#00e5ff] font-bold">{userProfile?.pubg_id_number || 'N/A'}</span>
                </span>
                <button
                  onClick={handleCopyUid}
                  className="p-1 rounded bg-[#030a16] border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/10 active:scale-95 transition-all text-[9px] font-bold flex items-center gap-0.5"
                  title="Copy PUBG Character UID"
                >
                  {copiedUid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedUid ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <button
          onClick={onOpenEditProfile}
          className="w-full py-2 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded-xl text-[#00e5ff] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#00e5ff]/20 transition-all"
        >
          <Edit3 className="w-4 h-4" /> Edit Profile
        </button>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#020710] border border-gray-800 text-center">
          <div>
            <span className="text-[9px] text-gray-400 block font-semibold">TOTAL MATCHES</span>
            <span className="text-sm font-black text-white">{userProfile?.total_matches || 0}</span>
          </div>
          <div>
            <span className="text-[9px] text-gray-400 block font-semibold">TOTAL WINS</span>
            <span className="text-sm font-black text-[#00e5ff]">{userProfile?.total_wins || 0}</span>
          </div>
          <div>
            <span className="text-[9px] text-gray-400 block font-semibold">TOTAL KILLS</span>
            <span className="text-sm font-black text-emerald-400">{userProfile?.total_kills || 0}</span>
          </div>
        </div>
      </div>

      {/* Wallet Summary Card */}
      <div className="p-4 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 flex justify-between items-center shadow-md">
        <div>
          <span className="text-xs text-gray-400 font-medium block">Wallet Balance</span>
          <span className="text-lg font-black text-[#00e5ff]">
            RS. {(userProfile?.wallet_balance || 0).toLocaleString()} <span className="text-xs font-normal">PKR</span>
          </span>
        </div>
        <button
          onClick={onOpenWallet}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] font-extrabold text-xs shadow-md shadow-[#00e5ff]/20"
        >
          DEPOSIT / WITHDRAW
        </button>
      </div>

      {/* Menu Options */}
      <div className="space-y-2">
      </div>
    </div>
  );
};
