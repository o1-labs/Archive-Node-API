import {
  Bool,
  Field,
  SmartContract,
  State,
  Struct,
  UInt64,
  method,
  state,
  Reducer,
  PublicKey,
  Provable,
} from 'o1js';

export class TestStruct extends Struct({
  x: Field,
  y: Bool,
  z: UInt64,
  address: PublicKey,
}) {}

export class TestStructArray extends Struct({
  structs: Provable.Array(TestStruct, 3),
}) {}

export class HelloWorld extends SmartContract {
  reducer = Reducer({ actionType: TestStructArray });

  events = {
    singleField: Field,
    struct: TestStruct,
    structs: TestStructArray,
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

  @method async emitStructEvent(struct: TestStruct) {
    this.emitEvent('struct', struct);
  }

  @method async emitStructsEvent(structs: TestStructArray) {
    this.emitEvent('structs', structs);
  }

  /**
   * This method always emits the same action.
   * It has limited utility in generating realistic test cases.
   * We should use more dynamic methods to generate actions.
   */
  @method async emitStaticStructAction() {
    const x = this.x.getAndRequireEquals();
    const y = this.y.getAndRequireEquals();
    const z = this.z.getAndRequireEquals();
    const struct = new TestStruct({ x, y, z, address: this.address });
    this.reducer.dispatch({ structs: [struct, struct, struct] });
  }

  @method async emitAction(structs: TestStructArray) {
    this.reducer.dispatch(structs);
  }

  @method async reduceStructAction() {
    let counter = this.counter.getAndRequireEquals();
    let actionState = this.actionState.getAndRequireEquals();
    const pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let newCounter = this.reducer.reduce(
      pendingActions,
      Field,
      (state: Field, action: TestStructArray) => {
        return state.add(action.structs[0].x);
      },
      counter
    );

    this.counter.set(newCounter);
    this.actionState.set(pendingActions.hash);
  }
}
