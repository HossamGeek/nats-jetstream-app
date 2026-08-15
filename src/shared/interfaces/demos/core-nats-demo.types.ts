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

export interface DemoUserGetRequest {
  userId: string;
}

export interface DemoUserResponse {
  id: string;
  name: string;
}

export interface DemoRpcErrorResponse {
  status: 'error';
  error: string;
  message: string;
  subject: string;
}