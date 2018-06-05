const contractInfo = require('./build/GivethIdentity.sol');
const generateClass = require('eth-contract-class').default;

module.exports = {
  GivethIdentity: generateClass(
    contractInfo.GivethIdentityAbi,
    contractInfo.GivethIdentityByteCode,
  ),
};
