export interface DemoOrderPayload {
  orderId: string;
  status: string;
}

export interface DemoTextPayload {
  value: string;
}

export interface DemoJobPayload {
  jobId: string;
}

export interface DemoJobBatchRequest {
  count: number;
}

export interface CoreNatsDemoRunResponse {
  demo: string;
  status: 'started-and-finished';
  observation: string;
}
