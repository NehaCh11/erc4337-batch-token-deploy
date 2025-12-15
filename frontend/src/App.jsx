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
      const network = await provider.getNetwork()
      setStatus('connected to network: chainId=' + network.chainId)
      
      //verify contract addresses exist
      const entryPointCode = await provider.getCode(entryPointAddr)
      if (entryPointCode === '0x') {
        setStatus('error: EntryPoint contract not found at ' + entryPointAddr + '. Make sure you are on the correct network (Hardhat local network, chainId 31337)')
        return
      }
      
      const accountCode = await provider.getCode(accountAddr)
      if (accountCode === '0x') {
        setStatus('error: Account contract not found at ' + accountAddr)
        return
      }

      //get nonce from entrypoint
      const entryPointAbi = [
        "function getNonce(address sender, uint192 key) external view returns (uint256)",
        "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] userOps, address beneficiary) external"
      ]
      const entryPoint = new ethers.Contract(entryPointAddr, entryPointAbi, provider)
      const key = 0n
      
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
      const chainId = (await provider.getNetwork()).chainId
      const domain = {
        name: "ERC4337",
        version: "1",
        chainId: chainId,
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

      //send to entrypoint
      setStatus('sending to entrypoint.handleOps...')
      const entryPointWithSigner = entryPoint.connect(signer)
      const tx = await entryPointWithSigner.handleOps([userOp], deployer)
      setStatus('tx sent: ' + tx.hash + ', waiting for confirmation...')

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
