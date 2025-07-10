// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOFT, SendParam, MessagingFee, MessagingReceipt, OFTReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

/**
 * @title SimpleOFTTest
 * @notice Simple contract to test OFT adapter functionality
 */
contract SimpleOFTTest {
    using OptionsBuilder for bytes;
    
    address public immutable WETH;
    address public immutable OFT_ADAPTER;
    uint256 public constant ARBITRUM_ENDPOINT = 40231;
    
    event TestStarted(address sender, uint256 amount);
    event ApprovalSet(uint256 amount);
    event QuoteReceived(uint256 nativeFee);
    event SendAttempted(bytes32 guid);
    event TestCompleted(bool success);
    
    constructor(address _weth, address _oftAdapter) {
        WETH = _weth;
        OFT_ADAPTER = _oftAdapter;
    }
    
    /**
     * @notice Test sending WETH cross-chain
     * @param amount Amount of WETH to send
     * @param recipient Recipient address
     */
    function testSend(uint256 amount, address recipient) external payable {
        emit TestStarted(msg.sender, amount);
        
        // Transfer WETH from sender to this contract
        IERC20(WETH).transferFrom(msg.sender, address(this), amount);
        
        // Approve OFT adapter
        IERC20(WETH).approve(OFT_ADAPTER, amount);
        emit ApprovalSet(amount);
        
        // Build options
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(200000, 0);
        
        // Prepare send parameters
        SendParam memory sendParam = SendParam({
            dstEid: uint32(ARBITRUM_ENDPOINT),
            to: bytes32(uint256(uint160(recipient))),
            amountLD: amount,
            minAmountLD: amount * 99 / 100, // 1% slippage
            extraOptions: options,
            composeMsg: "",
            oftCmd: ""
        });
        
        // Get quote
        MessagingFee memory fee = IOFT(OFT_ADAPTER).quoteSend(sendParam, false);
        emit QuoteReceived(fee.nativeFee);
        
        // Attempt send
        require(msg.value >= fee.nativeFee, "Insufficient fee");
        
        try IOFT(OFT_ADAPTER).send{value: fee.nativeFee}(
            sendParam,
            fee,
            payable(msg.sender)
        ) returns (MessagingReceipt memory receipt, OFTReceipt memory) {
            emit SendAttempted(receipt.guid);
            emit TestCompleted(true);
        } catch Error(string memory reason) {
            revert(string.concat("Send failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert("Send failed with low-level error");
        }
    }
    
    /**
     * @notice Get balance of WETH in this contract
     */
    function getWETHBalance() external view returns (uint256) {
        return IERC20(WETH).balanceOf(address(this));
    }
    
    /**
     * @notice Get balance of WETH in OFT adapter
     */
    function getOFTBalance() external view returns (uint256) {
        return IERC20(WETH).balanceOf(OFT_ADAPTER);
    }
}