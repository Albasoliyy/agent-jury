// Auto-extracted from Foundry build output (out/AgentIDGate.sol/AgentIDGate.json).
// Do not edit by hand; regenerate from the compiled contracts.
export const AgentIDGateAbi = [
  {
    "type": "function",
    "name": "agentID",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAgentID"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasAgentID",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "NoAgentID",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
