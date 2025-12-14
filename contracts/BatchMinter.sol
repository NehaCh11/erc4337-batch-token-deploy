// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


//What fdoes this code will do is that it will deploy several ERC20 tokens in a single call

// one of the design choice that i made is that the ownner is msg.sender as later on it will be the smart account through the entry point

// importing the the erc token we compiled to use its functionality for minting
import "./minimalERC20.sol";

//lets start with the contract

contract BatchMinter{

//this defines the data structure for one particular token including name symbol and supply
 struct TokenConfig{
  string name;
  string symbol;
  uint256 supply;
 }

//event decelartaion thsi means that the event is emitted each time a token will be deployed token willl be the address of the new erc30 token while owner will be one who received the initial supply and indexed will make it easier to flter logs
 
 event TokenDeployed(
  address indexed token,
  address indexed owner,
  string name,
  string symbol,
  uint256 supply
 );

 // this will be the batch deployment function what it does that it be called by an external account a smart account that i learnt while researching about this assignment and will take and arrat of token confgurations
 // it will use calldata for saveing the gas it will only be read only calldata by
 //it will return an array of addresses of the deployed tokens
function deployBatch(TokenConfig[] calldata configs)
external
returns (address[] memory tokens)
{
 // this number n will be used for looping to see how may tokens are to be deployed

 uint256 n=configs.length;
 // this will just be the basic validation ti preven that if tehre are no configuratons or if the lsgth is ess than 0 it will revert

 require(n>0, "no configs");


//in memort arra to store token address
 tokens=new address[](n);
//as everything will happen in one transaction, we can create a for loop that will do a deployment for each config
//deployment loop here we will creae a new object  of the minimalERC20 and message,sender  will be the one who called deploy batch function later we make it smar acocunt
for (uint256 i=0;i<n;i++){
 minimalERC20 token=new minimalERC20(
  configs[i].name,
  configs[i].symbol,
  configs[i].supply,
  msg.sender //this pertains to the smart account that will be during the ERC-4337 EXECUTION

 );
 //tokens will be stored   and returned
 tokens[i]=address(token);
 emit TokenDeployed(
  address(token),
  msg.sender,
  configs[i].name,
  configs[i].symbol,
  configs[i].supply
 );
}

 return tokens;
}

}
