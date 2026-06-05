// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title StakingNFT
 * @notice A staking contract where positions are represented as NFTs.
 * Stakers earn 20% yield every 5 days.
 */
contract StakingNFT is ERC721, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 claimedRewards;
        bool redeemed;
    }

    // Token ID tracker
    uint256 public nextTokenId = 1;

    // Lock period: 1 Day
    uint256 public constant LOCK_PERIOD = 1 days;

    // Yield rate basis: 20% every 5 days
    uint256 public constant REWARD_PERIOD = 5 days;

    // Stake metadata mapping
    mapping(uint256 => Stake) public stakes;

    // Treasury tracking variables
    uint256 public totalStaked;
    uint256 public totalRewardsPaid;
    uint256 public totalPenaltiesCollected;

    // Emergency withdrawal mode
    bool public emergencyMode = false;

    // Events
    event StakeCreated(uint256 indexed tokenId, address indexed owner, uint256 amount, uint256 startTime);
    event RewardClaimed(uint256 indexed tokenId, address indexed owner, uint256 rewardAmount);
    event StakeWithdrawn(uint256 indexed tokenId, address indexed owner, uint256 principalAmount, uint256 rewardAmount, bool penaltyApplied);
    event PenaltyApplied(uint256 indexed tokenId, address indexed owner, uint256 penaltyAmount);
    event EmergencyModeSet(bool active);

    struct StakeInfo {
        uint256 tokenId;
        uint256 amount;
        uint256 startTime;
        uint256 claimedRewards;
        uint256 pendingReward;
        bool redeemed;
    }

    constructor(address initialOwner) ERC721("Staking Position NFT", "STK-NFT") Ownable(initialOwner) {}

    /**
     * @notice Deposit native ETH into the staking pool.
     * Mints an NFT position representing the stake.
     */
    function stake() external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value > 0, "Cannot stake 0 ETH");

        uint256 tokenId = nextTokenId;
        nextTokenId++;

        stakes[tokenId] = Stake({
            amount: msg.value,
            startTime: block.timestamp,
            claimedRewards: 0,
            redeemed: false
        });

        totalStaked += msg.value;

        _safeMint(msg.sender, tokenId);

        emit StakeCreated(tokenId, msg.sender, msg.value, block.timestamp);

        return tokenId;
    }

    /**
     * @notice Claim accumulated rewards without withdrawing principal.
     */
    function claimReward(uint256 tokenId) external whenNotPaused nonReentrant {
        require(_ownerOf(tokenId) == msg.sender, "Not the owner of this position");
        Stake storage s = stakes[tokenId];
        require(!s.redeemed, "Stake already redeemed");

        uint256 reward = calculateReward(tokenId);
        require(reward > 0, "No rewards to claim");

        s.claimedRewards += reward;
        totalRewardsPaid += reward;

        (bool success, ) = msg.sender.call{value: reward}("");
        require(success, "ETH transfer failed");

        emit RewardClaimed(tokenId, msg.sender, reward);
    }

    /**
     * @notice Unstake: Withdraw principal and accumulated rewards.
     * Deducts a 5% penalty on principal if withdrawn within the 1-day lock period.
     */
    function unstake(uint256 tokenId) external whenNotPaused nonReentrant {
        require(_ownerOf(tokenId) == msg.sender, "Not the owner of this position");
        Stake storage s = stakes[tokenId];
        require(!s.redeemed, "Stake already redeemed");

        uint256 principal = s.amount;
        uint256 reward = calculateReward(tokenId);
        uint256 payout = principal + reward;
        bool penaltyApplied = false;
        uint256 penaltyAmount = 0;

        if (block.timestamp < s.startTime + LOCK_PERIOD) {
            penaltyAmount = (principal * 5) / 100;
            payout = (principal - penaltyAmount) + reward;
            penaltyApplied = true;
            totalPenaltiesCollected += penaltyAmount;
            emit PenaltyApplied(tokenId, msg.sender, penaltyAmount);
        }

        s.redeemed = true;
        totalStaked -= principal;
        totalRewardsPaid += reward;

        _burn(tokenId);

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "ETH transfer failed");

        emit StakeWithdrawn(tokenId, msg.sender, principal, reward, penaltyApplied);
    }

    /**
     * @notice Withdraw principal immediately in emergency mode.
     * No rewards are paid. No lock period penalty applies.
     */
    function emergencyWithdraw(uint256 tokenId) external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        require(_ownerOf(tokenId) == msg.sender, "Not the owner of this position");
        Stake storage s = stakes[tokenId];
        require(!s.redeemed, "Stake already redeemed");

        uint256 principal = s.amount;

        s.redeemed = true;
        totalStaked -= principal;

        _burn(tokenId);

        (bool success, ) = msg.sender.call{value: principal}("");
        require(success, "ETH transfer failed");

        emit StakeWithdrawn(tokenId, msg.sender, principal, 0, false);
    }

    /**
     * @notice Calculate accumulated rewards on-chain.
     * Formula: reward = (amount * duration) / (5 * 5 days) - claimedRewards
     * Yield is 20% (amount / 5) every 5 days.
     */
    function calculateReward(uint256 tokenId) public view returns (uint256) {
        Stake memory s = stakes[tokenId];
        if (s.redeemed || s.amount == 0) {
            return 0;
        }

        uint256 duration = block.timestamp - s.startTime;
        uint256 totalAccumulated = (s.amount * duration) / (5 * REWARD_PERIOD);

        if (totalAccumulated > s.claimedRewards) {
            return totalAccumulated - s.claimedRewards;
        }
        return 0;
    }

    /**
     * @notice Get all active staking positions owned by an address.
     */
    function getStakeDetailsOfOwner(address owner) external view returns (StakeInfo[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextTokenId; i++) {
            if (_ownerOf(i) == owner && !stakes[i].redeemed) {
                count++;
            }
        }

        StakeInfo[] memory ownedStakes = new StakeInfo[](count);
        uint256 index = 0;
        for (uint256 i = 1; i < nextTokenId; i++) {
            if (_ownerOf(i) == owner && !stakes[i].redeemed) {
                ownedStakes[index] = StakeInfo({
                    tokenId: i,
                    amount: stakes[i].amount,
                    startTime: stakes[i].startTime,
                    claimedRewards: stakes[i].claimedRewards,
                    pendingReward: calculateReward(i),
                    redeemed: stakes[i].redeemed
                });
                index++;
            }
        }
        return ownedStakes;
    }

    /**
     * @notice Format Wei as Ether string with up to 4 decimal places.
     */
    function formatEther(uint256 amount) public pure returns (string memory) {
        uint256 ethVal = amount / 10**18;
        uint256 fracVal = (amount % 10**18) / 10**14; // 4 decimals

        if (fracVal == 0) {
            return string(abi.encodePacked(ethVal.toString(), ".0"));
        }

        string memory fracStr = fracVal.toString();
        uint256 fracLen = bytes(fracStr).length;
        if (fracLen < 4) {
            string memory zeros = "";
            for (uint256 i = 0; i < 4 - fracLen; i++) {
                zeros = string(abi.encodePacked("0", zeros));
            }
            fracStr = string(abi.encodePacked(zeros, fracStr));
        }

        bytes memory fracBytes = bytes(fracStr);
        uint256 lastNonZero = fracBytes.length;
        while (lastNonZero > 0 && fracBytes[lastNonZero - 1] == '0') {
            lastNonZero--;
        }

        if (lastNonZero == 0) {
            return string(abi.encodePacked(ethVal.toString(), ".0"));
        }

        bytes memory trimmed = new bytes(lastNonZero);
        for (uint256 i = 0; i < lastNonZero; i++) {
            trimmed[i] = fracBytes[i];
        }

        return string(abi.encodePacked(ethVal.toString(), ".", string(trimmed)));
    }

    /**
     * @notice Generate dynamic on-chain SVG representation of the NFT position.
     */
    function generateSVG(uint256 tokenId, uint256 amount, uint256 startTime) public pure returns (string memory) {
        string memory amountStr = formatEther(amount);
        string memory idStr = tokenId.toString();
        string memory timeStr = startTime.toString();

        return string(
            abi.encodePacked(
                "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' width='100%' height='100%'>",
                "<defs>",
                "<linearGradient id='gpuGrad' x1='0%' y1='0%' x2='100%' y2='100%'>",
                "<stop offset='0%' stop-color='#0b0f19' />",
                "<stop offset='50%' stop-color='#111827' />",
                "<stop offset='100%' stop-color='#1f2937' />",
                "</linearGradient>",
                "<linearGradient id='neonGrad' x1='0%' y1='0%' x2='100%' y2='0%'>",
                "<stop offset='0%' stop-color='#10B981' />",
                "<stop offset='100%' stop-color='#3B82F6' />",
                "</linearGradient>",
                "<filter id='glow' x='-20%' y='-20%' width='140%' height='140%'>",
                "<feGaussianBlur stdDeviation='6' result='blur' />",
                "<feComposite in='SourceGraphic' in2='blur' operator='over' />",
                "</filter>",
                "</defs>",
                "<rect width='400' height='400' rx='24' fill='url(#gpuGrad)' stroke='url(#neonGrad)' stroke-width='3' />",
                "<rect x='15' y='15' width='370' height='370' rx='16' fill='none' stroke='#10B981' stroke-opacity='0.15' stroke-width='1' />",
                "<g transform='translate(40, 50)'>",
                "<circle cx='20' cy='20' r='16' fill='#10B981' fill-opacity='0.1' stroke='#10B981' stroke-width='1.5' filter='url(#glow)' />",
                "<path d='M16 14 L24 14 L20 26 Z' fill='#10B981' />",
                "<text x='48' y='25' fill='#FFFFFF' font-family='system-ui, sans-serif' font-weight='800' font-size='18' letter-spacing='1'>STAKE POSITION</text>",
                "</g>",
                "<text x='40' y='140' fill='#9CA3AF' font-family='system-ui, sans-serif' font-size='11' font-weight='600' letter-spacing='1.5'>POSITION TOKEN ID</text>",
                "<text x='40' y='168' fill='#FFFFFF' font-family='system-ui, sans-serif' font-weight='800' font-size='22'>#", idStr, "</text>",
                "<text x='40' y='215' fill='#9CA3AF' font-family='system-ui, sans-serif' font-size='11' font-weight='600' letter-spacing='1.5'>STAKED PRINCIPAL</text>",
                "<text x='40' y='245' fill='#10B981' font-family='system-ui, sans-serif' font-weight='800' font-size='26' filter='url(#glow)'>", amountStr, " ETH</text>",
                "<text x='40' y='295' fill='#9CA3AF' font-family='system-ui, sans-serif' font-size='11' font-weight='600' letter-spacing='1.5'>DEPOSIT TIMESTAMP</text>",
                "<text x='40' y='322' fill='#D1D5DB' font-family='system-ui, sans-serif' font-size='14' font-weight='500'>", timeStr, "</text>",
                "<g transform='translate(260, 40)'>",
                "<rect width='100' height='30' rx='15' fill='#10B981' fill-opacity='0.1' stroke='#10B981' stroke-width='1' />",
                "<circle cx='18' cy='15' r='4' fill='#10B981' filter='url(#glow)' />",
                "<text x='32' y='19' fill='#10B981' font-family='system-ui, sans-serif' font-weight='700' font-size='10' letter-spacing='0.5'>ACTIVE</text>",
                "</g>",
                "</svg>"
            )
        );
    }

    /**
     * @notice Fetch metadata for an NFT. Returns JSON base64 encoded.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Stake memory s = stakes[tokenId];

        string memory svg = generateSVG(tokenId, s.amount, s.startTime);
        string memory json = Base64.encode(
            bytes(
                abi.encodePacked(
                    '{"name": "Staking Position #',
                    tokenId.toString(),
                    '", "description": "Yield-bearing staking position NFT. Collects 20% rewards every 5 days.", ',
                    '"image": "data:image/svg+xml;base64,',
                    Base64.encode(bytes(svg)),
                    '"}'
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    // Owner controls
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setEmergencyMode(bool active) external onlyOwner {
        emergencyMode = active;
        emit EmergencyModeSet(active);
    }

    /**
     * @notice Fund the staking rewards pool in the treasury.
     */
    function fundTreasury() external payable {}

    /**
     * @notice Withdraw excess treasury ETH. Must leave enough to cover active stakes.
     */
    function withdrawTreasury(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance - amount >= totalStaked, "Cannot withdraw active stakes principal");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH withdrawal failed");
    }

    /**
     * @notice Fallback functions to accept funding.
     */
    receive() external payable {}
    fallback() external payable {}
}
