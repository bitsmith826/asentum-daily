# Asentum Airdrop - Multi-Account Daily Check-in & XP Automation

Script otomatisasi berbasis Node.js sederhana untuk akun airdrop **Asentum** (`airdrop.asentum.com`) dengan dukungan **Multi-Akun (Banyak Akun)** dan **Auto-Refresh Token**.

---

## 👥 Cara Menambahkan Banyak Akun (Multi-Akun)

Data seluruh akun disimpan di dalam file [accounts.json](file:///d:/Coding/asentum-daily/accounts.json).

Untuk setiap akun yang ingin Anda tambahkan, Anda hanya perlu menyiapkan **2 data**:
1. **`token`** (Bearer Token dari Asentum)
2. **`refreshToken`** (Refresh Token dari Privy agar tidak perlu login ulang saat token expired)

### Format File `accounts.json`:
```json
[
  {
    "name": "Akun 1 (muffin258)",
    "token": "eyJhbGciOiJFUzI1NiIs...",
    "refreshToken": "OX08hJDODLbC-P2GNkFHOuL3ZAc8b5rxhMtoDBzJOrm3Mlnp575y7uEPTX9g5L8xYvGt-Wov9lm46zMT4Q4DmQ"
  },
  {
    "name": "Akun 2",
    "token": "token_akun_2_disini",
    "refreshToken": "refresh_token_akun_2_disini"
  },
  {
    "name": "Akun 3",
    "token": "token_akun_3_disini",
    "refreshToken": "refresh_token_akun_3_disini"
  }
]
```

---

## 🔍 Cara Login / Mengambil `token` & `refreshToken`

### Opsi 1: Otomatis Headless via EVM Private Key (SIWE - Paling Cepat & Instan) ⚡
Jika akun Asentum Anda login menggunakan EVM Wallet (MetaMask/Rabby/dll), Anda bisa langsung login otomatis tanpa browser sama sekali menggunakan protokol **Sign-In with Ethereum (SIWE)**:
1. Buat file `private_keys.txt` di folder proyek ini (file ini sudah otomatis di-`.gitignore` agar aman).
2. Masukkan daftar Private Key EVM Anda (satu key per baris):
   ```text
   0xabc123...
   0xdef456...
   ```
3. Jalankan perintah:
   ```bash
   npm run login:wallets
   ```
   *(atau `python siwe_login.py`)*
4. Script akan langsung melakukan handshaking SIWE ke Privy, menandatangani pesan secara matematis, mengambil `token` & `refreshToken`, lalu menyimpannya langsung ke [accounts.json](file:///d:/Coding/asentum-daily/accounts.json)!

---

### Opsi 2: Otomatis Menggunakan Camoufox (Praktis - Tanpa F12 Manual) 🌟
Jika akun Anda login menggunakan Email / Socials (Twitter, Google, dll):
1. Jalankan perintah:
   ```bash
   npm run grab
   ```
2. Jendela browser Camoufox akan terbuka otomatis menuju halaman Asentum Airdrop.
3. Lakukan **Sign In** dengan akun Anda.
4. Script akan langsung menyadap `token` & `refreshToken` dari lalu lintas jaringan dan otomatis menyimpannya ke [accounts.json](file:///d:/Coding/asentum-daily/accounts.json)!

---

### Opsi 3: Manual Lewat Inspect Elements (F12)

### A. Mengambil `token`:
1. Pada kolom filter pencarian Network, ketik: `me`
2. Klik request bernama **`me`**.
3. Di panel sebelah kanan, buka tab **Headers** -> gulir ke bagian **Request Headers**.
4. Cari baris:
   ```http
   authorization: Bearer eyJhbGciOiJ...
   ```
5. Salin teks panjang **setelah kata `Bearer `**. Itu adalah `token` Anda.

### B. Mengambil `refreshToken`:
1. Pada kolom filter pencarian Network, ketik: `sessions`
2. Klik request bernama **`sessions`** (yang mengarah ke domain `auth.privy.io`).
3. Di panel sebelah kanan, buka tab **Payload** (atau Request Payload).
4. Anda akan melihat:
   ```json
   {
     "refresh_token": "OX08hJDODLbC-..."
   }
   ```
5. Salin kode string tersebut. Itu adalah `refreshToken` Anda.

---

## 🚀 Cara Menjalankan

Cukup buka terminal di folder ini (`d:\Coding\asentum-daily`) lalu jalankan:

### 1. Default (Jalan Sekali untuk Semua Akun)
```bash
npm start
```
*(atau `node index.js`)*

Script akan memproses setiap akun satu per satu secara berurutan dengan jeda 2 detik, melakukan check-in, klaim faucet, lalu otomatis selesai dan keluar.

### 2. Opsional: Mode Loop (Berjalan Terus Tiap Beberapa Jam)
```bash
npm run loop
```
*(atau `node index.js --loop`)*
