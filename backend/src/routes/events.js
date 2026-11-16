import { Router } from 'express';
import { z } from 'zod';
import { EventDetail } from '../models/EventDetail.js';
import { getEventOrganizer } from '../config/chain.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, parse, eventIdParam } from '../middleware/util.js';

const router = Router();

const detailSchema = z
  .object({
    description: z.string().max(5000),
    location: z.string().max(200),
    posterUrl: z.string().regex(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/).optional(),
  })
  .strict();

// Cek ke smart contract: hanya EO pemilik event yang boleh mengubah detail.
async function ensureOwner(req, res) {
  const organizer = await getEventOrganizer(req.params.id);
  if (!organizer) {
    res.status(404).json({ error: 'Event tidak ada di blockchain' });
    return false;
  }
  if (organizer !== req.user.address) {
    res.status(403).json({ error: 'Bukan pemilik event' });
    return false;
  }
  return true;
}

router.get('/:id/details', wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  const detail = await EventDetail.findOne({ eventId: p.id });
  if (!detail) return res.status(404).json({ error: 'Detail belum diisi' });
  res.json(detail);
}));

router.put('/:id/details', requireAuth, wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  const data = parse(detailSchema, req.body, res);
  if (!data) return;
  if (!(await ensureOwner(req, res))) return;
  const detail = await EventDetail.findOneAndUpdate(
    { eventId: p.id },
    { $set: { ...data, updatedBy: req.user.address } },
    { new: true, upsert: true }
  );
  res.json(detail);
}));

router.delete('/:id/details', requireAuth, wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  if (!(await ensureOwner(req, res))) return;
  await EventDetail.deleteOne({ eventId: p.id });
  res.status(204).end();
}));

export default router;
