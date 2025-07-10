#!/bin/bash
# Update .env with new OFT adapter addresses

echo "" >> .env
echo "# Production OFT Adapters (owned by service wallet)" >> .env
echo "SEPOLIA_OFT_ADAPTER=0x51aF053a6BB282284E4407FaDfd13b09D93B82eE" >> .env
echo "ARBITRUM_SEPOLIA_OFT_ADAPTER=0x4E958435343fcb22128546561E078942B74DFb4b" >> .env

echo "✅ Added OFT adapter addresses to .env"