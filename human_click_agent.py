#!/usr/bin/env python3
"""
天衍 UI 自动化测试 Agent - 真人模拟版
模拟真人鼠标移动、点击、输入、滚动等操作，全面验证前端交互逻辑
"""
import json, time, os, sys, random, traceback
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

BASE_URL = "http://127.0.0.1:8090"
SCREENSHOT_DIR = "screenshots"
REPORT_FILE = "test_report_human.json"


def human_delay(min_ms=100, max_ms=500):
    time.sleep(random.uniform(min_ms, max_ms) / 1000.0)


class HumanUIAgent:
    def __init__(self):
        self.issues = []
        self.passed = []
        self.warnings = []
        self.screenshots = []
        self.console_errors = []
        self.console_warnings = []
        self.network_errors = []
        self.test_num = 0

    def log(self, msg, level="INFO"):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] [{level}] {msg}")

    def screenshot(self, page, name):
        self.test_num += 1
        path = f"{SCREENSHOT_DIR}/{self.test_num:02d}_{name}.png"
        try:
            page.screenshot(path=path, full_page=False)
            self.screenshots.append(path)
        except Exception as e:
            self.log(f"Screenshot failed: {e}", "WARN")

    def report_issue(self, category, description, severity="error"):
        entry = {
            "category": category,
            "description": description,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        }
        self.issues.append(entry)
        self.log(f"[{severity.upper()}] {category}: {description}", "ERROR" if severity == "error" else "WARN")

    def report_pass(self, test_name):
        self.passed.append(test_name)
        self.log(f"PASS: {test_name}")

    def report_warning(self, category, description):
        self.report_issue(category, description, "warning")

    def close_all_panels(self, page):
        page.evaluate("""() => {
            document.getElementById('settings-panel')?.classList.remove('open');
            document.getElementById('skills-panel')?.classList.remove('open');
            document.getElementById('runs-panel')?.classList.remove('open');
            document.getElementById('scrim')?.classList.remove('show');
            document.getElementById('drawer')?.classList.remove('open');
            document.getElementById('cmdk-overlay')?.classList.add('hidden');
            document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
        }""")
        human_delay(300, 500)

    def human_click(self, page, selector, description="", timeout=5000):
        try:
            el = page.locator(selector).first
            el.wait_for(state="visible", timeout=timeout)
            el.hover(timeout=2000)
            human_delay(100, 300)
            el.scroll_into_view_if_needed(timeout=2000)
            human_delay(50, 150)
            el.click(timeout=3000)
            human_delay(300, 600)
            return True
        except PwTimeout:
            self.report_issue("Click timeout", f"Element not visible: {selector} ({description})")
            return False
        except Exception as e:
            self.report_issue("Click error", f"{selector}: {str(e)[:150]} ({description})")
            return False

    def human_type(self, page, selector, text, description=""):
        try:
            el = page.locator(selector).first
            el.wait_for(state="visible", timeout=5000)
            el.click()
            human_delay(100, 200)
            el.fill("")
            human_delay(50, 100)
            for char in text:
                el.type(char, delay=random.randint(30, 120))
            human_delay(100, 300)
            return True
        except Exception as e:
            self.report_issue("Type error", f"{selector}: {str(e)[:150]} ({description})")
            return False

    def check_exists(self, page, selector, name):
        if page.locator(selector).count() == 0:
            self.report_issue("Missing element", f"Cannot find {name} ({selector})")
            return False
        return True

    def run(self):
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            page = context.new_page()

            page.on("console", lambda msg: (
                self.console_errors.append(msg.text) if msg.type == "error" else
                self.console_warnings.append(msg.text) if msg.type == "warning" else None
            ))
            page.on("pageerror", lambda err: self.network_errors.append(str(err)))

            # ===== T1: Page Load =====
            self.log("=" * 60)
            self.log("T1: Page Load & Core Elements")
            try:
                page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
                human_delay(500, 1000)
                title = page.title()
                if title == "天衍":
                    self.report_pass("Page title correct")
                else:
                    self.report_issue("Page title", f"Expected 'Tianyan', got '{title}'")
                for sel, name in [(".app", "Main container"), (".sidebar", "Sidebar"),
                    (".main", "Main area"), (".topbar", "Topbar"), (".chat", "Chat area"),
                    ("#input", "Input box"), ("#send-btn", "Send button")]:
                    if self.check_exists(page, sel, name):
                        if page.locator(sel).first.is_visible():
                            self.report_pass(f"Core element: {name}")
                self.screenshot(page, "page_loaded")
            except Exception as e:
                self.report_issue("Page load", str(e))

            # ===== T2: Sidebar Interaction =====
            self.log("=" * 60)
            self.log("T2: Sidebar Interaction")
            try:
                self.close_all_panels(page)
                if self.human_click(page, "#menu-btn", "Menu button"):
                    human_delay(500, 800)
                    self.report_pass("Menu button clickable")
                    self.screenshot(page, "sidebar_menu")
                else:
                    self.report_issue("Sidebar", "Menu button not available")
                if self.check_exists(page, ".proj-header", "Project header"):
                    self.report_pass("Project list header exists")
                if self.check_exists(page, "#proj-new-btn", "New project button"):
                    self.report_pass("New project button exists")
                if self.check_exists(page, "#add-element-btn", "Add element"):
                    self.report_pass("Add element button exists")
                if self.check_exists(page, "#new-chapter-btn", "New chapter"):
                    self.report_pass("New chapter button exists")
                tree_empty = page.locator("#tree-empty")
                if tree_empty.count() > 0 and tree_empty.is_visible():
                    self.report_pass("File tree empty state shown")
            except Exception as e:
                self.report_issue("Sidebar", str(e))

            # ===== T3: New Project Flow =====
            self.log("=" * 60)
            self.log("T3: New Project Flow")
            try:
                self.close_all_panels(page)
                if not self.human_click(page, "#proj-new-btn", "New project"):
                    raise Exception("Cannot click new project button")
                human_delay(500, 800)
                modal = page.locator("#proj-modal")
                if not modal.is_visible():
                    self.report_issue("New project", "Modal not shown")
                    raise Exception("Modal not shown")
                self.report_pass("New project modal opened")
                self.screenshot(page, "new_project_modal")

                project_name = f"test_project_{int(time.time())}"
                if self.human_type(page, "#p-name", project_name, "Project name"):
                    self.report_pass("Filled project name")
                if self.human_type(page, "#p-genre", "suspense", "Genre"):
                    self.report_pass("Filled genre")
                if self.human_type(page, "#p-style", "cool", "Style"):
                    self.report_pass("Filled style")
                if self.human_type(page, "#p-premise", "A test story about testing", "Premise"):
                    self.report_pass("Filled premise")
                chapters = "Ch1 Test Start\nCh2 Find Issues\nCh3 Fix Issues"
                if self.human_type(page, "#p-chapters", chapters, "Chapter plan"):
                    self.report_pass("Filled chapter plan")

                self.screenshot(page, "project_form_filled")

                # Audience switch
                aud_btns = page.locator(".aud-btn")
                if aud_btns.count() >= 2:
                    active = page.locator(".aud-btn.active")
                    if active.count() > 0:
                        self.report_pass("Audience switch (default male)")
                    self.human_click(page, '.aud-btn[data-val="\u5973\u9891"]', "Switch to female")
                    human_delay(200, 400)
                    active_f = page.locator('.aud-btn.active[data-val="\u5973\u9891"]')
                    if active_f.count() > 0:
                        self.report_pass("Audience switched to female")

                if self.human_click(page, "#proj-ok", "Create project"):
                    human_delay(1000, 2000)
                    if not modal.is_visible():
                        self.report_pass("Project created, modal closed")
                    else:
                        self.report_issue("New project", "Modal still visible after create")
                    self.screenshot(page, "project_created")
                    tree_projs = page.locator(".proj-head")
                    if tree_projs.count() > 0:
                        self.report_pass("Project appears in sidebar")
                    else:
                        tree_text = page.locator("#tree").inner_text()
                        if "test" in tree_text.lower():
                            self.report_pass("Project found in tree")
                        else:
                            self.report_warning("New project", "Project not found in sidebar")
            except Exception as e:
                self.report_issue("New project flow", str(e))
            self.close_all_panels(page)

            # ===== T4: Project Isolation =====
            self.log("=" * 60)
            self.log("T4: Project Isolation")
            try:
                self.close_all_panels(page)
                if self.human_click(page, "#proj-new-btn", "New project 2"):
                    human_delay(500, 800)
                    project_name2 = f"isolation_test_{int(time.time())}"
                    self.human_type(page, "#p-name", project_name2, "Project name 2")
                    self.human_type(page, "#p-genre", "sci-fi", "Genre 2")
                    if self.human_click(page, "#proj-ok", "Create project 2"):
                        human_delay(1000, 2000)
                        self.report_pass("Second project created")
                        self.screenshot(page, "second_project")
            except Exception as e:
                self.report_issue("Project isolation", str(e))
            self.close_all_panels(page)

            # ===== T5: Settings Panel =====
            self.log("=" * 60)
            self.log("T5: Settings Panel")
            try:
                self.close_all_panels(page)
                if self.human_click(page, "#settings-btn", "Settings button"):
                    human_delay(600, 1000)
                    sp = page.locator("#settings-panel")
                    if sp.is_visible() and "open" in (sp.get_attribute("class") or ""):
                        self.report_pass("Settings panel opened")
                    else:
                        self.report_issue("Settings panel", "Panel did not open correctly")
                    self.screenshot(page, "settings_panel")

                    sp_body = page.locator("#sp-body")
                    sp_text = sp_body.inner_text() if sp_body.count() > 0 else ""
                    if "API Key" in sp_text or "Key" in sp_text:
                        self.report_pass("Settings panel has API Key config")
                    if "max" in sp_text.lower() or "chunk" in sp_text.lower():
                        self.report_pass("Settings panel has model parameters")

                    self.human_click(page, "#sp-close", "Close settings")
                    human_delay(400, 700)
                    if not page.evaluate("() => document.getElementById('settings-panel').classList.contains('open')"):
                        self.report_pass("Settings panel closed")
                    else:
                        self.report_issue("Settings panel", "Panel did not close")
                else:
                    self.report_issue("Settings panel", "Settings button not available")
            except Exception as e:
                self.report_issue("Settings panel", str(e))
            self.close_all_panels(page)

            # ===== T6: Skills Panel =====
            self.log("=" * 60)
            self.log("T6: Skills Panel")
            try:
                self.close_all_panels(page)
                if self.human_click(page, "#skills-btn", "Skills button"):
                    human_delay(600, 1000)
                    skp = page.locator("#skills-panel")
                    if skp.is_visible() and "open" in (skp.get_attribute("class") or ""):
                        self.report_pass("Skills panel opened")
                    self.screenshot(page, "skills_panel")

                    tabs = page.locator(".skp-tab")
                    if tabs.count() >= 2:
                        self.report_pass(f"Skills panel has {tabs.count()} tabs")
                        for tab_name in ["custom", "add", "builtin"]:
                            tab = page.locator(f'.skp-tab[data-tab="{tab_name}"]')
                            if tab.count() > 0:
                                self.human_click(page, f'.skp-tab[data-tab="{tab_name}"]', f"Tab: {tab_name}")
                                human_delay(300, 500)
                                self.report_pass(f"Tab '{tab_name}' clickable")
                                self.screenshot(page, f"skills_tab_{tab_name}")

                    skill_items = page.locator(".sk-item")
                    if skill_items.count() > 0:
                        self.report_pass(f"Built-in skills list: {skill_items.count()} items")

                    self.human_click(page, "#skp-close", "Close skills")
                    human_delay(400, 700)
                else:
                    self.report_issue("Skills panel", "Skills button not available")
            except Exception as e:
                self.report_issue("Skills panel", str(e))
            self.close_all_panels(page)

            # ===== T7: Runs Panel =====
            self.log("=" * 60)
            self.log("T7: Runs Panel")
            try:
                self.close_all_panels(page)
                if self.human_click(page, "#runs-btn", "Runs button"):
                    human_delay(600, 1000)
                    rp = page.locator("#runs-panel")
                    if rp.is_visible() and "open" in (rp.get_attribute("class") or ""):
                        self.report_pass("Runs panel opened")
                    self.screenshot(page, "runs_panel")
                    if self.check_exists(page, "#rp-metrics", "Metrics area"):
                        self.report_pass("Runs metrics area exists")
                    self.human_click(page, "#rp-close", "Close runs")
                    human_delay(400, 700)
                else:
                    self.report_issue("Runs panel", "Runs button not available")
            except Exception as e:
                self.report_issue("Runs panel", str(e))
            self.close_all_panels(page)

            # ===== T8: Chat Input =====
            self.log("=" * 60)
            self.log("T8: Chat Input & Send")
            try:
                self.close_all_panels(page)
                input_el = page.locator("#input")
                if input_el.count() > 0 and input_el.is_visible():
                    self.report_pass("Chat input visible")
                    test_msg = "Hello, this is a test message"
                    input_el.click()
                    human_delay(100, 200)
                    input_el.fill("")
                    for char in test_msg:
                        input_el.type(char, delay=random.randint(30, 80))
                    human_delay(200, 400)
                    val = input_el.input_value()
                    if val == test_msg:
                        self.report_pass("Input content correct")
                    else:
                        self.report_issue("Chat input", f"Value mismatch: '{val}'")
                    self.screenshot(page, "chat_input")
                    send_btn = page.locator("#send-btn")
                    if send_btn.count() > 0 and send_btn.is_visible():
                        self.report_pass("Send button visible")
                    input_el.fill("")
                else:
                    self.report_issue("Chat input", "Input box not visible")
                empty = page.locator("#empty-state")
                if empty.count() > 0 and empty.is_visible():
                    self.report_pass("Empty state shown")
            except Exception as e:
                self.report_issue("Chat input", str(e))

            # ===== T9: Suggestion Buttons =====
            self.log("=" * 60)
            self.log("T9: Suggestion Buttons")
            try:
                suggestions = page.locator(".sugg")
                count = suggestions.count()
                if count > 0:
                    self.report_pass(f"Found {count} suggestion buttons")
                    for i in range(min(count, 4)):
                        btn = suggestions.nth(i)
                        text = btn.inner_text()
                        prompt = btn.get_attribute("data-prompt")
                        if prompt:
                            self.report_pass(f"Suggestion '{text[:20]}...' has prompt")
                        else:
                            self.report_warning("Suggestions", f"'{text[:20]}' missing data-prompt")
                    self.human_click(page, ".sugg:first-child", "First suggestion")
                    human_delay(300, 600)
                    val = page.locator("#input").input_value()
                    if val:
                        self.report_pass("Suggestion click fills input")
                    else:
                        self.report_warning("Suggestions", "Click did not fill input")
                else:
                    self.report_warning("Suggestions", "No suggestion buttons found")
            except Exception as e:
                self.report_issue("Suggestions", str(e))

            # ===== T10: Export =====
            self.log("=" * 60)
            self.log("T10: Export Function")
            try:
                self.close_all_panels(page)
                export_btn = page.locator("#export-btn")
                if export_btn.count() > 0:
                    self.human_click(page, "#export-btn", "Export button")
                    human_delay(300, 600)
                    export_menu = page.locator("#export-menu")
                    if export_menu.is_visible():
                        self.report_pass("Export menu opened")
                        self.screenshot(page, "export_menu")
                        options = export_menu.locator("button")
                        for i in range(options.count()):
                            fmt = options.nth(i).get_attribute("data-fmt")
                            text = options.nth(i).inner_text()
                            self.report_pass(f"Export option: {text} ({fmt})")
                        page.keyboard.press("Escape")
                        human_delay(200, 400)
                    else:
                        self.report_issue("Export", "Menu not shown")
                else:
                    self.report_issue("Export", "Export button missing")
            except Exception as e:
                self.report_issue("Export", str(e))

            # ===== T11: Clear Chat =====
            self.log("=" * 60)
            self.log("T11: Clear Chat Button")
            try:
                self.close_all_panels(page)
                clear_btn = page.locator("#clear-chat-btn")
                if clear_btn.count() > 0 and clear_btn.is_visible():
                    self.report_pass("Clear chat button visible")
                    self.human_click(page, "#clear-chat-btn", "Clear chat")
                    human_delay(500, 1000)
                    self.report_pass("Clear chat button clickable")
                else:
                    self.report_issue("Clear chat", "Button not visible")
            except Exception as e:
                self.report_issue("Clear chat", str(e))

            # ===== T12: Chapter View =====
            self.log("=" * 60)
            self.log("T12: Chapter View")
            try:
                self.close_all_panels(page)
                ch_btn = page.locator("#view-chapter-btn")
                if ch_btn.count() > 0 and ch_btn.is_visible():
                    self.human_click(page, "#view-chapter-btn", "Chapter button")
                    human_delay(500, 1000)
                    self.report_pass("Chapter view button clickable")
                    self.screenshot(page, "chapter_view")
                    drawer = page.locator("#drawer")
                    if drawer.count() > 0:
                        is_open = "open" in (drawer.get_attribute("class") or "")
                        if is_open:
                            self.report_pass("Chapter drawer opened")
                        else:
                            self.report_warning("Chapter view", "Drawer not opened (no chapter data?)")
                else:
                    self.report_issue("Chapter view", "Button missing")
            except Exception as e:
                self.report_issue("Chapter view", str(e))

            # ===== T13: Command Palette =====
            self.log("=" * 60)
            self.log("T13: Command Palette (Ctrl+K)")
            try:
                self.close_all_panels(page)
                page.keyboard.press("Control+k")
                human_delay(500, 800)
                cmdk = page.locator("#cmdk-overlay")
                if cmdk.count() > 0:
                    is_hidden = "hidden" in (cmdk.get_attribute("class") or "")
                    if not is_hidden:
                        self.report_pass("Command palette opened")
                        self.screenshot(page, "command_palette")
                        cmdk_input = page.locator("#cmdk-input")
                        if cmdk_input.count() > 0:
                            cmdk_input.fill("settings")
                            human_delay(300, 500)
                            items = page.locator(".cmdk-item")
                            if items.count() > 0:
                                self.report_pass(f"Command palette search: {items.count()} results")
                            else:
                                self.report_warning("Command palette", "Search returned no results")
                        page.keyboard.press("Escape")
                        human_delay(300, 500)
                    else:
                        self.report_issue("Command palette", "Ctrl+K did not trigger")
                else:
                    self.report_issue("Command palette", "Element does not exist")
            except Exception as e:
                self.report_issue("Command palette", str(e))

            # ===== T14: Model Switch =====
            self.log("=" * 60)
            self.log("T14: Model Switch Dropdown")
            try:
                self.close_all_panels(page)
                model_chip = page.locator("#model-chip")
                if model_chip.count() > 0 and model_chip.is_visible():
                    self.human_click(page, "#model-chip", "Model chip")
                    human_delay(400, 700)
                    model_menu = page.locator("#model-switch")
                    if model_menu.count() > 0:
                        is_open = "open" in (model_menu.get_attribute("class") or "")
                        if is_open:
                            self.report_pass("Model dropdown opened")
                            self.screenshot(page, "model_menu")
                            model_btns = model_menu.locator("button")
                            if model_btns.count() > 0:
                                self.report_pass(f"Model list: {model_btns.count()} options")
                            page.keyboard.press("Escape")
                            human_delay(300, 500)
                        else:
                            self.report_warning("Model switch", "Dropdown did not open")
                    else:
                        self.report_issue("Model switch", "Model menu element missing")
                else:
                    self.report_issue("Model switch", "Model chip not visible")
            except Exception as e:
                self.report_issue("Model switch", str(e))

            # ===== T15: Responsive Layout =====
            self.log("=" * 60)
            self.log("T15: Responsive Layout")
            try:
                self.close_all_panels(page)
                for vp_name, w, h in [("desktop", 1440, 900), ("tablet", 768, 1024), ("mobile", 375, 812)]:
                    page.set_viewport_size({"width": w, "height": h})
                    human_delay(400, 700)
                    overflow = page.evaluate("""() => {
                        const app = document.querySelector('.app');
                        return app ? app.scrollWidth <= window.innerWidth : true;
                    }""")
                    if overflow:
                        self.report_pass(f"Responsive {vp_name} ({w}x{h}) OK")
                    else:
                        self.report_issue("Responsive", f"{vp_name} content overflow")
                    self.screenshot(page, f"responsive_{vp_name}")
                page.set_viewport_size({"width": 1440, "height": 900})
                human_delay(300, 500)
            except Exception as e:
                self.report_issue("Responsive", str(e))

            # ===== T16: API Endpoints =====
            self.log("=" * 60)
            self.log("T16: API Endpoints")
            try:
                self.close_all_panels(page)
                for ep in ["/api/health", "/api/config", "/api/settings",
                           "/api/projects", "/api/models", "/api/skills", "/api/config/models"]:
                    try:
                        resp = page.request.get(f"{BASE_URL}{ep}")
                        if resp.status == 200:
                            self.report_pass(f"API {ep} -> 200")
                        else:
                            self.report_issue("API", f"{ep} -> {resp.status}")
                    except Exception as e:
                        self.report_issue("API", f"{ep} failed: {str(e)[:80]}")
            except Exception as e:
                self.report_issue("API endpoints", str(e))

            # ===== T17: Keyboard Shortcuts =====
            self.log("=" * 60)
            self.log("T17: Keyboard Shortcuts")
            try:
                self.close_all_panels(page)
                page.keyboard.press("Escape")
                human_delay(200, 400)
                self.report_pass("Escape key works")
                input_el = page.locator("#input")
                if input_el.count() > 0:
                    input_el.click()
                    focused = page.evaluate("() => document.activeElement.id")
                    if focused == "input":
                        self.report_pass("Input focus correct")
            except Exception as e:
                self.report_issue("Keyboard shortcuts", str(e))

            # ===== T18: Workflow Phases =====
            self.log("=" * 60)
            self.log("T18: Workflow Phases Display")
            try:
                self.close_all_panels(page)
                wf_box = page.locator(".wf-box")
                if wf_box.count() > 0:
                    self.report_pass("Workflow phases box exists")
                    self.screenshot(page, "workflow_phases")
                    wf_text = page.locator(".wf-box").inner_text()
                    if len(wf_text.strip()) > 10:
                        self.report_pass("Workflow phases have content")
                    else:
                        self.report_warning("Workflow", "Phases content too short")
                else:
                    self.report_warning("Workflow", "Workflow box not found")
            except Exception as e:
                self.report_issue("Workflow", str(e))

            # ===== T19: Page Performance =====
            self.log("=" * 60)
            self.log("T19: Page Performance")
            try:
                perf = page.evaluate("""() => {
                    const entries = performance.getEntriesByType('navigation');
                    if (!entries.length) return null;
                    const p = entries[0];
                    return {
                        domContentLoaded: Math.round(p.domContentLoadedEventEnd),
                        loadComplete: Math.round(p.loadEventEnd),
                        responseTime: Math.round(p.responseEnd - p.requestStart),
                        resourceCount: performance.getEntriesByType('resource').length,
                    };
                }""")
                if perf:
                    self.log(f"DOM: {perf['domContentLoaded']}ms, Load: {perf['loadComplete']}ms, Response: {perf['responseTime']}ms, Resources: {perf['resourceCount']}")
                    if perf['loadComplete'] > 5000:
                        self.report_issue("Performance", f"Slow load: {perf['loadComplete']}ms", "warning")
                    else:
                        self.report_pass(f"Page performance OK ({perf['loadComplete']}ms)")
            except Exception as e:
                self.report_issue("Performance", str(e))

            # ===== T20: Connection Status =====
            self.log("=" * 60)
            self.log("T20: Connection Status Indicator")
            try:
                conn_dot = page.locator("#conn-dot")
                if conn_dot.count() > 0:
                    human_delay(2000, 3000)
                    status_class = page.evaluate("() => document.getElementById('conn-status')?.className || ''")
                    if 'online' in status_class:
                        self.report_pass("Backend connection: Online")
                    elif 'offline' in status_class:
                        self.report_issue("Connection", "Backend shows offline")
                    else:
                        self.report_warning("Connection", f"Status unknown: {status_class}")
                else:
                    self.report_warning("Connection", "Connection indicator missing")
            except Exception as e:
                self.report_issue("Connection status", str(e))

            # ===== Collect Console Logs =====
            self.log("=" * 60)
            self.log("Collecting console logs...")
            for err in self.console_errors:
                if "favicon" not in err.lower():
                    self.report_issue("Console error", err[:200])
            for warn in self.console_warnings[:10]:
                if "favicon" not in warn.lower():
                    self.report_warning("Console warning", warn[:200])

            # ===== Generate Report =====
            errors = [i for i in self.issues if i["severity"] == "error"]
            warnings = [i for i in self.issues if i["severity"] == "warning"]

            report = {
                "timestamp": datetime.now().isoformat(),
                "summary": {
                    "total": len(self.passed) + len(self.issues),
                    "passed": len(self.passed),
                    "errors": len(errors),
                    "warnings": len(warnings),
                    "pass_rate": f"{len(self.passed) / max(1, len(self.passed) + len(errors)) * 100:.1f}%",
                },
                "passed_tests": self.passed,
                "issues": self.issues,
                "screenshots": self.screenshots,
                "console_errors": self.console_errors[:20],
                "console_warnings": self.console_warnings[:20],
            }

            with open(REPORT_FILE, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)

            self.log("=" * 60)
            self.log(f"Test Complete!")
            self.log(f"  Passed: {len(self.passed)}")
            self.log(f"  Errors: {len(errors)}")
            self.log(f"  Warnings: {len(warnings)}")
            self.log(f"  Pass Rate: {report['summary']['pass_rate']}")
            self.log(f"  Report: {REPORT_FILE}")
            self.log(f"  Screenshots: {SCREENSHOT_DIR}/")

            browser.close()
            return report


if __name__ == "__main__":
    agent = HumanUIAgent()
    agent.run()
