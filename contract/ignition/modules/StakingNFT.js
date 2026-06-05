const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("StakingNFTModule", (m) => {
  const initialOwner = m.getAccount(0);

  const stakingNFT = m.contract("StakingNFT", [initialOwner]);

  return { stakingNFT };
});
