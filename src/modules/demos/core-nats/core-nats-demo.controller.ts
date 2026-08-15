import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiResponse } from "@shared/lib/responses/api-response";
import type { DemoUserResponse } from "@shared/interfaces/demos/core-nats-demo.types";
import { CoreNatsDemoService } from "./core-nats-demo.service";

@Controller("core-nats")
export class CoreNatsDemoController {
  constructor(private readonly coreNatsDemoService: CoreNatsDemoService) {}

  /** Runs all Core NATS demo scenarios in a predictable learning order. */
  @Post()
  async runAll(): Promise<ApiResponse> {
    // Execute each demo sequentially so log output is easy to read from top to bottom.
    await this.coreNatsDemoService.runExactSubjectDemo();
    await this.coreNatsDemoService.runStarWildcardDemo();
    await this.coreNatsDemoService.runGreaterThanWildcardDemo();
    await this.coreNatsDemoService.runFanOutDemo();
    await this.coreNatsDemoService.runQueueGroupBatchDemo(9);
    await this.coreNatsDemoService.runAtMostOnceDemo();

    return ApiResponse.successResponse(
      "Core NATS demos completed successfully.",
      {
        demo: "all",
        observation:
          "Ran exact, *, >, fan-out, queue-group, and at-most-once demos. Check Nest logs for [PUBLISH], [RECEIVED], and [QUEUE WORKER].",
      },
    );
  }

  /** Runs the exact-subject demo only. */
  @Post("exact")
  async runExact(): Promise<ApiResponse> {
    // This scenario proves a subscriber receives only its exact subject.
    await this.coreNatsDemoService.runExactSubjectDemo();
    return ApiResponse.successResponse(
      "Core NATS exact-subject demo completed successfully.",
      {
        demo: "exact",
        observation: "Only demo.orders.created should be received.",
      },
    );
  }

  /** Runs the single-token wildcard demo only. */
  @Post("star")
  async runStar(): Promise<ApiResponse> {
    // This scenario proves * matches one token but not nested trailing tokens.
    await this.coreNatsDemoService.runStarWildcardDemo();
    return ApiResponse.successResponse(
      "Core NATS wildcard demo completed successfully.",
      {
        demo: "star",
        observation: "demo.orders.* should receive created/updated/cancelled only.",
      },
    );
  }

  /** Runs the remaining-hierarchy wildcard demo only. */
  @Post("greater-than")
  async runGreaterThan(): Promise<ApiResponse> {
    // This scenario proves > matches all remaining subject tokens.
    await this.coreNatsDemoService.runGreaterThanWildcardDemo();
    return ApiResponse.successResponse(
      "Core NATS greater-than wildcard demo completed successfully.",
      {
        demo: "greater-than",
        observation: "demo.orders.> should receive shallow and nested subjects.",
      },
    );
  }

  /** Runs the multiple-independent-subscribers fan-out demo only. */
  @Post("fan-out")
  async runFanOut(): Promise<ApiResponse> {
    // This scenario proves non-queue subscribers all receive one published message.
    await this.coreNatsDemoService.runFanOutDemo();
    return ApiResponse.successResponse(
      "Core NATS fan-out demo completed successfully.",
      {
        demo: "fan-out",
        observation:
          "Subscriber A, Subscriber B, and Subscriber C should all receive one message.",
      },
    );
  }

  /** Publishes one job to three workers in the same Core NATS queue group. */
  @Post("queue-group/jobs")
  async publishQueueGroupJob(): Promise<ApiResponse> {
    await this.coreNatsDemoService.runQueueGroupJobDemo({ jobId: "job-100" });
    return ApiResponse.successResponse(
      "Core NATS queue-group job demo completed successfully.",
      {
        demo: "queue-group-job",
        observation: "One job should be handled by exactly one member of demo-workers.",
      },
    );
  }

  /** Publishes several jobs to make queue-group distribution visible in logs. */
  @Post("queue-group/jobs/batch")
  async publishQueueGroupBatch(): Promise<ApiResponse> {
    await this.coreNatsDemoService.runQueueGroupBatchDemo(9);
    return ApiResponse.successResponse(
      "Core NATS queue-group batch demo completed successfully.",
      {
        demo: "queue-group-batch",
        observation:
          "Each published job should be handled by one demo-workers member; no strict order is guaranteed.",
      },
    );
  }

  /** Runs the Core NATS at-most-once demo only. */
  @Post("at-most-once")
  async runAtMostOnce(): Promise<ApiResponse> {
    // This scenario proves message-2 is not replayed after publishing with no active subscriber.
    await this.coreNatsDemoService.runAtMostOnceDemo();
    return ApiResponse.successResponse(
      "Core NATS at-most-once demo completed successfully.",
      {
        demo: "at-most-once",
        observation: "message-1 and message-3 should be received; message-2 should not.",
      },
    );
  }

  /** Fetches a user through the Core NATS request/reply RPC demo. */
  @Get("request-reply/users/:id")
  async getUser(@Param("id") id: string): Promise<DemoUserResponse> {
    // The controller only orchestrates; the demo service performs the NATS round trip.
    return this.coreNatsDemoService.getUser(id);
  }

  /** Demonstrates a request that times out because the responder replies too slowly. */
  @Get("request-reply/timeout")
  async requestReplyTimeout(): Promise<void> {
    await this.coreNatsDemoService.triggerTimeout();
  }

  /** Demonstrates a request to a subject that has no active responder. */
  @Get("request-reply/no-responder")
  async requestReplyNoResponder(): Promise<void> {
    await this.coreNatsDemoService.triggerNoResponder();
  }
}
