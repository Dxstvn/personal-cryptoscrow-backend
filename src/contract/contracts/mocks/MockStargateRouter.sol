// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract MockStargateRouter {
    event MockSwap(
        uint16 dstChainId,
        uint256 srcPoolId,
        uint256 dstPoolId,
        address refundAddress,
        uint256 amountLD,
        uint256 minAmountLD
    );

    event MockSwapETH(
        uint16 dstChainId,
        address refundAddress,
        bytes toAddress,
        uint256 amountLD,
        uint256 minAmountLD
    );

    struct lzTxObj {
        uint256 dstGasForCall;
        uint256 dstNativeAmount;
        bytes dstNativeAddr;
    }

    function swap(
        uint16 _dstChainId,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        address payable _refundAddress,
        uint256 _amountLD,
        uint256 _minAmountLD,
        lzTxObj memory _lzTxParams,
        bytes calldata _to,
        bytes calldata _payload
    ) external payable {
        emit MockSwap(_dstChainId, _srcPoolId, _dstPoolId, _refundAddress, _amountLD, _minAmountLD);
    }

    function swapETH(
        uint16 _dstChainId,
        address payable _refundAddress,
        bytes calldata _toAddress,
        uint256 _amountLD,
        uint256 _minAmountLD
    ) external payable {
        emit MockSwapETH(_dstChainId, _refundAddress, _toAddress, _amountLD, _minAmountLD);
    }

    function quoteLayerZeroFee(
        uint16 _dstChainId,
        uint8 _functionType,
        bytes calldata _toAddress,
        bytes calldata _transferAndCallPayload,
        lzTxObj memory _lzTxParams
    ) external pure returns (uint256, uint256) {
        // Return mock fee of 0.001 ETH
        return (1000000000000000, 0);
    }
}