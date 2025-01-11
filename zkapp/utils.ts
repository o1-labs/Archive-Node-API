import {
  PublicKey,
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  fetchAccount,
  UInt64,
  Bool,
  UInt32,
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
  fetchNetworkState,
  Keypair,
  randomStruct,
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
  await transaction.sign([senderKey]).prove();
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
  options: Options = { numberOfEmits: 1 },
  baseStruct: TestStruct = randomStruct()
) {
  console.log('Emitting multiple fields event.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        const struct = new TestStruct(baseStruct);
        struct.x = struct.x.add(Field(i));
        await zkApp.emitStructEvent(struct);
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
  options: Options = { numberOfEmits: 1 },
  baseStruct: TestStruct = randomStruct()
) {
  console.log('Emitting multiple fields event.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        const struct = new TestStruct(baseStruct);
        struct.x = struct.x.add(Field(i));
        const s1 = new TestStruct(struct);
        const s2 = new TestStruct(struct);
        const s3 = new TestStruct(struct);
        s1.z = s1.z.add(UInt64.from(i));
        s2.z = s2.z.add(UInt64.from(i + 1));
        s3.z = s3.z.add(UInt64.from(i + 2));
        await zkApp.emitStructsEvent({
          structs: [s1, s2, s3],
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

async function fetchNetworkState(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair
): Promise<number> {
  console.log('Fetching network state.');
  let blockchainLength: UInt32 = UInt32.zero;
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
       blockchainLength = Mina.getNetworkState().blockchainLength;
    }
  );
  transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
  return Number(blockchainLength.toString());
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
