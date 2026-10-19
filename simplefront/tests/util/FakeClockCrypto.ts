import { createHash, webcrypto } from "node:crypto";
import { vi } from "vitest";

/** Real SHA digests with microtask completion: fake timers cannot drive native I/O.
 * Native Web Crypto itself is exercised by TickChain tests and browser probes. */
export function installFakeClockCrypto(): void {
  const subtle = new Proxy(webcrypto.subtle, {
    get(target, key) {
      if (key === "digest")
        return async (
          algorithm: string | { name: string },
          data: BufferSource,
        ) => {
          const name =
            typeof algorithm === "string" ? algorithm : algorithm.name;
          const bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
          return new Uint8Array(
            createHash(name.toLowerCase().replace(/-/g, ""))
              .update(bytes)
              .digest(),
          ).buffer;
        };
      const member = Reflect.get(target, key, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: webcrypto.randomUUID.bind(webcrypto),
    subtle,
  });
}
