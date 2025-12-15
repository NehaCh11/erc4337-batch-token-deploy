The first thing was to create the Github Repository where i set up all the tools that i needed

After that i added basic files such as readme, changelog where i am writing right now and .gitignonore 

Understood and integrated the erc-4337 entrypoint
initially i tried copying entrypoin.sol which gave me compilation erros and then i correctly switched to

npm i @account-abstraction/contracts

which compiled the official ep contract, learnt that it is not a bundler and it uses packedUserperation and the entrypoint uses EIP-712 whose domain is name: erc4337 and the version is 1

After that I moved onto writing my simple erc20 token did not use open zeppelin 
I implemneted
name symbol decimals
total supply
balance of 
allowance 
transfer/ approve and transferfrom 
constructor will mint the supply to a provided ownner
-> the token compiled successfully

Next I will add the Batch Minter Code, a batch minter code as assigned in the assignment description accepts arrays of token configs and deploys many tokens atomically. so probaly we will have to write a contract  that executes above functiosn

batch minter accepted the token configuratuon deploys using a for loop where it assigns the initital suuply to the caller which wull be the future smart account


After this, I proceeded on writing the test that can see if the batch logic works or not  the goal of the test will be to call the BatchMinter,deployBatch and deplit 3 tokens, after that we wil veriy if token addresses are retuener and initial suply is minted to caller or not
so adding this file test/Batchdeploy.test.ts  that will test the basic batch deployment functionality andd eploy the batchminter contract

it basically Verifies:
  - Correct number of tokens deployed (event count)
  - Each token's ownership assigned correctly
  - Initial supply minted to deployer
- Uses contract interface to parse token deployed events from logs

the test passed and the next thing this we wrote was the account.sol which will act as the minimal smaert contract
this wull be the minimal erc4337 compatible smart contract account for the EP
It implemenbst IAccount and use state  variables that are owner, eo and functions that will be validateuserop and execute and verifies EIP-712 signature againts the userOphash  

next step was to test the flow so we wrote the test erc4337_batch_deploy.ts which tested the entire flow with 
manual user operation construction it manually uild the packeduser operation struct, pack gas limits into bytes32, manually comute the call data by encoding account.execute. uses the signtypedata() with ep domain and use epi signing there is an integration for ep as it first deploys EntryPoint, BatchMinter, and Account contracts,
deposits nonce from ep nonce manager and call handleops without  abundler

It gave successful test reults

next i will write sendUserOp.ts that will deploy the ep, account, batch , minter build packed user op manually and then print the seropjson, signarure biters and the userop hasg it will also call the handle ipa nd the rpint the deployed token address form the events 
the user operation script will give the output of useroperation json
raw signature butes and the userophaahs i successfully demonstrated the end to end batch deployment 

next thing i added was replay protection and the gas comparison,

replay protection test was added to verify that resusing the same useroperation nonce fails

then i added a gas comparison test which compared deployed tokens individually vs the batched deploymnet it also demonstrated the gas efficiency of the batching

Finally, the assignment was completed and we had a manual erc4337 flow that had the batched erc-20 deploymnet with smart account execution, replay protection.

lastly, i added the frontend
