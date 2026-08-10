export const CLIENTS = ["expo", "next", "react-vite", "vue-vite", "sveltekit", "astro", "react-native", "tauri", "electron"] as const;
export type ClientKind = (typeof CLIENTS)[number];

export const TEMPLATES = ["none", "gpui-starter"] as const;
export type TemplateKind = (typeof TEMPLATES)[number];

export const BACKEND_FRAMEWORKS = {
  rust: ["none", "axum", "actix-web", "rocket"],
  go: ["none", "stdlib", "chi", "gin", "fiber", "echo"],
  typescript: ["none", "hono", "express", "fastify", "nest"],
  python: ["none", "fastapi", "django", "flask", "litestar"],
} as const;

export type BackendLanguage = keyof typeof BACKEND_FRAMEWORKS;
export type RustFramework = (typeof BACKEND_FRAMEWORKS.rust)[number];
export type GoFramework = (typeof BACKEND_FRAMEWORKS.go)[number];
export type TypeScriptFramework = (typeof BACKEND_FRAMEWORKS.typescript)[number];
export type PythonFramework = (typeof BACKEND_FRAMEWORKS.python)[number];
export type BackendFramework = (typeof BACKEND_FRAMEWORKS)[BackendLanguage][number];

export const DATABASES = ["none", "postgres", "mysql", "sqlite", "mongodb"] as const;
export type DatabaseKind = (typeof DATABASES)[number];

export const DATA_LAYERS = [
  "none",
  "sqlx",
  "seaorm",
  "diesel",
  "gorm",
  "ent",
  "bun",
  "drizzle",
  "prisma",
  "typeorm",
  "kysely",
  "mongoose",
  "sqlalchemy",
  "django-orm",
  "tortoise",
  "pymongo",
  "beanie",
] as const;
export type DataLayerKind = (typeof DATA_LAYERS)[number];

export type DataLayerSupport = {
  readonly label: string;
  readonly languages: readonly BackendLanguage[];
  readonly databases: readonly Exclude<DatabaseKind, "none">[];
  readonly frameworks?: readonly BackendFramework[];
};

export const DATA_LAYER_SUPPORT: Readonly<Record<Exclude<DataLayerKind, "none">, DataLayerSupport>> = {
  sqlx: { label: "SQLx", languages: ["rust"], databases: ["postgres", "mysql", "sqlite"] },
  seaorm: { label: "SeaORM", languages: ["rust"], databases: ["postgres", "mysql", "sqlite"] },
  diesel: { label: "Diesel", languages: ["rust"], databases: ["postgres", "mysql", "sqlite"] },
  gorm: { label: "GORM", languages: ["go"], databases: ["postgres", "mysql", "sqlite"] },
  ent: { label: "Ent", languages: ["go"], databases: ["postgres", "mysql", "sqlite"] },
  bun: { label: "Bun", languages: ["go"], databases: ["postgres", "mysql", "sqlite"] },
  drizzle: { label: "Drizzle", languages: ["typescript"], databases: ["postgres", "mysql", "sqlite"] },
  prisma: { label: "Prisma", languages: ["typescript"], databases: ["postgres", "mysql", "sqlite", "mongodb"] },
  typeorm: { label: "TypeORM", languages: ["typescript"], databases: ["postgres", "mysql", "sqlite", "mongodb"] },
  kysely: { label: "Kysely", languages: ["typescript"], databases: ["postgres", "mysql", "sqlite"] },
  mongoose: { label: "Mongoose", languages: ["typescript"], databases: ["mongodb"] },
  sqlalchemy: { label: "SQLAlchemy", languages: ["python"], databases: ["postgres", "mysql", "sqlite"] },
  "django-orm": { label: "Django ORM", languages: ["python"], databases: ["postgres", "mysql", "sqlite"], frameworks: ["django"] },
  tortoise: { label: "Tortoise ORM", languages: ["python"], databases: ["postgres", "mysql", "sqlite"] },
  pymongo: { label: "PyMongo", languages: ["python"], databases: ["mongodb"] },
  beanie: { label: "Beanie", languages: ["python"], databases: ["mongodb"] },
};

export const SUPPORT_LABELS = {
  clients: { expo: "Expo", next: "Next.js", "react-vite": "React + Vite", "vue-vite": "Vue + Vite", sveltekit: "SvelteKit", astro: "Astro", "react-native": "React Native", tauri: "Tauri", electron: "Electron" },
  languages: { rust: "Rust", go: "Go", typescript: "TypeScript", python: "Python" },
  frameworks: {
    axum: "Axum",
    "actix-web": "Actix Web",
    rocket: "Rocket",
    none: "None",
    stdlib: "Standard library",
    chi: "Chi",
    gin: "Gin",
    fiber: "Fiber",
    echo: "Echo",
    hono: "Hono",
    express: "Express",
    fastify: "Fastify",
    nest: "NestJS",
    fastapi: "FastAPI",
    django: "Django",
    flask: "Flask",
    litestar: "Litestar",
  },
  databases: { none: "None", postgres: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite", mongodb: "MongoDB" },
  templates: { none: "No template", "gpui-starter": "GPUI desktop app" },
} as const;
