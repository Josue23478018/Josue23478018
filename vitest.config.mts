import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo atajo que tsconfig.json: "@/..." apunta a la raíz del proyecto.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
