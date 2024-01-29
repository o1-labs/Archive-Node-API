import {
  AccountUpdate,
  Field,
  Lightnet,
  Mina,
  PrivateKey,
  fetchAccount,
} from 'o1js';
import { HelloWorld, adminPrivateKey } from './contract.js';

(async () => {
  const zkAppKey = PrivateKey.random();
  const zkAppAddress = zkAppKey.toPublicKey();
  const transactionFee = 100_000_000;

  // Network configuration
  const network = Mina.Network({
    mina: 'http://localhost:8080/graphql',
    archive: 'http://localhost:8080',
    lightnetAccountManager: 'http://localhost:8181',
  });
  Mina.setActiveInstance(network);

  // Fee payer setup
  const senderKey = (await Lightnet.acquireKeyPair()).privateKey;
  const sender = senderKey.toPublicKey();

  console.log(`Fetching the fee payer account information.`);
  const accountDetails = (await fetchAccount({ publicKey: sender })).account;
  console.log(
    `Using the fee payer account ${sender.toBase58()} with nonce: ${accountDetails?.nonce} and balance: ${accountDetails?.balance}.\n`
  );

  // zkApp compilation
  console.log('Compiling the smart contract.');
  const { verificationKey } = await HelloWorld.compile();
  const zkApp = new HelloWorld(zkAppAddress);
  console.log('');

  // zkApp deployment
  console.log(`Deploying zkApp for public key ${zkAppAddress.toBase58()}.`);
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({ verificationKey });
    }
  );
  transaction.sign([senderKey, zkAppKey]);
  console.log('Sending the transaction.');
  let pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Deploy transaction sent.
  Your smart contract will be deployed
  as soon as the transaction is included in a block.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // zkApp state update
  console.log('Trying to update deployed zkApp state.');
  transaction = await Mina.transaction({ sender, fee: transactionFee }, () => {
    zkApp.update(Field(4), adminPrivateKey);
  });
  await transaction.sign([senderKey]).prove();
  console.log('Sending the transaction.');
  pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Update transaction sent.
  Your smart contract state will be updated
  as soon as the transaction is included in a block.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // zkApp emit single event
  console.log('Emitting single field event.');
  transaction = await Mina.transaction({ sender, fee: transactionFee }, () => {
    zkApp.emitSingleEvent();
  });
  await transaction.sign([senderKey]).prove();
  console.log('Sending the transaction.');
  pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Transaction sent.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // zkApp emit struct event
  console.log('Emitting multiple fields event.');
  transaction = await Mina.transaction({ sender, fee: transactionFee }, () => {
    zkApp.emitStructEvent();
  });
  await transaction.sign([senderKey]).prove();
  console.log('Sending the transaction.');
  pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Transaction sent.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // zkApp emit struct action
  console.log('Emitting action.');
  transaction = await Mina.transaction({ sender, fee: transactionFee }, () => {
    zkApp.emitStructAction();
  });
  await transaction.sign([senderKey]).prove();
  console.log('Sending the transaction.');
  pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Transaction sent.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // zkApp reduce struct action
  console.log('Reducing action.');
  transaction = await Mina.transaction({ sender, fee: transactionFee }, () => {
    zkApp.reduceStructAction();
  });
  await transaction.sign([senderKey]).prove();
  console.log('Sending the transaction.');
  pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Transaction sent.
  Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('');

  // Tear down
  const keyPairReleaseMessage = await Lightnet.releaseKeyPair({
    publicKey: sender.toBase58(),
  });
  if (keyPairReleaseMessage) console.info(keyPairReleaseMessage);
})();
