const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\/\/ 2\. Perform Supabase Operations FIRST\s+if \(isSupabaseConfigured\(\) && supabase\) \{\s+\/\/ Insert into withdrawal_requests\s+await insertWithdrawalRequestToSupabase\(\{[\s\S]*?\}\);\s+\/\/ Insert into wallet_transactions\s+await supabase\.from\('wallet_transactions'\)\.insert\(\[\{[\s\S]*?\}\]\);\s+\}/;

const replacement = `// 2. Perform Supabase Operations FIRST
      if (isSupabaseConfigured() && supabase) {
          // Insert into withdrawal_requests
          const { error: insertErr } = await supabase.from('withdrawal_requests').insert([{
            id: newTx.id,
            player_id: userProfile.id,
            user_id: userProfile.id,
            username: userProfile.username || '',
            amount,
            method,
            payment_method: method,
            account_number: accountNumber,
            account_title: accountTitle,
            screenshot_url: finalScreenshotUrl,
            status: 'pending',
            created_at: newTx.created_at
          }]);

          if (insertErr) {
              throw new Error("Withdrawal insert failed: " + insertErr.message);
          }

          // Insert into wallet_transactions
          const { error: txErr } = await supabase.from('wallet_transactions').insert([{
            id: newTx.id,
            user_id: userProfile.id,
            amount,
            type: 'withdrawal',
            payment_method: method,
            account_number: accountNumber,
            account_title: accountTitle,
            screenshot_url: finalScreenshotUrl,
            status: 'pending',
            created_at: newTx.created_at
          }]);
          
          if (txErr) {
              throw new Error("Wallet transaction insert failed: " + txErr.message);
          }
      }`;

if(content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/App.tsx', content);
    console.log("Patched handleSubmitWithdrawal successfully.");
} else {
    console.log("Failed to match regex in App.tsx");
}
