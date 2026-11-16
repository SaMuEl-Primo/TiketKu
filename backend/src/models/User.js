import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
