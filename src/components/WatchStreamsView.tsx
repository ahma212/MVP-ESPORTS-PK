import React from 'react';
import { ArrowLeft, Video, ExternalLink, Flame, Wifi } from 'lucide-react';
import { LiveStream } from '../types';
import { formatStreamViewers } from '../lib/supabase';

interface WatchStreamsViewProps {
  liveStreams: LiveStream[];
  onBackToHome: () => void;
}

export const WatchStreamsView: React.FC<WatchStreamsViewProps> = ({
  liveStreams,
  onBackToHome
}) => {
  return (
    <div className="w-full flex flex-col min-h-screen bg-[#020710] text-white animate-in fade-in duration-300">
      
      {/* Top Header Bar */}
      <div className="sticky top-0 z-10 bg-[#030a16]/95 backdrop-blur-md border-b border-red-500/20 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="p-1.5 rounded-lg bg-[#07192e] hover:bg-[#0c2746] text-gray-300 hover:text-white border border-gray-800 transition-colors active:scale-95"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="text-[10px] font-extrabold text-red-500 tracking-widest uppercase">
                MVP BROADCAST CENTER
              </span>
            </div>
            <h1 className="text-sm font-black text-white tracking-wide uppercase">
              MVP ESPORTS BROADCASTS
            </h1>
          </div>
        </div>

        {/* Live status badge */}
        <div className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black tracking-widest uppercase flex items-center gap-1">
          <Wifi className="w-3 h-3 animate-pulse" />
          <span>LIVE NOW</span>
        </div>
      </div>

      {/* Video Cards Feed Layout */}
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-4 space-y-4">
        {liveStreams.length === 0 ? (
          <div className="py-16 text-center space-y-4 bg-[#07192e]/10 border border-dashed border-gray-800 rounded-2xl p-6">
            <div className="w-12 h-12 rounded-full bg-gray-800/30 border border-gray-700/30 flex items-center justify-center mx-auto text-gray-500">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-300">No Stream Broadcasts Active</h3>
              <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                Check back during tournament hours to witness epic pro scrims and matches live!
              </p>
            </div>
            <button
              onClick={onBackToHome}
              className="px-4 py-2 rounded-xl bg-[#07192e] hover:bg-[#0c2746] text-[10px] font-black text-[#00e5ff] uppercase border border-[#00e5ff]/20 transition-all active:scale-95"
            >
              Back To Arena Home
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {liveStreams.map((stream) => (
              <div
                key={stream.id}
                className="rounded-xl overflow-hidden bg-gradient-to-b from-[#07192e]/90 to-[#020710]/98 border border-red-500/20 shadow-xl shadow-red-500/5 group hover:border-red-500/40 transition-all duration-300"
              >
                {/* Full-width High-res Thumbnail & Overlays */}
                <div className="relative aspect-video w-full bg-black overflow-hidden border-b border-gray-900">
                  <img
                    src={stream.thumbnail_url}
                    alt={stream.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Glowing Live badge on Thumbnail */}
                  <span className="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider shadow-lg animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    🔴 LIVE
                  </span>

                  {/* Viewers badge on Thumbnail */}
                  {stream.viewers_count && (
                    <span className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md text-red-400 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-red-500/20">
                      <Flame className="w-3.5 h-3.5 text-red-500" />
                      {formatStreamViewers(stream.viewers_count)}
                    </span>
                  )}
                </div>

                {/* Stream Description & Actions */}
                <div className="p-4 space-y-3.5">
                  <div>
                    <span className="text-[9px] font-black text-red-500 uppercase tracking-widest block mb-1">
                      Now Broadcasting on YouTube
                    </span>
                    <h3 className="text-xs sm:text-sm font-black text-white tracking-wide leading-snug line-clamp-2 group-hover:text-red-400 transition-colors">
                      {stream.title}
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                      Watch the ultimate Esports action. Check details, real-time rosters, and support your favorite players directly from the YouTube feed.
                    </p>
                  </div>

                  <div className="pt-1.5 flex items-center justify-between border-t border-gray-800/80">
                    <span className="text-[9px] text-gray-500">
                      Streaming Server: YouTube Live
                    </span>

                    <a
                      href={stream.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-[10px] font-black tracking-widest shadow-md hover:shadow-red-500/10 transition-all active:scale-95 uppercase"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      WATCH ON YOUTUBE
                    </a>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
