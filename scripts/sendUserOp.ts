import {network} from "hardhat";
import {ethers} from "ethers";
import { Signature } from "ethers";


//packeduser operation will pack 2 uint128 values into the bytes32 for 
//the accountgaslimits which wll be he verification gas limit and the call gas llimit

function packUints(hi:bigint, lo:bigint):string{
 const packed=(hi<<128n)| lo;
 return ethers.toBeHex(packed,32);
}

async function main(){
 const{ethers:hhEthers}=await network.connect();
 const[deployer]=await hhEthers.getSigners();
 console.log("deployer:", deployer.address);

 //this will be the deploy entry pont which will be the wrapper that inherits the real entrypoint

 const EntryPoint=await hhEthers.getContractFactory("LocalEntryPoint");
 const entryPoint =await EntryPoint.deploy();
 await entryPoint.waitForDeployment();
 const entryPointAddr=await entryPoint.getAddress();
 console.log("EntryPoint ", entryPointAddr);

 //next deploy the account which will be the owner=deployer and  the entrypoint will be equal to entry point
 const Account =await hhEthers.getContractFactory("Account");
 const account=await Account.deploy(deployer.address,entryPointAddr);
 await account.waitForDeployment();
 const accountAddr =await account.getAddress();
 console.log("Account:", accountAddr);

 //deposit into the ep for the prefunding 

 //ep will charge the fees from the deposits which will be the stakemanagerbalance of 
 //so we will deposit to the account inside the ep  not just send eth into the accounnt

 const depositValue=hhEthers.parseEther("1");
 const depTx=await entryPoint["depositTo"](accountAddr, {value:depositValue});
 await depTx.wait();
 console.log("Deposited to EP for the account:",depositValue.toString());

 //next deploy the batch minter contract
 const BatchMinter = await hhEthers.getContractFactory("BatchMinter");
 const batchMinter = await BatchMinter.deploy();
 await batchMinter.waitForDeployment();
 const batchMinterAddr = await batchMinter.getAddress();
 console.log("BatchMinter:", batchMinterAddr);

 //next we will make the batch token configurations
 const tokenConfigs= [
    { name: "TOKENalpha", symbol: "TKA", supply: 10000 },
    { name: "TOKENbeta", symbol: "TKB", supply: 20000 },
    { name: "TOKENgamma", symbol: "TKG", supply: 30000 },
  ];

  //calldata for batchminter.deploybatch(configs)
  const batchCallData=batchMinter.interface.encodeFunctionData("deployBatch",[
   tokenConfigs,
  ]);

  //calldata for account.ececute(batchminter,0, batchcalldata)
  const executeCallData=account.interface.encodeFunctionData("execute",[
   batchMinterAddr,
   0,
   batchCallData,
  ]);

  //next we will see if the noonce comes from ep noncemanager
  const key=0n;
  const startNonce:bigint=await entryPoint.getNonce(accountAddr,key);
  console.log("startNonce",startNonce.toString());

  // manually choosing the gas fields
  const callGasLimit = 2_000_000n;
  const verificationGasLimit = 1_000_000n;
  const preVerificationGas = 80_000n;

  const maxPriorityFeePerGas = 1_000_000_000n; // 1 gwei
  const maxFeePerGas = 2_000_000_000n;         // 2 gwei

  // next step will be to build the pakckeduser operation manually signature will be empty first
  const userOp:any={
   sender:accountAddr,
   nonce: startNonce,
   initCode:"0x",
   callData:executeCallData,
   accountGasLimits:packUints(verificationGasLimit, callGasLimit),
   preVerificationGas,
   gasFees:packUints(maxPriorityFeePerGas,maxFeePerGas),
   paymasterAndData:"0x",
   signature:"0x"
  };

  //building the eip-712 domain and types fo the packed user oepration

  //ep constructor will set eip 712
  //here the domain must match the ep view of the chainId and the verifying contract
  const chainId=(await hhEthers.provider.getNetwork()).chainId;

 const domain = {
    name: "ERC4337",
    version: "1",
    chainId: chainId,
    verifyingContract: entryPointAddr,
  };

  // this type def must match ep packeduser type 
  //bytes fields are hashed per tEIP 712 rules, which matches ep internal hashing
  const types={
   PackedUserOperation:[
    {name:"sender", type:"address"},
    {name:"nonce", type:"uint256"},
    {name:"initCode", type:"bytes"},
    {name:"callData", type:"bytes"},
    {name: "accountGasLimits", type:"bytes32"},
    {name:"preVerificationGas",type:"uint256"},
    {name:"gasFees",type:"bytes32"},
    {name:"paymasterAndData", type:"bytes"},

   ],
  };
  // this wull be helpful for the onchain alignment checs 
  const onchainTypeHash = await entryPoint.getPackedUserOpTypeHash();
  const onchainDomainSep = await entryPoint.getDomainSeparatorV4();
  console.log("onchain PACKED_USEROP_TYPEHASH:", onchainTypeHash);
  console.log("onchain domainSeparator:", onchainDomainSep);

  //next we will compute the userophash  eip712 and sign with the signtypeddata 
    const userOpHashBeforeSig = await entryPoint.getUserOpHash(userOp);
  console.log("userOpHash (before sig):", userOpHashBeforeSig);

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

  console.log("signature:", signature);
  //print the full userop json
  const userOpForJson = {
    ...userOp,
    nonce: userOp.nonce.toString(),
    preVerificationGas: userOp.preVerificationGas.toString(),
  };
  console.log("Full useroperation will be",JSON.stringify(userOpForJson,null,2));

  //next we will send directly to the entrypoint.hanleops
  const beneficiary=deployer.address;
  const tx=await entryPoint.handleOps([userOp],beneficiary);
  console.log("handleOps tx:",tx.hash);

  const receipt=await tx.wait();
  console.log("handleOps mined in the block", receipt!.blockNumber);

  //parse the token deployed events to show the token address 

  const logs=receipt!.logs;
  const deployedEvents=logs
  .map((log:any)=>{
   try{
    return batchMinter.interface.parseLog(log);
   }
   catch{
    return null;
   }
  })
  .filter((x:any)=>x&& x.name==="TokenDeployed");

  console.log("The deployed tokens are:");

  for(let i=0; i<deployedEvents.length;i++){
   const tokenAddr=deployedEvents[i].args[0];
   const ownerAddr=deployedEvents[i].args[1];
   const name=deployedEvents[i].args[2];
   const symbol=deployedEvents[i].args[3];
   const supply=deployedEvents[i].args[4];

   console.log(
      `  #${i + 1}: ${tokenAddr}  owner=${ownerAddr}  ${name}(${symbol}) supply=${supply.toString()}`
    );
  }
  //finally we will she if nonce has chnaged replay protection

  const endNonce:bigint=await entryPoint.getNonce(accountAddr,key);
  console.log("endNonce:",endNonce.toString());

  if (endNonce !== startNonce + 1n) {
    throw new Error("Nonce did not increment as expected");
  }
console.log("Done: batch deployed via manual ERC-4337 UserOperation");

 }
 main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});




 
 
