// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ZkProvenRewards} from "../src/ZkProvenRewards.sol";

/// forge script script/Deploy.s.sol --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY --broadcast
/// env: ZKVERIFY_AGGREGATION, EXAM_VK_HASH, COURSE_KEY_COMMITMENT
contract Deploy is Script {
    function run() external {
        address aggregation = vm.envAddress("ZKVERIFY_AGGREGATION");
        bytes32 vkHash = vm.envBytes32("EXAM_VK_HASH");
        uint256 keyCommitment = vm.envUint("COURSE_KEY_COMMITMENT");

        vm.startBroadcast();
        ZkProvenRewards rewards = new ZkProvenRewards(aggregation, vkHash);
        rewards.setCourse(1, keyCommitment, 7, 100 ether, true, "What Agents Can Do with ZK");
        vm.stopBroadcast();

        console.log("ZkProvenRewards:", address(rewards));
        console.log("ZkProvenToken:  ", address(rewards.token()));
    }
}
