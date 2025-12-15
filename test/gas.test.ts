import {expect} from "chai";
import {network} from "hardhat";
import {ethers} from "ethers";

//helper function to pack uints for packed userop
//basically just packing two uint128s into one bytes32
function packUints(hi:bigint,lo:bigint):string{
 const packed=(hi<<128n)|lo;
 return ethers.toBeHex(packed,32);
}

describe("Gas comparison between direct deploy and erc4337", function(){
 it("compares gas costs for batch deployment", async function(){
  const {ethers:hhEthers}=await network.connect();
  const [deployer]=await hhEthers.getSigners();

  //first lets do the direct deployment way
  //this is the old school way without account abstraction
  //just calling batchminter directly
  const BatchMinter =await hhEthers.getContractFactory("BatchMinter");
  const batchMinter=await BatchMinter.deploy();
  await batchMinter.waitForDeployment();

  const tokenConfigs=[
   {name:"TOKENalpha", symbol:"TKA", supply:10000},
   {name:"TOKENbeta", symbol:"TKB", supply:20000},
   {name:"TOKENgamma", symbol:"TKG", supply:30000},
  ];

  //deploy directly using batchminter
  //no entrypoint overhead here
  const directTx=await batchMinter.deployBatch(tokenConfigs);
  const directReceipt=await directTx.wait();
  const directGasUsed=directReceipt!.gasUsed;

  console.log("Direct deployment gas used:", directGasUsed.toString());

  //now lets do the erc4337 way
  //need to deploy entrypoint and account first
  //this adds overhead but gives us account abstraction
  const EntryPoint=await hhEthers.getContractFactory("LocalEntryPoint");
  const entryPoint=await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddr=await entryPoint.getAddress();

  //deploy the account contract
  //this is our smart account
  const Account=await hhEthers.getContractFactory("Account");
  const account=await Account.deploy(deployer.address,entryPointAddr);
  await account.waitForDeployment();
  const accountAddr=await account.getAddress();

  //deposit some eth for gas prefunding
  //ep needs this to pay for gas
  await entryPoint["depositTo"](accountAddr,{value:hhEthers.parseEther("1")});

  //build the calldata same as before
  //but now we wrap it in account.execute
  const batchCallData=batchMinter.interface.encodeFunctionData("deployBatch",[tokenConfigs]);
  const executeCallData=account.interface.encodeFunctionData("execute",[
   await batchMinter.getAddress(),
   0,
   batchCallData
  ]);

  //get nonce from ep
  //ep manages nonces for replay protection
  const key=0n;
  const nonce:bigint=await entryPoint.getNonce(accountAddr,key);

  //gas fields for userop
  //these are the gas limits we set manually
  const callGasLimit=2_000_000n;
  const verificationGasLimit=1_000_000n;
  const preVerificationGas=80_000n;
  const maxPriorityFeePerGas=1_000_000_000n;
  const maxFeePerGas=2_000_000_000n;

  //build userop
  //signature will be empty first, add it after signing
  const userOp:any={
   sender:accountAddr,
   nonce,
   initCode:"0x",
   callData:executeCallData,
   accountGasLimits:packUints(verificationGasLimit,callGasLimit),
   preVerificationGas,
   gasFees:packUints(maxPriorityFeePerGas,maxFeePerGas),
   paymasterAndData:"0x",
   signature:"0x",
  };

  //sign with eip712
  //this is what makes it secure, structured data signing
  const chainId=(await hhEthers.provider.getNetwork()).chainId;
  const domain={name:"ERC4337", version:"1", chainId, verifyingContract:entryPointAddr};
  const types={
   PackedUserOperation:[
    {name:"sender",type:"address"},
    {name:"nonce",type:"uint256"},
    {name:"initCode",type:"bytes"},
    {name:"callData",type:"bytes"},
    {name:"accountGasLimits",type:"bytes32"},
    {name:"preVerificationGas",type:"uint256"},
    {name:"gasFees",type:"bytes32"},
    {name:"paymasterAndData",type:"bytes"},
   ],
  };

  const signature=await deployer.signTypedData(domain,types,{
   sender:userOp.sender,
   nonce:userOp.nonce,
   initCode:userOp.initCode,
   callData:userOp.callData,
   accountGasLimits:userOp.accountGasLimits,
   preVerificationGas:userOp.preVerificationGas,
   gasFees:userOp.gasFees,
   paymasterAndData:userOp.paymasterAndData,
  });
  userOp.signature=signature;

  //execute through entrypoint
  //this is where the magic happens
  const erc4337Tx=await entryPoint.handleOps([userOp],deployer.address);
  const erc4337Receipt=await erc4337Tx.wait();
  const erc4337GasUsed=erc4337Receipt!.gasUsed;

  console.log("ERC-4337 deployment gas used:", erc4337GasUsed.toString());

  //compare the gas costs
  //erc4337 will be more expensive because of the overhead from entrypoint validation
  //but we get account abstraction benefits so its worth it
  const gasDifference=erc4337GasUsed-directGasUsed;
  console.log("Gas difference (ERC4337 - Direct):", gasDifference.toString());
  console.log("ERC4337 is", ((Number(gasDifference)*100/Number(directGasUsed))).toFixed(2), "% more expensive");

  //both should have deployed 3 tokens
  //lets verify this
  const directEvents=directReceipt!.logs
   .map((log:any)=>{
    try{
     return batchMinter.interface.parseLog(log);
    }catch{
     return null;
    }
   })
   .filter((x:any)=>x&&x.name==="TokenDeployed");

  const erc4337Events=erc4337Receipt!.logs
   .map((log:any)=>{
    try{
     return batchMinter.interface.parseLog(log);
    }catch{
     return null;
    }
   })
   .filter((x:any)=>x&&x.name==="TokenDeployed");

  expect(directEvents.length).to.equal(3);
  expect(erc4337Events.length).to.equal(3);

  //verify that erc4337 uses more gas
  //this is expected because of entrypoint overhead
  //but the benefits of account abstraction make it worth it
  expect(erc4337GasUsed).to.be.greaterThan(directGasUsed);
 });

});

