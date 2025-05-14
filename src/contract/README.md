# Smart Contracts (`src/contract`)

## Overview

This directory is the heart of the on-chain logic for the CryptoEscrow platform. It contains the Solidity smart contracts, primarily `PropertyEscrow.sol`, developed and managed using the Hardhat environment. These contracts are deployed to an Ethereum-compatible blockchain (e.g., Sepolia for testing, or Ethereum Mainnet for production) to handle the secure escrow of funds and manage the state transitions of a deal.

**Frontend Relevance**: While the frontend does not interact *directly* with these smart contracts, their behavior and states dictate the flow of an escrow deal. The backend (`blockchainService.js`) acts as an intermediary, and the deal status displayed on the frontend (via Firestore updates) is a reflection of the smart contract's current state. Understanding the contract's lifecycle is crucial for the frontend to accurately represent deal progress and guide user actions.

## Key Components

-   **`contracts/`**:
    -   `PropertyEscrow.sol`: The core smart contract. It defines the rules, states, and functions for an individual escrow transaction. Each deal may have its own deployed instance of this contract.
-   **`scripts/`**:
    -   Contains Hardhat scripts, for example:
        -   `deploy.js` (or similar): Used to deploy the `PropertyEscrow.sol` contract to a specified network. The backend's `contractDeployer.js` service automates this process for new deals.
        -   Interaction scripts (optional): For ad-hoc testing or administrative tasks on deployed contracts.
-   **`test/`**:
    -   Unit and integration tests for `PropertyEscrow.sol`, written in JavaScript/TypeScript using libraries like Ethers.js, Chai, and Hardhat's testing utilities. These ensure the contract behaves as expected under various conditions.
-   **`hardhat.config.js`**:
    -   The main configuration file for the Hardhat environment. It specifies:
        -   Solidity compiler versions.
        -   Network configurations (e.g., RPC URLs and private keys for Sepolia, Mainnet, local development nodes like Hardhat Network).
        -   Paths for contracts, artifacts, cache.
        -   Potentially Etherscan API keys for contract verification.
-   **`artifacts/`**:
    -   **Crucial for Backend Interaction**: This directory, automatically generated during contract compilation (`npx hardhat compile`), stores:
        -   **JSON ABI (Application Binary Interface)** files: These describe the contract's functions and events, enabling the backend (and other tools) to understand how to interact with the deployed bytecode. `blockchainService.js` uses these ABIs.
        -   Bytecode: The compiled machine code of the smart contract that gets deployed to the blockchain.
-   **`cache/`**: Hardhat's internal cache files for faster recompilation.
-   **`ignition/`**: (If used) Modern Hardhat deployment system. If this directory is actively used, it contains modules defining deployment setups.

## Core Functionality of `PropertyEscrow.sol`

The `PropertyEscrow.sol` contract is designed to:

1.  **Receive and Hold Funds**: Securely hold the buyer's funds for the duration of the escrow period.
2.  **Manage Deal States**: Transition through a predefined set of states representing the deal's lifecycle. Key states include (names may vary slightly in the actual Solidity code):
    *   `AWAITING_DEPOSIT`: Initial state after deployment, waiting for the buyer to send funds.
    *   `AWAITING_FULFILLMENT` (or `FUNDS_DEPOSITED`): Buyer has deposited funds; now waiting for buyer to confirm off-chain conditions are met.
    *   `READY_FOR_FINAL_APPROVAL` (or `CONDITIONS_MET`): Buyer confirms all conditions met.
    *   `IN_FINAL_APPROVAL`: A time-locked period (e.g., 48 hours) starts. Buyer can raise a dispute. If no dispute, seller can claim funds after this period.
    *   `IN_DISPUTE`: Buyer has raised a dispute. A longer time-locked period (e.g., 7 days) starts for resolution.
    *   `COMPLETED`: Funds successfully released to the seller.
    *   `CANCELLED`: Escrow cancelled, funds returned to the buyer.
3.  **Enforce Deadlines**: Use block timestamps or block numbers to enforce time limits for states like `IN_FINAL_APPROVAL` and `IN_DISPUTE`.
4.  **Facilitate Party Interactions**: Define functions callable by the buyer, seller (and potentially an arbiter, if implemented) to:
    *   `depositFunds()` (by buyer)
    *   `confirmConditionsMet()` (by buyer, after depositing)
    *   `startFinalApprovalPeriod()` (by buyer or seller, once conditions are met)
    *   `raiseDispute()` (by buyer, during final approval)
    *   `resolveDisputeAndRefulfillConditions()` (by buyer, during dispute)
    *   `releaseFunds()` (by seller or automated by backend, after final approval period if no dispute)
    *   `cancelEscrowAndRefund()` (by buyer/seller mutually, or automated by backend after dispute period if unresolved)
5.  **Emit Events**: For significant actions (e.g., `FundsDeposited`, `DealCompleted`, `DisputeRaised`), the contract emits events. The backend can listen for these events to trigger off-chain logic, although the current implementation primarily relies on polling contract state and scheduled jobs.

## Development Workflow (for Contract Developers)

1.  **Write/Modify Contracts**: Edit `.sol` files in `contracts/`.
2.  **Compile**: Run `npx hardhat compile` from the `src/contract` directory. This generates/updates `artifacts/`.
3.  **Write/Run Tests**: Execute `npx hardhat test` to ensure contract integrity.
4.  **Deploy**: Use `npx hardhat run scripts/deploy.js --network <network_name>` (e.g., `sepolia`). The deployed contract address is then used by the backend.

## Backend Interaction & Frontend Implications

-   **Deployment**: When a new deal is created via the API (`POST /deals/create`), the `contractDeployer.js` service uses the contract's ABI and bytecode (from `artifacts/`) to deploy a new instance of `PropertyEscrow.sol`. The resulting contract address is stored in Firestore with the deal data.
    -   **Frontend**: The frontend initiates deal creation but doesn't see the deployment directly. It receives the `smartContractAddress` in the API response, which is a key piece of information for the deal.
-   **State Changes & Queries**:
    -   The `blockchainService.js` uses the contract's ABI and address to call functions (e.g., `triggerReleaseAfterApproval`, `getContractState`).
    -   The `scheduledJobs.js` service uses `blockchainService.js` to check deadlines and trigger automated state changes on the contract (e.g., releasing funds or cancelling the deal if a deadline passes).
    -   After on-chain actions, the backend updates the deal's status and timeline in its Firestore document.
    -   **Frontend**: The frontend **relies on Firestore real-time listeners** to observe these changes in the deal document (especially the `status` field, `timeline` events, and deadline fields). This is how the UI stays synchronized with on-chain events without needing to understand blockchain interactions directly. For example, when the backend's scheduled job releases funds, the contract's state changes, the backend updates Firestore, and the frontend's UI automatically reflects the deal as "Completed."

Understanding this flow is key for the frontend to accurately represent the deal's progress and explain to users why certain actions are available or why the deal state has changed.
