import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import eventRoutes from './routes/events.js';
import uploadRoutes, { uploadDir } from './routes/upload.js';
import organizerRoutes from './routes/organizer.js';

const app = express();

// cross-origin agar poster bisa dimuat oleh frontend di origin berbeda
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }));
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/events', eventRoutes);
app.use('/upload', uploadRoutes);
app.use('/organizer', organizerRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// Error handler pusat: detail error hanya masuk log server, tidak ke client.
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File maksimal 2 MB' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

export default app;
