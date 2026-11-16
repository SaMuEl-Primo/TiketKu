import mongoose from 'mongoose';

// Dokumen terhapus otomatis oleh MongoDB (TTL) setelah expiresAt lewat.
const nonceSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true, lowercase: true },
  nonce: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const Nonce = mongoose.model('Nonce', nonceSchema);
