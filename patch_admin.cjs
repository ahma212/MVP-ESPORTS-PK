const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanelModal.tsx', 'utf8');

const replacement = `  const handleApproveTxClick = async (e: React.MouseEvent, txId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (processingTxIds.includes(txId)) return;
    setProcessingTxIds(prev => [...prev, txId]);

    try {
      const currentAdmin = getLocalProfile();
      const adminId = userProfile?.id || currentAdmin?.id || 'admin';

      console.log(\`[Admin] handleApproveTxClick: txId=\${txId}, adminId=\${adminId}\`);

      // Check if it's a withdrawal request
      const isWithdrawal = activeTab === 'withdrawals' || realtimeWithdrawalRequests.some(r => r.id === txId);

      if (isWithdrawal && supabase) {
          const { error: rpcErr } = await supabase.rpc('approve_withdrawal', { request_id: txId, admin_id: adminId });
          if (rpcErr) {
             console.warn('approve_withdrawal RPC error, trying alternative:', rpcErr);
             await supabase.rpc('approve_withdrawal', { id: txId });
          }
          await supabase.from('withdrawal_requests').update({ status: 'approved' }).eq('id', txId);
          await supabase.from('wallet_transactions').update({ status: 'approved' }).eq('id', txId);
      }

      await updateLocalTransactionStatus(txId, 'approved');

      // Filter out approved transaction from pending lists
      setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
      setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));

      // Force UI refresh & update parent state
      await onApproveTransaction(txId);
      if (onDataRefresh) {
        onDataRefresh();
      }
      // Re-fetch only if needed
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } catch (err: any) {
      console.error('[Admin] Approval exception:', err);
      alert(err?.message || "Approval failed: Player ID not found or balance update error");
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } finally {
      setTimeout(() => {
        setProcessingTxIds(prev => prev.filter(id => id !== txId));
      }, 1000);
    }
  };

  const handleRejectTxClick = async (e: React.MouseEvent, txId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (processingTxIds.includes(txId)) return;
    setProcessingTxIds(prev => [...prev, txId]);

    try {
      const currentAdmin = getLocalProfile();
      const adminId = userProfile?.id || currentAdmin?.id || 'admin';

      const isWithdrawal = activeTab === 'withdrawals' || realtimeWithdrawalRequests.some(r => r.id === txId);

      if (isWithdrawal && supabase) {
          const { error: rpcErr } = await supabase.rpc('reject_withdrawal', { request_id: txId, admin_id: adminId });
          if (rpcErr) {
             console.warn('reject_withdrawal RPC error, trying alternative:', rpcErr);
             await supabase.rpc('reject_withdrawal', { id: txId });
          }
          await supabase.from('withdrawal_requests').update({ status: 'rejected' }).eq('id', txId);
          await supabase.from('wallet_transactions').update({ status: 'rejected' }).eq('id', txId);
      }

      await updateLocalTransactionStatus(txId, 'rejected');

      setRealtimeDepositRequests(prev => prev.filter(r => r.id !== txId));
      setRealtimeWithdrawalRequests(prev => prev.filter(r => r.id !== txId));

      await onRejectTransaction(txId);
      if (onDataRefresh) {
        onDataRefresh();
      }
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } catch (err: any) {
      console.error('[Admin] Rejection exception:', err);
      alert(err?.message || 'Error rejecting transaction');
      if (activeTab === 'deposits') fetchPendingDepositRequests();
      if (activeTab === 'withdrawals') fetchPendingWithdrawalRequests();
    } finally {
      setTimeout(() => {
        setProcessingTxIds(prev => prev.filter(id => id !== txId));
      }, 1000);
    }
  };`;

// Regex to replace both handleApproveTxClick and handleRejectTxClick completely
const regex = /const handleApproveTxClick = async \(e: React\.MouseEvent, txId: string\) => \{[\s\S]*?const handleRejectTxClick = async \(e: React\.MouseEvent, txId: string\) => \{[\s\S]*?\}\s*?\};\s/m;

// Let's use a simpler replace strategy: just find the index of `const handleApproveTxClick` and `const fetchPendingDepositRequests`
const startIndex = content.indexOf('const handleApproveTxClick = async');
const endIndex = content.indexOf('const fetchPendingDepositRequests', startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + replacement + '\n\n  ' + content.substring(endIndex);
    fs.writeFileSync('src/components/AdminPanelModal.tsx', content);
    console.log("Patched AdminPanelModal successfully.");
} else {
    console.log("Failed to patch AdminPanelModal.", startIndex, endIndex);
}
