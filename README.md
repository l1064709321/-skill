# 天衍 (Tianyan)

> 多 Agent 协同 AI 小说创作系统 — TypeScript 重写版

**7 个 Agent 协同**，按强制流水线完成从扫榜调研到定稿交付的完整长篇创作闭环，内置「毒舌总编」审稿机制、35 维质检打回循环、真实浏览器扫榜。

[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-4-green)](https://hono.dev)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL--3.0-blueviolet)](https://www.gnu.org/licenses/agpl-3.0.html)

---

## ✨ 核心特性

### 7 步强制创作流水线

| 步骤 | 名称 | 负责 Agent | 说明 |
|------|------|-----------|------|
| 1 | 扫榜调研 | 📐 story-architect | 真实浏览器抓取 起点三江/往期三江/番茄/晋江/飞卢/书旗 畅销榜数据 |
| 2 | 拆书解构 | 📐 story-architect | 分析对标作品的钩子/节奏/人设/文风 |
| 3 | 角色架构 | 👤 character-designer | 建立角色档案(外貌/性格/金手指/弧光)、世界观设定 |
| 4 | 大纲搭建 | 📐 story-architect | 全书大纲 → 卷纲 → 细纲，设计钩子密度与情绪曲线 |
| 5 | 正文写作 | ✍️ narrative-writer | 正文写作 + 去 AI 味，系统自动触发审查 |
| 6 | 总编终审 | 🎯 orchestrator | 毒舌评分(1-10)，<7 打回重写，通过才放行 |
| 7 | 导出交付 | 🎯 orchestrator | 导出最终 `.txt` 文件 |

### 多 Agent 协同

| Agent | 职责 | 阶段 |
|-------|------|------|
| 🎯 orchestrator (总编) | 调度中枢 + 毒舌审稿 | 全阶段 |
| 📐 story-architect (架构师) | 扫榜/拆书/选题/世界观/大纲 | 1-4 |
| ✍️ narrative-writer (主笔) | 正文写作/润色/改写/去 AI 味 | 5 |
| 👤 character-designer (角色师) | 角色档案/对话/人设弧线 | 2-3 |
| 🔍 consistency-checker (质检员) | 四重校验(伏笔/文风/主线/OOC) | 7 |
| 📊 story-explorer (资料员) | 风格缓存/上下文加载 | 5 |
| 📋 presenter (监制) | 整合定稿/交付报告 | 8 |

### 真实浏览器扫榜

使用 **Playwright + stealth 插件**，绕过反爬检测，真实抓取小说平台数据：

| 平台 | 支持榜单 | 状态 |
|------|---------|------|
| 起点中文网 | 畅销榜 / 月票榜 / 人气榜 / 三江推荐 / 往期三江 | ✅ |
| 起点女生网 | 畅销榜 / 月票榜 / 人气榜 / 新书榜 | ✅ |
| 番茄小说 | 阅读榜 / 新书榜 / 热度榜 (男频/女频) | ✅ |
| 晋江文学城 | 月票榜 / 收藏榜 / 点击榜 / 推荐榜 / VIP 榜 | ✅ |
| 飞卢小说网 | 排行榜 / 月票榜 / 收藏榜 / 点击榜 | ✅ |
| 书旗小说 | 点击榜 (男频/女频) | ✅ |
| 豆瓣阅读 | 畅销榜 / 新书榜 | ✅ |

### 其他亮点

- **毒舌审稿机制**：每章评分 1-10，<7 自动打回重写
- **35 维质检**：伏笔冲突 / 文风一致性 / 主线推进 / 角色 OOC 全面校验
- **短期+长期记忆**：Agent 跨轮次保持上下文
- **内置 111 位作家语料库**：支持风格匹配与仿写
- **Web 预览界面**：实时查看进度、思考链、对话历史

---

## 🚀 快速开始

### 前置要求

- **Node.js ≥ 18** ([下载](https://nodejs.org))
- **Python 3** (可选，用于技能桥接/审计/AI味检测)

### 一键启动

```bash
# Linux / macOS
bash start.sh

# Windows
start.bat
```

首次运行会自动：
1. 安装 npm 依赖
2. 编译 TypeScript
3. 初始化配置文件 → `~/.tianyan/config.yaml`
4. 安装 Playwright Chromium 浏览器

**首次使用必须编辑配置填入 API Key：**

```bash
# 打开配置文件
nano ~/.tianyan/config.yaml
```

修改 `default_model.api_key` 为你的 API Key。

### 手动启动

```bash
npm install
npm run build
node dist/index.js
```

打开浏览器访问 **http://localhost:8093**。

---

## ⚙️ 配置

配置文件位置：`~/.tianyan/config.yaml`

```yaml
default_model:
  model: "agnes-2.5-flash"        # 或 deepseek/gpt 等
  api_key: "你的 API Key"          # 填入你的密钥
  api_base: "https://apihub.agnes-ai.com/v1"
  temperature: 0.8
  max_tokens: 4096

max_steps: 16
run_max_duration: 1800            # 秒，完整流程需要 ~10 分钟
server_port: 8093

agents:
  orchestrator:       { max_turns: 16, max_steps: 24 }
  story-architect:    { max_turns: 10, max_steps: 16 }
  narrative-writer:   { max_turns: 6,  max_steps: 10 }
  character-designer: { max_turns: 6,  max_steps: 10 }
```

支持的模型提供商（通过前端「模型配置」界面添加）：
- Agnes AI / DeepSeek / OpenAI / Anthropic Claude / Google Gemini
- 阿里云通义千问 / 智谱 GLM / 月之暗面 Kimi / 火山引擎豆包
- 硅基流动 / OpenRouter / Together AI / Ollama 本地等 16+

---

## 📁 项目结构

```
tianyan/
├── src/                    # TypeScript 源码
│   ├── index.ts            # Hono HTTP 服务 + API 路由
│   ├── agents/             # Agent 配置、工具定义、ReAct 循环
│   │   ├── index.ts        # 7 个 Agent 定义 + 提示词
│   │   └── runner.ts       # Agent 运行引擎 (36 工具调度)
│   ├── browser.ts          # Playwright 真实浏览器抓取
│   ├── llm.ts              # LLM 接口 (OpenAI 兼容)
│   ├── store.ts            # SQLite 持久化
│   ├── workflow.ts         # 状态机阶段管控
│   └── skills.ts           # 技能系统 (Python 桥接)
├── web/                    # 前端 (原生 HTML/CSS/JS)
│   ├── index.html          # 主界面
│   ├── app.js              # 前端逻辑
│   └── style.css           # 样式
├── app/                    # Python 技能 (AI味检测/审计等)
├── config.example.yaml     # 配置模板
├── start.sh                # Linux/macOS 一键启动
├── start.bat               # Windows 一键启动
└── package.json
```

---

## 🔧 可用工具 (36 个)

| 分类 | 工具 | 说明 |
|------|------|------|
| 项目 | query_project | 查询项目状态/章节/元素 |
| 扫榜 | scan_bestseller | 真实浏览器抓取平台榜单 |
| 拆书 | analyze_novel | 拆解对标作品结构 |
| 大纲 | generate_outline | 生成大纲 + 自动创建章节骨架 |
| 大纲 | manage_outline | 查询/更新章节大纲 |
| 角色 | manage_character | 创建/查询角色档案 |
| 世界观 | manage_world | 管理地点/势力/规则/时间线 |
| 写作 | continue_writing | 续写正文 |
| 写作 | ghostwrite | 指定风格代笔 |
| 审核 | review_chapter | 毒舌评分审稿 |
| 质检 | quality_check | 35 维质检 |
| AI检测 | detect_ai | 检测 AI 味浓度 |
| 搜索 | web_search / browser_search | 联网搜索 |
| 抓取 | web_fetch / browser_fetch | 抓取网页正文 |
| 导出 | export_project_data | 导出 txt/json |
| 委派 | delegate_to_agent | Agent 间任务委派 |
| ... | (共 36 个) | |

---

## 📋 工作流模式

| 模式 | 说明 |
|------|------|
| **状态机** (默认) | 严格阶段门禁：扫榜 → 拆书 → 角色 → 大纲 → 写作 → 审核 → 导出，不可跳步 |
| CrewAI | 灵活协作：跳过阶段门禁，适合快速迭代 |

通过 `switch_workflow_mode` 工具或前端界面切换。

---

## 🗄️ 数据存储

- 数据库：`~/.tianyan/novel.db` (SQLite)
- 截图：`~/.tianyan/screenshots/`
- 导出文件：`~/.tianyan/exports/`
- **config.yaml** 已 gitignore，不入仓库

---

## 📜 License

- 代码：[GNU AGPL v3](LICENSE)
- 协议：见 [USER_AGREEMENT.md](USER_AGREEMENT.md)
