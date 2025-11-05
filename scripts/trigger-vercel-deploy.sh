#!/bin/bash
# Script to trigger Vercel deployment via API

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Triggering Vercel Deployment...${NC}"

# Check if VERCEL_TOKEN is set
if [ -z "$VERCEL_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  VERCEL_TOKEN not set. Please set it in Vercel Dashboard → Settings → Tokens${NC}"
    exit 1
fi

# Check if VERCEL_PROJECT_ID is set
if [ -z "$VERCEL_PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  VERCEL_PROJECT_ID not set. Trying to get from Vercel API...${NC}"
    # Try to get project ID from Vercel API
    VERCEL_PROJECT_ID=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v9/projects?teamId=" | \
        jq -r '.projects[] | select(.name=="apropos-research") | .id' 2>/dev/null)
    
    if [ -z "$VERCEL_PROJECT_ID" ]; then
        echo -e "${RED}❌ Could not find VERCEL_PROJECT_ID. Please set it manually.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Using VERCEL_PROJECT_ID: $VERCEL_PROJECT_ID${NC}"

# Trigger deployment
RESPONSE=$(curl -s -X POST "https://api.vercel.com/v13/deployments" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"apropos-research\",
        \"project\": \"$VERCEL_PROJECT_ID\",
        \"target\": \"production\",
        \"gitSource\": {
            \"type\": \"github\",
            \"repo\": \"AproposCreative/apropos-research\",
            \"ref\": \"main\"
        }
    }")

# Check response
if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    DEPLOYMENT_ID=$(echo "$RESPONSE" | jq -r '.id')
    DEPLOYMENT_URL=$(echo "$RESPONSE" | jq -r '.url // empty')
    echo -e "${GREEN}✅ Deployment triggered successfully!${NC}"
    echo -e "${GREEN}   Deployment ID: $DEPLOYMENT_ID${NC}"
    if [ ! -z "$DEPLOYMENT_URL" ]; then
        echo -e "${GREEN}   URL: $DEPLOYMENT_URL${NC}"
    fi
    echo -e "${GREEN}📊 Check status: https://vercel.com/dashboard${NC}"
else
    echo -e "${RED}❌ Deployment failed:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

