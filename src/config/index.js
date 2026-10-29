import dotenv from 'dotenv';
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  cors: {
    origin: process.env.CORS_ORIGIN === '*' ? true : (process.env.CORS_ORIGIN || true),
    credentials: true,
  },
  db: {
    client: process.env.DB_CLIENT || 'mysql2',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pg_backend_db',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  brevo: {
    apiKey: process.env.BREVO_API_KEY || '',
    senderEmail: process.env.BREVO_SENDER_EMAIL || 'jasminkorat04@gmail.com',
    fromName: process.env.FROM_NAME || 'HomeNest',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production',
    accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'default_access_secret_key',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET || 'default_jwt_secret'}_refresh`,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  },
};

export default config;
