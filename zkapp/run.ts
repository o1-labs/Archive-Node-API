import { Lightnet, PrivateKey } from 'o1js';
import {
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
} from './utils.js';

// Ensure you are running a local archive node

(async () => {
  await startLightnet();

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

  await stopLightnet();
})();
