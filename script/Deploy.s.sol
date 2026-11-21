// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";
import {JuryCourt} from "../src/JuryCourt.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {IJuryCourt} from "../src/Interfaces.sol";

/// Usage (BNB Chain testnet or mainnet):
///   DISPUTE_FEE=0.00001ether REVIEW_WINDOW=2h MATCH_WINDOW=2h COMMIT_WINDOW=1h \
///   REVEAL_WINDOW=1h DRAW_TIMEOUT=24h \
///   forge script script/Deploy.s.sol \
///     --rpc-url $BSC_RPC --private-key $PK --broadcast --verify --etherscan-api-key $BSCSCAN_KEY
///
/// AGENT_ID env override: defaults to the REAL Binance Agent ID on mainnet
/// (0x60b9262456de011f7d15a54cdd8c48baaa8b022f). A mainnet deploy must NEVER
/// pass anything else. A TESTNET deploy MUST pass AGENT_ID=<MockAgentID
/// address>: the real Agent ID has no testnet deployment (verified
/// 2026-11-21: eth_getCode returns 0x on testnet), so pointing a testnet
/// deploy at the mainnet address would make every gated function revert.
/// The mock is testnet-only, approved by the user 2026-11-21 for the demo;
/// it proves mechanics only and never counts toward the >= 30 real Agent
/// ID interactions the Innovation Award needs.
///
///   AGENT_ID=0x<MockAgentID> forge script script/Deploy.s.sol --rpc-url <testnet RPC> ...
///
/// All windows are in seconds (suffixes like 2h / 1d work via vm.envOr uint parsing
/// only when given as plain numbers; pass seconds, e.g. REVIEW_WINDOW=7200).
/// Defaults below are the DEMO windows (short, so a full dispute fits in a day).
contract Deploy is Script {
    // Real Binance Agent ID on BNB Chain mainnet (from the hackathon
    // announcement). This is the DEFAULT: a deploy that does not pass
    // AGENT_ID always gates against the real contract.
    address constant MAINNET_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external {
        address agentID = vm.envOr("AGENT_ID", MAINNET_AGENT_ID);
        if (agentID == address(0)) revert("AGENT_ID must not be zero");
        if (agentID != MAINNET_AGENT_ID) {
            console.log("WARNING: deploying against a NON-MAINNET Agent ID (mock?)");
            console.log("         Only ever do this on testnet. Mainnet must use the real Agent ID.");
        }
        uint256 fee = vm.envOr("DISPUTE_FEE", uint256(0.00001 ether)); // BNB per party (~$0.005 at ~$534/BNB; user-decided 2026-11-21, cheap for testing)
        uint64 reviewWindow = uint64(vm.envOr("REVIEW_WINDOW", uint256(2 hours)));
        uint64 matchWindow = uint64(vm.envOr("MATCH_WINDOW", uint256(2 hours)));
        uint64 commitWindow = uint64(vm.envOr("COMMIT_WINDOW", uint256(1 hours)));
        uint64 revealWindow = uint64(vm.envOr("REVEAL_WINDOW", uint256(1 hours)));
        uint64 drawTimeout = uint64(vm.envOr("DRAW_TIMEOUT", uint256(24 hours)));

        vm.startBroadcast();
        ReputationRegistry registry = new ReputationRegistry();
        JobEscrow escrow = new JobEscrow(agentID, registry, reviewWindow, matchWindow);
        JuryCourt court = new JuryCourt(agentID, address(escrow), registry, fee, commitWindow, revealWindow, drawTimeout);
        escrow.setCourt(IJuryCourt(address(court)));
        registry.initialize(address(escrow), address(court));
        vm.stopBroadcast();

        console.log("agentID           ", agentID);

        console.log("ReputationRegistry", address(registry));
        console.log("JobEscrow         ", address(escrow));
        console.log("JuryCourt         ", address(court));
        console.log("disputeFee (wei)  ", fee);
        console.log("reviewWindow (s)  ", reviewWindow);
        console.log("matchWindow (s)   ", matchWindow);
        console.log("commitWindow (s)  ", commitWindow);
        console.log("revealWindow (s)  ", revealWindow);
        console.log("drawTimeout (s)   ", drawTimeout);
    }
}
