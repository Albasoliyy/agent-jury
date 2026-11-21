// Auto-extracted from Foundry build output (out/ReputationRegistry.sol/ReputationRegistry.json).
// Do not edit by hand; regenerate from the compiled contracts.
export const ReputationRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "court",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRecord",
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
        "type": "tuple",
        "internalType": "struct ReputationRegistry.Record",
        "components": [
          {
            "name": "jobsCompleted",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "disputesWon",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "disputesLost",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "disputesSplit",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "casesJudged",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "majorityVotes",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "missedReveals",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "escrow_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "court_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordCompleted",
    "inputs": [
      {
        "name": "client",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "worker",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordDispute",
    "inputs": [
      {
        "name": "winner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "loser",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordJuror",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "withMajority",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordMissedReveal",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordSplit",
    "inputs": [
      {
        "name": "client",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "worker",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "escrow",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "court",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyInitialized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  }
] as const;
