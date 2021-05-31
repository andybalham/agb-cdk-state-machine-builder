/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-new */
import * as fs from 'fs';
import path from 'path';
import { assert, expect } from 'chai';
import StateMachineWithGraph from '@andybalham/state-machine-with-graph';
import StateMachineBuilder from '../src';
import * as sfnTasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as lambda from '@aws-cdk/aws-lambda';

describe('StateMachineWithGraph', () => {
  //
  it('renders simple chain', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'SimpleChain-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');

        const definition = sfn.Chain.start(state1.next(state2.next(state3.next(state4.next(state5.next(state6))))));

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'SimpleChain-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');

        const definition = new StateMachineBuilder()

          .perform(state1)
          .perform(state2)
          .perform(state3)
          .perform(state4)
          .perform(state5)
          .perform(state6)

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    const cdkGraph = JSON.parse(cdkStateMachine.graphJson);
    const builderGraph = JSON.parse(builderStateMachine.graphJson);

    expect(builderGraph).to.deep.equal(cdkGraph);
  });

  it(`validates empty builder`, async () => {
    //
    assert.throws(() => {
      new StateMachineBuilder().build(new cdk.Stack());
    }, new RegExp(`no steps`, 'i'));
  });

  ['State1', 'State2'].forEach((id) => {
    it(`validates duplicate id: ${id}`, async () => {
      //
      assert.throws(() => {
        new StateMachineBuilder()

          .pass('State1')
          .map('Map1', {
            iterator: new StateMachineBuilder().pass('State1'),
          })
          .parallel('Parallel1', {
            branches: [new StateMachineBuilder().pass('State2'), new StateMachineBuilder().pass('State2')],
          })

          .build(new cdk.Stack());
      }, new RegExp(`duplicate.*${id}`, 'i'));
    });
  });

  [
    'UnknownTryPerformHandler',
    'UnknownChoice',
    'UnknownOtherwise',
    'UnknownMapHandler',
    'UnknownParallelHandler',
    'UnknownIteratorTryPerformHandler',
    'UnknownBranchTryPerformHandler',
  ].forEach((id) => {
    it(`validates unknown id: ${id}`, async () => {
      //
      const stack = new cdk.Stack();

      const function1 = new sfnTasks.EvaluateExpression(stack, 'Function1', {
        expression: '$.Var1 > 0',
      });
      const function2 = new sfnTasks.EvaluateExpression(stack, 'Function2', {
        expression: '$.Var2 > 0',
      });
      const function3 = new sfnTasks.EvaluateExpression(stack, 'Function3', {
        expression: '$.Var3 > 0',
      });

      assert.throws(() => {
        new StateMachineBuilder()

          .tryPerform(function1, {
            catches: [{ handler: 'UnknownTryPerformHandler' }],
          })

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.isNull('$.var1'), next: 'UnknownChoice' }],
            otherwise: 'UnknownOtherwise',
          })

          .map('Map1', {
            iterator: new StateMachineBuilder().tryPerform(function2, {
              catches: [{ handler: 'UnknownIteratorTryPerformHandler' }],
            }),
            catches: [{ handler: 'UnknownMapHandler' }],
          })
          .pass('UnknownIteratorTryPerformHandler') // This shouldn't be in the scope of the iterator

          .parallel('Parallel1', {
            branches: [
              new StateMachineBuilder().tryPerform(function3, {
                catches: [{ handler: 'UnknownBranchTryPerformHandler' }],
              }),
            ],
            catches: [{ handler: 'UnknownParallelHandler' }],
          })
          .pass('UnknownBranchTryPerformHandler') // This shouldn't be in the scope of the branch

          .build(stack);
      }, new RegExp(`invalid target.*${id}`, 'i'));
    });
  });

  ['Unreachable1', 'Unreachable2', 'Unreachable3', 'Unreachable4', 'MapUnreachable1', 'ParallelUnreachable1'].forEach(
    (id) => {
      it(`validates unreachable id: ${id}`, async () => {
        //
        const stack = new cdk.Stack();

        const function1 = new sfnTasks.EvaluateExpression(stack, 'Function1', {
          expression: '$.Var1 > 0',
        });

        assert.throws(() => {
          new StateMachineBuilder()

            .tryPerform(function1, {
              catches: [{ handler: 'TryPerformHandler' }],
            })

            .choice('Choice1', {
              choices: [
                { when: sfn.Condition.isNull('$.var1'), next: 'Map1' },
                { when: sfn.Condition.isNull('$.var2'), next: 'Parallel1' },
              ],
              otherwise: 'Pass1',
            })

            .pass('Unreachable1')

            .pass('Pass1')
            .end()

            .pass('Unreachable2')

            .map('Map1', {
              iterator: new StateMachineBuilder().fail('MapFail1').pass('MapUnreachable1').end(),
              catches: [{ handler: 'MapHandler' }],
            })
            .succeed('Succeed1')

            .pass('Unreachable3')

            .parallel('Parallel1', {
              branches: [new StateMachineBuilder().fail('ParallelFail1').pass('ParallelUnreachable1').end()],
              catches: [{ handler: 'ParallelHandler' }],
            })
            .fail('Fail1')

            .pass('Unreachable4')

            .fail('TryPerformHandler')
            .fail('MapHandler')
            .fail('ParallelHandler')

            .build(stack);
        }, new RegExp(`unreachable.*${id}`, 'i'));
      });
    }
  );

  it('renders pass states', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1', {
          comment: 'This is state 1',
        });
        const state2 = new sfn.Pass(definitionScope, 'State2', {
          comment: 'This is state 2',
        });

        const definition = sfn.Chain.start(state1.next(state2));

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const definition = new StateMachineBuilder()

          .pass('State1', {
            comment: 'This is state 1',
          })
          .pass('State2', {
            comment: 'This is state 2',
          })

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    const cdkGraph = JSON.parse(cdkStateMachine.graphJson);
    const builderGraph = JSON.parse(builderStateMachine.graphJson);

    expect(builderGraph).to.deep.equal(cdkGraph);
  });

  it('renders lambda invoke', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new lambda.Function(definitionScope, 'Function1', {
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
        });

        const lambdaInvoke1 = new sfnTasks.LambdaInvoke(definitionScope, 'LambdaInvoke1', {
          lambdaFunction: function1,
        });

        const fail1 = new sfn.Fail(definitionScope, 'Fail1');

        const definition = sfn.Chain.start(lambdaInvoke1.addCatch(fail1));

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new lambda.Function(definitionScope, 'Function1', {
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
        });

        const definition = new StateMachineBuilder()

          .lambdaInvoke('LambdaInvoke1', {
            lambdaFunction: function1,
            catches: [{ handler: 'Fail1' }],
          })
          .end()

          .fail('Fail1')

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    const cdkGraph = getComparableGraph(cdkStateMachine);
    const builderGraph = getComparableGraph(builderStateMachine);

    expect(builderGraph).to.deep.equal(cdkGraph);
  });

  it('renders lambda invoke with state defaults', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new lambda.Function(definitionScope, 'Function1', {
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
        });

        const lambdaInvoke1 = new sfnTasks.LambdaInvoke(definitionScope, 'LambdaInvoke1', {
          lambdaFunction: function1,
          payloadResponseOnly: true,
        });

        const lambdaInvoke2 = new sfnTasks.LambdaInvoke(definitionScope, 'LambdaInvoke2', {
          lambdaFunction: function1,
          payloadResponseOnly: false,
        });

        const definition = sfn.Chain.start(lambdaInvoke1.next(lambdaInvoke2));

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Pass-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new lambda.Function(definitionScope, 'Function1', {
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
        });

        const definition = new StateMachineBuilder()

          .lambdaInvoke('LambdaInvoke1', {
            lambdaFunction: function1,
          })
          .lambdaInvoke('LambdaInvoke2', {
            lambdaFunction: function1,
            payloadResponseOnly: false,
          })

          .build(definitionScope, {
            defaultProps: {
              lambdaInvoke: {
                payloadResponseOnly: true,
              },
            },
          });

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    const cdkGraph = getComparableGraph(cdkStateMachine);
    const builderGraph = getComparableGraph(builderStateMachine);

    expect(builderGraph).to.deep.equal(cdkGraph);
  });

  it('renders wait states', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Wait-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Wait(definitionScope, 'State1', {
          time: sfn.WaitTime.duration(cdk.Duration.seconds(1)),
        });
        const state2 = new sfn.Wait(definitionScope, 'State2', {
          time: sfn.WaitTime.duration(cdk.Duration.seconds(2)),
        });

        const definition = sfn.Chain.start(state1.next(state2));

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'Wait-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const definition = new StateMachineBuilder()

          .wait('State1', {
            time: sfn.WaitTime.duration(cdk.Duration.seconds(1)),
          })
          .wait('State2', {
            time: sfn.WaitTime.duration(cdk.Duration.seconds(2)),
          })

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    const cdkGraph = JSON.parse(cdkStateMachine.graphJson);
    const builderGraph = JSON.parse(builderStateMachine.graphJson);

    expect(builderGraph).to.deep.equal(cdkGraph);
  });

  it('renders multiple choices', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'MultipleChoice-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');

        const definition = sfn.Chain.start(
          new sfn.Choice(definitionScope, 'Choice1')
            .when(
              sfn.Condition.booleanEquals('$.var1', true),
              new sfn.Choice(definitionScope, 'Choice2')
                .when(sfn.Condition.booleanEquals('$.var2', true), state1)
                .otherwise(state2)
            )
            .otherwise(
              new sfn.Choice(definitionScope, 'Choice3')
                .when(sfn.Condition.booleanEquals('$.var3', true), state3)
                .otherwise(state4)
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack(new cdk.App(), 'XXX');

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'MultipleChoice-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');

        const definition = new StateMachineBuilder()

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: 'Choice2' }],
            otherwise: 'Choice3',
          })

          .choice('Choice2', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var2', true), next: 'State1' }],
            otherwise: 'State2',
          })

          .choice('Choice3', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var3', true), next: 'State3' }],
            otherwise: 'State4',
          })

          .perform(state1)
          .end()

          .perform(state2)
          .end()

          .perform(state3)
          .end()

          .perform(state4)
          .end()

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders succeed and fail', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'SucceedAndFail-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const succeed1 = new sfn.Succeed(definitionScope, 'Succeed1', {
          comment: 'Success 1',
        });
        const succeed2 = new sfn.Succeed(definitionScope, 'Succeed2', {
          comment: 'Success 2',
        });
        const fail1 = new sfn.Fail(definitionScope, 'Fail1', {
          comment: 'Failure 1',
        });
        const fail2 = new sfn.Fail(definitionScope, 'Fail2', {
          comment: 'Failure 2',
        });

        const definition = sfn.Chain.start(
          new sfn.Choice(definitionScope, 'Choice1')
            .when(
              sfn.Condition.booleanEquals('$.var1', true),
              new sfn.Choice(definitionScope, 'Choice2')
                .when(sfn.Condition.booleanEquals('$.var2', true), succeed1)
                .otherwise(fail1)
            )
            .otherwise(
              new sfn.Choice(definitionScope, 'Choice3')
                .when(sfn.Condition.booleanEquals('$.var3', true), succeed2)
                .otherwise(fail2)
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack(new cdk.App(), 'BuilderStack');

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'SucceedAndFail-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const definition = new StateMachineBuilder()

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: 'Choice2' }],
            otherwise: 'Choice3',
          })

          .choice('Choice2', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var2', true), next: 'Succeed1' }],
            otherwise: 'Fail1',
          })

          .choice('Choice3', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var3', true), next: 'Succeed2' }],
            otherwise: 'Fail2',
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

          .fail('Fail2', {
            comment: 'Failure 2',
          })

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders maps', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'Maps-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');
        const state7 = new sfn.Pass(definitionScope, 'State7');
        const state8 = new sfn.Pass(definitionScope, 'State8');

        const definition = sfn.Chain.start(
          new sfn.Map(definitionScope, 'Map1', {
            itemsPath: '$.Items1',
          })
            .iterator(state1.next(state2.next(state3.next(state4))))
            .next(
              new sfn.Map(definitionScope, 'Map2', {
                itemsPath: '$.Items2',
              }).iterator(state5.next(state6.next(state7.next(state8))))
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack();

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'Maps-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');
        const state7 = new sfn.Pass(definitionScope, 'State7');
        const state8 = new sfn.Pass(definitionScope, 'State8');

        const definition = new StateMachineBuilder()
          .map('Map1', {
            itemsPath: '$.Items1',
            iterator: new StateMachineBuilder().perform(state1).perform(state2).perform(state3).perform(state4),
          })
          .map('Map2', {
            itemsPath: '$.Items2',
            iterator: new StateMachineBuilder().perform(state5).perform(state6).perform(state7).perform(state8),
          })
          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders parallels', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'Parallels-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');
        const state7 = new sfn.Pass(definitionScope, 'State7');
        const state8 = new sfn.Pass(definitionScope, 'State8');

        const definition = sfn.Chain.start(
          new sfn.Parallel(definitionScope, 'Parallel1')
            .branch(state1.next(state2))
            .branch(state3.next(state4))
            .next(
              new sfn.Parallel(definitionScope, 'Parallel2').branch(state5.next(state6)).branch(state7.next(state8))
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack();

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'Parallels-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');
        const state5 = new sfn.Pass(definitionScope, 'State5');
        const state6 = new sfn.Pass(definitionScope, 'State6');
        const state7 = new sfn.Pass(definitionScope, 'State7');
        const state8 = new sfn.Pass(definitionScope, 'State8');

        const definition = new StateMachineBuilder()

          .parallel('Parallel1', {
            branches: [
              new StateMachineBuilder().perform(state1).perform(state2),
              new StateMachineBuilder().perform(state3).perform(state4),
            ],
          })

          .parallel('Parallel2', {
            branches: [
              new StateMachineBuilder().perform(state5).perform(state6),
              new StateMachineBuilder().perform(state7).perform(state8),
            ],
          })

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders catches', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'Catches-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new sfnTasks.EvaluateExpression(definitionScope, 'Function1', {
          expression: '$.Var1 > 0',
        });
        const function2 = new sfnTasks.EvaluateExpression(definitionScope, 'Function2', {
          expression: '$.Var1 > 0',
        });

        const catch1 = new sfn.Pass(definitionScope, 'Catch1');
        const catch2 = new sfn.Pass(definitionScope, 'Catch2');
        const catch3 = new sfn.Pass(definitionScope, 'Catch3');
        const catch4 = new sfn.Pass(definitionScope, 'Catch4');
        const catch5 = new sfn.Pass(definitionScope, 'Catch5');
        const catch6 = new sfn.Pass(definitionScope, 'Catch6');

        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');

        const definition = sfn.Chain.start(
          function1
            .addCatch(catch1, { errors: ['States.Timeout'] })
            .addCatch(catch2, { errors: ['States.All'] })
            .next(
              function2
                .addCatch(catch3, { errors: ['States.Timeout'] })
                .addCatch(catch4, { errors: ['States.All'] })
                .next(
                  new sfn.Map(definitionScope, 'Map1', {
                    itemsPath: '$.Items1',
                  })
                    .iterator(state1.next(state2))
                    .addCatch(catch5)
                    .next(new sfn.Parallel(definitionScope, 'Parallel1').branch(state3, state4).addCatch(catch6))
                )
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack();

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'Catches-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const function1 = new sfnTasks.EvaluateExpression(definitionScope, 'Function1', {
          expression: '$.Var1 > 0',
        });
        const function2 = new sfnTasks.EvaluateExpression(definitionScope, 'Function2', {
          expression: '$.Var1 > 0',
        });

        const catch1 = new sfn.Pass(definitionScope, 'Catch1');
        const catch2 = new sfn.Pass(definitionScope, 'Catch2');
        const catch3 = new sfn.Pass(definitionScope, 'Catch3');
        const catch4 = new sfn.Pass(definitionScope, 'Catch4');
        const catch5 = new sfn.Pass(definitionScope, 'Catch5');
        const catch6 = new sfn.Pass(definitionScope, 'Catch6');

        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');
        const state4 = new sfn.Pass(definitionScope, 'State4');

        const definition = new StateMachineBuilder()

          .tryPerform(function1, {
            catches: [
              { errors: ['States.Timeout'], handler: 'Catch1' },
              { errors: ['States.All'], handler: 'Catch2' },
            ],
          })
          .tryPerform(function2, {
            catches: [
              { errors: ['States.Timeout'], handler: 'Catch3' },
              { errors: ['States.All'], handler: 'Catch4' },
            ],
          })
          .map('Map1', {
            itemsPath: '$.Items1',
            iterator: new StateMachineBuilder().perform(state1).perform(state2),
            catches: [{ handler: 'Catch5' }],
          })
          .parallel('Parallel1', {
            branches: [new StateMachineBuilder().perform(state3), new StateMachineBuilder().perform(state4)],
            catches: [{ handler: 'Catch6' }],
          })
          .end()

          .perform(catch1)
          .end()

          .perform(catch2)
          .end()

          .perform(catch3)
          .end()

          .perform(catch4)
          .end()

          .perform(catch5)
          .end()

          .perform(catch6)
          .end()

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(getComparableGraph(builderStateMachine)).to.deep.equal(getComparableGraph(cdkStateMachine));
  });

  it('renders common state', async () => {
    //
    const cdkStack = new cdk.Stack(new cdk.App(), 'CommonState-CDK');

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'CommonState-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');

        state2.next(state3);

        const definition = sfn.Chain.start(
          new sfn.Choice(definitionScope, 'Choice1')
            .when(sfn.Condition.booleanEquals('$.var1', true), state2)
            .otherwise(
              new sfn.Choice(definitionScope, 'Choice2')
                .when(sfn.Condition.booleanEquals('$.var2', true), state2)
                .otherwise(state1)
            )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack(new cdk.App(), 'CommonState-Builder');

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'CommonState-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');
        const state3 = new sfn.Pass(definitionScope, 'State3');

        const definition = new StateMachineBuilder()

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: 'State2' }],
            otherwise: 'Choice2',
          })

          .choice('Choice2', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var2', true), next: 'State2' }],
            otherwise: 'State1',
          })

          .perform(state1)
          .end()

          .perform(state2)
          .perform(state3)
          .end()

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders backwards loop', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'BackwardsLoop-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');

        const definition = sfn.Chain.start(
          state1.next(
            new sfn.Choice(definitionScope, 'Choice1')
              .when(sfn.Condition.booleanEquals('$.var1', true), state1)
              .otherwise(state2)
          )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack(new cdk.App(), 'BackwardsLoop-Builder');

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'BackwardsLoop-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');

        const definition = new StateMachineBuilder()

          .perform(state1)

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: 'State1' }],
            otherwise: 'State2',
          })

          .perform(state2)

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });

  it('renders multiple backwards loop', async () => {
    //
    const cdkStack = new cdk.Stack();

    const cdkStateMachine = new StateMachineWithGraph(cdkStack, 'MultipleBackwardsLoop-CDK', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');

        const definition = sfn.Chain.start(
          state1.next(
            new sfn.Choice(definitionScope, 'Choice1')
              .when(sfn.Condition.booleanEquals('$.var1', true), state1)
              .otherwise(
                new sfn.Choice(definitionScope, 'Choice2')
                  .when(sfn.Condition.booleanEquals('$.var2', true), state1)
                  .otherwise(state2)
              )
          )
        );

        return definition;
      },
    });

    writeGraphJson(cdkStateMachine);

    const builderStack = new cdk.Stack(new cdk.App(), 'MultipleBackwardsLoop-Builder');

    const builderStateMachine = new StateMachineWithGraph(builderStack, 'MultipleBackwardsLoop-Builder', {
      getDefinition: (definitionScope): sfn.IChainable => {
        //
        const state1 = new sfn.Pass(definitionScope, 'State1');
        const state2 = new sfn.Pass(definitionScope, 'State2');

        const definition = new StateMachineBuilder()

          .perform(state1)

          .choice('Choice1', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var1', true), next: state1.id }],
            otherwise: 'Choice2',
          })

          .choice('Choice2', {
            choices: [{ when: sfn.Condition.booleanEquals('$.var2', true), next: state1.id }],
            otherwise: state2.id,
          })

          .perform(state2)

          .build(definitionScope);

        return definition;
      },
    });

    writeGraphJson(builderStateMachine);

    expect(JSON.parse(builderStateMachine.graphJson)).to.deep.equal(JSON.parse(cdkStateMachine.graphJson));
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getComparableGraph(builderStateMachine: StateMachineWithGraph): any {
  //
  const { graphJson } = builderStateMachine;

  const comparableGraphJson = graphJson.replace(/\[TOKEN\.[0-9]+\]/g, '[TOKEN.n]');

  return JSON.parse(comparableGraphJson);
}

function writeGraphJson(stateMachine: StateMachineWithGraph): void {
  //
  const stateMachinePath = path.join(__dirname, 'stateMachines');

  if (!fs.existsSync(stateMachinePath)) fs.mkdirSync(stateMachinePath);

  fs.writeFileSync(path.join(stateMachinePath, `${stateMachine.node.id}.asl.json`), stateMachine.graphJson);
}
