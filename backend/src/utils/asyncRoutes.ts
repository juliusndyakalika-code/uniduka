import { Router, RequestHandler, Request, Response, NextFunction } from 'express';

/**
 * Makes an Express 4 router safe for async handlers.
 *
 * Express 4 does not await a handler, so a rejected promise inside one is never
 * seen by the error middleware. It surfaces as an `unhandledRejection` on the
 * process instead, which took the whole API down for every shop — a malformed
 * date in one request closed the till for everyone. Reproduced twice: an
 * appointment posted without an end time, and a purchase order missing a field.
 *
 * Wrapping happens here rather than at each of the ~200 handlers because a rule
 * every new handler has to remember is a rule that will be forgotten. Applied
 * once where routers are mounted, it cannot be.
 *
 * Express 5 does this natively; this can go when the upgrade happens.
 */
function wrap(fn: RequestHandler): RequestHandler {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    try {
      const out = fn(req, res, next) as unknown;
      // Only a thenable needs catching. A synchronous throw is already handled
      // by Express, and a handler returning nothing is the common case.
      if (out && typeof (out as Promise<unknown>).catch === 'function') {
        (out as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Wrap every handler already registered on a router, including those on nested
 * routers mounted with `router.use`.
 */
export function asyncRoutes(router: Router): Router {
  const stack = (router as unknown as { stack?: Layer[] }).stack ?? [];
  for (const layer of stack) {
    if (layer.route) {
      // Mutate each sub-layer rather than rebuilding it. Express's Layer keeps
      // handle_request on its prototype, so spreading one into a plain object
      // silently drops that method and every request dies with
      // "layer.handle_request is not a function".
      for (const sub of layer.route.stack) sub.handle = wrap(sub.handle);
    } else if (layer.handle && (layer.handle as { stack?: unknown }).stack) {
      // A nested router mounted with use(); recurse so its routes are covered.
      asyncRoutes(layer.handle as unknown as Router);
    } else if (typeof layer.handle === 'function') {
      // Middleware such as authenticate or requireShop, which are async too.
      layer.handle = wrap(layer.handle as RequestHandler);
    }
  }
  return router;
}

interface Layer {
  route?: { stack: { handle: RequestHandler }[] };
  handle?: RequestHandler | { stack?: unknown };
}
