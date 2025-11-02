// API接口配置
const API_BASE = 'http://localhost:5001/api';

const API = {
    SCHEMA: `${API_BASE}/schema`,
    ENUM: `${API_BASE}/enum`,
    DATA: `${API_BASE}/data`
};

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
});

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
    document.getElementById('cancel-enum-btn').addEventListener('click', cancelEnumEdit);
    document.getElementById('add-enum-value-btn').addEventListener('click', addEnumValue);
    document.getElementById('export-enum-lua-btn').addEventListener('click', exportEnumToLua);
    document.getElementById('preview-enum-btn').addEventListener('click', previewEnumValues);
    document.getElementById('enum-type-select').addEventListener('change', onEnumTypeChange);

    // 绑定填充枚举模态框事件
    document.getElementById('confirm-fill-enum-btn').addEventListener('click', confirmFillFromEnum);
    document.getElementById('cancel-fill-enum-btn').addEventListener('click', closeFillEnumModal);
    document.getElementById('close-enum-preview-btn').addEventListener('click', closeEnumPreviewModal);

    // 绑定配表面板事件
    document.getElementById('data-schema-select').addEventListener('change', loadDataForSchema);
    document.getElementById('add-data-row-btn').addEventListener('click', addDataRow);
    document.getElementById('save-data-btn').addEventListener('click', saveData);
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
    document.getElementById('export-format-select').addEventListener('change', updateLuaExport);
    document.getElementById('export-namespace').addEventListener('input', updateLuaExport);
    document.getElementById('export-table-key-type').addEventListener('input', updateLuaExport);

    // 绑定模态框事件
    document.getElementById('cancel-delete-btn').addEventListener('click', closeModal);

    // 加载Schema列表
    loadSchemas();
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

    // 如果切换到枚举面板，加载枚举列表
    if (tabName === 'enum') {
        loadEnums();
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
