// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOFT, SendParam, MessagingFee, MessagingReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
}

contract TestOFTCaller {
    IWETH public immutable WETH;
    address public immutable oftAdapter;
    
    event TestResult(string step, bool success, uint256 value);
    
    constructor(address _weth, address _oftAdapter) {
        WETH = IWETH(_weth);
        oftAdapter = _oftAdapter;
    }
    
    function testCrossChainSend(
        address recipient,
        uint256 amount
    ) external payable {
        // Step 1: Convert ETH to WETH
        WETH.deposit{value: amount}();
        emit TestResult("WETH deposit", true, amount);
        
        // Step 2: Approve OFT adapter
        WETH.approve(oftAdapter, amount);
        emit TestResult("WETH approve", true, amount);
        
        // Step 3: Prepare send params
        SendParam memory sendParam = SendParam({
            dstEid: 40161, // Sepolia
            to: bytes32(uint256(uint160(recipient))),
            amountLD: amount,
            minAmountLD: amount * 95 / 100,
            extraOptions: hex"00030100110100000000000000000000000000030d40",
            composeMsg: "",
            oftCmd: hex""
        });
        
        // Step 4: Get quote
        MessagingFee memory fee = IOFT(oftAdapter).quoteSend(sendParam, false);
        emit TestResult("Quote obtained", true, fee.nativeFee);
        
        // Step 5: Check msg.value
        require(msg.value >= amount + fee.nativeFee, "Insufficient total value");
        emit TestResult("Value check", true, msg.value);
        
        // Step 6: Send
        (MessagingReceipt memory receipt, ) = IOFT(oftAdapter).send{value: fee.nativeFee}(
            sendParam,
            fee,
            msg.sender
        );
        
        emit TestResult("Send complete", true, 0);
    }
    
    receive() external payable {}
}