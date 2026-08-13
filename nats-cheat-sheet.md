
| الموضوع                    | الفكرة اللي لازم تفتكرها                                                        | كلمة مفتاحية             | مثال بسيط                                                                |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| **Core NATS**              | Messaging سريع لحظي. الرسالة مش معمولة أساسًا عشان تتخزن وتستنى Consumer غايب   | **Real-time**            | `Service A → users.status → Service B` لو B مش موجود، ممكن يفوّت الرسالة |
| **Subject**                | العنوان اللي بنبعت عليه الرسالة                                                 | **Address**              | `orders.created`                                                         |
| **Publisher**              | اللي بيبعت Message على Subject                                                  | **Sender**               | Order Service ينشر `order.created`                                       |
| **Subscriber**             | اللي بيسمع على Subject                                                          | **Receiver**             | Notification Service تسمع `order.created`                                |
| **Wildcard `*`**           | يطابق **token واحد** فقط                                                        | **One token**            | `orders.*` يطابق `orders.created`                                        |
| **Wildcard `>`**           | يطابق باقي مستويات الـ Subject                                                  | **Everything after**     | `orders.>` يطابق `orders.payment.completed`                              |
| **Core Pub/Sub**           | كل Subscriber عادي على نفس Subject يستقبل Copy                                  | **Broadcast**            | Email وAnalytics الاتنين يسمعوا `user.created`                           |
| **Queue Group**            | عدة Subscribers لنفس الشغل، الرسالة تروح لواحد منهم                             | **Load balance**         | 3 email workers، كل Email يروح لواحد فقط                                 |
| **Request / Reply**        | Service تسأل Service وتستنى Response                                            | **RPC**                  | `inventory.check → {available:true}`                                     |
| **Inbox**                  | Subject مؤقت وفريد لاستقبال Reply                                               | **Reply address**        | `_INBOX.x7as...`                                                         |
| **JetStream**              | يضيف Persistence وConsumers وACK وReplay فوق NATS                               | **Durability**           | Consumer واقع وقت `order.created`، يرجع يلاقي الرسالة                    |
| **Stream**                 | مخزن للـ Messages التي تطابق Subjects محددة                                     | **Storage**              | `ORDERS` يخزن `orders.>`                                                 |
| **Stream Subjects**        | بتحدد إيه اللي يدخل الـ Stream                                                  | **What to store**        | Stream subjects = `orders.>`                                             |
| **Consumer**               | قارئ Stateful للـ Stream ويعرف وصل لفين وإيه مستني ACK                          | **Reader + State**       | `payment-worker` يقرأ من `ORDERS`                                        |
| **Durable Consumer**       | حالة الـ Consumer تفضل محفوظة بعد restart                                       | **Remember me**          | Worker وقف عند #100، يرجع يكمل                                           |
| **Ephemeral Consumer**     | Consumer مؤقت للاستخدام الحالي                                                  | **Temporary**            | Consumer مؤقت لقراءة سريعة                                               |
| **Push Consumer**          | السيرفر هو اللي يدفع الرسائل للـ Consumer                                       | **Server pushes**        | `JetStream → Worker → Worker...`                                         |
| **Pull Consumer**          | Worker هو اللي يطلب Messages لما يكون جاهز                                      | **Worker pulls**         | Worker يقول: هاتلي 10 Messages                                           |
| **ACK**                    | المعالجة نجحت والرسالة خلصت                                                     | **Success**              | Save order ✅ → `msg.ack()`                                               |
| **NAK**                    | المعالجة فشلت مؤقتًا وعايز Retry                                                | **Try again**            | Payment API down → NAK                                                   |
| **TERM**                   | فشل نهائي ومش عايز Redelivery طبيعي                                             | **Stop**                 | Payload غير صالح نهائيًا → TERM                                          |
| **No ACK**                 | JetStream مش عارف العملية نجحت ولا لأ                                           | **Unknown**              | Worker crash قبل ACK                                                     |
| **Redelivery**             | نفس الرسالة تتسلم مرة تانية لأنها لم تكتمل                                      | **Retry delivery**       | Worker وقع → Message تروح Worker آخر                                     |
| **AckWait**                | قد إيه JetStream يستنى ACK قبل ما يفكر في Redelivery                            | **ACK timeout**          | `AckWait = 30s`                                                          |
| **MaxDeliver**             | أقصى عدد مرات تسليم Message                                                     | **Retry limit**          | جرّب الرسالة 5 مرات فقط                                                  |
| **Backoff**                | المدة بين محاولات الـ Retry                                                     | **Retry timing**         | `5s → 30s → 2m`                                                          |
| **LimitsPolicy**           | الرسالة تفضل محفوظة حسب Limits حتى لو اتعملها ACK                               | **History**              | احتفظ بـ order events لمدة 7 أيام                                        |
| **WorkQueuePolicy**        | الرسالة Job؛ بعد نجاح المعالجة وACK يتم التخلص منها حسب semantics الـ WorkQueue | **Job**                  | `send-email` يعالجه Worker واحد                                          |
| **InterestPolicy**         | الرسالة تفضل طالما الـ Consumers المهتمة الحالية لسه محتاجاها                   | **Interest**             | Consumer A وB مهتمين؛ تنتظر إكمالهم                                      |
| **Persistence**            | الـ Message نفسها محفوظة                                                        | **Stored message**       | السيرفر restart والرسالة ما زالت موجودة                                  |
| **Retention**              | الرسالة تفضل محفوظة لمدة/حد قد إيه                                              | **How long**             | `MaxAge = 7 days`                                                        |
| **Replay**                 | قراءة Messages قديمة ما زالت موجودة                                             | **Read history**         | Analytics يبدأ من Events امبارح                                          |
| **Redelivery vs Replay**   | Redelivery = Retry. Replay = قراءة History                                      | **Retry ≠ History**      | Crash → Redelivery، Consumer جديد من البداية → Replay                    |
| **Memory Storage**         | تخزين Messages في الذاكرة                                                       | **RAM**                  | Temporary/high-speed stream                                              |
| **File Storage**           | تخزين Messages على Disk                                                         | **Disk**                 | Orders المهمة تتحفظ على disk                                             |
| **Storage vs Retention**   | Storage = فين تتخزن، Retention = إمتى تتمسح                                     | **Where vs How long**    | File + MaxAge 7 days                                                     |
| **DeliverAll**             | Consumer يبدأ من أول رسالة متاحة                                                | **Beginning**            | Stream فيه 1000 رسالة → يبدأ من #1                                       |
| **DeliverNew**             | يقرأ الرسائل التي تأتي بعد إنشائه فقط                                           | **From now**             | يتجاهل الـ 1000 القديمة                                                  |
| **DeliverLast**            | يبدأ من آخر Message موجودة ثم يكمل الجديد                                       | **Last**                 | يبدأ من #1000 ثم #1001                                                   |
| **Start Sequence**         | يبدأ من Sequence معين                                                           | **Position**             | ابدأ من Message #500                                                     |
| **Start Time**             | يبدأ من الرسائل من وقت محدد                                                     | **Timestamp**            | Events بعد الساعة 10                                                     |
| **ReplayInstant**          | شغّل الـ History بأقصى سرعة                                                     | **Fast replay**          | 1000 Event قديمة تتقرأ بسرعة                                             |
| **ReplayOriginal**         | يحاول يحافظ على Timing الرسائل الأصلية أثناء Replay                             | **Original timing**      | رسالة كانت بين كل واحدة والتانية 10s                                     |
| **Consumer Filter**        | Consumer يشوف جزء من Stream فقط                                                 | **Subset**               | Stream `orders.>` وConsumer يقرأ `orders.payment.>`                      |
| **Batch**                  | كام Message تسحبها في المرة                                                     | **Fetch amount**         | Pull worker يسحب 100                                                     |
| **Concurrency**            | كام Message تتعالج في نفس اللحظة                                                | **Parallelism**          | Batch 100 لكن Concurrency 10                                             |
| **Backpressure**           | منع وصول شغل أسرع من قدرة التطبيق                                               | **Don't overload me**    | Worker مشغول → مايسحبش Messages زيادة                                    |
| **MaxAckPending**          | الحد الأقصى للرسائل المتسلّمة ولسه بدون ACK                                     | **In-flight limit**      | MaxAckPending = 100                                                      |
| **Flow Control**           | تنظيم معدل إرسال Messages للـ Consumer خصوصًا Push                              | **Control delivery**     | Slow consumer → نقلل الضغط عليه                                          |
| **Replication**            | Stream لها أكثر من نسخة على Nodes مختلفة                                        | **Copies**               | `Replicas = 3`                                                           |
| **Leader**                 | Node تنظم تغييرات replicated state                                              | **Coordinator**          | Writes تمر عبر leader logic                                              |
| **Follower**               | Nodes أخرى تحتفظ بنسخ من البيانات                                               | **Replica**              | Node B وC يتبعوا Leader A                                                |
| **Consensus**              | الـ Nodes تتفق على الحالة الصحيحة                                               | **Agreement**            | مين الـ Leader؟ وإيه آخر write؟                                          |
| **Quorum**                 | الأغلبية المطلوبة لاتخاذ قرارات آمنة                                            | **Majority**             | R3 → Quorum 2                                                            |
| **High Availability**      | الخدمة تفضل متاحة رغم بعض الأعطال                                               | **Stay online**          | Node واحدة تقع والنظام يكمل                                              |
| **Fault Tolerance**        | النظام مصمم لتحمل عدد معين من failures                                          | **Survive failures**     | R3 يتحمل فقد Node واحدة مع بقاء quorum                                   |
| **Multiple Workers**       | نفس Consumer ممكن يخدمه Workers متعددة لتوزيع العمل                             | **Scale out**            | `payment-worker` + 3 instances                                           |
| **1 Consumer + 3 Workers** | نفس الوظيفة تتوزع بين Workers                                                   | **Competing workers**    | Message #1 لـ A، #2 لـ B                                                 |
| **Multiple Consumers**     | كل Consumer له State مستقل وغالبًا Purpose مختلف                                | **Independent readers**  | Payment + Analytics + Audit                                              |
| **At-most-once**           | الرسالة تتسلم **0 أو 1** مرة                                                    | **May lose**             | Delivery مرة أو تضيع                                                     |
| **At-least-once**          | الرسالة تتسلم **1 أو أكثر**                                                     | **May duplicate**        | ACK ضاع → نفس Message ترجع                                               |
| **Exactly-once**           | الهدف إن العملية تحصل مرة واحدة فقط                                             | **Exactly 1**            | خصم العميل مرة واحدة                                                     |
| **Idempotency**            | حتى لو الرسالة وصلت مرتين، الـ Business Effect يحصل مرة واحدة                   | **Safe repeat**          | `payment_order_100` اتنفذ؟ متخصمش تاني                                   |
| **Deduplication**          | منع Duplicate Publish من التخزين كرسالة جديدة                                   | **Duplicate publish**    | نفس `messageId=evt_123` يتبعت مرتين                                      |
| **Dedup vs Idempotency**   | Dedup يحمي دخول الرسالة، Idempotency يحمي تنفيذ العملية                         | **Producer vs Consumer** | Duplicate publish مقابل duplicate processing                             |
| **Ordering**               | ترتيب التخزين مش شرط يكون ترتيب انتهاء الـ Processing                           | **Order**                | #1 و#2؛ Worker بتاع #2 يخلص الأول                                        |
| **Concurrency + Ordering** | Parallel processing ممكن يكسر ترتيب التنفيذ                                     | **Out of order**         | Created يتأخر وPaid يخلص الأول                                           |
| **Poison Message**         | Message تفشل كل مرة ومش هتتحل بمجرد Retry                                       | **Always fails**         | Payload ناقص field أساسي                                                 |
| **DLQ**                    | مكان مخصص للرسائل الفاشلة للمراجعة أو Reprocess                                 | **Failed messages**      | بعد 5 failures → `orders.dlq`                                            |
| **TERM vs DLQ**            | TERM يمنع Retry، لكنه لا ينشئ DLQ لوحده                                         | **Stop ≠ Store**         | `term()` ثم أنت تحفظ failure في DLQ                                      |
| **Graceful Shutdown**      | وقف الشغل الجديد وخلّص الجاري قبل إغلاق التطبيق                                 | **Safe shutdown**        | Deploy أثناء معالجة 5 jobs                                               |
| **Drain**                  | إنهاء الـ in-flight work/traffic بشكل منظم ثم إغلاق الاتصال                     | **Finish then close**    | Stop receiving → finish → close                                          |
| **Core NATS Pub/Sub**      | للرسائل اللحظية التي فقدانها مقبول                                              | **Transient**            | Online status update                                                     |
| **Core Request/Reply**     | لما محتاج Response مباشر من Service أخرى                                        | **RPC**                  | `pricing.calculate`                                                      |
| **JetStream Events**       | Event مهم لازم مايضيعش ويمكن Replay                                             | **Durable Event**        | `order.created`                                                          |
| **JetStream Jobs**         | Background work يحتاج ACK/Retry/Durability                                      | **Worker Job**           | `image.resize`                                                           |

### أهم 10 سطور لو عايز مراجعة في دقيقة

```text
Subject        = عنوان الرسالة
Stream         = الرسائل اللي هخزنها
Consumer       = إزاي ومين هيقرأ الرسائل

ACK            = نجحت
NAK            = حاول تاني
TERM           = متحاولش تاني
Redelivery     = إعادة تسليم بسبب عدم اكتمال الرسالة

Retention      = هحتفظ بالرسالة لحد إمتى
Replay         = اقرأ History قديمة
Pull Consumer  = الـ Worker يسحب لما يكون جاهز
```

وبالنسبة للـ reliability:

```text
At-most-once  = 0 or 1
At-least-once = 1 or more
Exactly-once  = exactly 1
```

وأهم فرقين في المنهج كله تقريبًا:

```text
Replay      ≠ Redelivery
History       Retry
```

و:

```text
Deduplication ≠ Idempotency

Deduplication:
متدخلش نفس الـ publish مرتين

Idempotency:
حتى لو وصلت مرتين، متنفذش العملية مرتين
```

وأخيرًا قاعدة الاختيار:

```text
رسالة لحظية وضياعها مقبول
        ↓
     Core NATS

Request محتاج Response
        ↓
Core NATS Request/Reply

Event / Job مينفعش يضيع
        ↓
     JetStream
```


### الخريطة الذهنية المختصرة جدًا

لو نسيت كل الجدول، ارجع للصورة دي:

```text
                         NATS
                          │
              ┌───────────┴───────────┐
              │                       │
          Core NATS               JetStream
              │                       │
     ┌────────┼────────┐         Stream 💾
     │        │        │              │
   Pub/Sub  Queue   Request/Reply   Consumer
            Group                     │
                                      ├─ ACK
                                      ├─ NAK
                                      ├─ TERM
                                      ├─ Retry
                                      ├─ Replay
                                      └─ Filtering
```

والـ JetStream نفسه افتكره بالسلسلة دي:

```text
Subject
   ↓
Stream
   ↓
Persistence + Retention
   ↓
Consumer
   ↓
Pull / Push
   ↓
Processing
   ↓
ACK / NAK / TERM
   ↓
Redelivery / Retry
```

ولما تدخل Production thinking:

```text
At-least-once
      +
Idempotency
      +
Retry / Backoff
      +
DLQ
      +
Graceful Shutdown
      =
Worker system محترم
```

وأهم قاعدة قرار:

```text
هل ضياع الرسالة مقبول؟
        │
    ┌───┴───┐
    │       │
   نعم      لا
    │       │
Core NATS  JetStream
```

ولو عايز **Response فوري من Service تانية**:

```text
Core NATS Request/Reply
```

ولو عايز **Event/Job محفوظ ويتعالج حتى لو الـ consumer كان واقع**:

```text
JetStream
```

ده حاليًا أفضل Cheat Sheet للمرحلة اللي وصلنالها، وبعد ما نبدأ التطبيق نضيف له قسم جديد اسمه **NATS.js v3 Practical API** ونحط تحت كل مفهوم الكود الحديث المقابل له.
