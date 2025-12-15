import { useState } from 'react'
import { ethers } from 'ethers'
import './App.css'

//helper to pack uints for userop
//basically just packing two uint128s into one bytes32
function packUints(hi, lo) {
  const packed = (BigInt(hi) << 128n) | BigInt(lo)
  return ethers.toBeHex(packed, 32)
}

function App() {
  const [tokens, setTokens] = useState([])
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [supply, setSupply] = useState('')
  const [accountAddr, setAccountAddr] = useState('')
  const [entryPointAddr, setEntryPointAddr] = useState('')
  const [batchMinterAddr, setBatchMinterAddr] = useState('')
  const [status, setStatus] = useState('')
  const [deployedTokens, setDeployedTokens] = useState([])

  //add token to list
  const addToken = () => {
    if (!name || !symbol || !supply) {
      setStatus('need name symbol and supply')
      return
    }
    setTokens([...tokens, { name, symbol, supply: parseInt(supply) }])
    setName('')
    setSymbol('')
    setSupply('')
  }

  //remove token from list
  const removeToken = (index) => {
    const newTokens = tokens.filter((_, i) => i !== index)
    setTokens(newTokens)
  }

  //switch to hardhat local network
  const switchToHardhatNetwork = async () => {
    try {
      if (!window.ethereum) {
        setStatus('error: MetaMask not installed')
        return
      }

      const chainId = '0x7A69' // 31337 in hex
      
      try {
        // Try to switch to the network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainId }],
        })
        setStatus('switched to Hardhat local network')
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            // Add the network
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainId,
                chainName: 'Hardhat Local',
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['http://127.0.0.1:8545'],
                blockExplorerUrls: null
              }],
            })
            setStatus('added and switched to Hardhat local network')
          } catch (addError) {
            setStatus('error: Could not add network. Please add manually: Network Name: Hardhat Local, RPC: http://127.0.0.1:8545, Chain ID: 31337')
          }
        } else {
          setStatus('error: Could not switch network: ' + switchError.message)
        }
      }
    } catch (error) {
      setStatus('error: ' + error.message)
    }
  }

  //check setup before sending
  const checkSetup = async () => {
    try {
      setStatus('checking setup...')
      
      if (!window.ethereum) {
        setStatus('error: MetaMask not installed')
        return
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum)
      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      
      if (!accountAddr || !entryPointAddr || !batchMinterAddr) {
        setStatus('error: Please fill in all contract addresses')
        return
      }
      
      const entryPointCode = await provider.getCode(entryPointAddr)
      const accountCode = await provider.getCode(accountAddr)
      const batchMinterCode = await provider.getCode(batchMinterAddr)
      
      if (entryPointCode === '0x') {
        setStatus('error: EntryPoint not found at ' + entryPointAddr)
        return
      }
      if (accountCode === '0x') {
        setStatus('error: Account not found at ' + accountAddr)
        return
      }
      if (batchMinterCode === '0x') {
        setStatus('error: BatchMinter not found at ' + batchMinterAddr)
        return
      }
      
      setStatus('✓ Setup OK! Network: ' + chainId + ', all contracts found')
    } catch (error) {
      setStatus('error: ' + error.message)
      console.error(error)
    }
  }

  //build and send userop
  const sendUserOp = async () => {
    try {
      setStatus('connecting to metamask...')
      
      //connect to metamask
      if (!window.ethereum) {
        setStatus('need metamask installed')
        return
      }
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const deployer = await signer.getAddress()
      setStatus('connected: ' + deployer)

      //check addresses are set
      if (!accountAddr || !entryPointAddr || !batchMinterAddr) {
        setStatus('need to set account, entrypoint, and batchminter addresses')
        return
      }

      //check if signer matches account owner
      setStatus('checking if signer matches account owner...')
      const accountOwnerAbi = ["function owner() external view returns (address)"]
      const accountOwnerContract = new ethers.Contract(accountAddr, accountOwnerAbi, provider)
      const accountOwner = await accountOwnerContract.owner()
      setStatus('account owner: ' + accountOwner + ', your address: ' + deployer)
      if (accountOwner.toLowerCase() !== deployer.toLowerCase()) {
        setStatus('error: Your MetaMask address (' + deployer + ') does not match the Account owner (' + accountOwner + '). SOLUTION: Switch to the Hardhat account in MetaMask - Click the account icon (top right) and select the account that starts with 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
        return
      }

      if (tokens.length === 0) {
        setStatus('need at least one token')
        return
      }

      setStatus('building calldata...')

      //get contract interfaces
      //we need these to encode function calls
      //just the abis we need, nothing fancy
      const batchMinterAbi = [
        "function deployBatch(tuple(string name, string symbol, uint256 supply)[] configs) external"
      ]
      const accountAbi = [
        "function execute(address target, uint256 value, bytes calldata data) external"
      ]

      const batchMinterInterface = new ethers.Interface(batchMinterAbi)
      const accountInterface = new ethers.Interface(accountAbi)

      //build batch deploy calldata
      const batchCallData = batchMinterInterface.encodeFunctionData("deployBatch", [tokens])
      setStatus('built batch calldata')

      //wrap in account.execute
      const executeCallData = accountInterface.encodeFunctionData("execute", [
        batchMinterAddr,
        0,
        batchCallData
      ])
      setStatus('wrapped in account.execute')

      //check network first
      const networkInfo = await provider.getNetwork()
      const currentChainId = Number(networkInfo.chainId)
      setStatus('connected to network: chainId=' + currentChainId)
      
      //verify contract addresses exist
      setStatus('checking EntryPoint at ' + entryPointAddr + '...')
      const entryPointCode = await provider.getCode(entryPointAddr)
      if (entryPointCode === '0x') {
        setStatus('error: EntryPoint contract not found at ' + entryPointAddr + ' on chainId ' + currentChainId + '. Make sure MetaMask is connected to Hardhat local network (chainId 31337, RPC: http://127.0.0.1:8545) and contracts are deployed.')
        return
      }
      
      setStatus('checking Account at ' + accountAddr + '...')
      const accountCode = await provider.getCode(accountAddr)
      if (accountCode === '0x') {
        setStatus('error: Account contract not found at ' + accountAddr + '. Did you deploy?')
        return
      }
      
      setStatus('checking BatchMinter at ' + batchMinterAddr + '...')
      const batchMinterCode = await provider.getCode(batchMinterAddr)
      if (batchMinterCode === '0x') {
        setStatus('error: BatchMinter contract not found at ' + batchMinterAddr + '. Did you deploy?')
        return
      }

      //get nonce from entrypoint
      const entryPointAbi = [
        "function getNonce(address sender, uint192 key) external view returns (uint256)",
        "function balanceOf(address account) external view returns (uint256)",
        "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] userOps, address beneficiary) external"
      ]
      const entryPoint = new ethers.Contract(entryPointAddr, entryPointAbi, provider)
      const key = 0n
      
      //check if account has balance deposited in EntryPoint
      setStatus('checking account balance in EntryPoint...')
      const balance = await entryPoint.balanceOf(accountAddr)
      setStatus('account balance in EntryPoint: ' + ethers.formatEther(balance) + ' ETH')
      if (balance === 0n) {
        setStatus('error: Account has no balance deposited in EntryPoint. Need to deposit ETH first for gas prefunding.')
        return
      }
      
      setStatus('calling getNonce...')
      const nonce = await entryPoint.getNonce(accountAddr, key)
      setStatus('got nonce: ' + nonce.toString())

      //gas fields
      const callGasLimit = 2_000_000n
      const verificationGasLimit = 1_000_000n
      const preVerificationGas = 80_000n
      const maxPriorityFeePerGas = 1_000_000_000n
      const maxFeePerGas = 2_000_000_000n

      //build userop
      const userOp = {
        sender: accountAddr,
        nonce: nonce,
        initCode: "0x",
        callData: executeCallData,
        accountGasLimits: packUints(verificationGasLimit, callGasLimit),
        preVerificationGas: preVerificationGas,
        gasFees: packUints(maxPriorityFeePerGas, maxFeePerGas),
        paymasterAndData: "0x",
        signature: "0x"
      }

      setStatus('built userop, signing...')

      //build eip712 domain and types
      const domain = {
        name: "ERC4337",
        version: "1",
        chainId: currentChainId,
        verifyingContract: entryPointAddr
      }

      const types = {
        PackedUserOperation: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" }
        ]
      }

      const message = {
        sender: userOp.sender,
        nonce: userOp.nonce,
        initCode: userOp.initCode,
        callData: userOp.callData,
        accountGasLimits: userOp.accountGasLimits,
        preVerificationGas: userOp.preVerificationGas,
        gasFees: userOp.gasFees,
        paymasterAndData: userOp.paymasterAndData
      }

      //sign with metamask
      const signature = await signer.signTypedData(domain, types, message)
      userOp.signature = signature
      setStatus('signed userop')
      
      //verify userOpHash matches EntryPoint's computation
      setStatus('verifying userOpHash...')
      const entryPointAbiForHash = [
        "function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) calldata userOp) external view returns (bytes32)"
      ]
      const entryPointForHash = new ethers.Contract(entryPointAddr, entryPointAbiForHash, provider)
      const userOpHash = await entryPointForHash.getUserOpHash(userOp)
      setStatus('userOpHash from EntryPoint: ' + userOpHash)

      //send to entrypoint
      setStatus('sending to entrypoint.handleOps...')
      const entryPointWithSigner = entryPoint.connect(signer)
      
      //try to simulate first to catch errors
      try {
        setStatus('simulating transaction...')
        await entryPointWithSigner.handleOps.estimateGas([userOp], deployer)
        setStatus('simulation passed, sending transaction...')
      } catch (simError) {
        setStatus('error: Transaction simulation failed: ' + simError.message)
        if (simError.data) {
          setStatus('error details: ' + JSON.stringify(simError.data))
        }
        return
      }
      
      let tx
      try {
        tx = await entryPointWithSigner.handleOps([userOp], deployer)
        setStatus('tx sent: ' + tx.hash + ', waiting for confirmation...')
      } catch (txError) {
        setStatus('error: Failed to send transaction: ' + txError.message)
        if (txError.data) {
          setStatus('error details: ' + JSON.stringify(txError.data))
        }
        if (txError.reason) {
          setStatus('revert reason: ' + txError.reason)
        }
        return
      }

      const receipt = await tx.wait()
      setStatus('tx confirmed in block ' + receipt.blockNumber)

      //parse logs to find deployed tokens
      //batchminter emits TokenDeployed events
      //we need to parse these from the receipt
      const batchMinterEventAbi = [
        "event TokenDeployed(address indexed token, address indexed owner, string name, string symbol, uint256 supply)"
      ]
      const batchMinterEventInterface = new ethers.Interface(batchMinterEventAbi)

      const deployed = []
      for (const log of receipt.logs) {
        try {
          const parsed = batchMinterEventInterface.parseLog(log)
          if (parsed && parsed.name === "TokenDeployed") {
            deployed.push({
              address: parsed.args[0],
              owner: parsed.args[1],
              name: parsed.args[2],
              symbol: parsed.args[3],
              supply: parsed.args[4].toString()
            })
          }
        } catch (e) {
          //not our event, skip it
        }
      }

      setDeployedTokens(deployed)
      setStatus('done! deployed ' + deployed.length + ' tokens')
    } catch (error) {
      setStatus('error: ' + error.message)
      console.error(error)
    }
  }

  return (
    <div>
      <h1>UserOp Builder</h1>
      
      <div>
        <h2>Contract Addresses</h2>
        <div>
          <label>Account Address:</label>
          <input 
            type="text" 
            value={accountAddr} 
            onChange={(e) => setAccountAddr(e.target.value)}
            placeholder="0x..."
            style={{width: '400px'}}
          />
        </div>
        <div>
          <label>EntryPoint Address:</label>
          <input 
            type="text" 
            value={entryPointAddr} 
            onChange={(e) => setEntryPointAddr(e.target.value)}
            placeholder="0x..."
            style={{width: '400px'}}
          />
        </div>
        <div>
          <label>BatchMinter Address:</label>
          <input 
            type="text" 
            value={batchMinterAddr} 
            onChange={(e) => setBatchMinterAddr(e.target.value)}
            placeholder="0x..."
            style={{width: '400px'}}
          />
        </div>
      </div>

      <div>
        <h2>Add Token</h2>
        <div>
          <label>Name:</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="TOKENalpha"
          />
        </div>
        <div>
          <label>Symbol:</label>
          <input 
            type="text" 
            value={symbol} 
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="TKA"
          />
        </div>
        <div>
          <label>Supply:</label>
          <input 
            type="number" 
            value={supply} 
            onChange={(e) => setSupply(e.target.value)}
            placeholder="10000"
          />
        </div>
        <button onClick={addToken}>Add Token</button>
      </div>

      <div>
        <h2>Token List ({tokens.length})</h2>
        {tokens.length === 0 ? (
          <p>no tokens added yet</p>
        ) : (
          <ul>
            {tokens.map((token, index) => (
              <li key={index}>
                {token.name} ({token.symbol}) - {token.supply} tokens
                <button onClick={() => removeToken(index)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <button onClick={switchToHardhatNetwork} style={{marginRight: '10px', backgroundColor: '#f0ad4e', color: 'white'}}>
          Switch to Hardhat Network
        </button>
        <button onClick={checkSetup} style={{marginRight: '10px'}}>
          Check Setup
        </button>
        <button onClick={sendUserOp} disabled={tokens.length === 0}>
          Build and Send UserOp
        </button>
      </div>

      <div>
        <h2>Status</h2>
        <p>{status || 'ready'}</p>
      </div>

      {deployedTokens.length > 0 && (
        <div>
          <h2>Deployed Tokens</h2>
          <ul>
            {deployedTokens.map((token, index) => (
              <li key={index}>
                {token.name} ({token.symbol}) - {token.address} - Supply: {token.supply}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App
