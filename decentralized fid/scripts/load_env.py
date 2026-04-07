Import("env")

from pathlib import Path
import json


PROJECT_DIR = Path(env["PROJECT_DIR"])
DOTENV_PATH = PROJECT_DIR / ".env"
GENERATED_HEADER = PROJECT_DIR / "include" / "secrets.h"
REQUIRED_KEYS = ("WIFI_SSID", "WIFI_PASSWORD", "BACKEND_URL")


def parse_dotenv(path):
    values = {}

    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if "=" not in line:
            raise ValueError(f"Invalid line {line_number} in {path.name}: {raw_line}")

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        values[key] = value

    return values


if not DOTENV_PATH.exists():
    raise SystemExit(
        "Missing .env file. Copy .env.example to .env and fill in WIFI_SSID, "
        "WIFI_PASSWORD, and BACKEND_URL before building."
    )

dotenv_values = parse_dotenv(DOTENV_PATH)
missing_keys = [key for key in REQUIRED_KEYS if not dotenv_values.get(key)]
if missing_keys:
    raise SystemExit(
        "Missing required keys in .env: " + ", ".join(missing_keys)
    )

GENERATED_HEADER.parent.mkdir(parents=True, exist_ok=True)
header_contents = "\n".join(
    [
        "#pragma once",
        "",
        "// Auto-generated from .env during PlatformIO builds.",
        f"#define WIFI_SSID {json.dumps(dotenv_values['WIFI_SSID'])}",
        f"#define WIFI_PASSWORD {json.dumps(dotenv_values['WIFI_PASSWORD'])}",
        f"#define BACKEND_URL {json.dumps(dotenv_values['BACKEND_URL'])}",
        "",
    ]
)

if not GENERATED_HEADER.exists() or GENERATED_HEADER.read_text(encoding="utf-8") != header_contents:
    GENERATED_HEADER.write_text(header_contents, encoding="utf-8")
