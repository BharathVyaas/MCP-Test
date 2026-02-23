import mongoose from 'mongoose';

const CatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const Cat = mongoose.model('Cat', CatSchema);
