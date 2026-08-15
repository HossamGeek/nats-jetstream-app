export enum CoreNatsDemoSubject {
  OrdersCreated = 'demo.orders.created',
  OrdersUpdated = 'demo.orders.updated',
  OrdersCancelled = 'demo.orders.cancelled',
  OrdersPaymentCompleted = 'demo.orders.payment.completed',
  OrdersOneTokenWildcard = 'demo.orders.*',
  OrdersAllWildcard = 'demo.orders.>',
  AtMostOnce = 'demo.at-most-once',
  JobsFanout = 'demo.jobs.fanout',
  JobsProcess = 'demo.jobs.process',
  UsersGet = 'demo.users.get',
  RpcSlow = 'demo.rpc.slow',
  RpcNoResponder = 'demo.rpc.no-responder',
}

export enum CoreNatsDemoFanOutSubscriber {
  SubscriberA = 'Subscriber A',
  SubscriberB = 'Subscriber B',
  SubscriberC = 'Subscriber C',
}

export enum CoreNatsDemoQueueWorker {
  WorkerA = 'A',
  WorkerB = 'B',
  WorkerC = 'C',
}

export enum CoreNatsDemoQueueGroup {
  DemoWorkers = 'demo-workers',
}
