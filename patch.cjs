const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const mappingLogic = `
        const txMap = new Map<string, any>();

        if (sbDep) {
          sbDep.forEach((dep: any) => {
            txMap.set(String(dep.id), {
              id: dep.id,
              player_id: dep.player_id || dep.user_id,
              user_id: dep.player_id || dep.user_id,
              amount: Number(dep.amount || 0),
              type: 'deposit',
              payment_method: dep.payment_method || 'JazzCash',
              trx_id: dep.trx_id || '',
              account_title: dep.sender_name || '',
              sender_name: dep.sender_name || '',
              screenshot_url: dep.screenshot_url || '',
              status: dep.status || 'pending',
              created_at: dep.created_at || new Date().toISOString()
            });
          });
        }

        if (sbWd) {
          sbWd.forEach((wd: any) => {
            const existing = txMap.get(String(wd.id));
            if (existing) {
              existing.status = wd.status || existing.status;
            } else {
              txMap.set(String(wd.id), {
                id: wd.id,
                player_id: wd.player_id || wd.user_id,
                user_id: wd.player_id || wd.user_id,
                amount: Number(wd.amount || 0),
                type: 'withdrawal',
                payment_method: wd.payment_method || 'JazzCash',
                account_number: wd.account_number || '',
                account_title: wd.account_title || '',
                trx_id: wd.trx_id || '',
                screenshot_url: wd.screenshot_url || '',
                status: wd.status || 'pending',
                created_at: wd.created_at || new Date().toISOString()
              });
            }
          });
        }

        if (sbTx) {
          sbTx.forEach((tx: any) => {
            const existing = txMap.get(String(tx.id));
            if (existing) {
              if (tx.status) existing.status = tx.status;
              if (tx.payment_method) existing.payment_method = tx.payment_method;
              if (tx.trx_id) existing.trx_id = tx.trx_id;
            } else {
              txMap.set(String(tx.id), {
                id: tx.id,
                player_id: tx.user_id,
                user_id: tx.user_id,
                amount: Number(tx.amount || 0),
                type: tx.type || 'deposit',
                payment_method: tx.payment_method || 'JazzCash',
                account_number: tx.account_number || '',
                account_title: tx.account_title || tx.sender_name || '',
                sender_name: tx.sender_name || tx.account_title || '',
                trx_id: tx.trx_id || '',
                screenshot_url: tx.screenshot_url || '',
                status: tx.status || 'pending',
                created_at: tx.created_at || new Date().toISOString()
              });
            }
          });
        }

        const mergedList = Array.from(txMap.values());
        mergedList.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        
        const formattedTxs: any[] = mergedList.map(t => ({
            id: String(t.id),
            user_id: t.user_id,
            user_email: t.user_email || '',
            user_name: t.user_name || '',
            username: t.username || '',
            amount: Number(t.amount || 0),
            type: t.type || 'deposit',
            payment_method: t.payment_method || 'JazzCash',
            account_number: t.account_number || '',
            account_title: t.account_title || '',
            sender_name: t.sender_name || t.account_title || '',
            trx_id: t.trx_id || '',
            screenshot_url: t.screenshot_url || '',
            status: ['approved', 'completed'].includes(String(t.status).toLowerCase()) ? 'approved' : String(t.status).toLowerCase() === 'rejected' ? 'rejected' : 'pending',
            note: t.note || '',
            created_at: t.created_at || new Date().toISOString(),
            updated_at: t.updated_at
        }));

        setTransactions(formattedTxs);
        localStorage.setItem('mvp_esports_transactions', JSON.stringify(formattedTxs));`;

content = content.replace(
  /const txMap = new Map<string, any>\(\);\s*\/\/ \(The mapping logic I have from before\)\s*\/\/ \.\.\. \(This is too long, I will use multi_edit_file to insert it more cleanly\)/g,
  mappingLogic
);

fs.writeFileSync('src/App.tsx', content);
