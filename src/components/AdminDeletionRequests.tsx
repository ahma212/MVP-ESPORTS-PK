import React, { useState, useEffect } from 'react';
import { Trash2, X, Check, Search, Calendar, AlertCircle, UserX, UserCheck } from 'lucide-react';
import { AccountDeletionRequest } from '../types';
import { getDeletionRequests, updateDeletionRequestStatus, deleteUserAccount, supabase, isSupabaseConfigured } from '../lib/supabase';

export const AdminDeletionRequests: React.FC = () => {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const refreshRequests = async () => {
    try {
      const data = await getDeletionRequests();
      if (Array.isArray(data)) {
        setRequests(data);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.warn('Error refreshing deletion requests:', err);
      setRequests([]);
    }
  };

  useEffect(() => {
    refreshRequests();
    window.addEventListener('storage', refreshRequests);
    return () => window.removeEventListener('storage', refreshRequests);
  }, []);

  const handleAccept = async (request: AccountDeletionRequest) => {
    if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY DELETE account @${request.username}? This action is irreversible.`)) {
      return;
    }

    const originalRequests = [...requests];
    setIsDeleting(request.id);

    try {
      // Optimistic update: remove from local state immediately
      setRequests(prev => prev.filter(r => r.username !== request.username));

      if (isSupabaseConfigured() && supabase) {
        // Step A: Update request status
        await supabase
          .from('deletion_requests')
          .update({ status: 'accepted' })
          .eq('username', request.username);
        
        // Step B: Delete user record
        await supabase
          .from('profiles')
          .delete()
          .eq('username', request.username);
      }
      
      // Fallback for local storage
      await updateDeletionRequestStatus(request.id, 'accepted');
      await deleteUserAccount(request.user_id);
      
      alert(`Account @${request.username} permanently deleted!`);
    } catch (error) {
      console.error('Failed to delete account:', error);
      // Rollback on error
      setRequests(originalRequests);
      alert('Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleReject = async (request: AccountDeletionRequest) => {
    if (!window.confirm(`Reject deletion request for @${request.username}?`)) {
      return;
    }

    const originalRequests = [...requests];
    try {
      // Optimistic update: remove from local state immediately
      setRequests(prev => prev.filter(r => r.username !== request.username));

      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from('deletion_requests')
          .update({ status: 'rejected' })
          .eq('username', request.username);
      }

      // Fallback for local storage
      await updateDeletionRequestStatus(request.id, 'rejected');
      
      alert(`Request for @${request.username} rejected.`);
    } catch (error) {
      console.error('Failed to reject request:', error);
      // Rollback on error
      setRequests(originalRequests);
      alert('Failed to reject request. Please try again.');
    }
  };

  const filteredRequests = requests.filter(r => 
    r.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reason.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#07192e] p-4 rounded-2xl border border-gray-800">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-500" />
            Delete Account Requests
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Manage pending user deletion requests</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by username or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#030a16] border border-gray-800 text-white text-xs font-bold focus:outline-none focus:border-red-500 transition-all"
          />
        </div>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="bg-[#07192e] border border-dashed border-gray-800 rounded-3xl p-12 text-center">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
            <UserCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h4 className="text-white font-black text-sm uppercase tracking-widest mb-1">All Clear!</h4>
          <p className="text-gray-500 text-[10px] font-bold uppercase">No pending account deletion requests found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingRequests.map((req) => (
            <div 
              key={req.id}
              className="bg-[#07192e] border border-gray-800 rounded-3xl overflow-hidden hover:border-red-500/30 transition-all group"
            >
              <div className="p-5 flex flex-col md:flex-row justify-between gap-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-black text-lg shadow-lg">
                    {req.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                      @{req.username}
                      <span className="text-[8px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20 uppercase tracking-widest font-black">Pending</span>
                    </h4>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold uppercase">
                        <Calendar className="w-3 h-3" />
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold uppercase">
                        <AlertCircle className="w-3 h-3" />
                        Reason: {req.reason}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReject(req)}
                    className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-gray-800/50 hover:bg-white/5 text-gray-400 hover:text-white border border-gray-700/50 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject ❌
                  </button>
                  <button
                    onClick={() => handleAccept(req)}
                    disabled={isDeleting === req.id}
                    className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/0 hover:shadow-red-500/20"
                  >
                    {isDeleting === req.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <UserX className="w-3.5 h-3.5" />
                        Accept & Delete 🛑
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History of Rejected Requests */}
      {filteredRequests.filter(r => r.status === 'rejected').length > 0 && (
        <div className="mt-12 space-y-4">
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Recently Rejected</h4>
          <div className="bg-[#030a16] border border-gray-800 rounded-3xl overflow-hidden divide-y divide-gray-800/50">
            {filteredRequests.filter(r => r.status === 'rejected').slice(0, 5).map(req => (
              <div key={req.id} className="p-4 flex justify-between items-center bg-[#07192e]/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 text-[10px] font-black">
                    {req.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[11px] font-black text-gray-300">@{req.username}</span>
                    <p className="text-[8px] text-gray-500 font-bold uppercase">{req.reason}</p>
                  </div>
                </div>
                <div className="text-[8px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700 uppercase font-black">Rejected</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
