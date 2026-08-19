const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanelModal.tsx', 'utf8');

const additional = `
  const loadLeaderboardVideos = async () => {
    try {
      const lv = await fetchLeaderboardVideosApi();
      if (Array.isArray(lv)) setLeaderboardVideos(lv);
    } catch (e) {
      console.warn('Error loading leaderboard videos:', e);
    }
  };
`;

const startIndex = content.indexOf('  const playNotificationSound = () => {');
if (startIndex !== -1) {
    content = content.substring(0, startIndex) + additional + content.substring(startIndex);
    fs.writeFileSync('src/components/AdminPanelModal.tsx', content);
    console.log("Patched loadLeaderboardVideos successfully.");
} else {
    console.log("Could not find insertion point");
}
