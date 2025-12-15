import {network} from "hardhat";

async function main(){
  const{ethers:hhEthers}=await network.connect();
  const[deployer]=await hhEthers.getSigners();
  
  // Get owner address from command line or use deployer
  const ownerAddress = process.argv[2] || deployer.address;
  
  console.log("Deploying Account with owner:", ownerAddress);
  
  // Deploy EntryPoint if not already deployed (you can skip this if you already have one)
  const EntryPoint=await hhEthers.getContractFactory("LocalEntryPoint");
  const entryPoint =await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddr=await entryPoint.getAddress();
  console.log("EntryPoint:", entryPointAddr);
  
  // Deploy Account with specified owner
  const Account =await hhEthers.getContractFactory("Account");
  const account=await Account.deploy(ownerAddress, entryPointAddr);
  await account.waitForDeployment();
  const accountAddr =await account.getAddress();
  console.log("Account:", accountAddr);
  
  // Deposit ETH for gas prefunding
  const depositValue=hhEthers.parseEther("1");
  const depTx=await entryPoint["depositTo"](accountAddr, {value:depositValue});
  await depTx.wait();
  console.log("Deposited 1 ETH to EntryPoint for account");
  
  // Deploy BatchMinter
  const BatchMinter = await hhEthers.getContractFactory("BatchMinter");
  const batchMinter = await BatchMinter.deploy();
  await batchMinter.waitForDeployment();
  const batchMinterAddr = await batchMinter.getAddress();
  console.log("BatchMinter:", batchMinterAddr);
  
  console.log("\n=== USE THESE ADDRESSES IN FRONTEND ===");
  console.log("EntryPoint:", entryPointAddr);
  console.log("Account:", accountAddr);
  console.log("BatchMinter:", batchMinterAddr);
  console.log("Account Owner (your MetaMask address):", ownerAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

