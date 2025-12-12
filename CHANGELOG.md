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

