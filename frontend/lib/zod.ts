import { z } from "zod";

// The CSP forbids eval (lib/csp.ts). Without `jitless`, Zod probes
// `new Function` on first parse, which the browser reports as a violation.
z.config({ jitless: true });

export { z };
