// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract SimpleDisputeTest {
    struct Escrow {
        address buyer;
        uint256 depositAmount;
        bool released;
    }
    
    struct Dispute {
        bool raised;
        uint256 timestamp;
        bool resolved;
    }
    
    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => Dispute) public disputes;
    
    uint256 constant RESOLUTION_PERIOD = 7 days;
    
    event FundsReturned(bytes32 escrowId, address buyer, uint256 amount);
    
    function createEscrow(bytes32 escrowId) external payable {
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            depositAmount: msg.value,
            released: false
        });
    }
    
    function raiseDispute(bytes32 escrowId) external {
        disputes[escrowId] = Dispute({
            raised: true,
            timestamp: block.timestamp,
            resolved: false
        });
    }
    
    function returnFundsAfterTimeout(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        Dispute storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Already released");
        require(dispute.raised, "No dispute");
        require(!dispute.resolved, "Already resolved");
        require(block.timestamp > dispute.timestamp + RESOLUTION_PERIOD, "Too early");
        
        escrow.released = true;
        
        payable(escrow.buyer).transfer(escrow.depositAmount);
        
        emit FundsReturned(escrowId, escrow.buyer, escrow.depositAmount);
    }
}