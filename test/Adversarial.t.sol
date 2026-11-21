// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentCourtTest} from "./AgentCourt.t.sol";
import {JobEscrow} from "../src/JobEscrow.sol";
import {JuryCourt} from "../src/JuryCourt.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {IJuryCourt, Outcome} from "../src/Interfaces.sol";

/// @dev Malicious recipient: tries to re-enter withdraw() from its receive().
contract ReentrantWithdrawer {
    address public target;
    bool public reentered;
    bool public innerSucceeded;

    constructor(address target_) {
        target = target_;
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            (bool ok,) = target.call(abi.encodeWithSignature("withdraw()"));
            innerSucceeded = ok;
        }
    }
}

/// @title Adversarial tests for Agent Jury (Milestone 6)
/// @notice Covers ARCHITECTURE.md §10 plus reentrancy, fee conservation,
///         rounding dust, draw restarts, and the fixes made in this milestone.
contract AdversarialTest is AgentCourtTest {
    // ------------------------------------------------------------ helpers

    function _ends(uint256 id) internal view returns (uint64 commitEnd, uint64 revealEnd) {
        (, , , , , commitEnd, revealEnd, , , ) = court.cases(id);
    }

    function _sumCourtClaimable(uint256 id) internal view returns (uint256 owed) {
        address[] memory js = court.jurorsOf(id);
        owed = court.claimable(client) + court.claimable(worker);
        for (uint256 i = 0; i < js.length; i++) owed += court.claimable(js[i]);
    }

    // ------------------------------------------------------- pool behaviour

    function test_doubleRegistration_reverts() public {
        vm.prank(jurorPool[0]);
        vm.expectRevert(JuryCourt.AlreadyInPool.selector);
        court.joinPool();
    }

    function test_leavePoolTwice_reverts() public {
        vm.prank(jurorPool[0]);
        court.leavePool();
        vm.prank(jurorPool[0]);
        vm.expectRevert(JuryCourt.NotInPool.selector);
        court.leavePool();
    }

    function test_leaveAndRejoinPool_works() public {
        vm.prank(jurorPool[0]);
        court.leavePool();
        assertEq(court.poolSize(), 9);
        vm.prank(jurorPool[0]);
        court.joinPool();
        assertEq(court.poolSize(), 10);
    }

    function test_partiesExcludedFromDraw_exactPool() public {
        // Shrink the pool to 5 jurors, then add client + worker: 7 total,
        // so the only 5 eligible jurors must all be drawn.
        address[] memory remaining = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(jurorPool[i]);
            court.leavePool();
            remaining[i] = jurorPool[i + 5];
        }
        vm.prank(client);
        court.joinPool();
        vm.prank(worker);
        court.joinPool();
        assertEq(court.poolSize(), 7);

        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        assertEq(js.length, 5);
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(js[i] != client && js[i] != worker);
            bool found;
            for (uint256 k = 0; k < 5; k++) {
                if (js[i] == remaining[k]) found = true;
            }
            assertTrue(found);
        }
    }

    function test_jurorLeavesPoolMidCase_canStillVote() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        vm.prank(js[0]);
        court.leavePool(); // leaving the pool must not remove them from the case

        uint8[] memory votes = new uint8[](5);
        for (uint256 i = 0; i < 5; i++) votes[i] = 1;
        _vote(id, js, votes);
        court.finalize(id);
        assertEq(escrow.claimable(client), AMOUNT);
    }

    // ------------------------------------------------------- commit / reveal

    function test_doubleCommit_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadVote.selector);
        court.commitVote(id, keccak256(abi.encode(id, js[0], uint8(2), keccak256("other"))));
    }

    function test_zeroCommitment_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadVote.selector);
        court.commitVote(id, bytes32(0));
    }

    function test_earlyReveal_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        bytes32 salt = keccak256(abi.encode("salt", js[0]));
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.TooEarly.selector);
        court.revealVote(id, 1, salt);
    }

    function test_lateCommit_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        (uint64 commitEnd, ) = _ends(id);
        vm.warp(commitEnd + 1);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.TooLate.selector);
        court.commitVote(id, keccak256("x"));
    }

    function test_lateReveal_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        (, uint64 revealEnd) = _ends(id);
        vm.warp(revealEnd + 1);
        bytes32 salt = keccak256(abi.encode("salt", js[0]));
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.TooLate.selector);
        court.revealVote(id, 1, salt);
    }

    function test_doubleReveal_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        vm.warp(block.timestamp + 1 days + 1); // into the reveal window
        _reveal(id, js[0], 1);
        bytes32 salt = keccak256(abi.encode("salt", js[0]));
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadReveal.selector);
        court.revealVote(id, 1, salt);
    }

    function test_wrongSaltReveal_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        _commit(id, js[0], 1);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadReveal.selector);
        court.revealVote(id, 1, keccak256("wrong salt"));
    }

    function test_invalidVoteValue_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        bytes32 salt = keccak256(abi.encode("salt", js[0]));
        // Commit to vote 0, then try to reveal it: rejected before the hash check.
        vm.prank(js[0]);
        court.commitVote(id, keccak256(abi.encode(id, js[0], uint8(0), salt)));
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadVote.selector);
        court.revealVote(id, 0, salt);
        vm.prank(js[0]);
        vm.expectRevert(JuryCourt.BadVote.selector);
        court.revealVote(id, 3, salt);
    }

    // ------------------------------------------------------------- finalize

    function test_doubleFinalize_reverts() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        for (uint256 i = 0; i < 5; i++) votes[i] = 1;
        _vote(id, js, votes);
        court.finalize(id);
        vm.expectRevert(JuryCourt.WrongPhase.selector);
        court.finalize(id);
    }

    function test_splitOutcome_recordsJurorCases() public {
        // Regression test for the Milestone 6 fix: jurors who revealed in a
        // Split outcome must still get casesJudged credit.
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        votes[0] = 1;
        votes[1] = 2;
        _vote(id, js, votes);
        vm.warp(block.timestamp + 1 days + 1);
        court.finalize(id);

        assertEq(registry.getRecord(js[0]).casesJudged, 1);
        assertEq(registry.getRecord(js[0]).majorityVotes, 0);
        assertEq(registry.getRecord(js[1]).casesJudged, 1);
        assertEq(registry.getRecord(js[1]).majorityVotes, 0);
        assertEq(registry.getRecord(js[2]).casesJudged, 0);
        assertEq(registry.getRecord(js[2]).missedReveals, 1);
        assertEq(registry.getRecord(js[3]).missedReveals, 1);
        assertEq(registry.getRecord(js[4]).missedReveals, 1);
    }

    function test_tieVote_isSplit() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        votes[0] = 1;
        votes[1] = 1;
        votes[2] = 2;
        votes[3] = 2;
        // 2-2 tie with 4 reveals (quorum met, no majority) -> Split
        _vote(id, js, votes);
        vm.warp(block.timestamp + 1 days + 1);
        court.finalize(id);
        assertEq(escrow.claimable(client), AMOUNT / 2);
        assertEq(escrow.claimable(worker), AMOUNT - AMOUNT / 2);
        assertEq(court.claimable(client), FEE);
        assertEq(court.claimable(worker), FEE);
        assertEq(registry.getRecord(client).disputesSplit, 1);
    }

    // ------------------------------------------------------- dispute gating

    function test_raiseDisputeTwice_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
    }

    function test_raiseDispute_afterReviewDeadline_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
    }

    function test_raiseDispute_byNonClient_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(worker);
        vm.expectRevert(JobEscrow.NotClient.selector);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(outsider);
        vm.expectRevert(JobEscrow.NotClient.selector);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
    }

    function test_matchDispute_byNonWorker_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(client);
        vm.expectRevert(JobEscrow.NotWorker.selector);
        escrow.matchDispute{value: FEE}(id);
    }

    function test_matchDispute_wrongFee_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.matchDispute{value: FEE - 1}(id);
    }

    function test_matchDispute_afterDeadline_thenDefault() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.matchDispute{value: FEE}(id);
        // Client can still take the default judgment; worker's late match is void.
        escrow.defaultJudgment(id);
        assertEq(escrow.claimable(client), AMOUNT);
        assertEq(court.claimable(client), FEE);
    }

    function test_defaultJudgmentTwice_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.warp(block.timestamp + 2 days + 1);
        escrow.defaultJudgment(id);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.defaultJudgment(id);
    }

    function test_resolveDispute_onlyCourt() public {
        vm.prank(outsider);
        vm.expectRevert(JobEscrow.NotCourt.selector);
        escrow.resolveDispute(1, Outcome.Split);
    }

    function test_openCase_onlyEscrow() public {
        vm.prank(outsider);
        vm.expectRevert(JuryCourt.NotEscrow.selector);
        court.openCase(1, client, worker);
        vm.prank(outsider);
        vm.expectRevert(JuryCourt.NotEscrow.selector);
        court.activateCase(1);
        vm.prank(outsider);
        vm.expectRevert(JuryCourt.NotEscrow.selector);
        court.cancelCase(1);
    }

    // ------------------------------------------------------------ job edges

    function test_createJob_zeroAmount_reverts() public {
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.createJob{value: 0}(0, uint64(block.timestamp) + 7 days, keccak256("spec"));
    }

    function test_createJob_pastDeadline_reverts() public {
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp), keccak256("spec"));
    }

    function test_acceptJob_afterDeadline_reverts() public {
        vm.prank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.warp(block.timestamp + 7 days);
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.acceptJob(id);
    }

    function test_submitWork_afterDeadline_reverts() public {
        vm.prank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(worker);
        escrow.acceptJob(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.submitWork(id, keccak256("deliverable"));
    }

    function test_cancelJob_refundsAndBlocksAccept() public {
        vm.prank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(client);
        escrow.cancelJob(id);
        assertEq(escrow.claimable(client), AMOUNT);
        vm.prank(worker);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.acceptJob(id);
        vm.prank(client);
        vm.expectRevert(JobEscrow.BadState.selector);
        escrow.cancelJob(id);
    }

    function test_withdrawZero_reverts() public {
        vm.prank(outsider);
        vm.expectRevert(JobEscrow.BadInput.selector);
        escrow.withdraw();
        vm.prank(outsider);
        vm.expectRevert(JuryCourt.NothingToWithdraw.selector);
        court.withdraw();
    }

    // ------------------------------------------------------------ reentrancy

    function test_reentrancy_escrowWithdraw_paysOnce() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(address(escrow));
        agentID.grant(address(attacker));
        vm.deal(address(attacker), 1 ether);

        vm.prank(client);
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(address(attacker));
        escrow.acceptJob(id);
        vm.prank(address(attacker));
        escrow.submitWork(id, keccak256("deliverable"));
        vm.prank(client);
        escrow.approve(id);

        uint256 before = address(attacker).balance;
        vm.prank(address(attacker));
        escrow.withdraw();

        assertTrue(attacker.reentered());
        assertFalse(attacker.innerSucceeded()); // re-entrant withdraw reverted
        assertEq(address(attacker).balance, before + AMOUNT); // paid exactly once
        assertEq(escrow.claimable(address(attacker)), 0);
    }

    function test_reentrancy_courtWithdraw_paysOnce() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(address(court));
        agentID.grant(address(attacker));
        vm.deal(address(attacker), 10 ether);

        // Attacker is the client: dispute, worker never matches, fee refunded.
        vm.prank(address(attacker));
        uint256 id = escrow.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(worker);
        escrow.acceptJob(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("deliverable"));
        vm.prank(address(attacker));
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.warp(block.timestamp + 2 days + 1);
        escrow.defaultJudgment(id);

        uint256 before = address(attacker).balance;
        vm.prank(address(attacker));
        court.withdraw();

        assertTrue(attacker.reentered());
        assertFalse(attacker.innerSucceeded());
        assertEq(address(attacker).balance, before + FEE);
        assertEq(court.claimable(address(attacker)), 0);
    }

    // ------------------------------------------------- fee conservation

    function test_feeConservation_clientWins_fullWithdraw() public {
        uint256 id = _toArbitration();
        address[] memory js = court.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        for (uint256 i = 0; i < 5; i++) votes[i] = 1;
        _vote(id, js, votes);
        court.finalize(id);

        assertEq(_sumCourtClaimable(id), address(court).balance);
        assertEq(escrow.claimable(client) + escrow.claimable(worker), address(escrow).balance);

        vm.prank(client);
        escrow.withdraw();
        vm.prank(client);
        court.withdraw();
        if (court.claimable(worker) > 0) {
            vm.prank(worker);
            court.withdraw();
        }
        for (uint256 i = 0; i < 5; i++) {
            if (court.claimable(js[i]) > 0) {
                vm.prank(js[i]);
                court.withdraw();
            }
        }
        assertEq(address(court).balance, 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_oddFeeDust_goesToWinner() public {
        // Fresh stack with a 7-wei dispute fee: 7 / 3 = 2 per majority juror,
        // 1 wei of dust must land with the winner, not stay locked.
        ReputationRegistry registry2 = new ReputationRegistry();
        JobEscrow escrow2 = new JobEscrow(address(agentID), registry2, 3 days, 2 days);
        JuryCourt court2 = new JuryCourt(address(agentID), address(escrow2), registry2, 7, 1 days, 1 days, 7 days);
        escrow2.setCourt(IJuryCourt(address(court2)));
        registry2.initialize(address(escrow2), address(court2));
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(jurorPool[i]);
            court2.joinPool();
        }

        vm.prank(client);
        uint256 id = escrow2.createJob{value: AMOUNT}(AMOUNT, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(worker);
        escrow2.acceptJob(id);
        vm.prank(worker);
        escrow2.submitWork(id, keccak256("deliverable"));
        vm.prank(client);
        escrow2.raiseDispute{value: 7}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow2.matchDispute{value: 7}(id);
        vm.roll(block.number + 2);
        court2.drawJurors(id);

        address[] memory js = court2.jurorsOf(id);
        uint8[] memory votes = new uint8[](5);
        votes[0] = 2;
        votes[1] = 2;
        votes[2] = 2;
        votes[3] = 1;
        votes[4] = 1;
        for (uint256 i = 0; i < 5; i++) {
            bytes32 salt = keccak256(abi.encode("salt", js[i]));
            vm.prank(js[i]);
            court2.commitVote(id, keccak256(abi.encode(id, js[i], votes[i], salt)));
        }
        vm.warp(block.timestamp + 1 days + 1);
        for (uint256 i = 0; i < 5; i++) {
            bytes32 salt = keccak256(abi.encode("salt", js[i]));
            vm.prank(js[i]);
            court2.revealVote(id, votes[i], salt);
        }
        court2.finalize(id);

        assertEq(court2.claimable(worker), 8); // own 7 fee back + 1 dust
        assertEq(court2.claimable(js[0]), 2);
        assertEq(court2.claimable(js[1]), 2);
        assertEq(court2.claimable(js[2]), 2);
        assertEq(court2.claimable(js[3]), 0);
        assertEq(court2.claimable(js[4]), 0);
        uint256 owed = court2.claimable(client) + court2.claimable(worker);
        for (uint256 i = 0; i < 5; i++) owed += court2.claimable(js[i]);
        assertEq(owed, address(court2).balance); // nothing locked: 14 owed of 14 held
        assertEq(owed, 14);
    }

    function test_oddAmountSplit_rounding() public {
        ReputationRegistry registry2 = new ReputationRegistry();
        JobEscrow escrow2 = new JobEscrow(address(agentID), registry2, 3 days, 2 days);
        JuryCourt court2 = new JuryCourt(address(agentID), address(escrow2), registry2, FEE, 1 days, 1 days, 7 days);
        escrow2.setCourt(IJuryCourt(address(court2)));
        registry2.initialize(address(escrow2), address(court2));
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(jurorPool[i]);
            court2.joinPool();
        }

        vm.prank(client);
        uint256 id = escrow2.createJob{value: 7}(7, uint64(block.timestamp) + 7 days, keccak256("spec"));
        vm.prank(worker);
        escrow2.acceptJob(id);
        vm.prank(worker);
        escrow2.submitWork(id, keccak256("deliverable"));
        vm.prank(client);
        escrow2.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow2.matchDispute{value: FEE}(id);
        vm.roll(block.number + 2);
        court2.drawJurors(id);

        address[] memory js = court2.jurorsOf(id);
        bytes32 salt0 = keccak256(abi.encode("salt", js[0]));
        bytes32 salt1 = keccak256(abi.encode("salt", js[1]));
        vm.prank(js[0]);
        court2.commitVote(id, keccak256(abi.encode(id, js[0], uint8(1), salt0)));
        vm.prank(js[1]);
        court2.commitVote(id, keccak256(abi.encode(id, js[1], uint8(2), salt1)));
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(js[0]);
        court2.revealVote(id, 1, salt0);
        vm.prank(js[1]);
        court2.revealVote(id, 2, salt1);
        vm.warp(block.timestamp + 1 days + 1);
        court2.finalize(id);

        // 7 wei split: client 3, worker 4 — no wei lost or created.
        assertEq(escrow2.claimable(client), 3);
        assertEq(escrow2.claimable(worker), 4);
        assertEq(escrow2.claimable(client) + escrow2.claimable(worker), 7);
    }

    // ------------------------------------------------------------ draw

    function test_drawRestart_afterStaleBlockhash() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);

        // Jump past the 256-block blockhash window: the draw must restart
        // from a fresh block instead of reverting or using a zero seed.
        vm.roll(block.number + 300);
        vm.expectEmit(true, false, false, true, address(court));
        emit JuryCourt.DrawRestarted(id, uint64(block.number + 1));
        court.drawJurors(id);

        (,,, , uint64 drawBlock,,,,,) = court.cases(id);
        assertEq(drawBlock, uint64(block.number + 1));
        assertEq(court.jurorsOf(id).length, 0); // still awaiting draw

        vm.roll(block.number + 2);
        court.drawJurors(id);
        assertEq(court.jurorsOf(id).length, 5);
    }

    function test_drawTooEarly_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);
        vm.expectRevert(JuryCourt.TooEarly.selector);
        court.drawJurors(id); // drawBlock is block.number + 1, not yet passed
    }

    function test_abortStaleCase_beforeTimeout_reverts() public {
        uint256 id = _createAcceptSubmit();
        vm.prank(client);
        escrow.raiseDispute{value: FEE}(id, keccak256("evidence"));
        vm.prank(worker);
        escrow.matchDispute{value: FEE}(id);
        vm.expectRevert(JuryCourt.TooEarly.selector);
        court.abortStaleCase(id);
    }

    // ------------------------------------------------- Milestone 6 fixes

    function test_directBnbToCourt_reverts() public {
        // Regression test: receive() only accepts BNB from the escrow, so a
        // mistaken direct transfer cannot lock funds in the court forever.
        vm.prank(outsider);
        (bool ok,) = address(court).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(court).balance, 0);
    }

    function test_setCourt_zeroAddress_reverts() public {
        JobEscrow fresh = new JobEscrow(address(agentID), registry, 3 days, 2 days);
        vm.expectRevert(JobEscrow.BadInput.selector);
        fresh.setCourt(IJuryCourt(address(0)));
    }
}
