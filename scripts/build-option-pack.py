#!/usr/bin/env python3
"""
Собирает apps/migrator/data/option-pack/pack.json из Excel-описания пака картинок.

Источник: «Для сайта.xlsx» (лист «Картинки» + лист «Разделы и группы»).
Картинки лежат рядом: apps/migrator/data/option-pack/{small,full}/<section>/<code>.webp.

Для каждого варианта вычисляется целевая строка БД (таблица, категория/таб, name)
по тому же маппингу, что и seedGenerationElements() в мигратore, чтобы мигратор
мог найти строку без собственной логики сопоставления.

Запуск:
  python3 scripts/build-option-pack.py "/path/to/Для сайта.xlsx"
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
PACK_DIR = ROOT / "apps" / "migrator" / "data" / "option-pack"
MANIFEST = ROOT / "apps" / "migrator" / "data" / "manifest.json"
DATA_JS = ROOT / "data.js"

LANGS = ("en", "ru", "de", "fr")

# pack section -> (manifest section, name prefix in manifest key, table, key column, key value, default category)
# key value None => category table with tab = default tab; category name = manifest group or default group
SECTION_MAP = {
    "ethnicity": ("ethnicity", "", "character_options", "category", None, None),
    "hairstyle": ("hairstyle", "", "character_options", "category", "HAIR_STYLE", None),
    "body_type": ("body", "type_", "character_options", "category", "BODY_TYPE", None),
    "char_style": (None, "", "character_options", "category", "STYLE", None),
    "breast_size": (None, "", "character_options", "category", "BREAST_SIZE", None),
    "butt_size": (None, "", "character_options", "category", "BUTT_SIZE", None),
    "outfit": ("outfit", "", "appearance_options", "tab", "OUTFITS", None),
    "accessories": ("accessories", "", "appearance_options", "tab", "OUTFIT_DETAILS", None),
    "footwear": ("footwear", "", "appearance_options", "tab", "OUTFIT_DETAILS", "Обувь"),
    "distinctive_marks": ("distinctive", "marks_", "appearance_options", "tab", "OUTFIT_DETAILS", "Отличительные черты"),
    "expression": ("expression", "", "pose_options", "tab", "FACIAL_EXPRESSION", None),
    "pose_img": ("pose", "img_", "pose_options", "tab", "POSE", "Позы"),
    "subject_motion": ("subject", "motion_", "pose_options", "tab", "POSE", "Действия"),
    "background": ("background", "", "scene_options", "tab", "LOCATION", None),
    "framing": ("framing", "", "camera_options", "section", "FRAMING", None),
    "camera_angle": ("camera", "angle_", "camera_options", "section", "CAMERA_ANGLE", None),
}


# Пул генерации (character_options.generation_style) для новых STYLE-опций
GENERATION_STYLE = {"realistic": "realism", "anime": "mistoon", "cartoon_3d": "3d", "cartoon_2d": "2d"}


def data_js_items(section_id: str) -> dict:
    """Возвращает {code: {name, prompt}} для раздела из прототипа data.js."""
    src = DATA_JS.read_text(encoding="utf-8")
    start = src.find(f'id:"{section_id}"')
    if start < 0:
        return {}
    # Раздел заканчивается на следующем `id:"` верхнего уровня раздела — берём кусок с запасом
    nxt = re.search(r'\{id:"(?!' + re.escape(section_id) + r'")', src[start + 5:])
    chunk = src[start: start + 5 + (nxt.start() if nxt else len(src))]
    out = {}
    for m in re.finditer(r'\{k:"([^"]+)",\s*n:"([^"]*)",\s*p:"([^"]*)"', chunk):
        out[m.group(1)] = {"name": m.group(2), "prompt": m.group(3)}
    return out


def main(xlsx_path: str) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["sections"]
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws_items, ws_groups = wb.worksheets[0], wb.worksheets[1]

    sections, groups = {}, {}
    for kind, code, ru, en, de, fr in ws_groups.iter_rows(min_row=2, values_only=True):
        labels = {"en": en, "ru": ru, "de": de, "fr": fr}
        if kind == "раздел":
            sections[code] = labels
        elif kind == "группа":
            groups[ru] = labels

    # Категории БД, которых нет в Excel как группы: подписываем названием раздела
    for section, (_, _, _, _, _, default_group) in SECTION_MAP.items():
        if default_group and default_group not in groups and section in sections:
            groups[default_group] = sections[section]

    items, errors = [], []
    order_by_section: dict = {}
    for row in ws_items.iter_rows(min_row=2, values_only=True):
        if not row[10]:
            continue
        en, ru, de, fr = row[3], row[4], row[5], row[6]
        group, section, code, nsfw_flag = row[8], row[9], row[10], row[15]
        for size in ("small", "full"):
            if not (PACK_DIR / size / section / f"{code}.webp").exists():
                errors.append(f"missing {size}/{section}/{code}.webp")

        msec, prefix, table, key_col, key_val, default_group = SECTION_MAP[section]
        order = order_by_section.get(section, 0)
        order_by_section[section] = order + 1

        target = {"table": table, "keyCol": key_col, "keyVal": key_val, "category": None, "name": None}
        prompt = None
        mitem = manifest.get(msec, {}).get("items", {}).get(prefix + code) if msec else None
        if mitem:
            target["name"] = mitem["name"]
            if section == "ethnicity":
                target["keyVal"] = "HUMAN_RACE" if mitem["group"] == "Человеческие" else "FANTASY_RACE"
            if key_col == "tab":
                target["category"] = mitem.get("group") or default_group or key_val
        else:
            # Нового варианта нет в манифесте — создаём, промпт берём из data.js
            src = data_js_items(section).get(code)
            if not src:
                errors.append(f"no manifest item and no data.js prompt for {section}/{code}")
                continue
            prompt = src["prompt"]
            if key_col == "tab":
                target["category"] = default_group or group or key_val
                target["name"] = prefix + code
            else:
                # STYLE/BREAST_SIZE/BUTT_SIZE: name = EN-подпись — совпадает с уже
                # сохранёнными значениями ("Flat", "Large"…) и с stylePromptPrefix().
                target["name"] = en
                if section == "char_style":
                    target["generationStyle"] = GENERATION_STYLE.get(code)

        items.append({
            "section": section,
            "code": code,
            "group": group,
            "labels": {"en": en, "ru": ru, "de": de, "fr": fr},
            "nsfw": nsfw_flag == "да",
            "order": order,
            "prompt": prompt,
            "target": target,
        })

    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)

    out = {"version": 1, "sections": sections, "groups": groups, "items": items}
    (PACK_DIR / "pack.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    created = sum(1 for i in items if i["prompt"])
    print(f"pack.json: {len(items)} items ({created} new), {len(sections)} sections, {len(groups)} groups")


if __name__ == "__main__":
    main(sys.argv[1])
