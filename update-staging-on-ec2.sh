#!/bin/bash

echo "🚀 Updating Staging Environment on EC2"
echo "======================================"

# Navigate to project directory
cd /home/ec2-user/personal-cryptoscrow-backend || {
    echo "❌ Error: Could not navigate to project directory"
    exit 1
}

echo "📥 Pulling latest changes from repository..."
git pull origin main

echo "🛑 Stopping current PM2 processes..."
pm2 stop all
pm2 delete all

echo "🧹 Cleaning up any processes using port 5173..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "🔧 Starting staging with fixed configuration..."
pm2 start ecosystem.staging.fixed.cjs

echo "💾 Saving PM2 configuration..."
pm2 save

echo "📊 Checking PM2 status..."
pm2 status

echo "🏥 Testing health endpoint..."
sleep 5
curl -s http://localhost:5173/health && echo -e "\n✅ Health endpoint working!" || echo -e "\n❌ Health endpoint not responding"

echo "🎯 Checking if port 5173 is listening..."
lsof -i :5173 && echo "✅ Port 5173 is listening" || echo "❌ Port 5173 is not listening"

echo "📋 Final PM2 logs (last 10 lines)..."
pm2 logs --lines 10 --nostream

echo ""
echo "🎉 Staging update complete!"
echo "Your staging server should now be accessible at: https://staging.clearhold.app/health" 