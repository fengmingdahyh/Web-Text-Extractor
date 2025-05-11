document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const extractedText = document.getElementById('extractedText');
  let isExtracting = false;
  let reconnectTimer = null;
  let typewriterInterval = null;
  let isSingleLineMode = false; // 添加显示模式标志

  // 打字机效果函数
  function typewriterEffect(text, element) {
    let index = 0;
    const lines = text.split('\n');
    element.innerHTML = ''; // 清空内容

    function typeNextLine() {
      if (index < lines.length) {
        const line = lines[index];
        if (line.trim()) { // 只处理非空行
          const lineElement = document.createElement('div');
          lineElement.className = 'text-line';
          
          // 创建文本内容容器
          const textContent = document.createElement('span');
          textContent.className = 'text-content';
          textContent.textContent = line;
          lineElement.appendChild(textContent);

          // 创建复制按钮
          const copyBtn = document.createElement('button');
          copyBtn.className = 'copy-btn';
          copyBtn.innerHTML = '📋';
          copyBtn.title = '复制文本';
          copyBtn.onclick = (e) => {
            e.stopPropagation();
            const textToCopy = line.replace(/^\[.*?\] /, ''); // 移除类型标记
            navigator.clipboard.writeText(textToCopy).then(() => {
              // 显示复制成功提示
              copyBtn.innerHTML = '✓';
              copyBtn.classList.add('copied');
              setTimeout(() => {
                copyBtn.innerHTML = '📋';
                copyBtn.classList.remove('copied');
              }, 1000);
            }).catch(err => {
              console.error('复制失败:', err);
              copyBtn.innerHTML = '❌';
              setTimeout(() => {
                copyBtn.innerHTML = '📋';
              }, 1000);
            });
          };
          lineElement.appendChild(copyBtn);

          element.appendChild(lineElement);
          
          // 滚动到最新内容
          element.scrollTop = element.scrollHeight;
        }
        index++;
        typewriterInterval = setTimeout(typeNextLine, 100); // 每行间隔100ms
      }
    }

    typeNextLine();
  }

  // 切换显示模式
  function toggleDisplayMode() {
    isSingleLineMode = !isSingleLineMode;
    const textLines = extractedText.querySelectorAll('.text-line');
    
    if (isSingleLineMode) {
      // 切换到单行模式
      const allText = Array.from(textLines)
        .map(line => line.querySelector('.text-content').textContent)
        .join(' ');
      
      extractedText.innerHTML = '';
      const singleLine = document.createElement('div');
      singleLine.className = 'text-line single-line';
      
      const textContent = document.createElement('span');
      textContent.className = 'text-content';
      textContent.textContent = allText;
      singleLine.appendChild(textContent);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制文本';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        const textToCopy = allText.replace(/^\[.*?\] /g, ''); // 移除所有类型标记
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.innerHTML = '✓';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '📋';
            copyBtn.classList.remove('copied');
          }, 1000);
        }).catch(err => {
          console.error('复制失败:', err);
          copyBtn.innerHTML = '❌';
          setTimeout(() => {
            copyBtn.innerHTML = '📋';
          }, 1000);
        });
      };
      singleLine.appendChild(copyBtn);
      
      extractedText.appendChild(singleLine);
    } else {
      // 切换回多行模式
      const text = extractedText.querySelector('.text-content').textContent;
      typewriterEffect(text, extractedText);
    }
  }

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'text') {
      // 清除之前的打字机效果
      if (typewriterInterval) {
        clearTimeout(typewriterInterval);
      }
      if (!isSingleLineMode) {
        typewriterEffect(message.content, extractedText);
      } else {
        // 在单行模式下，直接更新文本
        const textContent = extractedText.querySelector('.text-content');
        if (textContent) {
          textContent.textContent = message.content;
        }
      }
    }
  });

  // 开始提取文字
  startBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('未找到活动标签页');
        return;
      }

      // 注入脚本
      try {
        await chrome.scripting.executeScript({ 
          target: { tabId: tab.id }, 
          function: startTextExtraction 
        });
        console.log('成功注入脚本到标签页:', tab.id);
      } catch (error) {
        console.error('注入脚本失败:', error);
        return;
      }

      isExtracting = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } catch (error) {
      console.error('Error starting extraction:', error);
      isExtracting = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });

  // 停止提取文字
  stopBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 清除重连定时器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // 清除打字机效果
      if (typewriterInterval) {
        clearTimeout(typewriterInterval);
        typewriterInterval = null;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: stopTextExtraction
      });

      isExtracting = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    } catch (error) {
      console.error('Error stopping extraction:', error);
    }
  });

  // 折叠/展开文字
  toggleBtn.addEventListener('click', () => {
    const isCollapsed = extractedText.classList.contains('collapsed');
    extractedText.classList.toggle('collapsed');
    toggleBtn.textContent = isCollapsed ? '折叠' : '展开';
  });

  // 添加切换显示模式的按钮
  const modeToggleBtn = document.createElement('button');
  modeToggleBtn.className = 'btn small';
  modeToggleBtn.textContent = '切换显示模式';
  modeToggleBtn.onclick = toggleDisplayMode;
  document.querySelector('.controls').appendChild(modeToggleBtn);
});

// 注入到页面的函数
function startTextExtraction() {
  let observer = null;

  function extractText() {
    console.log('开始提取文本...');
    
    // 获取所有文本节点
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // 过滤掉脚本、样式和隐藏元素
          const parent = node.parentElement;
          if (!parent || 
              parent.tagName === 'SCRIPT' || 
              parent.tagName === 'STYLE' ||
              parent.tagName === 'NOSCRIPT' ||
              parent.tagName === 'META' ||
              parent.tagName === 'LINK' ||
              parent.hidden ||
              window.getComputedStyle(parent).display === 'none' ||
              window.getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text) {
        textNodes.push({
          text: text,
          parent: node.parentElement,
          level: getElementLevel(node.parentElement)
        });
      }
    }

    // 获取元素的层级
    function getElementLevel(element) {
      let level = 0;
      let current = element;
      while (current && current !== document.body) {
        if (current.tagName === 'SECTION' || 
            current.tagName === 'ARTICLE' || 
            current.tagName === 'MAIN' ||
            current.tagName === 'DIV') {
          level++;
        }
        current = current.parentElement;
      }
      return level;
    }

    // 对文本进行分段和格式化处理
    let sectionCount = 0;
    let currentSection = -1;
    const paragraphs = textNodes
      .map(({ text, parent, level }) => {
        const tagName = parent.tagName.toLowerCase();
        let formattedText = text.replace(/\s+/g, ' ').trim();
        
        // 检查是否需要开始新的章节
        if (level > currentSection) {
          sectionCount++;
          currentSection = level;
          return `\n[章节 ${sectionCount}]\n${formattedText}`;
        }
        
        if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || 
            tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
          return `\n[标题] ${formattedText}`;
        } else if (tagName === 'li') {
          return `\n[列表项] ${formattedText}`;
        } else if (tagName === 'blockquote') {
          return `\n[引用] ${formattedText}`;
        } else {
          return `\n[正文] ${formattedText}`;
        }
      })
      .filter(text => text.length > 0)
      .reduce((acc, text) => {
        // 合并相邻的相同类型的段落
        if (acc.length > 0) {
          const lastItem = acc[acc.length - 1];
          if (!lastItem.includes('[章节]') && !lastItem.includes('[标题]') && 
              !lastItem.includes('[列表项]') && !lastItem.includes('[引用]') &&
              !text.includes('[章节]') && !text.includes('[标题]') && 
              !text.includes('[列表项]') && !text.includes('[引用]')) {
            // 合并普通段落
            acc[acc.length - 1] = `${lastItem} ${text.replace(/^\\n\[正文\] /, '')}`;
          } else {
            acc.push(text);
          }
        } else {
          acc.push(text);
        }
        return acc;
      }, []);

    // 发送处理后的文本
    const formattedText = paragraphs.join('');

    // 使用chrome.runtime.sendMessage发送消息
    chrome.runtime.sendMessage({ type: 'text', content: formattedText }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
      }
    });
  }

  // 创建 MutationObserver 来监听页面变化
  observer = new MutationObserver(() => {
    extractText();
  });

  // 开始观察页面变化
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // 立即提取一次文字
  extractText();

  // 存储 observer 以便后续停止
  window.textExtractorObserver = observer;
}

function stopTextExtraction() {
  if (window.textExtractorObserver) {
    window.textExtractorObserver.disconnect();
    window.textExtractorObserver = null;
  }
}