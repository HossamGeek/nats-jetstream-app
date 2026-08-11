import { Controller, Post } from '@nestjs/common';
import type { CoreNatsDemoRunResponse } from '../../shared/interfaces/demos/core-nats-demo.types';
import { CoreNatsDemoService } from './core-nats-demo.service';

@Controller('demos/core-nats')
export class CoreNatsDemoController {
  constructor(private readonly coreNatsDemoService: CoreNatsDemoService) {}

  /** Runs all Core NATS demo scenarios in a predictable learning order. */
  @Post('all')
  async runAll(): Promise<CoreNatsDemoRunResponse> {
    // Execute each demo sequentially so log output is easy to read from top to bottom.
    await this.coreNatsDemoService.runExactSubjectDemo();
    await this.coreNatsDemoService.runStarWildcardDemo();
    await this.coreNatsDemoService.runGreaterThanWildcardDemo();
    await this.coreNatsDemoService.runFanOutDemo();
    await this.coreNatsDemoService.runAtMostOnceDemo();

    return this.coreNatsDemoService.createResponse(
      'all',
      'Ran exact, *, >, fan-out, and at-most-once demos. Check Nest logs for [PUBLISH] and [RECEIVED].',
    );
  }

  /** Runs the exact-subject demo only. */
  @Post('exact')
  async runExact(): Promise<CoreNatsDemoRunResponse> {
    // This scenario proves a subscriber receives only its exact subject.
    await this.coreNatsDemoService.runExactSubjectDemo();
    return this.coreNatsDemoService.createResponse(
      'exact',
      'Only demo.orders.created should be received.',
    );
  }

  /** Runs the single-token wildcard demo only. */
  @Post('star')
  async runStar(): Promise<CoreNatsDemoRunResponse> {
    // This scenario proves * matches one token but not nested trailing tokens.
    await this.coreNatsDemoService.runStarWildcardDemo();
    return this.coreNatsDemoService.createResponse(
      'star',
      'demo.orders.* should receive created/updated/cancelled only.',
    );
  }

  /** Runs the remaining-hierarchy wildcard demo only. */
  @Post('greater-than')
  async runGreaterThan(): Promise<CoreNatsDemoRunResponse> {
    // This scenario proves > matches all remaining subject tokens.
    await this.coreNatsDemoService.runGreaterThanWildcardDemo();
    return this.coreNatsDemoService.createResponse(
      'greater-than',
      'demo.orders.> should receive shallow and nested subjects.',
    );
  }

  /** Runs the multiple-independent-subscribers fan-out demo only. */
  @Post('fan-out')
  async runFanOut(): Promise<CoreNatsDemoRunResponse> {
    // This scenario proves two non-queue subscribers both receive one published message.
    await this.coreNatsDemoService.runFanOutDemo();
    return this.coreNatsDemoService.createResponse(
      'fan-out',
      'Subscriber A and Subscriber B should both receive one message.',
    );
  }

  /** Runs the Core NATS at-most-once demo only. */
  @Post('at-most-once')
  async runAtMostOnce(): Promise<CoreNatsDemoRunResponse> {
    // This scenario proves message-2 is not replayed after publishing with no active subscriber.
    await this.coreNatsDemoService.runAtMostOnceDemo();
    return this.coreNatsDemoService.createResponse(
      'at-most-once',
      'message-1 and message-3 should be received; message-2 should not.',
    );
  }
}
