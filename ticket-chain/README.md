# Ticket Chain (Hardhat)

## 1. Setup awal
```bash
npm install
cp .env.example .env     # isi SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
```
Buka folder di VS Code, lalu install extension yang direkomendasikan (popup muncul otomatis).

## 2. Test
```bash
npx hardhat compile
npm test
npm run coverage
```

## 3. Slither
```bash
pip install slither-analyzer solc-select
solc-select install 0.8.24 && solc-select use 0.8.24
npm run slither
```
Catat tiap temuan di `docs/slither-report.md`: diperbaiki, atau diabaikan + alasan.

## 4. Deploy ke Sepolia
1. Ambil ETH Sepolia dari faucet ke wallet di `PRIVATE_KEY` (wallet khusus testnet!).
2. `npm run deploy:sepolia`
3. Hasil otomatis tersimpan di:
   - `deployments/sepolia.json` -> alamat kontrak (untuk backend & frontend)
   - `deployments/EventTicket.abi.json` -> ABI
4. Verifikasi di Etherscan: `npm run verify:sepolia -- <ALAMAT_KONTRAK>`
5. Setelah deploy, beri role: `grantRole(ORGANIZER_ROLE, ...)` dan `grantRole(GATE_ROLE, ...)`.

## Checklist
- [ ] Semua test hijau (termasuk kasus gagal)
- [ ] Slither dijalankan & temuan ditangani
- [ ] `_update` memblokir transfer bebas
- [ ] Deploy Sepolia, alamat + ABI dicatat & dibagikan ke tim backend/frontend
