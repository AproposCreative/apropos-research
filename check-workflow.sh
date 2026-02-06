#!/bin/bash
# Script to check GitHub Actions workflow status

WORKFLOW_NAME="Daily Article Ingestion"
RUN_ID=${1:-""}

if [ -z "$RUN_ID" ]; then
    echo "🔍 Checking latest workflow run..."
    gh run list --workflow="$WORKFLOW_NAME" --limit 1 --json status,conclusion,displayTitle,url,createdAt,headSha | jq -r '.[0] | "Status: \(.status)\nConclusion: \(.conclusion // "N/A")\nCreated: \(.createdAt)\nCommit: \(.headSha)\nURL: \(.url)"'
    RUN_ID=$(gh run list --workflow="$WORKFLOW_NAME" --limit 1 --json databaseId --jq '.[0].databaseId')
else
    echo "🔍 Checking workflow run #$RUN_ID..."
fi

echo ""
echo "📊 Live status:"
gh run watch $RUN_ID --exit-status || true

echo ""
echo "📋 Final status:"
gh run view $RUN_ID --json status,conclusion,displayTitle,url,createdAt,headSha | jq -r '"Status: \(.status)\nConclusion: \(.conclusion // "N/A")\nURL: \(.url)"'
