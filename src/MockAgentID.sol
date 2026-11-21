// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockAgentID
/// @notice TESTNET-ONLY stand-in for the real Binance Agent ID contract.
/// @dev The real Agent ID (0x60b9262456de011f7d15a54cdd8c48baaa8b022f) exists
///      ONLY on BNB Chain mainnet — there is no testnet deployment, so no
///      testnet wallet can hold one and every Agent ID-gated function in
///      Agent Jury would revert on testnet. This mock lets the testnet demo
///      run the full lifecycle with a juror pool. It mirrors the real
///      contract's relevant behaviour exactly where the protocol depends on
///      it: ERC-721, one non-transferable token per wallet, `balanceOf > 0`
///      means "holds an Agent ID" (see `AgentIDGate`).
///
///      APPROVED by the user on 2026-11-21 for the testnet demo ONLY.
///      NEVER deploy this to mainnet, and NEVER point a mainnet deployment
///      at it: `script/Deploy.s.sol` defaults AGENT_ID to the real mainnet
///      address, and a testnet run must pass AGENT_ID=<mock address>
///      explicitly. The mock proves mechanics only — the Innovation Award's
///      >= 30 REAL Agent ID interactions still need mainnet.
contract MockAgentID is ERC721 {
    error AlreadyHasToken(address account);
    error NonTransferable();

    uint256 private _nextTokenId = 1;

    constructor() ERC721("Mock Agent ID", "MOCKID") {}

    /// @notice Mint one mock Agent ID to `to`. Open mint (anyone can call);
    ///         one token per wallet, matching the real Agent ID.
    function mint(address to) external returns (uint256 tokenId) {
        if (balanceOf(to) != 0) revert AlreadyHasToken(to);
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
    }

    /// @dev Soulbound: only minting (from == address(0)) is allowed.
    ///      Transfers and burns revert, exactly like the real Agent ID.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }

    /// @dev Approvals are meaningless on a soulbound token; block them so
    ///      no one can be tricked into approving a transfer that can never
    ///      execute.
    function approve(address, uint256) public pure override {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }
}
