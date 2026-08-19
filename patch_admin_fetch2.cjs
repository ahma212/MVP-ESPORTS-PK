const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanelModal.tsx', 'utf8');

const regex = /  const fetchPendingDepositRequests = async \(\) => \{[\s\S]*?setRealtimeDepositRequests\(Array\.from\(combinedMap\.values\(\)\)\);\n    \} catch \(err\) \{\n      console\.error\('Exception in fetchPendingDepositRequests:', err\);\n    \}\n  \};/m;

const newFetchDep = `  const fetchPendingDepositRequests = async () => {
    if (!supabase) return;
    try {
      const { data: depData } = await supabase
        .from('deposit_requests')
        .select('*, profiles(username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const combinedMap = new Map<string, any>();
      if (depData) {
        depData.forEach((d: any) => {
          const playerId = d.player_id;
          const prof = d.profiles;
          const rawUname = d.username || prof?.username || '';
          const cleanUname = String(rawUname).replace(/^@+/, '');
          combinedMap.set(d.id, {
            id: d.id,
            player_id: playerId,
            username: cleanUname,
            amount: Number(d.amount || 0),
            type: 'deposit',
            payment_method: d.payment_method || 'JazzCash/EasyPaisa',
            account_number: d.account_number || '',
            account_title: d.account_title || d.sender_name || '',
            sender_name: d.sender_name || d.account_title || '',
            trx_id: d.transaction_id || d.trx_id || '',
            screenshot_url: d.screenshot_url || '',
            status: 'pending',
            created_at: d.created_at || new Date().toISOString()
          });
        });
      }
      setRealtimeDepositRequests(Array.from(combinedMap.values()));
    } catch (err) {
      console.error('Exception in fetchPendingDepositRequests:', err);
    }
  };`;

if (regex.test(code)) {
  fs.writeFileSync('src/components/AdminPanelModal.tsx', code.replace(regex, newFetchDep));
  console.log('Patch successful');
} else {
  console.log('Target not found');
}
