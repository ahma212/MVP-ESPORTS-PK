const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const regex = /\/\/ 2\. Direct single RPC call: approve_deposit[\s\S]*?\/\/ Update deposit_requests status/m;

const replacement = `// 2. Direct single RPC call: approve_deposit
    const effectiveAdminId = adminId || 'admin';
    
    try {
      const rpcResponse = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId,
        p_username: username // Using username as requested
      });
      console.log('[adminApproveDeposit] RPC Response:', rpcResponse);
      
      if (rpcResponse.error) {
        console.warn('[adminApproveDeposit] RPC approve_deposit error:', rpcResponse.error);
        const fallbackRpc = await supabase.rpc('approve_deposit', {
          request_id: txId,
          admin_id: effectiveAdminId
        });
        console.log('[adminApproveDeposit] Fallback RPC Response:', fallbackRpc);
      }
    } catch (rpcEx) {
      console.warn('[adminApproveDeposit] RPC call exception:', rpcEx);
    }

    // 3. Direct fallback query that updates the wallet_balance using the 'username'
    if (username) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, wallet_balance')
        .ilike('username', username)
        .maybeSingle();
        
      if (prof) {
        playerId = prof.id; // Correct playerId
        const currentBal = Number(prof.wallet_balance || 0);
        const newBalance = currentBal + amount;
        await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', prof.id);
        console.log(\`[adminApproveDeposit] Fallback updated wallet_balance to \${newBalance} for \${username}\`);
      }
    } else if (playerId) {
      // Also try with playerId if username wasn't available
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
          .eq('id', prof.id);
      }
    }

    // Update deposit_requests status`;

if (regex.test(code)) {
  fs.writeFileSync('src/lib/supabase.ts', code.replace(regex, replacement));
  console.log('Patch 4 successful');
} else {
  console.log('Target not found in patch 4');
}
