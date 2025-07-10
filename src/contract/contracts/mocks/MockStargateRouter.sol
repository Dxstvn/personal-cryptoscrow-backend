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
    
    // Mock fee amount (0.001 ETH)
    uint256 constant MOCK_FEE = 0.001 ether;
    
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
        require(msg.value >= MOCK_FEE, "Insufficient fee");
        
        emit MockSwap(
            _dstChainId,
            _srcPoolId,
            _dstPoolId,
            _refundAddress,
            _amountLD,
            _minAmountLD
        );
        
        // Refund excess fee
        if (msg.value > MOCK_FEE) {
            _refundAddress.transfer(msg.value - MOCK_FEE);
        }
    }
    
    function swapETH(
        uint16 _dstChainId,
        address payable _refundAddress,
        bytes calldata _toAddress,
        uint256 _amountLD,
        uint256 _minAmountLD
    ) external payable {
        require(msg.value >= _amountLD + MOCK_FEE, "Insufficient value");
        
        emit MockSwapETH(
            _dstChainId,
            _refundAddress,
            _toAddress,
            _amountLD,
            _minAmountLD
        );
        
        // Refund excess fee
        uint256 excess = msg.value - _amountLD - MOCK_FEE;
        if (excess > 0) {
            _refundAddress.transfer(excess);
        }
    }
    
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        uint8 _functionType,
        bytes calldata _toAddress,
        bytes calldata _transferAndCallPayload,
        lzTxObj memory _lzTxParams
    ) external pure returns (uint256 nativeFee, uint256 zroFee) {
        // Return mock fee
        return (MOCK_FEE, 0);
    }
    
    // For ETH router
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        bytes calldata _toAddress,
        lzTxObj memory _lzTxParams
    ) external pure returns (uint256 nativeFee, uint256 zroFee) {
        // Return mock fee
        return (MOCK_FEE, 0);
    }
}