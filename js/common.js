// API接口配置
const API_BASE = 'http://localhost:5001/api';

const API = {
    SCHEMA: `${API_BASE}/schema`,
    ENUM: `${API_BASE}/enum`,
    DATA: `${API_BASE}/data`,
    LUA_TYPES: `${API_BASE}/lua-types`
};

// ==================== Toaster 通知系统 ====================

/**
 * 显示 Toaster 通知
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型: 'success', 'error', 'warning', 'info'
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
function showToast(message, type = 'info', duration = 3000) {
    // 创建 toaster 容器（如果不存在）
    let container = document.getElementById('toaster-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toaster-container';
        container.className = 'toaster-container';
        document.body.appendChild(container);
    }

    // 创建 toast 元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // 图标映射
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    // 添加到容器
    container.appendChild(toast);
    
    // 触发动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
            // 如果容器为空，移除容器
            if (container.children.length === 0) {
                document.body.removeChild(container);
            }
        }, 300);
    }, duration);
}

// 便捷方法
function showSuccess(message, duration) {
    showToast(message, 'success', duration);
}

function showError(message, duration) {
    showToast(message, 'error', duration);
}

function showWarning(message, duration) {
    showToast(message, 'warning', duration);
}

function showInfo(message, duration) {
    showToast(message, 'info', duration);
}

// 工具函数：将纯数字字符串转换为数字键，用于对象访问
function normalizeFieldKey(fieldName) {
    // 检查是否为纯数字字符串
    if (typeof fieldName === 'string' && /^\d+$/.test(fieldName)) {
        return parseInt(fieldName, 10);
    }
    return fieldName;
}

// 工具函数：从对象中获取字段值，支持数字键
function getFieldValue(obj, fieldName) {
    if (!obj) return undefined;
    
    // 先尝试直接访问
    if (obj[fieldName] !== undefined) {
        return obj[fieldName];
    }
    
    // 如果字段名是纯数字字符串，尝试用数字键访问
    const numKey = normalizeFieldKey(fieldName);
    if (numKey !== fieldName && obj[numKey] !== undefined) {
        return obj[numKey];
    }
    
    return undefined;
}

// 工具函数：设置对象字段值，如果字段名是纯数字则使用数字键
function setFieldValue(obj, fieldName, value) {
    if (!obj) return;
    
    const key = normalizeFieldKey(fieldName);
    obj[key] = value;
}

// 全局状态
let currentSchema = null;
let currentSchemaName = '';
let schemas = [];
let isEditMode = false;
let selectedFieldIndex = -1;
let selectedDataRowIndex = -1;
let dataRows = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupGlobalKeyboardShortcuts();
});

// 全局键盘快捷键
function setupGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S 保存
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            // 检查是否在 CodeMirror 编辑器中
            const target = e.target;
            if (target && target.closest && target.closest('.CodeMirror')) {
                // 在 CodeMirror 中，让 CodeMirror 自己处理
                return;
            }
            
            e.preventDefault();
            handleGlobalSave();
        }
    });
}

// 处理全局保存，根据当前状态判断保存哪里
function handleGlobalSave() {
    // 检查是否有打开的模态框
    const openModals = document.querySelectorAll('.modal.show');
    
    // 如果有模态框打开，优先处理模态框中的保存
    for (const modal of openModals) {
        const modalId = modal.id;
        
        // 脚本帮助模态框 - 没有保存按钮，跳过
        if (modalId === 'script-help-modal') {
            continue;
        }
        
        // Lua导出模态框 - 没有真正的保存，但不拦截
        if (modalId === 'export-lua-modal') {
            return;
        }
        
        // 其他模态框不处理 Ctrl+S
        return;
    }
    
    // 没有模态框打开，根据当前激活的面板决定保存行为
    const activeTab = document.querySelector('.nav-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    switch (tabName) {
        case 'schema':
            // Schema 面板
            const schemaEditor = document.getElementById('schema-editor');
            if (schemaEditor && schemaEditor.style.display !== 'none') {
                // 正在编辑 Schema
                saveSchema();
            }
            break;
            
        case 'enum':
            // 枚举面板
            const enumEditor = document.getElementById('enum-editor');
            if (enumEditor && enumEditor.style.display !== 'none') {
                // 正在编辑枚举
                saveEnum();
            }
            break;
            
        case 'data':
            // 配表面板
            const dataEditor = document.getElementById('data-editor');
            if (dataEditor && dataEditor.style.display !== 'none') {
                // 检查是否在预览面板且脚本编辑器有焦点
                const previewPanel = document.querySelector('.data-preview-panel');
                if (previewPanel && previewPanel.style.display !== 'none') {
                    // 在预览面板中，保存脚本
                    if (typeof savePreviewScript === 'function') {
                        savePreviewScript(false);
                    }
                } else {
                    // 在数据编辑面板中，保存数据
                    saveData();
                }
            }
            break;
    }
}

function initializeApp() {
    // 绑定导航标签切换
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // 绑定Schema面板事件
    document.getElementById('add-schema-btn').addEventListener('click', addNewSchema);
    document.getElementById('save-schema-btn').addEventListener('click', saveSchema);
    document.getElementById('cancel-schema-btn').addEventListener('click', cancelSchemaEdit);
    document.getElementById('add-field-btn').addEventListener('click', addField);

    // 绑定枚举面板事件
    document.getElementById('add-enum-btn').addEventListener('click', addNewEnum);
    document.getElementById('save-enum-btn').addEventListener('click', saveEnum);
    document.getElementById('export-enum-lua-btn').addEventListener('click', exportEnumToLua);
    document.getElementById('preview-enum-btn').addEventListener('click', previewEnumValues);
    
    // 绑定枚举文件搜索事件
    const enumFilesSearch = document.getElementById('enum-files-search');
    if (enumFilesSearch) {
        enumFilesSearch.addEventListener('input', searchEnumFiles);
    }
    
    // 绑定侧边栏添加枚举按钮
    const addEnumSidebarBtn = document.getElementById('add-enum-sidebar-btn');
    if (addEnumSidebarBtn) {
        addEnumSidebarBtn.addEventListener('click', addNewEnum);
    }

    // 绑定填充枚举模态框事件
    document.getElementById('confirm-fill-enum-btn').addEventListener('click', confirmFillFromEnum);
    document.getElementById('cancel-fill-enum-btn').addEventListener('click', closeFillEnumModal);
    document.getElementById('close-enum-preview-btn').addEventListener('click', closeEnumPreviewModal);
    
    // 绑定枚举导出模态框事件
    document.getElementById('copy-enum-lua-btn').addEventListener('click', copyEnumLuaCode);
    document.getElementById('download-enum-btn').addEventListener('click', downloadEnumLuaFile);

    // 绑定配表面板事件
    document.getElementById('data-schema-select').addEventListener('change', loadDataForSchema);
    document.getElementById('add-data-row-btn').addEventListener('click', addDataRow);
    document.getElementById('save-data-btn').addEventListener('click', saveData);
    document.getElementById('import-data-btn').addEventListener('click', openImportDataModal);
    document.getElementById('preview-data-btn').addEventListener('click', previewData);
    document.getElementById('export-lua-btn').addEventListener('click', exportToLua);
    
    // 绑定数据行搜索事件
    const dataRowsSearch = document.getElementById('data-rows-search');
    if (dataRowsSearch) {
        dataRowsSearch.addEventListener('input', () => {
            renderDataRowsList();
        });
    }

    // 绑定导出Lua模态框事件
    document.getElementById('copy-lua-btn').addEventListener('click', copyLuaCode);
    document.getElementById('download-export-btn').addEventListener('click', downloadExportFile);
    document.getElementById('export-format-select').addEventListener('change', updateLuaExport);
    document.getElementById('export-namespace').addEventListener('input', updateLuaExport);
    document.getElementById('export-table-key-type').addEventListener('input', updateLuaExport);
    
    // 绑定预览下载按钮
    document.getElementById('download-preview-btn').addEventListener('click', downloadPreviewCsv);
    
    // 绑定导入模态框事件
    document.getElementById('import-file-input').addEventListener('change', onImportFileSelected);
    document.getElementById('confirm-import-btn').addEventListener('click', confirmImport);

    // 绑定模态框事件
    document.getElementById('cancel-delete-btn').addEventListener('click', closeModal);

    // 异步加载数据
    Promise.all([
        loadLuaValueTypes(),  // 加载Lua ValueType数据
        loadSchemas()          // 加载Schema列表
    ]).then(() => {
        console.log('初始化完成');
    }).catch(error => {
        console.error('初始化失败:', error);
    });
}

// ========== 标签切换 ==========
function switchTab(tabName) {
    // 更新标签样式
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 显示对应面板
    document.getElementById('schema-panel').style.display = tabName === 'schema' ? 'block' : 'none';
    document.getElementById('enum-panel').style.display = tabName === 'enum' ? 'block' : 'none';
    document.getElementById('data-panel').style.display = tabName === 'data' ? 'block' : 'none';

    // 如果切换到枚举面板，加载枚举列表并显示编辑器界面
    if (tabName === 'enum') {
        loadEnums().then(() => {
            // 显示编辑器布局
            const enumEditor = document.getElementById('enum-editor');
            if (enumEditor) {
                enumEditor.style.display = 'flex';
            }
            // 如果没有选中的枚举，显示空状态
            if (!currentEnumName) {
                const enumContentEditor = document.getElementById('enum-content-editor');
                if (enumContentEditor) {
                    enumContentEditor.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-hand-pointer"></i>
                            <p>请从左侧选择或添加枚举文件</p>
                        </div>
                    `;
                }
            }
        });
    }

    // 如果切换到配表面板，加载Schema列表
    if (tabName === 'data') {
        loadSchemaSelectOptions();
    }
}


function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 颜色处理函数
function updateColorFromPicker(fieldId, hexColor) {
    // hexColor 格式: #RRGGBB
    const textInput = document.getElementById(fieldId);
    const preview = document.getElementById(`${fieldId}-preview`);
    
    if (textInput) {
        // 转换为 0xRRGGBB 格式
        const hex = hexColor.replace('#', '');
        textInput.value = '0x' + hex.toUpperCase();
    }
    
    if (preview) {
        preview.style.backgroundColor = hexColor;
    }
}

function updateColorFromText(fieldId, value) {
    const picker = document.getElementById(`${fieldId}-picker`);
    const preview = document.getElementById(`${fieldId}-preview`);
    
    // 解析输入的颜色值
    let hex = value.replace(/^0x/i, '').replace(/^#/, '');
    
    // 确保是有效的 hex 颜色
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
        const hexColor = '#' + hex;
        
        if (picker) {
            picker.value = hexColor;
        }
        
        if (preview) {
            preview.style.backgroundColor = hexColor;
        }
    }
}

function showModal(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('confirm-delete-btn');

    messageEl.textContent = message;
    modal.classList.add('show');

    // 移除旧的事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // 添加新的事件监听器
    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

function closeModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('show');
}

// 点击模态框外部关闭
window.addEventListener('click', (e) => {
    const confirmModal = document.getElementById('confirm-modal');
    const luaModal = document.getElementById('export-lua-modal');
    const fillEnumModal = document.getElementById('fill-enum-modal');
    const enumPreviewModal = document.getElementById('enum-preview-modal');
    
    if (e.target === confirmModal) {
        closeModal();
    }
    
    if (e.target === luaModal) {
        closeLuaExportModal();
    }
    
    if (e.target === fillEnumModal) {
        closeFillEnumModal();
    }
    
    if (e.target === enumPreviewModal) {
        closeEnumPreviewModal();
    }
});

// ========== 枚举管理 ==========
