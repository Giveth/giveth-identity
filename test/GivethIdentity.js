/* eslint-env mocha */
/* eslint-disable no-await-in-loop */
const Ganache = require('ganache-cli');
const { GivethIdentity } = require('../index');
const { MiniMeToken, MiniMeTokenFactory, MiniMeTokenState } = require('minimetoken');
const Web3 = require('web3');
const { assert } = require('chai');
const assertFail = require('./helpers/assertFail');

describe('GivethIdentity test', function() {
  this.timeout(0);

  let ganache;
  let web3;
  let accounts;
  let identity;
  let minime;
  let minimeTokenState;
  let managementKey1;
  let managementKey2;
  let actionKey1;
  let actionKey2;
  let token;
  let tokenBal;

  before(async () => {
    ganache = Ganache.server({
      gasLimit: 6700000,
      total_accounts: 10,
    });

    ganache.listen(8545, '127.0.0.1', err => {});

    web3 = new Web3('http://localhost:8545');
    accounts = await web3.eth.getAccounts();

    managementKey1 = accounts[1];
    managementKey2 = accounts[2];
    actionKey1 = accounts[3];
    actionKey2 = accounts[4];
  });

  after(done => {
    ganache.close();
    done();
    setTimeout(() => process.exit(), 2000);
  });

  it('Should deploy identity contract', async function() {
    identity = await GivethIdentity.new(web3, managementKey1, actionKey1, [], {
      from: accounts[8],
    });

    token = await MiniMeToken.new(web3, 0, 0, 0, 'Token', 18, 'TKN', true);
    tokenBal = 10000;
    await token.generateTokens(identity.$address, tokenBal);

    assert.equal(await identity.actionBlacklist('0x00000000'), true); // value transfer
    assert.equal(await identity.actionBlacklist('0xa9059cbb'), true); // ERC20 transfer
    assert.equal(await identity.actionBlacklist('0x23b872dd'), true); // ERC20 transferFrom
    assert.equal(await identity.actionBlacklist('0x095ea7b3'), true); // ERC20 approve
    assert.equal(await identity.actionBlacklist('0xcae9ca51'), true); // MiniMe approveAndCall
    assert.equal(await identity.managementKeys(managementKey1), true);
    assert.equal(await identity.managementKeys(managementKey2), false);
    assert.equal(await identity.actionKeys(actionKey1), true);
    assert.equal(await identity.actionKeys(actionKey2), false);

    assert.equal(await token.balanceOf(identity.$address), 10000);
  });

  it('Should allow manager to transfer tokens', async function() {
    const data = token.$contract.methods.transfer(accounts[5], 5).encodeABI();
    await identity.sendTransaction(token.$address, 0, data, { from: managementKey1 });
    assert.equal(await token.balanceOf(identity.$address), (tokenBal -= 5));
  });

  it('Should not allow action key to transfer tokens', async function() {
    const data = token.$contract.methods.transfer(accounts[5], 5).encodeABI();
    await assertFail(
      identity.sendTransaction(token.$address, 0, data, { from: actionKey1, gas: 6700000 }),
    );
  });

  it('Should only allow manager to transfer eth', async function() {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: identity.$address,
      value: 1000,
      gas: 28000,
    });

    await assertFail(
      identity.sendTransaction(accounts[0], 500, '0x', { from: actionKey1, gas: 6700000 }),
    );

    await assertFail(
      identity.sendTransaction(accounts[0], 500, '0x', { from: accounts[8], gas: 6700000 }),
    );

    await identity.sendTransaction(accounts[8], 500, '0x', { from: managementKey1 });

    assert.equal(await web3.eth.getBalance(identity.$address), 500);
  });

  it('Should allow action key to call non-blacklisted sig', async function() {
    const data = token.$contract.methods.balanceOf(identity.$address).encodeABI();
    const r = await identity.sendTransaction(token.$address, 0, data, { from: actionKey1 });
    assert.equal(r.status, '0x01');
  });

  it('Should allow only manager to update blacklist', async function() {
    await assertFail(
      identity.blacklistSignature('0xa9059cbb', false, { from: actionKey1, gas: 6700000 }),
    );
    await identity.blacklistSignature('0xa9059cbb', false, {
      from: managementKey1,
      $extraGas: 20000,
    });
    assert.equal(await identity.actionBlacklist('0xa9059cbb'), false); // ERC20 transfer
  });

  it('Should allow action key to call sig after removed from blacklist', async function() {
    const data = token.$contract.methods.transfer(accounts[5], 100).encodeABI();
    await identity.sendTransaction(token.$address, 0, data, { from: actionKey1 });
    assert.equal(await token.balanceOf(identity.$address), (tokenBal -= 100));
  });

  it('Should allow only manager to add action key', async function() {
    await assertFail(identity.addActionKey(actionKey2, { from: actionKey1, gas: 6700000 }));
    await identity.addActionKey(actionKey2, { from: managementKey1 });
    assert.equal(await identity.actionKeys(actionKey2), true);
  });

  it('Should allow either action key to call non-blacklisted function', async function() {
    const data = token.$contract.methods.transfer(accounts[5], 100).encodeABI();
    await identity.sendTransaction(token.$address, 0, data, { from: actionKey1 });
    assert.equal(await token.balanceOf(identity.$address), (tokenBal -= 100));

    await identity.sendTransaction(token.$address, 0, data, { from: actionKey2 });
    assert.equal(await token.balanceOf(identity.$address), (tokenBal -= 100));
  });

  it('Should allow only manager to remove action key', async function() {
    await assertFail(identity.removeActionKey(actionKey1, { from: actionKey2, gas: 6700000 }));
    await identity.removeActionKey(actionKey1, { from: managementKey1, $extraGas: 30000 });
    assert.equal(await identity.actionKeys(actionKey1), false);
    assert.equal(await identity.actionKeys(actionKey2), true);
  });

  it('Should allow only manager to add management key', async function() {
    await assertFail(identity.addManagementKey(managementKey2, { from: actionKey1, gas: 6700000 }));
    await identity.addManagementKey(managementKey2, { from: managementKey1 });
    assert.equal(await identity.managementKeys(managementKey2), true);
  });

  it('Should allow either management key to work', async function() {
    await identity.sendTransaction(accounts[8], 250, '0x', { from: managementKey1 });
    assert.equal(await web3.eth.getBalance(identity.$address), 250);

    await identity.sendTransaction(accounts[8], 250, '0x', { from: managementKey2 });
    assert.equal(await web3.eth.getBalance(identity.$address), 0);
  });

  it('Should allow only manager to remove management key', async function() {
    await assertFail(identity.removeManagementKey(managementKey1, { from: actionKey2, gas: 6700000 }));
    await identity.removeManagementKey(managementKey1, { from: managementKey1, $extraGas: 30000 });
    assert.equal(await identity.managementKeys(managementKey1), false);
    assert.equal(await identity.managementKeys(managementKey2), true);
  });

  it('Should deploy without actionKey', async function() {
    const i = await GivethIdentity.new(web3, managementKey1, 0x0, [], {
      from: accounts[8],
    });

    assert.exists(i.$address);
  });

  it('Should deploy with blacklist', async function() {
    const blacklist = ['0x70a08231'];
    const i = await GivethIdentity.new(web3, managementKey1, actionKey1, blacklist, {
      from: accounts[0],
    });

    let data = token.$contract.methods.balanceOf(i.$address).encodeABI();
    // check that blacklist is working
    await assertFail(i.sendTransaction(token.$address, 0, data, { from: actionKey1, gas: 670000 }));

    data = token.$contract.methods.allowance(i.$address, managementKey1).encodeABI();
    const r = await i.sendTransaction(token.$address, 0, data, { from: actionKey1 });

    assert.equal(r.status, '0x01');
  });

  it('Should not deploy when missing managementKey', async function() {
    await assertFail(
      GivethIdentity.new(web3, 0x0, actionKey1, [], {
        from: accounts[8],
        gas: 670000,
      }),
    );
  });
});
