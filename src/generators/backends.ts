import path from "node:path";
import type { Generator } from "../core/generator.js";
import { Result } from "../core/result.js";
import { generationFailure, mergeProjectPackageJson, runGeneratorCommand, writeProjectFile, writeProjectJson } from "./shared.js";

export const rustGenerator: Generator = {
  id: "rust",
  label: "Rust backend",
  dependencies: ["root"],
  async generate(context) {
    return await runGeneratorCommand(context, "rust", {
      executable: "cargo",
      args: ["new", "apps/api", "--bin", "--name", `${context.config.projectName}-api`],
    });
  },
};

export const axumGenerator: Generator = {
  id: "axum",
  label: "Axum",
  dependencies: ["rust"],
  async generate(context) {
    const cwd = path.join(context.rootDir, "apps/api");
    const addAxum = await runGeneratorCommand(context, "axum", {
      executable: "cargo",
      args: ["add", "axum"],
      cwd,
    });
    if (!addAxum.ok) return addAxum;

    const addTokio = await runGeneratorCommand(context, "axum", {
      executable: "cargo",
      args: ["add", "tokio", "--features", "full"],
      cwd,
    });
    if (!addTokio.ok) return addTokio;

    try {
      await writeProjectFile(
        context,
        "apps/api/src/main.rs",
        `use axum::{routing::get, Router};\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new().route("/health", get(|| async { "ok" }));\n    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();\n    println!("API listening on http://localhost:3000");\n    axum::serve(listener, app).await.unwrap();\n}\n`,
      );
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("axum", error);
    }
  },
};

async function addRustDependencies(
  context: Parameters<Generator["generate"]>[0],
  generator: "actix-web" | "rocket",
  dependencies: readonly string[],
) {
  return await runGeneratorCommand(context, generator, {
    executable: "cargo",
    args: ["add", ...dependencies],
    cwd: path.join(context.rootDir, "apps/api"),
  });
}

export const actixWebGenerator: Generator = {
  id: "actix-web",
  label: "Actix Web",
  dependencies: ["rust"],
  async generate(context) {
    const added = await addRustDependencies(context, "actix-web", ["actix-web"]);
    if (!added.ok) return added;
    try {
      await writeProjectFile(context, "apps/api/src/main.rs", `use actix_web::{get, App, HttpServer, Responder};\n\n#[get("/health")]\nasync fn health() -> impl Responder { "ok" }\n\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    println!("API listening on http://localhost:3000");\n    HttpServer::new(|| App::new().service(health)).bind(("0.0.0.0", 3000))?.run().await\n}\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("actix-web", error);
    }
  },
};

export const rocketGenerator: Generator = {
  id: "rocket",
  label: "Rocket",
  dependencies: ["rust"],
  async generate(context) {
    const added = await addRustDependencies(context, "rocket", ["rocket"]);
    if (!added.ok) return added;
    try {
      await writeProjectFile(context, "apps/api/src/main.rs", `#[macro_use] extern crate rocket;\n\n#[get("/health")]\nfn health() -> &'static str { "ok" }\n\n#[launch]\nfn rocket() -> _ {\n    rocket::build().mount("/", routes![health])\n}\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("rocket", error);
    }
  },
};

export const goGenerator: Generator = {
  id: "go",
  label: "Go backend",
  dependencies: ["root"],
  async generate(context) {
    try {
      await writeProjectFile(context, "apps/api/.keep", "");
      await writeProjectFile(context, "apps/api/main.go", "package main\n\nfunc main() {}\n");
    } catch (error) {
      return generationFailure("go", error);
    }
    return await runGeneratorCommand(context, "go", {
      executable: "go",
      args: ["mod", "init", `${context.config.projectName}/api`],
      cwd: path.join(context.rootDir, "apps/api"),
    });
  },
};

export const chiGenerator: Generator = {
  id: "chi",
  label: "Chi",
  dependencies: ["go"],
  async generate(context) {
    try {
      await writeProjectFile(
        context,
        "apps/api/main.go",
        `package main\n\nimport (\n\t\"fmt\"\n\t\"net/http\"\n\n\t\"github.com/go-chi/chi/v5\"\n)\n\nfunc main() {\n\trouter := chi.NewRouter()\n\trouter.Get(\"/health\", func(w http.ResponseWriter, _ *http.Request) {\n\t\t_, _ = w.Write([]byte(\"ok\"))\n\t})\n\tfmt.Println(\"API listening on http://localhost:3000\")\n\tif err := http.ListenAndServe(\":3000\", router); err != nil {\n\t\tpanic(err)\n\t}\n}\n`,
      );
    } catch (error) {
      return generationFailure("chi", error);
    }
    return await runGeneratorCommand(context, "chi", {
      executable: "go",
      args: ["get", "github.com/go-chi/chi/v5"],
      cwd: path.join(context.rootDir, "apps/api"),
    });
  },
};

export const standardLibraryGenerator: Generator = {
  id: "stdlib",
  label: "Go standard library HTTP",
  dependencies: ["go"],
  async generate(context) {
    try {
      await writeProjectFile(context, "apps/api/main.go", `package main\n\nimport (\n\t"fmt"\n\t"net/http"\n)\n\nfunc main() {\n\thttp.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })\n\tfmt.Println("API listening on http://localhost:3000")\n\tif err := http.ListenAndServe(":3000", nil); err != nil { panic(err) }\n}\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("stdlib", error);
    }
  },
};

function goFrameworkGenerator(
  id: "gin" | "fiber" | "echo",
  label: string,
  moduleName: string,
  source: string,
): Generator {
  return {
    id,
    label,
    dependencies: ["go"],
    async generate(context) {
      try {
        await writeProjectFile(context, "apps/api/main.go", source);
      } catch (error) {
        return generationFailure(id, error);
      }
      return await runGeneratorCommand(context, id, {
        executable: "go",
        args: ["get", moduleName],
        cwd: path.join(context.rootDir, "apps/api"),
      });
    },
  };
}

export const ginGenerator = goFrameworkGenerator("gin", "Gin", "github.com/gin-gonic/gin", `package main\n\nimport "github.com/gin-gonic/gin"\n\nfunc main() {\n\trouter := gin.Default()\n\trouter.GET("/health", func(context *gin.Context) { context.String(200, "ok") })\n\t_ = router.Run(":3000")\n}\n`);
export const fiberGenerator = goFrameworkGenerator("fiber", "Fiber", "github.com/gofiber/fiber/v3", `package main\n\nimport "github.com/gofiber/fiber/v3"\n\nfunc main() {\n\tapp := fiber.New()\n\tapp.Get("/health", func(context fiber.Ctx) error { return context.SendString("ok") })\n\t_ = app.Listen(":3000")\n}\n`);
export const echoGenerator = goFrameworkGenerator("echo", "Echo", "github.com/labstack/echo/v4", `package main\n\nimport (\n\t"net/http"\n\t"github.com/labstack/echo/v4"\n)\n\nfunc main() {\n\tapp := echo.New()\n\tapp.GET("/health", func(context echo.Context) error { return context.String(http.StatusOK, "ok") })\n\tapp.Logger.Fatal(app.Start(":3000"))\n}\n`);

export const typescriptGenerator: Generator = {
  id: "typescript",
  label: "TypeScript backend",
  dependencies: ["pnpm"],
  async generate(context) {
    try {
      await writeProjectJson(context, "apps/api/package.json", {
        name: `@${context.config.projectName}/api`,
        private: true,
        type: "module",
        scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
        dependencies: {},
        devDependencies: { "@types/node": "^24.0.0", tsx: "^4.20.0", typescript: "^5.9.0" },
      });
      await writeProjectJson(context, "apps/api/tsconfig.json", {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          outDir: "dist",
          rootDir: "src",
        },
        include: ["src"],
      });
      await writeProjectFile(context, "apps/api/src/index.ts", 'console.log("Service ready.");\n');
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("typescript", error);
    }
  },
};

export const honoGenerator: Generator = {
  id: "hono",
  label: "Hono",
  dependencies: ["typescript"],
  async generate(context) {
    try {
      await mergeProjectPackageJson(context, "apps/api/package.json", {
        dependencies: { "@hono/node-server": "^1.19.0", hono: "^4.9.0" },
      });
      await writeProjectFile(
        context,
        "apps/api/src/index.ts",
        `import { serve } from "@hono/node-server";\nimport { Hono } from "hono";\n\nconst app = new Hono();\napp.get("/health", (context) => context.text("ok"));\n\nserve({ fetch: app.fetch, port: 3000 }, ({ port }) => {\n  console.log(\`API listening on http://localhost:\${port}\`);\n});\n`,
      );
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("hono", error);
    }
  },
};

function typeScriptFrameworkGenerator(
  id: "express" | "fastify" | "nest",
  label: string,
  dependencies: Readonly<Record<string, string>>,
  devDependencies: Readonly<Record<string, string>>,
  source: string,
): Generator {
  return {
    id,
    label,
    dependencies: ["typescript"],
    async generate(context) {
      try {
        await mergeProjectPackageJson(context, "apps/api/package.json", { dependencies, devDependencies });
        await writeProjectFile(context, "apps/api/src/index.ts", source);
        return Result.ok(undefined);
      } catch (error) {
        return generationFailure(id, error);
      }
    },
  };
}

export const expressGenerator = typeScriptFrameworkGenerator(
  "express",
  "Express",
  { express: "^5.1.0" },
  { "@types/express": "^5.0.0" },
  `import express from "express";\n\nconst app = express();\napp.get("/health", (_request, response) => response.send("ok"));\napp.listen(3000, () => console.log("API listening on http://localhost:3000"));\n`,
);
export const fastifyGenerator = typeScriptFrameworkGenerator(
  "fastify",
  "Fastify",
  { fastify: "^5.6.0" },
  {},
  `import Fastify from "fastify";\n\nconst app = Fastify({ logger: true });\napp.get("/health", async () => "ok");\nawait app.listen({ port: 3000, host: "0.0.0.0" });\n`,
);
export const nestGenerator = typeScriptFrameworkGenerator(
  "nest",
  "NestJS",
  { "@nestjs/common": "^11.1.0", "@nestjs/core": "^11.1.0", "reflect-metadata": "^0.2.2", rxjs: "^7.8.0" },
  {},
  `import "reflect-metadata";\nimport { Controller, Get, Module } from "@nestjs/common";\nimport { NestFactory } from "@nestjs/core";\n\n@Controller()\nclass HealthController {\n  @Get("health") health(): string { return "ok"; }\n}\n\n@Module({ controllers: [HealthController] })\nclass AppModule {}\n\nconst app = await NestFactory.create(AppModule);\nawait app.listen(3000);\n`,
);

export const pythonGenerator: Generator = {
  id: "python",
  label: "Python backend",
  dependencies: ["root"],
  async generate(context) {
    try {
      await writeProjectFile(context, "apps/api/pyproject.toml", `[project]\nname = "${context.config.projectName}-api"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n`);
      await writeProjectFile(context, "apps/api/.python-version", "3.12\n");
      await writeProjectFile(context, "apps/api/main.py", 'print("Service ready.")\n');
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("python", error);
    }
  },
};

async function writePythonFramework(
  context: Parameters<Generator["generate"]>[0],
  id: "fastapi" | "flask" | "litestar",
  dependencies: readonly string[],
  source: string,
) {
  try {
    const dependencyLines = dependencies.map((dependency) => `  "${dependency}",`).join("\n");
    await writeProjectFile(context, "apps/api/pyproject.toml", `[project]\nname = "${context.config.projectName}-api"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = [\n${dependencyLines}\n]\n`);
    await writeProjectFile(context, "apps/api/main.py", source);
    return Result.ok(undefined);
  } catch (error) {
    return generationFailure(id, error);
  }
}

export const fastapiGenerator: Generator = {
  id: "fastapi", label: "FastAPI", dependencies: ["python"],
  async generate(context) { return await writePythonFramework(context, "fastapi", ["fastapi>=0.116", "uvicorn[standard]>=0.35"], `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health() -> str:\n    return "ok"\n`); },
};
export const flaskGenerator: Generator = {
  id: "flask", label: "Flask", dependencies: ["python"],
  async generate(context) { return await writePythonFramework(context, "flask", ["flask>=3.1"], `from flask import Flask\n\napp = Flask(__name__)\n\n@app.get("/health")\ndef health() -> str:\n    return "ok"\n`); },
};
export const litestarGenerator: Generator = {
  id: "litestar", label: "Litestar", dependencies: ["python"],
  async generate(context) { return await writePythonFramework(context, "litestar", ["litestar[standard]>=2.17"], `from litestar import Litestar, get\n\n@get("/health")\nasync def health() -> str:\n    return "ok"\n\napp = Litestar(route_handlers=[health])\n`); },
};

export const djangoGenerator: Generator = {
  id: "django",
  label: "Django",
  dependencies: ["python"],
  async generate(context) {
    try {
      await writeProjectFile(context, "apps/api/pyproject.toml", `[project]\nname = "${context.config.projectName}-api"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = ["django>=5.2"]\n`);
      await writeProjectFile(context, "apps/api/manage.py", `#!/usr/bin/env python\nimport os\nimport sys\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line(sys.argv)\n`);
      await writeProjectFile(context, "apps/api/config/__init__.py", "");
      await writeProjectFile(context, "apps/api/config/settings.py", `SECRET_KEY = "development-only"\nDEBUG = True\nROOT_URLCONF = "config.urls"\nINSTALLED_APPS = []\nMIDDLEWARE = []\nALLOWED_HOSTS = ["localhost", "127.0.0.1"]\n`);
      await writeProjectFile(context, "apps/api/config/urls.py", `from django.http import HttpResponse\nfrom django.urls import path\n\ndef health(_request):\n    return HttpResponse("ok")\n\nurlpatterns = [path("health", health)]\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("django", error);
    }
  },
};
