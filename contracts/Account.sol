// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

//minunak ERC-4337 account

// this is the account where the entry point will call
//it can verify the signaures and nonce (replay protection) and then execute calls
//entrypount will call the validateuserop and the afeter valodate has been compleed it will call execute(0 to run the action

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract Account is IAccount {
 address public owner;
 IEntryPoint public immutable entryPoint;

 //This is going to be a simple replay protection

 uint256 public nonce;

 constructor(address _owner, IEntryPoint _entryPoint) {
    owner = _owner;
    entryPoint = _entryPoint;
 }

 modifier onlyEntryPoint() {
    require(msg.sender == address(entryPoint), "not entry point");
    _;
 }

 //in the current aa contracts, the validateuserop takes packeduser oepration so the userophash will be signed offchain (typed data hashing will be handled by ep)

function validateUserOp(
 PackedUserOperation calldata userOp,
 bytes32 userOpHash,
 uint256 missingAccountFunds
)
external
override
onlyEntryPoint
returns (uint256 validationData)
{
 // Replay protection: EntryPoint already validates nonce before calling validateUserOp
 // EntryPoint maintains nonce per account and ensures nonce is valid and increments it
 // So we can trust that if validateUserOp is called, the nonce is already validated by EntryPoint
 
 //signature check
 //since asssignment wants the EIP-712 style signature, we should be using userophash
 //we will beusing signTypeddata
 // EIP-712: userOpHash is already the EIP-712 hash, so we verify signature directly
 address recovered = _recover(userOpHash, userOp.signature);
 require(recovered == owner, "invalid signature");

 //prefund if entrupoint is going to ask for it 
 if (missingAccountFunds >0){
 (bool ok,)=payable(msg.sender).call{value: missingAccountFunds}("");
 require(ok, "prefund failed");
 }
 //0means that useroperation si valid and no time range restirctions
 return 0;
}
//entry point will call the execute function after the validation to peform the actual action
function execute(address target, uint256 value, bytes calldata data) 
external
onlyEntryPoint
{
 (bool ok, ) = target.call{value: value}(data);
 require(ok, "execution/call failed");
}

//minimal ecerecover function
function _recover(bytes32 digest,bytes calldata sig) internal pure returns (address){
 require(sig.length==65,"invalid signature length");
 bytes32 r;
 bytes32 s;
 uint8 v;
 assembly {
    r := calldataload(sig.offset)
    s := calldataload(add(sig.offset,32))
    v := byte(0, calldataload(add(sig.offset,64)))
 }
 if (v < 27)v+=27;
 require(v==27|| v==28, "bad v");
 address recovered =ecrecover(digest, v, r, s);
 require(recovered !=address(0), "ecrecover failed");
 return recovered;
}
receive() external payable {}
}


