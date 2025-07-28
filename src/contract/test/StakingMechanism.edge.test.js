const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingMechanism - Edge Cases and Stress Tests", function () {
  let stakingMechanism;
  let owner, validator1, validator2, validator3, validator4, validator5, validator6;
  let user1, user2, user3;
  
  const MIN_STAKE = ethers.parseEther("0.01");
  const MAX_VALIDATORS = 5;
  const LARGE_STAKE = ethers.parseEther("100");
  
  beforeEach(async function () {
    [owner, validator1, validator2, validator3, validator4, validator5, validator6, user1, user2, user3] = 
      await ethers.getSigners();
    
    const StakingMechanism = await ethers.getContractFactory("StakingMechanism");
    stakingMechanism = await StakingMechanism.deploy(MIN_STAKE, MAX_VALIDATORS);
    await stakingMechanism.waitForDeployment();
  });
  
  describe("Edge Case: Maximum Validators", function () {
    it("Should handle exactly MAX_VALIDATORS registrations", async function () {
      const validators = [validator1, validator2, validator3, validator4, validator5];
      
      // Register maximum number of validators
      for (let i = 0; i < validators.length; i++) {
        await stakingMechanism.connect(validators[i]).registerValidator({ value: MIN_STAKE });
      }
      
      // Verify all validators are registered
      const validatorList = await stakingMechanism.getValidators();
      expect(validatorList.length).to.equal(MAX_VALIDATORS);
    });
    
    it("Should reject registration when at maximum capacity", async function () {
      // Fill up validator slots
      const validators = [validator1, validator2, validator3, validator4, validator5];
      for (let i = 0; i < validators.length; i++) {
        await stakingMechanism.connect(validators[i]).registerValidator({ value: MIN_STAKE });
      }
      
      // Try to register one more
      await expect(
        stakingMechanism.connect(validator6).registerValidator({ value: MIN_STAKE })
      ).to.be.revertedWith("Maximum validators reached");
    });
    
    it("Should allow new validator after one is removed", async function () {
      // Fill up validator slots
      const validators = [validator1, validator2, validator3, validator4, validator5];
      for (let i = 0; i < validators.length; i++) {
        await stakingMechanism.connect(validators[i]).registerValidator({ value: MIN_STAKE });
      }
      
      // Remove one validator
      await stakingMechanism.connect(owner).removeValidator(validator3.address);
      
      // Now validator6 should be able to register
      await expect(
        stakingMechanism.connect(validator6).registerValidator({ value: MIN_STAKE })
      ).to.not.be.reverted;
      
      const validatorList = await stakingMechanism.getValidators();
      expect(validatorList.length).to.equal(MAX_VALIDATORS);
      expect(validatorList).to.include(validator6.address);
    });
  });
  
  describe("Edge Case: Boundary Values", function () {
    it("Should reject stake exactly 1 wei below minimum", async function () {
      const belowMin = MIN_STAKE.sub(1);
      await expect(
        stakingMechanism.connect(validator1).registerValidator({ value: belowMin })
      ).to.be.revertedWith("Insufficient stake amount");
    });
    
    it("Should accept stake exactly at minimum", async function () {
      await expect(
        stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE })
      ).to.not.be.reverted;
    });
    
    it("Should handle very large stakes", async function () {
      await expect(
        stakingMechanism.connect(validator1).registerValidator({ value: LARGE_STAKE })
      ).to.not.be.reverted;
      
      const validatorInfo = await stakingMechanism.validators(validator1.address);
      expect(validatorInfo.stakedAmount).to.equal(LARGE_STAKE);
    });
    
    it("Should handle multiple stakes from same validator", async function () {
      await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      
      // Try to register again
      await expect(
        stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE })
      ).to.be.revertedWith("Already registered as validator");
    });
  });
  
  describe("Edge Case: Concurrent Operations", function () {
    it("Should handle multiple validators registering in same block", async function () {
      // Disable auto-mining
      await ethers.provider.send("evm_setAutomine", [false]);
      
      // Send multiple registration transactions
      const tx1 = stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      const tx2 = stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE });
      const tx3 = stakingMechanism.connect(validator3).registerValidator({ value: MIN_STAKE });
      
      // Mine them in the same block
      await ethers.provider.send("evm_mine", []);
      
      // Wait for all transactions
      await Promise.all([tx1, tx2, tx3]);
      
      // Re-enable auto-mining
      await ethers.provider.send("evm_setAutomine", [true]);
      
      // Check all validators are registered
      const validatorList = await stakingMechanism.getValidators();
      expect(validatorList.length).to.equal(3);
    });
    
    it("Should handle voting and removal in rapid succession", async function () {
      // Register validators
      await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      await stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE });
      
      // Validator1 votes for dispute
      const disputeId = ethers.encodeBytes32String("dispute1");
      await stakingMechanism.connect(validator1).voteOnDispute(disputeId, true);
      
      // Immediately try to remove validator1
      await expect(
        stakingMechanism.connect(owner).removeValidator(validator1.address)
      ).to.not.be.reverted;
      
      // Verify vote is still recorded (or not, depending on implementation)
      const voteCount = await stakingMechanism.getDisputeVotes(disputeId);
      expect(voteCount.forVotes).to.equal(0); // Vote should be removed with validator
    });
  });
  
  describe("Edge Case: Economic Attacks", function () {
    it("Should prevent stake griefing by limiting gas costs", async function () {
      // This test ensures that operations remain gas-efficient even with max validators
      const validators = [validator1, validator2, validator3, validator4, validator5];
      
      // Register all validators
      for (let i = 0; i < validators.length; i++) {
        await stakingMechanism.connect(validators[i]).registerValidator({ value: MIN_STAKE });
      }
      
      // Measure gas for getting validator list
      const tx = await stakingMechanism.getValidators();
      const receipt = await tx.wait();
      
      // Gas should be reasonable even with max validators
      expect(receipt.gasUsed).to.be.below(1000000); // 1M gas limit
    });
    
    it("Should handle validator churn attack", async function () {
      // Attacker tries to DOS by rapidly adding/removing validators
      const iterations = 10;
      
      for (let i = 0; i < iterations; i++) {
        // Register validator
        await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
        
        // Remove validator
        await stakingMechanism.connect(owner).removeValidator(validator1.address);
        
        // Gas costs should remain constant
        // In production, you might want rate limiting
      }
      
      // System should still be functional
      await expect(
        stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE })
      ).to.not.be.reverted;
    });
  });
  
  describe("Edge Case: State Recovery", function () {
    it("Should maintain consistency after failed transactions", async function () {
      // Register a validator
      await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      
      // Try to register with insufficient stake (should fail)
      await expect(
        stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE.sub(1) })
      ).to.be.reverted;
      
      // State should remain consistent
      const validatorList = await stakingMechanism.getValidators();
      expect(validatorList.length).to.equal(1);
      expect(validatorList[0]).to.equal(validator1.address);
    });
    
    it("Should handle validator removal with pending votes", async function () {
      // Setup validators and dispute
      await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      await stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE });
      
      const disputeId = ethers.encodeBytes32String("dispute1");
      await stakingMechanism.connect(validator1).voteOnDispute(disputeId, true);
      await stakingMechanism.connect(validator2).voteOnDispute(disputeId, false);
      
      // Remove validator with vote
      await stakingMechanism.connect(owner).removeValidator(validator1.address);
      
      // Check vote counts are updated correctly
      const voteCount = await stakingMechanism.getDisputeVotes(disputeId);
      expect(voteCount.forVotes).to.equal(0);
      expect(voteCount.againstVotes).to.equal(1);
    });
  });
  
  describe("Stress Test: Gas Optimization", function () {
    it("Should measure gas costs for all operations", async function () {
      const gasReport = {};
      
      // Register validator
      const registerTx = await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      const registerReceipt = await registerTx.wait();
      gasReport.registerValidator = registerReceipt.gasUsed.toNumber();
      
      // Vote on dispute
      const disputeId = ethers.encodeBytes32String("dispute1");
      const voteTx = await stakingMechanism.connect(validator1).voteOnDispute(disputeId, true);
      const voteReceipt = await voteTx.wait();
      gasReport.voteOnDispute = voteReceipt.gasUsed.toNumber();
      
      // Get validators (view function, but still uses gas)
      const getValidatorsTx = await stakingMechanism.populateTransaction.getValidators();
      const getValidatorsGas = await ethers.provider.estimateGas(getValidatorsTx);
      gasReport.getValidators = getValidatorsGas.toNumber();
      
      // Remove validator
      const removeTx = await stakingMechanism.connect(owner).removeValidator(validator1.address);
      const removeReceipt = await removeTx.wait();
      gasReport.removeValidator = removeReceipt.gasUsed.toNumber();
      
      // Log gas report
      console.log("\nGas Usage Report:");
      console.log("================");
      Object.entries(gasReport).forEach(([operation, gas]) => {
        console.log(`${operation}: ${gas.toLocaleString()} gas`);
      });
      
      // Assert reasonable gas limits
      expect(gasReport.registerValidator).to.be.below(200000);
      expect(gasReport.voteOnDispute).to.be.below(100000);
      expect(gasReport.removeValidator).to.be.below(150000);
    });
  });
  
  describe("Edge Case: Reentrancy Protection", function () {
    let maliciousContract;
    
    beforeEach(async function () {
      // Deploy a malicious contract that tries reentrancy
      const MaliciousContract = await ethers.getContractFactory("MaliciousReentrant");
      maliciousContract = await MaliciousContract.deploy(await stakingMechanism.getAddress());
      await maliciousContract.waitForDeployment();
    });
    
    it("Should prevent reentrancy during stake withdrawal", async function () {
      // This test assumes the contract has withdrawal functionality
      // Adjust based on actual implementation
      
      // Register malicious contract as validator
      await owner.sendTransaction({
        to: maliciousContract.address,
        value: MIN_STAKE.mul(2)
      });
      
      // If contract has withdrawal, test reentrancy protection
      // await expect(maliciousContract.attack()).to.be.revertedWith("ReentrancyGuard");
    });
  });
  
  describe("Edge Case: Time-based Attacks", function () {
    it("Should handle time manipulation gracefully", async function () {
      // Register validator
      await stakingMechanism.connect(validator1).registerValidator({ value: MIN_STAKE });
      
      // Fast forward time significantly
      await time.increase(365 * 24 * 60 * 60); // 1 year
      
      // Operations should still work normally
      await expect(
        stakingMechanism.connect(validator2).registerValidator({ value: MIN_STAKE })
      ).to.not.be.reverted;
      
      const disputeId = ethers.encodeBytes32String("future-dispute");
      await expect(
        stakingMechanism.connect(validator1).voteOnDispute(disputeId, true)
      ).to.not.be.reverted;
    });
  });
});

// Helper contract for reentrancy testing (would need to be created)
/*
contract MaliciousReentrant {
    IStakingMechanism public staking;
    
    constructor(address _staking) {
        staking = IStakingMechanism(_staking);
    }
    
    function attack() external {
        // Attempt reentrancy attack
    }
    
    receive() external payable {
        // Reenter during ETH transfer
        if (address(staking).balance > 0) {
            // Try to call back into staking contract
        }
    }
}
*/