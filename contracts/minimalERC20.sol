// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

//first we will create a simple ERC20 token contract

contract minimalERC20{
 //initializing what will be the total supply of the token and defining the name symbol and the constant decimals
 // this is the token metadata which will be usually public variavles
 string public symbol;
 string public name;

 //decimals will be usually 18 for the ERC20 tokens
 uint8 public constant decimals = 18;

 //defining the total supply the ERC20 token will have
 uint256 public totalSupply;
 //mapping to keep the track of balance each address hold
 mapping(address=>uint256) public balanceOf;
 // add the mapping to keep the track of allowance
 mapping(address=>mapping(address=>uint256)) public allowance;

 //for logging the transfer event and showung on the frontend as the ERC 20 wallets will be rluing on these events
 // using indexed will make the fields searchable in the logs
 event Transfer(address indexed from, address indexed to, uint256 value);
 event Approval(address indexed owner, address indexed spender, uint256 value);

 // adding the ocnluctructor that will runat the time of deploymnet as the smart account
 //address will be added as the owner of the account the smart account w
 constructor(
    string memory _name,
    string memory _symbol,
    uint256 _supply,
    address owner
 ){
  //here we will set the metadata and the supply variavble which will save them on chain
   name=_name;
    symbol=_symbol;
    totalSupply=_supply;
    //this will mint the initial supply to the owner where the ownner balance will be set to full supply 
    // here we are emitting the transfer event from address 0 to show that tokens are minted
    balanceOf[owner]=_supply;
    emit Transfer(address(0),owner,_supply);
 }
// this function is of transfer which is a basic send  which can transfer the tokes  it takes the parameters of address and  the value of tokens to be sent 
function transfer(address to, uint256 value) external returns (bool){
 //it checks the balance basic validation if the balance is insffiience it returns that balcne is low
 require(balanceOf[msg.sender]>=value,"Balance is low");
 // if there is siginificant balance the balance will be reduced from the sender and then will be added  to the reciever
 balanceOf[msg.sender]-=value;
 balanceOf[to]+=value;
 // this is an emit event and return si what it does is that event for the wallets or explorers and will return tru
 emit Transfer(msg.sender,to,value);
 return true;
}

// next function we write will be the approve that will actually approve the spemding  it will take the parasmetrs of address of the spender and the value of tokens and rtyren a boolean

function approve(address spender, uint256 value) external returns (bool){
 // here the eallowance mapping is updated to set the value for the spenders spender can call trasnfer from upt to thsi ammount
 allowance[msg.sender][spender]=value;
 emit Approval(msg.sender,spender,value);
 return true;
}
//next we wiill write the function of transfer from that take the address from which the tokens will be sent the address to which the tokens will be sent and the value of tokens to be sent
function transferFrom(address from, address to, uint256 value) external returns (bool){
 // again the validation to check the validation of balance and allowance 
 require(balanceOf[from]>=value,"Balance is low");
 require(allowance[from][msg.sender]>=value,"Allowance is low");
 // the allowance will be deuduced and the tokens will be moved
 allowance[from][msg.sender]-=value;
 balanceOf[from]-=value;
 balanceOf[to]+=value;
 emit Transfer(from,to,value);
 return true;
}

}