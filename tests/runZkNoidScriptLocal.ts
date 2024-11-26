import { Mina, PublicKey } from 'o1js';

const network = Mina.Network({
  mina: 'https://api.minascan.io/node/devnet/v1/graphql',
  archive: 'http://localhost:3000',
});
Mina.setActiveInstance(network);

const actions = await Mina.activeInstance.fetchActions(
  PublicKey.fromBase58(
    'B62qrHzs8Sn6rJW3Jkd8xvUkPKb4RBC4xsTgKnBd7KvVWnjhkXV7YKJ'
    // 'B62qmASMoUYbRA2TwbB6gDTcdaS9QxEQYghV67i8oMeqA5tsbfvkJ6P'
    // 'B62qio1AyjVw6tBqYCuEJqDz3ej3qVCyJjcQfTTbt3VgE6MZmtruiMJ'
  )
);

console.log(actions);
