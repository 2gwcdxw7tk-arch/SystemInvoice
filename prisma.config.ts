import "dotenv/config"; // Cargar variables de entorno desde .env cuando exista
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // Fuente única recomendada: DB_CONNECTION_STRING. Aceptamos DATABASE_URL como alias
    // para compatibilidad, pero la documentación indica configurar solo DB_CONNECTION_STRING.
    url: process.env.DB_CONNECTION_STRING?.trim() || process.env.DATABASE_URL?.trim() || "",
  },
});
