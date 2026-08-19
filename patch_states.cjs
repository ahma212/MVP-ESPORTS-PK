const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanelModal.tsx', 'utf8');

const statesToAdd = `
  const [realtimeDepositRequests, setRealtimeDepositRequests] = useState<any[]>([]);
  const [realtimeWithdrawalRequests, setRealtimeWithdrawalRequests] = useState<any[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<AccountDeletionRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<any[]>([]);
  const [banUsername, setBanUsername] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('24h');
  const [leaderboardVideos, setLeaderboardVideos] = useState<any[]>([]);
  const [uploadingSlots, setUploadingSlots] = useState<{ [key: string]: boolean }>({});
  const [uploadSuccess, setUploadSuccess] = useState<{ [key: string]: boolean }>({});
  const [newDepositRequestsBadge, setNewDepositRequestsBadge] = useState(false);
  const [deleteConfirmMatchId, setDeleteConfirmMatchId] = useState<string | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamViewers, setStreamViewers] = useState(0);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch(e){}
  };
`;

const startIndex = content.indexOf('  const handleApproveTxClick = async');
if (startIndex !== -1) {
    content = content.substring(0, startIndex) + statesToAdd + content.substring(startIndex);
    fs.writeFileSync('src/components/AdminPanelModal.tsx', content);
    console.log("Patched states successfully.");
} else {
    console.log("Could not find insertion point");
}
