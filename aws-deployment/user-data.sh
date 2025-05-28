#!/bin/bash
yum update -y
yum install -y git nodejs npm

# Install PM2 globally
npm install -g pm2

# Create app directory
mkdir -p /home/ec2-user/cryptoescrow-backend
chown ec2-user:ec2-user /home/ec2-user/cryptoescrow-backend

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

echo "EC2 instance initialization complete" > /var/log/user-data.log 