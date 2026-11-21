// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockAgentID} from "../src/MockAgentID.sol";

/// @notice Deploy the TESTNET-ONLY MockAgentID (see src/MockAgentID.sol).
/// @dev Usage:
///   forge script script/DeployMock.s.sol --rpc-url <BSC testnet RPC> \
///     --private-key $TESTNET_DEPLOYER_PK --broadcast
///   Then deploy Agent Jury against it:
///   AGENT_ID=<mock address> forge script script/Deploy.s.sol --rpc-url <same RPC> \
///     --private-key $TESTNET_DEPLOYER_PK --broadcast
/// NEVER run this script against mainnet.
contract DeployMock is Script {
    function run() external {
        vm.startBroadcast();
        MockAgentID mock = new MockAgentID();
        vm.stopBroadcast();
        console.log("MockAgentID       ", address(mock));
        console.log("NOTE: testnet-only mock. Deploy Jury with AGENT_ID=<above>.");
    }
}
