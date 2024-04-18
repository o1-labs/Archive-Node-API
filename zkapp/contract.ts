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
    this.actionState.set(Reducer.initialActionState);
  }

  @method async update(squared: Field) {
    const x = this.x.getAndRequireEquals();
    x.square().assertEquals(squared);
    this.x.set(squared);
  }

  @method async emitSingleEvent() {
    const x = this.x.getAndRequireEquals();
    this.emitEvent('singleField', x);
  }

  @method async emitStructEvent() {
    const x = this.x.getAndRequireEquals();
    const y = this.y.getAndRequireEquals();
    const z = this.z.getAndRequireEquals();
    this.emitEvent(
      'struct',
      new TestStruct({ x, y, z, address: this.address })
    );
  }

  @method async emitStructAction() {
    const x = this.x.getAndRequireEquals();
    const y = this.y.getAndRequireEquals();
    const z = this.z.getAndRequireEquals();
    this.reducer.dispatch(new TestStruct({ x, y, z, address: this.address }));
  }

  @method async reduceStructAction() {
    let counter = this.counter.getAndRequireEquals();
    let actionState = this.actionState.getAndRequireEquals();
    const pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let { actionState: newActionState } = this.reducer.reduce(
      pendingActions,
      Field,
      (state: Field, action: TestStruct) => {
        return state.add(action.x);
      },
      { state: counter, actionState }
    );

    this.actionState.set(newActionState);
  }
}
