import mongoose from 'mongoose';
import { env } from './config/env.js';
import app from './app.js';

await mongoose.connect(env.mongoUri);
console.log('MongoDB terhubung');
app.listen(env.port, () => console.log(`Backend jalan di http://localhost:${env.port}`));
