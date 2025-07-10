// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StandardWETHOFTAdapter
 * @notice Standard OFT Adapter for WETH that works with escrow contracts
 */
contract StandardWETHOFTAdapter is OFTAdapter {
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {}
}