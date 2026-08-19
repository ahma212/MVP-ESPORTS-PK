import React from 'react';
import { Megaphone, ChevronRight } from 'lucide-react';

interface NoticeBannerProps {
  noticeText?: string;
  onOpenDeposit?: () => void;
  onOpenAnnouncements?: () => void;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({
  noticeText = 'Daily Cash Tournaments Active! Instant JazzCash & EasyPaisa Withdrawals.',
  onOpenDeposit,
  onOpenAnnouncements
}) => {
  return (
    <div className="p-2 rounded-xl bg-gradient-to-r from-[#00e5ff]/10 via-[#0066ff]/5 to-[#00e5ff]/5 border border-[#00e5ff]/25 text-xs flex items-center justify-between gap-2 shadow-md shadow-[#00e5ff]/5 select-none">
      <div className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer" onClick={onOpenAnnouncements}>
        <span className="bg-[#00e5ff] text-[#030a16] text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 uppercase flex-shrink-0 animate-pulse">
          <Megaphone className="w-2.5 h-2.5" />
          NOTICE
        </span>
        <div className="flex-1 overflow-hidden relative w-full flex items-center">
          {React.createElement('marquee', { className: "text-gray-200 text-[11px] font-bold", scrollamount: "3" }, noticeText)}
        </div>
      </div>

      {onOpenAnnouncements ? (
        <button
          onClick={onOpenAnnouncements}
          className="text-[10px] font-bold text-[#00e5ff] flex items-center gap-0.5 hover:underline flex-shrink-0 bg-[#00e5ff]/10 px-2 py-1 rounded border border-[#00e5ff]/30"
        >
          View All
          <ChevronRight className="w-3 h-3" />
        </button>
      ) : onOpenDeposit ? (
        <button
          onClick={onOpenDeposit}
          className="text-[10px] font-bold text-[#00e5ff] flex items-center gap-0.5 hover:underline flex-shrink-0 bg-[#00e5ff]/10 px-2 py-1 rounded border border-[#00e5ff]/30"
        >
          Add Funds
          <ChevronRight className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
};
