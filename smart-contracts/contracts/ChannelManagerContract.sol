pragma solidity ^0.4.11;

import "./Token.sol";
import "./Utils.sol";
import "./ChannelManagerLibrary.sol";

// for each token a manager will be deployed, to reduce gas usage for manager
// deployment the logic is moved into a library and this contract will work
// only as a proxy/state container.
contract ChannelManagerContract is Utils {
    string constant public contract_version = "0.2._";
    uint256 constant public fee = 50;

    address public owner;

    using ChannelManagerLibrary for ChannelManagerLibrary.Data;
    ChannelManagerLibrary.Data data;

    event ChannelNew(
        address netting_channel,
        address participant1,
        address participant2,
        uint settle_timeout
    );

    event ChannelDeleted(
        address caller_address,
        address partner
    );

    event FeesCollected(
        uint256 block,
        uint256 balance
    );

    event OwnershipTransferred(
        address indexed previousOwner, 
        address indexed newOwner
    );
    
    //OpenZeppelin implementation 
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function ChannelManagerContract(address gotoken, address token_address) public {
        owner = msg.sender;
        data.goToken = Token(gotoken);
        data.token = Token(token_address);
    }

    function collectFees() public {
        uint256 balance = data.goToken.balanceOf(this);
        bool success = data.goToken.transfer(owner,balance);
        require(success == true);
        emit FeesCollected(block.number,balance);
    }

    /// @notice Create a new payment channel between two parties
    /// @param partner The address of the partner
    /// @param settle_timeout The settle timeout in blocks
    /// @return The address of the newly created NettingChannelContract.
    function newChannel(address partner, uint settle_timeout)
        public
        returns (address)
    {
        //the user has to set allowance for our channel manager.  
        //maybe we can create a delegateCall extension 
        require(data.goToken.allowance(msg.sender,this) >= fee );
        
        address old_channel = getChannelWith(partner);
        if (old_channel != 0) {
            emit ChannelDeleted(msg.sender, partner);
        }

        address new_channel = data.newChannel(partner, settle_timeout);
        bool success = data.goToken.transferFrom(msg.sender, new_channel, fee );
        require(success == true);    
        emit ChannelNew(new_channel, msg.sender, partner, settle_timeout);
        return new_channel;
        
    }

    /// @notice Get all channels
    /// @return All the open channels
    function getChannelsAddresses() public constant returns (address[]) {
        return data.all_channels;
    }

    /// @notice Get the address of the channel token
    /// @return The token
    function tokenAddress() public constant returns (address) {
        return data.token;
    }

    /// @notice Get the address of channel with a partner
    /// @param partner The address of the partner
    /// @return The address of the channel
    function getChannelWith(address partner) public constant returns (address) {
        return data.getChannelWith(partner);
    }

    /// @notice Get all channels that an address participates in.
    /// @param node_address The address of the node
    /// @return The channel's addresses that node_address participates in.
    function nettingContractsByAddress(address node_address)
        public
        constant
        returns (address[])
    {
        return data.nodeaddress_to_channeladdresses[node_address];
    }

    /// @notice Get all participants of all channels
    /// @return All participants in all channels
    function getChannelsParticipants() public constant returns (address[])
    {
        uint i;
        uint pos;
        address[] memory result;
        NettingChannelContract channel;

        uint open_channels_num = 0;
        for (i = 0; i < data.all_channels.length; i++) {
            if (contractExists(data.all_channels[i])) {
                open_channels_num += 1;
            }
        }
        result = new address[](open_channels_num * 2);

        pos = 0;
        for (i = 0; i < data.all_channels.length; i++) {
            if (!contractExists(data.all_channels[i])) {
                continue;
            }
            channel = NettingChannelContract(data.all_channels[i]);

            var (address1, , address2, ) = channel.addressAndBalance();

            result[pos] = address1;
            pos += 1;
            result[pos] = address2;
            pos += 1;
        }

        return result;
    }

    function () public { revert(); }
}
