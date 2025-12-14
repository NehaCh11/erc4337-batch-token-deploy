import { expect } from "chai";
import { network } from "hardhat";

describe(
  "The batch deployment process testing for the BatchMinter contract",
  function () {
    it(
      "deploys three ERC20 tokens while assigning ownership to the caller",
      async function () {
        const { ethers } = await network.connect();

        // getting the deployer account
        const [deployer] = await ethers.getSigners();

        // DEPLOY BATCHMINTER CONTRACT
        const BatchMinter = await ethers.getContractFactory("BatchMinter");
        const batchMinter = await BatchMinter.deploy();
        await batchMinter.waitForDeployment();

        // defining the configurations of tokens
        const tokenConfigs = [
          {
            name: "TOKENalpha",
            symbol: "TKA",
            supply: 10000,
          },
          {
            name: "TOKENbeta",
            symbol: "TKB",
            supply: 20000,
          },
          {
            name: "TOKENgamma",
            symbol: "TKG",
            supply: 30000,
          },
        ];

        // calling the batch deploy function with these three configurations
        const tx = await batchMinter.deployBatch(tokenConfigs);
        const receipt = await tx.wait();

        // extracting the TokenDeployed events from the transaction logs using the contract interface
        const deployedEvents = receipt!.logs
          .map((log: any) => {
            try {
              return batchMinter.interface.parseLog(log);
            } catch (e) {
              return null;
            }
          })
          .filter((parsedLog: any) => parsedLog && parsedLog.name === "TokenDeployed");

        // we are expecting three tokens to be deployed
        expect(deployedEvents.length).to.equal(3);

        // for each deployed token, check that the deployer owns the full supply
        for (let i = 0; i < deployedEvents.length; i++) {
          const tokenAddress = deployedEvents[i].args[0]; // token is the first indexed argument

          const MinimalERC20 =
            await ethers.getContractFactory("minimalERC20");
          const token = MinimalERC20.attach(tokenAddress);

          const balance = await token.balanceOf(deployer.address);
          expect(balance).to.equal(tokenConfigs[i].supply);
        }
      }
    );
  }
);
