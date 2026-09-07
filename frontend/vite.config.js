import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all network interfaces (not just localhost) so other
    // devices on the same LAN (e.g. a phone) can reach the dev server.
    host: true,
  },
});
