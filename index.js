const fs = require('fs');
const path = require('path');
const config = require('./config');

const BASE_URL = 'https://airdrop.asentum.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

// Palet Warna ANSI Presisi & Modern
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Regular
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright
  bRed: '\x1b[91m',
  bGreen: '\x1b[92m',
  bYellow: '\x1b[93m',
  bBlue: '\x1b[94m',
  bMagenta: '\x1b[95m',
  bCyan: '\x1b[96m',
  bWhite: '\x1b[97m',

  // Badges
  tagSuccess: '\x1b[42m\x1b[30m\x1b[1m SELESAI \x1b[0m',
  tagPending: '\x1b[43m\x1b[30m\x1b[1m PENDING \x1b[0m',
  tagError:   '\x1b[41m\x1b[97m\x1b[1m  ERROR  \x1b[0m'
};

const LINE_WIDTH = 68;
const DIVIDER_BOLD = `${c.bCyan}${'━'.repeat(LINE_WIDTH)}${c.reset}`;
const DIVIDER_THIN = `${c.gray}${'─'.repeat(LINE_WIDTH)}${c.reset}`;

function getTimestamp() {
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  return `${c.gray}[${time}]${c.reset}`;
}

function log(msg, type = 'info', prefix = '') {
  const ts = getTimestamp();
  const p = prefix ? `${c.bCyan}[${prefix}]${c.reset} ` : '';
  let icon = `${c.cyan}ℹ${c.reset}`;
  if (type === 'success') icon = `${c.bGreen}✔${c.reset}`;
  if (type === 'error')   icon = `${c.bRed}✖${c.reset}`;
  if (type === 'warn')    icon = `${c.bYellow}⚠${c.reset}`;
  console.log(`${ts} ${icon} ${p}${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca daftar akun dari accounts.json
function getAccounts() {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      log(`Gagal membaca accounts.json: ${e.message}`, 'warn');
    }
  }

  return [];
}

// Update session token ke accounts.json
function updateAccountSession(accountIndex, newToken, newRefreshToken) {
  try {
    const accounts = getAccounts();
    if (accounts[accountIndex]) {
      accounts[accountIndex].token = newToken;
      if (newRefreshToken) accounts[accountIndex].refreshToken = newRefreshToken;
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
      log(`${c.bGreen}Token baru disimpan ke accounts.json${c.reset}`, 'success', accounts[accountIndex].name);
    }
  } catch (err) {
    log(`Gagal update accounts.json: ${err.message}`, 'warn');
  }
}

// Cek kadaluwarsa token (< 5 menit tersisa)
function isTokenExpiringSoon(token) {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = payload.exp || 0;
    return expSec - nowSec < 300;
  } catch {
    return true;
  }
}

// Auto-refresh token via Privy
async function refreshAccessToken(account, accountIndex) {
  const refreshToken = account.refreshToken;
  const currentToken = account.token;

  if (!refreshToken) {
    log(`${c.yellow}Tidak ada refreshToken untuk akun ini.${c.reset}`, 'warn', account.name);
    return null;
  }

  log(`${c.cyan}Melakukan auto-refresh token ke Privy API...${c.reset}`, 'info', account.name);

  try {
    const res = await fetch('https://auth.privy.io/api/v1/sessions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${currentToken}`,
        'content-type': 'application/json',
        'privy-app-id': config.PRIVY_APP_ID || 'cmq6jimt9001b0cjrwxo31on8',
        'privy-ca-id': config.PRIVY_CA_ID || 'e94213c6-ff73-4560-9315-baab66369202',
        'privy-client': 'react-auth:2.25.0',
        'origin': BASE_URL,
        'referer': `${BASE_URL}/`,
        'user-agent': USER_AGENT
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.token) {
      const newToken = data.token;
      const newRefreshToken = data.refresh_token || refreshToken;
      updateAccountSession(accountIndex, newToken, newRefreshToken);
      account.token = newToken;
      account.refreshToken = newRefreshToken;
      return newToken;
    } else {
      log(`${c.red}Gagal refresh token: ${data?.error || res.statusText}${c.reset}`, 'error', account.name);
      return null;
    }
  } catch (err) {
    log(`${c.red}Koneksi gagal saat refresh token: ${err.message}${c.reset}`, 'error', account.name);
    return null;
  }
}

// Token getter dengan auto-refresh
async function getValidToken(account, accountIndex) {
  if (isTokenExpiringSoon(account.token)) {
    log(`${c.yellow}Token mendekati kedaluwarsa, memperbarui otomatis...${c.reset}`, 'warn', account.name);
    const freshToken = await refreshAccessToken(account, accountIndex);
    if (freshToken) return freshToken;
  }
  return account.token;
}

// API requester
async function requestApi(endpoint, account, accountIndex, method = 'GET', body = null, isRetry = false) {
  let token = await getValidToken(account, accountIndex);

  const headers = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': `Bearer ${token.trim()}`,
    'origin': BASE_URL,
    'referer': `${BASE_URL}/dashboard`,
    'user-agent': USER_AGENT
  };

  if (body) headers['content-type'] = 'application/json';

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(15000)
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await res.json().catch(() => null);

    // 401 Unauthorized: Coba auto-refresh token lalu ulangi
    if (res.status === 401 && !isRetry) {
      log(`${c.yellow}Mendapat 401 Unauthorized. Mencoba auto-refresh token...${c.reset}`, 'warn', account.name);
      const freshToken = await refreshAccessToken(account, accountIndex);
      if (freshToken) {
        return requestApi(endpoint, account, accountIndex, method, body, true);
      }
    }

    // 429 Rate Limit (kecuali endpoint faucet, karena faucet sengaja return 429 saat cooldown ~6h)
    if (res.status === 429 && endpoint !== '/api/faucet' && !isRetry) {
      log(`${c.yellow}Terkena rate limit server. Menunggu 3 detik lalu ulangi...${c.reset}`, 'warn', account.name);
      await sleep(3000);
      return requestApi(endpoint, account, accountIndex, method, body, true);
    }

    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError';
    const errMsg = isTimeout ? 'Request timeout (koneksi lambat >15s)' : err.message;
    log(`${c.red}Koneksi gagal ke ${endpoint}: ${errMsg}${c.reset}`, 'error', account.name);
    return { status: 0, ok: false, error: errMsg, data: null };
  }
}

// Banner Header
function printHeader(totalAccounts) {
  console.log(`\n${DIVIDER_BOLD}`);
  console.log(`  ${c.bWhite}${c.bold}⚡ ASENTUM AIRDROP AUTOMATION${c.reset}  ${c.gray}•${c.reset}  ${c.bGreen}Daily Check-in & Quests${c.reset}`);
  console.log(DIVIDER_BOLD);
  console.log(`  ${c.gray}Total Akun :${c.reset} ${c.bYellow}${totalAccounts} Akun${c.reset}`);
  console.log(`  ${c.gray}Waktu      :${c.reset} ${c.white}${new Date().toLocaleString('id-ID')}${c.reset}`);
  console.log(`${DIVIDER_THIN}\n`);
}

// Proses Akun dengan Card Left-Rail (Bebas Masalah Font & Emoji)
async function processAccount(account, index, totalAccounts) {
  const displayName = account.name || `Akun ${index + 1}`;
  
  console.log(`${c.cyan}┌───${c.reset} ${c.bMagenta}[${index + 1}/${totalAccounts}]${c.reset} ${c.bWhite}${c.bold}${displayName}${c.reset}`);
  console.log(`${c.cyan}│${c.reset}`);

  if (!account.token || account.token.length < 20) {
    console.log(`${c.cyan}│${c.reset}  ${c.bRed}✖ Error: Token kosong atau tidak valid di accounts.json!${c.reset}`);
    console.log(`${c.cyan}└───${c.reset}\n`);
    return { name: displayName, username: '-', xp: 0, checkin: 'GAGAL', faucet: '-' };
  }

  let summaryResult = {
    name: displayName,
    username: '-',
    xp: 0,
    checkin: 'PENDING',
    faucet: '-'
  };

  try {
    // 1. Profil & Streak
    const meRes = await requestApi('/api/me', account, index);
    if (!meRes.ok || !meRes.data?.ok) {
      console.log(`${c.cyan}│${c.reset}  ${c.bRed}✖ Gagal memuat profil: Status ${meRes.status}${c.reset}`);
      console.log(`${c.cyan}└───${c.reset}\n`);
      return { ...summaryResult, checkin: 'ERROR' };
    }

    const user = meRes.data.user;
    const xp = meRes.data.xp;
    summaryResult.username = `@${user.username || 'user'}`;
    summaryResult.xp = xp.total;

    console.log(`${c.cyan}│${c.reset}  ${c.gray}Username :${c.reset} ${c.bGreen}@${user.username || 'User'}${c.reset} ${c.gray}(ID: ${user.id})${c.reset}`);
    console.log(`${c.cyan}│${c.reset}  ${c.gray}Total XP :${c.reset} ${c.bYellow}${xp.total.toLocaleString()} XP${c.reset}  ${c.gray}│${c.reset}  ${c.gray}Rank :${c.reset} ${c.bWhite}#${xp.rank || '-'}${c.reset}  ${c.gray}│${c.reset}  ${c.gray}Streak :${c.reset} ${c.bRed}${xp.streak.current} Hari${c.reset} ${c.gray}(Best: ${xp.streak.longest}d)${c.reset}`);
    console.log(`${c.cyan}│${c.reset}`);

    // 2. Quests
    const questRes = await requestApi('/api/quests', account, index);
    if (questRes.ok && questRes.data?.ok) {
      const quests = questRes.data.quests || [];
      console.log(`${c.cyan}│${c.reset}  ${c.bWhite}${c.bold}Status Misi Harian:${c.reset}`);

      for (const q of quests) {
        const badge = q.done ? c.tagSuccess : c.tagPending;
        const title = q.done ? `${c.gray}${q.title.padEnd(32)}${c.reset}` : `${c.white}${q.title.padEnd(32)}${c.reset}`;
        const xpText = `${c.bCyan}+${q.xp} XP${c.reset}`;
        console.log(`${c.cyan}│${c.reset}  ${badge} ${title} ${xpText}`);

        if (q.key === 'daily:checkin') {
          summaryResult.checkin = q.done ? 'SUKSES' : 'PENDING';
        }
      }
      console.log(`${c.cyan}│${c.reset}`);
    }

    // 3. Faucet
    if (config.AUTO_CLAIM_FAUCET) {
      const faucetRes = await requestApi('/api/faucet', account, index, 'POST');
      if (faucetRes.data?.ok) {
        summaryResult.faucet = '+5 ASE';
        console.log(`${c.cyan}│${c.reset}  ${c.gray}Faucet   :${c.reset} ${c.bGreen}✔ Berhasil diklaim (+5 ASE)${c.reset}`);
      } else {
        const msg = faucetRes.data?.text || faucetRes.data?.error || 'Sedang cooldown (~6h)';
        summaryResult.faucet = 'COOLDOWN';
        console.log(`${c.cyan}│${c.reset}  ${c.gray}Faucet   :${c.reset} ${c.gray}⏳ ${msg}${c.reset}`);
      }
    }

  } catch (err) {
    console.log(`${c.cyan}│${c.reset}  ${c.bRed}✖ Error: ${err.message}${c.reset}`);
  }

  console.log(`${c.cyan}└───${c.reset}\n`);
  return summaryResult;
}

// Tabel Ringkasan Akhir
function printSummaryTable(results) {
  console.log(DIVIDER_BOLD);
  console.log(`  ${c.bWhite}${c.bold}📊 RINGKASAN HASIL EKSEKUSI${c.reset}`);
  console.log(DIVIDER_BOLD);

  // Header Kolom
  const hName = 'NAMA AKUN'.padEnd(25);
  const hUser = 'USERNAME'.padEnd(18);
  const hXp   = 'TOTAL XP'.padEnd(12);
  const hChk  = 'CHECK-IN'.padEnd(12);
  const hFct  = 'FAUCET';
  console.log(`  ${c.gray}${hName}${hUser}${hXp}${hChk}${hFct}${c.reset}`);
  console.log(DIVIDER_THIN);

  // Baris Data
  for (const r of results) {
    const colName = (r.name || '-').slice(0, 23).padEnd(25);
    const colUser = (r.username || '-').slice(0, 17).padEnd(18);
    const colXp   = `${(r.xp || 0).toLocaleString()} XP`.padEnd(12);
    const colChk  = (r.checkin || '-').padEnd(12);
    const colFct  = r.faucet || '-';

    const chkColor = r.checkin === 'SUKSES' ? c.bGreen : c.bYellow;
    const fctColor = r.faucet === '+5 ASE' ? c.bGreen : c.gray;

    console.log(`  ${c.bWhite}${colName}${c.reset}${c.bGreen}${colUser}${c.reset}${c.bYellow}${colXp}${c.reset}${chkColor}${colChk}${c.reset}${fctColor}${colFct}${c.reset}`);
  }

  console.log(`${DIVIDER_BOLD}\n`);
}

// Runner utama
async function runAllAccounts() {
  console.clear();
  const accounts = getAccounts();

  if (accounts.length === 0) {
    console.log(`\n${DIVIDER_BOLD}`);
    console.log(`  ${c.bYellow}⚠ PERINGATAN: Tidak ada akun yang ditemukan di accounts.json!${c.reset}`);
    console.log(`  ${c.gray}Silakan masukkan token akun Anda ke file accounts.json.${c.reset}`);
    console.log(`${DIVIDER_BOLD}\n`);
    return;
  }

  printHeader(accounts.length);

  const results = [];
  const delayMs = (config.DELAY_BETWEEN_ACCOUNTS_SEC || 2) * 1000;

  for (let i = 0; i < accounts.length; i++) {
    const res = await processAccount(accounts[i], i, accounts.length);
    results.push(res);
    if (i < accounts.length - 1) {
      await sleep(delayMs);
    }
  }

  printSummaryTable(results);
}

// Mode eksekusi: Default jalan sekali lalu selesai. Tambahkan flag --loop jika ingin berjalan terus.
const isLoop = process.argv.includes('--loop') || process.argv.includes('--daemon');

if (isLoop) {
  runAllAccounts();
  const intervalMs = Math.max(1, config.CHECK_INTERVAL_HOURS) * 60 * 60 * 1000;
  console.log(`${c.gray}[${new Date().toLocaleTimeString('id-ID')}] Mode Loop aktif: Akan mengecek ulang setiap ${config.CHECK_INTERVAL_HOURS} jam.${c.reset}`);
  setInterval(runAllAccounts, intervalMs);
} else {
  runAllAccounts().then(() => process.exit(0));
}
