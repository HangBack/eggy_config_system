/**
 * 富文本编辑器 v2 - Markdown 优先版本
 * 
 * 核心思路：
 * 1. 用户在编辑器中使用 Markdown 语法编写
 * 2. 实时预览，同时生成目标富文本格式代码
 * 3. 支持纯文本选中后应用格式（分离）
 * 
 * 目标格式：#f(code:value|...)content#l
 * 格式码：
 *   c - 文字颜色 (hex6)
 *   s - 字号
 *   o - 描边颜色
 *   O - 描边宽度
 *   g - 发光颜色
 *   G - 发光强度
 *   y - 阴影颜色
 *   Y - 阴影偏移 (x,y)
 *   u - 下划线颜色
 *   h - 删除线颜色
 *   b - 加粗标记
 */

const RichTextEditor = (function () {
    'use strict';

    // 私有变量
    let currentFieldId = null;
    let onConfirmCallback = null;
    let currentMode = 'preview'; // preview, code, split

    // 元素引用
    const elements = {};

    // 预设格式
    const presets = {
        h1: { s: '40', o: '000000', O: '2', b: '1' },
        h2: { s: '32', o: '000000', O: '1.5', b: '1' },
        h3: { s: '24', o: '000000', O: '1', b: '1' },
        h4: { s: '18', o: '000000', O: '0.5', b: '1' },
        bold: { b: '1' },
        underline: { u: '000000' },
        strike: { h: 'ff0000' },
        glow: { g: 'ffff00', G: '1.000' },
        shadow: { y: '000000', Y: '2,2' }
    };

    // ========== 初始化 ==========

    function init() {
        elements.modal = document.getElementById('richTextModal');
        elements.preview = document.getElementById('richtext-preview');
        elements.editor = document.getElementById('richtext-editor');
        elements.container = document.querySelector('.richtext-container');

        if (!elements.modal || !elements.editor || !elements.preview) {
            console.error('富文本编辑器元素未找到');
            return;
        }

        // 预览区输入监听
        elements.preview.addEventListener('input', handlePreviewInput);
        elements.preview.addEventListener('keydown', handlePreviewKeydown);
        
        // 代码编辑器输入监听
        elements.editor.addEventListener('input', handleCodeInput);

        // 监听选区变化
        document.addEventListener('selectionchange', updateToolbarState);

        // 颜色选择器
        const colorPicker = document.getElementById('text-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', () => applyColorToSelection(colorPicker.value));
        }

        // 初始化滑块监听
        initSliders();

        console.log('富文本编辑器 v2 初始化完成');
    }

    function initSliders() {
        // 字号滑块
        const sizeSlider = document.getElementById('size-slider');
        const sizeValue = document.getElementById('size-value');
        if (sizeSlider && sizeValue) {
            sizeSlider.addEventListener('input', () => {
                sizeValue.textContent = sizeSlider.value;
            });
            sizeSlider.addEventListener('change', () => {
                applyAdvanced('size');
            });
        }

        // 描边滑块
        const outlineSlider = document.getElementById('outline-width-slider');
        const outlineValue = document.getElementById('outline-width-value');
        if (outlineSlider && outlineValue) {
            outlineSlider.addEventListener('input', () => {
                outlineValue.textContent = outlineSlider.value;
            });
        }

        // 发光滑块
        const glowSlider = document.getElementById('glow-intensity-slider');
        const glowValue = document.getElementById('glow-intensity-value');
        if (glowSlider && glowValue) {
            glowSlider.addEventListener('input', () => {
                glowValue.textContent = parseFloat(glowSlider.value).toFixed(1);
            });
        }
    }

    // ========== 模式切换 ==========

    function switchMode(mode) {
        currentMode = mode;
        elements.container.setAttribute('data-mode', mode);

        // 更新按钮状态
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'preview' || mode === 'split') {
            renderPreview();
        }
    }

    // ========== Markdown 解析与转换 ==========

    /**
     * Markdown 转 富文本格式
     * 支持的语法：
     * - # ~ #### 标题
     * - **text** 加粗
     * - __text__ 下划线
     * - ~~text~~ 或 --text-- 删除线
     * - {c:ff0000}text{/c} 颜色
     * - {s:24}text{/s} 字号
     * - {glow:ffff00,1.0}text{/glow} 发光
     * - {shadow:000000,2,2}text{/shadow} 阴影
     * - {outline:000000,2}text{/outline} 描边
     */
    function markdownToRichText(markdown) {
        let result = markdown;

        // 1. 处理标题 (行首 # 开头) - 需要在换行处理之前
        result = result.replace(/^(#{1,4})\s+(.+)$/gm, (match, hashes, content) => {
            const level = hashes.length;
            const preset = presets[`h${level}`];
            const formatCode = buildFormatCode(preset);
            return `#f(${formatCode})${content.trim()}#l`;
        });

        // 2. 处理扩展语法 - 颜色 {c:xxxxxx}text{/c}
        result = result.replace(/\{c:([0-9a-fA-F]{6})\}(.+?)\{\/c\}/g, (match, color, content) => {
            return `#f(c:${color.toLowerCase()})${content}#l`;
        });

        // 3. 处理扩展语法 - 字号 {s:xx}text{/s}
        result = result.replace(/\{s:(\d+)\}(.+?)\{\/s\}/g, (match, size, content) => {
            return `#f(s:${size})${content}#l`;
        });

        // 4. 处理扩展语法 - 发光 {glow:color,intensity}text{/glow}
        result = result.replace(/\{glow:([0-9a-fA-F]{6}),?([\d.]*)\}(.+?)\{\/glow\}/g, (match, color, intensity, content) => {
            const g = color.toLowerCase();
            const G = intensity || '1.000';
            return `#f(g:${g}|G:${parseFloat(G).toFixed(3)})${content}#l`;
        });

        // 5. 处理扩展语法 - 阴影 {shadow:color,x,y}text{/shadow}
        result = result.replace(/\{shadow:([0-9a-fA-F]{6}),(-?\d+),(-?\d+)\}(.+?)\{\/shadow\}/g, (match, color, x, y, content) => {
            return `#f(y:${color.toLowerCase()}|Y:${x},${y})${content}#l`;
        });

        // 6. 处理扩展语法 - 描边 {outline:color,width}text{/outline}
        result = result.replace(/\{outline:([0-9a-fA-F]{6}),?([\d.]*)\}(.+?)\{\/outline\}/g, (match, color, width, content) => {
            const w = width || '2';
            return `#f(o:${color.toLowerCase()}|O:${w})${content}#l`;
        });

        // 7. 处理加粗 **text**
        result = result.replace(/\*\*(.+?)\*\*/g, (match, content) => {
            const preset = presets.bold;
            // 加粗时使用黑色描边
            const formatCode = buildFormatCode({ ...preset, o: '000000', O: '1' });
            return `#f(${formatCode})${content}#l`;
        });

        // 8. 处理下划线 __text__
        result = result.replace(/__(.+?)__/g, (match, content) => {
            const preset = presets.underline;
            const formatCode = buildFormatCode(preset);
            return `#f(${formatCode})${content}#l`;
        });

        // 9. 处理删除线 ~~text~~ 或 --text--
        result = result.replace(/~~(.+?)~~/g, (match, content) => {
            const preset = presets.strike;
            const formatCode = buildFormatCode(preset);
            return `#f(${formatCode})${content}#l`;
        });
        result = result.replace(/--(.+?)--/g, (match, content) => {
            const preset = presets.strike;
            const formatCode = buildFormatCode(preset);
            return `#f(${formatCode})${content}#l`;
        });

        // 10. 处理无序列表
        result = result.replace(/^[-*]\s+(.+)$/gm, (match, content) => {
            return '• ' + content;
        });

        // 合并相邻的相同格式片段
        result = mergeAdjacentSegments(result);

        return result;
    }

    /**
     * 富文本格式 转 Markdown
     */
    function richTextToMarkdown(richText) {
        let result = richText;

        // 处理换行
        result = result.replace(/\\n/g, '\n');

        // 解析所有格式片段
        const segmentRegex = /#f\(([^)]*)\)([^#]*?)#l/g;
        
        result = result.replace(segmentRegex, (match, formatStr, content) => {
            const formats = parseFormatCodes(formatStr);
            
            // 尝试匹配预设
            // 标题检测
            if (formats.s === '40' && formats.b === '1') {
                return `# ${content}`;
            }
            if (formats.s === '32' && formats.b === '1') {
                return `## ${content}`;
            }
            if (formats.s === '24' && formats.b === '1') {
                return `### ${content}`;
            }
            if (formats.s === '18' && formats.b === '1') {
                return `#### ${content}`;
            }

            // 构建 Markdown
            let md = content;

            // 加粗
            if (formats.b === '1' && !formats.s) {
                md = `**${md}**`;
            }

            // 下划线
            if (formats.u) {
                md = `__${md}__`;
            }

            // 删除线
            if (formats.h) {
                md = `~~${md}~~`;
            }

            // 颜色（使用扩展语法）
            if (formats.c) {
                md = `{c:${formats.c}}${md}{/c}`;
            }

            // 字号（非标题）
            if (formats.s && !formats.b) {
                md = `{s:${formats.s}}${md}{/s}`;
            }

            // 发光
            if (formats.g && formats.G) {
                md = `{glow:${formats.g},${formats.G}}${md}{/glow}`;
            }

            // 阴影
            if (formats.y && formats.Y) {
                const [x, y] = formats.Y.split(',');
                md = `{shadow:${formats.y},${x},${y}}${md}{/shadow}`;
            }

            // 描边（非加粗情况）
            if (formats.o && formats.O && formats.b !== '1') {
                md = `{outline:${formats.o},${formats.O}}${md}{/outline}`;
            }

            return md;
        });

        return result;
    }

    /**
     * 合并相邻的相同格式片段
     */
    function mergeAdjacentSegments(code) {
        // 匹配连续的格式片段
        const regex = /#f\(([^)]*)\)([^#]*?)#l#f\(\1\)([^#]*?)#l/g;
        
        let result = code;
        let prevResult;
        
        // 循环直到没有可合并的
        do {
            prevResult = result;
            result = result.replace(regex, '#f($1)$2$3#l');
        } while (result !== prevResult);
        
        return result;
    }

    // ========== 格式处理工具函数 ==========

    function parseFormatCodes(formatStr) {
        const formats = {};
        if (!formatStr) return formats;
        
        const codes = formatStr.split('|');
        for (const code of codes) {
            const colonIndex = code.indexOf(':');
            if (colonIndex > 0) {
                const key = code.substring(0, colonIndex);
                const value = code.substring(colonIndex + 1);
                formats[key] = value;
            }
        }
        return formats;
    }

    function buildFormatCode(formats) {
        const codes = [];
        const order = ['c', 's', 'o', 'O', 'g', 'G', 'y', 'Y', 'u', 'h', 'b'];

        for (const key of order) {
            if (formats[key] !== null && formats[key] !== undefined && formats[key] !== '') {
                codes.push(`${key}:${formats[key]}`);
            }
        }

        return codes.join('|');
    }

    // ========== 预览渲染 ==========

    function renderPreview() {
        const markdown = elements.editor.value;
        const richText = markdownToRichText(markdown);
        
        // 渲染 HTML 预览
        const html = richTextToHtml(richText);
        elements.preview.innerHTML = html;
    }

    /**
     * 富文本格式转 HTML（用于预览）
     */
    function richTextToHtml(code) {
        let html = escapeHtml(code);

        // 处理换行
        html = html.replace(/\\n/g, '<br>');
        html = html.replace(/\n/g, '<br>');

        // 解析格式片段
        const segmentRegex = /#f\(([^)]*)\)([^#]*?)#l/g;
        
        html = html.replace(segmentRegex, (match, formatStr, content) => {
            const formats = parseFormatCodes(formatStr);
            const styles = [];
            const classes = [];

            // 字号
            if (formats.s) {
                styles.push(`font-size: ${formats.s}px`);
            }

            // 颜色
            if (formats.c) {
                styles.push(`color: #${formats.c}`);
            }

            // 加粗
            if (formats.b === '1') {
                styles.push('font-weight: bold');
            }

            // 描边（使用 text-shadow 模拟）
            if (formats.o && formats.O) {
                const w = parseFloat(formats.O);
                const c = formats.o;
                styles.push(`text-shadow: 
                    -${w}px -${w}px 0 #${c},
                    ${w}px -${w}px 0 #${c},
                    -${w}px ${w}px 0 #${c},
                    ${w}px ${w}px 0 #${c}`);
            }

            // 发光
            if (formats.g && formats.G) {
                const blur = parseFloat(formats.G) * 10;
                styles.push(`text-shadow: 0 0 ${blur}px #${formats.g}`);
            }

            // 阴影
            if (formats.y && formats.Y) {
                const [x, y] = formats.Y.split(',');
                styles.push(`text-shadow: ${x}px ${y}px 2px #${formats.y}`);
            }

            // 下划线
            if (formats.u) {
                styles.push(`text-decoration: underline`);
                styles.push(`text-decoration-color: #${formats.u}`);
            }

            // 删除线
            if (formats.h) {
                styles.push(`text-decoration: line-through`);
                styles.push(`text-decoration-color: #${formats.h}`);
            }

            const styleAttr = styles.length ? ` style="${styles.join('; ')}"` : '';
            return `<span class="rt-segment"${styleAttr}>${content}</span>`;
        });

        return html || '<span class="placeholder">在此输入文本...</span>';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 事件处理 ==========

    function handlePreviewInput(event) {
        // 从预览区同步回 Markdown
        syncPreviewToMarkdown();
    }

    function handleCodeInput(event) {
        if (currentMode === 'preview' || currentMode === 'split') {
            renderPreview();
        }
    }

    function handlePreviewKeydown(event) {
        // 回车键
        if (event.key === 'Enter') {
            event.preventDefault();
            document.execCommand('insertText', false, '\n');
            syncPreviewToMarkdown();
        }
    }

    /**
     * 从预览区同步内容回 Markdown
     */
    function syncPreviewToMarkdown() {
        const html = elements.preview.innerHTML;
        
        // 将 HTML 转回 Markdown
        let markdown = html;
        
        // 处理 <br>
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
        
        // 处理格式片段 - 保留文本内容
        markdown = markdown.replace(/<span class="rt-segment"[^>]*>([^<]*)<\/span>/gi, '$1');
        
        // 移除其他 HTML 标签
        markdown = markdown.replace(/<[^>]+>/g, '');
        
        // HTML 实体解码
        const textarea = document.createElement('textarea');
        textarea.innerHTML = markdown;
        markdown = textarea.value;
        
        // 移除占位符文字
        if (markdown === '在此输入文本...') {
            markdown = '';
        }
        
        elements.editor.value = markdown;
    }

    /**
     * 从预览区获取当前选中的纯文本及其位置信息
     */
    function getPreviewSelection() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        if (!selectedText) return null;

        // 获取选区在预览区中的位置
        // 需要找到在 Markdown 源码中的对应位置
        
        return {
            text: selectedText,
            range: range
        };
    }

    /**
     * 在 Markdown 源码中找到文本并包裹格式
     */
    function wrapTextInMarkdown(text, wrapper) {
        const markdown = elements.editor.value;
        
        // 查找文本位置
        const index = markdown.indexOf(text);
        if (index === -1) {
            // 如果找不到，可能文本被分割了，尝试追加
            elements.editor.value = markdown + wrapper;
            return true;
        }
        
        // 检查是否已经有格式包裹
        const before = markdown.substring(0, index);
        const after = markdown.substring(index + text.length);
        
        // 用包裹后的内容替换
        elements.editor.value = before + wrapper + after;
        return true;
    }

    // ========== 工具栏操作 ==========

    function updateToolbarState() {
        // 检查当前选区的格式状态，更新工具栏按钮高亮
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        // 获取选区的父元素
        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }

        // 检查是否在格式 span 内
        const segment = node.closest?.('.rt-segment');
        
        // 更新预设按钮状态
        document.querySelectorAll('.toolbar-btn[data-preset]').forEach(btn => {
            btn.classList.remove('active');
        });

        if (segment) {
            const style = segment.style;
            // 根据样式判断激活状态
            if (style.fontSize === '40px') {
                document.querySelector('[data-preset="h1"]')?.classList.add('active');
            } else if (style.fontSize === '32px') {
                document.querySelector('[data-preset="h2"]')?.classList.add('active');
            } else if (style.fontSize === '24px') {
                document.querySelector('[data-preset="h3"]')?.classList.add('active');
            } else if (style.fontSize === '18px') {
                document.querySelector('[data-preset="h4"]')?.classList.add('active');
            }
            if (style.fontWeight === 'bold') {
                document.querySelector('[data-preset="bold"]')?.classList.add('active');
            }
            if (style.textDecoration?.includes('underline')) {
                document.querySelector('[data-preset="underline"]')?.classList.add('active');
            }
            if (style.textDecoration?.includes('line-through')) {
                document.querySelector('[data-preset="strike"]')?.classList.add('active');
            }
        }
    }

    /**
     * 应用预设格式
     */
    function applyPreset(presetName) {
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            console.log('没有选区');
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        if (!selectedText) {
            // 没有选中文本时，插入占位符或切换模式
            console.log('没有选中文本，请先选中要格式化的文本');
            return;
        }

        // 根据预设名称生成 Markdown
        let markdown = '';
        
        switch (presetName) {
            case 'h1':
                markdown = `# ${selectedText}`;
                break;
            case 'h2':
                markdown = `## ${selectedText}`;
                break;
            case 'h3':
                markdown = `### ${selectedText}`;
                break;
            case 'h4':
                markdown = `#### ${selectedText}`;
                break;
            case 'bold':
                markdown = `**${selectedText}**`;
                break;
            case 'underline':
                markdown = `__${selectedText}__`;
                break;
            case 'strike':
                markdown = `~~${selectedText}~~`;
                break;
            case 'ul':
                markdown = `- ${selectedText}`;
                break;
            case 'ol':
                markdown = `1. ${selectedText}`;
                break;
            default:
                markdown = selectedText;
        }

        // 在代码编辑器中替换或插入
        replaceSelectedTextInEditor(selectedText, markdown);
    }

    /**
     * 在编辑器中替换选中的文本
     */
    function replaceSelectedTextInEditor(originalText, newText) {
        const editorValue = elements.editor.value;
        
        // 查找文本位置
        const index = editorValue.lastIndexOf(originalText);
        if (index === -1) {
            // 直接追加
            elements.editor.value = editorValue + newText;
        } else {
            // 替换
            elements.editor.value = 
                editorValue.substring(0, index) + 
                newText + 
                editorValue.substring(index + originalText.length);
        }

        // 重新渲染预览
        renderPreview();
    }

    /**
     * 应用颜色到选区
     */
    function applyColorToSelection(hexColor) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const selectedText = selection.toString();
        if (!selectedText) return;

        const color = hexColor.replace('#', '');
        const markdown = `{c:${color}}${selectedText}{/c}`;

        replaceSelectedTextInEditor(selectedText, markdown);
    }

    /**
     * 切换高级面板
     */
    function toggleAdvancedPanel(panelType) {
        const panel = document.getElementById('advanced-panel');
        const panelContent = panel?.querySelector(`[data-panel="${panelType}"]`);

        if (!panel || !panelContent) return;

        // 隐藏所有面板内容
        panel.querySelectorAll('.panel-content').forEach(p => {
            p.style.display = 'none';
        });

        // 切换显示
        if (panel.style.display === 'none' || panelContent.style.display === 'none') {
            panel.style.display = 'flex';
            panelContent.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
    }

    /**
     * 应用高级格式
     */
    function applyAdvanced(type) {
        const selection = window.getSelection();
        const selectedText = selection?.toString() || '';

        if (!selectedText) {
            console.log('请先选中文本');
            return;
        }

        let markdown = '';

        switch (type) {
            case 'size': {
                const size = document.getElementById('size-slider')?.value || '16';
                markdown = `{s:${size}}${selectedText}{/s}`;
                break;
            }
            case 'outline': {
                const color = document.getElementById('outline-color-picker')?.value.replace('#', '') || '000000';
                const width = document.getElementById('outline-width-slider')?.value || '2';
                markdown = `{outline:${color},${width}}${selectedText}{/outline}`;
                break;
            }
            case 'glow': {
                const color = document.getElementById('glow-color-picker')?.value.replace('#', '') || 'ffff00';
                const intensity = document.getElementById('glow-intensity-slider')?.value || '1.0';
                markdown = `{glow:${color},${intensity}}${selectedText}{/glow}`;
                break;
            }
            case 'shadow': {
                const color = document.getElementById('shadow-color-picker')?.value.replace('#', '') || '000000';
                const x = document.getElementById('shadow-x')?.value || '2';
                const y = document.getElementById('shadow-y')?.value || '2';
                markdown = `{shadow:${color},${x},${y}}${selectedText}{/shadow}`;
                break;
            }
            case 'underlineColor': {
                const color = document.getElementById('underline-color-picker')?.value.replace('#', '') || '000000';
                // 下划线用 __text__ 语法，颜色暂时用扩展语法
                markdown = `__${selectedText}__`;
                break;
            }
            case 'strikeColor': {
                const color = document.getElementById('strike-color-picker')?.value.replace('#', '') || 'ff0000';
                markdown = `~~${selectedText}~~`;
                break;
            }
            default:
                markdown = selectedText;
        }

        replaceSelectedTextInEditor(selectedText, markdown);

        // 隐藏面板
        const panel = document.getElementById('advanced-panel');
        if (panel) panel.style.display = 'none';
    }

    /**
     * 清除格式
     */
    function removeFormat() {
        const selection = window.getSelection();
        const selectedText = selection?.toString() || '';

        if (!selectedText) {
            console.log('请先选中文本');
            return;
        }

        // 直接用纯文本替换
        replaceSelectedTextInEditor(selectedText, selectedText);
    }

    // ========== 打开/确认 ==========

    function open(fieldId, value, callback) {
        currentFieldId = fieldId;
        onConfirmCallback = callback;

        // 解析输入值
        let markdown = '';
        if (value) {
            // 将富文本格式转为 Markdown
            markdown = richTextToMarkdown(value);
        }

        elements.editor.value = markdown;
        
        // 切换到预览模式并渲染
        switchMode('preview');

        // 显示模态框
        const modal = new bootstrap.Modal(elements.modal);
        modal.show();

        // 聚焦预览区
        setTimeout(() => {
            elements.preview.focus();
        }, 100);
    }

    function confirm() {
        // 获取 Markdown 并转换为富文本格式
        const markdown = elements.editor.value;
        let richText = markdownToRichText(markdown);
        
        // 处理换行：真实换行转为 \\n
        richText = richText.replace(/\n/g, '\\n');

        if (onConfirmCallback) {
            onConfirmCallback(currentFieldId, richText);
        }

        const modal = bootstrap.Modal.getInstance(elements.modal);
        if (modal) {
            modal.hide();
        }
    }

    // ========== 公开 API ==========

    return {
        init,
        open,
        confirm,
        switchMode,
        applyPreset,
        applyAdvanced,
        toggleAdvancedPanel,
        removeFormat,
        // 暴露转换函数供调试
        markdownToRichText,
        richTextToMarkdown
    };

})();

// 注意：初始化由 index.html 中 fetch 加载 HTML 后调用
// RichTextEditor.init() 在 HTML 模板加载完成后执行
