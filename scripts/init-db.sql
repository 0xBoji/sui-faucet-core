-- Initialize Sui Faucet Database
-- This script is run when the PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create database user if not exists (for development)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'suifaucet') THEN
        CREATE ROLE suifaucet WITH LOGIN PASSWORD 'password';
    END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE suifaucet TO suifaucet;
GRANT ALL ON SCHEMA public TO suifaucet;

-- Create tables (these will also be created by the application, but having them here ensures consistency)

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Faucet requests table
CREATE TABLE IF NOT EXISTS faucet_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(66) NOT NULL,
    amount BIGINT NOT NULL,
    transaction_hash VARCHAR(88),
    status VARCHAR(20) DEFAULT 'pending',
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(50),
    error_message TEXT,
    gas_used BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_hour INTEGER DEFAULT 100,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_faucet_requests_wallet_address ON faucet_requests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_faucet_requests_created_at ON faucet_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_faucet_requests_status ON faucet_requests(status);
CREATE INDEX IF NOT EXISTS idx_faucet_requests_ip_address ON faucet_requests(ip_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_faucet_requests_updated_at BEFORE UPDATE ON faucet_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
INSERT INTO admin_users (username, password_hash, email) 
VALUES ('admin', '$2b$10$8K1p/a0dclxKoNqIfrHb2eUZfYVdU2E4/m/6XI2LINfA8hdxrUEjC', 'admin@suifaucet.com')
ON CONFLICT (username) DO NOTHING;

-- Insert default API key (key: suisuisui)
INSERT INTO api_keys (key_hash, name, description, rate_limit_per_hour) 
VALUES ('$2b$10$8K1p/a0dclxKoNqIfrHb2eUZfYVdU2E4/m/6XI2LINfA8hdxrUEjC', 'Default API Key', 'Default API key for development', 1000)
ON CONFLICT (key_hash) DO NOTHING;

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('faucet_amount', '100000000', 'Default faucet amount in MIST (0.1 SUI)'),
('max_requests_per_hour', '1', 'Maximum requests per wallet per hour'),
('maintenance_mode', 'false', 'Enable/disable maintenance mode')
ON CONFLICT (key) DO NOTHING;
