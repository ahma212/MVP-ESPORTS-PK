import React from 'react';
import { X, Share, PlusSquare, ArrowUp, Smartphone, Download, CheckCircle2 } from 'lucide-react';

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
              Follow these simple steps in Safari to add MVP ESPORTS to your Home Screen:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Tap the Share icon <Share className="w-3.5 h-3.5 text-[#00e5ff]" />
                  </p>
                  <p className="text-[10px] text-gray-400">Located at the bottom or top of Safari browser</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Select "Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                  </p>
                  <p className="text-[10px] text-gray-400">Scroll down the share list options</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07192e] border border-gray-800 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center shrink-0 font-black">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Tap "Add" <CheckCircle2 className="w-3.5 h-3.5 text-[#00e5ff]" />
                  </p>
                  <p className="text-[10px] text-gray-400">Top right corner to confirm installation</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-300">
              To install MVP ESPORTS on your device:
            </p>
            <div className="p-3 rounded-xl bg-[#07192e] border border-gray-800 space-y-1.5 text-xs">
              <p className="font-bold text-white">Browser App Menu</p>
              <p className="text-[10px] text-gray-400">
                Open your browser options (3 dots menu) and tap <span className="text-[#00e5ff] font-bold">"Install App"</span> or <span className="text-[#00e5ff] font-bold">"Add to Home screen"</span>.
              </p>
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#00e5ff] text-[#030a16] font-black text-xs shadow-md active:scale-95 transition-all"
        >
          Got it
        </button>

      </div>
    </div>
  );
};
