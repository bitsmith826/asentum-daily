"""
Asentum Airdrop - Pure Headless EVM Wallet SIWE Login
Otomatis Sign-In dengan Ethereum (SIWE / EIP-4361) menggunakan Private Key EVM atau Mnemonic Seed Phrase.
Menghasilkan Bearer Token & Refresh Token baru langsung ke accounts.json.
Dilengkapi Anti-Rate-Limit (429 Retry & Delay).
"""

import os
import json
import time
import base64
from datetime import datetime, timezone
import requests
from eth_account import Account
from eth_account.messages import encode_defunct

# Enable mnemonic HD wallet support
Account.enable_unaudited_hdwallet_features()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_PATH = os.path.join(BASE_DIR, 'accounts.json')
KEYS_PATH = os.path.join(BASE_DIR, 'private_keys.txt')

# Palet Warna ANSI
C_RESET = '\033[0m'
C_BOLD = '\033[1m'
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_CYAN = '\033[96m'
C_GRAY = '\033[90m'
C_WHITE = '\033[97m'

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

def is_token_valid(token):
    if not token or len(token) < 30:
        return False
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False
        # Base64 decode payload
        payload_b64 = parts[1] + '=' * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode('utf-8'))
        exp = payload.get('exp', 0)
        now = time.time()
        # Masih valid jika tersisa > 5 menit
        return (exp - now) > 300
    except Exception:
        return False

def authenticate_credential(cred_line, max_retries=3):
    line = cred_line.strip()
    
    words = line.split()
    if len(words) in (12, 15, 18, 21, 24):
        acc = Account.from_mnemonic(line)
    else:
        pk = line
        if pk.startswith('0x'):
            pk = pk[2:]
        if len(pk) != 64:
            raise ValueError(f"Format credential tidak valid: {line[:10]}...")
        acc = Account.from_key(pk)

    address = acc.address

    headers = {
        'content-type': 'application/json',
        'accept': 'application/json',
        'privy-app-id': 'cmq6jimt9001b0cjrwxo31on8',
        'privy-ca-id': 'e94213c6-ff73-4560-9315-baab66369202',
        'privy-client': 'js-sdk-core:0.55.0',
        'origin': 'https://airdrop.asentum.com',
        'referer': 'https://airdrop.asentum.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
    }

    # 1. SIWE Init dengan Auto-Retry jika terkena Rate Limit 429
    nonce = None
    for attempt in range(max_retries):
        r_init = requests.post(
            'https://auth.privy.io/api/v1/siwe/init',
            headers=headers,
            json={'address': address},
            timeout=15
        )
        if r_init.status_code == 200:
            init_data = r_init.json()
            nonce = init_data.get('nonce')
            break
        elif r_init.status_code == 429:
            wait_sec = (attempt + 1) * 4
            print(f"{C_CYAN}│{C_RESET}  {C_YELLOW}⏳ Rate limit Privy terdeteksi. Menunggu {wait_sec}s sebelum coba lagi...{C_RESET}")
            time.sleep(wait_sec)
        else:
            raise RuntimeError(f"Gagal SIWE init: {r_init.status_code} {r_init.text}")

    if not nonce:
        raise RuntimeError("Gagal mendapatkan nonce dari Privy setelah beberapa percobaan")

    # 2. Susun SIWE Message
    domain = "airdrop.asentum.com"
    uri = "https://airdrop.asentum.com"
    chain_id = "1"
    statement = "By signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees."
    issued_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    message = (
        f"{domain} wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        f"{statement}\n\n"
        f"URI: {uri}\n"
        f"Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {issued_at}\n"
        f"Resources:\n"
        f"- https://privy.io"
    )

    # 3. Sign Message (EIP-191 personal_sign)
    signable_message = encode_defunct(text=message)
    signed = acc.sign_message(signable_message)
    signature = signed.signature.hex()
    if not signature.startswith('0x'):
        signature = '0x' + signature

    # 4. SIWE Authenticate dengan Auto-Retry 429
    auth_body = {
        'signature': signature,
        'message': message,
        'chainId': 'eip155:1',
        'walletClientType': 'metamask',
        'connectorType': 'injected',
        'mode': 'login-or-sign-up'
    }

    auth_res = None
    for attempt in range(max_retries):
        r_auth = requests.post(
            'https://auth.privy.io/api/v1/siwe/authenticate',
            headers=headers,
            json=auth_body,
            timeout=15
        )
        if r_auth.status_code == 200:
            auth_res = r_auth.json()
            break
        elif r_auth.status_code == 429:
            wait_sec = (attempt + 1) * 4
            print(f"{C_CYAN}│{C_RESET}  {C_YELLOW}⏳ Rate limit Privy terdeteksi saat auth. Menunggu {wait_sec}s...{C_RESET}")
            time.sleep(wait_sec)
        else:
            raise RuntimeError(f"Gagal SIWE authenticate: {r_auth.status_code} {r_auth.text}")

    if not auth_res:
        raise RuntimeError("Gagal SIWE authenticate setelah beberapa percobaan")

    token = auth_res.get('token')
    refresh_token = auth_res.get('refresh_token')

    # 5. Dapatkan profil Asentum (/api/me)
    username = None
    try:
        r_me = requests.get('https://airdrop.asentum.com/api/me', headers={
            'authorization': f'Bearer {token}',
            'user-agent': headers['user-agent']
        }, timeout=15)
        if r_me.status_code == 200:
            me_data = r_me.json()
            user_info = me_data.get('user', {})
            username = user_info.get('username')
    except Exception:
        pass

    return {
        'address': address,
        'username': username,
        'token': token,
        'refreshToken': refresh_token
    }

def process_all_keys():
    print(f"\n{C_CYAN}{'━' * 65}{C_RESET}")
    print(f"  {C_WHITE}{C_BOLD}⚡ ASENTUM HEADLESS EVM WALLET LOGIN (SIWE){C_RESET}")
    print(f"{C_CYAN}{'━' * 65}{C_RESET}")

    if not os.path.exists(KEYS_PATH):
        print(f"\n{C_YELLOW}⚠ File {C_WHITE}private_keys.txt{C_YELLOW} tidak ditemukan!{C_RESET}")
        print(f"{C_GRAY}Silakan buat file {C_WHITE}private_keys.txt{C_GRAY} di folder ini dan isi dengan private key / seed phrase Anda.{C_RESET}\n")
        return False

    with open(KEYS_PATH, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip() and not line.startswith('#')]

    if not lines:
        print(f"\n{C_YELLOW}⚠ File private_keys.txt kosong.{C_RESET}\n")
        return False

    print(f"  {C_GRAY}Ditemukan :{C_RESET} {C_YELLOW}{len(lines)} Kredensial Wallet{C_RESET}")
    print(f"{C_GRAY}{'─' * 65}{C_RESET}\n")

    accounts = load_accounts()

    for idx, cred in enumerate(lines, 1):
        print(f"{C_CYAN}┌───{C_RESET} {C_WHITE}[{idx}/{len(lines)}]{C_RESET} Memproses Wallet...")

        # Cek cepat jika akun ini sudah punya token valid di accounts.json
        # Dapatkan address dulu
        try:
            words = cred.split()
            if len(words) in (12, 15, 18, 21, 24):
                temp_acc = Account.from_mnemonic(cred)
            else:
                pk = cred[2:] if cred.startswith('0x') else cred
                temp_acc = Account.from_key(pk)
            target_addr = temp_acc.address.lower()
        except Exception as e:
            print(f"{C_CYAN}│{C_RESET}  {C_RED}✖ Format credential error: {e}{C_RESET}")
            print(f"{C_CYAN}└───{C_RESET}\n")
            continue

        existing_acc = next((a for a in accounts if a.get('address', '').lower() == target_addr or (target_addr in a.get('name', '').lower())), None)
        if existing_acc and is_token_valid(existing_acc.get('token')):
            print(f"{C_CYAN}│{C_RESET}  {C_GRAY}Address  :{C_RESET} {C_WHITE}{temp_acc.address}{C_RESET}")
            print(f"{C_CYAN}│{C_RESET}  {C_GREEN}✔ Token masih segar dan valid (< 55 menit), melewati SIWE.{C_RESET}")
            print(f"{C_CYAN}└───{C_RESET}\n")
            continue

        try:
            auth_info = authenticate_credential(cred)
            addr = auth_info['address']
            uname = auth_info['username']
            token = auth_info['token']
            ref_token = auth_info['refreshToken']

            print(f"{C_CYAN}│{C_RESET}  {C_GRAY}Address  :{C_RESET} {C_WHITE}{addr}{C_RESET}")
            print(f"{C_CYAN}│{C_RESET}  {C_GRAY}Username :{C_RESET} {C_GREEN}@{uname or 'user'}{C_RESET}")
            print(f"{C_CYAN}│{C_RESET}  {C_GREEN}✔ Sukses Sign-In dengan Ethereum (SIWE)!{C_RESET}")

            # Cocokkan dengan akun yang ada di accounts.json
            found = False
            for acc in accounts:
                saved_addr = acc.get('address', '').lower()
                acc_name = acc.get('name', '').lower()
                
                if (saved_addr and saved_addr == addr.lower()) or \
                   (addr.lower() in acc_name) or \
                   (uname and uname.lower() in acc_name):
                    acc['token'] = token
                    acc['refreshToken'] = ref_token
                    acc['address'] = addr.lower()
                    print(f"{C_CYAN}│{C_RESET}  {C_GREEN}✔ Memperbarui akun: {acc['name']}{C_RESET}")
                    found = True
                    break

            if not found:
                short_addr = f"{addr[:6]}...{addr[-4:]}"
                new_acc_name = f"Akun {len(accounts) + 1} ({uname or short_addr})"
                accounts.append({
                    "name": new_acc_name,
                    "address": addr.lower(),
                    "token": token,
                    "refreshToken": ref_token
                })
                print(f"{C_CYAN}│{C_RESET}  {C_GREEN}✔ Ditambahkan sebagai: {new_acc_name}{C_RESET}")

        except Exception as e:
            print(f"{C_CYAN}│{C_RESET}  {C_RED}✖ Gagal: {e}{C_RESET}")

        print(f"{C_CYAN}└───{C_RESET}\n")
        time.sleep(2)

    save_accounts(accounts)
    print(f"{C_CYAN}{'━' * 65}{C_RESET}")
    print(f"  {C_GREEN}{C_BOLD}✔ Selesai! Semua token baru telah disimpan ke accounts.json{C_RESET}")
    print(f"{C_CYAN}{'━' * 65}{C_RESET}\n")
    return True

if __name__ == '__main__':
    process_all_keys()
