# AI Chat Agent 完整教学文档

> 本文档面向对 AI Agent 项目几乎不了解、只懂一些 Vue 前端开发的读者。我们会用通俗易懂的语言，详细介绍每一个对象、每一行代码的作用。

---

## 目录

1. [项目概述：什么是 AI Agent？](#1-项目概述什么是-ai-agent)
2. [技术栈详解：每个技术是什么？](#2-技术栈详解每个技术是什么)
3. [项目结构：文件都在干什么？](#3-项目结构文件都在干什么)
4. [后端详解：server/index.mjs 逐行解析](#4-后端详解serverindexmjs-逐行解析)
5. [前端详解：App.vue 逐行解析](#5-前端详解appvue-逐行解析)
6. [组件详解：子组件都在干什么？](#6-组件详解子组件都在干什么)
7. [配置文件：package.json 和 vite.config](#7-配置文件packagejson-和-viteconfig)
8. [核心概念：Agent Loop、SSE 流、工具调用](#8-核心概念agent-loopsse-流工具调用)
9. [数据流：从用户输入到 AI 回复](#9-数据流从用户输入到-ai-回复)
10. [常见问题与调试技巧](#10-常见问题与调试技巧)

---

## 1. 项目概述：什么是 AI Agent？

### 1.1 什么是 AI Agent？

**AI Agent（AI 智能体）** 是一种能够自主执行任务的 AI 系统。与普通的聊天机器人不同，Agent 可以：

- **使用工具**：比如联网搜索、数学计算、生成图片等
- **多步推理**：遇到复杂任务时，可以分步骤调用多个工具
- **自主决策**：根据用户的问题，判断是否需要调用工具，调用哪个工具

**举个例子**：
- 普通聊天机器人：你问"北京天气怎么样？"，它可能会瞎编一个答案
- AI Agent：你问"北京天气怎么样？"，它会判断"这是实时信息，我需要调用联网搜索工具"，然后真的去搜索，最后给你准确答案

### 1.2 这个项目能做什么？

这个项目是一个完整的 AI Agent 演示应用，具备以下能力：

| 功能 | 说明 |
|------|------|
| 流式对话 | AI 回复像打字一样逐字显示，不用等全部生成完 |
| 工具调用 | 获取时间、生成密码、数学计算、联网搜索、生成图片 |
| 文件上传 | 上传 TXT/CSV/PDF，AI 可以基于文件内容回答问题 |
| 图片上传 | 上传图片让 AI 分析（需要视觉模型支持） |
| 多轮对话 | 支持上下文记忆，AI 能理解前后文 |
| 长对话压缩 | 对话超过 20 轮自动压缩，防止 token 溢出 |
| 对话管理 | 新建、切换、删除、导出/导入对话 |

### 1.3 项目架构概览

这个项目采用**前后端分离**架构：

```
┌─────────────────┐
│   前端 (Vue 3)   │  ← 用户界面，运行在浏览器
│  端口：5173      │
└────────┬────────┘
         │ HTTP 请求
         ↓
┌─────────────────┐
│  后端 (Express)  │  ← 业务逻辑，调用 AI API
│  端口：3001      │
└────────┬────────┘
         │ API 调用
         ↓
┌─────────────────┐
│  AI 模型 API    │  ← DeepSeek / OpenAI 等
│  (云端服务)      │
└─────────────────┘
```

**为什么需要后端？**
- 前端运行在浏览器，直接调用 AI API 会暴露 API Key（不安全）
- 后端可以统一管理 API Key，处理文件解析、工具调用等复杂逻辑
- 后端可以实现流式响应（SSE），让 AI 回复逐字显示

---

## 2. 技术栈详解：每个技术是什么？

### 2.1 前端技术栈

#### Vue 3
- **是什么**：渐进式 JavaScript 框架，用于构建用户界面
- **为什么用它**：轻量、易学、生态丰富
- **核心概念**：
  - **组件化**：把页面拆分成独立的小模块（如 `App.vue`、`ChatSidebar.vue`）
  - **响应式**：数据变化时，页面自动更新
  - **Composition API**：Vue 3 的新写法，用 `setup()` 或 `<script setup>` 组织代码

#### Vite
- **是什么**：下一代前端构建工具
- **为什么用它**：比 Webpack 快 10-100 倍，开发时秒级启动
- **核心功能**：
  - 开发服务器：提供热更新（改代码自动刷新）
  - 代理配置：解决跨域问题（前端 5173 端口访问后端 3001 端口）
  - 打包构建：把代码压缩优化，部署到生产环境

#### Tailwind CSS
- **是什么**：实用优先的 CSS 框架
- **为什么用它**：不用写 CSS 文件，直接用类名组合样式
- **示例**：
  ```html
  <div class="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2">
  ```
  这一行包含了：flex 布局、居中对齐、间距 2、圆角、背景色、内边距

#### Vercel AI SDK (@ai-sdk/vue)
- **是什么**：Vercel 官方提供的 AI 开发 SDK
- **为什么用它**：
  - 封装了与 AI API 的通信逻辑
  - 提供了 `Chat` 类，简化流式对话处理
  - 支持工具调用、多模态（图片+文本）等高级功能
- **核心对象**：
  - `Chat`：管理对话状态、发送消息、处理响应
  - `DefaultChatTransport`：负责把消息发送到后端

#### marked
- **是什么**：Markdown 解析器
- **为什么用它**：AI 回复通常是 Markdown 格式，需要转换成 HTML 显示
- **示例**：把 `**加粗**` 转换成 `<strong>加粗</strong>`

#### lucide-vue-next
- **是什么**：图标库
- **为什么用它**：图标丰富、体积小、支持 Vue 3
- **示例**：`import { Bot, Send } from 'lucide-vue-next'`

### 2.2 后端技术栈

#### Express
- **是什么**：Node.js 的 Web 框架
- **为什么用它**：轻量、灵活、生态丰富
- **核心功能**：
  - 路由：定义 API 接口（如 `/api/chat`）
  - 中间件：处理 CORS、JSON 解析等
  - 流式响应：支持 SSE（Server-Sent Events）

#### @ai-sdk/openai
- **是什么**：OpenAI 兼容的 AI SDK
- **为什么用它**：
  - 支持 OpenAI、DeepSeek 等多种模型
  - 提供了 `streamText`、`generateText` 等高级 API
  - 支持工具调用、流式输出

#### zod
- **是什么**：TypeScript 优先的 schema 验证库
- **为什么用它**：
  - 定义工具的参数 schema
  - 自动验证 AI 传入的参数是否合法
  - 生成参数的 TypeScript 类型

#### pdf-parse / pdfjs-dist
- **是什么**：PDF 解析库
- **为什么用它**：提取 PDF 中的文本内容
- **区别**：
  - `pdf-parse`：简单易用，适合普通 PDF
  - `pdfjs-dist`：Mozilla 官方库，功能更强大，支持扫描件 OCR

#### tesseract.js
- **是什么**：OCR（光学字符识别）库
- **为什么用它**：识别扫描件 PDF 中的文字
- **注意**：识别速度较慢，准确率一般

### 2.3 环境变量

#### .env 文件
```env
OPENAI_API_KEY=sk-xxxxx          # AI 模型的 API Key
OPENAI_MODEL=deepseek-chat        # 使用的模型名称
OPENAI_BASE_URL=https://api.deepseek.com/v1  # API 地址
TAVILY_API_KEY=tvly-xxxxx         # 联网搜索 API Key（可选）
```

**为什么用 .env？**
- 敏感信息（API Key）不能提交到 Git
- 不同环境（开发/生产）可以用不同的配置
- 修改配置不用改代码

---

## 3. 项目结构：文件都在干什么？

```
ai-chat-agent/
├── server/                    # 后端代码
│   └── index.mjs             # 后端入口，定义所有 API 接口
│
├── src/                       # 前端代码
│   ├── components/           # 组件目录
│   │   ├── ChatSidebar.vue   # 侧边栏：对话列表管理
│   │   ├── MarkdownRenderer.vue  # Markdown 渲染器
│   │   └── SettingsModal.vue # 设置面板：模型切换、温度调节
│   ├── App.vue               # 主组件：聊天界面
│   ├── main.js               # 前端入口：挂载 Vue 应用
│   └── style.css             # 全局样式
│
├── index.html                 # HTML 入口文件
├── package.json               # 项目配置：依赖、脚本
├── vite.config.mjs           # Vite 配置：代理、插件
├── .env                       # 环境变量（不提交到 Git）
├── .gitignore                 # Git 忽略配置
└── README.md                  # 项目说明
```

### 3.1 关键文件说明

#### server/index.mjs（后端核心）
- 定义了 3 个 API 接口：
  - `POST /api/parse-file`：解析上传的文件（TXT/CSV/PDF）
  - `POST /api/chat`：处理聊天消息，调用 AI 模型
- 实现了 4 个工具：
  - `getCurrentTime`：获取当前时间
  - `generatePassword`：生成随机密码
  - `calculate`：数学计算
  - `webSearch`：联网搜索
  - `generateImage`：生成图片
- 实现了 Agent Loop：最多 5 轮工具调用

#### src/App.vue（前端核心）
- 聊天界面主组件
- 管理对话状态、消息列表
- 处理文件上传、图片上传
- 渲染消息、工具调用卡片

#### src/components/（子组件）
- `ChatSidebar.vue`：侧边栏，显示对话列表，支持新建/切换/删除
- `MarkdownRenderer.vue`：把 AI 回复的 Markdown 转换成 HTML
- `SettingsModal.vue`：设置面板，切换模型、调节温度、导出/导入对话

---

## 4. 后端详解：server/index.mjs 逐行解析

### 4.1 导入依赖

```javascript
import express from "express";
import cors from "cors";
import { streamText, generateText, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `import express from "express"` | 导入 Express 框架，用于创建 Web 服务器 |
| `import cors from "cors"` | 导入 CORS 中间件，允许跨域请求（前端 5173 访问后端 3001） |
| `import { streamText, generateText, convertToModelMessages } from "ai"` | 从 AI SDK 导入核心函数：<br>- `streamText`：流式生成文本<br>- `generateText`：一次性生成文本<br>- `convertToModelMessages`：把前端消息格式转换成模型格式 |
| `import { createOpenAI } from "@ai-sdk/openai"` | 创建 OpenAI 兼容的模型实例（支持 DeepSeek、OpenAI 等） |
| `import { z } from "zod"` | 导入 zod，用于定义工具的参数 schema |
| `import { PDFParse } from "pdf-parse"` | 导入 PDF 解析库（简单版） |
| `import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"` | 导入 pdfjs-dist（高级版，支持复杂 PDF） |
| `import { createWorker } from "tesseract.js"` | 导入 OCR 库，用于识别扫描件 PDF |
| `import { fileURLToPath, pathToFileURL } from "node:url"` | Node.js 内置模块，处理文件路径 |
| `import { dirname, resolve } from "node:path"` | Node.js 内置模块，拼接路径 |
| `import { createCanvas } from "@napi-rs/canvas"` | 导入 Canvas 库，用于生成图片（可选功能） |

### 4.2 配置 pdfjs worker

```javascript
// 配置 pdfjs worker（Node.js 环境必需，Windows 需要 file:// URL）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve(__dirname, "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;
```

**为什么需要这段代码？**

pdfjs-dist 使用 Web Worker 在后台线程解析 PDF，避免阻塞主线程。在浏览器中，Worker 可以自动加载；但在 Node.js 环境中，需要手动指定 Worker 文件的路径。

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const __filename = fileURLToPath(import.meta.url)` | 获取当前文件的绝对路径（ES 模块中没有 `__filename`，需要手动转换） |
| `const __dirname = dirname(__filename)` | 获取当前文件所在目录 |
| `pdfjs.GlobalWorkerOptions.workerSrc = ...` | 设置 Worker 文件路径，使用 `file://` 协议（Windows 必需） |

### 4.3 创建 Express 应用

```javascript
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const app = express()` | 创建 Express 应用实例 |
| `app.use(cors())` | 启用 CORS，允许前端跨域访问后端 |
| `app.use(express.json({ limit: "10mb" }))` | 启用 JSON 解析中间件，限制请求体最大 10MB（防止上传过大文件） |

### 4.4 文件解析接口

```javascript
app.post("/api/parse-file", (req, res) => {
  const { fileName, base64 } = req.body;

  if (!fileName || !base64) {
    return res.status(400).json({ error: "缺少 fileName 或 base64" });
  }

  const ext = fileName.split(".").pop().toLowerCase();
  const buffer = Buffer.from(base64, "base64");

  // 限制文件大小 5MB
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "文件大小不能超过 5MB" });
  }
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `app.post("/api/parse-file", ...)` | 定义 POST 接口，路径为 `/api/parse-file` |
| `const { fileName, base64 } = req.body` | 从请求体中提取文件名和 base64 编码的文件内容 |
| `if (!fileName \|\| !base64)` | 参数校验：缺少必要参数时返回 400 错误 |
| `const ext = fileName.split(".").pop().toLowerCase()` | 提取文件扩展名（如 `pdf`、`txt`） |
| `const buffer = Buffer.from(base64, "base64")` | 把 base64 字符串转换成二进制 Buffer |
| `if (buffer.length > 5 * 1024 * 1024)` | 文件大小校验：超过 5MB 返回错误 |

#### 处理 TXT/CSV 文件

```javascript
  if (ext === "txt" || ext === "csv") {
    // TXT / CSV 直接转文本
    const text = buffer.toString("utf-8");
    return res.json({
      fileName,
      type: ext,
      text,
      charCount: text.length,
    });
  }
```

**解释**：TXT 和 CSV 是纯文本文件，直接把 Buffer 转换成 UTF-8 字符串即可。

#### 处理 PDF 文件

```javascript
  if (ext === "pdf") {
    // PDF 用 pdfjs-dist 提取，扫描件用 OCR
    (async () => {
      try {
        console.log(
          "[文件解析] 开始解析 PDF:",
          fileName,
          "大小:",
          buffer.length,
          "字节",
        );

        // 使用 pdfjs-dist 加载 PDF
        const uint8Array = new Uint8Array(buffer);
        const loadingTask = pdfjs.getDocument({
          data: uint8Array,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        console.log("[文件解析] PDF 总页数:", numPages);

        let fullText = "";
        let hasTextLayer = false;

        // 逐页提取文本
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // 将文本项组合成字符串
          const pageText = textContent.items.map((item) => item.str).join(" ");

          if (pageText.trim().length > 0) {
            hasTextLayer = true;
          }

          fullText += pageText + "\n\n";
          console.log(`[文件解析] 第 ${i} 页提取了 ${pageText.length} 个字符`);
        }

        await pdf.destroy();
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `(async () => { ... })()` | 立即执行的异步函数（IIFE），因为 PDF 解析是异步操作 |
| `const uint8Array = new Uint8Array(buffer)` | 把 Node.js Buffer 转换成 Uint8Array（pdfjs 要求） |
| `pdfjs.getDocument({ data: uint8Array, useSystemFonts: true })` | 加载 PDF 文档，`useSystemFonts` 表示使用系统字体 |
| `const pdf = await loadingTask.promise` | 等待 PDF 加载完成 |
| `const numPages = pdf.numPages` | 获取 PDF 总页数 |
| `for (let i = 1; i <= numPages; i++)` | 遍历每一页（页码从 1 开始） |
| `const page = await pdf.getPage(i)` | 获取第 i 页 |
| `const textContent = await page.getTextContent()` | 提取页面的文本内容 |
| `const pageText = textContent.items.map((item) => item.str).join(" ")` | 把文本项数组拼接成字符串 |
| `if (pageText.trim().length > 0)` | 检查是否有文本层（区分普通 PDF 和扫描件） |
| `fullText += pageText + "\n\n"` | 把所有页面的文本拼接起来 |
| `await pdf.destroy()` | 释放 PDF 资源 |

#### 处理扫描件 PDF

```javascript
        const text = fullText.trim();
        console.log("[文件解析] PDF 解析结果:", {
          textLength: text.length,
          totalPages: numPages,
          hasTextLayer,
          textPreview: text.slice(0, 200),
        });

        // 如果没有文本层或文本太少，说明是扫描件
        if (!hasTextLayer || text.length < 50) {
          console.log("[文件解析] 检测到扫描件 PDF，无法提取文本");
          return res.json({
            fileName,
            type: "pdf",
            text: "",
            charCount: 0,
            error:
              "这是一个扫描件 PDF，无法自动提取文本内容。建议使用带有文字层的 PDF 文件，或先将扫描件转换为可搜索的 PDF（使用 Adobe Acrobat、ABBYY FineReader 等工具进行 OCR）。",
          });
        }

        res.json({
          fileName,
          type: "pdf",
          text,
          charCount: text.length,
          pageCount: numPages,
        });
      } catch (err) {
        console.error("[文件解析] PDF 解析失败:", err.message, err.stack);
        res.status(500).json({ error: `PDF 解析失败: ${err.message}` });
      }
    })();
    return;
  }

  res
    .status(400)
    .json({ error: `不支持的文件格式: .${ext}，仅支持 .txt / .csv / .pdf` });
});
```

**解释**：
- 如果 PDF 没有文本层或文本太少（<50 字符），说明是扫描件（图片型 PDF），返回错误提示
- 如果解析成功，返回提取的文本内容
- 如果解析失败（如 PDF 损坏），返回 500 错误

### 4.5 联网搜索功能

#### DuckDuckGo 搜索（免费方案）

```javascript
async function searchDuckDuckGo(query) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; XiaoJunAgent/1.0)",
      Accept: "text/html",
    },
  });
  if (!resp.ok) throw new Error(`DuckDuckGo 返回 ${resp.status}`);
  const html = await resp.text();

  // 解析结果行：<a href="...">title</a><span>snippet</span>
  const results = [];
  const rowRegex =
    /<a\s+rel="nofollow"\s+href="([^"]+)"[^>]*>(.+?)<\/a>\s*<span[^>]*>(.+?)<\/span>/gi;
  let match;
  let count = 0;
  while ((match = rowRegex.exec(html)) !== null && count < 8) {
    // 过滤掉广告/非结果链接
    const rawHref = match[1];
    if (rawHref.includes("duckduckgo.com") || rawHref.includes("spreadprivacy"))
      continue;
    results.push({
      title: decodeHTML(match[2]),
      url: decodeHTML(
        rawHref
          .replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/i, "")
          .replace(/&rut=.*$/, ""),
      ),
      snippet: decodeHTML(match[3]).trim(),
    });
    count++;
  }
  return results;
}
```

**解释**：
- DuckDuckGo Lite 是简化版搜索引擎，返回 HTML 格式
- 用正则表达式提取搜索结果（标题、链接、摘要）
- 过滤掉广告链接
- 最多返回 8 条结果

#### Tavily 搜索（推荐方案）

```javascript
async function searchTavily(query, maxResults = 5) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      include_answer: true,
      search_depth: "basic",
    }),
  });
  if (!resp.ok) throw new Error(`Tavily 返回 ${resp.status}`);
  const data = await resp.json();
  return {
    answer: data.answer || null,
    results: (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || r.snippet,
    })),
  };
}
```

**解释**：
- Tavily 是专门为 AI 设计的搜索 API，返回结构化数据
- 需要 API Key（免费额度 1000 次/月）
- 返回 AI 摘要 + 搜索结果列表

#### 统一搜索入口

```javascript
async function webSearch(query, maxResults = 5) {
  if (process.env.TAVILY_API_KEY) {
    return searchTavily(query, maxResults);
  }
  return { results: await searchDuckDuckGo(query) };
}
```

**解释**：优先使用 Tavily，没有 API Key 则回退到 DuckDuckGo。

### 4.6 消息格式转换

```javascript
// 将 base64 data URL 转为 Uint8Array
function base64ToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer);
}

// 兼容新旧消息格式：将没有 parts 的 legacy 消息转换成 parts 格式
// 同时将 base64 图片转为 Uint8Array（convertToModelMessages 要求）
function normalizeMessages(messages) {
  return messages.map((msg) => {
    if (msg.parts) {
      return {
        ...msg,
        parts: msg.parts
          .filter((part) => part && part.type) // 过滤掉没有 type 的 part
          .map((part) => {
            if (part.type === "image" && typeof part.image === "string") {
              return {
                ...part,
                image: base64ToUint8Array(part.image),
              };
            }
            return part;
          }),
      };
    }

    // 检查是否有 content 数组（包含图片和文本）
    if (msg.content && Array.isArray(msg.content)) {
      return {
        ...msg,
        parts: msg.content
          .filter((part) => part && part.type)
          .map((part) => {
            if (part.type === "image" && typeof part.image === "string") {
              return {
                ...part,
                image: base64ToUint8Array(part.image),
              };
            }
            return part;
          }),
      };
    }

    // 旧格式：content 是字符串 → 转为 text part
    return {
      ...msg,
      parts: msg.content ? [{ type: "text", text: msg.content }] : [],
    };
  });
}
```

**为什么需要这个函数？**

前端发送的消息格式可能是：
1. **新格式**：`{ role: "user", parts: [{ type: "text", text: "..." }] }`
2. **旧格式**：`{ role: "user", content: "..." }`
3. **多模态格式**：`{ role: "user", content: [{ type: "text", text: "..." }, { type: "image", image: "data:image/..." }] }`

AI SDK 要求消息必须是 `parts` 格式，且图片必须是 `Uint8Array`（不是 base64 字符串）。这个函数负责统一转换。

### 4.7 聊天接口（核心）

```javascript
app.post("/api/chat", async (req, res) => {
  const rawMessages = req.body.messages || [];
  console.log("[/api/chat] rawMessages count:", rawMessages.length);
  console.log(
    "[/api/chat] rawMessages[0]:",
    JSON.stringify(rawMessages[0], null, 2),
  );
  const messages = normalizeMessages(rawMessages);
  console.log("[/api/chat] normalized messages count:", messages.length);

  // 从请求中读取设置参数
  const requestedModel =
    req.body.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const temperature = req.body.temperature ?? 0.7;

  // 文件上下文（用户上传的文件内容）
  const fileContext = req.body.fileContext || null;
  console.log(
    "[/api/chat] fileContext received:",
    fileContext
      ? {
          fileName: fileContext.fileName,
          type: fileContext.type,
          textLength: fileContext.text?.length,
        }
      : null,
  );

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL && {
      baseURL: process.env.OPENAI_BASE_URL,
    }),
  });
  const model = openai.chat(requestedModel);
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const rawMessages = req.body.messages \|\| []` | 从请求体中提取消息列表 |
| `const messages = normalizeMessages(rawMessages)` | 转换消息格式 |
| `const requestedModel = req.body.model \|\| ...` | 获取用户选择的模型（优先用户选择，否则用环境变量） |
| `const temperature = req.body.temperature ?? 0.7` | 获取温度参数（控制 AI 回复的随机性，0-1 之间） |
| `const fileContext = req.body.fileContext \|\| null` | 获取文件上下文（用户上传的文件内容） |
| `const openai = createOpenAI({ ... })` | 创建 OpenAI 兼容的模型实例 |
| `const model = openai.chat(requestedModel)` | 获取指定模型的聊天实例 |

### 4.8 长对话记忆压缩

```javascript
  // ===== 长对话记忆压缩 =====
  const COMPRESS_THRESHOLD = 20; // 超过 20 条消息触发压缩
  const KEEP_RECENT = 10; // 保留最近 10 条
  let conversationSummary = null;

  if (messages.length > COMPRESS_THRESHOLD) {
    console.log(
      `[记忆压缩] 消息数 ${messages.length} 超过阈值 ${COMPRESS_THRESHOLD}，触发压缩`,
    );

    // 提取前面的消息用于生成摘要
    const messagesToSummarize = messages.slice(
      0,
      messages.length - KEEP_RECENT,
    );
    const recentMessages = messages.slice(-KEEP_RECENT);

    // 生成摘要
    try {
      const summaryPrompt = `请将以下对话历史压缩成 200 字以内的摘要，保留关键信息：

${messagesToSummarize
  .filter((m) => m.role === "user" || m.role === "assistant")
  .map((m) => {
    const text =
      m.parts?.map((p) => (p.type === "text" ? p.text : "")).join(" ") || "";
    return `${m.role}: ${text.slice(0, 200)}`;
  })
  .join("\n")}

摘要要求：
- 用第三人称描述
- 保留用户的核心问题和 AI 的关键回答
- 忽略工具调用细节
- 不超过 200 字`;

      const summaryResult = await generateText({
        model,
        prompt: summaryPrompt,
      });

      conversationSummary = summaryResult.text;
      console.log(`[记忆压缩] 摘要生成成功：${conversationSummary.length} 字`);

      // 只保留最近的消息
      messages.length = 0;
      messages.push(...recentMessages);
    } catch (err) {
      console.error("[记忆压缩] 摘要生成失败：", err);
      // 失败时不压缩，继续使用全部消息
    }
  }
  // ===== 记忆压缩结束 =====
```

**为什么需要记忆压缩？**

AI 模型有 token 限制（如 4K、8K、32K），对话太长会导致：
1. 超出 token 限制，请求失败
2. 处理速度变慢
3. 成本增加

**压缩策略**：
- 超过 20 条消息时触发压缩
- 用 AI 生成前 10 条消息的摘要（200 字以内）
- 只保留最近 10 条消息 + 摘要

### 4.9 系统提示词（System Prompt）

```javascript
  const SYSTEM_PROMPT = [
    "# 你是谁",
    "",
    "你是「晓军的 AI 助手」，一个搭载智能工具调用能力的 Agent。",
    "你的用户是技术型用户（开发者、工程师），希望你高效、专业、简洁地帮助他解决问题。",
    "",
    "你的知识截止 2025 年 8 月。对于之后发生的事情或需要实时数据的请求，请使用联网搜索工具。",
    
    // ... 省略中间内容 ...
    
    "# 第 4 幕：工具调用规则",
    "",
    "你拥有以下工具：getCurrentTime、generatePassword、calculate、webSearch。",
    "",
    "## 核心原则",
    "- 你是大模型，你有海量知识。知识能答的不要调工具",
    "- 只有需要【实时数据】或【确定性计算】时才调工具",
    "- 一次最多使用必要的最小工具集，避免冗余",
    "- 工具执行出错时如实告知，不要隐瞒",
    
    // ... 省略工具触发条件 ...
  ].join("\n");
```

**什么是系统提示词？**

系统提示词是发送给 AI 的"剧本"，告诉 AI：
- 你是谁（角色设定）
- 你有哪些能力（工具列表）
- 什么时候使用工具（触发条件）
- 如何回应用户（行为准则）

**为什么用数组 `.join("\n")`？**

用数组存储每一行，方便维护和注释，最后拼接成一个完整的字符串。

### 4.10 工具定义

```javascript
  const tools = {
    getCurrentTime: {
      description: "获取当前的日期和时间",
      inputSchema: z.object({
        timezone: z
          .string()
          .optional()
          .describe("时区，例如 Asia/Shanghai、America/New_York"),
      }),
      execute: async ({ timezone }) => {
        const tz = timezone || "Asia/Shanghai";
        const now = new Date();
        return {
          time: now.toLocaleString("zh-CN", { timeZone: tz }),
          timezone: tz,
          timestamp: now.getTime(),
        };
      },
    },
    generatePassword: {
      description: "生成一个安全的随机密码",
      inputSchema: z.object({
        length: z
          .number()
          .min(4)
          .max(32)
          .optional()
          .describe("密码长度，默认 12 位"),
        includeSymbols: z
          .boolean()
          .optional()
          .describe("是否包含特殊字符（!@#$等），默认包含"),
      }),
      execute: async ({ length, includeSymbols }) => {
        const len = length ?? 12;
        const includeSym = includeSymbols ?? true;
        const chars =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
        const pool = includeSym ? chars + symbols : chars;
        let password = "";
        for (let i = 0; i < len; i++) {
          password += pool[Math.floor(Math.random() * pool.length)];
        }
        return { password, length: len, includeSymbols: includeSym };
      },
    },
    calculate: {
      description: "执行数学计算，支持加减乘除和括号",
      inputSchema: z.object({
        expression: z
          .string()
          .describe('数学表达式，例如 "2 + 3 * 4" 或 "(10 + 5) / 3"'),
      }),
      execute: async ({ expression }) => {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
        if (sanitized !== expression.trim()) {
          return { error: "表达式包含非法字符", expression };
        }
        try {
          const result = Function(`"use strict"; return (${sanitized})`)();
          return { expression, result: String(result) };
        } catch {
          return { error: "计算失败，请检查表达式格式", expression };
        }
      },
    },
    webSearch: {
      description:
        "联网搜索，获取最新信息。用于查询实时新闻、天气、股票、价格等超出模型知识范围的问题",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词，用中文或英文"),
        maxResults: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe("返回结果数量，默认 5 条"),
      }),
      execute: async ({ query, maxResults }) => {
        const limit = maxResults ?? 5;
        try {
          const data = await webSearch(query, limit);
          return {
            query,
            answer: data.answer || null,
            results: data.results.slice(0, limit),
            source: process.env.TAVILY_API_KEY ? "Tavily" : "DuckDuckGo",
          };
        } catch (err) {
          return {
            query,
            error: `搜索失败: ${err.message}`,
            results: [],
          };
        }
      },
    },
    generateImage: {
      description: "根据描述生成图片。用于创建插图、概念图、示意图等视觉内容",
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            "图片描述，用英文效果更佳。例如：a cute cat playing with a ball",
          ),
        size: z
          .enum(["1024x1024", "1024x1792", "1792x1024"])
          .optional()
          .describe("图片尺寸，默认 1024x1024"),
        quality: z
          .enum(["standard", "hd"])
          .optional()
          .describe("图片质量，默认 standard"),
      }),
      execute: async ({ prompt, size, quality }) => {
        try {
          const response = await fetch(
            "https://api.openai.com/v1/images/generations",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "dall-e-3",
                prompt,
                n: 1,
                size: size || "1024x1024",
                quality: quality || "standard",
              }),
            },
          );

          if (!response.ok) {
            const error = await response.json();
            return {
              error: `图片生成失败: ${error.error?.message || response.statusText}`,
              prompt,
            };
          }

          const data = await response.json();
          const imageUrl = data.data[0].url;
          const revisedPrompt = data.data[0].revised_prompt;

          return {
            imageUrl,
            prompt,
            revisedPrompt,
            size: size || "1024x1024",
            quality: quality || "standard",
          };
        } catch (err) {
          return {
            error: `图片生成失败: ${err.message}`,
            prompt,
          };
        }
      },
    },
  };
```

**工具定义的结构**：

每个工具包含 3 个部分：

| 字段 | 作用 | 示例 |
|------|------|------|
| `description` | 告诉 AI 这个工具是干什么的 | "获取当前的日期和时间" |
| `inputSchema` | 用 zod 定义参数 schema，AI 必须按这个格式传参 | `z.object({ timezone: z.string().optional() })` |
| `execute` | 工具的实际执行逻辑 | `async ({ timezone }) => { ... }` |

**工具调用流程**：

1. AI 判断需要调用工具
2. AI 生成工具调用参数（必须符合 `inputSchema`）
3. 后端执行 `execute` 函数
4. 把执行结果返回给 AI
5. AI 根据结果生成最终回复

### 4.11 Agent Loop（核心逻辑）

```javascript
  // ===== 手动 Agent Loop：最多 5 轮工具调用 =====
  let loopMessages = await convertToModelMessages(messages);
  let stepCount = 0;
  const MAX_STEPS = 5;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    console.log(`[Agent Loop] 步骤 ${stepCount}`);

    const stepResult = await generateText({
      model,
      system: finalSystemPrompt,
      messages: loopMessages,
      tools,
    });

    const toolCalls = stepResult.toolCalls;

    // 没有工具调用 → 最终回答，跳出循环
    if (!toolCalls || toolCalls.length === 0) {
      loopMessages = stepResult.response.messages;
      console.log(`[Agent Loop] 完成，共 ${stepCount} 步`);
      break;
    }

    console.log(
      `[Agent Loop] 调用了 ${toolCalls.length} 个工具: ${toolCalls.map((t) => t.toolName).join(", ")}`,
    );

    // 追加助手消息（含工具调用）到消息列表
    loopMessages = [...stepResult.response.messages];
  }
```

**什么是 Agent Loop？**

Agent Loop 是 AI Agent 的核心机制，让 AI 可以多次调用工具，直到完成任务。

**流程图**：

```
用户提问 → AI 思考 → 需要工具？
                    ↓
                   是 → 调用工具 → 获取结果 → AI 再次思考 → 还需要工具？
                                                              ↓
                                                             是 → 循环...
                                                             ↓
                                                            否 → 生成最终回复
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `let loopMessages = await convertToModelMessages(messages)` | 把前端消息转换成模型格式 |
| `let stepCount = 0` | 记录循环次数 |
| `const MAX_STEPS = 5` | 最多循环 5 次（防止死循环） |
| `while (stepCount < MAX_STEPS)` | 开始循环 |
| `const stepResult = await generateText({ ... })` | 调用 AI 模型，传入消息和工具定义 |
| `const toolCalls = stepResult.toolCalls` | 获取 AI 的工具调用请求 |
| `if (!toolCalls \|\| toolCalls.length === 0)` | 如果没有工具调用，说明 AI 已经准备好最终回复 |
| `loopMessages = [...stepResult.response.messages]` | 把工具调用结果追加到消息列表，进入下一轮 |

**示例场景**：

用户问："搜索 React 最新特性，算一下性能提升百分比"

1. **第 1 轮**：AI 调用 `webSearch("React 最新特性")`
2. **第 2 轮**：AI 根据搜索结果，调用 `calculate("(150 - 100) / 100 * 100")`
3. **第 3 轮**：AI 生成最终回复："React 最新特性提升了 50% 的性能..."

### 4.12 流式响应

```javascript
  // 用 loopMessages 做最终流式输出（不再调用工具）
  const result = streamText({
    model,
    system: finalSystemPrompt,
    messages: loopMessages,
  });

  // 将 AI SDK 的响应转换成 Express 流式响应
  const webResponse = result.toUIMessageStreamResponse();
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const reader = webResponse.body.getReader();
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(value);
    }
  };
  pump().catch((err) => {
    console.error("Stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stream error" });
    }
    res.end();
  });
});
```

**什么是流式响应？**

普通 HTTP 响应：等 AI 生成完所有内容，一次性返回（用户需要等待）

流式响应（SSE）：AI 每生成一部分内容，立即发送给前端（用户看到文字逐字出现）

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const result = streamText({ ... })` | 调用 AI 模型，返回流式结果 |
| `const webResponse = result.toUIMessageStreamResponse()` | 把 AI SDK 的流转换成 Web Response 格式 |
| `res.status(webResponse.status)` | 设置 HTTP 状态码 |
| `webResponse.headers.forEach(...)` | 复制响应头（如 `Content-Type: text/event-stream`） |
| `const reader = webResponse.body.getReader()` | 获取流的读取器 |
| `while (true) { ... }` | 循环读取流数据，直到结束 |
| `res.write(value)` | 把数据写入 HTTP 响应（发送给前端） |

### 4.13 启动服务器

```javascript
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
```

**解释**：启动 Express 服务器，监听 3001 端口。

---

## 5. 前端详解：App.vue 逐行解析

### 5.1 导入依赖

```vue
<script setup>
import { Chat } from "@ai-sdk/vue";
import { DefaultChatTransport } from "ai";
import { computed, ref, watch, onMounted } from "vue";
import {
  Bot,
  Calculator,
  Clock,
  Globe,
  Key,
  Wrench,
  Sparkles,
  SendHorizonal,
  Square,
  RefreshCw,
  PanelLeft,
  Settings,
  Copy,
  Edit,
  Check,
  FileText,
  X,
} from "lucide-vue-next";
import MarkdownRenderer from "./components/MarkdownRenderer.vue";
import ChatSidebar from "./components/ChatSidebar.vue";
import SettingsModal from "./components/SettingsModal.vue";
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `import { Chat } from "@ai-sdk/vue"` | 导入 AI SDK 的 Chat 类，管理对话状态 |
| `import { DefaultChatTransport } from "ai"` | 导入默认的消息传输器，负责与后端通信 |
| `import { computed, ref, watch, onMounted } from "vue"` | 导入 Vue 3 的响应式 API |
| `import { Bot, Calculator, ... } from "lucide-vue-next"` | 导入图标组件 |
| `import MarkdownRenderer from ...` | 导入 Markdown 渲染组件 |
| `import ChatSidebar from ...` | 导入侧边栏组件 |
| `import SettingsModal from ...` | 导入设置面板组件 |

### 5.2 自定义 useChat Hook

```javascript
// ===== 自定义 useChat =====
function useChat({ initialMessages = [] }) {
  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ body, headers, messages }) {
        const settings = JSON.parse(
          localStorage.getItem("agent-settings") ||
            '{"model":"deepseek-chat","temperature":0.7}'
        );
        const fileContext = window.__fileContext || null;
        console.log(
          "[prepareSendMessagesRequest] window.__fileContext:",
          window.__fileContext
        );
        console.log(
          "[prepareSendMessagesRequest] fileContext:",
          fileContext
            ? {
                fileName: fileContext.fileName,
                type: fileContext.type,
                textLength: fileContext.text?.length,
              }
            : null
        );
        const requestBody = {
          ...body,
          messages,
          model: settings.model,
          temperature: settings.temperature,
          fileContext,
        };
        console.log("[prepareSendMessagesRequest] requestBody:", {
          messages: requestBody.messages?.length,
          model: requestBody.model,
          fileContext: requestBody.fileContext
            ? { fileName: requestBody.fileContext.fileName }
            : null,
        });
        return {
          body: requestBody,
          headers,
        };
      },
    }),
    messages: initialMessages,
  });
  const messages = computed(() => chat.messages);
  const status = computed(() => chat.status);

  // 使用 ref 包装 error，手动控制
  const errorRef = ref(null);

  // 发送新消息时清除旧错误
  const origSendMessage = chat.sendMessage.bind(chat);
  const sendMessage = async (...args) => {
    errorRef.value = null;
    try {
      const result = await origSendMessage(...args);
      if (chat.error) {
        errorRef.value = chat.error;
      }
      return result;
    } catch (err) {
      errorRef.value = err;
      throw err;
    }
  };

  return {
    messages,
    status,
    error: computed(() => errorRef.value),
    sendMessage,
    stop: chat.stop.bind(chat),
    regenerate: chat.regenerate.bind(chat),
  };
}
```

**为什么要自定义 useChat？**

AI SDK 提供的 `useChat` Hook 功能有限，我们需要：
1. 自定义请求体（添加 `model`、`temperature`、`fileContext`）
2. 手动控制错误状态
3. 集成 localStorage 持久化

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const chat = new Chat({ ... })` | 创建 Chat 实例，管理对话状态 |
| `transport: new DefaultChatTransport({ ... })` | 配置消息传输器 |
| `api: "/api/chat"` | 后端 API 地址 |
| `prepareSendMessagesRequest({ ... })` | 在发送请求前，自定义请求体 |
| `const settings = JSON.parse(...)` | 从 localStorage 读取用户设置（模型、温度） |
| `const fileContext = window.__fileContext \|\| null` | 从全局变量读取文件上下文 |
| `const requestBody = { ... }` | 组装请求体，包含消息、模型、温度、文件上下文 |
| `const messages = computed(() => chat.messages)` | 把 chat.messages 转换成响应式 |
| `const status = computed(() => chat.status)` | 把 chat.status 转换成响应式（ready/submitted/streaming） |
| `const errorRef = ref(null)` | 手动管理错误状态 |
| `const sendMessage = async (...args) => { ... }` | 包装 sendMessage，清除旧错误 |

### 5.3 对话列表管理

```javascript
// ===== 对话列表管理 =====
function loadChatList() {
  try {
    const raw = localStorage.getItem("chat-list");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveChatList(list) {
  localStorage.setItem("chat-list", JSON.stringify(list));
}

const chatList = ref(loadChatList());
const chatId = ref(localStorage.getItem("current-chat-id") || "");

// 如果是首次使用，自动创建新对话
if (!chatId.value || chatList.value.length === 0) {
  createNewChat();
} else {
  // 确保当前 chatId 在列表中
  if (!chatList.value.find((c) => c.id === chatId.value)) {
    createNewChat();
  }
}

function createNewChat() {
  const id = crypto.randomUUID();
  chatId.value = id;
  localStorage.setItem("current-chat-id", id);
  chatList.value.unshift({
    id,
    title: "新对话",
    lastMessage: "开始新的对话吧",
    updatedAt: Date.now(),
  });
  saveChatList(chatList.value);
}

function selectChat(id) {
  chatId.value = id;
  localStorage.setItem("current-chat-id", id);
}

function deleteChat(id) {
  // 从列表移除
  chatList.value = chatList.value.filter((c) => c.id !== id);
  saveChatList(chatList.value);
  // 清除消息
  localStorage.removeItem(`chat-${id}`);
  // 如果删的是当前对话，切到第一个或创建新的
  if (id === chatId.value) {
    if (chatList.value.length > 0) {
      selectChat(chatList.value[0].id);
    } else {
      createNewChat();
    }
  }
}

function updateChatMeta(messagesArr) {
  // 第一个 user 消息作为对话标题
  const firstUser = messagesArr.find((m) => m.role === "user");
  const title = firstUser
    ? (firstUser.parts?.find((p) => p.type === "text")?.text || "").slice(
        0,
        30
      ) || "新对话"
    : "新对话";
  const lastMsg = messagesArr[messagesArr.length - 1];
  const lastText = lastMsg?.parts?.find((p) => p.type === "text")?.text || "";
  const chat = chatList.value.find((c) => c.id === chatId.value);
  if (chat) {
    chat.title = title;
    chat.lastMessage = lastText.slice(0, 50);
    chat.updatedAt = Date.now();
    saveChatList(chatList.value);
  }
}
```

**解释**：

| 函数 | 作用 |
|------|------|
| `loadChatList()` | 从 localStorage 加载对话列表 |
| `saveChatList(list)` | 保存对话列表到 localStorage |
| `createNewChat()` | 创建新对话，生成唯一 ID，添加到列表 |
| `selectChat(id)` | 切换到指定对话 |
| `deleteChat(id)` | 删除对话，清除消息 |
| `updateChatMeta(messagesArr)` | 更新对话标题和最后一条消息 |

**数据结构**：

```javascript
// chat-list（对话列表）
[
  {
    id: "uuid-xxx",
    title: "北京天气",
    lastMessage: "北京今天晴，25°C...",
    updatedAt: 1234567890
  },
  ...
]

// chat-<id>（单个对话的消息）
[
  { role: "user", parts: [{ type: "text", text: "北京天气" }] },
  { role: "assistant", parts: [{ type: "text", text: "北京今天晴..." }] },
  ...
]
```

### 5.4 当前对话初始化

```javascript
// ===== 当前对话 =====
const savedMessages = (() => {
  try {
    const stored = localStorage.getItem(`chat-${chatId.value}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
})();

const { messages, sendMessage, status, stop, error, regenerate } = useChat({
  initialMessages: savedMessages,
});
```

**解释**：
- 从 localStorage 加载当前对话的消息
- 调用 `useChat` 初始化对话状态

### 5.5 响应式数据

```javascript
const input = ref("");
const messagesEndRef = ref(null);

// 持久化 + 更新元信息
watch(
  messages,
  (val) => {
    if (val.length > 0) {
      localStorage.setItem(`chat-${chatId.value}`, JSON.stringify(val));
      updateChatMeta(val);
    }
  },
  { deep: true }
);

// chatId 变化时，需要重新初始化（页面会重新挂载）
watch(chatId, () => {
  location.reload();
});

// 自动滚动
watch(
  messages,
  () => {
    setTimeout(() => {
      messagesEndRef.value?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  },
  { deep: true }
);

const isBusy = computed(
  () => status.value === "submitted" || status.value === "streaming"
);
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `const input = ref("")` | 输入框的内容 |
| `const messagesEndRef = ref(null)` | 消息列表底部的 DOM 引用（用于自动滚动） |
| `watch(messages, ...)` | 监听消息变化，自动保存到 localStorage |
| `watch(chatId, ...)` | 监听对话 ID 变化，刷新页面（切换到新对话） |
| `watch(messages, ...)` | 监听消息变化，自动滚动到底部 |
| `const isBusy = computed(...)` | 计算属性：是否正在处理请求 |

### 5.6 图片上传

```javascript
// ===== 图片上传 =====
const selectedImage = ref(null);
const imagePreview = ref(null);

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 检查文件类型
  if (!file.type.startsWith("image/")) {
    alert("请选择图片文件");
    return;
  }

  // 检查文件大小（限制 5MB）
  if (file.size > 5 * 1024 * 1024) {
    alert("图片大小不能超过 5MB");
    return;
  }

  // 读取文件为 base64
  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImage.value = {
      file,
      base64: event.target.result,
      type: file.type,
    };
    imagePreview.value = event.target.result;
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  selectedImage.value = null;
  imagePreview.value = null;
}
```

**解释**：
- 用户选择图片后，用 `FileReader` 读取为 base64
- 显示预览，等待发送
- 发送时，图片会作为多模态消息的一部分

### 5.7 文件上传

```javascript
// ===== 文件上传 =====
const selectedFile = ref(null);
const fileParseError = ref(null);
const isFileParsing = ref(false);

const ALLOWED_EXTENSIONS = ["txt", "csv", "pdf"];

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    alert(`仅支持 .txt / .csv / .pdf 文件`);
    e.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("文件大小不能超过 5MB");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async (event) => {
    const base64 = event.target.result.split(",")[1];

    // 调用后端解析
    try {
      fileParseError.value = null;
      isFileParsing.value = true;
      const resp = await fetch("/api/parse-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, base64 }),
      });
      const data = await resp.json();
      isFileParsing.value = false;

      if (!resp.ok || data.error) {
        fileParseError.value = data.error || "文件解析失败";
        selectedFile.value = null;
        return;
      }

      selectedFile.value = {
        fileName: data.fileName,
        type: data.type,
        text: data.text,
        charCount: data.charCount,
        pageCount: data.pageCount || null,
      };
    } catch (err) {
      isFileParsing.value = false;
      fileParseError.value = "文件解析失败，请重试";
      selectedFile.value = null;
    }
  };
  reader.readAsDataURL(file);
}

function removeFile() {
  selectedFile.value = null;
  fileParseError.value = null;
}
```

**解释**：
- 用户选择文件后，读取为 base64
- 调用后端 `/api/parse-file` 接口解析文件
- 解析成功后，保存文件内容（文本）
- 发送消息时，文件内容会作为上下文传递给 AI

### 5.8 发送消息

```javascript
function handleSubmit(e) {
  e.preventDefault();

  if (status.value !== "ready") return;

  const hasText = input.value.trim();
  const hasImage = selectedImage.value;
  const hasFile = selectedFile.value;

  // 至少要有文本、图片或文件
  if (!hasText && !hasImage && !hasFile) return;

  // 设置文件上下文（供 transport body getter 读取）
  if (hasFile) {
    window.__fileContext = {
      fileName: selectedFile.value.fileName,
      type: selectedFile.value.type,
      text: selectedFile.value.text,
    };
  } else {
    window.__fileContext = null;
  }

  if (hasImage) {
    // 多模态消息：使用 files 属性传递图片
    sendMessage({
      text: hasText || "请分析这张图片",
      files: [selectedImage.value.file],
    });
  } else {
    // 纯文本消息
    sendMessage({ text: input.value });
  }

  // 清空输入
  input.value = "";
  removeImage();
  removeFile();
}
```

**解释**：
- 检查是否有文本、图片或文件
- 设置全局变量 `window.__fileContext`（供 transport 读取）
- 根据是否有图片，发送多模态或纯文本消息
- 清空输入框和文件选择

### 5.9 工具卡片元数据

```javascript
// ===== 工具卡片（不变） =====
const toolMeta = {
  "tool-getCurrentTime": { icon: Clock, name: "获取时间", color: "blue" },
  "tool-generatePassword": { icon: Key, name: "生成密码", color: "purple" },
  "tool-calculate": { icon: Calculator, name: "数学计算", color: "green" },
  "tool-webSearch": { icon: Globe, name: "联网搜索", color: "sky" },
};
function getToolMeta(type) {
  return (
    toolMeta[type] || {
      icon: Wrench,
      name: type.replace("tool-", ""),
      color: "zinc",
    }
  );
}
const isRunning = (part) =>
  part.state === "input-streaming" || part.state === "input-available";
const isError = (part) => part.state === "output-error";
```

**解释**：
- `toolMeta`：定义每个工具的图标、名称、颜色
- `getToolMeta(type)`：获取工具的元数据
- `isRunning(part)`：判断工具是否正在执行
- `isError(part)`：判断工具是否执行失败

### 5.10 消息操作

```javascript
// ===== 消息操作 =====
const copiedMessageId = ref(null);
const editingMessageId = ref(null);
const editingText = ref("");

// 复制消息
function copyMessage(message) {
  const text = message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");

  if (text) {
    navigator.clipboard.writeText(text);
    copiedMessageId.value = message.id;
    setTimeout(() => {
      copiedMessageId.value = null;
    }, 2000);
  }
}

// 开始编辑消息
function startEdit(message) {
  editingMessageId.value = message.id;
  editingText.value =
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n\n") || "";
}

// 保存编辑
function saveEdit(messageIndex) {
  if (!editingText.value.trim()) return;

  // 删除该消息之后的所有消息
  const newMessages = messages.value.slice(0, messageIndex + 1);
  newMessages[messageIndex] = {
    ...newMessages[messageIndex],
    parts: [{ type: "text", text: editingText.value }],
  };

  // 清空编辑状态
  editingMessageId.value = null;
  editingText.value = "";

  // 重新发送请求
  sendMessage({ text: editingText.value });
}

// 取消编辑
function cancelEdit() {
  editingMessageId.value = null;
  editingText.value = "";
}

// 重新生成
function regenerateMessage(messageIndex) {
  // 删除该消息之后的所有消息
  const newMessages = messages.value.slice(0, messageIndex);

  // 重新发送最后一条用户消息
  const lastUserMessage = newMessages.filter((m) => m.role === "user").pop();
  if (lastUserMessage) {
    const text = lastUserMessage.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n\n");
    if (text) {
      sendMessage({ text });
    }
  }
}
```

**解释**：

| 函数 | 作用 |
|------|------|
| `copyMessage(message)` | 复制消息文本到剪贴板 |
| `startEdit(message)` | 开始编辑用户消息 |
| `saveEdit(messageIndex)` | 保存编辑，删除后续消息，重新发送 |
| `cancelEdit()` | 取消编辑 |
| `regenerateMessage(messageIndex)` | 重新生成 AI 回复 |

---

## 6. 组件详解：子组件都在干什么？

### 6.1 ChatSidebar.vue（侧边栏）

**功能**：
- 显示对话列表
- 支持新建、切换、删除对话
- 显示对话标题、最后一条消息、时间

**核心代码**：

```vue
<script setup>
import { computed } from 'vue'
import { MessageSquarePlus, Trash2, MessageSquare, PanelLeftClose } from 'lucide-vue-next'

const props = defineProps({
  chats: { type: Array, required: true },
  currentChatId: { type: String, required: true },
})

const emit = defineEmits(['select-chat', 'new-chat', 'delete-chat', 'close'])

function getTitle(chat) {
  return chat.title || '新对话'
}

function getPreview(chat) {
  return chat.lastMessage || '暂无消息'
}

function getTime(chat) {
  if (!chat.updatedAt) return ''
  const d = new Date(chat.updatedAt)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>
```

**解释**：

| 代码 | 作用 |
|------|------|
| `defineProps({ ... })` | 定义组件接收的 props |
| `defineEmits([...])` | 定义组件触发的事件 |
| `getTitle(chat)` | 获取对话标题 |
| `getPreview(chat)` | 获取对话预览（最后一条消息） |
| `getTime(chat)` | 获取对话时间（相对时间，如"5 分钟前"） |

### 6.2 MarkdownRenderer.vue（Markdown 渲染器）

**功能**：
- 把 AI 回复的 Markdown 转换成 HTML
- 给代码块添加复制按钮
- 美化引用链接

**核心代码**：

```vue
<script setup>
import { computed, nextTick, watch, onMounted } from "vue";
import { marked } from "marked";

const props = defineProps({
  text: { type: String, required: true },
});

marked.setOptions({
  breaks: true,
  gfm: true,
});

// 生成 HTML
const html = computed(() => {
  const result = marked.parse(props.text);
  return styleCitations(injectCopyButtons(result));
});

// 识别并美化来源引用链接
function styleCitations(htmlStr) {
  return htmlStr.replace(
    /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    (match, href, text) => {
      const isCitation = /来源|引用|参考|ref/i.test(text.strip?.() ?? text);
      if (!isCitation) return match;
      return `<a href="${href}" class="citation-link" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  );
}

// 给代码块注入 header 和 copy 按钮
function injectCopyButtons(htmlStr) {
  return htmlStr.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (match, lang, code) => {
      const codeId = `code-${Math.random().toString(36).slice(2, 9)}`;
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `
<div class="code-block-wrapper mb-code" data-code-id="${codeId}">
  <div class="code-block-header">
    <span class="code-block-lang">${lang || "text"}</span>
    <button class="code-block-copy" data-copy="${codeId}" title="复制代码">
      <svg class="code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg>
    </button>
  </div>
  <pre><code class="language-${lang}">${code}</code></pre>
</div>`;
    }
  );
}

// 复制按钮事件绑定
function bindCopyEvents() {
  nextTick(() => {
    document.querySelectorAll(".code-block-copy[data-copy]").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const wrapper = document.querySelector(
          `[data-code-id="${btn.dataset.copy}"]`
        );
        const codeEl = wrapper?.querySelector("code");
        const text = codeEl?.textContent || "";
        navigator.clipboard
          .writeText(text)
          .then(() => {
            const icon = btn.querySelector(".code-copy-icon");
            if (icon) {
              icon.outerHTML = `<svg class="code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
            }
            btn.classList.add("copied");
            setTimeout(() => {
              btn.classList.remove("copied");
              const icon2 = btn.querySelector(".code-copy-icon");
              if (icon2) {
                icon2.outerHTML = `<svg class="code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
              }
            }, 2000);
          })
          .catch(() => {});
      });
    });
  });
}

watch(html, bindCopyEvents);
onMounted(bindCopyEvents);
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>
```

**解释**：

| 代码 | 作用 |
|------|------|
| `marked.parse(props.text)` | 把 Markdown 转换成 HTML |
| `styleCitations(htmlStr)` | 识别引用链接，添加特殊样式 |
| `injectCopyButtons(htmlStr)` | 给代码块添加复制按钮 |
| `bindCopyEvents()` | 绑定复制按钮的点击事件 |
| `v-html="html"` | 把 HTML 渲染到页面 |

### 6.3 SettingsModal.vue（设置面板）

**功能**：
- 切换模型（DeepSeek / GPT-4o / Claude）
- 调节温度（0-1）
- 导出/导入对话
- 清除所有历史

**核心代码**：

```vue
<script setup>
import { ref, onMounted } from "vue";
import { X, Trash2, Cpu, Thermometer, Download, Upload } from "lucide-vue-next";

const props = defineProps({
  visible: Boolean,
});

const emit = defineEmits(["close", "settings-changed"]);

// 设置项
const settings = ref({
  model: "deepseek-chat",
  temperature: 0.7,
});

// 模型选项
const modelOptions = [
  { value: "deepseek-chat", label: "DeepSeek-V4-Pro" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
];

// 保存设置
function saveSettings() {
  localStorage.setItem("agent-settings", JSON.stringify(settings.value));
  emit("settings-changed", settings.value);
}

// 清除历史
function clearHistory() {
  if (confirm("确定要清除所有对话历史吗？此操作不可恢复。")) {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (
        key.startsWith("chat-") ||
        key === "chat-list" ||
        key === "current-chat-id"
      ) {
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  }
}

// 导出对话
function exportChats() {
  const chatList = JSON.parse(localStorage.getItem("chat-list") || "[]");
  const chats = chatList.map((chat) => ({
    ...chat,
    messages: JSON.parse(localStorage.getItem(`chat-${chat.id}`) || "[]"),
  }));

  const data = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    chats,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chats-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入对话
function importChats(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.chats || !Array.isArray(data.chats)) {
        alert("无效的导入文件格式");
        return;
      }

      data.chats.forEach((chat) => {
        const { messages, ...chatMeta } = chat;
        const existingList = JSON.parse(
          localStorage.getItem("chat-list") || "[]"
        );
        const exists = existingList.find((c) => c.id === chatMeta.id);

        if (!exists) {
          existingList.push(chatMeta);
          localStorage.setItem("chat-list", JSON.stringify(existingList));
          localStorage.setItem(
            `chat-${chatMeta.id}`,
            JSON.stringify(messages || [])
          );
        }
      });

      alert(`成功导入 ${data.chats.length} 个对话`);
      window.location.reload();
    } catch (err) {
      alert("导入失败：文件格式错误");
    }
  };
  reader.readAsText(file);
}
</script>
```

**解释**：

| 函数 | 作用 |
|------|------|
| `saveSettings()` | 保存设置到 localStorage |
| `clearHistory()` | 清除所有对话历史 |
| `exportChats()` | 导出所有对话为 JSON 文件 |
| `importChats(event)` | 从 JSON 文件导入对话 |

---

## 7. 配置文件：package.json 和 vite.config

### 7.1 package.json

```json
{
  "name": "ai-chat-agent-vue",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "server": "node --env-file .env server/index.mjs"
  },
  "dependencies": {
    "@ai-sdk/openai": "^3.0.74",
    "@ai-sdk/vue": "^3.0.0",
    "@napi-rs/canvas": "^1.0.2",
    "ai": "^6.0.209",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "iconv-lite": "^0.4.24",
    "lucide-vue-next": "^0.400.0",
    "marked": "^18.0.5",
    "pdf-parse": "^2.4.5",
    "tesseract.js": "^7.0.0",
    "vue": "^3.5.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

**逐字段解释**：

| 字段 | 作用 |
|------|------|
| `"name"` | 项目名称 |
| `"version"` | 版本号 |
| `"private": true` | 不发布到 npm |
| `"type": "module"` | 启用 ES 模块（可以使用 `import`） |
| `"scripts"` | npm 命令脚本 |
| `"dev"` | 启动前端开发服务器 |
| `"build"` | 构建生产版本 |
| `"preview"` | 预览构建结果 |
| `"server"` | 启动后端服务器（自动加载 .env） |
| `"dependencies"` | 生产依赖 |
| `"devDependencies"` | 开发依赖 |

**依赖说明**：

| 依赖 | 作用 |
|------|------|
| `@ai-sdk/openai` | OpenAI 兼容的 AI SDK |
| `@ai-sdk/vue` | Vue 集成的 AI SDK |
| `ai` | Vercel AI SDK 核心 |
| `vue` | Vue 3 框架 |
| `express` | Web 框架 |
| `cors` | CORS 中间件 |
| `marked` | Markdown 解析器 |
| `zod` | Schema 验证 |
| `pdf-parse` | PDF 解析 |
| `tesseract.js` | OCR 识别 |
| `lucide-vue-next` | 图标库 |
| `tailwindcss` | CSS 框架 |
| `vite` | 构建工具 |

### 7.2 vite.config.mjs

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

**逐行解释**：

| 代码 | 作用 |
|------|------|
| `import { defineConfig } from 'vite'` | 导入 Vite 配置函数 |
| `import vue from '@vitejs/plugin-vue'` | 导入 Vue 插件 |
| `import tailwindcss from '@tailwindcss/vite'` | 导入 Tailwind CSS 插件 |
| `plugins: [tailwindcss(), vue()]` | 启用插件 |
| `server.port: 5173` | 前端开发服务器端口 |
| `server.proxy` | 代理配置 |
| `'/api': { target: 'http://localhost:3001' }` | 把 `/api` 开头的请求代理到后端 3001 端口 |
| `changeOrigin: true` | 修改请求头中的 `Origin` 字段 |

**为什么需要代理？**

前端运行在 `http://localhost:5173`，后端运行在 `http://localhost:3001`，直接访问会有跨域问题。通过 Vite 代理，前端访问 `/api/chat` 时，Vite 会自动转发到 `http://localhost:3001/api/chat`，解决跨域。

---

## 8. 核心概念：Agent Loop、SSE 流、工具调用

### 8.1 什么是 Agent Loop？

**Agent Loop（智能体循环）** 是 AI Agent 的核心机制，让 AI 可以多次调用工具，直到完成任务。

**流程图**：

```
┌─────────────┐
│  用户提问    │
└──────┬──────┘
       ↓
┌─────────────┐
│  AI 思考     │ ←─── 系统提示词 + 消息历史 + 工具定义
└──────┬──────┘
       ↓
   ┌───┴───┐
   │需要工具？│
   └───┬───┘
       ↓
      是
       ↓
┌─────────────┐
│  调用工具    │ ←─── AI 生成工具参数
└──────┬──────┘
       ↓
┌─────────────┐
│  获取结果    │ ←─── 执行工具的 execute 函数
└──────┬──────┘
       ↓
┌─────────────┐
│  AI 再次思考 │ ←─── 把工具结果加入消息历史
└──────┬──────┘
       ↓
   ┌───┴───┐
   │还需要？ │
   └───┬───┘
       ↓
      否
       ↓
┌─────────────┐
│  生成回复    │ ←─── 流式输出
└─────────────┘
```

**示例场景**：

用户问："搜索 React 最新特性，算一下性能提升百分比"

1. **第 1 轮**：AI 判断需要搜索，调用 `webSearch("React 最新特性")`
2. **第 2 轮**：AI 根据搜索结果，提取性能数据，调用 `calculate("(150 - 100) / 100 * 100")`
3. **第 3 轮**：AI 判断不需要工具，生成最终回复："React 最新特性提升了 50% 的性能..."

**代码实现**：

```javascript
let loopMessages = await convertToModelMessages(messages);
let stepCount = 0;
const MAX_STEPS = 5;

while (stepCount < MAX_STEPS) {
  stepCount++;
  
  const stepResult = await generateText({
    model,
    system: finalSystemPrompt,
    messages: loopMessages,
    tools,
  });

  const toolCalls = stepResult.toolCalls;

  if (!toolCalls || toolCalls.length === 0) {
    // 没有工具调用，跳出循环
    break;
  }

  // 把工具调用结果加入消息历史
  loopMessages = [...stepResult.response.messages];
}
```

### 8.2 什么是 SSE 流？

**SSE（Server-Sent Events）** 是一种单向的服务器推送技术，用于实现流式响应。

**普通 HTTP 响应 vs SSE 流**：

| 类型 | 特点 | 用户体验 |
|------|------|----------|
| 普通 HTTP | 等 AI 生成完所有内容，一次性返回 | 用户需要等待，体验差 |
| SSE 流 | AI 每生成一部分，立即发送给前端 | 文字逐字出现，体验好 |

**SSE 数据格式**：

```
data: {"type":"text","value":"你"}

data: {"type":"text","value":"好"}

data: {"type":"text","value":"，"}

data: {"type":"text","value":"我是"}

data: {"type":"text","value":"AI"}

data: {"type":"text","value":"助手"}

data: [DONE]
```

**前端处理**：

```javascript
const chat = new Chat({
  transport: new DefaultChatTransport({
    api: "/api/chat",
    // ...
  }),
});
```

AI SDK 的 `Chat` 类会自动处理 SSE 流，逐字更新 `chat.messages`。

### 8.3 什么是工具调用？

**工具调用（Tool Calling）** 是 AI 模型的一种能力，让 AI 可以调用外部工具来完成任务。

**工具定义的结构**：

```javascript
{
  description: "工具的描述，告诉 AI 这个工具是干什么的",
  inputSchema: z.object({
    // 用 zod 定义参数 schema
    param1: z.string().describe("参数1的说明"),
    param2: z.number().optional().describe("参数2的说明"),
  }),
  execute: async ({ param1, param2 }) => {
    // 工具的实际执行逻辑
    return { result: "..." };
  }
}
```

**工具调用的流程**：

1. AI 判断需要调用工具
2. AI 生成工具调用参数（必须符合 `inputSchema`）
3. 后端执行 `execute` 函数
4. 把执行结果返回给 AI
5. AI 根据结果生成最终回复

**示例**：

用户问："北京现在天气怎么样？"

1. AI 判断：这是实时信息，需要调用 `webSearch`
2. AI 生成参数：`{ query: "北京现在天气", maxResults: 5 }`
3. 后端执行 `webSearch` 函数，返回搜索结果
4. AI 根据搜索结果生成回复："北京今天晴，25°C..."

---

## 9. 数据流：从用户输入到 AI 回复

### 9.1 完整流程图

```
┌─────────────────────────────────────────────────────────────────┐
│  前端 (Vue)                                                      │
├─────────────────────────────────────────────────────────────────┤
│  1. 用户输入 "北京天气" + 点击发送                                │
│  2. handleSubmit() 被调用                                        │
│  3. 设置 window.__fileContext（如果有文件）                       │
│  4. 调用 sendMessage({ text: "北京天气" })                       │
│  5. Chat 类调用 transport.prepareSendMessagesRequest()           │
│  6. 组装请求体：{ messages, model, temperature, fileContext }     │
│  7. 发送 POST 请求到 /api/chat                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Vite 代理                                                       │
├─────────────────────────────────────────────────────────────────┤
│  8. 接收到 /api/chat 请求                                        │
│  9. 转发到 http://localhost:3001/api/chat                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  后端 (Express)                                                  │
├─────────────────────────────────────────────────────────────────┤
│  10. /api/chat 路由接收请求                                      │
│  11. normalizeMessages() 转换消息格式                            │
│  12. 检查是否需要长对话压缩                                      │
│  13. 组装系统提示词 + 文件上下文                                 │
│  14. 进入 Agent Loop                                             │
│      - 调用 AI 模型                                              │
│      - 如果有工具调用，执行工具                                  │
│      - 把工具结果加入消息历史                                    │
│      - 循环直到 AI 不再调用工具                                  │
│  15. 调用 streamText() 生成流式响应                              │
│  16. 把流转换成 SSE 格式                                         │
│  17. 逐字发送回前端                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  前端 (Vue)                                                      │
├─────────────────────────────────────────────────────────────────┤
│  18. Chat 类接收 SSE 流                                          │
│  19. 逐字更新 chat.messages                                      │
│  20. Vue 响应式系统触发页面更新                                  │
│  21. 用户看到文字逐字出现                                        │
│  22. 流结束，保存到 localStorage                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 关键数据结构

#### 消息结构

```javascript
// 用户消息
{
  role: "user",
  parts: [
    { type: "text", text: "北京天气" }
  ]
}

// AI 消息（纯文本）
{
  role: "assistant",
  parts: [
    { type: "text", text: "北京今天晴，25°C..." }
  ]
}

// AI 消息（包含工具调用）
{
  role: "assistant",
  parts: [
    { type: "text", text: "让我搜索一下..." },
    { 
      type: "tool-webSearch",
      state: "output-available",
      input: { query: "北京天气", maxResults: 5 },
      output: { 
        query: "北京天气",
        results: [...]
      }
    },
    { type: "text", text: "北京今天晴，25°C..." }
  ]
}

// 多模态消息（图片+文本）
{
  role: "user",
  parts: [
    { type: "text", text: "这张图片是什么？" },
    { type: "image", image: Uint8Array[...] }
  ]
}
```

#### 工具调用结构

```javascript
// AI 生成的工具调用请求
{
  toolCallId: "call_xxx",
  toolName: "webSearch",
  args: { query: "北京天气", maxResults: 5 }
}

// 工具执行结果
{
  toolCallId: "call_xxx",
  toolName: "webSearch",
  result: {
    query: "北京天气",
    results: [
      { title: "北京天气", url: "...", snippet: "..." },
      ...
    ]
  }
}
```

---

## 10. 常见问题与调试技巧

### 10.1 常见问题

#### Q1: 前端访问 `/api/chat` 报 404 错误

**原因**：Vite 代理配置错误

**解决**：
1. 检查 `vite.config.mjs` 中的 `proxy` 配置
2. 确保后端服务器已启动（`npm run server`）
3. 检查后端端口是否为 3001

#### Q2: AI 回复 "API Key 无效"

**原因**：`.env` 文件中的 `OPENAI_API_KEY` 错误

**解决**：
1. 检查 `.env` 文件是否存在
2. 检查 `OPENAI_API_KEY` 是否正确
3. 重启后端服务器（`npm run server`）

#### Q3: 上传 PDF 后，AI 说 "看不到文件"

**原因**：PDF 是扫描件（图片型），无法提取文本

**解决**：
1. 使用带文字层的 PDF（可以用 Word 导出）
2. 或者先用 OCR 工具把扫描件转换成可搜索的 PDF

#### Q4: 工具调用没有触发

**原因**：系统提示词中的工具触发条件不够明确

**解决**：
1. 检查 `server/index.mjs` 中的 `SYSTEM_PROMPT`
2. 添加工具触发条件的具体示例

#### Q5: 长对话后，AI 忘记前面的内容

**原因**：触发了长对话压缩，只保留了摘要

**解决**：
1. 调整 `COMPRESS_THRESHOLD`（压缩阈值）
2. 调整 `KEEP_RECENT`（保留最近消息数）

### 10.2 调试技巧

#### 查看网络请求

1. 打开浏览器开发者工具（F12）
2. 切换到 "Network" 标签
3. 发送消息，查看 `/api/chat` 请求
4. 检查请求体（Payload）和响应（Response）

#### 查看后端日志

后端会打印详细的日志：

```
[/api/chat] rawMessages count: 2
[/api/chat] normalized messages count: 2
[/api/chat] fileContext received: { fileName: 'test.pdf', type: 'pdf', textLength: 1234 }
[Agent Loop] 步骤 1
[Agent Loop] 调用了 1 个工具: webSearch
[Agent Loop] 步骤 2
[Agent Loop] 完成，共 2 步
```

#### 查看 AI 的工具调用

在浏览器控制台查看：

```javascript
// 查看消息结构
console.log(chat.messages);

// 查看工具调用
chat.messages.forEach(msg => {
  msg.parts?.forEach(part => {
    if (part.type?.startsWith('tool-')) {
      console.log('工具调用:', part);
    }
  });
});
```

---

## 总结

恭喜你完成了这份详细的教学文档！现在你应该了解了：

1. **什么是 AI Agent**：能够自主使用工具的 AI 系统
2. **项目架构**：前后端分离，前端 Vue 3，后端 Express
3. **核心文件**：`server/index.mjs`（后端）、`src/App.vue`（前端）
4. **关键概念**：Agent Loop、SSE 流、工具调用
5. **数据流**：从用户输入到 AI 回复的完整流程

**下一步建议**：

1. 动手运行项目，体验功能
2. 尝试修改系统提示词，观察 AI 行为变化
3. 尝试添加新的工具（如翻译、代码执行）
4. 阅读 AI SDK 官方文档，深入理解原理

**推荐资源**：

- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [Vue 3 官方文档](https://vuejs.org/)
- [Express 官方文档](https://expressjs.com/)

---

> 文档版本：v1.0  
> 最后更新：2026-07-03  
> 作者：AI Assistant
