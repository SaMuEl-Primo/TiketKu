import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { z } from 'zod';
import { env } from '../config/env.js';
import { isAdmin, isOrganizer, isGate } from '../config/chain.js';
import { Nonce } from '../models/Nonce.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, parse } from '../middleware/util.js';

const router = Router();
const addressSchema = z.string().refine((a) => ethers.isAddress(a), 'Alamat wallet tidak valid');

// Pesan yang ditandatangani user di MetaMask (gaya Sign-In with Ethereum).
const buildMessage = (address, nonce, expiresAt) =>
  `${env.domain} meminta kamu masuk ke TiketKu dengan wallet:\n${address}\n\n` +
  `Nonce: ${nonce}\nChain ID: ${env.chainId}\nBerlaku sampai: ${expiresAt.toISOString()}`;

// 1) Minta nonce + pesan yang harus ditandatangani
router.get('/nonce', wrap(async (req, res) => {
  const q = parse(z.object({ address: addressSchema }), req.query, res);
  if (!q) return;
  const address = ethers.getAddress(q.address);
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await Nonce.findOneAndUpdate(
    { address: address.toLowerCase() },
    { nonce, expiresAt },
    { upsert: true }
  );
  res.json({ nonce, message: buildMessage(address, nonce, expiresAt) });
}));

// 2) Verifikasi tanda tangan, keluarkan JWT
router.post('/verify', wrap(async (req, res) => {
  const body = parse(
    z.object({ address: addressSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).strict(),
    req.body,
    res
  );
  if (!body) return;
  const address = ethers.getAddress(body.address);
  const key = address.toLowerCase();

  // Ambil sekaligus hapus nonce: sekali pakai, mencegah replay.
  const record = await Nonce.findOneAndDelete({ address: key, expiresAt: { $gt: new Date() } });
  if (!record) return res.status(401).json({ error: 'Nonce tidak ada atau kedaluwarsa' });

  let recovered;
  try {
    recovered = ethers.verifyMessage(buildMessage(address, record.nonce, record.expiresAt), body.signature);
  } catch {
    return res.status(401).json({ error: 'Tanda tangan tidak valid' });
  }
  if (recovered.toLowerCase() !== key) {
    return res.status(401).json({ error: 'Tanda tangan tidak cocok dengan alamat' });
  }

  await User.updateOne({ address: key }, { $setOnInsert: { address: key } }, { upsert: true });
  const token = jwt.sign({}, env.jwtSecret, { algorithm: 'HS256', subject: key, expiresIn: '1h' });
  res.json({ token, address: key });
}));

// 3) Role aktif user (dibaca dari smart contract)
router.get('/me', requireAuth, wrap(async (req, res) => {
  const [admin, organizer, gate] = await Promise.all([
    isAdmin(req.user.address),
    isOrganizer(req.user.address),
    isGate(req.user.address),
  ]);
  res.json({ address: req.user.address, roles: { admin, organizer, gate, buyer: true } });
}));

export default router;
