import React from 'react';
import { X, Share, PlusSquare, Download, CheckCircle2 } from 'lucide-react';

interface PwaIosGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  platformLabel: string;
  isIos: boolean;
}

export const PwaIosGuideModal: React.FC<PwaIosGuideModalProps> = ({
  isOpen,
  onClose,
  platformLabel,
  isIos
}) => {
  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const pwaPrompt = (window as any).deferredPwaPrompt;

    if (pwaPrompt && typeof pwaPrompt.prompt === 'function') {
      try {
        await pwaPrompt.prompt();
        const choice = await pwaPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          // Successfully installed
        }
        (window as any).deferredPwaPrompt = null;
        onClose();
      } catch (err) {
        console.warn(err);
        onClose();
      }
    } else {
      // Native prompt available nahi hai
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#040e1a] border border-[#00e5ff]/30 rounded-2xl p-5 shadow-2xl relative space-y-4 text-white">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">{platformLabel}</h3>
              <p className="text-[10px] text-gray-400">MVP ESPORTS Tournament Arena</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {isIos ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-300">
              Safari mein yeh steps follow karo:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">1</div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Share icon pe tap karo <Share className="w-3.5 h-3.5 text-[#00e5ff]" />
                  </p>
                  <p className="text-[10px] text-gray-400">Safari ke bottom ya top mein hota hai</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">2</div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    "Add to Home Screen" select karo <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">3</div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    "Add" pe tap karo <CheckCircle2 className="w-3.5 h-3.5 text-[#00e5ff]" />
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-300">
              Android pe install karne ke liye:
            </p>
            <div className="p-3 rounded-xl bg-[#07192e] border border-gray-800 space-y-1.5 text-xs">
              <p className="font-bold text-white">Method 1 (Recommended)</p>
              <p className="text-[10px] text-gray-400">
                Neeche <span className="text-[#00e5ff] font-bold">INSTALL NOW</span> button dabao. 
                Agar Chrome ka popup aaye to <span className="text-[#00e5ff] font-bold">Install</span> pe click karo.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#07192e] border border-gray-800 space-y-1.5 text-xs">
              <p className="font-bold text-white">Method 2</p>
              <p className="text-[10px] text-gray-400">
                Browser ke <span className="text-[#00e5ff] font-bold">3 dots (⋮)</span> pe jao → 
                <span className="text-[#00e5ff] font-bold">Install app</span> ya <span className="text-[#00e5ff] font-bold">Add to Home screen</span> select karo.
              </p>
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleInstallClick}
          className="w-full py-2.5 rounded-xl bg-[#00e5ff] text-[#030a16] font-black text-xs shadow-md active:scale-95 transition-all"
        >
          {isIos ? 'Samajh gaya' : 'INSTALL NOW'}
        </button>

      </div>
    </div>
  );
};