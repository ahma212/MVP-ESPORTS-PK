import React, { useState } from 'react';
import { X, Trash2, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';
import { saveDeletionRequest, getDeletionRequests } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

interface DeletionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

export const DeletionRequestModal: React.FC<DeletionRequestModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const reasons = [
    "Leaving Platform",
    "Privacy Concerns",
    "Account Security Issues",
    "Switching to another account",
    "Other"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    const finalReason = reason === 'Other' ? customReason : reason;
    if (reason === 'Other' && !customReason.trim()) return;

    setIsSubmitting(true);

    // Check for existing pending request
    const allRequests = await getDeletionRequests();
    const existing = allRequests.find(r => r.user_id === userProfile.id && r.status === 'pending');
    if (existing) {
      alert("You already have a pending deletion request. Please wait for Admin approval.");
      setIsSubmitting(false);
      onClose();
      return;
    }

    const request = {
      id: crypto.randomUUID(),
      user_id: userProfile.id,
      username: userProfile.username,
      reason: finalReason,
      status: 'pending' as const,
      created_at: new Date().toISOString()
    };

    await saveDeletionRequest(request);
    
    setIsSuccess(true);
    setIsSubmitting(false);

    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 3000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-md bg-[#040e1a] border border-red-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-red-500/10"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-red-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Account Deletion</h3>
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-tighter">Request permanent removal</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isSuccess ? (
              <div className="p-12 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h4 className="text-white font-black text-sm uppercase tracking-widest mb-2">Request Submitted!</h4>
                <p className="text-gray-400 text-xs leading-relaxed max-w-[240px] mx-auto">
                  Your deletion request has been sent to Admin for approval. This process usually takes 24-48 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-[10px] text-red-400/80 font-medium leading-relaxed uppercase tracking-tight">
                    Warning: Deleting your account is permanent. All your stats, wallet balance, and tournament history will be lost forever.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block ml-1">Username</label>
                    <input
                      type="text"
                      disabled
                      value={userProfile.username}
                      className="w-full px-4 py-3 rounded-xl bg-[#030a16] border border-gray-800 text-gray-400 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block ml-1">Reason for Deletion</label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#030a16] border border-gray-800 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all appearance-none cursor-pointer"
                      required
                    >
                      <option value="" disabled>Select a reason...</option>
                      {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  {reason === 'Other' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <textarea
                        placeholder="Please explain your reason..."
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[#030a16] border border-gray-800 text-white text-xs font-medium focus:outline-none focus:border-red-500 transition-all h-24 resize-none"
                        required
                      />
                    </motion.div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !reason || (reason === 'Other' && !customReason.trim())}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Deletion Request
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
