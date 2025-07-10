const { ethers } = require('ethers');

const addresses = [
  '0x7612fc49b82d42623468bb966e0d59a7d35ea8b9',
  '0x5da4745a766d5eabd30ffbdc32b3b953d399dd1f'
];

addresses.forEach(addr => {
  const checksum = ethers.getAddress(addr.toLowerCase());
  console.log(`${addr} -> ${checksum}`);
});