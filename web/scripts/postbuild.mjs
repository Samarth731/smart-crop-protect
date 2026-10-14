// GitHub Pages serves 404.html for unknown paths; reuse the SPA shell so deep links work.
import { copyFileSync } from "node:fs";
copyFileSync("dist/index.html", "dist/404.html");
console.log("postbuild: wrote dist/404.html");
