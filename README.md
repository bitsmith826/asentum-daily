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

## 🔍 Cara Mengambil `token` & `refreshToken` untuk Akun Baru

Lakukan langkah ini untuk masing-masing akun (misal dari profil Chrome yang berbeda atau mode Incognito):

1. **Buka Browser & Login** ke `https://airdrop.asentum.com/dashboard` menggunakan akun tersebut.
2. Tekan tombol **F12** pada keyboard untuk membuka Inspect Elements / Developer Tools.
3. Buka tab **Network** (Jaringan).

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
