import {expect} from "chai";
import {network} from "hardhat";
import {ethers} from "ethers";

//in the packeduseroperation used by ep script, accountgaslimits and gas fees can be stored as a single bytes32

//it is literally two uint123 values packed in one 32 byte slot hi will be first 16, lo and last 16

function packUints(hi:bigint,lo:bigint):string{
 const packed =(hi<<128n) | lo;
 return ethers.toBeHex(packed,32);
}

describe("ERC-4337 batch deployment through entrypoint", function(){
 it("deploying 3 tokens through handleops and miniyting to the smart contract wallet",async function(){
  // hardhar vs will usse ntework.connect() in the setup
  const {ethers:hhEthers}=await network.connect();
  //deployer will be our E0A, this EOA will sign the userOperaion which will be the owner of the account
  const[deployer]=await hhEthers.getSigners();

  //step 1: will be to deploy the entry point
  // this will be the core ERC-4337 CONTACT THAT verifies and executes the user operations
  const EntryPoint =await hhEthers.getContractFactory("LocalEntryPoint");
  const entryPoint =await EntryPoint.deploy();
  await entryPoint.waitForDeployment();

  //the next step will be to deploy the batch minter, this contract will deploy multiple erc20 tokens in one call
  const BatchMinter =await hhEthers.getContractFactory("BatchMinter");
  const batchMinter =await BatchMinter.deploy();
  await batchMinter.waitForDeployment();
  // step 3 will be deploying the account whicch will be our minimal smart account that stores owner eoa, only ep can call the validate and execute

  const Account =await hhEthers.getContractFactory("Account");
  const account=await Account.deploy(
   deployer.address,
   await entryPoint.getAddress()
  );
  await account.waitForDeployment();
  const accountAddr=await account.getAddress();
  //entrypoint uses deposits balance of isndie the entrypont for the prefunding so we should deposit into the ep for the account
  await entryPoint.depositTo(accountAddr,{
   value:ethers.parseEther("1"),
  });
  //nex step os to build the token configs for the batch minter which wull be input to batcgminter.deploybatcg
  const tokenConfigs=[
      { name: "TOKENalpha", symbol: "TKA", supply: 10000 },
      { name: "TOKENbeta", symbol: "TKB", supply: 20000 },
      { name: "TOKENgamma", symbol: "TKG", supply: 30000 },
    ];
    //next step will be to encode the inner call which will be the call data that will be executed by the account
    const batchCallData = batchMinter.interface.encodeFunctionData(
     "deployBatch",
     [tokenConfigs]);
    // this will be wrapped around account.execute as ep cant call batch minter as account
    //ep will call execute which will call the deploybatch function in the batch iinter
    // in that calll msg.sender un batch mindter will become the smart account(ownership assignment
    const  executeCallData=account.interface.encodeFunctionData(
     "execute",[
      await batchMinter.getAddress(),
      0,
      batchCallData
     ]
    );

    //entry pointnince manager wwill evacuate a nonce ep has a built in nonce manager for each account
    //replay protection nonce will be tracked inside the ep, not the account
    const key=0n;
    const startNonce:bigint =await entryPoint.getNonce(accountAddr,key);
    
    //step 8 will be to choose the gas manually
    //safe starting point for testing
    const callGasLimit = 2_000_000n;          // gas for execution (Account.execute -> BatchMinter)
    const verificationGasLimit = 1_000_000n;  // gas for validateUserOp + checks
    const preVerificationGas = 80_000n;       // calldata / overhead estimate

    const maxPriorityFeePerGas = 1_000_000_000n; // 1 gwei
    const maxFeePerGas = 2_000_000_000n;         // 2 gwei

    // next we will build the packeduseroepration manually whcuh will match the ep struct 
    // at this point the signature will be empty since we will need the suerop firts 
    const userOp: any = {
      sender: accountAddr,
      nonce: startNonce,
      initCode: "0x", // account already deployed, so no initCode here
      callData: executeCallData,
      accountGasLimits: packUints(verificationGasLimit, callGasLimit),
      preVerificationGas,
      gasFees: packUints(maxPriorityFeePerGas, maxFeePerGas),
      paymasterAndData: "0x",
      signature: "0x",
    };
    // EIP-712 signing: EntryPoint uses EIP-712 with domain separator
    // Domain: name="ERC4337", version="1", chainId, verifyingContract=entryPoint address
    const chainId = await hhEthers.provider.getNetwork().then(n => n.chainId);
    const entryPointAddr = await entryPoint.getAddress();
    
    // Verify on-chain typehash and domain separator match our off-chain computation
    // This proves our EIP-712 types match EntryPoint's implementation
    const onchainTypeHash = await entryPoint.getPackedUserOpTypeHash();
    console.log("On-chain PACKED_USEROP_TYPEHASH:", onchainTypeHash);
    
    const onchainDomainSep = await entryPoint.getDomainSeparatorV4();
    console.log("On-chain domainSeparator:", onchainDomainSep);
    
    const domain = {
      name: "ERC4337",
      version: "1",
      chainId: chainId,
      verifyingContract: entryPointAddr,
    };
    
    // PackedUserOperation type hash as defined in EntryPoint
    const types = {
      PackedUserOperation: [
        { name: "sender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "initCode", type: "bytes" },
        { name: "callData", type: "bytes" },
        { name: "accountGasLimits", type: "bytes32" },
        { name: "preVerificationGas", type: "uint256" },
        { name: "gasFees", type: "bytes32" },
        { name: "paymasterAndData", type: "bytes" },
      ]
    };
    
    // Sign the UserOperation struct using EIP-712 signTypedData
    // This will compute the same hash as EntryPoint.getUserOpHash()
    const signature = await deployer.signTypedData(domain, types, {
      sender: userOp.sender,
      nonce: userOp.nonce,
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: userOp.preVerificationGas,
      gasFees: userOp.gasFees,
      paymasterAndData: userOp.paymasterAndData,
    });
    userOp.signature = signature;
    
    // Verify EntryPoint computes the same EIP-712 hash we signed
    // This confirms our signTypedData() matches EntryPoint's getUserOpHash()
    const userOpHash = await entryPoint.getUserOpHash(userOp);
    console.log("UserOpHash from EntryPoint:", userOpHash);
    
    // Account.validateUserOp() will verify this signature using _recover(userOpHash, signature)
    // This uses raw hash (no EIP-191 prefix), matching our EIP-712 signTypedData() signature

    // send the oepration directly to the entrypoint.handleops
    //beneficiary will where the fees will go for this test we can set it to deployer
    const tx = await entryPoint.handleOps([userOp], deployer.address);
    const receipt = await tx.wait();

    // next step will be reading the results from the token deployed events 
    //pasrsing the logs and counting
    const deployedEvents = receipt!.logs
      .map((log: any) => {
        try {
          return batchMinter.interface.parseLog(log); 
        } catch (e) {
          return null;
        }  
      })
      .filter((x: any) => x && x.name === "TokenDeployed");
    expect(deployedEvents.length).to.equal(3);

    //last step will be to verify the ownership and minting went to the smart account
    const MinimalERC20 =await hhEthers.getContractFactory("minimalERC20");
    for (let i = 0; i < deployedEvents.length; i++) {
      const tokenAddress = deployedEvents[i].args[0]; // token is the first indexed argument 
      const token = MinimalERC20.attach(tokenAddress);
      const bal = await token.balanceOf(accountAddr);
      expect(bal).to.equal(tokenConfigs[i].supply);
    }
//last step will be to verify if replay protectton changed the nonce or not 
// If you try to reuse the same userOp again, it should fail because nonce changed.
    const endNonce: bigint = await entryPoint.getNonce(accountAddr, key);
    expect(endNonce).to.equal(startNonce + 1n);
  }

  );
});