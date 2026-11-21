// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockAgentID} from "../src/MockAgentID.sol";

/// @notice Tests for the TESTNET-ONLY MockAgentID (see src/MockAgentID.sol).
/// @dev The mock must behave like the real Agent ID where the protocol
///      depends on it: ERC-721, one non-transferable token per wallet.
contract MockAgentIDTest is Test {
    MockAgentID mock;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        mock = new MockAgentID();
    }

    function test_mintGivesOneToken() public {
        uint256 id = mock.mint(alice);
        assertEq(id, 1);
        assertEq(mock.balanceOf(alice), 1);
        assertEq(mock.ownerOf(1), alice);
    }

    function test_tokenIdsIncrement() public {
        assertEq(mock.mint(alice), 1);
        assertEq(mock.mint(bob), 2);
    }

    function test_onePerWallet() public {
        mock.mint(alice);
        vm.expectRevert(abi.encodeWithSelector(MockAgentID.AlreadyHasToken.selector, alice));
        mock.mint(alice);
    }

    function test_openMintAnyoneCanCall() public {
        vm.prank(bob);
        mock.mint(alice);
        assertEq(mock.balanceOf(alice), 1);
    }

    function test_transferReverts() public {
        mock.mint(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockAgentID.NonTransferable.selector));
        mock.transferFrom(alice, bob, 1);
    }

    function test_safeTransferReverts() public {
        mock.mint(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockAgentID.NonTransferable.selector));
        mock.safeTransferFrom(alice, bob, 1);
    }

    function test_approveReverts() public {
        mock.mint(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockAgentID.NonTransferable.selector));
        mock.approve(bob, 1);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockAgentID.NonTransferable.selector));
        mock.setApprovalForAll(bob, true);
    }

    function test_noBalanceMeansNoAgentID() public {
        assertEq(mock.balanceOf(alice), 0);
    }

    function test_mintToZeroAddressReverts() public {
        vm.expectRevert();
        mock.mint(address(0));
    }
}
