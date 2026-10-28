import knex from 'knex';
import knexConfig from '../../knexfile.js';
import config from './index.js';

const environment = config.env || 'development';
const dbConfig = knexConfig[environment] || knexConfig.development;

const db = knex(dbConfig);

/**
 * Test database connection
 */
export const checkDbConnection = async () => {
  try {
    await db.raw('SELECT 1+1 AS result');
    console.log(`[DB] Successfully connected to MySQL database: ${dbConfig.connection.database || config.db.name}`);
    return true;
  } catch (error) {
    console.error(`[DB Error] Failed to connect to MySQL database: ${error.message}`);
    return false;
  }
};

export default db;

