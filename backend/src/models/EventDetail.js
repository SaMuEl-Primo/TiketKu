import mongoose from 'mongoose';

const eventDetailSchema = new mongoose.Schema(
  {
    eventId: { type: Number, required: true, unique: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    updatedBy: { type: String, lowercase: true },
  },
  { timestamps: true }
);

export const EventDetail = mongoose.model('EventDetail', eventDetailSchema);
