# Full-Stack Development Environment

## Overview

The ClearHold backend provides convenient commands to start all required services for full-stack local development, including integration with Vercel-hosted frontends using ngrok.

## Quick Start

### Local Frontend Development
```bash
npm run fullstack
```

### Vercel Frontend Integration
```bash
npm run fullstack:ngrok
```

This single command starts:
- 🔥 **Firebase Emulators** (Auth, Firestore, Storage)
- ⛓️ **Hardhat Local Blockchain** 
- 🚀 **Backend API Server**

## What Gets Started

### 1. Firebase Emulators
- **Auth Emulator**: `http://localhost:9099`
- **Firestore Emulator**: `http://localhost:5004`  
- **Storage Emulator**: `http://localhost:9199`
- **Project ID**: `demo-test`

### 2. Hardhat Blockchain
- **RPC URL**: `http://localhost:8545`
- **Chain ID**: `31337`
- **Test Accounts**: Pre-funded accounts for testing

### 3. Backend API
- **API URL**: `http://localhost:3000`
- **Environment**: Development mode with hot-reload
- **Auto-connects** to emulators and local blockchain

## Frontend Integration

Start your frontend separately:

```bash
# In your frontend directory
cd ../eth  # or wherever your frontend is
npm run dev
```

The frontend typically runs on `http://localhost:5173` and is already configured in CORS.

## Environment Setup

The fullstack script automatically sets up:
- `NODE_ENV=development`
- Firebase emulator host variables
- Connects to local services instead of cloud

## Useful Commands

```bash
# Start everything
npm run fullstack

# Start with clean data (clears emulator data)
npm run emulator:clear

# Start services individually
npm run emulator:start    # Just Firebase emulators
npm run hardhat:node       # Just Hardhat
npm run dev               # Just backend server
```

## Testing the Setup

1. **Check Backend Health**:
```bash
curl http://localhost:3000/health
```

2. **Test Passwordless Auth**:
```bash
node scripts/testPasswordlessEmail.js
```

3. **Check Blockchain Connection**:
```bash
curl http://localhost:8545
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
# Kill specific ports
npx kill-port 3000 5004 8545 9099 9199

# Or use the killall script
npm run killall
```

### Emulators Not Starting

Make sure Firebase CLI is installed:
```bash
npm install -g firebase-tools
```

### Hardhat Issues

Ensure you're in the contract directory:
```bash
cd src/contract
npm install
```

## Ngrok Integration for Vercel

### Starting with Ngrok

```bash
npm run fullstack:ngrok
```

This command:
1. Starts all local services (Firebase, Hardhat, Backend)
2. Creates an ngrok tunnel to expose your local backend
3. Displays the ngrok URL to use in Vercel
4. Saves the URL to `.ngrok-url` file

### Setting Up Vercel

1. **Get the ngrok URL**:
   ```bash
   npm run ngrok:url
   ```

2. **Update Vercel Environment Variable**:
   ```bash
   vercel env add NEXT_PUBLIC_API_URL "https://your-url.ngrok.io"
   ```

3. **Redeploy or use Vercel CLI**:
   ```bash
   vercel --prod
   ```

### Important Notes

- **URL Changes**: Ngrok URL changes each restart
- **Update Vercel**: Must update env var when URL changes  
- **CORS Configured**: Backend accepts ngrok domains
- **Free Limits**: Ngrok free tier has request limits

## Development Workflow

### Local Development
1. **Start Services**: `npm run fullstack`
2. **Start Frontend**: In separate terminal
3. **Make Changes**: Backend auto-reloads with nodemon
4. **Test Features**: Use provided test scripts
5. **Stop Services**: `Ctrl+C` stops everything

### Vercel Integration
1. **Start with Ngrok**: `npm run fullstack:ngrok`
2. **Copy ngrok URL**: Displayed in terminal
3. **Update Vercel**: Set `NEXT_PUBLIC_API_URL`
4. **Test on Vercel**: Your live frontend uses local backend
5. **Iterate Quickly**: Changes reflect immediately

## Security Notes

- All services run locally - no cloud costs
- Test accounts have pre-funded wallets
- Emulator data persists between restarts
- Use `emulator:clear` to reset data

## Integration Points

The backend automatically:
- Uses Firebase emulators when `NODE_ENV !== 'production'`
- Connects to local Hardhat node for blockchain operations
- Accepts requests from localhost frontend origins
- Provides full API functionality locally