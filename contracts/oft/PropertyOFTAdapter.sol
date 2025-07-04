// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

/**
 * @title PropertyOFTAdapter
 * @notice OFT Adapter for standard ERC20 tokens (WETH, USDC, etc) that don't have mint/burn
 * @dev Uses lock/unlock mechanism for cross-chain transfers
 */
contract PropertyOFTAdapter is OFTAdapter {
    /**
     * @dev Constructor for PropertyOFTAdapter
     * @param _token The ERC20 token to adapt (e.g., WETH, USDC)
     * @param _lzEndpoint The LayerZero V2 endpoint address
     * @param _delegate The delegate for OApp configurations
     */
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) {}

}