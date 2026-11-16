import 'dotenv/config';

const need = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} wajib diisi (lihat .env.example)`);
  return value;
};

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: need('MONGODB_URI'),
  jwtSecret: need('JWT_SECRET'),
  rpcUrl: need('RPC_URL'),
  contractAddress: need('CONTRACT_ADDRESS'),
  chainId: Number(process.env.CHAIN_ID) || 11155111,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  domain: process.env.APP_DOMAIN || 'localhost:3000',
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET minimal 32 karakter');
}
