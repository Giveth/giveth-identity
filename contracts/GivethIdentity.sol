pragma solidity ^0.4.21;

import "giveth-common-contracts/contracts/ERC20.sol";
import "minimetoken/contracts/MiniMeToken.sol";

/// @title GivethIdentity
/// @author RJ Ewing<perissology@protonmail.com>
/// @notice The GivethIdentity contract is a simple contract for managing
///  multiple keys and permissions for an identity.
///  There are 2 permission levels. ManagementKeys and ActionKeys.
///  Management keys have full authority over the identity, the blacklist is not enforced,
///  they can add/remove keys, and modify the action blacklist. ///  Action keys are only allowed to execute transactions as this identity that are not
///  blacklisted.
contract GivethIdentity {

    mapping(address => bool) public managementKeys;
    mapping(address => bool) public actionKeys;
    uint public numManagementKeys;

    // mapping of transaction signatures that are blacklisted for actionKeys
    // 0 is a special case and represents value transfers
    mapping(bytes4 => bool) public actionBlacklist;

    event ManagerAdded(address key);
    event ManagerRemoved(address key);
    event ActionKeyAdded(address key);
    event ActionKeyRemoved(address key);
    event ActionBlacklistUpdated(bytes4 sig, bool blacklisted);

    /// @param managementKey required. Key used to manage this identity
    /// @param actionKey optional. Key used to execute actions as this identity
    /// @param blacklist optional. List of function signatures too add to the
    ///                    actionBlacklist.
    function GivethIdentity(
        address managementKey,
        address actionKey,
        bytes4[] blacklist 
    ) public {
        require(managementKey != 0);
        managementKeys[managementKey] = true;
        numManagementKeys++;

        if (actionKey != 0) actionKeys[actionKey] = true;

        // by default, we blacklist any value transfer
        // and ERC20 token transfer, transferFrom & approve functions
        // as well as MiniMe approveAndCall
        _blacklistSignature(0x0, true);
        // TODO fix this
        // bytes4 transferSig = ERC20(0).transfer.selector;
        bytes4 transferSig = 0xa9059cbb;
        _blacklistSignature(transferSig, true);
        bytes4 transferFromSig = ERC20(0).transferFrom.selector;
        _blacklistSignature(transferFromSig, true);
        bytes4 approveSig = ERC20(0).approve.selector;
        _blacklistSignature(approveSig, true);
        bytes4 approveAndCallSig = MiniMeToken(0).approveAndCall.selector;
        _blacklistSignature(approveAndCallSig, true);

        for (uint i = 0; i < blacklist.length; i++) {
            _blacklistSignature(blacklist[i], true);
        }
    }

    modifier onlyManager {
        require(managementKeys[msg.sender] == true);
        _;
    }

    function sendTransaction(address destination, uint value, bytes data) external {
        require(destination != address(this));

        if (managementKeys[msg.sender]) {
            require(destination.call.value(value)(data));
            return;
        } else if (actionKeys[msg.sender]) {
            // if we have value, check to see if action keys are permitted to send value
            if (value > 0) require(!actionBlacklist[0x0]);

            bytes memory d = data;
            bytes4 sig;// = bytes4(data);
            // TODO can we do this w/o assembly? If not, move to calldataload or calldatacopy
            assembly {
                sig := mload(add(d, 0x20)) // first 32 bytes is the length
            }
            require(!actionBlacklist[sig]);
            
            if (value > 0) require(destination.call.value(value)(data));
            else require(destination.call(data));
            return;
        }

        revert();
    }

    /// @dev add or remove a signature from the actionKeys blacklist
    function blacklistSignature(bytes4 sig, bool isBlacklisted) public onlyManager {
        _blacklistSignature(sig, isBlacklisted);
    }

    function addManagementKey(address key) external onlyManager {
        managementKeys[key] = true;
        numManagementKeys++;
        emit ManagerAdded(key);
    }

    function removeManagementKey(address key) external onlyManager {
        require(numManagementKeys > 1);

        managementKeys[key] = false;
        numManagementKeys--;

        emit ManagerRemoved(key);
    }

    function addActionKey(address key) external onlyManager {
        actionKeys[key] = true;
        emit ActionKeyAdded(key);
    }

    function removeActionKey(address key) external onlyManager {
        actionKeys[key] = false;
        emit ActionKeyRemoved(key);
    }

    // allow the contract to receive eth
    function () external payable {}

    function _blacklistSignature(bytes4 sig, bool isBlacklisted) internal {
        actionBlacklist[sig] = isBlacklisted;
        emit ActionBlacklistUpdated(sig, isBlacklisted);
    }
}
