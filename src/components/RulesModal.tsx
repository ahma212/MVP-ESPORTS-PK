import React, { useState, useEffect } from 'react';
import { X, ScrollText, AlertCircle, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchRulesList, supabase } from '../lib/supabase';
import { Rule } from '../types';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [rulesList, setRulesList] = useState<Rule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadRules();

      // Realtime subscription on rules so players see updates without refresh.
      if (supabase) {
        const channel = supabase
          .channel('realtime-rules-player-modal')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rules' },
            () => {
              console.log('⚡ Realtime rules update received in RulesModal');
              silentReload();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    }
  }, [isOpen]);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const list = await fetchRulesList();
      setRulesList(list);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const silentReload = async () => {
    try {
      const list = await fetchRulesList();
      setRulesList(list);
    } catch (err) {
      console.error('Failed to silently reload rules:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-0 w-full h-full min-h-screen z-50 bg-slate-950 flex flex-col justify-between overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 md:px-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <ScrollText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-1.5">
                  Rules & Regulations <span className="text-base">📜</span>
                </h2>
                <p className="text-xs text-slate-400 font-medium">Please read carefully before playing</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
              id="close-rules-modal"
            >
              <X className="w-5 h-5 text-slate-400 group-hover:text-white" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-10 custom-scrollbar bg-slate-950">
            <div className="max-w-3xl mx-auto w-full space-y-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                  <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-slate-400 animate-pulse text-sm font-semibold">Loading platform rules...</p>
                </div>
              ) : rulesList.length === 0 ? (
                <div className="text-center py-20 px-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
                  <ScrollText className="w-10 h-10 text-slate-600 mx-auto mb-4 opacity-50" />
                  <p className="text-base text-slate-300 font-extrabold uppercase tracking-wide">
                    No rules have been set yet. Please check back later.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Contact the administrator if you have any urgent questions.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Dynamic Rules Cards */}
                  {rulesList.map((rule) => (
                    <div 
                      key={rule.id}
                      className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-inner"
                    >
                      <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-3 mb-4">
                        <h3 className="text-sm md:text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full inline-block" />
                          {rule.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold shrink-0">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>Updated: {new Date(rule.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <p className="whitespace-pre-wrap text-slate-300 leading-relaxed font-medium text-sm md:text-base selection:bg-blue-500/30">
                        {rule.content}
                      </p>
                    </div>
                  ))}
                  
                  {/* Warning Footer */}
                  <div className="flex items-start gap-3.5 p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs md:text-sm text-amber-200/80 leading-relaxed font-medium italic">
                      Violating any of the above rules will result in an immediate and permanent ban from the platform without refund.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="p-4 md:px-8 border-t border-slate-800 bg-slate-900/90 backdrop-blur-md flex justify-end items-center">
            <div className="max-w-3xl mx-auto w-full flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-black rounded-xl transition-all shadow-lg shadow-blue-500/10 active:scale-95 whitespace-nowrap"
              >
                Understood, Close
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
