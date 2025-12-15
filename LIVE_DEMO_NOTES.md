Live Demo Notes

Setup
npm install
npx hardhat compile

Main Demo - ERC-4337 Test

Run this:
npm test -- test/erc4337_batch_deploy.ts

What to show:
- The onchain PACKED_USEROP_TYPEHASH and domainSeparator lines - this proves we're using EIP-712
- Nonce goes from 0 to 1 - EntryPoint handles this
- 3 tokens get deployed in one transaction

What to say:
- We're signing with EIP-712, not EIP-191. You can see the typehash here...
- EntryPoint manages the nonce, so we don't need to track it in our contract
- All 3 tokens deploy atomically - either all succeed or all fail

Manual Script Demo

Run this:
npx hardhat run scripts/sendUserOp.ts

What to show:
- The full UserOperation JSON - shows what we're signing
- The signature - 65 bytes, EIP-712 format
- Transaction hash at the end

What to say:
- This shows how we manually build a UserOperation
- The signature covers the entire UserOperation structure
- EntryPoint verifies the signature and executes the call

Basic Test (Optional)

Run this:
npm test -- test/batchDeploy.test.ts

What to say:
- This is the old way - direct contract call, no account abstraction
- Compare this to the ERC-4337 version - same result, different approach

Quick Commands

Run all tests:
npm test

Run specific test:
npm test -- test/erc4337_batch_deploy.ts

Run script:
npx hardhat run scripts/sendUserOp.ts

Clean and recompile:
npx hardhat clean
npx hardhat compile

Key Points

1. EIP-712 signing - Show the typehash output, explain it's structured data signing
2. Account Abstraction - Smart account can hold assets, EntryPoint handles execution
3. Batch deployment - One transaction, one signature, multiple tokens
4. Nonce management - EntryPoint tracks it, prevents replay attacks
5. Gas prefunding - Account deposits ETH to EntryPoint for gas

If Something Breaks

- Run npx hardhat clean && npx hardhat compile
- Make sure you're using Hardhat 3.x
- Check Node version is 18+

Demo Flow

1. Start with ERC-4337 test (main demo) - about 3-5 minutes
2. Show the script output (optional) - about 2 minutes
3. Answer questions

Total: about 10 minutes
