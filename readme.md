# State Machine Builder

A fluent builder interface for defining state machines in CDK.

# Usage

State machine definitions in CDK are defined using a nested structure. Consider the following example with a sequence of four states:

```TypeScript
const stack = new cdk.Stack();

const state1 = new sfn.Pass(stack, 'State1');
const state2 = new sfn.Pass(stack, 'State2');
const state3 = new sfn.Pass(stack, 'State3');
const state4 = new sfn.Pass(stack, 'State4');

new sfn.StateMachine(stack, 'ChainExample', {
  definition: sfn.Chain.start(state1.next(state2.next(state3.next(state4))))
});
```

Using the fluent builder, the same state machine is defined as follows:

```TypeScript
new sfn.StateMachine(stack, 'ChainExample', {
  definition: new StateMachineBuilder()

    .perform(state1)
    .perform(state2)
    .perform(state3)
    .perform(state4)

    .build(stack),
});
```

IMHO, this approach reads better, is easier to maintain, plays nicer with [Prettier](https://prettier.io/), and results in more meaningful differences in pull requests.

## Choice States

`Choice` states are defined using references to the `id` of the target states rather than the state itself. This allows us to avoid nesting states within states when defining the branching. See the example below where a choice has three branches, two with conditions attached, along with a default branch if none of the conditions evaluate to `true`.

```TypeScript
new sfn.StateMachine(stack, 'ChoiceExample', {
  definition: new StateMachineBuilder()

    .choice('Choice1', {
      choices: [
        { when: sfn.Condition.stringEquals('$.var1', 'Foo'), next: state1.id },
        { when: sfn.Condition.stringEquals('$.var1', 'Bar'), next: state2.id },
      ],
      otherwise: state3.id,
    })

    .perform(state1)
    .end()

    .perform(state2)
    .end()

    .perform(state3)

    .build(stack),
});
```

## Map States

`Map` states are defined by specifying a `StateMachineBuilder` instance for the `iterator` property.

```TypeScript
new sfn.StateMachine(stack, 'MapExample', {
  definition: new StateMachineBuilder()

    .map('Map1', {
      itemsPath: '$.Items1',
      iterator: new StateMachineBuilder()
        .perform(state1)
        .perform(state2)
        .perform(state3),
    })

    .build(stack);
}
```

## Parallel States

`Parallel` states are defined by specifying an array of `StateMachineBuilder` instances for the `branches` property.

```TypeScript
new sfn.StateMachine(stack, 'ParallelExample', {
  definition: new StateMachineBuilder()

    .parallel('Parallel1', {
      branches: [
        new StateMachineBuilder()
          .perform(state1)
          .perform(state2),
        new StateMachineBuilder()
          .perform(state3)
          .perform(state4),
      ],
    })

    .build(stack);
}
```

## Error Handling

Error handlers are specified by supplying an array of `catch` instances as part of the `props` passed to the and `tryPerform`, `map`, and `parallel` methods. Each `catch` instance specifies the errors that are handled and the `id` of the handling state.

```TypeScript
new sfn.StateMachine(stack, 'ErrorHandlingExample', {
  definition: new StateMachineBuilder()

    .tryPerform(function1, {
      catches: [
        { errors: ['States.Timeout'], handler: catchAll.id },
        { errors: ['States.All'], handler: catchAll.id },
      ],
    })
    .map('Map1', {
      itemsPath: '$.Items1',
      iterator: new StateMachineBuilder()
        .perform(state1)
        .perform(state2),
      catches: [{ handler: catchAll.id }],
    })
    .parallel('Parallel1', {
      branches: [
        new StateMachineBuilder().perform(state3),
        new StateMachineBuilder().perform(state4)],
      catches: [{ handler: catchAll.id }],
    })
    .end()

    .perform(catchAll)

    .build(stack);
}
```
