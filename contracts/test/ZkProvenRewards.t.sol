// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZkProvenRewards, ZkProvenToken, IVerifyProofAggregation} from "../src/ZkProvenRewards.sol";

/// Stands in for zkVerify's aggregation contract: a leaf is "verified" once the
/// test publishes it under (domainId, aggregationId).
contract MockAggregation is IVerifyProofAggregation {
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) public published;

    function publish(uint256 domainId, uint256 aggregationId, bytes32 leaf) external {
        published[domainId][aggregationId][leaf] = true;
    }

    function verifyProofAggregation(uint256 d, uint256 a, bytes32 leaf, bytes32[] calldata, uint256, uint256)
        external
        view
        returns (bool)
    {
        return published[d][a][leaf];
    }
}

contract ZkProvenRewardsTest is Test {
    bytes32 constant VK = 0x8af695657075b7546405f8afd2d72986f8c3d97143aa9d0127e1c674494b679f;
    uint256 constant KEY_COMMITMENT = 18360246782440852246325871050199419319593607117014465374689068033622809689613;
    uint256 constant DOMAIN = 2;
    uint256 constant AGG = 77;

    MockAggregation agg;
    ZkProvenRewards rewards;
    ZkProvenToken token;
    bytes32[] path;

    function setUp() public {
        agg = new MockAggregation();
        rewards = new ZkProvenRewards(address(agg), VK);
        token = rewards.token();
        rewards.setCourse(1, KEY_COMMITMENT, 7, 100 ether, true, "What Agents Can Do with ZK");
    }

    function pubsFor(address holder, uint256 attemptId) internal pure returns (uint256[6] memory p) {
        p = [uint256(1), KEY_COMMITMENT, 123456789, 7, attemptId, uint256(uint160(holder))];
    }

    function verified(uint256[6] memory p) internal returns (uint256[6] memory) {
        agg.publish(DOMAIN, AGG, rewards.statementHash(p));
        return p;
    }

    function test_statementHashMatchesOffchainLeaf() public view {
        uint256[6] memory p = [
            uint256(1),
            KEY_COMMITMENT,
            123456789,
            7,
            987654321,
            1096126254017519566419577023049838005413224891683
        ];
        // Same vector computed by src/leaf.js (groth16Leaf).
        assertEq(rewards.statementHash(p), 0xccd38dbf8f357006e8035e193488e27a74e5f05bc175e20b1c6797d538e39444);
    }

    function test_claimMintsCredentialAndReward() public {
        address alice = makeAddr("alice");
        uint256 id = rewards.claim(verified(pubsFor(alice, 1)), DOMAIN, AGG, path, 1, 0);
        assertEq(rewards.ownerOf(id), alice);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(rewards.credentialOf(1, alice), id);
        assertTrue(bytes(rewards.tokenURI(id)).length > 40);
    }

    function test_relayerClaimStillPaysTheLearner() public {
        address alice = makeAddr("alice");
        vm.prank(makeAddr("relayer"));
        uint256 id = rewards.claim(verified(pubsFor(alice, 2)), DOMAIN, AGG, path, 1, 0);
        assertEq(rewards.ownerOf(id), alice);
        assertEq(token.balanceOf(makeAddr("relayer")), 0);
    }

    function test_unverifiedOrRedirectedClaimReverts() public {
        address alice = makeAddr("alice");
        verified(pubsFor(alice, 3));
        // Same certificate, recipient swapped to the attacker: the leaf no longer matches.
        vm.expectRevert(ZkProvenRewards.NotVerifiedOnZkVerify.selector);
        rewards.claim(pubsFor(makeAddr("mallory"), 3), DOMAIN, AGG, path, 1, 0);
        // Wrong aggregation id.
        vm.expectRevert(ZkProvenRewards.NotVerifiedOnZkVerify.selector);
        rewards.claim(pubsFor(alice, 3), DOMAIN, AGG + 1, path, 1, 0);
    }

    function test_wrongCourseDataReverts() public {
        uint256[6] memory p = pubsFor(makeAddr("alice"), 4);
        p[1] = KEY_COMMITMENT + 1;
        verified(p);
        vm.expectRevert(ZkProvenRewards.WrongAnswerKey.selector);
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);

        p = pubsFor(makeAddr("alice"), 4);
        p[3] = 3; // an easier pass mark than the course's
        verified(p);
        vm.expectRevert(ZkProvenRewards.WrongPassMark.selector);
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);

        p = pubsFor(makeAddr("alice"), 4);
        p[0] = 2;
        verified(p);
        vm.expectRevert(ZkProvenRewards.CourseInactive.selector);
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);
    }

    function test_noDoubleClaims() public {
        address alice = makeAddr("alice");
        uint256[6] memory p = verified(pubsFor(alice, 5));
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);
        vm.expectRevert(ZkProvenRewards.AlreadyCertified.selector);
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);
        uint256[6] memory second = verified(pubsFor(alice, 6));
        vm.expectRevert(ZkProvenRewards.AlreadyCertified.selector);
        rewards.claim(second, DOMAIN, AGG, path, 1, 0);
    }

    function test_credentialIsSoulbound() public {
        address alice = makeAddr("alice");
        uint256 id = rewards.claim(verified(pubsFor(alice, 7)), DOMAIN, AGG, path, 1, 0);
        vm.prank(alice);
        vm.expectRevert(ZkProvenRewards.Soulbound.selector);
        rewards.transferFrom(alice, makeAddr("bob"), id);
    }

    function test_recipientOutsideAddressRangeReverts() public {
        uint256[6] memory p = pubsFor(address(1), 8);
        p[5] = uint256(type(uint160).max) + 1;
        verified(p);
        vm.expectRevert(ZkProvenRewards.BadRecipient.selector);
        rewards.claim(p, DOMAIN, AGG, path, 1, 0);
    }

    function test_onlyOwnerSetsCourses() public {
        vm.prank(makeAddr("mallory"));
        vm.expectRevert();
        rewards.setCourse(1, 1, 0, 1e30, true, "free money");
    }
}
