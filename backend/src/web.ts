import express, { type Express } from "express";
import { extname, join, resolve } from "node:path";

export function mountWebApp(app: Express, distPath: string) {
  const directory = resolve(distPath);
  app.use(
    express.static(directory, {
      index: false,
      dotfiles: "ignore",
      setHeaders(res, path) {
        res.setHeader(
          "Cache-Control",
          path.startsWith(join(directory, "assets") + "/") ||
            path.startsWith(join(directory, "assets") + "\\")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
  app.get(/.*/, (req, res, next) => {
    if (
      /^\/(api|assets)(\/|$)/.test(req.path) ||
      /\/\./.test(req.path) ||
      extname(req.path)
    )
      return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(join(directory, "index.html"));
  });
}
