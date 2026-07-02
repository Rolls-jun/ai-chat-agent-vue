// 测试文件上传功能
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取测试文件
const testFilePath = path.join(__dirname, 'test.pdf');
const fileBuffer = fs.readFileSync(testFilePath);
const base64 = fileBuffer.toString('base64');

console.log('📄 测试文件:', testFilePath);
console.log('📏 文件大小:', fileBuffer.length, 'bytes');
console.log('🔤 Base64 长度:', base64.length);

// 测试 1: 文件解析 API
console.log('\n=== 测试 1: 文件解析 API ===');
try {
  const response = await fetch('http://localhost:3001/api/parse-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'test.pdf',
      base64: base64
    })
  });
  
  const data = await response.json();
  console.log('✅ 响应状态:', response.status);
  console.log('📋 文件名:', data.fileName);
  console.log('📊 类型:', data.type);
  console.log('📝 字符数:', data.charCount);
  console.log('📖 页数:', data.pageCount);
  console.log('❌ 错误:', data.error || '无');
  console.log('📝 内容预览:', data.text?.substring(0, 200) || '无内容');
  
  // 测试 2: 带文件上下文的对话
  console.log('\n=== 测试 2: 带文件上下文的对话 ===');
  const chatResponse = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: '请总结一下这个文件的主要内容' }]
        }
      ],
      model: 'deepseek-chat',
      temperature: 0.7,
      fileContext: {
        fileName: data.fileName,
        type: data.type,
        text: data.text
      }
    })
  });
  
  console.log('✅ 对话响应状态:', chatResponse.status);
  const chatData = await chatResponse.json();
  console.log('💬 AI 回复:', chatData.choices?.[0]?.message?.content?.substring(0, 300) || '无回复');
  
} catch (error) {
  console.error('❌ 测试失败:', error.message);
}
