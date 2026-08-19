const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `            try {
              const [depRes, wdRes, txRes] = await Promise.all([
                supabase.from('deposit_requests')
                  .select('id, player_id, username, amount, status, payment_method, trx_id, created_at, sender_name, screenshot_url')
                  .eq('player_id', userProfile.id),
                supabase.from('withdrawal_requests')
                  .select('id, player_id, user_id, amount, status, payment_method, account_number, account_title, created_at, screenshot_url')
                  .eq('player_id', userProfile.id),
                supabase.from('wallet_transactions')
                  .select('id, user_id, amount, type, status, payment_method, account_number, account_title, sender_name, trx_id, screenshot_url, created_at')
                  .eq('user_id', userProfile.id)
              ]);`;

const replacement = `            try {
              const [depRes, wdRes, txRes] = await Promise.all([
                supabase.from('deposit_requests')
                  .select('*')
                  .eq('player_id', userProfile.id),
                supabase.from('withdrawal_requests')
                  .select('*')
                  .eq('player_id', userProfile.id),
                supabase.from('wallet_transactions')
                  .select('*')
                  .eq('user_id', userProfile.id)
              ]);`;

if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('Patch successful');
} else {
  console.log('Target not found');
}
