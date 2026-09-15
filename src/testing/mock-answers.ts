import type { FakeConnection } from './fake-connection';
import type {
  ApiDirectoryShape,
  CallMethod,
  CallParams,
  CallResponse,
  EventName,
  EventUnion,
  JobMethod,
  JobResult,
} from '@/types/api-directory.type';
import type { Job } from '@/types/job.type';
import { fakeApiError } from './fake-api-error';
import { fakeJob, type FakeJobOverrides } from './fake-job';
import type { QueryEntity, QueryMethod } from '@/types/query.type';
import type { TrueNasMessage } from '@/types/truenas-message.type';

/**
 * Scripted answers, typed by the directory the client is typed against.
 *
 * Every one of these registers an *answer to a frame*, not a replacement for a
 * verb. The client's own `dispatch`, job correlation and subscription
 * bookkeeping run exactly as they do against an appliance; what changes is only
 * what comes back. That is what makes a spec written against this a test of the
 * client rather than a test of the double.
 */
export interface MockAnswers<D extends ApiDirectoryShape> {
  /**
   * Answer `method` with `response`, or with whatever the function makes of
   * the params it was called with.
   *
   * Query methods are excluded, and the exclusion is the point rather than a
   * restriction: they live in the call directory, so `mock.call('user.query',
   * 3)` is well-typed — a query method's response is the five-way union the
   * server may return, and a number is one arm — and then answers all three
   * query verbs from that one value. `mock.query` is where a collection is
   * scripted, from rows that feed the three of them consistently.
   */
  call<M extends Exclude<CallMethod<D>, QueryMethod<D['call']> & string>>(
    method: M,
    response: CallResponse<D, M> | ((params: CallParams<D, M>) => CallResponse<D, M>)
  ): void;

  /**
   * Answer a query method from one set of rows.
   *
   * `filters`, `select`, `order_by`, `limit` and `offset` are not applied: the
   * rows given are the rows answered. The frame still carries whatever the
   * caller sent, so a spec asserting on `sent` sees the real request — what is
   * not modelled is middleware's evaluation of it.
   *
   * Feeds all three verbs, because on the wire they are one method
   * distinguished by its options: `queryOne` sends `get: true` and gets the
   * first row, `queryCount` sends `count: true` and gets the row count, and
   * `query` gets the rows. Scripting them separately would let a spec disagree
   * with itself about what the collection holds.
   */
  query<M extends QueryMethod<D['call']> & string>(
    method: M,
    rows: QueryEntity<D['call'], M>[]
  ): void;

  /**
   * Answer a job method with the updates it should report, in order. Nothing
   * is synthesised: a sequence with no terminal state never completes.
   *
   * Each update is completed by {@link fakeJob} from its defaults, not from the
   * previous update — progress does not carry and success is not forced to
   * 100. `arguments` is not filled in from the starting call either, since a
   * job reached through `trackJob` has no such call.
   *
   * Returns the job's id (the first update may set it), for `trackJob`.
   */
  job<M extends JobMethod<D>>(
    method: M,
    updates: JobUpdate<JobResult<D, M>> | JobUpdate<JobResult<D, M>>[]
  ): number;

  /** Push a change to every subscriber of `events(event)`. */
  emit<E extends EventName<D>>(event: E, change: EventUnion<D, E>): void;
}

/**
 * One scripted job update. An alias rather than a second statement of the
 * shape: `job` completes each update through {@link fakeJob}, so the two
 * cannot usefully differ.
 */
export type JobUpdate<R> = FakeJobOverrides<R>;

/**
 * The id a `core.get_jobs` read is asking about.
 *
 * `trackJob` sends `[[['id', '=', jobId]]]`. Anything else — an unfiltered
 * read, or a filter on another field — is not a question this module can
 * answer from its registry, so it says so rather than guessing at
 * `params[0][0][2]`.
 */
function readJobId(read: TrueNasMessage): number | undefined {
  const [filters] = (read.params ?? []) as [unknown];
  if (!Array.isArray(filters) || filters.length !== 1) return undefined;

  const [clause] = filters as [unknown];
  if (!Array.isArray(clause) || clause.length !== 3) return undefined;

  const [field, operator, value] = clause as [unknown, unknown, unknown];
  if (field !== 'id' || operator !== '=' || typeof value !== 'number') return undefined;

  return value;
}

/** The options object a query verb sends as its second positional argument. */
interface QueryOptionsFrame {
  get?: boolean;
  count?: boolean;
}

export function createMockAnswers<D extends ApiDirectoryShape>(
  connection: FakeConnection
): MockAnswers<D> {
  /**
   * Ids for jobs a spec did not number itself.
   *
   * Per client, like every other registry here. Module-global, the id
   * `mock.job` returns depended on how many jobs every *other* client in the
   * process had registered first — so it moved as files were added, and a spec
   * asserting on the distance between two allocations was reading a counter
   * anything could advance.
   */
  let nextJobId = 1;

  const answer = (frame: TrueNasMessage, result: unknown): void => {
    connection.receive({ jsonrpc: '2.0', id: frame.id, result } as TrueNasMessage);
  };

  /** Scripted jobs by id: the whole walk, oldest first. */
  const sequences = new Map<number, Job[]>();

  /** How far along its walk each scripted job has been reported. */
  const position = new Map<number, number>();

  /** Jobs whose remaining updates are already on their way out. */
  const walking = new Set<number>();

  /** Ids a start has already run, so a later start does not reuse one. */
  const started = new Set<number>();

  /** The next id nothing else holds. */
  const allocateId = (): number => {
    while (sequences.has(nextJobId)) nextJobId++;
    return nextJobId++;
  };

  /** Methods a job is already scripted for. */
  const scriptedMethods = new Set<string>();

  /** The options a `core.get_jobs` read carried, if any. */
  const readOptions = (read: TrueNasMessage): QueryOptionsFrame | undefined => {
    const [, options] = (read.params ?? []) as [unknown, QueryOptionsFrame?];
    return options;
  };

  /**
   * Whether this read is the one a tracker opens with.
   *
   * `trackJob` sends only the filters; every query verb also sends an options
   * object (`query` sends `{}`). Checking the options for `get`/`count` instead
   * would mistake a plain `api.query` for a tracker and release the walk to
   * nobody. Unrecognised reads leave the walk alone, the harmless direction.
   */
  const isTracking = (read: TrueNasMessage): boolean =>
    ((read.params ?? []) as unknown[]).length === 1;

  /** Answer a `core.get_jobs` read in the shape its options asked for. */
  const answerRead = (read: TrueNasMessage, job: Job | undefined): void => {
    const options = readOptions(read);
    if (options?.count) return answer(read, job ? 1 : 0);
    if (options?.get) {
      // `do_get` raises `MatchNotFound` on an empty result rather than
      // returning nothing, and `queryOne` is typed non-nullable — so a `get`
      // with no job is an error, not `undefined`. The plain read still answers
      // `[]`, which is what lets `trackJob` on an unknown id complete instead
      // of hanging.
      return job ? answer(read, job) : notFound(read);
    }
    answer(read, job ? [job] : []);
  };

  /** Installed once, on the first scripted job. */
  let dispatcher: ((frame: TrueNasMessage) => void) | undefined;

  /** Whatever answered `core.get_jobs` before the dispatcher took it over. */
  let fallback: ((frame: TrueNasMessage) => void) | undefined;

  /**
   * Middleware's exact frame for a `get` that matched nothing — don't invent
   * friendlier text, or specs end up asserting a message only the fake sends.
   *
   * `MatchNotFound` is a bare `IndexError`, so `rpc.py`'s generic arm reports
   * `EINVAL` with its repr as the reason. `/api/<version>` nests that payload
   * under a JSON-RPC error's `data`; only legacy `/websocket` puts it top-level.
   */
  const notFound = (frame: TrueNasMessage): void => {
    errorTo(frame, fakeApiError({ reason: 'MatchNotFound()' }));
  };

  const errorTo = (frame: TrueNasMessage, error: NonNullable<TrueNasMessage['error']>): void => {
    connection.receive({ jsonrpc: '2.0', id: frame.id, error } as TrueNasMessage);
  };

  /**
   * One `core.get_jobs` answer for every scripted job, resolved by the id in
   * the read's filter — `autoReply` is last-write-wins per method, so one
   * registration per job would answer every read with the last job.
   *
   * Unknown ids fall back to whatever was registered before (so an earlier
   * `mock.query('core.get_jobs', …)` still works), else `[]`, as middleware
   * answers a reaped id.
   */
  const installSnapshotAnswer = (): void => {
    if (dispatcher) return;

    const answerSnapshot = (read: TrueNasMessage): void => {
      const id = readJobId(read);
      const sequence = id === undefined ? undefined : sequences.get(id);
      if (!sequence || id === undefined) {
        if (fallback) return fallback(read);
        // Shaped like any other read of this method: answering `[]` to a
        // `queryCount` hands back an array typed `number`, which is the same
        // silent wrong shape the hit path was fixed for.
        return answerRead(read, undefined);
      }

      // Where the job has got to, not where it started. A snapshot reports the
      // job's current state — `trackJob`'s own comment says the read exists
      // "so an already-finished job is still reported" — so a second reader
      // after the walk has run gets the finished job and completes, rather
      // than being told it is still running and waiting for events that have
      // already been sent.
      const at = position.get(id) ?? 0;
      answerRead(read, sequence[at]);

      // The rest of the walk, once the tracker is subscribed. The cursor
      // advances with each event, not ahead, so a concurrent reader isn't told
      // the job finished before the tracker saw it run. Only a tracker's read
      // releases the walk: a `get`/`count` has nobody on `jobEvents`, and
      // replaying into it would leave a later `trackJob` only the final state.
      if (!isTracking(read) || at >= sequence.length - 1 || walking.has(id)) return;
      walking.add(id);
      queueMicrotask(() => {
        for (let next = at + 1; next < sequence.length; next++) {
          position.set(id, next);
          connection.receive(jobEvent(sequence[next]));
        }
        walking.delete(id);
      });
    };

    dispatcher = answerSnapshot;
    fallback = connection.autoReply('core.get_jobs', answerSnapshot);
  };

  /**
   * Scripted jobs own `core.get_jobs` once there are any.
   *
   * Only `mock.query` can reach it — `core.get_jobs` carries an `entity`, so it
   * is a query method and `mock.call` excludes those.
   *
   * The dispatcher chains to whatever was registered before it, so scripting
   * that method and *then* a job composes. The other order cannot: the later
   * registration takes the method over, and a read for a scripted job is then
   * answered with someone else's row — `job()` completing with a job it never
   * started, silently. Refused loudly instead; `connection.reply` is still
   * there for a spec that wants the frames.
   */
  const refuseJobMethodTakeover = (method: string): void => {
    if (method !== 'core.get_jobs' || sequences.size === 0) return;

    throw new Error(
      "mock.query('core.get_jobs', …) cannot be registered after a " +
        'scripted job: jobs answer that method to report their progress, and ' +
        'taking it over makes them complete with the wrong job. Script it ' +
        'before the job, or drive the frames with connection.reply.'
    );
  };

  const jobEvent = (job: Job, messageId?: string): TrueNasMessage =>
    ({
      jsonrpc: '2.0',
      method: 'collection_update',
      params: {
        collection: 'core.get_jobs',
        msg: 'changed',
        id: job.id,
        fields: messageId ? { ...job, message_ids: [messageId] } : job,
      },
    }) as unknown as TrueNasMessage;

  return {
    call(method, response) {
      connection.autoReply(String(method), frame => {
        const params = (frame.params ?? []) as CallParams<D, typeof method>;
        answer(
          frame,
          typeof response === 'function'
            ? (response as (p: typeof params) => unknown)(params)
            : response
        );
      });
    },

    query(method, rows) {
      refuseJobMethodTakeover(method);
      connection.autoReply(method, frame => {
        const [, options] = (frame.params ?? []) as [unknown, QueryOptionsFrame?];
        if (options?.count) return answer(frame, rows.length);
        if (options?.get) {
          // `queryOne` is typed non-nullable and the appliance raises rather
          // than sending nothing, so answering `undefined` here would hand a
          // spec a value its own types say cannot exist.
          if (rows.length === 0) {
            // Addressed to this frame, not to `connection.replyError`, which
            // resolves the id by looking up the most recent frame for the
            // method. Two reads issued in the same tick both answer on
            // whichever went second, and `query` and `queryOne` share a method
            // here by design — so the wrong caller gets the error and the
            // right one hangs.
            return notFound(frame);
          }
          return answer(frame, rows[0]);
        }
        answer(frame, rows);
      });
    },

    job(method, updates) {
      const given = Array.isArray(updates) ? updates : [updates];
      if (given.length === 0) {
        throw new Error(
          `mock.job('${String(method)}', []) has nothing to answer with. ` +
            'A job needs at least one update; one that never reaches a ' +
            'terminal state is how you script a job that hangs.'
        );
      }

      // Every refusal first, then the id, then the walk. Allocating before the
      // refusals burned an id on a registration that never happened, and
      // `nextJobId` is how a spec predicts what the next auto-allocated job
      // will be called.
      const chosen = given[0].id;
      if (chosen !== undefined && sequences.has(chosen)) {
        throw new Error(
          `mock.job('${String(method)}', …) was given id ${String(chosen)}, ` +
            'which another scripted job already holds. Ids are how a spec ' +
            'reaches a job through trackJob, so two jobs cannot share one.'
        );
      }

      const conflicting = given.find(
        update => update.id !== undefined && update.id !== chosen
      );
      if (conflicting) {
        // Named against the first update rather than the allocated id, which
        // does not exist yet: the ids in the message are the ones the fixture
        // actually wrote. An update naming an id when the first did not is a
        // conflict too — it would otherwise be accepted or refused depending
        // on what the auto-allocator happened to be about to hand out.
        const first = chosen === undefined ? 'none' : String(chosen);
        throw new Error(
          `mock.job('${String(method)}', …) was given updates for different ` +
            `ids: ${first} and ${String(conflicting.id)}. They are updates to ` +
            'one job; script the second separately if it is a second job.'
        );
      }

      if (scriptedMethods.has(String(method))) {
        throw new Error(
          `mock.job('${String(method)}', …) is already scripted. Starting the ` +
            'method again would correlate onto one job id, which the appliance ' +
            'cannot produce; script one job per method, or reach the other ' +
            'through trackJob with the id this returned.'
        );
      }
      scriptedMethods.add(String(method));

      const id = chosen ?? allocateId();

      // Replayed, not simulated: no folding updates together or forcing success
      // to 100. Those are middleware's rules, and modelling them makes claims
      // about the appliance rather than testing the client.
      const sequence = given.map(
        update => fakeJob({ method: String(method), ...update, id }) as Job
      );

      sequences.set(id, sequence);
      installSnapshotAnswer();

      connection.autoReply(String(method), frame => {
        // Each start is a new job with an untouched walk; reusing a consumed
        // one would silently report only the terminal state. The first start
        // keeps the id `mock.job` returned, unless its walk was already
        // started, reported past (a `trackJob` read alone does that) or is
        // mid-replay.
        const fresh = started.has(id) || position.has(id) || walking.has(id);
        const runId = fresh ? allocateId() : id;
        started.add(runId);
        if (fresh) sequences.set(runId, sequence.map(job => ({ ...job, id: runId })));
        const run = sequences.get(runId) ?? sequence;

        // Registered before the id goes out, because delivering the id runs the
        // whole of `job()` synchronously: `callAndGetJobId` emits, `trackJob`
        // subscribes, and its opening `core.get_jobs` read is on the wire
        // before this line would otherwise have been reached.
        //
        // The remaining updates wait for that read. Sending them alongside the
        // id loses every intermediate state, because `trackJob` has not
        // subscribed yet and an update delivered in that turn arrives with
        // nobody listening — which is what the differential test caught,
        // scripted jobs reporting only their terminal state where a
        // hand-driven one reported the whole walk.
        connection.receive(jobEvent(run[0], frame.id));
      });

      return id;
    },

    emit(event, change) {
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: { collection: event, ...change },
      } as unknown as TrueNasMessage);
    },
  };
}
