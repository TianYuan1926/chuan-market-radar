import { createPublicJsonTransport } from "../../../universe/public-json-transport";
import type {
  CollectorAdapterRuntime,
  CollectorClock,
  CollectorRequestPolicy,
} from "../contracts";
import { createPublicRestCollectorAdapterRuntime } from "./public-rest-adapter-runtime";

export function createLivePublicRestCollectorAdapterRuntime(input: {
  clock: CollectorClock;
  fetchImplementation?: typeof fetch;
  policy?: CollectorRequestPolicy;
}): CollectorAdapterRuntime {
  return createPublicRestCollectorAdapterRuntime({
    clock: input.clock,
    policy: input.policy,
    transport: createPublicJsonTransport(
      input.fetchImplementation ?? fetch,
      () => input.clock.now(),
    ),
  });
}
