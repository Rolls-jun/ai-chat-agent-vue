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

// 保存设置
function saveSettings() {
  localStorage.setItem("agent-settings", JSON.stringify(settings.value));
  emit("settings-changed", settings.value);
}

// 清除历史
function clearHistory() {
  if (confirm("确定要清除所有对话历史吗？此操作不可恢复。")) {
    // 清除所有 chat-* 和 chat-list
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
    // 刷新页面
    window.location.reload();
  }
}

// 关闭模态框
function handleClose() {
  saveSettings();
  emit("close");
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

      // 导入每个对话
      data.chats.forEach((chat) => {
        const { messages, ...chatMeta } = chat;
        // 检查是否已存在
        const existingList = JSON.parse(
          localStorage.getItem("chat-list") || "[]"
        );
        const exists = existingList.find((c) => c.id === chatMeta.id);

        if (!exists) {
          // 添加新对话
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

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- 遮罩层 -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="handleClose"
        ></div>

        <!-- 模态框 -->
        <div
          class="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl"
        >
          <!-- 头部 -->
          <div
            class="flex items-center justify-between border-b border-zinc-800 px-6 py-4"
          >
            <h2 class="text-lg font-semibold text-zinc-100">设置</h2>
            <button
              @click="handleClose"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- 内容 -->
          <div class="px-6 py-5 space-y-6">
            <!-- 模型选择 -->
            <div>
              <label
                class="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2"
              >
                <Cpu class="h-4 w-4 text-indigo-400" />
                模型
              </label>
              <select
                v-model="settings.model"
                class="w-full rounded-xl border border-zinc-800 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/50 focus:bg-zinc-800/50"
              >
                <option
                  v-for="opt in modelOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- 温度调节 -->
            <div>
              <label
                class="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2"
              >
                <Thermometer class="h-4 w-4 text-purple-400" />
                温度 (Temperature)
              </label>
              <div class="space-y-2">
                <input
                  v-model.number="settings.temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  class="w-full accent-indigo-500"
                />
                <div class="flex justify-between text-xs text-zinc-500">
                  <span>精确 (0)</span>
                  <span class="text-indigo-400 font-medium">{{
                    settings.temperature
                  }}</span>
                  <span>创意 (1)</span>
                </div>
              </div>
            </div>

            <!-- 对话管理 -->
            <div class="pt-4 border-t border-zinc-800 space-y-3">
              <label class="text-sm font-medium text-zinc-300">对话管理</label>

              <!-- 导出按钮 -->
              <button
                @click="exportChats"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-700"
              >
                <Download class="h-4 w-4" />
                导出所有对话
              </button>

              <!-- 导入按钮 -->
              <label
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-700 cursor-pointer"
              >
                <Upload class="h-4 w-4" />
                导入对话
                <input
                  type="file"
                  accept=".json"
                  @change="importChats"
                  class="hidden"
                />
              </label>
            </div>

            <!-- 清除历史 -->
            <div class="pt-4 border-t border-zinc-800">
              <button
                @click="clearHistory"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-500/20"
              >
                <Trash2 class="h-4 w-4" />
                清除所有对话历史
              </button>
              <p class="mt-2 text-xs text-zinc-500 text-center">
                此操作将删除所有对话记录，不可恢复
              </p>
            </div>
          </div>

          <!-- 底部 -->
          <div class="border-t border-zinc-800 px-6 py-4">
            <button
              @click="handleClose"
              class="w-full rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-xl hover:shadow-indigo-500/30"
            >
              保存并关闭
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
