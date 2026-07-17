from pathlib import Path
import shutil
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
OBJECTS = ROOT / "objects"
SITE = ROOT / "site"
STATIC = ROOT / "static"

REQUIRED_DOCS = {"index.md", "quick-start.md", "systems.md", "scenarios.md", "settings.md", "alarms.md", "technical.md", "versions.md"}

def fail(message):
    print("ERROR:", message, file=sys.stderr)
    raise SystemExit(1)

def validate_object(folder):
    config = folder / "object.yaml"
    mkdocs = folder / "mkdocs.yml"
    docs = folder / "docs"
    if not config.exists(): fail(f"Нет {config}")
    if not mkdocs.exists(): fail(f"Нет {mkdocs}")
    if not docs.is_dir(): fail(f"Нет {docs}")
    data = yaml.safe_load(config.read_text(encoding="utf-8")) or {}
    slug = data.get("project", {}).get("slug")
    random_id = data.get("publication", {}).get("random_id")
    if slug != folder.name: fail(f"slug не совпадает с папкой: {folder}")
    if not random_id or random_id not in slug: fail(f"В slug нет random_id: {folder}")
    missing = sorted(name for name in REQUIRED_DOCS if not (docs / name).exists())
    if missing: fail(f"Не хватает страниц в {folder.name}: {', '.join(missing)}")
    return slug

def main():
    if SITE.exists(): shutil.rmtree(SITE)
    SITE.mkdir(parents=True)
    if STATIC.exists():
        shutil.copytree(STATIC, SITE, dirs_exist_ok=True)
    count = 0
    for folder in sorted(OBJECTS.iterdir()):
        if not folder.is_dir(): continue
        slug = validate_object(folder)
        destination = SITE / "o" / slug
        subprocess.run(["mkdocs", "build", "--strict", "-f", str(folder / "mkdocs.yml"), "-d", str(destination)], check=True, cwd=folder)
        count += 1
    if count == 0: fail("Не найдено ни одного объекта")
    print(f"Собрано объектов: {count}")
    print(f"Каталог публикации: {SITE}")

if __name__ == "__main__":
    main()
