import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Database interfaces
export interface TransactionRecord {
  id?: number;
  request_id: string;
  wallet_address: string;
  amount: string;
  transaction_hash: string;
  status: 'success' | 'failed';
  error_message?: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
}

export interface RequestLog {
  id?: number;
  request_id: string;
  method: string;
  url: string;
  ip_address: string;
  user_agent?: string;
  status_code: number;
  response_time: number;
  created_at: string;
}

export interface AdminActivity {
  id?: number;
  admin_username: string;
  action: string;
  details?: string;
  ip_address: string;
  user_agent?: string;
  created_at?: string;
}

export interface AdminUser {
  id?: number;
  username: string;
  password_hash: string;
  email?: string;
  role: 'admin' | 'super_admin';
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

class DatabaseService {
  private pool: Pool | null = null;

  constructor() {
    // Initialize PostgreSQL connection pool
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('PostgreSQL database connected successfully', {
        database: config.database.url.split('@')[1]?.split('/')[1] || 'unknown'
      });
    } catch (error: any) {
      logger.error('Database connection failed', { error: error.message });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.end();
      logger.info('Database disconnected');
      this.pool = null;
    } catch (error: any) {
      logger.error('Database disconnect failed', { error: error.message });
      throw error;
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async initialize(): Promise<void> {
    try {
      // Create transactions table
      await this.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          request_id VARCHAR(255) NOT NULL,
          wallet_address VARCHAR(255) NOT NULL,
          amount VARCHAR(255) NOT NULL,
          transaction_hash VARCHAR(255),
          status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
          error_message TEXT,
          ip_address VARCHAR(255) NOT NULL,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create request_logs table
      await this.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id SERIAL PRIMARY KEY,
          request_id VARCHAR(255) NOT NULL,
          method VARCHAR(10) NOT NULL,
          url TEXT NOT NULL,
          ip_address VARCHAR(255) NOT NULL,
          user_agent TEXT,
          status_code INTEGER NOT NULL,
          response_time INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create admin_activities table
      await this.query(`
        CREATE TABLE IF NOT EXISTS admin_activities (
          id SERIAL PRIMARY KEY,
          admin_username VARCHAR(255) NOT NULL,
          action VARCHAR(255) NOT NULL,
          details TEXT,
          ip_address VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create admin_users table
      await this.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await this.query('CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_admin_activities_created ON admin_activities(created_at)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username)');
      await this.query('CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active)');

      // Alter existing table to allow NULL transaction_hash for failed transactions
      await this.query(`
        ALTER TABLE transactions
        ALTER COLUMN transaction_hash DROP NOT NULL
      `).catch(() => {
        // Ignore error if constraint doesn't exist
        logger.info('Transaction hash constraint already removed or does not exist');
      });

      // Create default admin user if not exists
      await this.createDefaultAdminUser();

      logger.info('Database tables initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize database tables', { error: error.message });
      throw error;
    }
  }

  // Transaction methods
  async saveTransaction(transaction: TransactionRecord): Promise<number> {
    const result = await this.query(`
      INSERT INTO transactions (
        request_id, wallet_address, amount, transaction_hash,
        status, error_message, ip_address, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      transaction.request_id,
      transaction.wallet_address,
      transaction.amount,
      transaction.transaction_hash,
      transaction.status,
      transaction.error_message,
      transaction.ip_address,
      transaction.user_agent,
      transaction.created_at
    ]);

    return result.rows[0].id;
  }

  async getTransactions(limit: number = 100, offset: number = 0): Promise<TransactionRecord[]> {
    const result = await this.query(`
      SELECT * FROM transactions
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows;
  }

  async getTransactionStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    totalAmount: string;
  }> {
    const result = await this.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'success' THEN amount::BIGINT ELSE 0 END) as totalAmount
      FROM transactions
    `);

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total) || 0,
      successful: parseInt(stats.successful) || 0,
      failed: parseInt(stats.failed) || 0,
      totalAmount: (stats.totalamount || '0').toString(),
    };
  }

  // NEW: Save metrics (aggregated data, privacy-friendly)
  async saveMetrics(data: {
    date: string;
    amount: string;
    status: 'success' | 'failed';
    transaction_hash?: string;
    error_type?: string;
  }): Promise<void> {
    try {
      // Update daily metrics
      await this.updateDailyMetrics(data);

      // Save recent transaction hash for debugging (if success)
      if (data.status === 'success' && data.transaction_hash) {
        await this.saveRecentTransaction(data.transaction_hash, data.amount);
      }

      logger.debug('Metrics saved to database', {
        date: data.date,
        status: data.status,
        amount: data.amount
      });
    } catch (error: any) {
      logger.error('Failed to save metrics', {
        error: error.message,
        date: data.date
      });
      throw error;
    }
  }

  // Update daily aggregated metrics
  private async updateDailyMetrics(data: {
    date: string;
    amount: string;
    status: 'success' | 'failed';
    error_type?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO faucet_metrics (
        date, total_requests, successful_requests, failed_requests,
        total_amount_distributed, rate_limit_errors, network_errors
      ) VALUES ($1, 1, $2, $3, $4, $5, $6)
      ON CONFLICT (date) DO UPDATE SET
        total_requests = faucet_metrics.total_requests + 1,
        successful_requests = faucet_metrics.successful_requests + $2,
        failed_requests = faucet_metrics.failed_requests + $3,
        total_amount_distributed = faucet_metrics.total_amount_distributed + $4,
        rate_limit_errors = faucet_metrics.rate_limit_errors + $5,
        network_errors = faucet_metrics.network_errors + $6,
        updated_at = NOW()
    `;

    const successCount = data.status === 'success' ? 1 : 0;
    const failedCount = data.status === 'failed' ? 1 : 0;
    const amount = data.status === 'success' ? BigInt(data.amount) : 0n;
    const rateLimitError = data.error_type === 'rate_limit' ? 1 : 0;
    const networkError = data.error_type === 'network_error' ? 1 : 0;

    await this.query(query, [
      data.date,
      successCount,
      failedCount,
      amount.toString(),
      rateLimitError,
      networkError
    ]);
  }

  // Save recent transaction for debugging (auto-expire after 7 days)
  private async saveRecentTransaction(transactionHash: string, amount: string): Promise<void> {
    try {
      const query = `
        INSERT INTO recent_transactions (transaction_hash, amount)
        VALUES ($1, $2)
        ON CONFLICT (transaction_hash) DO NOTHING
      `;

      await this.query(query, [transactionHash, amount]);

      // Clean up old transactions (older than 7 days)
      const cleanupQuery = `
        DELETE FROM recent_transactions
        WHERE created_at < NOW() - INTERVAL '7 days'
      `;

      await this.query(cleanupQuery);
    } catch (error: any) {
      logger.warn('Failed to save recent transaction', {
        error: error.message,
        transactionHash
      });
    }
  }

  // Request log methods
  async saveRequestLog(log: RequestLog): Promise<number> {
    const result = await this.query(`
      INSERT INTO request_logs (
        request_id, method, url, ip_address, user_agent,
        status_code, response_time, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      log.request_id,
      log.method,
      log.url,
      log.ip_address,
      log.user_agent,
      log.status_code,
      log.response_time,
      log.created_at
    ]);

    return result.rows[0].id;
  }

  // Admin activity methods
  async saveAdminActivity(activity: AdminActivity): Promise<number> {
    const result = await this.query(`
      INSERT INTO admin_activities (
        admin_username, action, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      activity.admin_username,
      activity.action,
      activity.details,
      activity.ip_address,
      activity.created_at
    ]);

    return result.rows[0].id;
  }

  async getAdminActivities(limit: number = 50): Promise<AdminActivity[]> {
    const result = await this.query(`
      SELECT * FROM admin_activities
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  // Admin user methods
  private async createDefaultAdminUser(): Promise<void> {
    try {
      // Check if admin user already exists
      const existingAdmin = await this.query(
        'SELECT id FROM admin_users WHERE username = $1',
        [config.auth.adminUsername]
      );

      if (existingAdmin.rows.length === 0) {
        // Hash the default password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(config.auth.adminPassword, saltRounds);

        // Create default admin user
        await this.query(`
          INSERT INTO admin_users (username, password_hash, role, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          config.auth.adminUsername,
          passwordHash,
          'super_admin',
          true,
          new Date().toISOString(),
          new Date().toISOString()
        ]);

        logger.info('Default admin user created', { username: config.auth.adminUsername });
      } else {
        logger.info('Admin user already exists', { username: config.auth.adminUsername });
      }
    } catch (error: any) {
      logger.error('Failed to create default admin user', { error: error.message });
      throw error;
    }
  }

  async authenticateAdmin(username: string, password: string): Promise<AdminUser | null> {
    try {
      const result = await this.query(
        'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
        [username]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return null;
      }

      // Update last login
      await this.query(
        'UPDATE admin_users SET last_login = $1, updated_at = $2 WHERE id = $3',
        [new Date().toISOString(), new Date().toISOString(), user.id]
      );

      return {
        id: user.id,
        username: user.username,
        password_hash: user.password_hash,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        last_login: user.last_login,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    } catch (error: any) {
      logger.error('Failed to authenticate admin', { error: error.message, username });
      throw error;
    }
  }

  async getAdminUser(username: string): Promise<AdminUser | null> {
    try {
      const result = await this.query(
        'SELECT * FROM admin_users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        username: user.username,
        password_hash: user.password_hash,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        last_login: user.last_login,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    } catch (error: any) {
      logger.error('Failed to get admin user', { error: error.message, username });
      throw error;
    }
  }

  async createAdminUser(userData: {
    username: string;
    password: string;
    email?: string;
    role?: 'admin' | 'super_admin';
  }): Promise<AdminUser> {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      const result = await this.query(`
        INSERT INTO admin_users (username, password_hash, email, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userData.username,
        passwordHash,
        userData.email || null,
        userData.role || 'admin',
        true,
        new Date().toISOString(),
        new Date().toISOString()
      ]);

      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to create admin user', { error: error.message, username: userData.username });
      throw error;
    }
  }

  async updateAdminPassword(username: string, newPassword: string): Promise<boolean> {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      const result = await this.query(
        'UPDATE admin_users SET password_hash = $1, updated_at = $2 WHERE username = $3 AND is_active = true',
        [passwordHash, new Date().toISOString(), username]
      );

      return result.rowCount > 0;
    } catch (error: any) {
      logger.error('Failed to update admin password', { error: error.message, username });
      throw error;
    }
  }

  // Get faucet metrics
  async getFaucetMetrics(days: number = 7): Promise<any[]> {
    const result = await this.query(`
      SELECT * FROM faucet_metrics
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC
    `);
    return result.rows;
  }

  // Get recent transactions
  async getRecentTransactions(limit: number = 10): Promise<any[]> {
    const result = await this.query(`
      SELECT * FROM recent_transactions
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
