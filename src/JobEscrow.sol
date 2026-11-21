// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentIDGate} from "./AgentIDGate.sol";
import {IJuryCourt, IReputationRegistry, Outcome} from "./Interfaces.sol";

/// @title JobEscrow
/// @notice Escrow for agent-to-agent work, paid in native BNB. Disputes are sent to JuryCourt.
/// @dev Payouts use a pull pattern (`claimable` + `withdraw`) so a blocked
///      recipient can never freeze a dispute resolution.
///
///      Lifecycle:
///        Open -> Accepted -> Submitted -> Completed
///                                    \-> Disputed -> Arbitration -> Resolved
///                                               \-> Resolved (worker never matched fee)
contract JobEscrow is AgentIDGate {
    enum Status {
        None,
        Open,
        Accepted,
        Submitted,
        Disputed, // client opened dispute, waiting for worker to match the fee
        Arbitration, // both fees paid, jury is working
        Completed,
        Resolved,
        Refunded,
        Cancelled
    }

    struct Job {
        address client;
        address worker;
        uint128 amount;
        Status status;
        uint64 workDeadline;
        uint64 reviewDeadline;
        uint64 matchDeadline;
        bytes32 specHash;
        bytes32 deliverableHash;
        bytes32 evidenceHash;
    }

    IReputationRegistry public immutable registry;
    uint64 public immutable reviewWindow;
    uint64 public immutable matchWindow;

    IJuryCourt public court;
    address private _deployer;

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;
    mapping(address => uint256) public claimable;

    error NotClient();
    error NotWorker();
    error NotCourt();
    error BadState();
    error BadInput();
    error AlreadyWired();
    error NotAuthorized();
    error TransferFailed();

    event CourtSet(address court);
    event JobCreated(uint256 indexed jobId, address indexed client, uint256 amount, bytes32 specHash, uint64 workDeadline);
    event JobCancelled(uint256 indexed jobId);
    event JobAccepted(uint256 indexed jobId, address indexed worker);
    event WorkSubmitted(uint256 indexed jobId, bytes32 deliverableHash, uint64 reviewDeadline);
    event JobCompleted(uint256 indexed jobId, address indexed worker, uint256 amount);
    event JobRefunded(uint256 indexed jobId);
    event DisputeRaised(uint256 indexed jobId, bytes32 evidenceHash, uint64 matchDeadline);
    event DisputeMatched(uint256 indexed jobId);
    event DisputeResolved(uint256 indexed jobId, Outcome outcome);
    event Withdrawn(address indexed account, uint256 amount);

    constructor(address agentID_, IReputationRegistry registry_, uint64 reviewWindow_, uint64 matchWindow_)
        AgentIDGate(agentID_)
    {
        registry = registry_;
        reviewWindow = reviewWindow_;
        matchWindow = matchWindow_;
        _deployer = msg.sender;
    }

    /// @notice One-time wiring of the court. Locks itself after the first call.
    function setCourt(IJuryCourt court_) external {
        if (msg.sender != _deployer) revert NotAuthorized();
        if (address(court) != address(0)) revert AlreadyWired();
        if (address(court_) == address(0)) revert BadInput();
        court = court_;
        _deployer = address(0);
        emit CourtSet(address(court_));
    }

    // ------------------------------------------------------------------ jobs

    /// @notice Create a job and fund the escrow in native BNB.
    /// @dev The client sends `amount` as `msg.value`; the BNB is held by this contract.
    function createJob(uint128 amount, uint64 workDeadline, bytes32 specHash)
        external
        payable
        onlyAgentID
        returns (uint256 jobId)
    {
        if (amount == 0 || msg.value != amount || workDeadline <= block.timestamp) revert BadInput();
        jobId = ++jobCount;
        jobs[jobId] = Job({
            client: msg.sender,
            worker: address(0),
            amount: amount,
            status: Status.Open,
            workDeadline: workDeadline,
            reviewDeadline: 0,
            matchDeadline: 0,
            specHash: specHash,
            deliverableHash: bytes32(0),
            evidenceHash: bytes32(0)
        });
        emit JobCreated(jobId, msg.sender, amount, specHash, workDeadline);
    }

    function cancelJob(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotClient();
        if (j.status != Status.Open) revert BadState();
        j.status = Status.Cancelled;
        claimable[j.client] += j.amount;
        emit JobCancelled(jobId);
    }

    function acceptJob(uint256 jobId) external onlyAgentID {
        Job storage j = jobs[jobId];
        if (j.status != Status.Open || block.timestamp >= j.workDeadline) revert BadState();
        if (msg.sender == j.client) revert BadInput();
        j.worker = msg.sender;
        j.status = Status.Accepted;
        emit JobAccepted(jobId, msg.sender);
    }

    function submitWork(uint256 jobId, bytes32 deliverableHash) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.worker) revert NotWorker();
        if (j.status != Status.Accepted || block.timestamp > j.workDeadline) revert BadState();
        j.status = Status.Submitted;
        j.deliverableHash = deliverableHash;
        j.reviewDeadline = uint64(block.timestamp) + reviewWindow;
        emit WorkSubmitted(jobId, deliverableHash, j.reviewDeadline);
    }

    /// @notice Client accepts the work and releases payment.
    function approve(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotClient();
        if (j.status != Status.Submitted) revert BadState();
        _complete(jobId, j);
    }

    /// @notice Worker claims payment if the client stayed silent past the review window.
    function claimAfterTimeout(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.worker) revert NotWorker();
        if (j.status != Status.Submitted || block.timestamp <= j.reviewDeadline) revert BadState();
        _complete(jobId, j);
    }

    /// @notice Client reclaims funds if the worker accepted but never delivered.
    function reclaimUndelivered(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotClient();
        if (j.status != Status.Accepted || block.timestamp <= j.workDeadline) revert BadState();
        j.status = Status.Refunded;
        claimable[j.client] += j.amount;
        emit JobRefunded(jobId);
    }

    // -------------------------------------------------------------- disputes

    /// @notice Client disputes submitted work. Client sends the dispute fee in BNB;
    ///         the escrow forwards it to the court.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) external payable {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotClient();
        if (j.status != Status.Submitted || block.timestamp > j.reviewDeadline) revert BadState();
        if (msg.value != court.disputeFee()) revert BadInput();
        j.status = Status.Disputed;
        j.evidenceHash = evidenceHash;
        j.matchDeadline = uint64(block.timestamp) + matchWindow;

        _forwardFee(msg.value);
        court.openCase(jobId, j.client, j.worker);
        emit DisputeRaised(jobId, evidenceHash, j.matchDeadline);
    }

    /// @notice Worker matches the dispute fee in BNB and sends the case to the jury.
    function matchDispute(uint256 jobId) external payable {
        Job storage j = jobs[jobId];
        if (msg.sender != j.worker) revert NotWorker();
        if (j.status != Status.Disputed || block.timestamp > j.matchDeadline) revert BadState();
        if (msg.value != court.disputeFee()) revert BadInput();
        j.status = Status.Arbitration;

        _forwardFee(msg.value);
        court.activateCase(jobId);
        emit DisputeMatched(jobId);
    }

    /// @notice If the worker never matches the fee, the client wins by default.
    function defaultJudgment(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (j.status != Status.Disputed || block.timestamp <= j.matchDeadline) revert BadState();
        j.status = Status.Resolved;
        claimable[j.client] += j.amount;
        court.cancelCase(jobId);
        registry.recordDispute(j.client, j.worker);
        emit DisputeResolved(jobId, Outcome.ClientWins);
    }

    /// @notice Called by JuryCourt once the jury has decided (or the case was aborted).
    function resolveDispute(uint256 jobId, Outcome outcome) external {
        if (msg.sender != address(court)) revert NotCourt();
        Job storage j = jobs[jobId];
        if (j.status != Status.Arbitration) revert BadState();
        j.status = Status.Resolved;

        if (outcome == Outcome.ClientWins) {
            claimable[j.client] += j.amount;
            registry.recordDispute(j.client, j.worker);
        } else if (outcome == Outcome.WorkerWins) {
            claimable[j.worker] += j.amount;
            registry.recordDispute(j.worker, j.client);
        } else {
            uint256 half = j.amount / 2;
            claimable[j.client] += half;
            claimable[j.worker] += j.amount - half;
            registry.recordSplit(j.client, j.worker);
        }
        emit DisputeResolved(jobId, outcome);
    }

    // --------------------------------------------------------------- payouts

    function withdraw() external {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert BadInput();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @dev Forward a dispute fee (in BNB) to the court. The court accepts BNB via receive().
    function _forwardFee(uint256 fee) private {
        (bool ok,) = address(court).call{value: fee}("");
        if (!ok) revert TransferFailed();
    }

    function _complete(uint256 jobId, Job storage j) private {
        j.status = Status.Completed;
        claimable[j.worker] += j.amount;
        registry.recordCompleted(j.client, j.worker);
        emit JobCompleted(jobId, j.worker, j.amount);
    }
}
