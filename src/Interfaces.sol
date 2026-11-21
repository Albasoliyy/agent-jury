// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Result of a dispute. Split is used when the jury cannot reach a majority.
enum Outcome {
    ClientWins,
    WorkerWins,
    Split
}

/// @notice Minimal view of the SPACE ID Agent ID contract (ERC-721, non-transferable).
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

interface IJobEscrow {
    function resolveDispute(uint256 jobId, Outcome outcome) external;
}

interface IJuryCourt {
    function disputeFee() external view returns (uint256);
    function openCase(uint256 jobId, address client, address worker) external;
    function activateCase(uint256 jobId) external;
    function cancelCase(uint256 jobId) external;
}

interface IReputationRegistry {
    function recordCompleted(address client, address worker) external;
    function recordDispute(address winner, address loser) external;
    function recordSplit(address client, address worker) external;
    function recordJuror(address juror, bool withMajority) external;
    function recordMissedReveal(address juror) external;
}
