-- Add faucet mode setting to rate_limit_settings table
INSERT INTO rate_limit_settings (setting_name, setting_value, setting_type, description, category, is_active, updated_by) VALUES
('faucet_mode', 'wallet', 'string', 'Faucet mode: wallet (use private key) or sui_sdk (use official faucet)', 'faucet', true, 'system')
ON CONFLICT (setting_name) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;
