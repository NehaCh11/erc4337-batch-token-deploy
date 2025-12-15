# Batch Token Deploy with ERC-4337

This project lets you deploy multiple ERC-20 tokens in one transaction using ERC-4337 account abstraction.

## What it does

You can deploy multiple tokens at once through a smart account. Uses ERC-4337 UserOperations and EIP-712 signing.

## Setup

First install dependencies:
```
npm install
```

Then compile contracts:
```
npx hardhat compile
```

## Running tests

Run all tests:
```
npm test
```

Run specific test:
```
npm test -- test/erc4337_batch_deploy.ts
```

## Running the script

To manually send a UserOperation:
```
npx hardhat run scripts/sendUserOp.ts
```

This will deploy EntryPoint, Account, and BatchMinter, then send a UserOperation to deploy 3 tokens.

## Frontend

There's a basic frontend in the frontend folder. To run it:
```
cd frontend
npm install
npm run dev
```

Then open the app in your browser. You'll need to:
1. Enter contract addresses (Account, EntryPoint, BatchMinter)
2. Add tokens (name, symbol, supply)
3. Click "Build and Send UserOp"
4. Sign with MetaMask

## Contracts

- Account.sol - Minimal smart account contract
- BatchMinter.sol - Deploys multiple ERC-20 tokens
- LocalEntryPoint.sol - EntryPoint wrapper for testing
- minimalERC20.sol - Simple ERC-20 token

## How it works

1. Build token configs (name, symbol, supply)
2. Encode BatchMinter.deployBatch call
3. Wrap in Account.execute
4. Build UserOperation
5. Sign with EIP-712
6. Send to EntryPoint.handleOps
7. EntryPoint verifies and executes
8. Tokens get deployed

## Notes

- Uses EIP-712 signing (not EIP-191)
- EntryPoint manages nonces for replay protection
- Account needs ETH deposited to EntryPoint for gas
- Works on Hardhat local network

## Requirements

- Node.js 18+
- Hardhat 3.x
- MetaMask (for frontend)

