-- Create rate_limit_settings table
CREATE TABLE IF NOT EXISTS rate_limit_settings (
    id SERIAL PRIMARY KEY,
    setting_name VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(50) NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean'
    description TEXT,
    category VARCHAR(50) DEFAULT 'general', -- 'general', 'faucet', 'api', 'wallet'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) DEFAULT 'system'
);

-- Insert default rate limit settings
INSERT INTO rate_limit_settings (setting_name, setting_value, setting_type, description, category) VALUES
-- General rate limiting
('rate_limit_enabled', 'true', 'boolean', 'Enable/disable rate limiting globally', 'general'),
('rate_limit_window_ms', '3600000', 'number', 'Rate limit window in milliseconds (1 hour)', 'general'),

-- Faucet specific
('faucet_max_per_wallet', '1', 'number', 'Maximum requests per wallet per window', 'faucet'),
('faucet_max_per_ip', '10', 'number', 'Maximum requests per IP per window', 'faucet'),
('faucet_cooldown_seconds', '3600', 'number', 'Cooldown period between requests in seconds', 'faucet'),

-- API limits
('api_max_requests_per_window', '1000', 'number', 'Maximum API requests per window', 'api'),
('api_burst_limit', '20', 'number', 'API burst limit for short periods', 'api'),

-- Wallet limits
('wallet_daily_limit', '5', 'number', 'Maximum requests per wallet per day', 'wallet'),
('wallet_weekly_limit', '10', 'number', 'Maximum requests per wallet per week', 'wallet'),

-- Emergency settings
('emergency_mode', 'false', 'boolean', 'Emergency mode - stricter limits', 'general'),
('emergency_max_per_ip', '1', 'number', 'Emergency mode: max requests per IP', 'general'),
('emergency_cooldown', '7200', 'number', 'Emergency mode: cooldown in seconds (2 hours)', 'general');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_settings_name ON rate_limit_settings(setting_name);
CREATE INDEX IF NOT EXISTS idx_rate_limit_settings_category ON rate_limit_settings(category);
CREATE INDEX IF NOT EXISTS idx_rate_limit_settings_active ON rate_limit_settings(is_active);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_rate_limit_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rate_limit_settings_updated_at
    BEFORE UPDATE ON rate_limit_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_rate_limit_settings_updated_at();
