import {
  PublicKey,
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  fetchAccount,
} from 'o1js';
import { exec } from 'child_process';
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
  startLightnet,
  stopLightnet,
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

function setNetworkConfig() {
  const network = Mina.Network({
    mina: 'http://localhost:8080/graphql',
    archive: 'http://localhost:3000', // TODO: Make this configurable
    lightnetAccountManager: 'http://localhost:8181',
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
    () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({ verificationKey });
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
    () => {
      zkApp.update(Field(4));
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
    () => {
      for (let i = 0; i < options?.numberOfEmits; i++) {
        zkApp.emitSingleEvent();
      }
    }
  );
  await transaction.sign([senderKey]).prove();
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
    () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        zkApp.emitStructEvent();
      }
    }
  );
  await transaction.sign([senderKey]).prove();
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
    () => {
      for (let i = 0; i < options.numberOfEmits; i++) {
        zkApp.emitStructAction();
      }
    }
  );
  await transaction.sign([senderKey]).prove();
  await sendTransaction(transaction);
}

async function reduceAction(
  zkApp: HelloWorld,
  { publicKey: sender, privateKey: senderKey }: Keypair
) {
  console.log('Reducing action.');
  let transaction = await Mina.transaction(
    { sender, fee: transactionFee },
    () => {
      zkApp.reduceStructAction();
    }
  );
  await transaction.sign([senderKey]).prove();
  await sendTransaction(transaction);
}

async function sendTransaction(transaction: Mina.Transaction) {
  let pendingTx = await transaction.send();
  if (pendingTx.hash() !== undefined) {
    console.log(`Success! Transaction sent.
    Txn hash: ${pendingTx.hash()}`);
  }
  console.log('Waiting for transaction inclusion in a block.\n');
  await pendingTx.wait({ maxAttempts: 90 });
}

async function startLightnet() {
  try {
    console.log('Checking lightnet status...');
    const statusOutput = (await execShellCommand(
      'zk lightnet status'
    )) as string;

    if (
      statusOutput.includes(
        'The lightweight Mina blockchain network Docker container does not exist!'
      )
    ) {
      console.log('Lightnet is not running. Starting lightnet.');
      await execShellCommand('zk lightnet start');
      console.log('Lightnet started successfully.');
    } else if (statusOutput.includes('Blockchain network properties')) {
      console.log('Lightnet is already running.');
    } else {
      console.log('Unable to determine the status of lightnet.');
    }
  } catch (error) {
    console.error('Failed to start or check lightnet:', error);
  }
}

async function stopLightnet() {
  try {
    console.log('Checking lightnet status...');
    const statusOutput = (await execShellCommand(
      'zk lightnet status'
    )) as string;

    if (statusOutput.includes('Blockchain network properties')) {
      console.log('Lightnet is running. Stopping lightnet.');
      await execShellCommand('zk lightnet stop');
      console.log('Lightnet stopped successfully.');
    } else if (
      statusOutput.includes(
        'The lightweight Mina blockchain network Docker container does not exist!'
      )
    ) {
      console.log('Lightnet is not running.');
    } else {
      console.log('Unable to determine the status of lightnet.');
    }
  } catch (error) {
    console.error('Failed to stop or check lightnet:', error);
  }
}

function execShellCommand(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${stderr}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}
