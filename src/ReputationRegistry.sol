// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputationRegistry} from "./Interfaces.sol";

/// @title ReputationRegistry
/// @notice Append-only counters per address. Only JobEscrow and JuryCourt can write.
/// @dev Wiring is done once by the deployer through `initialize`, after which the
///      deployer has no powers. Other dApps can read records with `getRecord`.
contract ReputationRegistry is IReputationRegistry {
    struct Record {
        uint32 jobsCompleted;
        uint32 disputesWon;
        uint32 disputesLost;
        uint32 disputesSplit;
        uint32 casesJudged;
        uint32 majorityVotes;
        uint32 missedReveals;
    }

    mapping(address => Record) private _records;

    address public escrow;
    address public court;
    address private _deployer;

    error NotAuthorized();
    error AlreadyInitialized();

    event Initialized(address escrow, address court);

    constructor() {
        _deployer = msg.sender;
    }

    /// @notice One-time wiring. Locks itself after the first call.
    function initialize(address escrow_, address court_) external {
        if (msg.sender != _deployer) revert NotAuthorized();
        if (escrow != address(0)) revert AlreadyInitialized();
        escrow = escrow_;
        court = court_;
        _deployer = address(0);
        emit Initialized(escrow_, court_);
    }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotAuthorized();
        _;
    }

    modifier onlyCourt() {
        if (msg.sender != court) revert NotAuthorized();
        _;
    }

    function getRecord(address account) external view returns (Record memory) {
        return _records[account];
    }

    // ---------------------------------------------------------------- escrow

    function recordCompleted(address client, address worker) external onlyEscrow {
        _records[client].jobsCompleted++;
        _records[worker].jobsCompleted++;
    }

    function recordDispute(address winner, address loser) external onlyEscrow {
        _records[winner].disputesWon++;
        _records[loser].disputesLost++;
    }

    function recordSplit(address client, address worker) external onlyEscrow {
        _records[client].disputesSplit++;
        _records[worker].disputesSplit++;
    }

    // ----------------------------------------------------------------- court

    function recordJuror(address juror, bool withMajority) external onlyCourt {
        Record storage r = _records[juror];
        r.casesJudged++;
        if (withMajority) r.majorityVotes++;
    }

    function recordMissedReveal(address juror) external onlyCourt {
        _records[juror].missedReveals++;
    }
}
