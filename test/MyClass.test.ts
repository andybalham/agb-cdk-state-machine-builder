import { expect } from 'chai';
import { MyClass, Operation } from '../src';

[
  { operation: Operation.Add, value: 50, expectedResult: 150 },
  { operation: Operation.Multiply, value: 5, expectedResult: 500 },
].forEach((theory) => {
  it(`performs operation: ${JSON.stringify(theory)}`, async () => {
    const myClass = new MyClass(100);
    const result = myClass.perform(theory.operation, theory.value);
    expect(result).to.equal(theory.expectedResult);
  });
});
