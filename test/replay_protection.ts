import {expect} from "chai";
import {network} from "hardhat";
import {ethers} from "ethers";

function packUints(hi:bigint,lo:bigint):string{
 const packed=(hi<<128n)|lo;
 return ethers.toBeHex(packed,32);
}

describe("ERC-4337 Replay protection", function(){
 it("rejects re-using the same nonce which is the same userop replay", async function () 
 {
  const {ethers:hhEthers}=await network.connect();
  const [deployer]=await hhEthers.getSigners();

  const EntryPoint=await hhEthers.getContractFactory("LocalEntryPoint");
  const entryPoint=await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddr =await entryPoint.getAddress();

  // next we will deploy the batchminter
  const BatchMinter =await hhEthers.getContractFactory("BatchMinter");
  const batchMinter=await BatchMinter.deploy();
  await batchMinter.waitForDeployment();
  const batchMinterAddr= await batchMinter.getAddress();

  //deploying the account
  const Account=await hhEthers.getContractFactory("Account");
  const account=await Account.deploy(deployer.address,entryPointAddr);
  await account.waitForDeployment();
  const accountAddr=await account.getAddress();

  //deposit prefund
  await entryPoint["depositTo"](accountAddr,{value:hhEthers.parseEther("1")});

  //building the calldata, account.execute -> batchMinter.deploybatch
  const tokenConfigs=[{name:"A",symbol:"A", supply:1}];
  const batchCallData=batchMinter.interface.encodeFunctionData("deployBatch",[tokenConfigs]);
  const executeCallData=account.interface.encodeFunctionData("execute",[batchMinterAddr,0, batchCallData]);

  //we can get nonce from the entrypoint
  const key=0n;
  const nonce:bigint=await entryPoint.getNonce(accountAddr,key);

  // gas fields
  const callGasLimit=1_500_000n;
  const verificationGasLimit=800_000n;
  const preVerificationGas=80_000n;
  const maxPriorityFeePerGas=1_000_000_000n;
  const maxFeePerGas=2_000_000_000n;

  //userop(signature added after)
  const userOp:any={
   sender:accountAddr,
   nonce,
   initCode:"0x",
   callData:executeCallData,
   accountGasLimits:packUints(verificationGasLimit,callGasLimit),
   preVerificationGas,
   gasFees:packUints(maxPriorityFeePerGas, maxFeePerGas),
   paymasterAndData:"0x",
   signature:"0x",
  };

  //signing the typed data (EIP-712)
  const chainId=(await hhEthers.provider.getNetwork()).chainId;
  const domain={name:"ERC4337", version:"1", chainId, verifyingContract:entryPointAddr};
  const types={
   PackedUserOperation:[
    {name:"sender",type:"address"},
    {name:"nonce",type:"uint256"},
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "paymasterAndData", type: "bytes" },
   ],
  };
  const message = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: userOp.preVerificationGas,
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
  };

  userOp.signature = await deployer.signTypedData(domain, types, message);

  // First execution should pass
  await (await entryPoint.handleOps([userOp], deployer.address)).wait();

  // Second execution with SAME nonce/userOp should fail
  await expect(entryPoint.handleOps([userOp], deployer.address)).to.be.revertedWithCustomError(entryPoint, "FailedOp");
 });

});
