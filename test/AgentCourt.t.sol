// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentIDGate} from "../src/AgentIDGate.sol";
import {JobEscrow} from "../src/JobEscrow.sol";
import {JuryCourt} from "../src/JuryCourt.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {IJuryCourt, IReputationRegistry, Outcome} from "../src/Interfaces.sol";

/// @dev Stand-in for the real Agent ID contract (balanceOf > 0 means "holds an Agent ID").
contract MockAgentID {
    mapping(address => uint256) public balanceOf;

    function grant(address to) external {
        balanceOf[to] = 1;
    }
}

contract AgentCourtTest is Test {
    MockAgentID agentID;
    ReputationRegistry registry;
    JobEscrow escrow;
    JuryCourt court;

    address client = makeAddr("client");
    address worker = makeAddr("worker");
    address outsider = makeAddr("outsider");
    address[] jurorPool;

    uint128 constant AMOUNT = 1 ether;
    uint256 constant FEE = 0.01 ether;
    uint64 constant WORK_WINDOW = 7 days;

    function setUp() public {
        agentID = new MockAgentID();
        registry = new ReputationRegistry();
        escrow = new JobEscrow(address(agentID), registry, 3 days, 2 days);
        court = new JuryCourt(address(agentID), address(escrow), registry, FEE, 1 days, 1 days, 7 days);
        escrow.setCourt(IJuryCourt(address(court)));
        registry.initialize(address(escrow), address(court));

        agentID.grant(client);
        agentID.grant(worker);
        vm.deal(client, 10 ether);
        vm.deal(worker, 10 ether);
        vm.deal(outsider, 10 ether);

        for (uint256 i = 0; i < 10; i++) {
            address j = makeAddr(string.concat("juror", vm.toString(i)));
            agentID.grant(j);
            vm.deal(j, 1 ether);
            vm.prank(j);
            court.joinPool();
            jurorPool.push(j);
        }
    }

    // ---------------------------------------------------------------- helpers

    function _createAcceptSubmit() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + WORK_WINDOW, keccak256("spec"));
        vm.prank(worker);
        escrow.acceptJob(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("deliverable"));
    }

    function _toArbitration() internal returns (uint256 id) {
        id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);
        vm.roll(block.number + 2);
        court.drawJurors(id);
    }

    function _commit(uint256 id, address juror, uint8 vote) internal {
        bytes32 salt = keccak256(abi.encode("salt", juror));
        vm.prank(juror);
        court.commitVote(id, keccak256(abi.encode(id, juror, vote, salt)));
    }

    function _reveal(uint256 id, address juror, uint8 vote) internal {
        bytes32 salt = keccak256(abi.encode("salt", juror));
        vm.prank(juror);
        court.revealVote(id, vote, salt);
    }

    function _vote(uint256 id, address[] memory js, uint8[] memory votes) internal {
        for (uint256 i = 0; i < js.length; i++) {
            if (votes[i] != 0) _commit(id, js[i], votes[i]);
        }
        vm.warp(block.timestamp + 1 days + 1);
        for (uint256 i = 0; i < js.length; i++) {
            if (votes[i] != 0) _reveal(id, js[i], votes[i]);
        }
    }

    // ------------------------------------------------------------- happy path

    function test_happyPath_approveAndWithdraw() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.approve(id);

        uint256 before = worker.balance;
        vm.prank(worker);
        escrow.withdraw();
        assertEq(worker.balance, before + AMOUNT);
        assertEq(registry.getRecord(worker).jobsCompleted, 1);
        assertEq(registry.getRecord(client).jobsCompleted, 1);
    }

    function test_workerClaimsAfterClientSilence() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.claimAfterTimeout(id);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(worker);
        escrow.claimAfterTimeout(id);
        assertEq(escrow.claimable(worker), AMOUNT);
    }

    function test_clientReclaimsUndeliveredWork() public {
        vm.prank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + WORK_WINDOW, keccak256("spec"));
        vm.prank(worker);
        escrow.acceptJob(id);

        vm.warp(block.timestamp + WORK_WINDOW + 1);
        vm.prank(client);
        escrow.reclaimUndelivered(id);
        assertEq(escrow.claimable(client), AMOUNT);
    }

    // --------------------------------------------------------------- gating

    function test_agentIDRequired() public {
        vm.startPrank(outsider);
        vm.expectRevert(abi.encodeWithSelector(AgentIDGate.NoAgentID.selector, outsider));
        escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + WORK_WINDOW, keccak256("spec"));

        vm.expectRevert(abi.encodeWithSelector(AgentIDGate.NoAgentID.selector, outsider));
        court.joinPool();
        vm.stopPrank();
    }

    function test_clientCannotAcceptOwnJob() public {
        vm.startPrank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + WORK_WINDOW, keccak256("spec"));
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.acceptJob(id);
        vm.stopPrank();
    }

    function test_wiringLocksAfterFirstUse() public {
        vm.expectRevert(JobEscrow.NotAuthorized.selector);
        escrow.setCourt(IJuryCourt(address(0xdead)));
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.initialize(address(1), address(2));
    }

    function test_createJobRejectsWrongValue() public {
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.createJob{value: AMOUNT - 1}(AMOUNT, uint64(block.timestamp) + WORK_WINDOW, keccak256("spec"));
    }

    function test_raiseDisputeRejectsWrongFee() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.raiseDispute{value: FEE - 1}(id, keccak256("evidence"));
    }

    // ------------------------------------------------------------ disputes

    function test_defaultJudgment_whenWorkerNeverMatches() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));

        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.defaultJudgment(id);

        vm.warp(block.timestamp + 2 days + 1);
        escrow.defaultJudgment(id);

        assertEq(escrow.claimable(client), AMOUNT);
        assertEq(court.claimable(client), FEE);
        assertEq(registry.getRecord(client).disputesWon, 1);
        assertEq(registry.getRecord(worker).disputesLost, 1);
    }

    function test_workerWinsWithMajority() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        assertEq(js.length, 5);
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(js[i] != client && js[i] != worker);
        }

        // 3 vote for worker (2), 2 vote for client (1)
        uint8[] memory votes = new uint8[](5);
        votes[0] = 2;
        votes[1] = 2;
        votes[2] = 2;
        votes[3] = 1;
        votes[4] = 1;
        _vote(id, js, votes);
        court.finalize(id);

        // Worker gets the escrow, and own fee back
        assertEq(escrow.claimable(worker), AMOUNT);
        // Majority jurors split the client's fee (3 jurors); rounding dust goes to the winner
        uint256 share = FEE / 3;
        assertEq(court.claimable(worker), FEE + (FEE - share * 3));
        // Client lost: nothing back from the court
        assertEq(court.claimable(client), 0);
        assertEq(court.claimable(js[0]), share);
        assertEq(court.claimable(js[1]), share);
        assertEq(court.claimable(js[2]), share);
        assertEq(court.claimable(js[3]), 0);
        assertEq(registry.getRecord(js[0]).majorityVotes, 1);
        assertEq(registry.getRecord(js[3]).casesJudged, 1);
        assertEq(registry.getRecord(js[3]).majorityVotes, 0);

        // Conservation: everything the court holds (in BNB) is claimable
        uint256 owed = court.claimable(worker) + court.claimable(client);
        for (uint256 i = 0; i < 5; i++) {
            owed += court.claimable(js[i]);
        }
        assertEq(address(court).balance, owed);

        uint256 before = js[0].balance;
        vm.prank(js[0]);
        court.withdraw();
        assertEq(js[0].balance, before + share);
    }

    function test_clientWinsWithMajority() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        for (uint256 i = 0; i < 5; i++) {
            votes[i] = 1;
        }
        _vote(id, js, votes);
        // all revealed, so finalize works before the reveal window ends
        court.finalize(id);

        assertEq(escrow.claimable(client), AMOUNT);
        assertEq(court.claimable(client) + court.claimable(worker), FEE + (FEE - (FEE / 5) * 5));
        assertEq(court.claimable(js[0]), FEE / 5);
    }

    function test_splitWhenQuorumMissed() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        // only 2 jurors vote: below quorum of 3
        uint8[] memory votes = new uint8[](5);
        votes[0] = 1;
        votes[1] = 2;
        _vote(id, js, votes);

        vm.expectRevert(JuryCourt.TooEarly.selector);
        court.finalize(id);

        vm.warp(block.timestamp + 1 days + 1);
        court.finalize(id);

        assertEq(escrow.claimable(client), AMOUNT / 2);
        assertEq(escrow.claimable(worker), AMOUNT - AMOUNT / 2);
        assertEq(court.claimable(client), FEE);
        assertEq(court.claimable(worker), FEE);
        assertEq(registry.getRecord(js[4]).missedReveals, 1);
        assertEq(registry.getRecord(client).disputesSplit, 1);
    }

    function test_revealMustMatchCommitment() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        vm.warp(block.timestamp + 1 days + 1);

        bytes32 salt = keccak256(abi.encode("salt", js[0]));
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadReveal.selector);
        court.revealVote(id, 2, salt); // committed 1, reveals 2
    }

    function test_onlyDrawnJurorsCanVote() public {
        uint256 id = _toArbitration();
        vm.prank(outsider);
        vm.expectRevert(JuryCourt.NotJuror.selector);
        court.commitVote(id, keccak256("x"));
    }

    function test_drawNeedsBiggerPool() public {
        // shrink pool to 6 (< JURY_SIZE + 2)
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(jurorPool[i]);
            court.leavePool();
        }
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);
        vm.roll(block.number + 2);
        vm.expectRevert(JuryCourt.PoolTooSmall.selector);
        court.drawJurors(id);
    }

    function test_abortStaleCaseSplitsEverything() public {
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(jurorPool[i]);
            court.leavePool();
        }
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);

        vm.expectRevert(JuryCourt.TooEarly.selector);
        court.abortStaleCase(id);

        vm.warp(block.timestamp + 7 days + 1);
        court.abortStaleCase(id);
        assertEq(escrow.claimable(client), AMOUNT / 2);
        assertEq(court.claimable(client), FEE);
        assertEq(court.claimable(worker), FEE);
    }
}
