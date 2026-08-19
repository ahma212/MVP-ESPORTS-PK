import React from 'react';
import { Shield, Trophy, Flame, Zap, ArrowRight, Gamepad2, Wallet, Users } from 'lucide-react';

interface LandingScreenProps {
  onEnterArena: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onEnterArena }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center py-6 px-2 space-y-6">
      
      {/* MVP Badge */}
      <div className="relative group">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#00e5ff] via-[#0088ff] to-[#0033aa] p-[2px] shadow-2xl shadow-[#00e5ff]/40 transform transition-transform group-hover:scale-105">
          <div className="w-full h-full bg-[#030a16] rounded-[22px] flex flex-col items-center justify-center relative overflow-hidden">
            <span className="text-3xl font-black text-[#00e5ff] tracking-widest drop-shadow-[0_0_12px_rgba(0,229,255,0.8)]">
              MVP
            </span>
            <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase">ESPORTS</span>
          </div>
        </div>
        <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase shadow-md flex items-center gap-1">
          <Zap className="w-2.5 h-2.5 fill-current" />
          ONLINE
        </div>
      </div>

      {/* Header Titles */}
      <div>
        <h1 className="text-sm font-extrabold tracking-widest text-[#00e5ff] uppercase mb-1 flex items-center justify-center gap-1.5">
          MVP ESPORTS PK
        </h1>
        <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">
          Pakistan PUBG Mobile Tournament Arena
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-white">
          Pakistan's premium <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] via-[#00a2ff] to-[#0055ff]">
            PUBG Mobile
          </span> <br />
          tournament arena
        </h2>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Daily cash matches, instant slot booking and JazzCash / EasyPaisa payouts.
        </p>
      </div>

      {/* Highlights Grid */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-xs pt-1">
        <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-[#00e5ff]/20 text-center">
          <Trophy className="w-4 h-4 text-[#00e5ff] mx-auto mb-1" />
          <span className="text-[10px] font-bold text-white block">Daily Cash</span>
          <span className="text-[9px] text-gray-400">Prizes</span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-[#00e5ff]/20 text-center">
          <Gamepad2 className="w-4 h-4 text-[#00e5ff] mx-auto mb-1" />
          <span className="text-[10px] font-bold text-white block">Instant Room</span>
          <span className="text-[9px] text-gray-400">ID & Pass</span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#07192e]/80 border border-[#00e5ff]/20 text-center">
          <Wallet className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <span className="text-[10px] font-bold text-white block">JazzCash</span>
          <span className="text-[9px] text-gray-400">& EasyPaisa</span>
        </div>
      </div>

      {/* Main CTA */}
      <button
        onClick={onEnterArena}
        className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-[#00e5ff] via-[#0088ff] to-[#0055ff] text-[#030a16] font-black text-base tracking-wider shadow-xl shadow-[#00e5ff]/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 group"
      >
        ENTER THE ARENA
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>

      <p className="text-[10px] text-gray-500 font-medium">
        🔒 Verified Anti-Cheat & Fair Play Guaranteed
      </p>
    </div>
  );
};
