const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

code = code.replace(
  `    let playerId: string | null = null;
    let amount = 0;
    let paymentMethod = 'jazzcash';
    let depData: any = null;`,
  `    let playerId: string | null = null;
    let username: string | null = null;
    let amount = 0;
    let paymentMethod = 'jazzcash';
    let depData: any = null;`
);

code = code.replace(
  `      playerId = depReq.player_id || depReq.user_id || null;
      amount = Number(depReq.amount || 0);`,
  `      playerId = depReq.player_id || depReq.user_id || null;
      username = depReq.username || null;
      amount = Number(depReq.amount || 0);`
);

code = code.replace(
  `      if (txReq) {
        playerId = txReq.user_id || null;`,
  `      if (txReq) {
        playerId = txReq.user_id || null;
        username = txReq.username || null;`
);

code = code.replace(
  `      if (fallbackDep) {
        playerId = fallbackDep.player_id || fallbackDep.user_id || null;`,
  `      if (fallbackDep) {
        playerId = fallbackDep.player_id || fallbackDep.user_id || null;
        username = fallbackDep.username || null;`
);

// If we have a username, get playerId from profiles using username
const fallbackLogic = `
    if (!playerId && username) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle();
      if (p) playerId = p.id;
    }
    
    if (!playerId) {
      console.error('[adminApproveDeposit] Player ID not found for deposit request:', txId, 'username:', username);
      return { success: false, message: "Approval failed: Player ID not found or balance update error" };
    }`;

code = code.replace(
  `    if (!playerId) {
      console.error('[adminApproveDeposit] Player ID not found for deposit request:', txId);
      return { success: false, message: "Approval failed: Player ID not found or balance update error" };
    }`,
  fallbackLogic
);

const rpcLogic = `
    const effectiveAdminId = adminId || 'admin';
    let rpcSuccess = false;
    try {
      const { error: rpcErr } = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId,
        p_username: username // Add username to RPC if supported
      });`;

code = code.replace(
  `    const effectiveAdminId = adminId || 'admin';
    let rpcSuccess = false;
    try {
      const { error: rpcErr } = await supabase.rpc('approve_deposit', {
        request_id: txId,
        admin_id: effectiveAdminId
      });`,
  rpcLogic
);

const manualUpdateLogic = `
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
        playerId = prof.id; // ensure playerId is set for later
        const currentBal = Number(prof.wallet_balance || 0);
        const newBalance = currentBal + amount;
        await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', prof.id);
      }
    }`;

code = code.replace(
  `    // 3. Fallback: if RPC fails, manually update wallet_balance in profiles table and update request statuses
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
    }`,
  manualUpdateLogic
);

fs.writeFileSync('src/lib/supabase.ts', code);
