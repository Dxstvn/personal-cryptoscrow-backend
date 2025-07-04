// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockLayerZeroEndpoint
 * @dev Mock LayerZero V2 endpoint for testing
 */
contract MockLayerZeroEndpoint {
    uint32 public eid;
    mapping(address => address) public delegates;
    
    // Mock fee for testing
    uint256 constant MOCK_FEE = 0.001 ether;
    
    constructor(uint32 _eid) {
        eid = _eid;
    }
    
    function setDelegate(address oapp) external {
        delegates[oapp] = msg.sender;
    }
    
    function quote(
        MessagingParams calldata /*params*/,
        address /*sender*/
    ) external pure returns (MessagingFee memory) {
        return MessagingFee({
            nativeFee: MOCK_FEE,
            lzTokenFee: 0
        });
    }
    
    function send(
        MessagingParams calldata params,
        address /*refundAddress*/
    ) external payable returns (MessagingReceipt memory) {
        require(msg.value >= MOCK_FEE, "Insufficient fee");
        
        // Mock implementation - just return a receipt
        return MessagingReceipt({
            guid: keccak256(abi.encode(block.timestamp, params.dstEid, params.receiver)),
            nonce: 1,
            fee: MessagingFee({
                nativeFee: MOCK_FEE,
                lzTokenFee: 0
            })
        });
    }
}

// Mock structs to match LayerZero V2 interface
struct MessagingParams {
    uint32 dstEid;
    bytes32 receiver;
    bytes message;
    bytes options;
    bool payInLzToken;
}

struct MessagingFee {
    uint256 nativeFee;
    uint256 lzTokenFee;
}

struct MessagingReceipt {
    bytes32 guid;
    uint64 nonce;
    MessagingFee fee;
}