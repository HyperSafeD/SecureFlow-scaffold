#!/bin/bash

# SecureFlow Contract Deployment Script
# This script deploys the updated contract with rating and badge system

set -e

echo "🚀 SecureFlow Contract Deployment"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if WASM file exists
WASM_FILE="target/wasm32-unknown-unknown/release/secureflow.wasm"
if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}❌ WASM file not found. Building contract...${NC}"
    cargo build --target wasm32-unknown-unknown --release
fi

echo -e "${GREEN}✅ Contract built successfully${NC}"
echo ""

# Check for CLI (prefer `stellar`, fall back to `soroban`)
HAS_STELLAR=0
HAS_SOROBAN=0
if command -v stellar &> /dev/null; then
    HAS_STELLAR=1
fi
if command -v soroban &> /dev/null; then
    HAS_SOROBAN=1
fi

if [ "$HAS_STELLAR" -eq 0 ] && [ "$HAS_SOROBAN" -eq 0 ]; then
    echo -e "${RED}❌ Neither 'stellar' nor 'soroban' CLI was found.${NC}"
    echo "Install from: https://developers.stellar.org/docs/tools/cli"
    exit 1
fi

# Get network (default to testnet)
NETWORK=${1:-testnet}
echo -e "${YELLOW}📡 Deploying to: ${NETWORK}${NC}"
echo ""

# Check if source account is provided
if [ -z "$2" ]; then
    echo -e "${YELLOW}⚠️  No source account provided.${NC}"
    echo "Usage: ./deploy.sh [network] [source-account]"
    echo "Example: ./deploy.sh testnet GABCDEF..."
    echo ""
    echo "Please provide your Stellar account public key:"
    read -p "Source Account: " SOURCE_ACCOUNT
else
    SOURCE_ACCOUNT=$2
fi

echo ""
echo -e "${YELLOW}📦 Deploying contract...${NC}"
echo ""

# Deploy contract (capture output even on failure)
set +e
if [ "$HAS_STELLAR" -eq 1 ]; then
    DEPLOY_OUTPUT=$(stellar contract deploy \
        --wasm "$WASM_FILE" \
        --source-account "$SOURCE_ACCOUNT" \
        --network "$NETWORK" 2>&1)
    DEPLOY_EXIT_CODE=$?
else
    DEPLOY_OUTPUT=$(soroban contract deploy \
        --wasm "$WASM_FILE" \
        --source "$SOURCE_ACCOUNT" \
        --network "$NETWORK" 2>&1)
    DEPLOY_EXIT_CODE=$?
fi
set -e

if [ "$DEPLOY_EXIT_CODE" -ne 0 ]; then
    echo -e "${RED}❌ Deployment command failed (exit code: ${DEPLOY_EXIT_CODE})${NC}"
    echo "Output:"
    echo "$DEPLOY_OUTPUT"
    exit "$DEPLOY_EXIT_CODE"
fi

# Extract contract ID from output (portable across macOS/Linux)
# Stellar/Soroban contract IDs are StrKey and start with "C" (56 chars).
CONTRACT_ID=$(
  echo "$DEPLOY_OUTPUT" | awk '
    {
      # If the line itself is a contract id, keep it
      if ($0 ~ /^C[A-Z2-7]{55}$/) id=$0

      # If the line contains a lab URL, extract after /contract/
      if (match($0, /\/contract\/(C[A-Z2-7]{55})/, m)) id=m[1]
    }
    END { print id }
  '
)

if [ -z "$CONTRACT_ID" ]; then
    echo -e "${RED}❌ Deployment failed or contract ID not found${NC}"
    echo "Output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ Contract deployed successfully!${NC}"
echo ""
echo -e "${GREEN}📝 Contract ID: ${CONTRACT_ID}${NC}"
echo ""

# Save contract ID to file
echo "$CONTRACT_ID" > .contract-id
echo "Contract ID saved to .contract-id"

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Initialize contract storage once (owner + fee collector + fee in basis points, max 1000 = 10%):"
echo ""
echo "   stellar contract invoke \\"
echo "     --network $NETWORK \\"
echo "     --source-account $SOURCE_ACCOUNT \\"
echo "     --id $CONTRACT_ID \\"
echo "     -- initialize \\"
echo "     --owner <OWNER_PUBLIC_KEY> \\"
echo "     --fee_collector <FEE_COLLECTOR_PUBLIC_KEY> \\"
echo "     --platform_fee_bp 100"
echo ""
echo "2. Update your .env file with:"
echo "   VITE_SECUREFLOW_CONTRACT_ID=$CONTRACT_ID"
echo ""
echo "3. Rebuild frontend:"
echo "   npm run build"
echo ""
echo -e "${GREEN}✨ Deployment complete!${NC}"
