const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingNFT", function () {
  let StakingNFT;
  let stakingContract;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    // Get Signers
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy contract
    StakingNFT = await ethers.getContractFactory("StakingNFT");
    stakingContract = await StakingNFT.deploy(owner.address);
    await stakingContract.waitForDeployment();

    // Fund the contract treasury to pay rewards
    await owner.sendTransaction({
      to: await stakingContract.getAddress(),
      value: ethers.parseEther("10"),
    });
  });

  describe("Staking Tests", function () {
    it("Should stake successfully and mint an NFT", async function () {
      const stakeVal = ethers.parseEther("1");
      const tx = await stakingContract.connect(addr1).stake({ value: stakeVal });
      await tx.wait();

      expect(await stakingContract.balanceOf(addr1.address)).to.equal(1);
      expect(await stakingContract.ownerOf(1)).to.equal(addr1.address);

      const stakeDetails = await stakingContract.stakes(1);
      expect(stakeDetails.amount).to.equal(stakeVal);
      expect(stakeDetails.claimedRewards).to.equal(0);
      expect(stakeDetails.redeemed).to.equal(false);
      expect(await stakingContract.totalStaked()).to.equal(stakeVal);
    });

    it("Should fail if staking 0 ETH", async function () {
      await expect(
        stakingContract.connect(addr1).stake({ value: 0 })
      ).to.be.revertedWith("Cannot stake 0 ETH");
    });
  });

  describe("Reward Tests", function () {
    it("Should accumulate rewards correctly (20% over 5 days)", async function () {
      const stakeVal = ethers.parseEther("10"); // 10 ETH
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Warp time by 5 days (5 * 86400 seconds)
      await time.increase(5 * 24 * 60 * 60);

      // Reward should be 20% of 10 ETH = 2 ETH
      const pending = await stakingContract.calculateReward(1);
      expect(pending).to.be.closeTo(ethers.parseEther("2"), ethers.parseEther("0.001"));
    });

    it("Should claim rewards successfully and update state", async function () {
      const stakeVal = ethers.parseEther("10");
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Warp time by 5 days
      await time.increase(5 * 24 * 60 * 60);

      const balBefore = await ethers.provider.getBalance(addr1.address);
      const claimTx = await stakingContract.connect(addr1).claimReward(1);
      const receipt = await claimTx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(addr1.address);
      const expectedReward = ethers.parseEther("2");

      // Verify ETH was sent
      expect(balAfter).to.be.closeTo(balBefore + expectedReward - gasUsed, ethers.parseEther("0.001"));

      // Verify state was updated
      const stakeDetails = await stakingContract.stakes(1);
      expect(stakeDetails.claimedRewards).to.be.closeTo(expectedReward, ethers.parseEther("0.001"));
      expect(await stakingContract.totalRewardsPaid()).to.be.closeTo(expectedReward, ethers.parseEther("0.001"));
    });
  });

  describe("Withdrawal Tests", function () {
    it("Should apply 5% penalty on principal for early withdrawal", async function () {
      const stakeVal = ethers.parseEther("10");
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Warp time by 1 hour (less than 1 day lock period)
      await time.increase(3600);

      const balBefore = await ethers.provider.getBalance(addr1.address);
      const tx = await stakingContract.connect(addr1).unstake(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(addr1.address);
      
      // 5% penalty on 10 ETH = 0.5 ETH penalty. Principal returned = 9.5 ETH.
      // Small amount of reward is also paid (1 hour / 5 days)
      const penalty = ethers.parseEther("0.5");
      const payout = stakeVal - penalty;

      expect(balAfter).to.be.closeTo(balBefore + payout - gasUsed, ethers.parseEther("0.05"));
      expect(await stakingContract.totalPenaltiesCollected()).to.equal(penalty);
      expect(await stakingContract.totalStaked()).to.equal(0);
      
      // Token should be burned
      await expect(stakingContract.ownerOf(1)).to.be.reverted;
    });

    it("Should succeed without penalty after lock period ends", async function () {
      const stakeVal = ethers.parseEther("10");
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Warp time by 2 days (more than 1 day lock period)
      await time.increase(2 * 24 * 60 * 60);

      const balBefore = await ethers.provider.getBalance(addr1.address);
      const tx = await stakingContract.connect(addr1).unstake(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(addr1.address);
      
      // No penalty. Rewards for 2 days = 10 * 2 / 25 = 0.8 ETH.
      const reward = ethers.parseEther("0.8");
      const payout = stakeVal + reward;

      expect(balAfter).to.be.closeTo(balBefore + payout - gasUsed, ethers.parseEther("0.001"));
      expect(await stakingContract.totalPenaltiesCollected()).to.equal(0);
      expect(await stakingContract.totalStaked()).to.equal(0);
    });
  });

  describe("Ownership & Controls Tests", function () {
    it("Should pause and unpause only by owner", async function () {
      await expect(stakingContract.connect(addr1).pause()).to.be.reverted;

      await stakingContract.connect(owner).pause();
      expect(await stakingContract.paused()).to.equal(true);

      // Staking should fail when paused
      await expect(
        stakingContract.connect(addr1).stake({ value: ethers.parseEther("1") })
      ).to.be.reverted;

      await expect(stakingContract.connect(addr1).unpause()).to.be.reverted;
      await stakingContract.connect(owner).unpause();
      expect(await stakingContract.paused()).to.equal(false);
    });

    it("Should enable emergency mode only by owner and allow immediate withdraw with no reward", async function () {
      const stakeVal = ethers.parseEther("10");
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Warp time by 5 days (rewards accumulated)
      await time.increase(5 * 24 * 60 * 60);

      // Verify emergency withdraw fails before emergency mode active
      await expect(
        stakingContract.connect(addr1).emergencyWithdraw(1)
      ).to.be.revertedWith("Emergency mode not active");

      // Enable emergency mode
      await expect(stakingContract.connect(addr1).setEmergencyMode(true)).to.be.reverted;
      await stakingContract.connect(owner).setEmergencyMode(true);
      expect(await stakingContract.emergencyMode()).to.equal(true);

      // Emergency withdraw: should withdraw principal only, no rewards, no penalty
      const balBefore = await ethers.provider.getBalance(addr1.address);
      const tx = await stakingContract.connect(addr1).emergencyWithdraw(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(addr1.address);

      expect(balAfter).to.equal(balBefore + stakeVal - gasUsed);
      expect(await stakingContract.totalStaked()).to.equal(0);
    });
  });

  describe("NFT Staking Position Transfer Tests", function () {
    it("Should transfer position and rewards to new owner", async function () {
      const stakeVal = ethers.parseEther("10");
      await stakingContract.connect(addr1).stake({ value: stakeVal });

      // Transfer NFT from addr1 to addr2
      await stakingContract.connect(addr1).transferFrom(addr1.address, addr2.address, 1);

      expect(await stakingContract.ownerOf(1)).to.equal(addr2.address);

      // Warp time 5 days
      await time.increase(5 * 24 * 60 * 60);

      // Addr1 should not be able to claim rewards or unstake
      await expect(
        stakingContract.connect(addr1).claimReward(1)
      ).to.be.revertedWith("Not the owner of this position");

      await expect(
        stakingContract.connect(addr1).unstake(1)
      ).to.be.revertedWith("Not the owner of this position");

      // Addr2 should claim successfully
      const balBefore = await ethers.provider.getBalance(addr2.address);
      const tx = await stakingContract.connect(addr2).claimReward(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(addr2.address);

      expect(balAfter).to.be.closeTo(balBefore + ethers.parseEther("2") - gasUsed, ethers.parseEther("0.001"));
    });
  });
});
