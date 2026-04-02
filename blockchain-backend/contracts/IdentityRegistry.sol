// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IdentityRegistry {
    address public owner;
    mapping(bytes32 => bool) private authorizedHashes;

    event IdentityAuthorized(bytes32 indexed identityHash, address indexed authorizedBy);
    event IdentityRevoked(bytes32 indexed identityHash, address indexed revokedBy);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function authorizeHash(bytes32 identityHash) external onlyOwner {
        authorizedHashes[identityHash] = true;
        emit IdentityAuthorized(identityHash, msg.sender);
    }

    function revokeHash(bytes32 identityHash) external onlyOwner {
        authorizedHashes[identityHash] = false;
        emit IdentityRevoked(identityHash, msg.sender);
    }

    function isAuthorized(bytes32 identityHash) external view returns (bool) {
        return authorizedHashes[identityHash];
    }
}
