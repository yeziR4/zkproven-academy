// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// zkVerify's aggregation contract, deployed on each supported chain.
interface IVerifyProofAggregation {
    function verifyProofAggregation(
        uint256 _domainId,
        uint256 _aggregationId,
        bytes32 _leaf,
        bytes32[] calldata _merklePath,
        uint256 _leafCount,
        uint256 _index
    ) external view returns (bool);
}

/// Learning reward token, minted only by the rewards contract.
contract ZkProvenToken is ERC20, Ownable {
    constructor(address minter) ERC20("zkProven Learning Token", "ZKPL") Ownable(minter) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/// @title zkProven Academy rewards
/// @notice Turns an exam certificate verified on zkVerify into a soulbound
///         credential plus a token reward, without trusting the academy server:
///         the claim rebuilds the zkVerify statement from the certificate's
///         public signals, so only a genuinely verified pass for a registered
///         course and answer key can mint, and only to the address inside the proof.
contract ZkProvenRewards is ERC721, Ownable {
    // Public signal order in the exam circuit.
    uint256 private constant COURSE_ID = 0;
    uint256 private constant KEY_COMMITMENT = 1;
    uint256 private constant ANSWERS_COMMITMENT = 2;
    uint256 private constant PASS_MARK = 3;
    uint256 private constant ATTEMPT_ID = 4;
    uint256 private constant RECIPIENT = 5;

    // Statement hash constants, as in zkVerify's ZkVerifyGroth16 reference contract.
    bytes32 public constant PROVING_SYSTEM_ID = keccak256(abi.encodePacked("groth16"));
    bytes32 public constant NO_VERSION_HASH = sha256(abi.encodePacked(""));

    IVerifyProofAggregation public immutable zkVerify;
    ZkProvenToken public immutable token;
    /// Kurier/zkVerify hash of the exam circuit's verification key.
    bytes32 public immutable examVkHash;

    struct Course {
        uint256 keyCommitment;
        uint256 passMark;
        uint256 reward;
        bool active;
        string title;
    }

    struct Credential {
        uint256 courseId;
        uint256 answersCommitment;
        uint256 aggregationId;
        uint64 issuedAt;
    }

    mapping(uint256 courseId => Course) public courses;
    mapping(uint256 courseId => mapping(address holder => uint256 tokenId)) public credentialOf;
    mapping(uint256 attemptId => bool) public attemptClaimed;
    mapping(uint256 tokenId => Credential) public credentials;
    uint256 public nextTokenId = 1;

    event CourseSet(uint256 indexed courseId, uint256 keyCommitment, uint256 passMark, uint256 reward, bool active);
    event Certified(uint256 indexed courseId, address indexed holder, uint256 indexed tokenId, uint256 aggregationId, uint256 reward);

    error CourseInactive();
    error WrongAnswerKey();
    error WrongPassMark();
    error BadRecipient();
    error AlreadyCertified();
    error AttemptAlreadyClaimed();
    error NotVerifiedOnZkVerify();
    error Soulbound();

    constructor(address zkVerifyAggregation, bytes32 vkHash) ERC721("zkProven Credential", "ZKPC") Ownable(msg.sender) {
        zkVerify = IVerifyProofAggregation(zkVerifyAggregation);
        examVkHash = vkHash;
        token = new ZkProvenToken(address(this));
    }

    function setCourse(uint256 courseId, uint256 keyCommitment, uint256 passMark, uint256 reward, bool active, string calldata title)
        external
        onlyOwner
    {
        courses[courseId] = Course(keyCommitment, passMark, reward, active, title);
        emit CourseSet(courseId, keyCommitment, passMark, reward, active);
    }

    /// @notice Anyone may submit (the learner or a relayer); the credential always goes to the proof's recipient.
    function claim(
        uint256[6] calldata pubs,
        uint256 domainId,
        uint256 aggregationId,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) external returns (uint256 tokenId) {
        uint256 courseId = pubs[COURSE_ID];
        Course storage course = courses[courseId];
        if (!course.active) revert CourseInactive();
        if (pubs[KEY_COMMITMENT] != course.keyCommitment) revert WrongAnswerKey();
        if (pubs[PASS_MARK] != course.passMark) revert WrongPassMark();
        if (pubs[RECIPIENT] == 0 || pubs[RECIPIENT] > type(uint160).max) revert BadRecipient();
        address holder = address(uint160(pubs[RECIPIENT]));
        if (credentialOf[courseId][holder] != 0) revert AlreadyCertified();
        if (attemptClaimed[pubs[ATTEMPT_ID]]) revert AttemptAlreadyClaimed();

        bytes32 leaf = statementHash(pubs);
        if (!zkVerify.verifyProofAggregation(domainId, aggregationId, leaf, merklePath, leafCount, index)) {
            revert NotVerifiedOnZkVerify();
        }

        attemptClaimed[pubs[ATTEMPT_ID]] = true;
        tokenId = nextTokenId++;
        credentialOf[courseId][holder] = tokenId;
        credentials[tokenId] = Credential(courseId, pubs[ANSWERS_COMMITMENT], aggregationId, uint64(block.timestamp));
        _mint(holder, tokenId);
        if (course.reward > 0) token.mint(holder, course.reward);
        emit Certified(courseId, holder, tokenId, aggregationId, course.reward);
    }

    /// @notice The zkVerify leaf for this circuit's public signals (little-endian scalars).
    function statementHash(uint256[6] calldata pubs) public view returns (bytes32) {
        bytes memory encoded;
        for (uint256 i = 0; i < 6; i++) {
            encoded = abi.encodePacked(encoded, _changeEndianess(pubs[i]));
        }
        return keccak256(abi.encodePacked(PROVING_SYSTEM_ID, examVkHash, NO_VERSION_HASH, keccak256(encoded)));
    }

    /// Credentials are soulbound: mint only, never transfer.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Credential memory c = credentials[tokenId];
        string memory json = string.concat(
            '{"name":"zkProven: ',
            courses[c.courseId].title,
            '","description":"Exam passed at zkProven Academy. Proven with a Groth16 proof verified on zkVerify; answers and answer key stay private.",',
            '"attributes":[{"trait_type":"Course ID","value":"',
            Strings.toString(c.courseId),
            '"},{"trait_type":"zkVerify aggregation","value":"',
            Strings.toString(c.aggregationId),
            '"},{"trait_type":"Answers commitment","value":"',
            Strings.toHexString(c.answersCommitment, 32),
            '"},{"display_type":"date","trait_type":"Issued","value":',
            Strings.toString(c.issuedAt),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _changeEndianess(uint256 input) internal pure returns (bytes32 out) {
        out = bytes32(input);
        out = ((out & 0xff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00) >> 8)
            | ((out & 0x00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff) << 8);
        out = ((out & 0xffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000) >> 16)
            | ((out & 0x0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff) << 16);
        out = ((out & 0xffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000) >> 32)
            | ((out & 0x00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff) << 32);
        out = ((out & 0xffffffffffffffff0000000000000000ffffffffffffffff0000000000000000) >> 64)
            | ((out & 0x0000000000000000ffffffffffffffff0000000000000000ffffffffffffffff) << 64);
        out = (out >> 128) | (out << 128);
    }
}
