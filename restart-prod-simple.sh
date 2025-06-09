#!/bin/bash
echo "🔄 Restarting production PM2 process..."
pm2 restart cryptoescrow-backend
echo "✅ Production restarted. Testing in 10 seconds..."
sleep 10
echo "Testing health endpoint..."
curl -s http://localhost:3000/health | head -200
echo ""
echo "External endpoint (wait 1-2 min for AWS): https://api.clearhold.app/health" 