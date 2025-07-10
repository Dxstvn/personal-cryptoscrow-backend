// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleWETHBridge
 * @notice A simple bridge contract for testing cross-chain WETH transfers
 * @dev This is a centralized solution for testing - NOT for production
 */
contract SimpleWETHBridge is Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable WETH;
    
    struct PendingTransfer {
        address recipient;
        uint256 amount;
        uint256 targetChainId;
        bool completed;
    }
    
    mapping(bytes32 => PendingTransfer) public pendingTransfers;
    mapping(address => bool) public relayers;
    
    event TransferQueued(bytes32 indexed transferId, address indexed recipient, uint256 amount, uint256 targetChainId);
    event TransferCompleted(bytes32 indexed transferId);
    event RelayerSet(address indexed relayer, bool authorized);
    
    modifier onlyRelayer() {
        require(relayers[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }
    
    constructor(address _weth) Ownable(msg.sender) {
        WETH = IERC20(_weth);
    }
    
    /**
     * @notice Queue a cross-chain transfer
     * @param recipient The recipient on the target chain
     * @param amount The amount of WETH to transfer
     * @param targetChainId The target chain ID
     */
    function queueTransfer(
        address recipient,
        uint256 amount,
        uint256 targetChainId
    ) external returns (bytes32 transferId) {
        // Pull WETH from sender
        WETH.safeTransferFrom(msg.sender, address(this), amount);
        
        // Create transfer ID
        transferId = keccak256(
            abi.encodePacked(
                msg.sender,
                recipient,
                amount,
                targetChainId,
                block.timestamp,
                block.number
            )
        );
        
        // Store transfer details
        pendingTransfers[transferId] = PendingTransfer({
            recipient: recipient,
            amount: amount,
            targetChainId: targetChainId,
            completed: false
        });
        
        emit TransferQueued(transferId, recipient, amount, targetChainId);
    }
    
    /**
     * @notice Complete a transfer on the destination chain
     * @param transferId The transfer ID from the source chain
     * @param recipient The recipient address
     * @param amount The amount to transfer
     */
    function completeTransfer(
        bytes32 transferId,
        address recipient,
        uint256 amount
    ) external onlyRelayer {
        // In production, this would verify the transfer details
        // For testing, the relayer just provides the details
        
        // Transfer WETH to recipient
        WETH.safeTransfer(recipient, amount);
        
        emit TransferCompleted(transferId);
    }
    
    /**
     * @notice Set relayer authorization
     */
    function setRelayer(address relayer, bool authorized) external onlyOwner {
        relayers[relayer] = authorized;
        emit RelayerSet(relayer, authorized);
    }
    
    /**
     * @notice Withdraw WETH (owner only)
     */
    function withdrawWETH(uint256 amount) external onlyOwner {
        WETH.safeTransfer(owner(), amount);
    }
    
    /**
     * @notice Get WETH balance
     */
    function getBalance() external view returns (uint256) {
        return WETH.balanceOf(address(this));
    }
}