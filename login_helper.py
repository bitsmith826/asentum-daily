"""
Asentum Airdrop - Auto Token & Refresh Token Grabber via Camoufox
Membuka browser Camoufox secara visual, mencegat Bearer Token & Refresh Token
saat Anda login, dan otomatis menyimpannya ke accounts.json.
"""

import os
import json
import time
from camoufox.sync_api import Camoufox

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_PATH = os.path.join(BASE_DIR, 'accounts.json')

def load_accounts():
    if os.path.exists(ACCOUNTS_PATH):
        try:
            with open(ACCOUNTS_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_accounts(accounts):
    with open(ACCOUNTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(accounts, f, indent=2)
    print(f"\n[✔] Berhasil memperbarui {ACCOUNTS_PATH}")

def update_or_add_account(username, token, refresh_token):
    accounts = load_accounts()
    found = False
    
    # Cari berdasarkan username jika ada
    target_name = f"@{username}" if username else None
    
    for acc in accounts:
        acc_name = acc.get('name', '').lower()
        if target_name and username.lower() in acc_name:
            acc['token'] = token
            if refresh_token:
                acc['refreshToken'] = refresh_token
            print(f"\n[✔] Memperbarui token akun yang cocok: {acc.get('name')}")
            found = True
            break
            
    if not found:
        new_name = f"Akun {len(accounts) + 1}" + (f" ({username})" if username else "")
        new_acc = {
            "name": new_name,
            "token": token,
            "refreshToken": refresh_token or ""
        }
        accounts.append(new_acc)
        print(f"\n[✔] Menambahkan akun baru: {new_name}")
        
    save_accounts(accounts)

def run_grabber():
    print("=" * 60)
    print("  🦊 ASENTUM TOKEN GRABBER (CAMOUFOX)")
    print("=" * 60)
    print("1. Jendela browser Camoufox akan terbuka.")
    print("2. Silakan klik SIGN IN lalu login dengan Wallet/Email/Social.")
    print("3. Script akan otomatis mencegat Token & Refresh Token dari jaringan")
    print("   dan menyimpannya ke accounts.json tanpa perlu buka F12 manual!\n")
    
    with Camoufox(headless=False) as browser:
        context = browser.new_context()
        page = context.new_page()

        captured = {
            "token": None,
            "refreshToken": None,
            "username": None
        }

        def on_request(request):
            url = request.url
            if "airdrop.asentum.com/api/me" in url or "airdrop.asentum.com/api/quests" in url:
                auth = request.headers.get("authorization")
                if auth and auth.startswith("Bearer "):
                    token = auth.replace("Bearer ", "").strip()
                    if token and len(token) > 30 and captured["token"] != token:
                        captured["token"] = token
                        print(f"\n[🔑] Berhasil menangkap Bearer Token! ({token[:20]}...)")
                        check_and_save()

        def on_response(response):
            url = response.url
            try:
                if "auth.privy.io/api/v1/sessions" in url:
                    data = response.json()
                    ref_token = data.get("refresh_token")
                    if ref_token:
                        captured["refreshToken"] = ref_token
                        print(f"[🔄] Berhasil menangkap Refresh Token! ({ref_token[:15]}...)")
                        check_and_save()
                elif "airdrop.asentum.com/api/me" in url and response.status == 200:
                    data = response.json()
                    user = data.get("user", {})
                    uname = user.get("username")
                    if uname:
                        captured["username"] = uname
                        print(f"[👤] Terdeteksi username: @{uname}")
                        check_and_save()
            except Exception:
                pass

        def check_and_save():
            if captured["token"] and captured["refreshToken"]:
                update_or_add_account(captured["username"], captured["token"], captured["refreshToken"])
                print("[🎉] Data akun lengkap berhasil disimpan!")
                print("Silakan tutup browser jika sudah selesai, atau login ke akun berikutnya.")

        page.on("request", on_request)
        page.on("response", on_response)

        print("[*] Membuka https://airdrop.asentum.com/dashboard ...")
        page.goto("https://airdrop.asentum.com/dashboard")

        # Otomatis buka modal login jika belum login
        try:
            page.wait_for_timeout(2000)
            signin = page.locator('button:has-text("SIGN IN")').first
            if signin.is_visible():
                signin.click()
        except Exception:
            pass

        print("\n[*] Browser siap. Silakan selesaikan proses login di jendela browser.")
        print("[*] Tekan Enter di terminal ini jika sudah selesai semua akun untuk keluar...")
        
        try:
            input()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    run_grabber()
