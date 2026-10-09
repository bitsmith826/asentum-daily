// Pengaturan Umum Otomasi Asentum
module.exports = {
  // Klaim Faucet testnet 5 ASE otomatis jika cooldown selesai (true = aktif, false = nonaktif)
  AUTO_CLAIM_FAUCET: true,

  // Jeda waktu (detik) antar akun saat memproses banyak akun
  DELAY_BETWEEN_ACCOUNTS_SEC: 2,

  // Interval (jam) jika menjalankan mode loop berulang (npm run loop)
  CHECK_INTERVAL_HOURS: 4,

  // Konfigurasi internal Privy Asentum
  PRIVY_APP_ID: 'cmq6jimt9001b0cjrwxo31on8',
  PRIVY_CA_ID: 'e94213c6-ff73-4560-9315-baab66369202'
};
