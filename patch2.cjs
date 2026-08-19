const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const target = `    try {
      const { error: rpcErr } = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId
      });
      if (!rpcErr) {
        rpcSuccess = true;
        console.log('[adminApproveDeposit] RPC approve_deposit succeeded');
      } else {
        console.warn('[adminApproveDeposit] RPC approve_deposit error:', rpcErr);
      }
    } catch (rpcEx) {
      console.warn('[adminApproveDeposit] RPC call exception:', rpcEx);
    }

    // 3. Fallback: if RPC fails, manually update wallet_balance in profiles table and update request statuses
    if (!rpcSuccess) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, wallet_balance')
        .eq('id', playerId)
        .maybeSingle();
      if (prof) {
        const currentBal = Number(prof.wallet_balance || 0);
        const newBalance = currentBal + amount;
        await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', playerId);
      }
    }`;

const replacement = `    try {
      const { error: rpcErr } = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId,
        p_username: username
      });
      if (!rpcErr) {
        rpcSuccess = true;
        console.log('[adminApproveDeposit] RPC approve_deposit succeeded');
      } else {
        console.warn('[adminApproveDeposit] RPC approve_deposit error:', rpcErr);
        const { error: rpcErr2 } = await supabase.rpc('approve_deposit', {
          request_id: txId,
          admin_id: effectiveAdminId
        });
        if (!rpcErr2) rpcSuccess = true;
      }
    } catch (rpcEx) {
      console.warn('[adminApproveDeposit] RPC call exception:', rpcEx);
    }

    // 3. Fallback: if RPC fails, manually update wallet_balance in profiles table and update request statuses
    if (!rpcSuccess) {
      let prof: any = null;
      if (username) {
        const { data } = await supabase.from('profiles').select('id, wallet_balance').ilike('username', username).maybeSingle();
        prof = data;
      }
      if (!prof && playerId) {
        const { data } = await supabase.from('profiles').select('id, wallet_balance').eq('id', playerId).maybeSingle();
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
    }`;

if (code.includes(target)) {
  fs.writeFileSync('src/lib/supabase.ts', code.replace(target, replacement));
  console.log('Patch successful');
} else {
  console.log('Target not found');
}
