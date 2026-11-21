// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentIDGate} from "./AgentIDGate.sol";
import {IJobEscrow, IReputationRegistry, Outcome} from "./Interfaces.sol";

/// @title JuryCourt
/// @notice Randomly drawn Agent ID holders settle disputes opened in JobEscrow.
///          Dispute fees are paid in native BNB.
/// @dev Flow: openCase -> activateCase -> drawJurors -> commitVote -> revealVote -> finalize.
///      Each party deposits `disputeFee`. The winner's fee is refunded, the loser's fee is
///      split among jurors who voted with the majority. No majority (or fewer than QUORUM
///      reveals) means Split: escrow is divided 50/50 and both fees are refunded.
///
///      KNOWN LIMITATION: juror selection uses a future blockhash, which a block producer
///      could theoretically influence. Fine for a hackathon-scale prize; for larger stakes
///      replace with a VRF or commit-reveal beacon.
contract JuryCourt is AgentIDGate {
    uint256 public constant JURY_SIZE = 5;
    uint256 public constant QUORUM = 3;
    uint256 private constant MAX_DRAW_ATTEMPTS = 64;

    uint8 private constant VOTE_CLIENT = 1;
    uint8 private constant VOTE_WORKER = 2;

    enum Phase {
        None,
        AwaitingWorker,
        AwaitingDraw,
        Voting,
        Finalized,
        Cancelled
    }

    struct Case {
        address client;
        address worker;
        Phase phase;
        uint64 activatedAt;
        uint64 drawBlock;
        uint64 commitEnd;
        uint64 revealEnd;
        uint8 clientVotes;
        uint8 workerVotes;
        uint8 revealed;
    }

    address public immutable escrow;
    IReputationRegistry public immutable registry;
    uint256 public immutable disputeFee;
    uint64 public immutable commitWindow;
    uint64 public immutable revealWindow;
    uint64 public immutable drawTimeout;

    address[] public pool;
    mapping(address => uint256) public poolIndex; // 1-based, 0 = not in pool

    mapping(uint256 => Case) public cases; // keyed by JobEscrow job id
    mapping(uint256 => address[]) private _jurors;
    mapping(uint256 => mapping(address => bool)) public isJuror;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => uint8)) public revealedVote;

    mapping(address => uint256) public claimable;

    error NotEscrow();
    error WrongPhase();
    error TooEarly();
    error TooLate();
    error PoolTooSmall();
    error AlreadyInPool();
    error NotInPool();
    error NotJuror();
    error BadVote();
    error BadReveal();
    error NothingToWithdraw();
    error TransferFailed();

    event PoolJoined(address indexed juror);
    event PoolLeft(address indexed juror);
    event CaseOpened(uint256 indexed jobId, address client, address worker);
    event CaseActivated(uint256 indexed jobId, uint64 drawBlock);
    event DrawRestarted(uint256 indexed jobId, uint64 newDrawBlock);
    event JurorsDrawn(uint256 indexed jobId, address[] jurors, uint64 commitEnd, uint64 revealEnd);
    event VoteCommitted(uint256 indexed jobId, address indexed juror);
    event VoteRevealed(uint256 indexed jobId, address indexed juror, uint8 vote);
    event CaseFinalized(uint256 indexed jobId, Outcome outcome);
    event CaseAborted(uint256 indexed jobId);
    event Withdrawn(address indexed account, uint256 amount);

    constructor(
        address agentID_,
        address escrow_,
        IReputationRegistry registry_,
        uint256 disputeFee_,
        uint64 commitWindow_,
        uint64 revealWindow_,
        uint64 drawTimeout_
    ) AgentIDGate(agentID_) {
        escrow = escrow_;
        registry = registry_;
        disputeFee = disputeFee_;
        commitWindow = commitWindow_;
        revealWindow = revealWindow_;
        drawTimeout = drawTimeout_;
    }

    /// @notice Accept BNB dispute fees forwarded by the escrow.
    /// @dev Only the escrow ever pays the court; BNB sent directly would be
    ///      locked forever (there is no sweep), so anything else reverts.
    receive() external payable {
        if (msg.sender != escrow) revert NotEscrow();
    }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    // ------------------------------------------------------------ juror pool

    function joinPool() external onlyAgentID {
        if (poolIndex[msg.sender] != 0) revert AlreadyInPool();
        pool.push(msg.sender);
        poolIndex[msg.sender] = pool.length;
        emit PoolJoined(msg.sender);
    }

    function leavePool() external {
        uint256 idx = poolIndex[msg.sender];
        if (idx == 0) revert NotInPool();
        address last = pool[pool.length - 1];
        pool[idx - 1] = last;
        poolIndex[last] = idx;
        pool.pop();
        delete poolIndex[msg.sender];
        emit PoolLeft(msg.sender);
    }

    function poolSize() external view returns (uint256) {
        return pool.length;
    }

    function jurorsOf(uint256 jobId) external view returns (address[] memory) {
        return _jurors[jobId];
    }

    // ------------------------------------------------- case setup (by escrow)

    /// @dev The escrow has already moved the client's fee into this contract.
    function openCase(uint256 jobId, address client, address worker) external onlyEscrow {
        Case storage c = cases[jobId];
        if (c.phase != Phase.None) revert WrongPhase();
        c.client = client;
        c.worker = worker;
        c.phase = Phase.AwaitingWorker;
        emit CaseOpened(jobId, client, worker);
    }

    /// @dev The escrow has already moved the worker's fee into this contract.
    function activateCase(uint256 jobId) external onlyEscrow {
        Case storage c = cases[jobId];
        if (c.phase != Phase.AwaitingWorker) revert WrongPhase();
        c.phase = Phase.AwaitingDraw;
        c.activatedAt = uint64(block.timestamp);
        c.drawBlock = uint64(block.number + 1);
        emit CaseActivated(jobId, c.drawBlock);
    }

    /// @dev Worker never matched the fee: refund the client's fee.
    function cancelCase(uint256 jobId) external onlyEscrow {
        Case storage c = cases[jobId];
        if (c.phase != Phase.AwaitingWorker) revert WrongPhase();
        c.phase = Phase.Cancelled;
        claimable[c.client] += disputeFee;
    }

    // ------------------------------------------------------------ jury draw

    /// @notice Anyone can trigger the draw once the target block has passed.
    function drawJurors(uint256 jobId) external {
        Case storage c = cases[jobId];
        if (c.phase != Phase.AwaitingDraw) revert WrongPhase();
        if (block.number <= c.drawBlock) revert TooEarly();

        bytes32 seed = blockhash(c.drawBlock);
        if (seed == bytes32(0)) {
            // Target block is older than 256 blocks: pick a fresh one.
            c.drawBlock = uint64(block.number + 1);
            emit DrawRestarted(jobId, c.drawBlock);
            return;
        }

        uint256 n = pool.length;
        if (n < JURY_SIZE + 2) revert PoolTooSmall();

        uint256 picked;
        for (uint256 i = 0; i < MAX_DRAW_ATTEMPTS && picked < JURY_SIZE; i++) {
            // encodePacked is safe here: all three inputs are fixed-size, so
            // there is no concatenation ambiguity; it just avoids abi.encode's
            // per-iteration memory allocation.
            address cand = pool[uint256(keccak256(abi.encodePacked(seed, jobId, i))) % n];
            if (cand == c.client || cand == c.worker || isJuror[jobId][cand]) continue;
            isJuror[jobId][cand] = true;
            _jurors[jobId].push(cand);
            picked++;
        }
        if (picked < JURY_SIZE) {
            // Same-seed retries would pick the same jurors and fail again, so
            // clear the partial draw and restart from a fresh block instead of
            // reverting (a revert would leave the case stuck on this seed
            // until the blockhash expires 256 blocks later).
            address[] storage pickedJurors = _jurors[jobId];
            for (uint256 j = 0; j < pickedJurors.length; j++) {
                delete isJuror[jobId][pickedJurors[j]];
            }
            delete _jurors[jobId];
            c.drawBlock = uint64(block.number + 1);
            emit DrawRestarted(jobId, c.drawBlock);
            return;
        }

        c.phase = Phase.Voting;
        c.commitEnd = uint64(block.timestamp) + commitWindow;
        c.revealEnd = c.commitEnd + revealWindow;
        emit JurorsDrawn(jobId, _jurors[jobId], c.commitEnd, c.revealEnd);
    }

    // --------------------------------------------------------------- voting

    /// @param commitment keccak256(abi.encode(jobId, juror, vote, salt)); vote 1 = client, 2 = worker.
    function commitVote(uint256 jobId, bytes32 commitment) external {
        Case storage c = cases[jobId];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp > c.commitEnd) revert TooLate();
        if (!isJuror[jobId][msg.sender]) revert NotJuror();
        if (commitment == bytes32(0) || commitments[jobId][msg.sender] != bytes32(0)) revert BadVote();
        commitments[jobId][msg.sender] = commitment;
        emit VoteCommitted(jobId, msg.sender);
    }

    function revealVote(uint256 jobId, uint8 vote, bytes32 salt) external {
        Case storage c = cases[jobId];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp <= c.commitEnd) revert TooEarly();
        if (block.timestamp > c.revealEnd) revert TooLate();
        if (vote != VOTE_CLIENT && vote != VOTE_WORKER) revert BadVote();

        bytes32 commitment = commitments[jobId][msg.sender];
        if (commitment == bytes32(0) || revealedVote[jobId][msg.sender] != 0) revert BadReveal();
        if (keccak256(abi.encode(jobId, msg.sender, vote, salt)) != commitment) revert BadReveal();

        revealedVote[jobId][msg.sender] = vote;
        c.revealed++;
        if (vote == VOTE_CLIENT) c.clientVotes++;
        else c.workerVotes++;
        emit VoteRevealed(jobId, msg.sender, vote);
    }

    // ------------------------------------------------------------- finalize

    /// @notice Anyone can finalize once all jurors revealed or the reveal window closed.
    function finalize(uint256 jobId) external {
        Case storage c = cases[jobId];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp <= c.revealEnd && c.revealed < JURY_SIZE) revert TooEarly();

        Outcome outcome;
        if (c.revealed < QUORUM || c.clientVotes == c.workerVotes) {
            outcome = Outcome.Split;
        } else {
            outcome = c.clientVotes > c.workerVotes ? Outcome.ClientWins : Outcome.WorkerWins;
        }
        c.phase = Phase.Finalized;

        uint256 fee = disputeFee;
        address[] storage js = _jurors[jobId];

        if (outcome == Outcome.Split) {
            claimable[c.client] += fee;
            claimable[c.worker] += fee;
            for (uint256 i = 0; i < js.length; i++) {
                if (revealedVote[jobId][js[i]] == 0) {
                    registry.recordMissedReveal(js[i]);
                } else {
                    // Jurors who revealed still judged the case, even though
                    // no majority emerged; record it (majorityVotes stays 0).
                    registry.recordJuror(js[i], false);
                }
            }
        } else {
            bool clientWon = outcome == Outcome.ClientWins;
            address winner = clientWon ? c.client : c.worker;
            uint8 majorityVote = clientWon ? VOTE_CLIENT : VOTE_WORKER;
            uint256 majorityCount = clientWon ? c.clientVotes : c.workerVotes;
            uint256 share = fee / majorityCount;

            // Winner gets their own fee back plus any rounding dust from the loser's fee.
            claimable[winner] += fee + (fee - share * majorityCount);

            for (uint256 i = 0; i < js.length; i++) {
                uint8 v = revealedVote[jobId][js[i]];
                if (v == 0) {
                    registry.recordMissedReveal(js[i]);
                } else {
                    bool withMajority = v == majorityVote;
                    if (withMajority) claimable[js[i]] += share;
                    registry.recordJuror(js[i], withMajority);
                }
            }
        }

        emit CaseFinalized(jobId, outcome);
        IJobEscrow(escrow).resolveDispute(jobId, outcome);
    }

    /// @notice Escape hatch: if no jury could be drawn within `drawTimeout`, split everything.
    function abortStaleCase(uint256 jobId) external {
        Case storage c = cases[jobId];
        if (c.phase != Phase.AwaitingDraw) revert WrongPhase();
        if (block.timestamp <= c.activatedAt + drawTimeout) revert TooEarly();
        c.phase = Phase.Cancelled;
        claimable[c.client] += disputeFee;
        claimable[c.worker] += disputeFee;
        emit CaseAborted(jobId);
        IJobEscrow(escrow).resolveDispute(jobId, Outcome.Split);
    }

    // -------------------------------------------------------------- payouts

    function withdraw() external {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
