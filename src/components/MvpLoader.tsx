import React from 'react';
import { Shield, Zap } from 'lucide-react';

interface MvpLoaderProps {
  message?: string;
  fullScreen?: boolean;
}

export const MvpLoader: React.FC<MvpLoaderProps> = ({
  message = 'Connecting to Arena...',
  fullScreen = true,
}) => {
  const containerClasses = fullScreen
    ? 'fixed inset-0 z-[99999] bg-[#000000] flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto cursor-wait'
    : 'w-full min-h-[60vh] bg-[#000000] flex flex-col items-center justify-center p-6 text-center select-none';

  return (
    <div className={containerClasses} id="mvp-fullscreen-loader" role="status" aria-live="polite">
      {/* Soft minimal glow behind logo */}
      <div className="absolute w-44 h-44 rounded-full bg-[#00e5ff]/5 blur-2xl pointer-events-none -z-10 animate-pulse" />

      {/* Gaming Logo Container */}
      <div className="relative group flex items-center justify-center mb-2">
        {/* Subtle accent ring */}
        <div className="absolute -inset-2 rounded-[28px] border border-[#00e5ff]/15 pointer-events-none" />

        {/* Badge with subtle border and low-opacity shadow */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-[#00e5ff]/60 via-[#0088ff]/40 to-[#002266]/60 p-[1.5px] shadow-[0_0_12px_rgba(0,229,255,0.12)]">
          <div className="w-full h-full bg-[#050505] rounded-[22px] flex flex-col items-center justify-center relative overflow-hidden border border-[#00e5ff]/15">
            {/* Top highlight glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,229,255,0.06),transparent_70%)] pointer-events-none" />

            {/* Lightning / Shield Top Accents */}
            <div className="flex items-center gap-1 mb-1 z-10">
              <Zap className="w-3 h-3 text-[#00e5ff] fill-[#00e5ff] opacity-80" />
              <Shield className="w-3.5 h-3.5 text-[#00e5ff] opacity-90" />
              <Zap className="w-3 h-3 text-[#00e5ff] fill-[#00e5ff] opacity-80" />
            </div>

            {/* MVP Bold Title inside badge */}
            <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-[#00e5ff] to-[#0088ff] tracking-widest drop-shadow-[0_0_6px_rgba(0,229,255,0.3)] z-10 leading-none">
              MVP
            </span>

            {/* ESPORTS tag in badge */}
            <span className="text-[9px] sm:text-[10px] font-black tracking-[0.25em] text-[#00e5ff]/80 uppercase z-10 mt-1">
              ESPORTS
            </span>
          </div>
        </div>
      </div>

      {/* Subtitle / Region Title below logo */}
      <h2 className="text-sm sm:text-base font-extrabold tracking-[0.25em] text-[#00e5ff] uppercase mt-3">
        PAKISTAN ESPORTS
      </h2>

      {/* 3. Small status line */}
      <p className="text-xs font-semibold text-gray-400 tracking-wide mt-2 max-w-xs transition-opacity duration-200">
        {message}
      </p>

      {/* Subtle Cyan Progress Bar on Black */}
      <div className="w-52 sm:w-64 h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden mt-5 border border-[#00e5ff]/20 relative">
        <div className="h-full w-2/5 bg-gradient-to-r from-transparent via-[#00e5ff] to-[#0088ff] rounded-full shadow-[0_0_6px_rgba(0,229,255,0.4)] animate-mvp-loader-bar" />
      </div>
    </div>
  );
};


