import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isAdmin, isOrganizer } from '../config/chain.js';
import { wrap } from './util.js';

export function requireAuth(req, res, next) {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token diperlukan' });
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    // Alamat SELALU dari JWT, bukan dari body/URL (mencegah IDOR).
    req.user = { address: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
}

// Role dicek ke smart contract (sumber kebenaran), bukan ke database.
export const requireAdmin = wrap(async (req, res, next) => {
  if (!(await isAdmin(req.user.address))) {
    return res.status(403).json({ error: 'Hanya Admin' });
  }
  next();
});

export const requireOrganizer = wrap(async (req, res, next) => {
  if (!(await isOrganizer(req.user.address))) {
    return res.status(403).json({ error: 'Hanya Event Organizer' });
  }
  next();
});
