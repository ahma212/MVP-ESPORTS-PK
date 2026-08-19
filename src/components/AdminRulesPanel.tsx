import React, { useState, useEffect } from 'react';
import { ScrollText, AlertCircle, RefreshCw, Trash2, PlusCircle, Calendar } from 'lucide-react';
import { fetchRulesList, publishRule, deleteRule, supabase } from '../lib/supabase';
import { Rule } from '../types';

export const AdminRulesPanel: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    loadRules();

    // Setup real-time subscription for the 'rules' table
    if (supabase) {
      const channel = supabase
        .channel('realtime-rules-admin')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rules' },
          () => {
            console.log('⚡ Realtime rules update detected in Admin panel');
            silentReload();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, []);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const list = await fetchRulesList();
      setRules(list);
    } catch (err: any) {
      console.error('Failed to load rules:', err);
      alert(`Failed to load rules list: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const silentReload = async () => {
    try {
      const list = await fetchRulesList();
      setRules(list);
    } catch (err) {
      console.error('Failed to silently reload rules:', err);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('Rules content cannot be empty.');
      return;
    }

    setIsPublishing(true);
    const ruleTitle = title.trim() || 'Platform Rules';

    try {
      await publishRule(ruleTitle, content);
      alert('New rule published successfully! 📜');
      setTitle('');
      setContent('');
      await loadRules();
    } catch (err: any) {
      console.error('Failed to publish rule:', err);
      alert(`Failed to publish rule: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRule(id);
      alert('Rule deleted successfully! 📜');
      await loadRules();
    } catch (err: any) {
      console.error('Failed to delete rule:', err);
      alert(`Failed to delete rule: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeletingId(null);
      setDeleteConfirmTarget(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
            <ScrollText className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">Manage Rules & Regulations 📜</h2>
            <p className="text-xs text-gray-400 font-medium">Create, publish, and delete global platform rules</p>
          </div>
        </div>
        
        <button
          onClick={loadRules}
          disabled={isLoading}
          className="p-2.5 rounded-xl bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800 transition-all border border-gray-700/50 disabled:opacity-50"
          title="Refresh Rules"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Editor & Creator Form */}
      <div className="bg-[#0b1329] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-blue-400" />
          Publish New Rule
        </h3>

        <form onSubmit={handlePublish} className="space-y-4">
          {/* Title Field */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
              Rule Title (Optional - Defaults to "Platform Rules")
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Fair Play & Anti-Cheat Policy"
              className="w-full bg-[#030a16] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-600"
            />
          </div>

          {/* Content Textarea */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
              Rule Content (Line breaks are preserved for formatting)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the rule content. Use clear paragraphs, bullets, or numbered lists..."
              rows={6}
              className="w-full bg-[#030a16] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-600 resize-y custom-scrollbar min-h-[120px]"
            />
          </div>

          {/* Publish Trigger Block */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-gray-800/60">
            <div className="flex items-start gap-2 max-w-md">
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                Publishing will immediately insert this rule into the live Supabase database. Players will see it instantly under the "Rules & Regulations" menu.
              </p>
            </div>
            <button
              type="submit"
              disabled={isPublishing || !content.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Publish & Broadcast 🚀</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Rules List Area */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-emerald-400" />
            Currently Published Rules ({rules.length})
          </h3>
          <span className="text-[10px] text-gray-500 font-bold uppercase">Source of Truth: Supabase "rules"</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-[#0b1329]/30 border border-gray-800 rounded-2xl">
            <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-gray-500 animate-pulse text-[11px] font-bold uppercase tracking-wider">Fetching live rule records...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center bg-[#0b1329]/30 border border-gray-800/80 rounded-2xl">
            <ScrollText className="w-8 h-8 text-gray-600 mx-auto mb-2.5 opacity-60" />
            <p className="text-xs text-gray-400 font-extrabold uppercase tracking-wide">No active rules defined yet</p>
            <p className="text-[10px] text-gray-500 mt-1">Use the form above to publish rules to the database.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {rules.map((rule) => (
              <div 
                key={rule.id}
                className="bg-[#0b1329] border border-gray-800 hover:border-gray-700/80 rounded-xl p-5 shadow-md flex flex-col justify-between transition-all relative group overflow-hidden"
              >
                {/* Rule Title and Header */}
                <div className="flex items-start justify-between gap-4 mb-3 border-b border-gray-800/60 pb-2.5">
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                      {rule.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-gray-500" />
                      <span>Published: {new Date(rule.updated_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={deletingId === rule.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirmTarget({ id: rule.id, title: rule.title });
                    }}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black transition-all cursor-pointer disabled:opacity-40"
                    title="Delete Rule"
                  >
                    {deletingId === rule.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Rule Body */}
                <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-medium">
                  {rule.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Delete Confirmation Overlay Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-gray-800 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">
              Confirm Deletion
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              Are you sure you want to delete the rule <strong className="text-red-400">"{deleteConfirmTarget.title}"</strong>? Players will instantly stop seeing this rule on the platform.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await handleDelete(deleteConfirmTarget.id);
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete 🗑️</span>
                )}
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteConfirmTarget(null);
                }}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer transition-all border border-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
