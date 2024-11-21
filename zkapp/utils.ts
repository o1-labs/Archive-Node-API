import {
  PublicKey,
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  fetchAccount,
  UInt64,
  Bool,
} from 'o1js';
import { HelloWorld, TestStruct, type TestStructArray } from './contract.js';

export {
  setNetworkConfig,
  fetchAccountInfo,
  deployContract,
  updateContractState,
  emitSingleEvent,
  emitMultipleFieldsEvent,
  emitMultipleFieldsEvents,
  emitAction,
  emitActionsFromMultipleSenders,
  reduceAction,
  Keypair,
};

const transactionFee = 100_000_000;

type Keypair = {
  publicKey: PublicKey;
  privateKey: PrivateKey;
};

type Options = {
  numberOfEmits: number;
};

function setNetworkConfig({
  // Default to the network constants that lightnet uses
  mina = 'http://localhost:8080/graphql',
  archive = 'http://localhost:8282',
  lightnetAccountManager = 'http://localhost:8181',
}: {
  mina?: string;
  archive?: string;
  lightnetAccountManager?: string;
} = {}) {
  const network = Mina.Network({
    mina,
    archive,
    lightnetAccountManager,
  });
  Mina.setActiveInstance(network);
}

async function fetchAccountInfo(sender: PublicKey) {
  console.log(`Fetching the fee payer account information.`);
  const accountDetails = (await fetchAccount({ publicKey: sender })).account;
  console.log(
    `Using the fee payer account ${sender.toBase58()} with nonce: ${accountDetails?.nonce} and balance: ${accountDetails?.balance}.\n`
  );
}

async function deployContract(
  { publicKey: zkAppAddress, privateKey: zkAppKey }: Keypair,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  fundNewAccount = true
) {
  console.log('Compiling the smart contract.');
  const { verificationKey } = await HelloWorld.compile();
  const zkApp = new HelloWorld(zkAppAddress);

  console.log(`Deploying zkApp for public key ${zkAppAddress.toBase58()}.`);
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      if (fundNewAccount) {
        AccountUpdate.fundNewAccount(sender);
      }
      await zkApp.deploy({ verificationKey });
    }
  );
  transaction.sign([senderKey, zkAppKey]);
  await sendTransaction(transaction);
  return zkApp;
}

async function updateContractState(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair
) {
  console.log('Trying to update deployed zkApp state.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      await zkApp.update(Field(4));
    }
  );
  transaction.sign([senderKey]).prove();
  await sendTransaction(transaction);
}

async function emitSingleEvent(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  options: Options = { numberOfEmits: 1 }
) {
  console.log('Emitting single field event.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options?.numberOfEmits; i++) {
        await zkApp.emitSingleEvent();
      }
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function emitMultipleFieldsEvent(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  options: Options = { numberOfEmits: 1 }
) {
  console.log('Emitting multiple fields event.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        await zkApp.emitStructEvent(randomStruct());
      }
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function emitMultipleFieldsEvents(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  options: Options = { numberOfEmits: 1 }
) {
  console.log('Emitting multiple fields event.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        await zkApp.emitStructsEvent({
          structs: [randomStruct(), randomStruct(), randomStruct()],
        });
      }
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function emitAction(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  options: Options = { numberOfEmits: 1 },
  testStructs: TestStructArray = {
    structs: [randomStruct(), randomStruct(), randomStruct()],
  }
) {
  console.log('Emitting action.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        await zkApp.emitAction(testStructs);
      }
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function emitActionsFromMultipleSenders(
  zkApp: HelloWorld,
  callers: Keypair[],
  options: Options = { numberOfEmits: 2 }
) {
  const txs = [];
  for (const caller of callers) {
    console.log('Compiling transaction for ', caller.publicKey.toBase58());
    const testStruct = randomStruct();
    let transaction = await Mina.transaction(
      { sender: caller.publicKey, fee: transactionFee },
      async () => {
        for (let i = 0; i < options.numberOfEmits; i++) {
          testStruct.x = testStruct.x.add(Field(i));
          await zkApp.emitAction({
            structs: [testStruct, testStruct, testStruct],
          });
        }
      }
    );
    transaction.sign([caller.privateKey]);
    await transaction.prove();
    txs.push(transaction);
  }

  await sendTransactions(txs);
}

async function reduceAction(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair
) {
  console.log('Reducing action.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      await zkApp.reduceStructAction();
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function sendTransaction(transaction: Mina.Transaction<any, any>) {
  let pendingTx = await transaction.send();
  if (pendingTx.status === 'pending') {
    console.log(`Success! Transaction sent.
    Txn hash: ${pendingTx.hash}`);
  }
  console.log('Waiting for transaction inclusion in a block.\n');
  try {
    await pendingTx.wait({ maxAttempts: 90 });
  } catch (error) {
    console.error('Transaction rejected or failed to finalize:', error);
  }
}

async function sendTransactions(transactions: Mina.Transaction<any, any>[]) {
  const pendingTxs = transactions.map((tx) => tx.send());
  console.log('Waiting for transactions to be included in a block.\n');

  for (const pendingTx of pendingTxs) {
    let tx = await pendingTx;
    try {
      await tx.wait({ maxAttempts: 90 });
      console.log(`Success! Transaction sent. Txn hash: ${tx.hash}`);
    } catch (error) {
      console.error('Transaction rejected or failed to finalize:', error);
    }
  }
}

function randomStruct() {
  return new TestStruct({
    x: Field(Math.floor(Math.random() * 100_000)),
    y: Bool(true),
    z: UInt64.from(Math.floor(Math.random() * 100_000)),
    address: PrivateKey.random().toPublicKey(),
  });
}
