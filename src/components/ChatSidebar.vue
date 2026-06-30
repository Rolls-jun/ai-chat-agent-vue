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

<template>
  <aside class="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
    <!-- 侧边栏头部 -->
    <div class="flex items-center justify-between px-4 py-4 border-b border-zinc-800/50">
      <h2 class="text-sm font-semibold text-zinc-200">对话历史</h2>
      <div class="flex items-center gap-1">
        <button
          @click="emit('new-chat')"
          class="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
          title="新建对话"
        >
          <MessageSquarePlus class="h-4 w-4" />
        </button>
        <button
          @click="emit('close')"
          class="lg:hidden flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
          title="关闭侧边栏"
        >
          <PanelLeftClose class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 对话列表 -->
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <div v-if="chats.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare class="h-8 w-8 text-zinc-700 mb-3" />
        <p class="text-xs text-zinc-600">暂无对话记录</p>
        <p class="text-xs text-zinc-700 mt-1">点击 + 开始新对话</p>
      </div>

      <div v-for="chat in chats" :key="chat.id"
        class="group relative mb-1 cursor-pointer rounded-xl transition-all"
        :class="chat.id === currentChatId
          ? 'bg-zinc-800/80 ring-1 ring-indigo-500/30'
          : 'hover:bg-zinc-800/50'"
        @click="emit('select-chat', chat.id)"
      >
        <div class="px-3 py-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-zinc-300 truncate">{{ getTitle(chat) }}</div>
              <div class="text-xs text-zinc-600 truncate mt-0.5">{{ getPreview(chat) }}</div>
            </div>
            <button
              @click.stop="emit('delete-chat', chat.id)"
              class="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
              title="删除对话"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
          <div class="mt-1.5 text-[10px] text-zinc-600">{{ getTime(chat) }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>
