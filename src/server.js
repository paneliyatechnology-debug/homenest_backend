import app from './app.js';
import config from './config/index.js';
import db, { checkDbConnection } from './config/db.js';

const PORT = config.port;

let server;

const startServer = async () => {
  // Test database connection
  await checkDbConnection();

  server = app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Server is running in [${config.env}] mode`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/v1/health`);
    console.log(`==================================================`);
  });
};

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP server closed.');
      try {
        await db.destroy();
        console.log('[DB] Database connections destroyed.');
        process.exit(0);
      } catch (err) {
        console.error('[DB Error] Error closing database connection:', err);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception] thrown:', error);
  process.exit(1);
});

startServer();
