# AWS Certificate Manager SSL Solution (RECOMMENDED)

## Why AWS Certificate Manager is Better for Your Use Case

### Benefits:
✅ **Zero maintenance** - AWS handles renewal automatically  
✅ **No server configuration** required  
✅ **Higher reliability** - AWS infrastructure  
✅ **Free for AWS Load Balancers**  
✅ **Bypasses OpenSSL/Python compatibility issues**  
✅ **Enterprise-grade security**  

### Quick Setup (15 minutes)

## Step 1: Request SSL Certificate in ACM

1. Go to AWS Certificate Manager in your AWS Console
2. Click "Request a certificate"
3. Choose "Request a public certificate"
4. Add domain names:
   - `clearhold.app`
   - `www.clearhold.app`
5. Choose "DNS validation" (recommended)
6. Review and request

## Step 2: Validate Domain Ownership

1. ACM will provide DNS records to add
2. Add these CNAME records to your domain registrar (Namecheap):
   - Copy the Name and Value from ACM
   - Add as CNAME records in Namecheap DNS

## Step 3: Create Application Load Balancer

```bash
# Get your current instance ID
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
echo "Instance ID: $INSTANCE_ID"

# Get your VPC ID
VPC_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].VpcId' --output text)
echo "VPC ID: $VPC_ID"
```

### Via AWS Console (Easier):

1. **EC2 → Load Balancers → Create Load Balancer**
2. Choose "Application Load Balancer"
3. **Basic configuration:**
   - Name: `clearhold-app-alb`
   - Scheme: Internet-facing
   - IP address type: IPv4

4. **Network mapping:**
   - VPC: Select your VPC
   - Availability Zones: Select at least 2 AZs
   - Subnets: Select public subnets

5. **Security groups:**
   - Create new security group or select existing
   - Allow inbound: HTTP (80) and HTTPS (443) from anywhere

6. **Listeners and routing:**
   - **HTTP:80** → Create target group
     - Target type: Instances
     - Protocol: HTTP, Port: 3000
     - Health check path: `/health` (or `/`)
     - Register your EC2 instance
   
   - **HTTPS:443** → Same target group
     - SSL certificate: Select your ACM certificate

## Step 4: Update DNS

Update your DNS A record to point to the Load Balancer:
- **Type:** A Record
- **Host:** `@`
- **Value:** `[ALB DNS Name]` (from Load Balancer details)

## Step 5: Update Your Node.js App

Add health check endpoint if not exists:

```javascript
// Add to your server.js
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});
```

## Step 6: Test

```bash
# Test HTTP redirect
curl -I http://clearhold.app

# Test HTTPS
curl -I https://clearhold.app

# Should show SSL certificate info
openssl s_client -connect clearhold.app:443 -servername clearhold.app
```

---

## Alternative: Fix Let's Encrypt (More Complex)

If you prefer Let's Encrypt, the issue requires rebuilding Python against the new OpenSSL:

### Quick Fix Attempt:
```bash
# Try installing Python 3.8+ which may work better
sudo amazon-linux-extras install python3.8
sudo alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 2

# Reinstall certbot with new Python
sudo python3.8 -m pip install certbot certbot-nginx
sudo ln -sf /usr/local/bin/certbot /usr/bin/certbot
```

### Full Solution (Complex):
1. Compile Python from source against new OpenSSL
2. Create virtual environment with proper SSL
3. Install certbot in isolated environment

---

## Recommendation

**Use AWS Certificate Manager + ALB** because:

1. ⏱️ **Faster setup** (15 mins vs 2-3 hours debugging)
2. 🔒 **More reliable** SSL management
3. 🚀 **Better performance** with ALB
4. 💰 **Cost-effective** (ALB costs ~$16/month, but includes SSL + load balancing)
5. 🛡️ **Enterprise security** without maintenance

Your current HTTP setup is working perfectly - just need to add the Load Balancer layer for HTTPS! 