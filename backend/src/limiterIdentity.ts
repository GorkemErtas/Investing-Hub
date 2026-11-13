import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { isIP } from "node:net";

// The Railway edge must be the only untrusted ingress when enabled. Both the
// public API and account limiter must use the same overwritten edge header.
export function limiterIdentity(trustRailwayProxy: boolean) {
  return trustRailwayProxy
    ? {
        keyGenerator(req: Request) {
          const edgeIP = req.get("X-Real-IP");
          return ipKeyGenerator(
            edgeIP && isIP(edgeIP)
              ? edgeIP
              : req.socket.remoteAddress || "unknown",
          );
        },
        validate: { xForwardedForHeader: false },
      }
    : {};
}
