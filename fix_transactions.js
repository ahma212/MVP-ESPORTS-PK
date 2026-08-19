const fs = require('fs');

const appPath = 'src/App.tsx';
let appCode = fs.readFileSync(appPath, 'utf8');

appCode = appCode.replace(/getLocalTransactions\(\)/g, "await fetchTransactions()");
appCode = appCode.replace(/getLocalTransactions/g, "fetchTransactions");
appCode = appCode.replace(/fetchTransactions\(userProfile.id\)/g, "await fetchTransactions(userProfile.id)");

fs.writeFileSync(appPath, appCode);
