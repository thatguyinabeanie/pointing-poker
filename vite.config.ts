import { viteFastify } from "@fastify/vite/plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  base: "/",
  build: {
    // viteFastify appends "/client" to this for the client environment, so the bundle lands in
    // dist/client and its resolved config in dist/vite.config.json. Setting "../dist/client"
    // here would produce dist/client/client.
    outDir: "../dist",
    // outDir sits outside the Vite root, so Vite refuses to empty it without this.
    emptyOutDir: true,
  },
  // viteFastify writes dist/vite.config.json at build time; @fastify/vite reads that JSON in
  // production instead of this file, which is why the runtime image needs neither this file nor vite.
  plugins: [react(), viteFastify({ spa: true })],
});
