#!/bin/bash

echo "🔍 CryptoEscrow Backend Network Debugging"
echo "========================================"

echo ""
echo "📋 Step 1: Check PM2 Process Status"
pm2 list

echo ""
echo "📋 Step 2: Check Listening Ports"
echo "Active listening ports on 3000 and 5173:"
sudo netstat -tulpn | grep -E ":(3000|5173)"

echo ""
echo "📋 Step 3: Check Socket Status"
echo "Socket status for ports 3000 and 5173:"
sudo ss -tlnp | grep -E ":(3000|5173)"

echo ""
echo "📋 Step 4: Test Different Curl Approaches"
echo "Testing localhost..."
curl -s -o /dev/null -w "localhost:3000 -> HTTP %{http_code}\n" http://localhost:3000/health/simple
curl -s -o /dev/null -w "localhost:5173 -> HTTP %{http_code}\n" http://localhost:5173/health/simple

echo ""
echo "Testing 127.0.0.1..."
curl -s -o /dev/null -w "127.0.0.1:3000 -> HTTP %{http_code}\n" http://127.0.0.1:3000/health/simple
curl -s -o /dev/null -w "127.0.0.1:5173 -> HTTP %{http_code}\n" http://127.0.0.1:5173/health/simple

echo ""
echo "Testing private IP..."
PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo "Private IP: $PRIVATE_IP"
curl -s -o /dev/null -w "$PRIVATE_IP:3000 -> HTTP %{http_code}\n" http://$PRIVATE_IP:3000/health/simple
curl -s -o /dev/null -w "$PRIVATE_IP:5173 -> HTTP %{http_code}\n" http://$PRIVATE_IP:5173/health/simple

echo ""
echo "📋 Step 5: Check Security Groups"
echo "Current instance metadata:"
curl -s http://169.254.169.254/latest/meta-data/instance-id
echo ""
curl -s http://169.254.169.254/latest/meta-data/local-ipv4
echo ""

echo ""
echo "📋 Step 6: Test External Domain (ALB Health)"
echo "Testing external domains..."
curl -s -o /dev/null -w "api.clearhold.app -> HTTP %{http_code}\n" https://api.clearhold.app/health
curl -s -o /dev/null -w "staging.clearhold.app -> HTTP %{http_code}\n" https://staging.clearhold.app/health

echo ""
echo "📋 Step 7: Check PM2 Logs for Errors"
echo "Recent PM2 logs:"
pm2 logs --lines 5

echo ""
echo "📋 Step 8: Check Process Environment"
echo "Production process environment:"
pm2 show cryptoescrow-backend | grep -A 20 "│ env"

echo ""
echo "Staging process environment:"
pm2 show cryptoescrow-backend-staging | grep -A 20 "│ env"

echo ""
echo "🎯 Debugging complete!" 