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

// ===== 自定义 useChat =====
function useChat({ initialMessages = [] }) {
  const chat = new Chat({
    transport: {
      async sendMessages({ messages }) {
        const settings = JSON.parse(
          localStorage.getItem("agent-settings") ||
            '{"model":"deepseek-chat","temperature":0.7}'
        );

        // 在发送请求前读取 fileContext
        const fileContext = window.__fileContext || null;
        console.log(
          "[sendMessages] fileContext:",
          fileContext
            ? {
                fileName: fileContext.fileName,
                type: fileContext.type,
                textLength: fileContext.text?.length,
              }
            : null
        );

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            model: settings.model,
            temperature: settings.temperature,
            fileContext,
          }),
        });

        return response;
      },
    },
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
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  initialMessages: savedMessages,
});

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

function handleExampleClick(text) {
  if (status.value === "ready") {
    sendMessage({ text });
  }
}

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

const exampleQuestions = [
  { icon: Clock, text: "现在几点了？", desc: "获取当前时间" },
  { icon: Key, text: "帮我生成一个16位的密码", desc: "安全随机密码" },
  { icon: Calculator, text: "计算 (123 + 456) * 2", desc: "数学表达式" },
  { icon: Globe, text: "纽约现在几点？", desc: "查询时区时间" },
];

const statusLabel = computed(() => {
  switch (status.value) {
    case "ready":
      return { text: "就绪", dot: "bg-emerald-500" };
    case "submitted":
      return { text: "思考中…", dot: "bg-amber-400 animate-pulse" };
    case "streaming":
      return { text: "回复中…", dot: "bg-sky-400 animate-pulse" };
    case "error":
      return { text: "出错了", dot: "bg-red-500" };
    default:
      return { text: "连接中", dot: "bg-zinc-500 animate-pulse" };
  }
});

// 侧边栏显隐（移动端默认隐藏）
const isMobile = ref(false);
const showSidebar = ref(true);

// 检测移动端
function checkMobile() {
  isMobile.value = window.innerWidth < 768;
  // 移动端默认隐藏侧边栏
  if (isMobile.value) {
    showSidebar.value = false;
  }
}

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

function toggleSidebar() {
  showSidebar.value = !showSidebar.value;
}

// 设置面板
const showSettings = ref(false);
const settings = ref({
  model: "deepseek-chat",
  temperature: 0.7,
});

// 加载设置
onMounted(() => {
  const saved = localStorage.getItem("agent-settings");
  if (saved) {
    try {
      settings.value = JSON.parse(saved);
    } catch (e) {
      console.error("加载设置失败:", e);
    }
  }
});

function openSettings() {
  showSettings.value = true;
}

function closeSettings() {
  showSettings.value = false;
}

function handleSettingsChanged(newSettings) {
  settings.value = newSettings;
}

function openUrl(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// Agent Loop 步骤编号
function toolCountInMessage(message) {
  return message.parts?.filter((p) => p.type?.startsWith("tool-")).length || 0;
}
function toolStepInMessage(message, part) {
  const tools = message.parts?.filter((p) => p.type?.startsWith("tool-")) || [];
  return tools.findIndex((p) => p === part) + 1;
}

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
</script>

<template>
  <div class="flex h-screen bg-zinc-950 text-zinc-100">
    <!-- ===== 侧边栏 ===== -->
    <!-- 移动端遮罩层 -->
    <div
      v-if="showSidebar && isMobile"
      class="fixed inset-0 bg-black/50 z-40 md:hidden"
      @click="showSidebar = false"
    />

    <Transition name="slide">
      <ChatSidebar
        v-if="showSidebar"
        :chats="chatList"
        :current-chat-id="chatId"
        :class="[isMobile ? 'fixed left-0 top-0 h-full z-50 w-72' : 'relative']"
        @select-chat="selectChat"
        @new-chat="createNewChat"
        @delete-chat="deleteChat"
        @close="showSidebar = false"
      />
    </Transition>

    <!-- ===== 主区域 ===== -->
    <div class="flex flex-1 flex-col min-w-0">
      <!-- Header -->
      <header
        class="flex items-center justify-between border-b border-zinc-800 px-4 py-3 md:px-6 md:py-4 mx-3 md:mx-5 mt-3 md:mt-5 rounded-xl md:rounded-2xl bg-zinc-900/50"
      >
        <div class="flex items-center gap-2 md:gap-3">
          <button
            v-if="!showSidebar"
            @click="toggleSidebar"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
            title="打开侧边栏"
          >
            <PanelLeft class="h-4 w-4" />
          </button>
          <div
            class="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20"
          >
            <Bot class="h-4 w-4 md:h-5 md:w-5 text-white" />
          </div>
          <div>
            <h1 class="text-xs md:text-sm font-semibold">晓军的 AI 助手</h1>
            <p class="text-[10px] md:text-xs text-zinc-500">
              AI SDK · 智能工具调用
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 md:gap-3">
          <div
            class="flex items-center gap-1 md:gap-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50 px-2 md:px-3 py-0.5 md:py-1"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="statusLabel.dot" />
            <span class="text-[10px] md:text-xs text-zinc-400">{{
              statusLabel.text
            }}</span>
          </div>
          <button
            @click="openSettings"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
            title="设置"
          >
            <Settings class="h-4 w-4" />
          </button>
        </div>
      </header>

      <!-- Main -->
      <main class="flex-1 overflow-y-auto px-3 py-4 md:px-5 md:py-6">
        <div class="mx-auto max-w-3xl">
          <!-- Empty State -->
          <div
            v-if="messages.length === 0"
            class="flex flex-col items-center justify-center min-h-[calc(100vh-18rem)] text-center"
          >
            <div class="relative mb-10">
              <div
                class="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-500/25"
              >
                <Bot class="h-12 w-12 text-white" />
              </div>
              <div
                class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"
              >
                <Sparkles class="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <h2 class="mb-3 text-2xl font-bold tracking-tight">
              嗨，有什么可以帮你的？
            </h2>
            <p class="mb-10 max-w-sm text-sm text-zinc-400 leading-relaxed">
              我可以联网搜索、计算数学、生成密码、查询时间……试试下面的快捷指令，或者直接输入你的问题。
            </p>

            <div class="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                v-for="q in exampleQuestions"
                :key="q.text"
                @click="handleExampleClick(q.text)"
                class="group flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:shadow-lg active:scale-[0.98]"
              >
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 transition-colors group-hover:bg-indigo-500/15 group-hover:text-indigo-400"
                >
                  <component :is="q.icon" class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-zinc-200 truncate">
                    {{ q.text }}
                  </div>
                  <div class="text-xs text-zinc-500 mt-0.5">{{ q.desc }}</div>
                </div>
                <SendHorizonal
                  class="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 opacity-0 transition-all group-hover:opacity-100 group-hover:text-indigo-400"
                />
              </button>
            </div>
          </div>

          <!-- Messages -->
          <div v-else class="space-y-4 md:space-y-6">
            <div
              v-for="(message, messageIndex) in messages"
              :key="message.id"
              class="group flex"
              :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div class="max-w-[90%] md:max-w-[85%] space-y-2 md:space-y-3">
                <div
                  v-if="message.role !== 'user'"
                  class="flex items-center gap-2 px-1"
                >
                  <div
                    class="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600"
                  >
                    <Bot class="h-3 w-3 text-white" />
                  </div>
                  <span class="text-xs font-medium text-zinc-500">AI 助手</span>
                </div>

                <template v-for="(part, idx) in message.parts" :key="idx">
                  <!-- 跳过无效 part -->
                  <template v-if="part && part.type">
                    <!-- 步骤编号：仅在同一个 message 中有多个 tool 调用时显示 -->
                    <div
                      v-if="
                        message.role !== 'user' &&
                        part.type.startsWith('tool-') &&
                        toolCountInMessage(message) > 1
                      "
                      class="flex items-center gap-2 text-xs text-zinc-600"
                    >
                      <div class="h-px flex-1 bg-zinc-800" />
                      <span>Step {{ toolStepInMessage(message, part) }}</span>
                      <div class="h-px flex-1 bg-zinc-800" />
                    </div>

                    <!-- 图片消息 -->
                    <div v-if="part.type === 'image'" class="relative">
                      <div
                        class="rounded-xl md:rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900"
                      >
                        <img
                          :src="part.image"
                          class="max-w-full h-auto max-h-96 object-contain"
                          alt="上传的图片"
                        />
                      </div>
                    </div>

                    <!-- 文本消息：AI 用 Markdown 渲染，用户用纯文本 -->
                    <div v-else-if="part.type === 'text'" class="relative">
                      <div
                        :class="
                          message.role === 'user'
                            ? 'rounded-xl md:rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-2.5 md:px-5 md:py-3 text-sm text-white shadow-lg shadow-indigo-600/20'
                            : 'rounded-xl md:rounded-2xl rounded-tl-md bg-zinc-900 border border-zinc-800 px-4 py-2.5 md:px-5 md:py-3 text-sm text-zinc-200'
                        "
                      >
                        <!-- 编辑模式 -->
                        <div v-if="editingMessageId === message.id">
                          <textarea
                            v-model="editingText"
                            class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 resize-none"
                            rows="4"
                          ></textarea>
                          <div class="flex gap-2 mt-2">
                            <button
                              @click="saveEdit(messageIndex)"
                              class="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
                            >
                              <Check class="h-3 w-3" />
                              保存
                            </button>
                            <button
                              @click="cancelEdit"
                              class="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                        <!-- 正常显示模式 -->
                        <div v-else>
                          <MarkdownRenderer
                            v-if="message.role !== 'user'"
                            :text="part.text"
                          />
                          <div v-else class="whitespace-pre-wrap break-words">
                            {{ part.text }}
                          </div>
                        </div>
                      </div>
                      <!-- 操作按钮 -->
                      <div
                        v-if="!editingMessageId && status === 'ready'"
                        class="absolute -bottom-7 left-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <!-- 复制按钮 -->
                        <button
                          @click="copyMessage(message)"
                          class="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                          title="复制"
                        >
                          <component
                            :is="copiedMessageId === message.id ? Check : Copy"
                            class="h-3 w-3"
                          />
                        </button>
                        <!-- 编辑按钮（仅用户消息） -->
                        <button
                          v-if="message.role === 'user'"
                          @click="startEdit(message)"
                          class="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                          title="编辑"
                        >
                          <Edit class="h-3 w-3" />
                        </button>
                        <!-- 重新生成按钮（仅 AI 消息） -->
                        <button
                          v-if="
                            message.role === 'assistant' &&
                            messageIndex === messages.length - 1
                          "
                          @click="regenerateMessage(messageIndex)"
                          class="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                          title="重新生成"
                        >
                          <RefreshCw class="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <!-- 工具调用卡片 -->
                    <div
                      v-else-if="part.type.startsWith('tool-')"
                      class="rounded-xl md:rounded-2xl border px-3 py-2.5 md:px-4 md:py-3.5"
                      :class="{
                        'border-red-800/50 bg-red-950/20': isError(part),
                        'border-yellow-800/50 bg-yellow-950/15':
                          isRunning(part) && !isError(part),
                        'border-zinc-800 bg-zinc-900':
                          !isRunning(part) && !isError(part),
                      }"
                    >
                      <div
                        class="mb-2 flex md:mb-2.5 items-center gap-2 md:gap-2.5"
                      >
                        <div
                          class="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-lg bg-zinc-800"
                          :class="{
                            'text-red-400': isError(part),
                            'text-yellow-400':
                              isRunning(part) && !isError(part),
                            'text-indigo-400':
                              !isRunning(part) && !isError(part),
                          }"
                        >
                          <component
                            :is="getToolMeta(part.type).icon"
                            class="h-3 w-3 md:h-3.5 md:w-3.5"
                          />
                        </div>
                        <span
                          class="text-xs md:text-sm font-medium text-zinc-200"
                          >{{ getToolMeta(part.type).name }}</span
                        >
                        <span class="ml-auto text-xs">
                          <!-- ... 状态指示省略，与之前相同 ... -->
                          <span
                            v-if="isRunning(part)"
                            class="flex items-center gap-1.5 text-yellow-400"
                          >
                            <span
                              class="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400"
                            />
                            执行中
                          </span>
                          <span
                            v-else-if="part.state === 'output-available'"
                            class="flex items-center gap-1 text-emerald-400"
                          >
                            <svg
                              class="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2.5"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            完成
                          </span>
                          <span
                            v-else-if="isError(part)"
                            class="flex items-center gap-1 text-red-400"
                          >
                            <svg
                              class="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2.5"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            失败
                          </span>
                        </span>
                      </div>

                      <div
                        v-if="part.state === 'output-available' && part.output"
                      >
                        <div
                          v-if="part.type === 'tool-getCurrentTime'"
                          class="rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3"
                        >
                          <div
                            class="text-base md:text-lg font-mono font-semibold text-indigo-400"
                          >
                            {{ part.output.time }}
                          </div>
                          <div class="mt-0.5 text-xs text-zinc-500">
                            时区: {{ part.output.timezone }}
                          </div>
                        </div>
                        <div
                          v-else-if="part.type === 'tool-generatePassword'"
                          class="rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3"
                        >
                          <div class="mb-1 text-xs text-zinc-500">
                            生成的密码
                          </div>
                          <div
                            class="font-mono text-base md:text-lg font-semibold text-purple-400 break-all tracking-wide"
                          >
                            {{ part.output.password }}
                          </div>
                          <div class="mt-1.5 flex gap-3 text-xs text-zinc-500">
                            <span>长度: {{ part.output.length }}</span>
                            <span
                              >特殊字符: {{ part.output.includeSymbols }}</span
                            >
                          </div>
                        </div>
                        <div
                          v-else-if="part.type === 'tool-calculate'"
                          class="rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3"
                        >
                          <template v-if="part.output.error">
                            <div class="text-sm text-red-400">
                              {{ part.output.error }}
                            </div>
                          </template>
                          <template v-else>
                            <div class="font-mono text-xs text-zinc-500 mb-1">
                              {{ part.output.expression }}
                            </div>
                            <div class="flex items-baseline gap-2">
                              <span class="text-xs text-zinc-500">=</span>
                              <span
                                class="font-mono text-lg md:text-xl font-bold text-emerald-400"
                                >{{ part.output.result }}</span
                              >
                            </div>
                          </template>
                        </div>
                        <div
                          v-else-if="part.type === 'tool-webSearch'"
                          class="space-y-2"
                        >
                          <div
                            v-if="part.output.answer"
                            class="rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3"
                          >
                            <div class="text-xs text-zinc-500 mb-1">
                              AI 摘要
                            </div>
                            <div class="text-sm text-zinc-200 leading-relaxed">
                              {{ part.output.answer }}
                            </div>
                          </div>
                          <div
                            v-for="(r, i) in part.output.results"
                            :key="i"
                            class="group rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3 hover:border-zinc-600 transition-colors cursor-pointer"
                            @click="openUrl(r.url)"
                          >
                            <div class="flex items-start justify-between gap-2">
                              <div
                                class="text-xs md:text-sm font-medium text-indigo-400 group-hover:text-indigo-300 min-w-0"
                              >
                                {{ r.title }}
                              </div>
                              <svg
                                class="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-zinc-600 group-hover:text-indigo-400 transition-colors mt-0.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <path
                                  d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
                                />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </div>
                            <div
                              class="text-[11px] md:text-xs text-zinc-500 mt-0.5 line-clamp-2"
                            >
                              {{ r.snippet }}
                            </div>
                            <div
                              class="text-[10px] text-zinc-600 mt-1 truncate"
                            >
                              {{ r.url }}
                            </div>
                          </div>
                          <div
                            v-if="part.output.source"
                            class="text-[10px] text-zinc-600 text-right"
                          >
                            数据来源: {{ part.output.source }}
                          </div>
                        </div>
                        <div
                          v-else
                          class="rounded-lg md:rounded-xl bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm text-zinc-500"
                        >
                          工具执行完成
                        </div>
                      </div>
                      <div
                        v-if="isError(part)"
                        class="mt-2 text-xs text-red-400/80 bg-red-950/30 rounded-lg px-3 py-2"
                      >
                        {{ part.errorText || "执行失败，请重试" }}
                      </div>
                    </div>
                  </template>
                </template>
              </div>
            </div>

            <!-- Typing -->
            <div v-if="status === 'submitted'" class="flex justify-start">
              <div
                class="flex items-center gap-3 rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-3.5"
              >
                <div class="flex gap-1.5">
                  <span
                    class="h-2 w-2 animate-bounce rounded-full bg-indigo-400/60"
                    style="animation-delay: -0.3s"
                  />
                  <span
                    class="h-2 w-2 animate-bounce rounded-full bg-indigo-400/60"
                    style="animation-delay: -0.15s"
                  />
                  <span
                    class="h-2 w-2 animate-bounce rounded-full bg-indigo-400/60"
                  />
                </div>
                <span class="text-sm text-zinc-400">AI 正在思考…</span>
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="flex justify-center">
              <div
                class="flex items-center gap-3 rounded-2xl border border-red-800/30 bg-red-950/20 px-5 py-3.5"
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10"
                >
                  <svg
                    class="h-4 w-4 text-red-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div class="text-left">
                  <p class="text-sm text-red-300 font-medium">请求出错了</p>
                  <p class="text-xs text-red-400/70 mt-0.5">
                    请检查 API Key 配置后重试
                  </p>
                </div>
                <button
                  @click="regenerate()"
                  class="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-800/30 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
                >
                  <RefreshCw class="h-3 w-3" /> 重试
                </button>
              </div>
            </div>
            <div ref="messagesEndRef" />
          </div>
        </div>
      </main>

      <!-- Footer -->
      <footer class="px-3 py-3 pb-4 md:px-5 md:py-4 md:pb-6">
        <div class="mx-auto max-w-3xl">
          <!-- 图片预览 -->
          <div v-if="imagePreview" class="mb-3 relative inline-block">
            <img
              :src="imagePreview"
              class="h-20 w-20 object-cover rounded-lg border border-zinc-700"
            />
            <button
              type="button"
              @click="removeImage"
              class="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600"
            >
              ×
            </button>
          </div>

          <!-- 文件解析错误 -->
          <div v-if="fileParseError" class="mb-3 text-xs text-red-400">
            {{ fileParseError }}
          </div>

          <!-- 文件解析中 -->
          <div
            v-if="isFileParsing"
            class="mb-3 flex items-center gap-2 text-xs text-zinc-400"
          >
            <div
              class="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400"
            ></div>
            <span>正在解析文件...</span>
          </div>

          <!-- 文件预览标签 -->
          <div v-if="selectedFile" class="mb-3 flex flex-wrap gap-2">
            <div
              class="flex items-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
            >
              <FileText class="h-3.5 w-3.5 text-indigo-400" />
              <span class="font-medium">{{ selectedFile.fileName }}</span>
              <span class="text-zinc-500"
                >· {{ selectedFile.charCount }} 字符</span
              >
              <span v-if="selectedFile.pageCount" class="text-zinc-500"
                >· {{ selectedFile.pageCount }} 页</span
              >
              <button
                @click="removeFile"
                class="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </div>

          <form @submit="handleSubmit" class="flex items-end gap-2 md:gap-3">
            <!-- 图片上传按钮 -->
            <label
              class="flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-xl md:rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-pointer transition-all hover:border-zinc-700 hover:text-zinc-300 active:scale-95"
              title="上传图片"
            >
              <input
                type="file"
                accept="image/*"
                @change="handleImageSelect"
                class="hidden"
              />
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </label>

            <!-- 文件上传按钮 -->
            <label
              class="flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-xl md:rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-pointer transition-all hover:border-zinc-700 hover:text-zinc-300 active:scale-95"
              title="上传文件（TXT/CSV/PDF）"
            >
              <input
                type="file"
                accept=".txt,.csv,.pdf"
                @change="handleFileSelect"
                class="hidden"
              />
              <FileText class="h-5 w-5" />
            </label>

            <input
              v-model="input"
              :disabled="isBusy"
              placeholder="输入消息…"
              class="flex-1 rounded-xl md:rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 md:px-5 md:py-3.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-zinc-800/50 focus:shadow-lg focus:shadow-indigo-500/5 disabled:opacity-40"
              @focus="scrollToBottom"
            />
            <button
              v-if="isBusy"
              type="button"
              @click="stop"
              class="flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-xl md:rounded-2xl bg-red-500/10 border border-red-800/30 text-red-400 transition-all hover:bg-red-500/20 active:scale-95"
              title="停止生成"
            >
              <Square class="h-4 w-4" />
            </button>
            <button
              v-else
              type="submit"
              :disabled="!input.trim() && !selectedImage && !selectedFile"
              class="flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.03] active:scale-95 disabled:opacity-25 disabled:shadow-none disabled:hover:scale-100"
              title="发送"
            >
              <SendHorizonal class="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </form>
        </div>
      </footer>
    </div>

    <!-- 设置面板 -->
    <SettingsModal
      :visible="showSettings"
      @close="closeSettings"
      @settings-changed="handleSettingsChanged"
    />
  </div>
</template>

<style scoped>
/* 侧边栏滑入动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(-1rem);
}
</style>
