import {
  Bool,
  Field,
  PrivateKey,
  SmartContract,
  State,
  Struct,
  UInt64,
  method,
  state,
  Reducer,
  PublicKey,
} from 'o1js';

export const adminPrivateKey = PrivateKey.random();
export const adminPublicKey = adminPrivateKey.toPublicKey();

class TestStruct extends Struct({
  x: Field,
  y: Bool,
  z: UInt64,
  address: PublicKey,
}) {}

export class HelloWorld extends SmartContract {
  reducer = Reducer({ actionType: TestStruct });

  events = {
    singleField: Field,
    struct: TestStruct,
  };

  @state(Field) x = State<Field>();
  @state(Bool) y = State<Bool>();
  @state(UInt64) z = State<UInt64>();
  @state(Field) counter = State<Field>();
  @state(Field) actionState = State<Field>();

  init() {
    super.init();
    this.x.set(Field(2));
    this.y.set(Bool(true));
    this.z.set(UInt64.from(1));
    this.account.delegate.set(adminPublicKey);
  }

  @method update(squared: Field, admin: PrivateKey) {
    const x = this.x.getAndRequireEquals();
    x.square().assertEquals(squared);
    this.x.set(squared);
    const adminPk = admin.toPublicKey();
    this.account.delegate.requireEquals(adminPk);
  }

  @method emitSingleEvent() {
    const x = this.x.getAndRequireEquals();
    this.emitEvent('singleField', x);
  }

  @method emitStructEvent() {
    const x = this.x.getAndRequireEquals();
    const y = this.y.getAndRequireEquals();
    const z = this.z.getAndRequireEquals();
    this.emitEvent(
      'struct',
      new TestStruct({ x, y, z, address: this.address })
    );
  }

  @method emitStructAction() {
    const x = this.x.getAndRequireEquals();
    const y = this.y.getAndRequireEquals();
    const z = this.z.getAndRequireEquals();
    this.reducer.dispatch(new TestStruct({ x, y, z, address: this.address }));
  }

  @method reduceStructAction() {
    let counter = this.counter.getAndRequireEquals();
    let actionState = this.actionState.getAndRequireEquals();

    let { actionState: newActionState } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Field,
      (state: Field, action: TestStruct) => {
        return state.add(action.x);
      },
      { state: counter, actionState }
    );

    this.actionState.set(newActionState);
  }
}
