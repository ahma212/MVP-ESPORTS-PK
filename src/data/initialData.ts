import { Match, LeaderboardPlayer, MatchResult } from '../types';

export const INITIAL_MATCH_RESULTS: MatchResult[] = [
  {
    match_id: 'm-201',
    match_title: 'MVP MEGA PUBG CHAMPIONSHIP (SEASON 5)',
    match_type: 'tournament',
    squad_type: 'SQUAD',
    map: 'Erangel',
    match_time: '5 August | 09:00 PM (PKT)',
    total_prize_pool: 10000,
    published_at: new Date(Date.now() - 86400000).toISOString(),
    is_published: true,
    results: [
      { slot_number: 1, player_ign: 'MVP_JOKER', team_name: 'Team 47', kills: 14, is_winner: true, rank: 1, earnings: 5700 },
      { slot_number: 2, player_ign: 'iNsaNe_K1LL3R', team_name: 'Insane Esports', kills: 9, is_winner: false, rank: 2, earnings: 2950 },
      { slot_number: 3, player_ign: 'PK_LEGEND', team_name: 'Pakistan Tigers', kills: 7, is_winner: false, rank: 3, earnings: 1350 },
      { slot_number: 4, player_ign: 'GHOST_PUBG', team_name: 'Ghost Operatives', kills: 5, is_winner: false, rank: 4, earnings: 250 },
      { slot_number: 5, player_ign: 'R3DxVIPER', team_name: 'Red Vipers', kills: 4, is_winner: false, rank: 5, earnings: 200 },
      { slot_number: 6, player_ign: 'SHADOW_PK', team_name: 'Shadow Kings', kills: 3, is_winner: false, rank: 6, earnings: 150 },
    ]
  },
  {
    match_id: 'm-202',
    match_title: 'NIGHTLY LIVIK SOLO SURVIVOR',
    match_type: 'solo',
    squad_type: 'SOLO',
    map: 'Livik',
    match_time: '4 August | 10:00 PM (PKT)',
    total_prize_pool: 3500,
    published_at: new Date(Date.now() - 172800000).toISOString(),
    is_published: true,
    results: [
      { slot_number: 1, player_ign: 'iNsaNe_K1LL3R', kills: 11, is_winner: true, rank: 1, earnings: 2330 },
      { slot_number: 2, player_ign: 'PK_LEGEND', kills: 6, is_winner: false, rank: 2, earnings: 180 },
      { slot_number: 3, player_ign: 'SHADOW_PK', kills: 4, is_winner: false, rank: 3, earnings: 120 },
      { slot_number: 4, player_ign: 'MVP_JOKER', kills: 3, is_winner: false, rank: 4, earnings: 90 },
    ]
  },
  {
    match_id: 'm-203',
    match_title: 'SANHOK DUO HIGH SPEED BATTLE',
    match_type: 'duo',
    squad_type: 'DUO',
    map: 'Sanhok',
    match_time: '3 August | 08:30 PM (PKT)',
    total_prize_pool: 5000,
    published_at: new Date(Date.now() - 259200000).toISOString(),
    is_published: true,
    results: [
      { slot_number: 1, player_ign: 'PK_LEGEND', team_name: 'Duo Kings', kills: 10, is_winner: true, rank: 1, earnings: 2900 },
      { slot_number: 2, player_ign: 'R3DxVIPER', team_name: 'Venom Duo', kills: 7, is_winner: false, rank: 2, earnings: 1080 },
      { slot_number: 3, player_ign: 'SHADOW_PK', team_name: 'Shadow Duo', kills: 4, is_winner: false, rank: 3, earnings: 160 },
    ]
  }
];

export const INITIAL_MATCHES: Match[] = [];

export const INITIAL_LEADERBOARD: LeaderboardPlayer[] = [
  { rank: 1, username: 'MVP_JOKER', pubg_id: '5164893012', kills: 142, wins: 18, earnings: 18500, badge: '👑 Dominator' },
  { rank: 2, username: 'iNsaNe_K1LL3R', pubg_id: '5819028341', kills: 128, wins: 15, earnings: 14200, badge: '🔥 Ace Master' },
  { rank: 3, username: 'PK_LEGEND', pubg_id: '5201948172', kills: 110, wins: 12, earnings: 11800, badge: '⚡ Conqueror' },
  { rank: 4, username: 'GHOST_PUBG', pubg_id: '5920194821', kills: 94, wins: 9, earnings: 8500, badge: '🎯 Headshooter' },
  { rank: 5, username: 'R3DxVIPER', pubg_id: '5739102948', kills: 88, wins: 8, earnings: 7100, badge: '💥 Warlord' },
  { rank: 6, username: 'SHADOW_PK', pubg_id: '5119284710', kills: 76, wins: 6, earnings: 5400, badge: '🛡️ Diamond' },
];

export const JAZZCASH_ACCOUNT_DETAILS = {
  accountNumber: '0302 240 96 37',
  accountTitle: 'Muhammad Ahmed',
  bankName: 'JazzCash / Microfinance'
};

export const EASYPAISA_ACCOUNT_DETAILS = {
  accountNumber: '0302 240 96 37',
  accountTitle: 'Muhammad Ahmed',
  bankName: 'Telenor Microfinance Bank / EasyPaisa'
};
