/**
 * 富文本编辑器组件 - 重构版
 * 格式：#f(code:value|...)content#l
 * 
 * 核心思路：
 * 1. 单向转换：富文本代码 → HTML 预览（不做逆向转换）
 * 2. ID 映射：每个格式化片段有唯一 ID，方便定位和修改
 * 3. 代码模式为主要编辑方式，预览模式只读
 */

const RichTextEditor = (function () {
    'use strict';

    // 私有变量
    let currentFieldId = null;
    let currentMode = 'code'; // 默认代码模式
    let onConfirmCallback = null;
    let segmentMap = {}; // ID → 代码片段映射
    let nextSegmentId = 1;
    let currentSegmentId = null; // 当前光标所在的 segment ID

    // 元素引用
    const elements = {};

    // 预设格式方案
    const presets = {
        h1: { s: '40', o: '000000', O: '2', b: '1' }, // 40px + 黑色描边2px + 加粗标记
        h2: { s: '32', o: '000000', O: '1.5', b: '1' }, // 32px + 黑色描边1.5px + 加粗标记
        h3: { s: '24', o: '000000', O: '1', b: '1' }, // 24px + 黑色描边1px + 加粗标记
        h4: { s: '18', o: '000000', O: '0.5', b: '1' }, // 18px + 黑色描边0.5px + 加粗标记
        bold: {}, // 加粗：动态使用文字颜色作为描边
        underline: { u: '000000', u_mark: '1' }, // 黑色下划线 + 下划线标记
        strike: { h: 'ff0000', h_mark: '1' }, // 红色删除线 + 删除线标记
        glow: { g: 'ffff00', G: '1.000' }, // 黄色发光
        shadow: { y: '000000', Y: '2,2' }, // 黑色阴影偏移2,2
        ul: {}, // 无序列表（用符号表示）
        ol: {} // 有序列表（用符号表示）
    };

    /**
     * 初始化编辑器
     */
    function init() {
        // 缓存元素引用
        elements.modal = document.getElementById('richTextModal');
        elements.preview = document.getElementById('richtext-preview');
        elements.editor = document.getElementById('richtext-editor');
        elements.container = document.querySelector('.richtext-container');

        if (!elements.modal || !elements.editor || !elements.preview) {
            console.error('富文本编辑器元素未找到');
            return;
        }

        // 代码编辑器输入监听 - 自动更新预览
        elements.editor.addEventListener('input', () => {
            if (currentMode === 'split') {
                renderPreview();
            }
        });

        // 预览区输入监听 - 同步和 Markdown
        elements.preview.addEventListener('input', handlePreviewInput);

        // 输入法事件监听
        elements.preview.addEventListener('compositionstart', () => {
            isComposing = true;
        });
        elements.preview.addEventListener('compositionend', () => {
            isComposing = false;
            // 输入法结束后，如果有待格式化，应用格式
            setTimeout(() => {
                if (window._pendingFormat) {
                    applyPendingFormat();
                } else {
                    cleanEmptySegments();
                    syncPreviewToCode();
                }
            }, 0);
        });

        // 预览区键盘事件监听 - 换行处理
        elements.preview.addEventListener('keydown', handlePreviewKeydown);

        // 预览区键盘释放事件 - 用于清理
        elements.preview.addEventListener('keyup', (event) => {
            // 延迟清理，确保输入事件已处理
            setTimeout(() => cleanEmptySegments(), 0);
        });

        // 监听选区变化，更新工具栏按钮状态
        document.addEventListener('selectionchange', updateToolbarState);

        // 监听颜色选择器 - 实时更新
        const colorPicker = document.getElementById('text-color-picker');
        if (colorPicker) {
            // input 事件：拖动时实时更新
            colorPicker.addEventListener('input', () => {
                applyColorToSelection(colorPicker.value);
            });
            // change 事件：选择完成时更新（作为备份）
            colorPicker.addEventListener('change', () => {
                applyColorToSelection(colorPicker.value);
            });
        }

        console.log('富文本编辑器初始化完成');
    }

    // 输入法状态标记
    let isComposing = false;

    /**
     * 处理预览区的输入 - 同步到代码 + Markdown 检测
     */
    function handlePreviewInput(event) {
        // 输入法输入中，不处理
        if (isComposing) return;

        // 延迟执行，确保DOM更新完成
        setTimeout(() => {
            // 检查是否全部清空了（全选删除的情况）
            const previewText = elements.preview.textContent.trim();
            if (previewText === '') {
                // 清空代码编辑器
                elements.editor.value = '';
                // 重置当前 segment 状态
                currentSegmentId = null;
                window._pendingFormat = null;
                // 渲染以清空预览并更新 segmentMap
                renderPreview();
                return;
            }

            // 先检测 Markdown 快捷输入
            if (detectAndApplyMarkdown()) {
                return; // Markdown 已处理，不需要继续
            }

            // 检查是否有待格式化的内容（Markdown）
            if (window._pendingFormat) {
                applyPendingFormat();
            } else {
                // 正常同步
                cleanEmptySegments();
                syncPreviewToCode();
            }
        }, 0);
    }

    /**
     * 在 segment 内应用 Markdown 格式（分离逻辑）
     */
    function applyMarkdownInSegment(parentSegment, textNode, markdownText, content, newFormatObj) {
        const segmentId = parseInt(parentSegment.getAttribute('data-segment-id'));
        const segment = segmentMap[segmentId];
        if (!segment) return false;

        // 先同步到代码
        syncPreviewToCode();
        // 重新渲染以更新 segmentMap 的位置
        renderPreview();

        const updatedSegment = segmentMap[segmentId];
        if (!updatedSegment) return false;

        // 在 segment.content 中查找 Markdown 标记
        if (!updatedSegment.content.includes(markdownText)) {
            return false;
        }

        // 直接替换 Markdown 标记为纯文本
        const newSegmentContent = updatedSegment.content.replace(markdownText, content);

        // 找到 content 在新内容中的位置（使用 replace 前的位置）
        const contentStart = updatedSegment.content.indexOf(markdownText);

        // 分离：before + content + after
        const segmentBefore = newSegmentContent.substring(0, contentStart);
        const segmentAfter = newSegmentContent.substring(contentStart + content.length);

        // 构建新代码
        const oldFormats = parseFormatCodes(updatedSegment.format);
        const newFormats = { ...oldFormats, ...newFormatObj };

        let code = elements.editor.value;
        let newCode = '';
        const oldFormatCode = updatedSegment.format;
        const newFormatCode = buildFormatCode(newFormats);

        if (segmentBefore) {
            newCode += `#f(${oldFormatCode})${segmentBefore}#l`;
        }
        newCode += `#f(${newFormatCode})${content}#l`;
        if (segmentAfter) {
            newCode += `#f(${oldFormatCode})${segmentAfter}#l`;
        }

        // 替换代码
        elements.editor.value = code.substring(0, updatedSegment.start) + newCode + code.substring(updatedSegment.end);

        // 渲染
        renderPreview();

        setTimeout(() => {
            moveCursorToEnd(elements.preview);
        }, 10);

        return true;
    }

    /**
     * 检测并应用 Markdown 快捷格式
     * 支持：# H1, ## H2, ### H3, #### H4, **bold**, *italic*, ~~strike~~, - list, 1. list
     */
    function detectAndApplyMarkdown() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;

        const range = selection.getRangeAt(0);
        const node = range.startContainer;

        // 必须是文本节点
        if (node.nodeType !== Node.TEXT_NODE) return false;

        // 检查是否在 segment 内
        let parentSegment = null;
        let checkNode = node.parentNode;
        while (checkNode && checkNode !== elements.preview) {
            if (checkNode.nodeType === Node.ELEMENT_NODE && checkNode.hasAttribute('data-segment-id')) {
                parentSegment = checkNode;
                break;
            }
            checkNode = checkNode.parentNode;
        }

        const text = node.textContent;
        const cursorPos = range.startOffset;

        // 获取光标前的文本（当前行）
        const beforeCursor = text.substring(0, cursorPos);

        // 检测标题：# 后跟空格，再按空格触发
        // 匹配 "# xxx " 或 "# xxx" (光标在末尾)
        const headerMatch = beforeCursor.match(/^(#{1,4})\s+(.+?)\s*$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const content = headerMatch[2].trim(); // 去除首尾空格

            // 必须有实际内容
            if (!content) return false;

            const presetName = `h${level}`;

            console.log('检测到 Markdown 标题:', presetName, content);

            // 1. 同步到代码
            syncPreviewToCode();
            let code = elements.editor.value;

            // 2. 在代码中查找并替换
            const searchText = headerMatch[0]; // 完整的 "# 标题" 文本
            const textIndex = code.lastIndexOf(searchText);
            if (textIndex === -1) {
                console.log('无法找到 Markdown 文本');
                return false;
            }

            // 3. 生成格式化代码
            const preset = presets[presetName];
            const formatCode = buildFormatCode(preset);
            const formattedCode = `#f(${formatCode})${content}#l`;

            // 4. 替换代码
            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + searchText.length);
            elements.editor.value = before + formattedCode + after;

            // 5. 重新渲染
            const lastSegmentId = renderPreview();

            // 6. 移动光标到新 segment 末尾
            setTimeout(() => {
                if (lastSegmentId) {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${lastSegmentId}"]`);
                    if (newSegmentSpan) {
                        moveCursorToEnd(newSegmentSpan);
                    }
                }
            }, 10);

            return true;
        }

        // 检测加粗：**text**
        const boldMatch = beforeCursor.match(/\*\*(.+?)\*\*$/);
        if (boldMatch && cursorPos === text.length) {
            const content = boldMatch[1];
            const markdownText = boldMatch[0];

            console.log('检测到 Markdown 加粗:', content);

            // 如果在 segment 内，需要分离
            if (parentSegment) {
                const oldFormats = parseFormatCodes(segmentMap[parseInt(parentSegment.getAttribute('data-segment-id'))].format);
                const textColor = oldFormats.c || '000000';
                return applyMarkdownInSegment(parentSegment, node, markdownText, content, { b: '1', o: textColor, O: '1' });
            }

            // 不在 segment 内，正常处理
            syncPreviewToCode();
            let code = elements.editor.value;

            const textIndex = code.lastIndexOf(markdownText);
            if (textIndex === -1) return false;

            const formatCode = buildFormatCode({ b: '1', o: '000000', O: '1' });
            const formattedCode = `#f(${formatCode})${content}#l`;

            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + markdownText.length);
            elements.editor.value = before + formattedCode + after;

            const lastSegmentId = renderPreview();

            setTimeout(() => {
                if (lastSegmentId) {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${lastSegmentId}"]`);
                    if (newSegmentSpan) {
                        moveCursorToEnd(newSegmentSpan);
                    }
                }
            }, 10);

            return true;
        }

        // 检测下划线：__text__
        const underlineMatch = beforeCursor.match(/__(.+?)__$/);
        if (underlineMatch && cursorPos === text.length) {
            const content = underlineMatch[1];
            const markdownText = underlineMatch[0];

            console.log('检测到 Markdown 下划线:', content);

            // 如果在 segment 内，需要分离
            if (parentSegment) {
                return applyMarkdownInSegment(parentSegment, node, markdownText, content, { u: '000000', u_mark: '1' });
            }

            // 不在 segment 内，正常处理
            syncPreviewToCode();
            let code = elements.editor.value;

            const textIndex = code.lastIndexOf(markdownText);
            if (textIndex === -1) return false;

            const formatCode = buildFormatCode({ u: '000000', u_mark: '1' });
            const formattedCode = `#f(${formatCode})${content}#l`;

            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + markdownText.length);
            elements.editor.value = before + formattedCode + after;

            const lastSegmentId = renderPreview();

            setTimeout(() => {
                if (lastSegmentId) {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${lastSegmentId}"]`);
                    if (newSegmentSpan) {
                        moveCursorToEnd(newSegmentSpan);
                    }
                }
            }, 10);

            return true;
        }

        // 检测删除线：--text--
        const strikeMatch = beforeCursor.match(/\-\-(.+?)\-\-$/);
        if (strikeMatch && cursorPos === text.length) {
            const content = strikeMatch[1];
            const markdownText = strikeMatch[0];

            console.log('检测到 Markdown 删除线:', content);

            // 如果在 segment 内，需要分离
            if (parentSegment) {
                return applyMarkdownInSegment(parentSegment, node, markdownText, content, { h: 'ff0000', h_mark: '1' });
            }

            // 不在 segment 内，正常处理
            syncPreviewToCode();
            let code = elements.editor.value;

            const textIndex = code.lastIndexOf(markdownText);
            if (textIndex === -1) return false;

            const formatCode = buildFormatCode({ h: 'ff0000', h_mark: '1' });
            const formattedCode = `#f(${formatCode})${content}#l`;

            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + markdownText.length);
            elements.editor.value = before + formattedCode + after;

            const lastSegmentId = renderPreview();

            setTimeout(() => {
                if (lastSegmentId) {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${lastSegmentId}"]`);
                    if (newSegmentSpan) {
                        moveCursorToEnd(newSegmentSpan);
                    }
                }
            }, 10);

            return true;
        }

        // 检测无序列表：- 或 * 后跟空格
        const unorderedListMatch = beforeCursor.match(/^[-*]\s+(.+)$/);
        if (unorderedListMatch) {
            const content = unorderedListMatch[1];

            console.log('检测到 Markdown 无序列表:', content);

            syncPreviewToCode();
            let code = elements.editor.value;

            const searchText = unorderedListMatch[0];
            const textIndex = code.lastIndexOf(searchText);
            if (textIndex === -1) return false;

            // 替换为符号前缀
            const newText = '• ' + content;

            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + searchText.length);
            elements.editor.value = before + newText + after;

            renderPreview();

            // 移动光标到内容末尾
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel.rangeCount) {
                    // 找到包含新文本的文本节点
                    const walker = document.createTreeWalker(
                        elements.preview,
                        NodeFilter.SHOW_TEXT,
                        null
                    );

                    let targetNode = null;
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes(newText)) {
                            targetNode = node;
                            break;
                        }
                    }

                    if (targetNode) {
                        const range = document.createRange();
                        // 将光标放在文本末尾
                        range.setStart(targetNode, targetNode.textContent.length);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }, 10);

            return true;
        }

        // 检测有序列表：数字. 后跟空格
        const orderedListMatch = beforeCursor.match(/^(\d+)\.\s+(.+)$/);
        if (orderedListMatch) {
            const number = orderedListMatch[1];
            const content = orderedListMatch[2];

            console.log('检测到 Markdown 有序列表:', number, content);

            syncPreviewToCode();
            let code = elements.editor.value;

            const searchText = orderedListMatch[0];
            const textIndex = code.lastIndexOf(searchText);
            if (textIndex === -1) return false;

            // 保留数字前缀
            const newText = number + '. ' + content;

            const before = code.substring(0, textIndex);
            const after = code.substring(textIndex + searchText.length);
            elements.editor.value = before + newText + after;

            renderPreview();

            // 移动光标到内容末尾
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel.rangeCount) {
                    // 找到包含新文本的文本节点
                    const walker = document.createTreeWalker(
                        elements.preview,
                        NodeFilter.SHOW_TEXT,
                        null
                    );

                    let targetNode = null;
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes(newText)) {
                            targetNode = node;
                            break;
                        }
                    }

                    if (targetNode) {
                        const range = document.createRange();
                        // 将光标放在文本末尾
                        range.setStart(targetNode, targetNode.textContent.length);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }, 10);

            return true;
        }

        return false;
    }

    /**
     * 应用待格式化
     */
    function applyPendingFormat() {
        if (!window._pendingFormat) return;

        const { preset, textNode } = window._pendingFormat;

        // 检查文本节点是否还存在
        if (!textNode || !textNode.parentNode) {
            window._pendingFormat = null;
            return;
        }

        // 获取当前文本内容
        const currentText = textNode.textContent.trim();

        // 如果有内容，调用 applyPreset 格式化
        if (currentText) {
            const segmentId = applyPreset(preset, currentText);

            // 清除待处理标记
            window._pendingFormat = null;

            // 恢复光标到格式化片段的末尾
            if (segmentId) {
                const span = elements.preview.querySelector(`[data-segment-id="${segmentId}"]`);
                if (span) {
                    moveCursorToEnd(span);
                }
            }
        }
    }

    /**
     * 清理空的格式化片段
     */
    function cleanEmptySegments() {
        const segments = elements.preview.querySelectorAll('[data-segment-id]');
        const selection = window.getSelection();

        segments.forEach(span => {
            if (!span.textContent.trim()) {
                // 空片段，移除并删除映射
                const segmentId = parseInt(span.getAttribute('data-segment-id'));
                delete segmentMap[segmentId];

                // 如果光标在这个空片段中，先移出去（但不影响待处理的 Markdown）
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    if (span.contains(range.startContainer)) {
                        // 如果有待处理的 Markdown，不移动光标
                        if (pendingMarkdown && pendingMarkdown.textNode === range.startContainer) {
                            return; // 保留待处理状态
                        }

                        console.log('Cursor in empty span, moving out');
                        // 在 span 后面创建文本节点并移动光标
                        const textNode = document.createTextNode('');
                        if (span.nextSibling) {
                            span.parentNode.insertBefore(textNode, span.nextSibling);
                        } else {
                            span.parentNode.appendChild(textNode);
                        }
                        range.setStart(textNode, 0);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }

                span.remove();
            }
        });
    }

    /**
     * 检查并应用 Markdown 快捷输入
     * 返回 true 表示已应用
     */
    /**
     * 清理空的格式化片段
     */
    function cleanEmptySegments() {
        const segments = elements.preview.querySelectorAll('[data-segment-id]');
        segments.forEach(span => {
            if (!span.textContent.trim()) {
                const segmentId = parseInt(span.getAttribute('data-segment-id'));
                delete segmentMap[segmentId];
                span.remove();
            }
        });
    }

    /**
     * 同步预览内容到代码
     */
    function syncPreviewToCode() {
        const previewElement = elements.preview;
        let code = '';

        // 先检查预览区是否完全为空
        const previewText = previewElement.textContent.trim();
        if (previewText === '') {
            // 预览区为空，清空所有
            elements.editor.value = '';
            // 重置当前 segment 状态
            currentSegmentId = null;
            window._pendingFormat = null;
            // 渲染以清空预览并更新 segmentMap
            renderPreview();
            return;
        }

        // 遍历预览区的所有子节点
        for (let node of previewElement.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                // 纯文本节点 - 过滤零宽空格
                const text = node.textContent.replace(/\u200B/g, '');
                if (text) {
                    code += text;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'BR') {
                    code += '\n';
                } else if (node.hasAttribute('data-segment-id')) {
                    // 格式化片段
                    const segmentId = parseInt(node.getAttribute('data-segment-id'));
                    const segment = segmentMap[segmentId];

                    if (segment) {
                        // 检查内容是否改变
                        const currentContent = node.textContent;
                        if (currentContent !== segment.content) {
                            // 内容改变了，更新映射
                            segment.content = currentContent;
                        }

                        // 重建格式代码
                        code += `#f(${segment.format})${segment.content}#l`;
                    } else {
                        // 没找到映射，作为纯文本
                        code += node.textContent;
                    }
                } else {
                    // 其他元素，提取文本
                    code += node.textContent;
                }
            }
        }

        // 更新代码编辑器
        elements.editor.value = code;
    }

    /**
     * 应用待格式化
     */
    function applyPendingFormat() {
        if (!window._pendingFormat) return;

        const { preset, textNode } = window._pendingFormat;

        // 检查文本节点是否还存在
        if (!textNode || !textNode.parentNode) {
            window._pendingFormat = null;
            return;
        }

        // 获取当前文本内容
        const currentText = textNode.textContent.trim();

        // 如果有内容，调用 applyPreset 格式化
        if (currentText) {
            const segmentId = applyPreset(preset, currentText);

            // 清除待处理标记
            window._pendingFormat = null;

            // 恢复光标到格式化片段的末尾
            if (segmentId) {
                const span = elements.preview.querySelector(`[data-segment-id="${segmentId}"]`);
                if (span) {
                    moveCursorToEnd(span);
                }
            }
        } else {
            window._pendingFormat = null;
        }
    }

    /**
     * 移动光标到元素末尾
     */
    function moveCursorToEnd(element) {
        const range = document.createRange();
        const selection = window.getSelection();

        range.selectNodeContents(element);
        range.collapse(false); // false = 折叠到末尾

        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * 处理预览区的键盘事件
     */
    function handlePreviewKeydown(event) {
        // 空格键 - 检查 Markdown
        if (event.key === ' ') {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            let textNode = range.startContainer;

            if (textNode.nodeType !== Node.TEXT_NODE) return;

            // 检查是否已经在格式化片段中
            let parent = textNode.parentNode;
            if (parent && parent.hasAttribute && parent.hasAttribute('data-segment-id')) {
                return; // 已经格式化了，不处理
            }

            const text = textNode.textContent;
            const cursorPos = range.startOffset;
            const beforeCursor = text.substring(0, cursorPos);

            // 检测 Markdown 模式
            let preset = null;
            let content = null;

            // 检测标题：# 后按空格（不需要内容）
            if (/^#{1,4}$/.test(beforeCursor)) {
                const level = beforeCursor.length;
                preset = `h${level}`;
                console.log('标题匹配:', preset);
            }
            // 检测标题：已经有内容 "# 标题内容" 后按空格
            else {
                let headerMatch = beforeCursor.match(/^(#{1,4})\s+(.+)$/);
                if (headerMatch) {
                    const level = headerMatch[1].length;
                    content = headerMatch[2].trim();
                    preset = `h${level}`;
                    console.log('标题匹配（有内容）:', preset, content);
                }
            }

            // 检测无序列表：- （单独一个减号）
            if (!preset && beforeCursor === '-') {
                preset = 'ul';
                content = '';
            }
            // 检测有序列表：1. （数字加点）
            else if (!preset && /^\d+\.$/.test(beforeCursor)) {
                preset = 'ol';
                content = '';
            }

            if (preset) {
                event.preventDefault();

                // 标题处理
                if (preset.startsWith('h')) {
                    if (content) {
                        // 已经有内容：删除标记，选中内容，格式化
                        const startPos = cursorPos - beforeCursor.length;
                        textNode.textContent = text.substring(0, startPos) + content + text.substring(cursorPos);

                        // 同步并渲染
                        syncPreviewToCode();
                        renderPreview();

                        // 查找并选中内容
                        setTimeout(() => {
                            const walker = document.createTreeWalker(elements.preview, NodeFilter.SHOW_TEXT, null);
                            let foundNode = null;
                            let node;
                            while (node = walker.nextNode()) {
                                if (node.textContent.includes(content)) {
                                    foundNode = node;
                                    break;
                                }
                            }

                            if (foundNode) {
                                const contentIndex = foundNode.textContent.indexOf(content);
                                const range = document.createRange();
                                range.setStart(foundNode, contentIndex);
                                range.setEnd(foundNode, contentIndex + content.length);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                                applyPreset(preset);
                            }
                        }, 20);
                    } else {
                        // 没有内容：删除 #，直接调用 applyPreset 创建空 segment
                        const startPos = cursorPos - beforeCursor.length;
                        textNode.textContent = text.substring(0, startPos) + text.substring(cursorPos);

                        // 设置光标到删除 # 后的位置
                        const range = document.createRange();
                        range.setStart(textNode, startPos);
                        range.collapse(true);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);

                        // 直接调用 applyPreset，它会创建空的 segment
                        setTimeout(() => {
                            applyPreset(preset);
                        }, 10);
                    }

                    return;
                }
                // 列表：删除标记，调用 applyPreset
                else if (preset === 'ul') {
                    // 删除 "-"
                    textNode.textContent = text.substring(0, cursorPos - beforeCursor.length) + '• ' + text.substring(cursorPos);

                    // 同步到代码
                    syncPreviewToCode();
                    renderPreview();

                    // 移动光标到符号后
                    setTimeout(() => {
                        moveCursorToEnd(elements.preview);
                    }, 10);

                    return;
                }
                else if (preset === 'ol') {
                    // 保留数字
                    const num = beforeCursor.match(/^(\d+)/)[1];
                    const newText = num + '. ';
                    textNode.textContent = text.substring(0, cursorPos - beforeCursor.length) + newText + text.substring(cursorPos);

                    // 同步到代码
                    syncPreviewToCode();
                    renderPreview();

                    // 移动光标到符号后
                    setTimeout(() => {
                        moveCursorToEnd(elements.preview);
                    }, 10);

                    return;
                }

                return;
            }
        }

        // Enter键处理 - 换行并跳出格式化片段
        if (event.key === 'Enter') {
            event.preventDefault();

            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);

            // 检查光标位置
            let container = range.startContainer;
            let formattedSpan = null;

            // 查找是否在格式化片段内
            let node = container;
            while (node && node !== elements.preview) {
                if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                    formattedSpan = node;
                    break;
                }
                node = node.parentNode;
            }

            if (formattedSpan) {
                // 在格式化片段内：需要跳出格式

                // 如果光标在span的末尾，直接在span后插入换行
                const atEnd = range.endOffset === (container.nodeType === Node.TEXT_NODE ? container.length : container.childNodes.length);

                if (atEnd && (container === formattedSpan || container.parentNode === formattedSpan)) {
                    // 在span末尾：在span外插入换行
                    const br = document.createElement('br');
                    const placeholder = document.createTextNode('');

                    if (formattedSpan.nextSibling) {
                        formattedSpan.parentNode.insertBefore(br, formattedSpan.nextSibling);
                        formattedSpan.parentNode.insertBefore(placeholder, br.nextSibling);
                    } else {
                        formattedSpan.parentNode.appendChild(br);
                        formattedSpan.parentNode.appendChild(placeholder);
                    }

                    // 移动光标到新文本节点
                    range.setStart(placeholder, 0);
                    range.collapse(true);

                } else {
                    // 在span中间：分割span
                    const currentContent = formattedSpan.textContent;
                    const cursorPos = range.startOffset;

                    // 获取光标位置相对于span的偏移
                    let offset = 0;
                    if (container.nodeType === Node.TEXT_NODE) {
                        // 计算文本节点在span中的位置
                        let node = formattedSpan.firstChild;
                        while (node && node !== container) {
                            if (node.nodeType === Node.TEXT_NODE) {
                                offset += node.length;
                            }
                            node = node.nextSibling;
                        }
                        offset += cursorPos;
                    }

                    const beforeText = currentContent.substring(0, offset);
                    const afterText = currentContent.substring(offset);

                    // 更新当前span的内容
                    formattedSpan.textContent = beforeText;

                    // 创建换行
                    const br = document.createElement('br');
                    formattedSpan.parentNode.insertBefore(br, formattedSpan.nextSibling);

                    // 如果后面还有内容，创建新的纯文本节点
                    if (afterText) {
                        const textNode = document.createTextNode(afterText);
                        formattedSpan.parentNode.insertBefore(textNode, br.nextSibling);
                        range.setStart(textNode, 0);
                    } else {
                        const placeholder = document.createTextNode('');
                        formattedSpan.parentNode.insertBefore(placeholder, br.nextSibling);
                        range.setStart(placeholder, 0);
                    }

                    range.collapse(true);
                }

            } else {
                // 在普通文本或预览区根节点：正常换行
                range.deleteContents();

                const br = document.createElement('br');
                range.insertNode(br);

                // 插入占位文本节点
                const placeholder = document.createTextNode('');
                if (br.nextSibling) {
                    br.parentNode.insertBefore(placeholder, br.nextSibling);
                } else {
                    br.parentNode.appendChild(placeholder);
                }

                // 移动光标到换行后
                range.setStart(placeholder, 0);
                range.collapse(true);
            }

            selection.removeAllRanges();
            selection.addRange(range);

            // 同步到代码
            setTimeout(() => syncPreviewToCode(), 0);
        }
        // Backspace 和 Delete 键 - 删除后清理空片段并移出光标
        else if (event.key === 'Backspace' || event.key === 'Delete') {
            setTimeout(() => {
                cleanEmptySegments();

                // 确保光标不在空的格式化片段中
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    let node = range.startContainer;

                    // 查找是否在格式化片段内
                    let formattedSpan = null;
                    while (node && node !== elements.preview) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                            formattedSpan = node;
                            break;
                        }
                        node = node.parentNode;
                    }

                    // 如果在空的格式化片段中，移出去
                    if (formattedSpan && !formattedSpan.textContent.trim()) {
                        console.log('Cursor in empty formatted span after delete, moving out');
                        const textNode = document.createTextNode('');
                        if (formattedSpan.nextSibling) {
                            formattedSpan.parentNode.insertBefore(textNode, formattedSpan.nextSibling);
                        } else {
                            formattedSpan.parentNode.appendChild(textNode);
                        }
                        range.setStart(textNode, 0);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);

                        // 删除空片段
                        const segmentId = parseInt(formattedSpan.getAttribute('data-segment-id'));
                        delete segmentMap[segmentId];
                        formattedSpan.remove();
                    }
                }

                syncPreviewToCode();
            }, 10);
        }
    }

    /**
     * 应用预设格式方案
     * @param {string} presetName - 预设名称
     * @param {string|null} targetText - 可选，指定要格式化的文本（用于 Markdown）
     * @returns {number|null} 创建的 segment ID
     */
    function applyPreset(presetName, targetText = null) {
        const preset = presets[presetName];
        if (!preset) return null;

        // 在函数开始就构建 formatCode，所有分支都能用
        const formatCode = buildFormatCode(preset);

        if (currentMode === 'code') {
            // 代码模式：包裹选中文本
            const textarea = elements.editor;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);

            if (selectedText.trim() === '') {
                alert('请先选择要格式化的文本');
                return null;
            }

            // 列表特殊处理
            if (presetName === 'ul') {
                const lines = selectedText.split('\n');
                const newText = lines.map(line => line.trim() ? `• ${line}` : line).join('\n');
                textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
                return null;
            } else if (presetName === 'ol') {
                const lines = selectedText.split('\n').filter(l => l.trim());
                const newText = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
                textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
                return null;
            }

            const formattedText = `#f(${formatCode})${selectedText}#l`;
            textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
            return null;

        } else {
            // 预览模式
            const selection = window.getSelection();

            // 如果指定了目标文本（Markdown 调用），直接格式化
            if (targetText !== null) {
                syncPreviewToCode();
                let code = elements.editor.value;

                // 查找目标文本
                const textIndex = code.indexOf(targetText);
                if (textIndex === -1) return null;

                const before = code.substring(0, textIndex);
                const after = code.substring(textIndex + targetText.length);
                const formattedCode = `#f(${formatCode})${targetText}#l`;

                elements.editor.value = before + formattedCode + after;
                const lastSegmentId = renderPreview();

                return lastSegmentId;
            }

            // 根据光标位置查找所在的 segment
            if (!selection.rangeCount) {
                console.log('没有光标位置');
                return null;
            }

            let targetSpan = null;
            let node = selection.anchorNode;

            if (node && node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode;
            }

            while (node && node !== elements.preview) {
                if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                    targetSpan = node;
                    break;
                }
                node = node.parentNode;
            }

            if (!targetSpan) {
                // 光标不在格式化文本上，检查是否有选中纯文本
                const range = selection.getRangeAt(0);
                const selectedText = range.toString();

                if (selectedText && selectedText.trim().length > 0) {
                    // 有选中纯文本，添加格式

                    // 先同步代码并重新渲染，更新 segmentMap
                    syncPreviewToCode();
                    renderPreview(); // 这会重新计算所有 segment 的位置

                    let code = elements.editor.value;

                    // 在代码中查找选中的文本
                    // 从最后一个 segment 之后开始查找
                    let searchStart = 0;
                    const segmentIds = Object.keys(segmentMap).map(Number).sort((a, b) => {
                        const segA = segmentMap[a];
                        const segB = segmentMap[b];
                        return segA.start - segB.start;
                    });

                    if (segmentIds.length > 0) {
                        // 找到最后一个 segment 的结束位置
                        const lastSegId = segmentIds[segmentIds.length - 1];
                        searchStart = segmentMap[lastSegId].end;
                    }

                    const textIndex = code.indexOf(selectedText, searchStart);
                    if (textIndex === -1) {
                        console.log('无法在代码中找到选中的文本');
                        return null;
                    }

                    const position = { start: textIndex, end: textIndex + selectedText.length };

                    // 验证选中的文本是否匹配
                    const actualText = code.substring(position.start, position.end);
                    if (actualText !== selectedText) {
                        console.log('位置计算错误');
                        return null;
                    }

                    // 替换选中的文本为格式化文本
                    const before = code.substring(0, position.start);
                    const after = code.substring(position.end);
                    const formattedCode = `#f(${formatCode})${selectedText}#l`;

                    elements.editor.value = before + formattedCode + after;
                    const lastSegmentId = renderPreview();

                    // 更新 currentSegmentId
                    currentSegmentId = lastSegmentId;

                    setTimeout(() => updateToolbarState(), 10);
                    return lastSegmentId;
                } else {
                    // 没有选中文本，在代码末尾创建一个带格式的空段落
                    syncPreviewToCode();

                    // 根据格式类型确定占位符文本
                    let placeholderText = '';
                    switch (presetName) {
                        case 'h1':
                        case 'h2':
                        case 'h3':
                        case 'h4':
                            placeholderText = '在此输入标题';
                            break;
                        case 'bold':
                            placeholderText = '粗体文本';
                            break;
                        case 'underline':
                            placeholderText = '下划线文本';
                            break;
                        case 'strike':
                            placeholderText = '删除线文本';
                            break;
                        case 'glow':
                            placeholderText = '发光文本';
                            break;
                        case 'shadow':
                            placeholderText = '阴影文本';
                            break;
                        default:
                            placeholderText = '在此输入文本';
                    }

                    const formattedCode = `#f(${formatCode})${placeholderText}#l`;

                    // 在代码末尾添加
                    elements.editor.value += formattedCode;

                    // 渲染预览
                    const lastSegmentId = renderPreview();
                    currentSegmentId = lastSegmentId;

                    // 移动光标到新创建的 segment
                    setTimeout(() => {
                        const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${lastSegmentId}"]`);
                        if (newSegmentSpan && newSegmentSpan.firstChild) {
                            const range = document.createRange();
                            const textNode = newSegmentSpan.firstChild;
                            range.setStart(textNode, 0);
                            range.setEnd(textNode, textNode.length); // 选中所有文本
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                        updateToolbarState();
                    }, 10);

                    return lastSegmentId;
                }

                console.log('光标不在格式化文本上且没有选中文本');
                return null;
            }

            const segmentId = parseInt(targetSpan.getAttribute('data-segment-id'));
            const segment = segmentMap[segmentId];

            if (!segment) return null;

            // 检查是否有选区内容
            const range = selection.getRangeAt(0);
            const selectedText = range.toString();
            const hasSelection = selectedText && selectedText.length > 0 && !selection.isCollapsed;

            // 如果有选区且不是整个 segment，需要分离选中部分
            if (hasSelection && selectedText !== segment.content) {
                // 同步预览到代码，确保获取最新状态
                syncPreviewToCode();

                // 重新获取 segment 信息（因为 syncPreviewToCode 可能更新了 segmentMap）
                const updatedSegment = segmentMap[segmentId];
                if (!updatedSegment) return null;

                // 计算选区在文本节点中的位置
                const textNode = range.startContainer;
                if (textNode.nodeType !== Node.TEXT_NODE) return null;

                const segmentStartOffset = range.startOffset;
                const segmentEndOffset = range.endOffset;

                // 分离选中的部分
                const before = updatedSegment.content.substring(0, segmentStartOffset);
                const selected = updatedSegment.content.substring(segmentStartOffset, segmentEndOffset);
                const after = updatedSegment.content.substring(segmentEndOffset);

                // 构建新代码
                let code = elements.editor.value;
                const oldFormats = parseFormatCodes(updatedSegment.format);
                const newFormats = { ...oldFormats };

                // 应用预设格式
                switch (presetName) {
                    case 'h1':
                    case 'h2':
                    case 'h3':
                    case 'h4':
                        if (oldFormats.s === preset.s) {
                            delete newFormats.s;
                            if (!oldFormats.o || oldFormats.o === preset.o) {
                                delete newFormats.o;
                                delete newFormats.O;
                            }
                        } else {
                            Object.assign(newFormats, preset);
                        }
                        break;
                    case 'bold':
                        const textColor = oldFormats.c || '000000'; // 默认黑色
                        const hasBold = oldFormats.b === '1'; // 使用 b 属性标记加粗
                        if (hasBold) {
                            delete newFormats.b;
                            delete newFormats.o;
                            delete newFormats.O;
                        } else {
                            newFormats.b = '1'; // 标记为加粗
                            newFormats.o = textColor;
                            newFormats.O = '1';
                        }
                        break;
                    case 'underline':
                        if (oldFormats.u) {
                            delete newFormats.u;
                        } else {
                            newFormats.u = preset.u;
                        }
                        break;
                    case 'strike':
                        if (oldFormats.h) {
                            delete newFormats.h;
                        } else {
                            newFormats.h = preset.h;
                        }
                        break;
                    case 'glow':
                        if (oldFormats.g) {
                            delete newFormats.g;
                            delete newFormats.G;
                        } else {
                            Object.assign(newFormats, preset);
                        }
                        break;
                    case 'shadow':
                        if (oldFormats.y) {
                            delete newFormats.y;
                            delete newFormats.Y;
                        } else {
                            Object.assign(newFormats, preset);
                        }
                        break;
                }

                // 构建新代码
                let newCode = '';
                const oldFormatCode = updatedSegment.format;
                const newFormatCode = buildFormatCode(newFormats);

                // before 部分（如果存在）
                if (before) {
                    newCode += `#f(${oldFormatCode})${before}#l`;
                }

                // selected 部分（新格式）
                if (Object.keys(newFormats).length > 0) {
                    newCode += `#f(${newFormatCode})${selected}#l`;
                } else {
                    newCode += selected; // 无格式
                }

                // after 部分（如果存在）
                if (after) {
                    newCode += `#f(${oldFormatCode})${after}#l`;
                }

                // 先改代码
                elements.editor.value = code.substring(0, updatedSegment.start) + newCode + code.substring(updatedSegment.end);

                // 再渲染
                renderPreview();

                setTimeout(() => updateToolbarState(), 10);

                return null;
            }

            // 没有选区或选中整个 segment，修改整个 segment
            if (segment) {
                const oldFormats = parseFormatCodes(segment.format);
                const newFormats = { ...oldFormats };

                // 根据预设类型判断是否要移除或添加
                switch (presetName) {
                    case 'h1':
                    case 'h2':
                    case 'h3':
                    case 'h4':
                        // 如果已有相同大小，移除字号相关
                        if (oldFormats.s === preset.s) {
                            delete newFormats.s;
                            // 只删除标题相关的描边，保留其他描边（如加粗）
                            if (!oldFormats.o || oldFormats.o === preset.o) {
                                delete newFormats.o;
                                delete newFormats.O;
                            }
                        } else {
                            // 应用新标题（覆盖字号，但保留其他格式如下划线）
                            Object.assign(newFormats, preset);
                        }
                        break;

                    case 'bold':
                        // 切换加粗：使用当前文字颜色作为描边颜色
                        const textColor = oldFormats.c || '000000'; // 获取实际文字颜色，默认黑色
                        const hasBold = oldFormats.b === '1';
                        if (hasBold) {
                            // 移除加粗
                            delete newFormats.b;
                            delete newFormats.o;
                            delete newFormats.O;
                        } else {
                            // 添加加粗（使用实际文字颜色）
                            newFormats.b = '1';
                            newFormats.o = textColor;
                            newFormats.O = '1';
                        }
                        break;

                    case 'underline':
                        if (oldFormats.u) {
                            delete newFormats.u;
                            delete newFormats.u_mark;
                        } else {
                            newFormats.u = preset.u;
                            newFormats.u_mark = '1';
                        }
                        break;

                    case 'strike':
                        if (oldFormats.h) {
                            delete newFormats.h;
                            delete newFormats.h_mark;
                        } else {
                            newFormats.h = preset.h;
                            newFormats.h_mark = '1';
                        }
                        break;

                    case 'glow':
                        if (oldFormats.g) {
                            delete newFormats.g;
                            delete newFormats.G;
                        } else {
                            Object.assign(newFormats, preset);
                        }
                        break;

                    case 'shadow':
                        if (oldFormats.y) {
                            delete newFormats.y;
                            delete newFormats.Y;
                        } else {
                            Object.assign(newFormats, preset);
                        }
                        break;
                }

                // 获取代码
                const code = elements.editor.value;
                const oldFormatText = code.substring(segment.start, segment.end);

                // 如果所有格式都被移除，恢复为纯文本
                let newText;
                if (Object.keys(newFormats).length === 0) {
                    newText = segment.content;
                } else {
                    // 构建新的格式代码
                    const newFormatCode = buildFormatCode(newFormats);
                    newText = `#f(${newFormatCode})${segment.content}#l`;
                }

                // 替换代码中的文本
                elements.editor.value = code.substring(0, segment.start) + newText + code.substring(segment.end);

                // 重新渲染（会自动更新 segmentMap）
                renderPreview();

                // 延迟更新工具栏状态（等待浏览器处理选区）
                setTimeout(() => updateToolbarState(), 10);

                return null;
            }

            return null;
        }
    }

    /**
     * 移除格式（清除选中片段的格式）
     */
    function removeFormat() {
        if (currentMode === 'code') {
            alert('请在预览模式下选择要清除格式的文本');
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) {
            alert('请在预览区域选择要清除格式的文本');
            return;
        }

        let targetSpan = null;
        let node = selection.anchorNode;

        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                targetSpan = node;
                break;
            }
            node = node.parentNode;
        }

        if (!targetSpan) {
            alert('请选择已格式化的文本片段');
            return;
        }

        const segmentId = parseInt(targetSpan.getAttribute('data-segment-id'));
        const segment = segmentMap[segmentId];

        if (!segment) {
            return;
        }

        // 替换为纯文本（移除格式代码）
        const code = elements.editor.value;
        const before = code.substring(0, segment.start);
        const after = code.substring(segment.end);

        elements.editor.value = before + segment.content + after;

        renderPreview();
    }

    /**
     * 打开编辑器
     */
    function open(fieldId, initialValue = '', callback = null) {
        if (!elements.modal || !elements.editor || !elements.preview) {
            console.error('富文本编辑器尚未加载完成');
            return;
        }

        currentFieldId = fieldId;
        onConfirmCallback = callback;

        // 重置 ID 计数器和映射
        nextSegmentId = 1;
        segmentMap = {};

        // 转换 \\n 为真实换行符
        const displayValue = initialValue.replace(/\\n/g, '\n');

        // 设置代码编辑器内容
        elements.editor.value = displayValue;

        // 默认预览模式
        switchMode('preview');

        // 显示模态框
        const modal = new bootstrap.Modal(elements.modal);
        modal.show();
    }

    /**
     * 切换编辑模式
     */
    function switchMode(mode) {
        currentMode = mode;

        // 更新按钮状态
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // 更新容器显示模式
        elements.container.setAttribute('data-mode', mode);

        // 如果切换到预览或分屏，渲染预览
        if (mode === 'preview' || mode === 'split') {
            renderPreview();
        }
    }

    /**
     * 渲染预览（核心函数：代码 → HTML）
     */
    /**
     * 渲染预览
     * @returns {number|null} 最后创建的 segment ID
     */
    function renderPreview() {
        const code = elements.editor.value;
        
        segmentMap = {}; // 重置映射
        nextSegmentId = 1;

        let html = '';
        let pos = 0;
        let lastSegmentId = null;

        while (pos < code.length) {
            // 查找格式化标记
            const formatStart = code.indexOf('#f(', pos);

            if (formatStart === -1) {
                // 没有更多格式化文本，剩余部分作为普通文本
                const plainText = code.substring(pos);
                html += escapeHtml(plainText).replace(/\n/g, '<br>');
                break;
            }

            // 添加格式化标记之前的普通文本
            if (formatStart > pos) {
                const plainText = code.substring(pos, formatStart);
                html += escapeHtml(plainText).replace(/\n/g, '<br>');
            }

            // 解析格式化文本
            const closeParenPos = code.indexOf(')', formatStart + 3);
            if (closeParenPos === -1) {
                // 格式错误，剩余部分作为普通文本
                const plainText = code.substring(formatStart);
                html += escapeHtml(plainText).replace(/\n/g, '<br>');
                break;
            }

            const formatStr = code.substring(formatStart + 3, closeParenPos);
            const contentStart = closeParenPos + 1;
            const endMarkerPos = code.indexOf('#l', contentStart);

            if (endMarkerPos === -1) {
                // 格式错误，剩余部分作为普通文本
                const plainText = code.substring(formatStart);
                html += escapeHtml(plainText).replace(/\n/g, '<br>');
                break;
            }

            const content = code.substring(contentStart, endMarkerPos);
            const segmentId = nextSegmentId++;
            lastSegmentId = segmentId; // 记录最后的 ID

            // 保存映射
            segmentMap[segmentId] = {
                start: formatStart,
                end: endMarkerPos + 2,
                format: formatStr,
                content: content
            };

            // 生成 HTML
            const styles = parseFormatToStyles(formatStr);
            const styleString = Object.entries(styles)
                .map(([k, v]) => {
                    let cssKey = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                    if (cssKey.startsWith('webkit-')) cssKey = '-' + cssKey;
                    return `${cssKey}: ${v}`;
                })
                .join('; ');

            const escapedContent = escapeHtml(content).replace(/\n/g, '<br>');
            html += `<span data-segment-id="${segmentId}" style="${styleString}">${escapedContent}</span>`;

            pos = endMarkerPos + 2;
        }

        elements.preview.innerHTML = html;
        return lastSegmentId;
    }

    /**
     * 解析格式代码为 CSS 样式对象
     */
    function parseFormatToStyles(formatStr) {
        const styles = {};
        const codes = formatStr.split('|');

        for (const code of codes) {
            const [key, value] = code.split(':');

            switch (key) {
                case 'c': // 颜色
                    styles.color = `#${value}`;
                    break;
                case 's': // 字号
                    styles.fontSize = `${value}px`;
                    break;
                case 'o': // 描边颜色
                    const outlineSize = styles.webkitTextStroke?.match(/(\d+)px/)?.[1] || '1';
                    styles.webkitTextStroke = `${outlineSize}px #${value}`;
                    break;
                case 'O': // 描边大小
                    const outlineColor = styles.webkitTextStroke?.match(/#[0-9a-f]{6}/i)?.[0] || '#000000';
                    styles.webkitTextStroke = `${value}px ${outlineColor}`;
                    break;
                case 'g': // 发光颜色
                    const glowSize = styles.textShadow?.match(/(\d+\.?\d*)px/)?.[1] || '5';
                    styles.textShadow = `0 0 ${glowSize}px #${value}`;
                    break;
                case 'G': // 发光大小
                    const glowColor = styles.textShadow?.match(/#[0-9a-f]{6}/i)?.[0] || '#ffffff';
                    const glowPx = parseFloat(value) * 10;
                    styles.textShadow = `0 0 ${glowPx}px ${glowColor}`;
                    break;
                case 'y': // 阴影颜色
                    const shadowOffset = styles.textShadow?.match(/(-?\d+)px (-?\d+)px/);
                    const offsetX = shadowOffset ? shadowOffset[1] : '2';
                    const offsetY = shadowOffset ? shadowOffset[2] : '2';
                    styles.textShadow = `${offsetX}px ${offsetY}px 0 #${value}`;
                    break;
                case 'Y': // 阴影偏移
                    const [x, y] = value.split(',');
                    const shadowColor = styles.textShadow?.match(/#[0-9a-f]{6}/i)?.[0] || '#000000';
                    styles.textShadow = `${x}px ${y}px 0 ${shadowColor}`;
                    break;
                case 'h': // 删除线
                    styles.textDecoration = (styles.textDecoration || '') + ' line-through';
                    styles.textDecorationColor = `#${value}`;
                    break;
                case 'u': // 下划线
                    styles.textDecoration = (styles.textDecoration || '') + ' underline';
                    styles.textDecorationColor = `#${value}`;
                    break;
            }
        }

        return styles;
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 自动应用格式（任何格式输入改变时调用）
     * 只应用当前改变的格式，保留原有其他格式
     */
    function autoApply(event) {
        // 预览/分屏模式下，自动更新选中片段
        if (currentMode === 'code') {
            return; // 代码模式不自动应用
        }

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            return;
        }

        // 获取当前改变的格式类型和值
        const changedFormat = getChangedFormat(event.target);
        if (!changedFormat) {
            return;
        }

        // 查找选中文本所在的 span[data-segment-id]
        let targetSpan = null;
        let node = selection.anchorNode;

        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                targetSpan = node;
                break;
            }
            node = node.parentNode;
        }

        if (targetSpan) {
            // 修改已格式化片段
            const segmentId = parseInt(targetSpan.getAttribute('data-segment-id'));
            const segment = segmentMap[segmentId];

            if (!segment) {
                return;
            }

            // 解析原有格式代码
            const oldFormats = parseFormatCodes(segment.format);

            // 更新对应的格式代码
            oldFormats[changedFormat.type] = changedFormat.value;

            // 重新构建格式代码字符串
            const newFormatCode = buildFormatCode(oldFormats);
            const newFormattedText = `#f(${newFormatCode})${segment.content}#l`;

            // 替换代码
            const code = elements.editor.value;
            const before = code.substring(0, segment.start);
            const after = code.substring(segment.end);
            elements.editor.value = before + newFormattedText + after;

            // 重新渲染预览并保持选区
            renderPreview();
            restoreSelection(segmentId);

        } else {
            // 新文本：创建新的格式化片段
            const range = selection.getRangeAt(0);
            const selectedText = range.toString().trim();

            if (!selectedText) {
                return;
            }

            // 只包含当前改变的格式
            const formats = {};
            formats[changedFormat.type] = changedFormat.value;
            const formatCode = buildFormatCode(formats);
            const segmentId = nextSegmentId++;

            // 创建新的格式化 span
            const span = document.createElement('span');
            span.setAttribute('data-segment-id', segmentId);
            span.textContent = selectedText;

            // 应用样式
            const styles = parseFormatToStyles(formatCode);
            Object.assign(span.style, styles);

            // 替换选中内容
            range.deleteContents();
            range.insertNode(span);

            // 保存映射
            segmentMap[segmentId] = {
                start: -1,
                end: -1,
                format: formatCode,
                content: selectedText
            };

            // 同步到代码
            syncPreviewToCode();

            // 重新选中新创建的span
            restoreSelection(segmentId);
        }
    }

    /**
     * 解析格式代码字符串为对象
     */
    function parseFormatCodes(formatStr) {
        const formats = {};
        const codes = formatStr.split('|');

        for (const code of codes) {
            const [key, value] = code.split(':');
            formats[key] = value;
        }

        return formats;
    }

    /**
     * 根据改变的输入元素，获取改变的格式类型和值
     */
    function getChangedFormat(target) {
        const id = target.id;

        // 标题
        if (id === 'richtext-heading') {
            const value = target.value;
            if (value === 'normal') return null;
            const sizes = { h1: 40, h2: 32, h3: 24, h4: 18 };
            return { type: 's', value: sizes[value] };
        }

        // 大小
        if (id === 'richtext-size' || id === 'richtext-size-slider') {
            const size = document.getElementById('richtext-size').value.trim();
            if (!size || isNaN(size) || parseInt(size) <= 0) return null;
            return { type: 's', value: size };
        }

        // 颜色
        if (id === 'richtext-color-picker' || id === 'richtext-color-hex') {
            const color = document.getElementById('richtext-color-hex').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'c', value: color.toLowerCase() };
        }

        // 描边颜色
        if (id === 'richtext-outline-color-picker' || id === 'richtext-outline-color') {
            const color = document.getElementById('richtext-outline-color').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'o', value: color.toLowerCase() };
        }

        // 描边大小
        if (id === 'richtext-outline-size' || id === 'richtext-outline-size-slider') {
            const size = document.getElementById('richtext-outline-size').value.trim();
            if (!size || isNaN(size) || parseFloat(size) <= 0) return null;
            return { type: 'O', value: size };
        }

        // 发光颜色
        if (id === 'richtext-glow-color-picker' || id === 'richtext-glow-color') {
            const color = document.getElementById('richtext-glow-color').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'g', value: color.toLowerCase() };
        }

        // 发光大小
        if (id === 'richtext-glow-size' || id === 'richtext-glow-size-slider') {
            const size = document.getElementById('richtext-glow-size').value.trim();
            if (!size || isNaN(size) || parseFloat(size) <= 0) return null;
            return { type: 'G', value: parseFloat(size).toFixed(3) };
        }

        // 阴影颜色
        if (id === 'richtext-shadow-color-picker' || id === 'richtext-shadow-color') {
            const color = document.getElementById('richtext-shadow-color').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'y', value: color.toLowerCase() };
        }

        // 阴影偏移
        if (id === 'richtext-shadow-x' || id === 'richtext-shadow-y') {
            const x = document.getElementById('richtext-shadow-x').value.trim();
            const y = document.getElementById('richtext-shadow-y').value.trim();
            if (!x || !y || isNaN(x) || isNaN(y)) return null;
            return { type: 'Y', value: `${x},${y}` };
        }

        // 下划线颜色
        if (id === 'richtext-underline-color-picker' || id === 'richtext-underline-color') {
            const color = document.getElementById('richtext-underline-color').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'u', value: color.toLowerCase() };
        }

        // 删除线颜色
        if (id === 'richtext-strike-color-picker' || id === 'richtext-strike-color') {
            const color = document.getElementById('richtext-strike-color').value.trim();
            if (!color || !/^[0-9A-Fa-f]{6}$/.test(color)) return null;
            return { type: 'h', value: color.toLowerCase() };
        }

        return null;
    }

    /**
     * 从格式对象构建格式代码字符串
     */
    function buildFormatCode(formats) {
        const codes = [];
        const order = ['c', 's', 'o', 'O', 'g', 'G', 'y', 'Y', 'u', 'h', 'b', 'u_mark', 'h_mark'];

        for (const key of order) {
            if (formats[key] !== null && formats[key] !== undefined && formats[key] !== '') {
                codes.push(`${key}:${formats[key]}`);
            }
        }

        return codes.join('|');
    }

    /**
     * 恢复对指定片段的选区
     */
    function restoreSelection(segmentId) {
        // 在下一帧执行，确保DOM已更新
        requestAnimationFrame(() => {
            const targetSpan = elements.preview.querySelector(`[data-segment-id="${segmentId}"]`);
            if (targetSpan) {
                const range = document.createRange();
                range.selectNodeContents(targetSpan);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });
    }

    /**
     * 收集格式代码
     */
    function collectFormatCodes() {
        const codes = [];

        // 标题
        const heading = document.getElementById('richtext-heading')?.value;
        if (heading && heading !== 'normal') {
            const sizes = { h1: 40, h2: 32, h3: 24, h4: 18 };
            codes.push(`s:${sizes[heading]}`);
        }

        // 大小
        const size = document.getElementById('richtext-size')?.value.trim();
        if (size && !isNaN(size) && parseInt(size) > 0) {
            codes.push(`s:${size}`);
        }

        // 颜色
        const color = document.getElementById('richtext-color-hex')?.value.trim();
        if (color && /^[0-9A-Fa-f]{6}$/.test(color)) {
            codes.push(`c:${color.toLowerCase()}`);
        }

        // 描边
        const outlineSize = document.getElementById('richtext-outline-size')?.value.trim();
        if (outlineSize && !isNaN(outlineSize) && parseFloat(outlineSize) > 0) {
            const outlineColor = document.getElementById('richtext-outline-color')?.value.trim();
            if (outlineColor && /^[0-9A-Fa-f]{6}$/.test(outlineColor)) {
                codes.push(`o:${outlineColor.toLowerCase()}`);
            }
            codes.push(`O:${outlineSize}`);
        }

        // 发光
        const glowSize = document.getElementById('richtext-glow-size')?.value.trim();
        if (glowSize && !isNaN(glowSize) && parseFloat(glowSize) > 0) {
            const glowColor = document.getElementById('richtext-glow-color')?.value.trim();
            if (glowColor && /^[0-9A-Fa-f]{6}$/.test(glowColor)) {
                codes.push(`g:${glowColor.toLowerCase()}`);
            }
            codes.push(`G:${parseFloat(glowSize).toFixed(3)}`);
        }

        // 阴影
        const shadowX = document.getElementById('richtext-shadow-x')?.value.trim();
        const shadowY = document.getElementById('richtext-shadow-y')?.value.trim();
        if (shadowX && shadowY && !isNaN(shadowX) && !isNaN(shadowY) &&
            (parseFloat(shadowX) !== 0 || parseFloat(shadowY) !== 0)) {
            const shadowColor = document.getElementById('richtext-shadow-color')?.value.trim();
            if (shadowColor && /^[0-9A-Fa-f]{6}$/.test(shadowColor)) {
                codes.push(`y:${shadowColor.toLowerCase()}`);
            }
            codes.push(`Y:${shadowX},${shadowY}`);
        }

        // 下划线
        const underlineColor = document.getElementById('richtext-underline-color')?.value.trim();
        if (underlineColor && /^[0-9A-Fa-f]{6}$/.test(underlineColor)) {
            codes.push(`u:${underlineColor.toLowerCase()}`);
        }

        // 删除线
        const strikeColor = document.getElementById('richtext-strike-color')?.value.trim();
        if (strikeColor && /^[0-9A-Fa-f]{6}$/.test(strikeColor)) {
            codes.push(`h:${strikeColor.toLowerCase()}`);
        }

        return codes;
    }

    /**
     * 确认编辑
     */
    function confirm() {
        // 获取代码，转换真实换行为 \\n
        let finalValue = elements.editor.value;
        finalValue = finalValue.replace(/\n/g, '\\n');

        // 回调
        if (onConfirmCallback) {
            onConfirmCallback(currentFieldId, finalValue);
        }

        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(elements.modal);
        if (modal) {
            modal.hide();
        }
    }

    /**
     * 切换高级格式次级面板
     */
    function toggleAdvancedPanel(panelType) {
        const panel = document.getElementById('advanced-panel');
        const panelContent = panel.querySelector(`[data-panel="${panelType}"]`);

        if (!panel || !panelContent) return;

        // 如果当前面板已显示，则隐藏
        const isCurrentlyVisible = panelContent.style.display !== 'none';

        // 隐藏所有面板内容
        panel.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');

        if (isCurrentlyVisible) {
            // 关闭面板
            panel.style.display = 'none';

            // 清理选区变化监听器
            if (window._sizeSliderListener) {
                document.removeEventListener('selectionchange', window._sizeSliderListener);
                window._sizeSliderListener = null;
            }
        } else {
            // 显示选中的面板
            panel.style.display = 'block';
            panelContent.style.display = 'flex';

            // 初始化滑块值显示
            initializePanelInputs(panelType);
        }
    }

    /**
     * 初始化面板输入控件
     */
    let currentEditingSegmentId = null; // 保存当前正在编辑的 segment ID
    let isAdjustingSlider = false; // 标记是否正在调整滑块

    function initializePanelInputs(panelType) {
        if (panelType === 'size') {
            const slider = document.getElementById('size-slider');
            const valueSpan = document.getElementById('size-value');

            // 打开面板时读取当前选中 segment 的字号
            const selection = window.getSelection();

            if (selection.rangeCount > 0) {
                let node = selection.anchorNode;

                // 如果是文本节点，获取父节点
                if (node && node.nodeType === Node.TEXT_NODE) {
                    node = node.parentNode;
                }

                // 查找所在的 segment
                while (node && node !== elements.preview) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                        const segmentId = parseInt(node.getAttribute('data-segment-id'));
                        const segment = segmentMap[segmentId];
                        if (segment && segment.format) {
                            const formats = parseFormatCodes(segment.format);
                            if (formats.s) {
                                slider.value = formats.s;
                                valueSpan.textContent = formats.s;
                            }
                        }
                        break;
                    }
                    node = node.parentNode;
                }
            }

            // 实时更新数值显示和应用格式
            slider.oninput = () => {
                isAdjustingSlider = true; // 标记正在调整
                valueSpan.textContent = slider.value;
                applySizeToCurrentSegment(slider.value);
            };

            slider.onchange = () => {
                applySizeToCurrentSegment(slider.value);
                setTimeout(() => {
                    isAdjustingSlider = false; // 调整完成后重置标志
                }, 100);
            };

            // 监听选区变化，实时更新滑块值
            const updateSliderFromSelection = () => {
                // 如果正在调整滑块，不要更新滑块值
                if (isAdjustingSlider) return;

                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                let node = selection.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) {
                    node = node.parentNode;
                }

                while (node && node !== elements.preview) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                        const segmentId = parseInt(node.getAttribute('data-segment-id'));
                        const segment = segmentMap[segmentId];
                        if (segment && segment.format) {
                            const formats = parseFormatCodes(segment.format);
                            if (formats.s) {
                                slider.value = formats.s;
                                valueSpan.textContent = formats.s;
                            }
                        }
                        break;
                    }
                    node = node.parentNode;
                }
            };

            // 保存监听器引用以便清理
            if (!window._sizeSliderListener) {
                window._sizeSliderListener = updateSliderFromSelection;
                document.addEventListener('selectionchange', window._sizeSliderListener);
            }
        } else if (panelType === 'outline') {
            const slider = document.getElementById('outline-width-slider');
            const valueSpan = document.getElementById('outline-width-value');
            slider.oninput = () => {
                valueSpan.textContent = slider.value;
            };
        } else if (panelType === 'effect') {
            const glowSlider = document.getElementById('glow-intensity-slider');
            const glowValueSpan = document.getElementById('glow-intensity-value');
            glowSlider.oninput = () => {
                glowValueSpan.textContent = parseFloat(glowSlider.value).toFixed(1);
            };
        }
    }

    /**
     * 应用字号到当前编辑的 segment
     */
    function applySizeToCurrentSegment(size) {
        // 使用保存的 currentSegmentId，如果没有则尝试处理选中的纯文本
        if (!currentSegmentId) {
            // 尝试处理选中的纯文本
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            const selectedText = range.toString();

            if (selectedText && selectedText.trim().length > 0) {
                // 有选中纯文本，添加字号格式

                // 先同步代码并重新渲染，更新 segmentMap
                syncPreviewToCode();
                renderPreview();

                let code = elements.editor.value;

                // 从最后一个 segment 之后开始查找
                let searchStart = 0;
                const segmentIds = Object.keys(segmentMap).map(Number).sort((a, b) => {
                    const segA = segmentMap[a];
                    const segB = segmentMap[b];
                    return segA.start - segB.start;
                });

                if (segmentIds.length > 0) {
                    const lastSegId = segmentIds[segmentIds.length - 1];
                    searchStart = segmentMap[lastSegId].end;
                }

                const textIndex = code.indexOf(selectedText, searchStart);
                if (textIndex === -1) {
                    console.log('无法在代码中找到选中的文本');
                    return;
                }

                const position = { start: textIndex, end: textIndex + selectedText.length };

                // 验证文本是否匹配
                const actualText = code.substring(position.start, position.end);
                if (actualText !== selectedText) {
                    console.log('字号：位置计算错误');
                    return;
                }

                const before = code.substring(0, position.start);
                const after = code.substring(position.end);
                const formatCode = buildFormatCode({ s: size });
                const formattedCode = `#f(${formatCode})${selectedText}#l`;

                elements.editor.value = before + formattedCode + after;
                const lastSegmentId = renderPreview();
                currentSegmentId = lastSegmentId;

                // 移动光标到新创建的 segment
                setTimeout(() => {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${currentSegmentId}"]`);
                    if (newSegmentSpan && newSegmentSpan.firstChild) {
                        const range = document.createRange();
                        const textNode = newSegmentSpan.firstChild;
                        range.setStart(textNode, 0);
                        range.setEnd(textNode, 0);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }, 10);
                return;
            }
            return;
        }

        const segment = segmentMap[currentSegmentId];
        if (!segment) {
            // segment 不存在（可能已被清空），重置状态
            currentSegmentId = null;
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        // 检查是否有选区内容
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        const hasSelection = selectedText && selectedText.length > 0 && !selection.isCollapsed;

        // 如果有选区且不是整个 segment，需要分离选中部分
        if (hasSelection && selectedText !== segment.content) {
            // 同步预览到代码
            syncPreviewToCode();

            // 重新获取 segment
            const updatedSegment = segmentMap[currentSegmentId];
            if (!updatedSegment) return;

            // 计算选区位置
            const textNode = range.startContainer;
            if (textNode.nodeType !== Node.TEXT_NODE) return;

            const segmentStartOffset = range.startOffset;
            const segmentEndOffset = range.endOffset;

            // 分离内容
            const before = updatedSegment.content.substring(0, segmentStartOffset);
            const selected = updatedSegment.content.substring(segmentStartOffset, segmentEndOffset);
            const after = updatedSegment.content.substring(segmentEndOffset);

            // 构建新代码
            let code = elements.editor.value;
            const oldFormats = parseFormatCodes(updatedSegment.format);
            const newFormats = { ...oldFormats, s: size };

            let newCode = '';
            const oldFormatCode = updatedSegment.format;
            const newFormatCode = buildFormatCode(newFormats);

            // 记录当前的 nextSegmentId，以便计算新 segment 的 ID
            const oldNextId = nextSegmentId;

            if (before) {
                newCode += `#f(${oldFormatCode})${before}#l`;
            }

            newCode += `#f(${newFormatCode})${selected}#l`;

            if (after) {
                newCode += `#f(${oldFormatCode})${after}#l`;
            }

            // 先改代码
            elements.editor.value = code.substring(0, updatedSegment.start) + newCode + code.substring(updatedSegment.end);

            // 再渲染
            renderPreview();

            // 计算新创建的选中部分的 segment ID 并更新 currentSegmentId
            currentSegmentId = before ? oldNextId + 1 : oldNextId;

            // 移动光标到新的 segment
            setTimeout(() => {
                const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${currentSegmentId}"]`);
                if (newSegmentSpan && newSegmentSpan.firstChild) {
                    const range = document.createRange();
                    const textNode = newSegmentSpan.firstChild;
                    range.setStart(textNode, 0);
                    range.setEnd(textNode, 0);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }, 10);
        } else {
            // 修改整个 segment
            const oldFormats = parseFormatCodes(segment.format);
            const newFormats = { ...oldFormats, s: size };

            const code = elements.editor.value;
            const newFormatCode = buildFormatCode(newFormats);
            const newText = `#f(${newFormatCode})${segment.content}#l`;

            // 先改代码
            elements.editor.value = code.substring(0, segment.start) + newText + code.substring(segment.end);

            // 再渲染
            renderPreview();
        }
    }

    /**
     * 应用高级格式
     */
    function applyAdvanced(type) {
        if (currentMode !== 'preview') {
            alert('请切换到预览模式使用高级格式');
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let formatObj = {};

        switch (type) {
            case 'size':
                const size = document.getElementById('size-slider').value;
                formatObj.s = size;
                break;
            case 'underlineColor':
                const underlineColor = document.getElementById('underline-color-picker').value;
                formatObj.u = underlineColor.substring(1);
                formatObj.u_mark = null; // 手动改颜色，移除标记
                break;
            case 'strikeColor':
                const strikeColor = document.getElementById('strike-color-picker').value;
                formatObj.h = strikeColor.substring(1);
                formatObj.h_mark = null; // 手动改颜色，移除标记
                break;
            case 'outline':
                const outlineColor = document.getElementById('outline-color-picker').value;
                const outlineWidth = document.getElementById('outline-width-slider').value;
                formatObj.o = outlineColor.substring(1);
                formatObj.O = outlineWidth;
                formatObj.b = null; // 移除加粗标记（手动改描边就不算加粗了）
                break;
            case 'glow':
                const glowColor = document.getElementById('glow-color-picker').value;
                const glowIntensity = document.getElementById('glow-intensity-slider').value;
                formatObj.g = glowColor.substring(1);
                formatObj.G = parseFloat(glowIntensity).toFixed(3);
                break;
            case 'shadow':
                const shadowColor = document.getElementById('shadow-color-picker').value;
                const shadowX = document.getElementById('shadow-x').value;
                const shadowY = document.getElementById('shadow-y').value;
                formatObj.y = shadowColor.substring(1);
                formatObj.Y = `${shadowX},${shadowY}`;
                break;
        }

        // 根据光标位置查找所在的 segment
        let targetSpan = null;
        let node = selection.anchorNode;

        if (node && node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }

        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                targetSpan = node;
                break;
            }
            node = node.parentNode;
        }

        if (!targetSpan) {
            alert('请将光标放在已格式化的文本上');
            return;
        }

        // 修改光标所在 segment 的格式
        const segmentId = parseInt(targetSpan.getAttribute('data-segment-id'));
        const segment = segmentMap[segmentId];

        if (!segment) return;

        // 检查是否有选区内容
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        const hasSelection = selectedText && selectedText.length > 0 && !selection.isCollapsed;

        // 如果有选区且不是整个 segment，需要分离选中部分
        if (hasSelection && selectedText !== segment.content) {
            // 同步预览到代码
            syncPreviewToCode();

            // 重新获取 segment
            const updatedSegment = segmentMap[segmentId];
            if (!updatedSegment) return;

            // 计算选区位置
            const textNode = range.startContainer;
            if (textNode.nodeType !== Node.TEXT_NODE) return;

            const segmentStartOffset = range.startOffset;
            const segmentEndOffset = range.endOffset;

            // 分离内容
            const before = updatedSegment.content.substring(0, segmentStartOffset);
            const selected = updatedSegment.content.substring(segmentStartOffset, segmentEndOffset);
            const after = updatedSegment.content.substring(segmentEndOffset);

            // 构建新代码
            let code = elements.editor.value;
            const oldFormats = parseFormatCodes(updatedSegment.format);
            const newFormats = { ...oldFormats, ...formatObj };

            // 处理删除属性（值为 null）
            for (const key in formatObj) {
                if (formatObj[key] === null) {
                    delete newFormats[key];
                }
            }

            let newCode = '';
            const oldFormatCode = updatedSegment.format;
            const newFormatCode = buildFormatCode(newFormats);

            if (before) {
                newCode += `#f(${oldFormatCode})${before}#l`;
            }

            newCode += `#f(${newFormatCode})${selected}#l`;

            if (after) {
                newCode += `#f(${oldFormatCode})${after}#l`;
            }

            // 先改代码
            elements.editor.value = code.substring(0, updatedSegment.start) + newCode + code.substring(updatedSegment.end);

            // 再渲染
            renderPreview();

            setTimeout(() => updateToolbarState(), 10);

            // 关闭面板
            const panel = document.getElementById('advanced-panel');
            if (panel && type !== 'size') {
                panel.style.display = 'none';
            }
        } else {
            // 修改整个 segment
            const oldFormats = parseFormatCodes(segment.format);
            const newFormats = { ...oldFormats, ...formatObj };

            // 处理删除属性（值为 null）
            for (const key in formatObj) {
                if (formatObj[key] === null) {
                    delete newFormats[key];
                }
            }

            const code = elements.editor.value;
            const newFormatCode = buildFormatCode(newFormats);
            const newText = `#f(${newFormatCode})${segment.content}#l`;

            elements.editor.value = code.substring(0, segment.start) + newText + code.substring(segment.end);

            renderPreview();
            setTimeout(() => updateToolbarState(), 10);

            // 关闭面板
            const panel = document.getElementById('advanced-panel');
            if (panel && type !== 'size') { // 字号面板保持打开以便继续调整
                panel.style.display = 'none';
            }
        }
    }

    /**
     * 根据选区计算在代码中的位置（重构版：基于 segment 排除法）
     */
    function getCodePositionFromSelection(selection) {
        if (!selection.rangeCount) return null;

        const range = selection.getRangeAt(0);

        // 获取选区的起始和结束节点
        let startContainer = range.startContainer;
        let endContainer = range.endContainer;
        let startOffset = range.startOffset;
        let endOffset = range.endOffset;

        // 如果是元素节点，转换到文本节点
        if (startContainer.nodeType === Node.ELEMENT_NODE) {
            if (startContainer.childNodes[startOffset]) {
                startContainer = startContainer.childNodes[startOffset];
                startOffset = 0;
            }
        }
        if (endContainer.nodeType === Node.ELEMENT_NODE) {
            if (endContainer.childNodes[endOffset]) {
                endContainer = endContainer.childNodes[endOffset];
                endOffset = 0;
            }
        }

        // 检查是否在 segment 内
        let startSegmentId = null;
        let endSegmentId = null;

        let node = startContainer;
        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                startSegmentId = parseInt(node.getAttribute('data-segment-id'));
                break;
            }
            node = node.parentNode;
        }

        node = endContainer;
        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                endSegmentId = parseInt(node.getAttribute('data-segment-id'));
                break;
            }
            node = node.parentNode;
        }

        // 如果在 segment 内，使用 segment 信息计算
        if (startSegmentId !== null) {
            const segment = segmentMap[startSegmentId];
            if (segment) {
                const formatPrefixLength = '#f('.length + segment.format.length + ')'.length;
                const startPos = segment.start + formatPrefixLength + startOffset;
                const endPos = segment.start + formatPrefixLength + (endSegmentId === startSegmentId ? endOffset : segment.content.length);
                return { start: startPos, end: endPos };
            }
        }

        // 否则，选区在纯文本中，需要计算纯文本的位置
        // 遍历预览区，跳过所有 segment，累计纯文本的位置
        let codePos = 0;
        let startPos = null;
        let endPos = null;

        const allNodes = [];
        const walker = document.createTreeWalker(
            elements.preview,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            null
        );

        let n;
        while (n = walker.nextNode()) {
            allNodes.push(n);
        }

        for (let i = 0; i < allNodes.length; i++) {
            const currentNode = allNodes[i];

            if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.hasAttribute('data-segment-id')) {
                // 这是 segment，跳过整个 segment 的代码长度
                const segmentId = parseInt(currentNode.getAttribute('data-segment-id'));
                const segment = segmentMap[segmentId];
                if (segment) {
                    codePos = segment.end;
                }
            } else if (currentNode.nodeType === Node.TEXT_NODE) {
                // 检查这个文本节点是否在 segment 内
                let inSegment = false;
                let parentNode = currentNode.parentNode;
                while (parentNode && parentNode !== elements.preview) {
                    if (parentNode.nodeType === Node.ELEMENT_NODE && parentNode.hasAttribute('data-segment-id')) {
                        inSegment = true;
                        break;
                    }
                    parentNode = parentNode.parentNode;
                }

                if (!inSegment) {
                    // 这是纯文本节点
                    const textLength = currentNode.textContent.length;

                    if (currentNode === startContainer) {
                        startPos = codePos + startOffset;
                    }
                    if (currentNode === endContainer) {
                        endPos = codePos + endOffset;
                    }

                    codePos += textLength;
                }
            } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.nodeName === 'BR') {
                // <br> 对应 \n，但需要检查是否在 segment 内
                let inSegment = false;
                let parentNode = currentNode.parentNode;
                while (parentNode && parentNode !== elements.preview) {
                    if (parentNode.nodeType === Node.ELEMENT_NODE && parentNode.hasAttribute('data-segment-id')) {
                        inSegment = true;
                        break;
                    }
                    parentNode = parentNode.parentNode;
                }

                if (!inSegment) {
                    // 只有纯文本区域的 <br> 才计入位置
                    codePos += 1;
                }
            }
        }

        if (startPos !== null && endPos !== null) {
            return { start: startPos, end: endPos };
        }

        return null;
    }

    /**
     * 应用颜色到选中的文本
     */
    function applyColorToSelection(color) {
        if (currentMode !== 'preview') {
            alert('请切换到预览模式使用颜色');
            return;
        }

        const formatObj = { c: color.substring(1) }; // 移除 #

        // 使用保存的 currentSegmentId，如果没有则尝试处理选中的纯文本
        if (!currentSegmentId) {
            // 尝试处理选中的纯文本
            const selection = window.getSelection();
            if (!selection.rangeCount) {
                alert('请将光标放在要修改颜色的文本上');
                return;
            }

            const range = selection.getRangeAt(0);
            const selectedText = range.toString();

            if (selectedText && selectedText.trim().length > 0) {
                // 有选中纯文本，添加颜色格式

                // 先同步代码并重新渲染，更新 segmentMap
                syncPreviewToCode();
                renderPreview();

                let code = elements.editor.value;

                // 从最后一个 segment 之后开始查找
                let searchStart = 0;
                const segmentIds = Object.keys(segmentMap).map(Number).sort((a, b) => {
                    const segA = segmentMap[a];
                    const segB = segmentMap[b];
                    return segA.start - segB.start;
                });

                if (segmentIds.length > 0) {
                    const lastSegId = segmentIds[segmentIds.length - 1];
                    searchStart = segmentMap[lastSegId].end;
                }

                const textIndex = code.indexOf(selectedText, searchStart);
                if (textIndex === -1) {
                    alert('请选择要修改颜色的文本');
                    return;
                }

                const position = { start: textIndex, end: textIndex + selectedText.length };

                // 验证文本是否匹配
                const actualText = code.substring(position.start, position.end);
                if (actualText !== selectedText) {
                    console.log('颜色：位置计算错误');
                    alert('请选择要修改颜色的文本');
                    return;
                }

                const before = code.substring(0, position.start);
                const after = code.substring(position.end);
                const formatCode = buildFormatCode(formatObj);
                const formattedCode = `#f(${formatCode})${selectedText}#l`;

                elements.editor.value = before + formattedCode + after;
                const lastSegmentId = renderPreview();
                currentSegmentId = lastSegmentId;

                // 移动光标到新创建的 segment
                setTimeout(() => {
                    const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${currentSegmentId}"]`);
                    if (newSegmentSpan && newSegmentSpan.firstChild) {
                        const range = document.createRange();
                        const textNode = newSegmentSpan.firstChild;
                        range.setStart(textNode, 0);
                        range.setEnd(textNode, 0);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    updateToolbarState();
                }, 10);
                return;
            }

            alert('请将光标放在要修改颜色的文本上');
            return;
        }

        const segment = segmentMap[currentSegmentId];
        if (!segment) {
            // segment 不存在（可能已被清空），重置状态
            currentSegmentId = null;
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        // 检查是否有选区内容
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        const hasSelection = selectedText && selectedText.length > 0 && !selection.isCollapsed;

        // 如果有选区且不是整个 segment，需要分离选中部分
        if (hasSelection && selectedText !== segment.content) {
            // 同步预览到代码
            syncPreviewToCode();

            // 重新获取 segment
            const updatedSegment = segmentMap[currentSegmentId];
            if (!updatedSegment) return;

            // 计算选区位置
            const textNode = range.startContainer;
            if (textNode.nodeType !== Node.TEXT_NODE) return;

            const segmentStartOffset = range.startOffset;
            const segmentEndOffset = range.endOffset;

            // 分离内容
            const before = updatedSegment.content.substring(0, segmentStartOffset);
            const selected = updatedSegment.content.substring(segmentStartOffset, segmentEndOffset);
            const after = updatedSegment.content.substring(segmentEndOffset);

            // 构建新代码
            let code = elements.editor.value;
            const oldFormats = parseFormatCodes(updatedSegment.format);
            const newFormats = { ...oldFormats, ...formatObj };

            // 如果有加粗标记，更新描边颜色
            if (oldFormats.b === '1') {
                newFormats.o = formatObj.c;
            }
            // 如果有下划线标记，更新下划线颜色
            if (oldFormats.u_mark === '1') {
                newFormats.u = formatObj.c;
            }
            // 如果有删除线标记，更新删除线颜色
            if (oldFormats.h_mark === '1') {
                newFormats.h = formatObj.c;
            }

            let newCode = '';
            const oldFormatCode = updatedSegment.format;
            const newFormatCode = buildFormatCode(newFormats);

            // 记录当前的 nextSegmentId
            const oldNextId = nextSegmentId;

            if (before) {
                newCode += `#f(${oldFormatCode})${before}#l`;
            }

            newCode += `#f(${newFormatCode})${selected}#l`;

            if (after) {
                newCode += `#f(${oldFormatCode})${after}#l`;
            }

            // 先改代码
            elements.editor.value = code.substring(0, updatedSegment.start) + newCode + code.substring(updatedSegment.end);

            // 再渲染
            renderPreview();

            // 更新 currentSegmentId 为新创建的 segment
            currentSegmentId = before ? oldNextId + 1 : oldNextId;

            // 移动光标到新的 segment
            setTimeout(() => {
                const newSegmentSpan = elements.preview.querySelector(`[data-segment-id="${currentSegmentId}"]`);
                if (newSegmentSpan && newSegmentSpan.firstChild) {
                    const range = document.createRange();
                    const textNode = newSegmentSpan.firstChild;
                    range.setStart(textNode, 0);
                    range.setEnd(textNode, 0);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                updateToolbarState();
            }, 10);
        } else {
            // 修改整个 segment
            const oldFormats = parseFormatCodes(segment.format);
            const newFormats = { ...oldFormats, ...formatObj };

            // 如果有加粗标记，更新加粗的描边颜色
            if (oldFormats.b === '1') {
                newFormats.o = formatObj.c;
            }
            // 如果有下划线标记，更新下划线颜色
            if (oldFormats.u_mark === '1') {
                newFormats.u = formatObj.c;
            }
            // 如果有删除线标记，更新删除线颜色
            if (oldFormats.h_mark === '1') {
                newFormats.h = formatObj.c;
            }

            // 修改代码
            const code = elements.editor.value;
            const newFormatCode = buildFormatCode(newFormats);
            const newText = `#f(${newFormatCode})${segment.content}#l`;

            elements.editor.value = code.substring(0, segment.start) + newText + code.substring(segment.end);

            // 重新渲染
            renderPreview();

            // 延迟更新工具栏状态
            setTimeout(() => updateToolbarState(), 10);
        }
    }

    /**
     * 更新工具栏按钮激活状态
     */
    function updateToolbarState() {
        if (currentMode !== 'preview' || !elements.preview) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) {
            clearToolbarState();
            currentSegmentId = null; // 清除保存的 ID
            return;
        }

        // 清除所有激活状态
        clearToolbarState();

        // 获取选中的节点
        let node = selection.anchorNode;

        // 如果是文本节点，获取其父节点
        if (node && node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }

        // 向上查找，检测所有应用的格式
        const appliedFormats = new Set();
        while (node && node !== elements.preview) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-segment-id')) {
                const segmentId = parseInt(node.getAttribute('data-segment-id'));
                currentSegmentId = segmentId; // 保存当前的 segment ID
                const segment = segmentMap[segmentId];

                if (segment && segment.format) {
                    // 解析格式代码
                    const formats = parseFormatCodes(segment.format);

                    // 检测各种格式 - 精确匹配预设
                    if (formats.s) {
                        const size = formats.s;
                        // 精确匹配预设的字号
                        if (size === '40') appliedFormats.add('h1');
                        else if (size === '32') appliedFormats.add('h2');
                        else if (size === '24') appliedFormats.add('h3');
                        else if (size === '18') appliedFormats.add('h4');
                    }

                    // 加粗 = b 标记为 1
                    if (formats.b === '1') {
                        appliedFormats.add('bold');
                    }

                    // 下划线
                    if (formats.u) {
                        appliedFormats.add('underline');
                    }

                    // 删除线
                    if (formats.h) {
                        appliedFormats.add('strike');
                    }

                    // 发光
                    if (formats.g) {
                        appliedFormats.add('glow');
                    }

                    // 阴影
                    if (formats.y) {
                        appliedFormats.add('shadow');
                    }
                }
            }
            node = node.parentNode;
        }

        // 激活对应的按钮
        appliedFormats.forEach(format => {
            const btn = document.querySelector(`.toolbar-btn[data-preset="${format}"]`);
            if (btn) {
                btn.classList.add('active');
            }
        });
    }

    /**
     * 清除工具栏所有激活状态
     */
    function clearToolbarState() {
        document.querySelectorAll('.toolbar-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    // 公开接口
    return {
        init,
        open,
        switchMode,
        applyPreset,
        removeFormat,
        autoApply,
        confirm,
        toggleAdvancedPanel,
        applyAdvanced
    };
})();
