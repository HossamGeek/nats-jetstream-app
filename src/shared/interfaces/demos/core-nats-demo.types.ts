export interface DemoOrderPayload {
  orderId: string;
  status: string;
}

export interface DemoTextPayload {
  value: string;
}

export interface CoreNatsDemoRunResponse {
  demo: string;
  status: 'started-and-finished';
  observation: string;
}
