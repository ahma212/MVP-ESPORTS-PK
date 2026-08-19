import React from 'react';
import { Download, X, Smartphone, Share } from 'lucide-react';

interface PwaHomeBannerProps {
  platformLabel: string;
  isIos: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export const PwaHomeBanner: React.FC<PwaHomeBannerProps> = ({
  platformLabel,
  isIos,
  onInstall,
  onDismiss
}) => {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md bg-gradient-to-r from-[#07192e] via-[#040e1a] to-[#07192e] border border-[#00e5ff]/40 rounded-2xl p-3 shadow-2xl shadow-[#00e5ff]/15 flex items-center justify-between gap-2 animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 shrink-0 shadow-md">
          <div className="w-full h-full bg-[#030a16] rounded-[10px] flex items-center justify-center font-black text-[#00e5ff] text-[10px]">
            MVP
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="text-xs font-black text-white truncate flex items-center gap-1">
            MVP ESPORTS <span className="text-[9px] bg-[#00e5ff]/20 text-[#00e5ff] px-1 rounded font-bold">APP</span>
          </h4>
          <p className="text-[10px] text-gray-300 truncate">
            {isIos ? 'Add to Home Screen for fast access' : 'Fast, native app experience'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onInstall}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] text-[11px] font-black shadow-md shadow-[#00e5ff]/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap"
        >
          {isIos ? <Share className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          <span>{isIos ? 'Install' : 'Install'}</span>
        </button>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700 active:scale-90 transition-all"
          title="Close prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
