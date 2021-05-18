import Operation from './Operation';

export default class MyClass {
  //
  constructor(private value: number) {}

  perform(operation: Operation, value: number): number {
    //
    let result: number;

    switch (operation) {
      //
      case Operation.Add:
        result = this.value + value;
        break;

      case Operation.Multiply:
        result = this.value * value;
        break;

      /* istanbul ignore next */
      default:
        throw new Error(`Unhandled operation: ${operation}`);
    }

    return result;
  }
}
