#!/bin/bash

# 🔒 Security Check Script for Sui Faucet
# This script checks for common security issues

echo "🔍 Running Security Check..."
echo "============================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ISSUES_FOUND=0

# Function to report issues
report_issue() {
    echo -e "${RED}❌ SECURITY ISSUE: $1${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
}

report_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

report_ok() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Check 1: Look for committed .env files with real values
echo "🔍 Checking for committed secrets..."

if find . -name ".env" -not -path "./node_modules/*" | grep -q .; then
    for env_file in $(find . -name ".env" -not -path "./node_modules/*"); do
        if git ls-files --error-unmatch "$env_file" 2>/dev/null; then
            report_issue "Found committed .env file: $env_file"
        fi
    done
else
    report_ok "No .env files found in repository"
fi

# Check 2: Look for hardcoded secrets in source code
echo "🔍 Checking for hardcoded secrets..."

# Common secret patterns
SECRET_PATTERNS=(
    "password.*=.*['\"][^'\"]{8,}['\"]"
    "token.*=.*['\"][^'\"]{20,}['\"]"
    "key.*=.*['\"][^'\"]{16,}['\"]"
    "secret.*=.*['\"][^'\"]{16,}['\"]"
    "api_key.*=.*['\"][^'\"]{16,}['\"]"
    "private_key.*=.*['\"][^'\"]{32,}['\"]"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -i -E "$pattern" --include="*.ts" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist . | grep -v ".example" | grep -q .; then
        report_warning "Potential hardcoded secret found (pattern: $pattern)"
        grep -r -i -E "$pattern" --include="*.ts" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist . | grep -v ".example" | head -3
    fi
done

# Check 3: Look for database URLs with credentials
echo "🔍 Checking for exposed database URLs..."

if grep -r "postgresql://.*:.*@" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist . | grep -v ".example" | grep -q .; then
    report_issue "Found database URL with credentials in source code"
    grep -r "postgresql://.*:.*@" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist . | grep -v ".example"
fi

# Check 4: Look for Discord tokens
echo "🔍 Checking for Discord tokens..."

if grep -r -E "MTM[A-Za-z0-9]{21,}" --include="*.ts" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist . | grep -v ".example" | grep -q .; then
    report_issue "Found potential Discord token in source code"
fi

# Check 5: Check file permissions
echo "🔍 Checking file permissions..."

if find . -name "*.key" -o -name "*.pem" -o -name "id_rsa" | grep -q .; then
    for key_file in $(find . -name "*.key" -o -name "*.pem" -o -name "id_rsa"); do
        if [ -f "$key_file" ]; then
            perms=$(stat -f "%A" "$key_file" 2>/dev/null || stat -c "%a" "$key_file" 2>/dev/null)
            if [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
                report_warning "Key file $key_file has insecure permissions: $perms (should be 600 or 400)"
            fi
        fi
    done
fi

# Check 6: Look for backup files
echo "🔍 Checking for backup files..."

BACKUP_PATTERNS=(
    "*.backup"
    "*.bak"
    "*.old"
    "dump.sql"
    "backup.sql"
)

for pattern in "${BACKUP_PATTERNS[@]}"; do
    if find . -name "$pattern" -not -path "./node_modules/*" | grep -q .; then
        report_warning "Found backup files that might contain sensitive data:"
        find . -name "$pattern" -not -path "./node_modules/*"
    fi
done

# Check 7: Verify .gitignore coverage
echo "🔍 Checking .gitignore coverage..."

SENSITIVE_PATTERNS=(
    ".env"
    "*.key"
    "*.pem"
    "logs/"
    "*.log"
)

if [ -f ".gitignore" ]; then
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if ! grep -q "$pattern" .gitignore; then
            report_warning ".gitignore missing pattern: $pattern"
        fi
    done
    report_ok ".gitignore file exists"
else
    report_issue "No .gitignore file found"
fi

# Check 8: Look for TODO/FIXME with security implications
echo "🔍 Checking for security TODOs..."

if grep -r -i -E "(TODO|FIXME|HACK).*security" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist . | grep -q .; then
    report_warning "Found security-related TODOs:"
    grep -r -i -E "(TODO|FIXME|HACK).*security" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist .
fi

# Summary
echo ""
echo "🔍 Security Check Complete"
echo "=========================="

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ No critical security issues found!${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ISSUES_FOUND security issue(s) that need attention!${NC}"
    echo ""
    echo "📋 Next steps:"
    echo "1. Review and fix the issues listed above"
    echo "2. Update .gitignore if needed"
    echo "3. Remove any committed secrets"
    echo "4. Regenerate compromised credentials"
    echo "5. Run this script again to verify fixes"
    exit 1
fi
