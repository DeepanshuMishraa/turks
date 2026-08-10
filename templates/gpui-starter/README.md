# GPUI Starter

Minimal [GPUI](https://www.gpui.rs/) desktop app with the Groknight dark theme
and a single clickable button.

## Workspace

```
crates/
  ui/        # Theme + root view (`gpui-starter-ui`)
  desktop/   # Native binary bootstrap (`gpui-starter`)
```

## Run

```sh
just run          # release
just dev          # debug
just check        # typecheck
```

Or:

```sh
cargo run --release -p gpui-starter-desktop
```

Quit with **⌘Q** / **Ctrl+Q**.

## Stack

- GPUI + `gpui_platform` from [Zed](https://github.com/zed-industries/zed)
- Groknight theme colors (`crates/ui/themes/groknight.json`)
