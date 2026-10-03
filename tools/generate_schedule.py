#!/usr/bin/env python3
"""Build the fixed 2026-10-02..2026-11-14 CTA task schedule from local PDFs."""

from __future__ import annotations

import json
import re
import hashlib
from datetime import date, timedelta
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "网页"
TASKS = WEB / "data" / "tasks"

T1 = ROOT / "税务师《税法一》SVIP资料包" / "【2】强化习题模拟" / "1.章节千题"
T2 = ROOT / "税务师《税法二》SVIP资料包" / "【2】强化习题模拟" / "1.章节千题"
Y1 = ROOT / "税务师《税法一》SVIP资料包" / "【3】历年真题（2019-2025年）"
Y2 = ROOT / "税务师《税法二》SVIP资料包" / "【3】历年真题（2019-2025年）"
M1 = ROOT / "税务师《税法一》SVIP资料包" / "【2】强化习题模拟" / "2.《3年真题+2套模拟预测》" / "2026考季《3年真题＋2套模拟预测卷》-税法（Ⅰ）_1.pdf"
M2 = ROOT / "税务师《税法二》SVIP资料包" / "【2】强化习题模拟" / "2.《3年真题+2套模拟预测》" / "2026考季《3年真题＋2套模拟预测卷》-税法（Ⅱ）_1.pdf"

FILES = {
    "principles": T1 / "01第一章 税法基本原理.pdf", "vat": T1 / "02第二章 增值税.pdf",
    "consumption": T1 / "03第三章 消费税.pdf", "city": T1 / "04第四章 城市维护建设税.pdf",
    "lat": T1 / "05第五章 土地增值税.pdf", "resource": T1 / "06第六章 资源税.pdf",
    "vehicle1": T1 / "07第七章 车辆购置税.pdf", "environment": T1 / "08第八章 环境保护税.pdf",
    "tobacco": T1 / "09第九章 烟叶税.pdf", "customs": T1 / "10第十章 关税.pdf",
    "social": T1 / "11第十一章 社会保险费.pdf", "nontax": T1 / "12第十二章 非税收入.pdf",
    "cit": T2 / "01第一章 企业所得税.pdf", "pit": T2 / "02第二章 个人所得税 .pdf",
    "intl": T2 / "03第三章 国际税收.pdf", "stamp": T2 / "04第四章 印花税.pdf",
    "property": T2 / "05第五章 房产税.pdf", "vehicle2": T2 / "06第六章 车船税.pdf",
    "deed": T2 / "07第七章 契税.pdf", "land": T2 / "08第八章 城镇土地使用税.pdf",
    "cultivated": T2 / "09第九章 耕地占用税.pdf", "tonnage": T2 / "10第十章 船舶吨税.pdf",
}

# date, title, tax-I node/specs, tax-II node/specs; page ranges are physical PDF pages.
PHASE1 = [
    ("2026-10-02", "基本原理与企业所得税基础", "税法基本原理", [("principles", 1, 22)], "企业所得税纳税人与收入", [("cit", 1, 20)]),
    ("2026-10-03", "增值税范围与企业所得税扣除", "增值税纳税人及征税范围", [("vat", 3, 16)], "企业所得税扣除限额", [("cit", 20, 43)]),
    ("2026-10-05", "增值税税率与企业资产税务处理", "增值税税率、销售额与销项税", [("vat", 17, 31)], "企业所得税资产处理", [("cit", 37, 54)]),
    ("2026-10-06", "增值税进项与企业重组", "进项税额与一般计税", [("vat", 32, 48)], "资产损失与企业重组", [("cit", 44, 61)]),
    ("2026-10-07", "增值税特殊计税与企业优惠", "简易计税、进口与预缴", [("vat", 49, 67)], "房地产开发与税收优惠", [("cit", 55, 80)]),
    ("2026-10-08", "增值税政策综合与企业征管", "增值税优惠、出口与征管", [("vat", 21, 31), ("vat", 54, 70)], "特别纳税调整与征管", [("cit", 81, 95)]),
    ("2026-10-09", "消费税税目与个人所得税基础", "消费税税目、税率和征税环节", [("consumption", 1, 18)], "个人所得税身份与所得分类", [("pit", 1, 21)]),
    ("2026-10-10", "消费税生产环节与综合所得", "消费税计税依据与生产环节", [("consumption", 10, 28)], "综合所得与专项附加扣除", [("pit", 6, 35)]),
    ("2026-10-12", "消费税特殊环节与分类所得", "委托、进口、批零环节", [("consumption", 29, 49)], "分类所得与特殊计算", [("pit", 26, 52)]),
    ("2026-10-13", "消费税综合与个人所得税征管", "消费税扣除、出口与征管", [("consumption", 19, 54)], "境外所得、非居民与征管", [("pit", 53, 61)]),
    ("2026-10-14", "城建税、土地增值税与国际税收基础", "城建税与土地增值税基础", [("city", 1, 10), ("lat", 1, 19)], "国际税收与税收协定", [("intl", 1, 11)]),
    ("2026-10-15", "土地增值税计算与跨境所得", "土地增值税扣除与计算", [("lat", 6, 28)], "非居民企业与境外税收抵免", [("intl", 12, 18)]),
    ("2026-10-16", "土地增值税清算与国际反避税", "土地增值税清算与征管", [("lat", 29, 34)], "反避税与国际税收合作", [("intl", 19, 26)]),
    ("2026-10-17", "资源税与印花税", "资源税与水资源税", [("resource", 1, 20)], "印花税", [("stamp", 1, 10)]),
    ("2026-10-19", "车辆、环保与财产行为税", "车辆购置税与环境保护税", [("vehicle1", 1, 7), ("environment", 1, 7)], "房产税与车船税", [("property", 1, 10), ("vehicle2", 1, 10)]),
    ("2026-10-20", "烟叶、关税与契税", "烟叶税与关税完税价格", [("tobacco", 1, 5), ("customs", 1, 16)], "契税", [("deed", 1, 8)]),
    ("2026-10-21", "关税征管与土地类税种", "关税优惠、征管及全章联动", [("customs", 1, 19)], "城镇土地使用税与耕地占用税", [("land", 1, 8), ("cultivated", 1, 7)]),
    ("2026-10-22", "社会保险、非税收入与船舶吨税", "社会保险费与非税收入", [("social", 1, 8), ("nontax", 1, 20)], "船舶吨税与财产税联动", [("tonnage", 1, 8), ("property", 1, 10)]),
    ("2026-10-23", "两科主税计算强化一", "增值税、消费税综合计算", [("vat", 1, 70), ("consumption", 1, 54)], "企业所得税综合计算", [("cit", 1, 95)]),
    ("2026-10-24", "两科主税计算强化二", "土地增值税与资源税综合", [("lat", 1, 34), ("resource", 1, 20)], "个人所得税综合计算", [("pit", 1, 61)]),
    ("2026-10-26", "全书缺口混合检验", "税法一小税种混合", [("city", 1, 10), ("vehicle1", 1, 7), ("customs", 1, 19), ("nontax", 1, 20)], "国际税收与小税种混合", [("intl", 1, 26), ("stamp", 1, 10), ("deed", 1, 8), ("land", 1, 8)]),
    ("2026-10-27", "阶段综合考核", "税法一全科抽样", [("principles", 1, 53), ("vat", 1, 70), ("consumption", 1, 54), ("lat", 1, 34)], "税法二全科抽样", [("cit", 1, 95), ("pit", 1, 61), ("intl", 1, 26), ("vehicle2", 1, 10)]),
]

REST = {"2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-14"}

QUESTION_RE = re.compile(
    r"(?ms)^(\d+)[、.．]\s*(.*?)\nA[.、．]\s*(.*?)\nB[.、．]\s*(.*?)\nC[.、．]\s*(.*?)\nD[.、．]\s*(.*?)(?:\nE[.、．]\s*(.*?))?\n【答案】\s*([^\n]+)\n【解析】\s*(.*?)(?=^\d+[、.．]\s|^第[一二三四五六七八九十百0-9]+节|^[一二三四五六七八九十]+、|\Z)"
)


def clean(value: str) -> str:
    value = re.sub(r"\[\[PAGE:\d+]]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def read_questions(path: Path) -> list[dict]:
    chunks = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            chunks.append(f"\n[[PAGE:{number}]]\n{page.extract_text() or ''}")
    text = "".join(chunks)
    result = []
    for match in QUESTION_RE.finditer(text):
        marker = text.rfind("[[PAGE:", 0, match.start())
        page = int(text[marker + 7:text.find("]]", marker)])
        options = [clean(value) for value in match.group(3, 4, 5, 6, 7) if value and clean(value)]
        prompt, explanation = clean(match.group(2)), clean(match.group(9))
        answer = re.findall(r"[A-E]", match.group(8).upper())
        leaked = "【答案】" in prompt or "【解析】" in prompt or any("【答案】" in x or "【解析】" in x for x in options)
        if not prompt or leaked or len(options) < 4 or not answer or len(prompt) > 1200 or any(len(x) > 700 for x in options) or len(explanation) > 4000:
            continue
        result.append({"number": match.group(1), "page": page, "prompt": prompt, "options": options, "answer": answer, "explanation": explanation})
    return result


def pick(specs: list[tuple[str, int, int]], count: int, pools: dict[str, list[dict]], used: set[tuple]) -> list[dict]:
    candidates = []
    for key, first, last in specs:
        for question in pools[key]:
            identity = (key, question["page"], question["number"], question["prompt"])
            if first <= question["page"] <= last and identity not in used and not (key == "environment" and question["page"] == 2):
                candidates.append((key, identity, question))
    if len(candidates) < count:
        raise RuntimeError(f"题源不足：{specs} 仅有 {len(candidates)} 道未使用题")
    chosen = [candidates[round(index * (len(candidates) - 1) / (count - 1))] for index in range(count)]
    used.update(identity for _, identity, _ in chosen)
    output = []
    for key, _, question in chosen:
        output.append({
            "type": "multiple" if len(question["answer"]) > 1 else "single",
            "prompt": question["prompt"],
            "options": [{"id": chr(65 + index), "text": value} for index, value in enumerate(question["options"])],
            "answer": question["answer"], "explanation": question["explanation"],
            "source": {"file": FILES[key].name, "page": question["page"], "verified": True},
        })
    return output


def wrap(task: dict) -> str:
    return '(function () {\n  "use strict";\n  window.registerCTATask(' + json.dumps(task, ensure_ascii=False, indent=2) + ");\n}());\n"


def rel_link(path: Path) -> str:
    return "../" + path.relative_to(ROOT).as_posix()


def assignment(path: Path, title: str, instruction: str, pages: str) -> dict:
    stable_id = hashlib.sha1((path.as_posix() + title).encode()).hexdigest()[:10]
    return {"id": "paper-" + stable_id, "title": title, "instruction": instruction,
            "responseLabel": "逐题记录答案、计算过程及需要 GPT 评测的内容",
            "source": {"file": path.name, "path": rel_link(path), "pages": pages, "verified": True}}


def study_task(item: tuple, day_number: int, pools: dict[str, list[dict]], used: set[tuple]) -> dict:
    task_date, title, t1_title, t1_specs, t2_title, t2_specs = item
    questions = pick(t1_specs, 5, pools, used) + pick(t2_specs, 5, pools, used)
    for index, question in enumerate(questions, 1):
        question["id"] = f"q{index:02d}"
        question["sectionId"] = "tax1" if index <= 5 else "tax2"
    return {"meta": {"date": task_date, "dayNumber": day_number, "title": title, "subjects": ["税法一", "税法二"], "estimatedMinutes": 120, "version": task_date + ".v1"},
            "sections": [
                {"id": "review", "title": "复习与补足", "description": "依据既有笔记回看当日范围，优先补足概念边界、计算条件和征管期限。"},
                {"id": "tax1", "subject": "税法一", "title": t1_title, "description": "完成5道指定题库原题；提交后网页即时判定，错题显示原解析。"},
                {"id": "tax2", "subject": "税法二", "title": t2_title, "description": "完成5道指定题库原题；提交后网页即时判定，错题显示原解析。"}],
            "sourceAssignments": [], "choiceQuestions": questions, "applicationQuestions": [],
            "exportMeta": {"materialVersion": "本地2026考季资料；题目逐字源自章节千题", "generatedAt": "2026-10-02T12:00:00-04:00", "filenameBase": f"{task_date}-Day{day_number}-CTA学习作答"}}


def rest_task(task_date: str) -> dict:
    exam = task_date == "2026-11-14"
    return {"meta": {"date": task_date, "kind": "rest", "title": "考试日" if exam else "容错休息日", "subjects": [], "estimatedMinutes": 0, "version": task_date + ".v1"},
            "sections": [{"id": "rest", "title": "考试日不安排学习任务" if exam else "完整休息，不补课", "description": "用于考试。" if exam else "该日计入计划的5—8天容错，不自动顺延任务。"}],
            "sourceAssignments": [], "choiceQuestions": [], "applicationQuestions": [],
            "exportMeta": {"materialVersion": "固定计划", "generatedAt": "2026-10-02T12:00:00-04:00", "filenameBase": task_date + "-CTA休息日"}}


def paper_task(task_date: str, day_number: int, subject: str, path: Path, title: str) -> dict:
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
    item = assignment(path, title, "按150分钟正式考试节奏闭卷完成。作答期间只查看试题内容，不翻阅答案或解析；原卷含答案时由使用者自行避免提前查看。", f"1–{pages}（全卷，含原文件自带答案/解析）")
    return {"meta": {"date": task_date, "dayNumber": day_number, "title": title, "subjects": [subject], "estimatedMinutes": 150, "version": task_date + ".v1"},
            "sections": [{"id": "simulation", "subject": subject, "title": "全真限时模拟", "description": "连续计时150分钟；完成后导出原始作答，由外部GPT依据现行口径评测并标记旧政策题。"}],
            "sourceAssignments": [item], "choiceQuestions": [], "applicationQuestions": [],
            "exportMeta": {"materialVersion": "上传历年真题原卷", "generatedAt": "2026-10-02T12:00:00-04:00", "filenameBase": f"{task_date}-Day{day_number}-CTA模拟作答"}}


def final_mock(task_date: str, day_number: int) -> dict:
    items = []
    for path, subject, start in [(M1, "税法一", 56), (M2, "税法二", 51)]:
        with pdfplumber.open(path) as pdf:
            pages = len(pdf.pages)
        items.append(assignment(path, subject + "模拟预测卷（一）", "从指定物理页开始完成模拟预测卷（一），连续计时150分钟；当天二选一完成，另一科作为考前备用卷。", f"{start}–{pages}"))
    return {"meta": {"date": task_date, "dayNumber": day_number, "title": "考前最终模拟与状态校准", "subjects": ["税法一", "税法二"], "estimatedMinutes": 150, "version": task_date + ".v1"},
            "sections": [{"id": "final", "title": "二选一完成最终模拟", "description": "选择较薄弱科目完成模拟预测卷（一）；另一科保留，不强制加量。完成后只做评测与状态整理。"}],
            "sourceAssignments": items, "choiceQuestions": [], "applicationQuestions": [],
            "exportMeta": {"materialVersion": "2026考季模拟预测卷", "generatedAt": "2026-10-02T12:00:00-04:00", "filenameBase": f"{task_date}-Day{day_number}-CTA最终模拟作答"}}


def main() -> None:
    missing = [str(path) for path in [*FILES.values(), M1, M2] if not path.exists()]
    if missing:
        raise FileNotFoundError("缺少题源：" + "；".join(missing))
    pools = {key: read_questions(path) for key, path in FILES.items()}
    used: set[tuple] = set()
    tasks = {item[0]: study_task(item, 30 + index, pools, used) for index, item in enumerate(PHASE1)}

    mock_dates = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]
    papers = []
    for year in range(2025, 2018, -1):
        papers.extend([("税法一", Y1 / f"{year}年税务师《税法一》真题及答案.pdf"), ("税法二", Y2 / f"{year}年税务师《税法二》真题及答案.pdf")])
    for offset, (task_date, (subject, path)) in enumerate(zip(mock_dates, papers), 52):
        tasks[task_date] = paper_task(task_date, offset, subject, path, f"{subject} · {path.name[:4]}年真题全真模拟")
    tasks["2026-11-13"] = final_mock("2026-11-13", 66)
    for task_date in REST:
        tasks[task_date] = rest_task(task_date)

    start, end = date(2026, 10, 2), date(2026, 11, 14)
    expected = {(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)}
    assert set(tasks) == expected
    assert len(REST) == 7 and len([t for t in tasks.values() if t["meta"].get("kind") != "rest"]) == 37
    assert sum(len(t["choiceQuestions"]) for t in tasks.values()) == 220
    assert all(q["source"]["verified"] for t in tasks.values() for q in t["choiceQuestions"])
    assert [tasks[d]["meta"]["dayNumber"] for d in sorted(tasks) if tasks[d]["meta"].get("kind") != "rest"] == list(range(30, 67))
    assert all(set(q["answer"]) <= {o["id"] for o in q["options"]} for t in tasks.values() for q in t["choiceQuestions"])
    assert all("【答案】" not in q["prompt"] and "【解析】" not in q["prompt"] for t in tasks.values() for q in t["choiceQuestions"])
    assert all(len(tasks[d]["choiceQuestions"]) == 10 and not tasks[d]["sourceAssignments"] for d, *_ in PHASE1)
    assert all(not tasks[d]["choiceQuestions"] and tasks[d]["sourceAssignments"] for d in mock_dates + ["2026-11-13"])
    assert all((WEB / a["source"]["path"]).resolve().exists() for t in tasks.values() for a in t["sourceAssignments"])
    assert not any(q["source"]["file"] == FILES["environment"].name and q["source"]["page"] == 2 for t in tasks.values() for q in t["choiceQuestions"])

    TASKS.mkdir(parents=True, exist_ok=True)
    for task_date, task in sorted(tasks.items()):
        (TASKS / f"{task_date}.js").write_text(wrap(task), encoding="utf-8")
    entries = ",\n".join(f'    {{ date: "{d}", src: "data/tasks/{d}.js" }}' for d in sorted(tasks))
    manifest = '(function () {\n  "use strict";\n\n  window.CTA_TASK_MANIFEST = [\n' + entries + "\n  ];\n}());\n"
    (WEB / "data" / "task-manifest.js").write_text(manifest, encoding="utf-8")
    print(f"generated {len(tasks)} tasks: 37 study, 7 rest, 220 exact-source questions")


if __name__ == "__main__":
    main()
