import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    organizationName: { type: String, required: true },
    description: { type: String, default: '' },
    contactEmail: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export const OrganizerApplication = mongoose.model('OrganizerApplication', applicationSchema);
