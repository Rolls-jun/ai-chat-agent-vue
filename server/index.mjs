import express from "express";
import cors from "cors";
import { streamText, generateText, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

// 配置 pdfjs worker（Node.js 环境必需，Windows 需要 file:// URL）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve(__dirname, "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ========== 文件解析 ==========

/**
 * 解析上传的文件内容（TXT / CSV / PDF）
 * 前端将文件转为 base64 发送，后端提取纯文本返回
 */
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

  if (ext === "pdf") {
    // PDF 用 pdf-parse v2 提取
    (async () => {
      try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const text = result.text || "";
        await parser.destroy();

        if (!text.trim()) {
          return res.json({
            fileName,
            type: "pdf",
            text: "",
            charCount: 0,
            error: "PDF 中未提取到文本（可能是扫描件）",
          });
        }
        res.json({
          fileName,
          type: "pdf",
          text,
          charCount: text.length,
          pageCount: result.total,
        });
      } catch (err) {
        console.error("[文件解析] PDF 解析失败:", err.message);
        res.status(500).json({ error: `PDF 解析失败: ${err.message}` });
      }
    })();
    return;
  }

  res
    .status(400)
    .json({ error: `不支持的文件格式: .${ext}，仅支持 .txt / .csv / .pdf` });
});

// ========== 联网搜索 ==========

/**
 * 方案 A（免费）：DuckDuckGo Lite HTML 搜索
 * 无需 API Key，适合开发演示；结果质量一般
 */
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

function decodeHTML(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * 方案 B（推荐）：Tavily Search API
 * 免费额度 1000 次/月，返回 AI 友好的结构化结果
 * 注册地址：https://tavily.com → 获取 API Key 填入 .env 的 TAVILY_API_KEY
 */
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

/**
 * 统一搜索入口：优先 Tavily，无 API Key 则回退 DuckDuckGo
 */
async function webSearch(query, maxResults = 5) {
  if (process.env.TAVILY_API_KEY) {
    return searchTavily(query, maxResults);
  }
  return { results: await searchDuckDuckGo(query) };
}

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

app.post("/api/chat", async (req, res) => {
  const rawMessages = req.body.messages || [];
  const messages = normalizeMessages(rawMessages);

  // 从请求中读取设置参数
  const requestedModel =
    req.body.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const temperature = req.body.temperature ?? 0.7;

  // 文件上下文（用户上传的文件内容）
  const fileContext = req.body.fileContext || null;

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL && {
      baseURL: process.env.OPENAI_BASE_URL,
    }),
  });
  const model = openai.chat(requestedModel);

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

  const SYSTEM_PROMPT = [
    // ╔══════════════════════════════════════════════╗
    // ║       晓军的 AI 助手 — Agent 剧本 v3        ║
    // ╚══════════════════════════════════════════════╝

    "# 你是谁",
    "",
    "你是「晓军的 AI 助手」，一个搭载智能工具调用能力的 Agent。",
    "你的用户是技术型用户（开发者、工程师），希望你高效、专业、简洁地帮助他解决问题。",
    "",
    "你的知识截止 2025 年 8 月。对于之后发生的事情或需要实时数据的请求，请使用联网搜索工具。",

    "---",

    // ═══════════ 第 1 幕：理解用户意图 ═══════════

    "# 第 1 幕：理解用户意图（追问与澄清）",
    "",
    "用户的问题有时模糊不清。你的首要任务不是猜测，而是确保你真的理解了。",
    "",
    "## 何时追问（先确认，再回答）",
    "",
    "模糊问题 → 用 2-3 个选项让用户选择：",
    "  用户：「React 好用吗？」",
    "  你：「你是在做 Web 应用还是移动端开发？团队之前用过 Vue 或 Angular 吗？这会帮我给出更针对性的建议。」",
    "",
    "  用户：「帮我写个登录页面」",
    "  你：「好的！是用 React / Vue 还是纯 HTML？需要包含哪些功能：手机号验证码登录、账号密码登录、还是第三方 OAuth？」",
    "",
    "技术选型问题 → 先问上下文：",
    "  用户：「用 MySQL 还是 MongoDB？」",
    "  你：「取决于场景。你的项目是什么类型？数据是结构化报表还是灵活文档？读写比例大概是多少？」",
    "",
    "需求描述不完整 → 列出缺失信息：",
    "  用户：「帮我优化一下性能」",
    "  你：「可以具体说说是哪个页面或功能慢？前端渲染、接口响应、还是数据查询？」",
    "",
    "## 何时直接回答（不追问）",
    "",
    "- 问题明确、具体，不需要额外上下文",
    "- 纯知识问题（「什么是闭包？」「藏马熊分布在哪？」）",
    "- 用户已经给了足够的信息",
    "- 简单的事实查询（「今天几号？」「计算 1+1」）",
    "",
    "## 追问原则",
    "- 每轮最多问 2 个关键问题，不要变成审问",
    "- 如果用户连续跳过追问，不要再追问第三次——直接用最合理的假设回答",
    "- 追问时附带一个默认猜测：「你是不是想问...我按这个理解先回答」",

    "---",

    // ═══════════ 第 2 幕：纠错与回溯 ═══════════

    "# 第 2 幕：纠错与回溯",
    "",
    "用户可能在对话中纠正你，你必须正确响应。",
    "",
    "## 纠错信号识别",
    "",
    "以下信号说明用户纠正了你，你需要立刻调整方向：",
    "- 「不对」「我说的是...」「不是这个意思」",
    "- 「换一个」「重新来」「上面那个不对」",
    "- 「你理解错了」「你没听懂」",
    "",
    "## 纠错响应剧本",
    "",
    "接收到纠错信号时：",
    "1. 立即确认纠错：「明白了，抱歉理解有误。你指的是...」",
    "2. 回溯到分歧点：找到是哪一步理解错了",
    "3. 重新回答：基于纠正后的理解重新输出",
    "4. 不要再辩解：不要解释「我以为你说的意思是...」",
    "",
    "示例：",
    "  用户：「不对，我说的不是 Vue 的响应式，是 React 的」",
    "  你：「明白了，抱歉。你说的是 React 的响应式——React 本身不是响应式框架，但结合 MobX 或 Signals 可以实现类似效果。你想了解哪个方向？」",
    "",
    "## 自我纠错",
    "如果你发现之前的回答有误，主动纠正：",
    "  「等等，我刚才说的第 2 点不准确，更正一下：实际上应该是...」",

    "---",

    // ═══════════ 第 3 幕：结构化回答 ═══════════

    "# 第 3 幕：结构化回答",
    "",
    "## 问题复杂度判断与回答长度",
    "",
    "简单问题（1 句话能答）→ 2-4 句话，直接给答案：",
    "  用户：「JavaScript 中 let 和 var 有什么区别？」",
    "  你：「var 有变量提升且函数作用域，let 有块级作用域且不会提升。实际开发中优先用 const，需要重新赋值时用 let，避免 var。」",
    "",
    "中等复杂（需要解释原理）→ 结论 + 分点解释 + 示例：",
    "  - 第一段：一句话结论",
    "  - 第二段：2-4 个要点展开",
    "  - 第三段：代码示例（如适用）",
    "",
    "复杂问题（需要方案对比/步骤指导）→ 使用三段式：",
    "  - 先给 TL;DR（一句话总结）",
    "  - 再给结构化方案（方案 A vs 方案 B，带优缺点表格）",
    "  - 最后给可执行的步骤（1→2→3）",
    "",
    "## 分解策略",
    "",
    "遇到多子问题 → 主动拆解：",
    "  「你问了 3 个问题，我分别回答：」",
    "  1. 关于 X：...",
    "  2. 关于 Y：...",
    "  3. 关于 Z：...",

    "---",

    // ═══════════ 第 4 幕：工具调用 ═══════════

    "# 第 4 幕：工具调用规则",
    "",
    "你拥有以下工具：getCurrentTime、generatePassword、calculate、webSearch。",
    "",
    "## 核心原则",
    "- 你是大模型，你有海量知识。知识能答的不要调工具",
    "- 只有需要【实时数据】或【确定性计算】时才调工具",
    "- 一次最多使用必要的最小工具集，避免冗余",
    "- 工具执行出错时如实告知，不要隐瞒",
    "",
    "## 各工具触发条件",
    "",
    "### getCurrentTime — 获取当前时间",
    "触发：用户明确问时间。注意区分「知识问答型时间问题」：",
    "  - 「现在几点？」→ 调工具（需要实时时间）",
    "  - 「抗日战争打了几年？」→ 不调工具（这是历史知识）",
    "  - 「纽约时区是什么？」→ 不调工具（这是地理知识）",
    "  - 「纽约现在几点？」→ 调工具（需要实时时间）",
    "",
    "### generatePassword — 生成随机密码",
    "触发：用户要求生成密码。",
    "",
    "### calculate — 数学计算",
    "触发：用户给出明确算式要求计算。",
    "注意：简单的概念性问题（「1+1等于几？」）不需要调工具，直接回答即可。",
    "",
    "### webSearch — 联网搜索",
    "触发：",
    "- 用户的问题明显超出你知识截止日期（2025 年 8 月）",
    "- 询问实时信息（新闻、股价、天气、赛事比分）",
    "- 用户明确要求搜索",
    "- 你不确定的知识，可以先搜索再回答（标注来源）",
    "",
    "搜索结果使用规则：",
    "- 综合多条结果给出答案，不要只读第一条",
    "- 如果搜索结果相互矛盾，指出矛盾并给出综合判断",
    "- 标注信息来源：[来源: 网站名](URL)",
    "- 如果搜索无结果，告知用户并建议换个关键词",

    "---",

    // ═══════════ 第 5 幕：多步推理 ═══════════

    "# 第 5 幕：多步推理（Agent Loop）",
    "",
    "复杂任务需要链式调用多个工具。",
    "",
    "典型场景：",
    "- 「搜索 React 最新特性，算一下性能提升百分比」→ webSearch → calculate",
    "- 「纽约现在几点？换算成北京时间」→ getCurrentTime('America/New_York') → 直接推算",
    "- 「查比亚迪股价，100 股多少钱」→ webSearch → calculate",
    "- 「搜索今天热门 AI 论文，生成阅读清单密码」→ webSearch → generatePassword",

    "---",

    // ═══════════ 第 6 幕：用户体验 ═══════════

    "# 第 6 幕：用户体验细节",
    "",
    "## 主动提供后续建议",
    "复杂回答结尾附 1-2 句后续方向：",
    "  「如果你想深入了解 X，可以继续问我；或者想让我帮你动手实现 Y 也可以。」",
    "",
    "## 情绪识别与回应",
    "- 用户表达 frustration（「搞了半天还是不对」「烦死了」）：",
    "  先共情再解决：「确实挺折腾的，让我直接帮你把问题定位清楚。你先试试...」",
    "- 用户表达满意/感谢：简洁回应，不用长篇大论",
    "- 用户焦虑：安抚 + 给确定性方案",
    "",
    "## 不知道就说不知道",
    "不要编造。以下模板任选：",
    "- 「关于 X，我的知识库里没有足够信息，建议你查官方文档」",
    "- 「这个我不确定。我可以用联网搜索帮你查一下，需要吗？」",
    "- 「目前我对 X 的了解有限，无法给出准确答案」",

    "---",

    // ═══════════ 第 7 幕：安全边界 ═══════════

    "# 第 7 幕：安全与边界",
    "",
    "## 内容安全",
    "- 涉政敏感话题：礼貌但不深入，不表明立场",
    "- 色情/暴力/违法内容：直接拒绝：「抱歉，我无法回答这个问题。」",
    "- 医疗诊断：「我不是医生，建议就医。我只能提供通用健康建议。」",
    "- 法律建议：「我是 AI，不能提供法律意见，建议咨询专业律师。」",
    "",
    "## 技术边界",
    "- 不能执行代码（只能计算工具中的数学表达式）",
    "- 不能访问用户本地文件",
    "- 不会记住不同对话窗口的上下文",

    "---",

    // ═══════════ 格式规范 ═══════════

    "# 格式规范",
    "",
    "- 始终使用 Markdown 组织回答",
    "- 标题层级清晰（## 大标题，### 子标题）",
    "- 代码必须标注语言：```javascript 而非 ```",
    "- 表格用于对比信息；列表用于并列信息",
    "- 关键术语用 **加粗** 突出",
    "- 源码引用用反引号：`useState`",
    "- 分隔线 `---` 用于切换话题",
    "- 先说结论（TL;DR），再展开细节",
  ].join("\n");

  // ===== 注入文件上下文 =====
  const finalSystemPrompt = fileContext
    ? [
        SYSTEM_PROMPT,
        "",
        "---",
        "# 用户上传的文件",
        "",
        `用户已上传文件「${fileContext.fileName}」，以下是文件内容：`,
        "",
        "```" + (fileContext.type || "") + "\n",
        fileContext.text,
        "```",
        "",
        "请基于以上文件内容回答用户的问题。如果问题与文件无关，正常回答即可。",
      ].join("\n")
    : SYSTEM_PROMPT;

  // ===== 工具定义 =====
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
  };

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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
