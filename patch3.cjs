const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const regex = /export async function adminApproveDeposit\(txId: string, adminId\?: string\): Promise<\{ success: boolean; message: string \}> \{[\s\S]*?return \{ success: false, message: "Approval failed: Player ID not found or balance update error" \};\n  \}\n\}/m;

const replacement = `export async function adminApproveDeposit(txId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
  console.log(\`[adminApproveDeposit] Approving deposit for txId: \${txId}, adminId: \${adminId}\`);
  try {
    if (!txId) {
      return { success: false, message: "Approval failed: Player ID not found or balance update error" };
    }

    if (!isSupabaseConfigured() || !supabase) {
      // Offline / Local storage fallback
      const allLocal = getLocalTransactions();
      const target = allLocal.find(t => t.id === txId);
      if (!target || !target.user_id) {
        return { success: false, message: "Approval failed: Player ID not found or balance update error" };
      }
      target.status = 'approved';
      localStorage.setItem('mvp_esports_transactions', JSON.stringify(allLocal));

      const allProfs = getAllProfiles();
      const prof = allProfs.find(p => p.id === target.user_id);
      if (prof) {
        prof.wallet_balance = Number(prof.wallet_balance || 0) + Number(target.amount || 0);
        saveAllProfiles(allProfs);
      }
      return { success: true, message: "Deposit approved successfully" };
    }

    // 1. Fetch deposit request to get player_id and amount
    let playerId: string | null = null;
    let username: string | null = null;
    let amount = 0;
    let paymentMethod = 'jazzcash';
    let depData: any = null;

    const { data: depReq } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('id', txId)
      .maybeSingle();

    if (depReq) {
      depData = depReq;
      playerId = depReq.player_id || depReq.user_id || null;
      username = depReq.username || null;
      amount = Number(depReq.amount || 0);
      paymentMethod = depReq.payment_method || 'jazzcash';
    } else {
      // Fallback: check wallet_transactions table
      const { data: txReq } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', txId)
        .maybeSingle();

      if (txReq) {
        playerId = txReq.user_id || null;
        username = txReq.username || null;
        amount = Number(txReq.amount || 0);
        paymentMethod = txReq.payment_method || 'jazzcash';
      }
    }

    if (!playerId && !username) {
      const { data: fallbackDep } = await supabase
        .from('deposit_requests')
        .select('player_id, user_id, amount, username')
        .eq('id', txId)
        .maybeSingle();

      if (fallbackDep) {
        playerId = fallbackDep.player_id || fallbackDep.user_id || null;
        username = fallbackDep.username || null;
        if (amount === 0) amount = Number(fallbackDep.amount || 0);
      }
    }

    if (!playerId && username) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle();
      if (p) playerId = p.id;
    }
    
    if (!playerId && !username) {
      console.error('[adminApproveDeposit] Player ID/Username not found for deposit request:', txId);
      return { success: false, message: "Approval failed: Player ID not found or balance update error" };
    }

    // 2. Direct single RPC call: approve_deposit
    const effectiveAdminId = adminId || 'admin';
    let rpcSuccess = false;
    
    try {
      const { error: rpcErr } = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId,
        p_username: username // Using username as requested
      });
      if (!rpcErr) {
        rpcSuccess = true;
        console.log('[adminApproveDeposit] RPC approve_deposit succeeded');
      } else {
        console.warn('[adminApproveDeposit] RPC approve_deposit error:', rpcErr);
        // Try without p_username as a fallback
        const { error: rpcErr2 } = await supabase.rpc('approve_deposit', {
          request_id: txId,
          admin_id: effectiveAdminId
        });
        if (!rpcErr2) {
           rpcSuccess = true;
        }
      }
    } catch (rpcEx) {
      console.warn('[adminApproveDeposit] RPC call exception:', rpcEx);
    }

    // 3. Fallback: if RPC fails, manually update wallet_balance in profiles table and update request statuses
    if (!rpcSuccess) {
      let prof: any = null;
      if (username) {
        const { data } = await supabase
          .from('profiles')
          .select('id, wallet_balance')
          .ilike('username', username)
          .maybeSingle();
        prof = data;
      }
      
      if (!prof && playerId) {
        const { data } = await supabase
          .from('profiles')
          .select('id, wallet_balance')
          .eq('id', playerId)
          .maybeSingle();
        prof = data;
      }
      
      if (prof) {
        playerId = prof.id; // Correct playerId
        const currentBal = Number(prof.wallet_balance || 0);
        const newBalance = currentBal + amount;
        await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', prof.id);
      }
    }

    // Update deposit_requests status
    await supabase.from('deposit_requests').update({ status: 'approved' }).eq('id', txId);

    if (playerId) {
      // Upsert wallet_transactions status
      await supabase.from('wallet_transactions').upsert([{
        id: txId,
        user_id: playerId,
        amount: amount,
        type: 'deposit',
        payment_method: paymentMethod,
        sender_name: depData?.sender_name || '',
        account_title: depData?.sender_name || '',
        trx_id: depData?.trx_id || '',
        screenshot_url: depData?.screenshot_url || null,
        status: 'approved',
        created_at: depData?.created_at || new Date().toISOString()
      }]);

      // 4. Create notification for the player
      try {
        await createNotification({
          user_id: playerId,
          title: 'Deposit Approved',
          message: \`✅ Your deposit of Rs. \${amount} via \${paymentMethod} has been approved and added to your wallet!\`,
          is_read: false,
          type: 'deposit'
        });
      } catch (e) {
        console.warn('Notification creation warning:', e);
      }
    }

    return { success: true, message: 'Deposit approved and wallet balance updated successfully!' };
  } catch (err: any) {
    console.error('[adminApproveDeposit] Exception:', err);
    return { success: false, message: "Approval failed: Player ID not found or balance update error" };
  }
}`;

if (regex.test(code)) {
  fs.writeFileSync('src/lib/supabase.ts', code.replace(regex, replacement));
  console.log('Patch 3 successful');
} else {
  console.log('Target not found in patch 3');
}
