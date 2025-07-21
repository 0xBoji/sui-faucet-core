import express from 'express';
import { databaseService } from '../services/database.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || (config as any).jwtSecret || 'changeme';

// Admin authentication middleware
const authenticateAdmin = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '🚫 Admin authentication required',
        error: { code: 'MISSING_AUTH_TOKEN' }
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: '🚫 Invalid or expired admin token',
        error: { code: 'INVALID_AUTH_TOKEN' }
      });
    }
  } catch (error: any) {
    logger.error('Admin authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

const router = express.Router();

/**
 * @swagger
 * /api/v1/admin/rate-limits:
 *   get:
 *     summary: Get all rate limit settings
 *     tags: [Admin Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rate limit settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       setting_name:
 *                         type: string
 *                       setting_value:
 *                         type: string
 *                       setting_type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       is_active:
 *                         type: boolean
 *                       updated_at:
 *                         type: string
 *                       updated_by:
 *                         type: string
 */
router.get('/rate-limits', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      SELECT id, setting_name, setting_value, setting_type, description, 
             category, is_active, updated_at, updated_by
      FROM rate_limit_settings 
      ORDER BY category, setting_name
    `;
    
    const result = await databaseService.query(query);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    logger.error('Error fetching rate limit settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rate limit settings',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/admin/rate-limits/bulk:
 *   put:
 *     summary: Bulk update rate limit settings
 *     tags: [Admin Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: object
 *                 additionalProperties: true
 *             required:
 *               - settings
 *     responses:
 *       200:
 *         description: Settings updated successfully
 */
router.put('/rate-limits/bulk', authenticateAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    const adminUser = (req as any).user?.username || 'admin';

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    const updates = [];
    const errors = [];

    // Process each setting
    for (const [settingName, value] of Object.entries(settings)) {
      try {
        const updateQuery = `
          UPDATE rate_limit_settings
          SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE setting_name = $3 AND is_active = true
        `;

        const result = await databaseService.query(updateQuery, [
          value?.toString(),
          adminUser,
          settingName
        ]);

        if (result.rowCount && result.rowCount > 0) {
          updates.push({ setting_name: settingName, new_value: value });
        } else {
          errors.push({ setting_name: settingName, error: 'Setting not found' });
        }
      } catch (error: any) {
        errors.push({ setting_name: settingName, error: error.message });
      }
    }

    // Log admin activity
    await databaseService.saveAdminActivity({
      admin_username: adminUser,
      action: 'bulk_update_rate_limit_settings',
      details: `Updated ${updates.length} settings, ${errors.length} errors`,
      ip_address: req.ip || 'unknown',
      user_agent: req.get('User-Agent') || 'unknown'
    });

    logger.info(`Bulk rate limit settings update by ${adminUser}: ${updates.length} success, ${errors.length} errors`);

    res.json({
      success: errors.length === 0,
      message: `Updated ${updates.length} settings${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
      data: {
        updated: updates,
        errors: errors,
        updated_by: adminUser
      }
    });
  } catch (error: any) {
    logger.error('Error bulk updating rate limit settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update rate limit settings',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/admin/rate-limits/{settingName}:
 *   put:
 *     summary: Update a rate limit setting
 *     tags: [Admin Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settingName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *             required:
 *               - value
 *     responses:
 *       200:
 *         description: Setting updated successfully
 */
router.put('/rate-limits/:settingName', authenticateAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    const adminUser = (req as any).user?.username || 'admin';

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    const updates = [];
    const errors = [];

    // Process each setting
    for (const [settingName, value] of Object.entries(settings)) {
      try {
        const updateQuery = `
          UPDATE rate_limit_settings 
          SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE setting_name = $3 AND is_active = true
        `;
        
        const result = await databaseService.query(updateQuery, [
          value?.toString(), 
          adminUser, 
          settingName
        ]);

        if (result.rowCount && result.rowCount > 0) {
          updates.push({ setting_name: settingName, new_value: value });
        } else {
          errors.push({ setting_name: settingName, error: 'Setting not found' });
        }
      } catch (error: any) {
        errors.push({ setting_name: settingName, error: error.message });
      }
    }

    // Log admin activity
    await databaseService.saveAdminActivity({
      admin_username: adminUser,
      action: 'bulk_update_rate_limit_settings',
      details: `Updated ${updates.length} settings, ${errors.length} errors`,
      ip_address: req.ip || 'unknown',
      user_agent: req.get('User-Agent') || 'unknown'
    });

    logger.info(`Bulk rate limit settings update by ${adminUser}: ${updates.length} success, ${errors.length} errors`);

    res.json({
      success: errors.length === 0,
      message: `Updated ${updates.length} settings${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
      data: {
        updated: updates,
        errors: errors,
        updated_by: adminUser
      }
    });
  } catch (error: any) {
    logger.error('Error bulk updating rate limit settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update rate limit settings',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/admin/rate-limits/current-config:
 *   get:
 *     summary: Get current effective rate limit configuration
 *     tags: [Admin Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current rate limit configuration
 */
router.get('/rate-limits/current-config', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      SELECT setting_name, setting_value, setting_type 
      FROM rate_limit_settings 
      WHERE is_active = true
    `;
    
    const result = await databaseService.query(query);
    const config: any = {};

    // Convert to typed config object
    result.rows.forEach(row => {
      let value: any = row.setting_value;
      
      switch (row.setting_type) {
        case 'number':
          value = parseInt(row.setting_value, 10);
          break;
        case 'boolean':
          value = row.setting_value.toLowerCase() === 'true';
          break;
        case 'string':
        default:
          value = row.setting_value;
          break;
      }
      
      config[row.setting_name] = value;
    });

    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Error fetching current rate limit config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current rate limit configuration',
      error: error.message
    });
  }
});

export { router as rateLimitAdminRoutes };
