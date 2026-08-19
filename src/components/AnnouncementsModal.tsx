import React from 'react';
import { X, Megaphone, Calendar } from 'lucide-react';
import { Announcement } from '../types';

interface AnnouncementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: Announcement[];
}

export const AnnouncementsModal: React.FC<AnnouncementsModalProps> = ({
  isOpen,
  onClose,
  announcements
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 w-full h-screen bg-[#020710] flex flex-col animate-in fade-in duration-200">
      <div className="w-full h-full max-w-4xl mx-auto bg-[#040e1a] border-x border-[#00e5ff]/20 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header Bar */}
        <div className="p-4 bg-gradient-to-r from-[#07192e] via-[#030a16] to-[#07192e] border-b border-[#00e5ff]/30 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/40 text-[#00e5ff] animate-pulse">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#00e5ff] tracking-widest uppercase block mb-0.5">
                OFFICIAL NOTICES
              </span>
              <h2 className="text-sm font-black text-white">MVP Announcements</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / History List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar bg-[#020710]/40">
          {announcements.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-800/50 border border-gray-700/50 flex items-center justify-center mx-auto text-gray-500">
                <Megaphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-300">No New Announcements</h3>
                <p className="text-[10px] text-gray-500 mt-1">All caught up! Check back later for official tournament updates.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-4 rounded-xl bg-gradient-to-br from-[#07192e]/60 to-[#020710]/80 border border-gray-800/80 hover:border-[#00e5ff]/30 transition-all duration-200"
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <h3 className="text-xs font-black text-white leading-relaxed tracking-wide">
                      {ann.title}
                    </h3>
                  </div>

                  <p className="text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed font-medium">
                    {ann.content}
                  </p>

                  <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-800/40 text-[9px] text-gray-500">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span>Published on {new Date(ann.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#030a16] border-t border-gray-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#07192e] border border-gray-700 hover:border-[#00e5ff]/40 text-xs font-black text-gray-300 hover:text-white transition-all active:scale-[0.98]"
          >
            CLOSE NOTICES
          </button>
        </div>

      </div>
    </div>
  );
};
