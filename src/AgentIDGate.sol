// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentID} from "./Interfaces.sol";

/// @title AgentIDGate
/// @notice Base contract that restricts functions to holders of an Agent ID.
/// @dev Agent ID is non-transferable and one-per-user, so "holds an Agent ID" is
///      used as the one-participant-one-seat rule across AgentCourt.
///      BNB Chain mainnet Agent ID: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
abstract contract AgentIDGate {
    IAgentID public immutable agentID;

    error NoAgentID(address account);

    constructor(address agentID_) {
        agentID = IAgentID(agentID_);
    }

    modifier onlyAgentID() {
        _requireAgentID(msg.sender);
        _;
    }

    function hasAgentID(address account) public view returns (bool) {
        return agentID.balanceOf(account) > 0;
    }

    function _requireAgentID(address account) internal view {
        if (agentID.balanceOf(account) == 0) revert NoAgentID(account);
    }
}
