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
  getTargetIds(): string[];
  getSubBuilders(): StateMachineBuilder[];
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

abstract class BuilderStepBase implements BuilderStep {
  //
  type: StepType;

  id: string;

  getIds(): string[] {
    return [this.id];
  }

  // eslint-disable-next-line class-methods-use-this
  getTargetIds(): string[] {
    return [];
  }

  // eslint-disable-next-line class-methods-use-this
  getSubBuilders(): StateMachineBuilder[] {
    return [];
  }
}

class PerformStep extends BuilderStepBase {
  //
  constructor(public state: INextableState) {
    super();
    this.type = StepType.Perform;
    this.id = state.id;
  }
}

class TryPerformStep extends BuilderStepBase {
  //
  constructor(public state: sfn.TaskStateBase, public props: BuilderTryPerformProps) {
    super();
    this.type = StepType.TryPerform;
    this.id = state.id;
  }

  getTargetIds(): string[] {
    return Array.from(this.props.catches.reduce((targetIds, c) => targetIds.add(c.handler), new Set<string>()));
  }
}

class ChoiceStep extends BuilderStepBase {
  //
  constructor(id: string, public props: BuilderChoiceProps) {
    super();
    this.id = id;
    this.type = StepType.Choice;
  }

  getTargetIds(): string[] {
    const choiceTargetIds = Array.from(
      this.props.choices.reduce((targetIds, c) => targetIds.add(c.next), new Set<string>())
    );
    const targetIds = choiceTargetIds.concat([this.props.otherwise]);
    return targetIds;
  }
}

class MapStep extends BuilderStepBase {
  //
  constructor(id: string, public props: BuilderMapProps) {
    super();
    this.id = id;
    this.type = StepType.Map;
  }

  getIds(): string[] {
    return [this.id, ...this.props.iterator.getStepIds()];
  }

  getTargetIds(): string[] {
    const catchTargetIds = Array.from(
      (this.props.catches ?? []).reduce((targetIds, c) => targetIds.add(c.handler), new Set<string>())
    );
    return catchTargetIds;
  }

  getSubBuilders(): StateMachineBuilder[] {
    return [this.props.iterator];
  }
}

class ParallelStep extends BuilderStepBase {
  //
  constructor(id: string, public props: BuilderParallelProps) {
    super();
    this.id = id;
    this.type = StepType.Parallel;
  }

  getIds(): string[] {
    const branchIds = this.props.branches
      .map((branch) => branch.getStepIds())
      .reduce((previousIds, stepIds) => previousIds.concat(stepIds), []);
    return [this.id, ...branchIds];
  }

  getTargetIds(): string[] {
    const catchTargetIds = Array.from(
      (this.props.catches ?? []).reduce((targetIds, c) => targetIds.add(c.handler), new Set<string>())
    );
    return catchTargetIds;
  }

  getSubBuilders(): StateMachineBuilder[] {
    return this.props.branches;
  }
}

class EndStep extends BuilderStepBase {
  //
  constructor() {
    super();
    this.type = StepType.End;
  }

  // eslint-disable-next-line class-methods-use-this
  getIds(): string[] {
    return [];
  }
}

class PassStep extends BuilderStepBase {
  //
  constructor(id: string, public props?: sfn.PassProps) {
    super();
    this.id = id;
    this.type = StepType.Pass;
  }
}

class WaitStep extends BuilderStepBase {
  //
  constructor(id: string, public props: sfn.WaitProps) {
    super();
    this.id = id;
    this.type = StepType.Wait;
  }
}

class FailStep extends BuilderStepBase {
  //
  constructor(id: string, public props?: sfn.FailProps) {
    super();
    this.id = id;
    this.type = StepType.Fail;
  }
}

class SucceedStep extends BuilderStepBase {
  //
  constructor(id: string, public props?: sfn.SucceedProps) {
    super();
    this.id = id;
    this.type = StepType.Succeed;
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
    this.steps.push(new EndStep());
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
    this.EnsureNonEmpty();

    this.EnsureUniqueStepIds();

    this.EnsureValidTargetIds();

    this.EnsureAllStepsAreReachable();

    return this.getStepChain(scope, 0);
  }

  private EnsureNonEmpty(): void {
    if (this.steps.length === 0) {
      throw new Error(`No steps defined`);
    }
  }

  private EnsureAllStepsAreReachable(): void {
    //
    const visitedSteps = new Set<string>();
    this.visitSteps(0, visitedSteps);

    const unvisitedStepIds = this.getStepIds().filter((id) => !visitedSteps.has(id));

    if (unvisitedStepIds.length > 0) {
      throw new Error(`Unreachable ids: ${unvisitedStepIds.join(', ')}`);
    }
  }

  protected visitSteps(stepIndex: number, visitedSteps: Set<string>): void {
    //
    const step = this.steps[stepIndex];

    if (visitedSteps.has(step.id)) {
      return;
    }

    visitedSteps.add(step.id);

    step
      .getTargetIds()
      .map((targetId) => this.getStepIndexById(targetId))
      .forEach((targetIndex) => this.visitSteps(targetIndex, visitedSteps));

    step.getSubBuilders().forEach((b) => b.visitSteps(0, visitedSteps));

    if (this.hasNextStep(stepIndex)) {
      this.visitSteps(stepIndex + 1, visitedSteps);
    }
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
      step
        .getTargetIds()
        .filter((id) => isInvalidId(id))
        .forEach((id) => invalidTargetIds.add(id));

      step.getSubBuilders().forEach((b) => b.getInvalidTargetIds().forEach((id) => invalidTargetIds.add(id)));
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
