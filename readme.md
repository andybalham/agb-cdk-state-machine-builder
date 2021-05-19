A fluent builder interface for defining state machines in CDK.

# Installing

Using npm:
```
$ npm install @andybalham/agb-cdk-state-machine-builder
```

# Usage

State machine definitions in CDK are defined using a nested structure. Consider the following example with a sequence of four states:

```TypeScript
const stack = new cdk.Stack();

const state1 = new sfn.Pass(stack, 'State1');
const state2 = new sfn.Pass(stack, 'State2');
const state3 = new sfn.Pass(stack, 'State3');
const state4 = new sfn.Pass(stack, 'State4');

new sfn.StateMachine(stack, 'SimpleChain', {
  definition: sfn.Chain.start(state1.next(state2.next(state3.next(state4))))
});
```

Using the fluent builder, the same state machine is defined as follows:

```TypeScript
new sfn.StateMachine(stack, 'SimpleChain', {
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

Choice states are defined using references to the `id` of the target states rather than the state itself. This allows us to avoid nesting states within states when defining the branching. See the example below where a choice has three branches, two with conditions attached, along with a default branch if none of the conditions evaluate to `true`.

```TypeScript
new sfn.StateMachine(stack, 'SimpleChoice', {
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

TODO

## Parallel States

TODO

## Error Handling

TODO