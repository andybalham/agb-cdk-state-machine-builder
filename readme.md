# State Machine Builder

A fluent builder interface for defining state machines in CDK.

Two versions are supported:

* The CDK v1 version is [@andybalham/agb-cdk-state-machine-builder](https://www.npmjs.com/package/@andybalham/agb-cdk-state-machine-builder) [![Build & test](https://github.com/andybalham/agb-cdk-agb-cdk-state-machine-builder/actions/workflows/build-test-cdk-v1.yml/badge.svg)](https://github.com/andybalham/agb-cdk-agb-cdk-state-machine-builder/actions/workflows/build-test-cdk-v1.yml)
* The CDK v2 version is [@andybalham/agb-cdk-state-machine-builder-v2](https://www.npmjs.com/package/@andybalham/agb-cdk-state-machine-builder-v2) [![Build & test](https://github.com/andybalham/agb-cdk-agb-cdk-state-machine-builder/actions/workflows/build-test.yml/badge.svg)](https://github.com/andybalham/agb-cdk-agb-cdk-state-machine-builder/actions/workflows/build-test.yml)


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

## Wait and Pass States

`Wait` and `Pass` states can added to a state machine either by using the `perform` method, or by using the `pass` or `wait` methods for a little more convenience as the `scope` parameter is passed in automatically when the `build` method is called.

```TypeScript
new sfn.StateMachine(stack, 'WaitAndPassExample', {
  definition: new StateMachineBuilder()

    .wait('Wait1', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(1)),
    })

    .pass('Pass1', {
      comment: 'This is pass state 1',
    })

    .build(stack),
});
```

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

## Next statements

The `next` statement is used to explicitly define the next state in the flow. Consider the following example, where there is a choice between two states (`state1` and `state2`) followed by a common state (`state3`). The `next` statement is used after `state1` to prevent the flow from going to `state2`.

```TypeScript
new sfn.StateMachine(stack, 'ChoiceExample', {
  definition: new StateMachineBuilder()

    .choice('Choice1', {
      choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: state1.id }],
      otherwise: state2.id,
    })

    .perform(state1)
    .next(state3.id)

    .perform(state2)

    .perform(state3)

    .build(stack),
});
```

## Succeed and Fail States

`Succeed` and `Fail` states are added using the `succeed` and `fail` methods, passing in an `id` and optional properties. `Succeed` and `Fail` states are always terminal states, so it is not necessary to have an `end` method call after them.

```TypeScript
new sfn.StateMachine(stack, 'SucceedAndFailExample', {
  definition: new StateMachineBuilder()

    .choice('Choice1', {
      choices: [
        { when: sfn.Condition.stringEquals('$.var1', 'Foo'), next: 'Succeed1' },
        { when: sfn.Condition.stringEquals('$.var1', 'Bar'), next: 'Succeed2' },
      ],
      otherwise: 'Fail1',
    })

    .succeed('Succeed1', {
      comment: 'Success 1',
    })

    .succeed('Succeed2', {
      comment: 'Success 2',
    })

    .fail('Fail1', {
      comment: 'Failure 1',
    })

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

## Lambda Invoke

The `lambdaInvoke` method provides a way of adding states that invoke a Lambda function as a task. As well as providing a little syntactic sugar, default `props` can be passed in to the `build` method. In the following example, default values for `retryOnServiceExceptions` and `payloadResponseOnly` are specified via the `build` method, but the `LambdaInvoke2` overrides the value for `retryOnServiceExceptions`. The example also shows how the `parameters` property provides a simplified way of defining an object `payload` and how the retry properties are specified.

```TypeScript
new sfn.StateMachine(stack, 'LambdaInvokeExample', {
  definition: new StateMachineBuilder()

    .lambdaInvoke('LambdaInvoke1', {
      lambdaFunction: function1,
      parameters: {
        constant: 'ConstantValue',
        'dynamic.$': '$.dynamicValue',
      },
      retry: { maxAttempts: 3 },
    })

    .lambdaInvoke('LambdaInvoke2', {
      lambdaFunction: function2,
      retryOnServiceExceptions: true,
    })

    .build(definitionScope, {
      defaultProps: {
        lambdaInvoke: {
          retryOnServiceExceptions: false,
          payloadResponseOnly: true,
        },
      },
    });
}
```

## Error Handling

Error handlers are specified by supplying an array of `catch` instances as part of the `props` passed to the `tryPerform`, `lambdaInvoke`, `map`, and `parallel` methods. Each `catch` instance specifies the errors that are handled and the `id` of the handling state.

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
