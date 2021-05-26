/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-new */
import * as fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import StateMachineWithGraph from '@andybalham/state-machine-with-graph';
import StateMachineBuilder from '../src';
import sfnTasks = require('@aws-cdk/aws-stepfunctions-tasks');
import cdk = require('@aws-cdk/core');
import sfn = require('@aws-cdk/aws-stepfunctions');

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

  it('renders pass states', async () => {
    //
    const cdkStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'SimpleChain-CDK', {
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

    const builderStateMachine = new StateMachineWithGraph(new cdk.Stack(), 'SimpleChain-Builder', {
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

function getComparableGraph(builderStateMachine: StateMachineWithGraph): void {
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
