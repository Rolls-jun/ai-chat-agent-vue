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
  // 匹配 <a> 标签，如果文本包含 "来源" 或 "引用" 关键词，加上引用样式
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
  // 匹配 <pre><code class="language-xxx">...</code></pre>
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

<style scoped>
.markdown-body {
  line-height: 1.75;
  word-break: break-word;
}
.markdown-body :deep(p) {
  margin-bottom: 0.75em;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin-top: 1.25em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.4;
}
.markdown-body :deep(h1) {
  font-size: 1.4em;
}
.markdown-body :deep(h2) {
  font-size: 1.2em;
}
.markdown-body :deep(h3) {
  font-size: 1.05em;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}
.markdown-body :deep(li) {
  margin-bottom: 0.3em;
}
.markdown-body :deep(a) {
  color: #818cf8;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.markdown-body :deep(a:hover) {
  color: #a5b4fc;
}

/* 来源引用链接样式 */
.markdown-body :deep(.citation-link) {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  padding: 0.1em 0.5em;
  margin: 0 0.15em;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  font-size: 0.8em;
  text-decoration: none;
  transition: all 0.15s;
  vertical-align: middle;
}
.markdown-body :deep(.citation-link::before) {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #818cf8;
  flex-shrink: 0;
}
.markdown-body :deep(.citation-link:hover) {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
}
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  font-size: 0.875em;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #27272a;
  padding: 0.5em 0.75em;
  text-align: left;
}
.markdown-body :deep(th) {
  background: #18181b;
  font-weight: 600;
}
.markdown-body :deep(tr:nth-child(even)) {
  background: #0f0f11;
}
.markdown-body :deep(code:not(pre code)) {
  background: #27272a;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.875em;
  font-family: "Cascadia Code", Consolas, monospace;
}
.markdown-body :deep(.code-block-wrapper) {
  margin: 0.75em 0 1em;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #27272a;
  background: #0f0f11;
}
.markdown-body :deep(.code-block-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 1em;
  background: #18181b;
  border-bottom: 1px solid #27272a;
}
.markdown-body :deep(.code-block-lang) {
  font-size: 0.75em;
  color: #71717a;
  font-family: "Cascadia Code", Consolas, monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.markdown-body :deep(.code-block-copy) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: #71717a;
  cursor: pointer;
  transition: all 0.15s;
}
.markdown-body :deep(.code-block-copy:hover) {
  background: #27272a;
  color: #a1a1aa;
}
.markdown-body :deep(.code-block-copy.copied) {
  color: #34d399;
}
.markdown-body :deep(.code-block-wrapper pre) {
  margin: 0;
  padding: 1em;
  overflow-x: auto;
  background: transparent;
}
.markdown-body :deep(.code-block-wrapper pre code) {
  font-family: "Cascadia Code", Consolas, "Courier New", monospace;
  font-size: 0.8125em;
  line-height: 1.6;
  color: #e4e4e7;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid #3f3f46;
  padding-left: 1em;
  margin: 0.75em 0;
  color: #a1a1aa;
}
.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid #27272a;
  margin: 1.25em 0;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 0.5em 0;
}
</style>
