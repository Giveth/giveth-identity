# Giveth Identity

Simple identity contract for the Giveth platform. The goal of this contract is to be able to abstract away the foreign network wallet.
By using this identity contract, we are able to generate keys for an identity w/ different permission levels. This allows us to use
low permissioned keys to execute low risk actions (non-fund transfers) in the background w/o confirmations and having to unlock the pk.

For actions like token or eth transfers, they require management keys, which should be safeguarded, taking the ususal precautions for pk management.

## Help
Reach out to us on [riot/slack](http://join.giveth.io) for any help or to share ideas.