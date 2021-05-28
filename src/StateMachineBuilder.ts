/* eslint-disable max-classes-per-file */
import * as cdk from '@aws-cdk/core';
import sfn = require('@aws-cdk/aws-stepfunctions');

interface INextableState extends sfn.State, sfn.INextable {}

interface BuilderCatchProps extends sfn.CatchProps {
  handler: string;
}

interface BuilderTryPerformProps {
  catches: BuilderCatchProps[];
}

interface BuilderChoice {
  when: sfn.Condition;
  next: string;
}

interface BuilderChoiceProps extends sfn.ChoiceProps {
  choices: BuilderChoice[];
  otherwise: string;
}

interface BuilderMapProps extends sfn.MapProps {
  iterator: StateMachineBuilder;
  catches?: BuilderCatchProps[];
}

interface BuilderParallelProps extends sfn.ParallelProps {
  branches: StateMachineBuilder[];
  catches?: BuilderCatchProps[];
}

interface BuilderStep {
  type: StepType;
  id: string;
  getIds(): string[];
}

enum StepType {
  Perform = 'Perform',
  TryPerform = 'TryPerform',
  Choice = 'Choice',
  End = 'End',
  Map = 'Map',
  Parallel = 'Parallel',
  Pass = 'Pass',
  Wait = 'Wait',
  Succeed = 'Succeed',
  Fail = 'Failure',
}

class PerformStep implements BuilderStep {
  //
  constructor(public state: INextableState) {
    this.type = StepType.Perform;
    this.id = state.id;
  }

  type: StepType;

  id: string;

  getIds(): string[] {
    return [this.id];
  }
}

class TryPerformStep implements BuilderStep {
  //
  constructor(public state: sfn.TaskStateBase, public props: BuilderTryPerformProps) {
    this.type = StepType.TryPerform;
    this.id = state.id;
  }

  type: StepType;

  id: string;

  getIds(): string[] {
    return [this.id];
  }
}

class ChoiceStep implements BuilderStep {
  //
  constructor(public id: string, public props: BuilderChoiceProps) {
    this.type = StepType.Choice;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

class MapStep implements BuilderStep {
  //
  constructor(public id: string, public props: BuilderMapProps) {
    this.type = StepType.Map;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id, ...this.props.iterator.getStepIds()];
  }
}

class ParallelStep implements BuilderStep {
  //
  constructor(public id: string, public props: BuilderParallelProps) {
    this.type = StepType.Parallel;
  }

  type: StepType;

  getIds(): string[] {
    //
    const branchIds = this.props.branches
      .map((branch) => branch.getStepIds())
      .reduce((previousIds, stepIds) => previousIds.concat(stepIds), []);

    return [this.id, ...branchIds];
  }
}

class EndStep implements BuilderStep {
  //
  constructor(suffix: number) {
    this.type = StepType.End;
    this.id = `End${suffix}`;
  }

  id: string;

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

class PassStep implements BuilderStep {
  //
  constructor(public id: string, public props?: sfn.PassProps) {
    this.type = StepType.Pass;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

class WaitStep implements BuilderStep {
  //
  constructor(public id: string, public props: sfn.WaitProps) {
    this.type = StepType.Wait;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

class FailStep implements BuilderStep {
  //
  constructor(public id: string, public props?: sfn.FailProps) {
    this.type = StepType.Fail;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

class SucceedStep implements BuilderStep {
  //
  constructor(public id: string, public props?: sfn.SucceedProps) {
    this.type = StepType.Succeed;
  }

  type: StepType;

  getIds(): string[] {
    return [this.id];
  }
}

export default class StateMachineBuilder {
  //
  private readonly steps = new Array<BuilderStep>();

  private readonly stepStateByIndex = new Map<number, sfn.State>();

  static new(): StateMachineBuilder {
    return new StateMachineBuilder();
  }

  getStepIds(): string[] {
    //
    const ids = this.steps
      .map((step) => step.getIds())
      .reduce((previousIds, stepIds) => previousIds.concat(stepIds), []);
    return ids;
  }

  perform(state: INextableState): StateMachineBuilder {
    this.steps.push(new PerformStep(state));
    return this;
  }

  tryPerform(state: sfn.TaskStateBase, props: BuilderTryPerformProps): StateMachineBuilder {
    this.steps.push(new TryPerformStep(state, props));
    return this;
  }

  choice(id: string, props: BuilderChoiceProps): StateMachineBuilder {
    this.steps.push(new ChoiceStep(id, props));
    return this;
  }

  end(): StateMachineBuilder {
    this.steps.push(new EndStep(this.steps.length));
    return this;
  }

  map(id: string, props: BuilderMapProps): StateMachineBuilder {
    this.steps.push(new MapStep(id, props));
    return this;
  }

  parallel(id: string, props: BuilderParallelProps): StateMachineBuilder {
    this.steps.push(new ParallelStep(id, props));
    return this;
  }

  pass(id: string, props?: sfn.PassProps): StateMachineBuilder {
    this.steps.push(new PassStep(id, props));
    return this;
  }

  succeed(id: string, props?: sfn.SucceedProps): StateMachineBuilder {
    this.steps.push(new SucceedStep(id, props));
    return this;
  }

  fail(id: string, props?: sfn.FailProps): StateMachineBuilder {
    this.steps.push(new FailStep(id, props));
    return this;
  }

  wait(id: string, props: sfn.WaitProps): StateMachineBuilder {
    this.steps.push(new WaitStep(id, props));
    return this;
  }

  build(scope: cdk.Construct): sfn.IChainable {
    //
    this.EnsureUniqueStepIds();

    this.EnsureValidTargetIds();

    // this.EnsureAllStepsAreReachable();

    return this.getStepChain(scope, 0);
  }

  private EnsureValidTargetIds(): void {
    //
    const invalidTargetIds = this.getInvalidTargetIds();

    if (invalidTargetIds.length > 0) {
      throw new Error(`Invalid target ids: ${invalidTargetIds.join(', ')}`);
    }
  }

  protected getInvalidTargetIds(): string[] {
    //
    const invalidTargetIds = new Set<string>();

    const isInvalidId = (id: string): boolean => this.steps.findIndex((s) => s.id === id) === -1;

    this.steps.forEach((step) => {
      //
      // eslint-disable-next-line default-case
      switch (step.type) {
        //
        case StepType.TryPerform:
          {
            const tryPerformStep = step as TryPerformStep;

            tryPerformStep.props.catches
              .filter((c) => isInvalidId(c.handler))
              .forEach((c) => invalidTargetIds.add(c.handler));
          }
          break;

        case StepType.Map:
          {
            const mapStep = step as MapStep;

            (mapStep.props.catches ?? [])
              .filter((c) => isInvalidId(c.handler))
              .forEach((c) => invalidTargetIds.add(c.handler));

            const iteratorInvalidTargetIds = mapStep.props.iterator.getInvalidTargetIds();
            iteratorInvalidTargetIds.forEach((id) => invalidTargetIds.add(id));
          }
          break;

        case StepType.Parallel:
          {
            const parallelStep = step as ParallelStep;

            (parallelStep.props.catches ?? [])
              .filter((c) => isInvalidId(c.handler))
              .forEach((c) => invalidTargetIds.add(c.handler));

            parallelStep.props.branches.forEach((branch) => {
              const branchInvalidTargetIds = branch.getInvalidTargetIds();
              branchInvalidTargetIds.forEach((id) => invalidTargetIds.add(id));
            });
          }
          break;

        case StepType.Choice:
          {
            const choiceStep = step as ChoiceStep;

            choiceStep.props.choices.filter((c) => isInvalidId(c.next)).forEach((c) => invalidTargetIds.add(c.next));

            if (isInvalidId(choiceStep.props.otherwise)) {
              invalidTargetIds.add(choiceStep.props.otherwise);
            }
          }
          break;
      }
    });

    return Array.from(invalidTargetIds);
  }

  private EnsureUniqueStepIds(): void {
    //
    const stepIdCounts = this.getStepIds().reduce((counts, id) => {
      if (counts.has(id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      } else {
        counts.set(id, 1);
      }
      return counts;
    }, new Map<string, number>());

    const duplicateStepIds = new Array<string>();
    stepIdCounts.forEach((count, id) => {
      if (count > 1) duplicateStepIds.push(id);
    });

    if (duplicateStepIds.length > 0) {
      throw new Error(`Duplicate ids: ${duplicateStepIds.join(', ')}`);
    }
  }

  private getStepChain(scope: cdk.Construct, stepIndex: number): sfn.IChainable {
    //
    const visitedStepState = this.stepStateByIndex.get(stepIndex);

    if (visitedStepState !== undefined) {
      return visitedStepState;
    }

    const step = this.steps[stepIndex];

    const stepState = this.getStepState(scope, step);

    this.stepStateByIndex.set(stepIndex, stepState);

    this.addSubChains(scope, step, stepState);

    const stepChain = this.hasNextStep(stepIndex)
      ? ((stepState as unknown) as sfn.INextable).next(this.getStepChain(scope, stepIndex + 1))
      : stepState;

    return stepChain;
  }

  // eslint-disable-next-line class-methods-use-this
  private getStepState(scope: cdk.Construct, step: BuilderStep): sfn.State {
    //
    let stepState: sfn.State;

    switch (step.type) {
      //
      case StepType.Perform:
        stepState = (step as PerformStep).state;
        break;

      case StepType.TryPerform:
        stepState = (step as TryPerformStep).state;
        break;

      case StepType.Choice:
        stepState = new sfn.Choice(scope, step.id, (step as ChoiceStep).props);
        break;

      case StepType.Map:
        stepState = new sfn.Map(scope, step.id, (step as MapStep).props);
        break;

      case StepType.Parallel:
        stepState = new sfn.Parallel(scope, step.id, (step as ParallelStep).props);
        break;

      case StepType.Pass:
        stepState = new sfn.Pass(scope, step.id, (step as PassStep).props);
        break;

      case StepType.Wait:
        stepState = new sfn.Wait(scope, step.id, (step as WaitStep).props);
        break;

      case StepType.Fail:
        stepState = new sfn.Fail(scope, step.id, (step as FailStep).props);
        break;

      case StepType.Succeed:
        stepState = new sfn.Succeed(scope, step.id, (step as SucceedStep).props);
        break;

      default:
        throw new Error(`Unhandled step type: ${JSON.stringify(step)}`);
    }

    return stepState;
  }

  private hasNextStep(stepIndex: number): boolean {
    //
    const stepType = this.steps[stepIndex].type;

    if (stepType === StepType.Choice || stepType === StepType.Succeed || stepType === StepType.Fail) {
      return false;
    }

    const isLastStep = stepIndex === this.steps.length - 1;
    const isNextStepEnd = !isLastStep && this.steps[stepIndex + 1].type === StepType.End;
    const hasNextStep = !(isLastStep || isNextStepEnd);

    return hasNextStep;
  }

  private getStepIndexById(id: string): number {
    //
    const stepIndex = this.steps.findIndex((s) => s.id === id);

    if (stepIndex === -1) {
      throw new Error(`Could not find index for id: ${id}`);
    }

    return stepIndex;
  }

  private addSubChains(scope: cdk.Construct, step: BuilderStep, stepState: sfn.State): void {
    //
    // eslint-disable-next-line default-case
    switch (step.type) {
      //
      case StepType.TryPerform:
        this.addTryPerformSubChains(scope, step as TryPerformStep, stepState as sfn.TaskStateBase);
        break;

      case StepType.Choice:
        this.addChoiceSubChains(scope, step as ChoiceStep, stepState as sfn.Choice);
        break;

      case StepType.Map:
        this.addMapSubChains(scope, step as MapStep, stepState as sfn.Map);
        break;

      case StepType.Parallel:
        this.addParallelSubChains(scope, step as ParallelStep, stepState as sfn.Parallel);
        break;
    }
  }

  private addTryPerformSubChains(scope: cdk.Construct, step: TryPerformStep, stepState: sfn.TaskStateBase): void {
    //
    step.props.catches.forEach((catchProps) => {
      //
      const handlerStepIndex = this.getStepIndexById(catchProps.handler);
      const handlerChain = this.getStepChain(scope, handlerStepIndex);

      stepState.addCatch(handlerChain, catchProps);
    });
  }

  private addChoiceSubChains(scope: cdk.Construct, step: ChoiceStep, stepState: sfn.Choice): void {
    //
    step.props.choices.forEach((choice) => {
      const nextIndex = this.getStepIndexById(choice.next);
      stepState.when(choice.when, this.getStepChain(scope, nextIndex));
    });

    const otherwiseStepIndex = this.getStepIndexById(step.props.otherwise);
    stepState.otherwise(this.getStepChain(scope, otherwiseStepIndex));
  }

  private addMapSubChains(scope: cdk.Construct, step: MapStep, stepState: sfn.Map): void {
    //
    stepState.iterator(step.props.iterator.build(scope));

    if (step.props?.catches) {
      step.props.catches.forEach((catchProps) => {
        //
        const handlerStepIndex = this.getStepIndexById(catchProps.handler);
        const handlerChain = this.getStepChain(scope, handlerStepIndex);

        stepState.addCatch(handlerChain, catchProps);
      });
    }
  }

  private addParallelSubChains(scope: cdk.Construct, step: ParallelStep, stepState: sfn.Parallel): void {
    //
    step.props.branches.forEach((branch) => {
      stepState.branch(branch.build(scope));
    });

    if (step.props?.catches) {
      step.props.catches.forEach((catchProps) => {
        //
        const handlerStepIndex = this.getStepIndexById(catchProps.handler);
        const handlerChain = this.getStepChain(scope, handlerStepIndex);

        stepState.addCatch(handlerChain, catchProps);
      });
    }
  }
}
