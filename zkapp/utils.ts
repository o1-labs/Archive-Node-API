import {
  PublicKey,
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  fetchAccount,
} from 'o1js';
import { HelloWorld } from './contract.js';

export {
  setNetworkConfig,
  fetchAccountInfo,
  deployContract,
  updateContractState,
  emitSingleEvent,
  emitMultipleFieldsEvent,
  emitAction,
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
  { publicKey: sender, privateKey: senderKey }: Keypair
) {
  console.log('Compiling the smart contract.');
  const { verificationKey } = await HelloWorld.compile();
  const zkApp = new HelloWorld(zkAppAddress);

  console.log(`Deploying zkApp for public key ${zkAppAddress.toBase58()}.`);
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
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
  await transaction.sign([senderKey]);
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
        await zkApp.emitStructEvent();
      }
    }
  );
  await transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function emitAction(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair,
  options: Options = { numberOfEmits: 1 }
) {
  console.log('Emitting action.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        await zkApp.emitStructAction();
      }
    }
  );
  await transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
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
  await transaction.sign([senderKey]);
  await transaction.prove();
  await sendTransaction(transaction);
}

async function sendTransaction(transaction: Mina.Transaction) {
  let pendingTx = await transaction.send();
  if (pendingTx.status === 'pending') {
    console.log(`Success! Transaction sent.
    Txn hash: ${pendingTx.hash}`);
  }
  console.log('Waiting for transaction inclusion in a block.\n');
  await pendingTx.wait({ maxAttempts: 90 });
}
