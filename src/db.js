import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI in .env');

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri);

  console.log('MongoDB connected');
}

export function getDbReadyState() {
  return mongoose.connection.readyState;
}

export function getDbReadyStateLabel() {
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}
