import { Lightnet, PrivateKey } from 'o1js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import {
  setNetworkConfig,
  fetchAccountInfo,
  deployContract,
  updateContractState,
  emitSingleEvent,
  emitMultipleFieldsEvent,
  emitAction,
  reduceAction,
} from '../zkapp/utils.js';

(async () => {
  setNetworkConfig();

  const zkAppKey = PrivateKey.random();
  const zkAppKeypair = {
    privateKey: zkAppKey,
    publicKey: zkAppKey.toPublicKey(),
  };

  const senderKeypair = await Lightnet.acquireKeyPair();

  await fetchAccountInfo(senderKeypair.publicKey);

  const zkApp = await deployContract(zkAppKeypair, senderKeypair);

  await updateContractState(zkApp, senderKeypair);

  await emitSingleEvent(zkApp, senderKeypair);

  await emitMultipleFieldsEvent(zkApp, senderKeypair);

  await emitAction(zkApp, senderKeypair);

  await reduceAction(zkApp, senderKeypair);

  await emitAction(zkApp, senderKeypair, { numberOfEmits: 3 });

  await reduceAction(zkApp, senderKeypair);

  const keyPairReleaseMessage = await Lightnet.releaseKeyPair({
    publicKey: senderKeypair.publicKey.toBase58(),
  });

  if (keyPairReleaseMessage) console.info(keyPairReleaseMessage);

  const filePath = join(dirname(fileURLToPath(import.meta.url)), 'zkapp.csv');
  writeFileSync(filePath, `address\n${zkAppKeypair.publicKey.toBase58()}\n`);
  console.log(`Public key of zkApp keypair written into ${filePath}`);
})();
