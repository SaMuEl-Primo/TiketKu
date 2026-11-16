// Tes login wallet tanpa frontend. Jalankan saat server sedang hidup:
//   npm run test:login
import { Wallet } from 'ethers';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const json = { 'Content-Type': 'application/json' };
const wallet = Wallet.createRandom();
console.log('Wallet tes:', wallet.address);

// 1. minta nonce
const { message } = await (await fetch(`${BASE}/auth/nonce?address=${wallet.address}`)).json();

// 2. tanda tangan (di aplikasi nyata dilakukan MetaMask)
const signature = await wallet.signMessage(message);

// 3. verifikasi -> JWT
const login = await fetch(`${BASE}/auth/verify`, {
  method: 'POST', headers: json, body: JSON.stringify({ address: wallet.address, signature }),
});
const { token } = await login.json();
console.log('1) Login            :', login.status, '(harus 200)');

const auth = { ...json, Authorization: `Bearer ${token}` };

// 4. CRUD profil
const put = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Bonzaa' }) });
console.log('2) PUT /users/me     :', put.status, '(harus 200)');
const get = await fetch(`${BASE}/users/me`, { headers: auth });
console.log('3) GET /users/me     :', get.status, (await get.json()).name);

// 5. role dari smart contract
const me = await fetch(`${BASE}/auth/me`, { headers: auth });
console.log('4) GET /auth/me      :', me.status, JSON.stringify((await me.json()).roles));

// 6. replay signature harus ditolak
const replay = await fetch(`${BASE}/auth/verify`, {
  method: 'POST', headers: json, body: JSON.stringify({ address: wallet.address, signature }),
});
console.log('5) Replay signature  :', replay.status, '(harus 401)');

// 7. mass assignment harus ditolak
const mass = await fetch(`${BASE}/users/me`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'x', address: '0xabc' }) });
console.log('6) Field ekstra      :', mass.status, '(harus 400)');

// 8. hapus profil
const del = await fetch(`${BASE}/users/me`, { method: 'DELETE', headers: auth });
console.log('7) DELETE /users/me  :', del.status, '(harus 204)');
