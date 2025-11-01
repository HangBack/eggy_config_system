// API接口配置
const API_BASE = 'http://localhost:5000/api';

const API = {
    SCHEMA: `${API_BASE}/schema`,
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

    // 绑定配表面板事件
    document.getElementById('data-schema-select').addEventListener('change', loadDataForSchema);
    document.getElementById('add-data-row-btn').addEventListener('click', addDataRow);
    document.getElementById('save-data-btn').addEventListener('click', saveData);
    document.getElementById('preview-data-btn').addEventListener('click', previewData);
    document.getElementById('export-lua-btn').addEventListener('click', exportToLua);

    // 绑定导出Lua模态框事件
    document.getElementById('copy-lua-btn').addEventListener('click', copyLuaCode);
    document.getElementById('export-format-select').addEventListener('change', updateLuaExport);
    document.getElementById('export-namespace').addEventListener('input', updateLuaExport);

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
    document.getElementById('data-panel').style.display = tabName === 'data' ? 'block' : 'none';

    // 如果切换到配表面板，加载Schema列表
    if (tabName === 'data') {
        loadSchemaSelectOptions();
    }
}

// ========== Schema管理 ==========
async function loadSchemas() {
    try {
        const response = await fetch(`${API.SCHEMA}?action=list`);
        const result = await response.json();
        
        if (result.success) {
            schemas = result.data || [];
            renderSchemaList();
        } else {
            alert('加载Schema列表失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载Schema列表错误:', error);
        alert('加载Schema列表失败');
    }
}

function renderSchemaList() {
    const container = document.getElementById('schema-items');
    container.innerHTML = '';

    schemas.forEach(schema => {
        const item = document.createElement('div');
        item.className = 'schema-item';
        
        const fieldCount = schema.fields ? schema.fields.length : 0;
        
        item.innerHTML = `
            <div class="schema-item-header">
                <div class="schema-item-title">${escapeHtml(schema.name)}</div>
                <div class="schema-item-actions">
                    <button class="btn btn-sm btn-primary" onclick="editSchema('${escapeHtml(schema.name)}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSchema('${escapeHtml(schema.name)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="schema-item-desc">${escapeHtml(schema.description || '无描述')}</div>
            <div class="schema-item-fields">字段数量: ${fieldCount}</div>
        `;
        
        container.appendChild(item);
    });

    if (schemas.length === 0) {
        container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 20px;">暂无Schema，请点击"新建Schema"按钮创建</p>';
    }
}

function addNewSchema() {
    isEditMode = false;
    currentSchemaName = '';
    selectedFieldIndex = -1;
    currentSchema = {
        name: '',
        description: '',
        fields: []
    };

    document.getElementById('schema-editor-title').textContent = '新建Schema';
    document.getElementById('schema-name-input').value = '';
    document.getElementById('schema-name-input').disabled = false;
    document.getElementById('schema-desc-input').value = '';
    document.getElementById('fields-list').innerHTML = '';
    document.getElementById('field-editor-container').innerHTML = '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择或添加字段</p></div>';
    document.getElementById('schema-editor').style.display = 'block';
}

async function editSchema(schemaName) {
    try {
        const response = await fetch(`${API.SCHEMA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const result = await response.json();
        
        if (result.success) {
            isEditMode = true;
            currentSchemaName = schemaName;
            currentSchema = result.data;
            selectedFieldIndex = -1;

            document.getElementById('schema-editor-title').textContent = '编辑Schema';
            document.getElementById('schema-name-input').value = schemaName;
            document.getElementById('schema-name-input').disabled = true;
            document.getElementById('schema-desc-input').value = currentSchema.description || '';
            
            renderFieldsList();
            document.getElementById('field-editor-container').innerHTML = '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择字段</p></div>';
            document.getElementById('schema-editor').style.display = 'block';
        } else {
            alert('加载Schema失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载Schema错误:', error);
        alert('加载Schema失败');
    }
}

async function saveSchema() {
    const name = document.getElementById('schema-name-input').value.trim();
    const description = document.getElementById('schema-desc-input').value.trim();

    if (!name) {
        alert('请输入Schema名称');
        return;
    }

    // 验证Schema名称格式
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        alert('Schema名称只能包含字母、数字、下划线和连字符');
        return;
    }

    currentSchema.name = name;
    currentSchema.description = description;

    // 收集字段定义
    currentSchema.fields = collectFields();
    
    // 保存导出配置
    if (!currentSchema.exportConfig) {
        currentSchema.exportConfig = {};
    }
    currentSchema.exportConfig.namespace = document.getElementById('export-namespace')?.value.trim() || 'Tile';
    currentSchema.exportConfig.requires = [...requireItems];

    try {
        // 如果是更新模式，先加载旧的Schema用于迁移检查
        let oldSchema = null;
        if (isEditMode) {
            try {
                const schemaResponse = await fetch(`${API.SCHEMA}?action=get&name=${encodeURIComponent(name)}`);
                const schemaResult = await schemaResponse.json();
                if (schemaResult.success && schemaResult.data) {
                    oldSchema = schemaResult.data;
                }
            } catch (error) {
                console.error('加载旧Schema失败:', error);
            }
        }
        
        const action = isEditMode ? 'update' : 'create';
        const response = await fetch(API.SCHEMA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: action,
                name: name,
                data: currentSchema
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // 如果是更新模式，检查是否需要迁移数据
            if (isEditMode && oldSchema) {
                const shouldMigrate = await confirmMigration(name, currentSchema, oldSchema);
                if (shouldMigrate) {
                    await migrateDataForSchemaChange(name, currentSchema, oldSchema);
                }
            }
            
            alert(isEditMode ? 'Schema更新成功' : 'Schema创建成功');
            cancelSchemaEdit();
            loadSchemas();
        } else {
            alert('保存Schema失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存Schema错误:', error);
        alert('保存Schema失败');
    }
}

// 检查Schema变更并确认是否需要迁移
async function confirmMigration(schemaName, newSchema, oldSchema) {
    try {
        if (!oldSchema) {
            // 没有原始Schema，不需要迁移
            return false;
        }
        
        const oldFields = oldSchema.fields || [];
        const newFields = newSchema.fields || [];
        
        const changes = {
            added: [],
            removed: [],
            modified: []
        };
        
        // 检查字段变化
        const oldFieldMap = new Map(oldFields.map(f => [f.name, f]));
        const newFieldMap = new Map(newFields.map(f => [f.name, f]));
        
        // 找出删除的字段
        oldFields.forEach(oldField => {
            if (!newFieldMap.has(oldField.name)) {
                changes.removed.push(oldField.label || oldField.name);
            }
        });
        
        // 找出新增和修改的字段
        newFields.forEach(newField => {
            const oldField = oldFieldMap.get(newField.name);
            if (!oldField) {
                changes.added.push(newField.label || newField.name);
            } else if (newField.type === 'entry' && oldField.type === 'entry') {
                // 检查子字段变化
                const oldSubfields = oldField.subfields || [];
                const newSubfields = newField.subfields || [];
                const oldSubMap = new Map(oldSubfields.map(s => [s.name, s]));
                const newSubMap = new Map(newSubfields.map(s => [s.name, s]));
                
                const removedSubs = oldSubfields.filter(s => !newSubMap.has(s.name));
                const addedSubs = newSubfields.filter(s => !oldSubMap.has(s.name));
                
                if (removedSubs.length > 0 || addedSubs.length > 0) {
                    const subfieldChanges = [];
                    if (addedSubs.length > 0) {
                        subfieldChanges.push(`新增: ${addedSubs.map(s => s.label || s.name).join(', ')}`);
                    }
                    if (removedSubs.length > 0) {
                        subfieldChanges.push(`删除: ${removedSubs.map(s => s.label || s.name).join(', ')}`);
                    }
                    changes.modified.push(`${newField.label || newField.name} (${subfieldChanges.join('; ')})`);
                }
            }
        });
        
        // 如果有变化，显示确认对话框
        if (changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0) {
            let message = '检测到Schema字段变化，将自动同步更新配表数据：\n\n';
            
            if (changes.added.length > 0) {
                message += `✅ 新增字段（将使用默认值）：\n${changes.added.map(f => '  • ' + f).join('\n')}\n\n`;
            }
            if (changes.removed.length > 0) {
                message += `⚠️ 删除字段（数据将丢失）：\n${changes.removed.map(f => '  • ' + f).join('\n')}\n\n`;
            }
            if (changes.modified.length > 0) {
                message += `🔄 修改字段：\n${changes.modified.map(f => '  • ' + f).join('\n')}\n\n`;
            }
            
            message += '是否继续保存并更新数据？';
            
            return confirm(message);
        }
        
        // 没有变化，直接返回true
        return true;
    } catch (error) {
        console.error('检查Schema变更错误:', error);
        // 出错时默认执行迁移
        return true;
    }
}

// 根据字段类型获取正确的默认值
function getTypedDefaultValue(field) {
    const defaultValue = field.defaultValue;
    
    // 如果默认值为 undefined 或 null，返回类型相关的默认值
    if (defaultValue === undefined || defaultValue === null || defaultValue === '') {
        switch (field.type) {
            case 'number':
                return 0;
            case 'color':
                return '0xFFFFFF';
            case 'entry':
                return [];
            default:
                return '';
        }
    }
    
    // 根据类型转换默认值
    switch (field.type) {
        case 'number':
            const num = Number(defaultValue);
            return isNaN(num) ? 0 : num;
        case 'color':
            // 确保颜色值是 0x 格式
            const colorStr = String(defaultValue);
            if (/^0x[0-9A-Fa-f]{6}$/i.test(colorStr)) {
                return colorStr.toUpperCase();
            }
            return '0xFFFFFF';
        case 'entry':
            return Array.isArray(defaultValue) ? defaultValue : [];
        default:
            return String(defaultValue);
    }
}

// 当Schema修改后，迁移对应的配表数据
async function migrateDataForSchemaChange(schemaName, newSchema, oldSchema) {
    try {
        // 加载现有数据
        const dataResponse = await fetch(`${API.DATA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const dataResult = await dataResponse.json();
        
        if (!dataResult.success || !dataResult.data) {
            // 没有数据，无需迁移
            return;
        }
        
        const existingData = dataResult.data;
        const newFields = newSchema.fields || [];
        const oldFields = oldSchema ? (oldSchema.fields || []) : [];
        
        // 创建旧字段映射（包括子字段）
        const oldFieldMap = new Map(oldFields.map(f => [f.name, f]));
        const oldSubfieldMaps = new Map();
        oldFields.forEach(field => {
            if (field.type === 'entry' && field.subfields) {
                oldSubfieldMaps.set(field.name, new Map(field.subfields.map(s => [s.name, s])));
            }
        });
        
        // 迁移条目数组中的每个条目对象
        function migrateEntryItems(oldEntries, newSubfields, oldSubfieldMap, oldSubfields) {
            if (!Array.isArray(oldEntries)) {
                return [];
            }
            
            // 为新字段建立与旧字段的映射（按顺序和类型匹配）
            const fieldMapping = new Map();
            const usedOldFields = new Set();
            
            // 首先处理同名字段
            newSubfields.forEach(newSubfield => {
                if (oldSubfieldMap && oldSubfieldMap.has(newSubfield.name)) {
                    const oldSubfield = oldSubfieldMap.get(newSubfield.name);
                    if (oldSubfield.type === newSubfield.type) {
                        fieldMapping.set(newSubfield.name, newSubfield.name);
                        usedOldFields.add(newSubfield.name);
                    }
                }
            });
            
            // 然后按顺序匹配未映射的新字段和未使用的旧字段（类型一致）
            const unmappedNewFields = newSubfields.filter(f => !fieldMapping.has(f.name));
            const unmappedOldFields = oldSubfields ? oldSubfields.filter(f => !usedOldFields.has(f.name)) : [];
            
            let oldFieldIndex = 0;
            unmappedNewFields.forEach(newSubfield => {
                // 查找下一个类型匹配的旧字段
                while (oldFieldIndex < unmappedOldFields.length) {
                    const oldSubfield = unmappedOldFields[oldFieldIndex];
                    if (oldSubfield.type === newSubfield.type) {
                        fieldMapping.set(newSubfield.name, oldSubfield.name);
                        oldFieldIndex++;
                        break;
                    }
                    oldFieldIndex++;
                }
            });
            
            return oldEntries.map((oldEntry, entryIndex) => {
                const newEntry = {};
                newSubfields.forEach(newSubfield => {
                    const mappedOldFieldName = fieldMapping.get(newSubfield.name);
                    
                    // 使用工具函数获取字段值，支持数字键
                    const mappedValue = mappedOldFieldName ? getFieldValue(oldEntry, mappedOldFieldName) : undefined;
                    const directValue = getFieldValue(oldEntry, newSubfield.name);
                    
                    if (mappedOldFieldName && mappedValue !== undefined) {
                        // 从映射的旧字段获取值，使用数字键设置
                        setFieldValue(newEntry, newSubfield.name, mappedValue);
                    } else if (directValue !== undefined) {
                        // 直接使用同名字段的值，使用数字键设置
                        setFieldValue(newEntry, newSubfield.name, directValue);
                    } else {
                        // 使用默认值，使用数字键设置
                        const defaultValue = getTypedDefaultValue(newSubfield);
                        setFieldValue(newEntry, newSubfield.name, defaultValue);
                    }
                });
                return newEntry;
            });
        }
        
        // 迁移每一行数据
        const migratedData = existingData.map(row => {
            // 兼容新旧格式
            const oldData = row.data !== undefined ? row.data : row;
            const newData = {};
            
            // 遍历新Schema的字段
            newFields.forEach(field => {
                const oldField = oldFieldMap.get(field.name);
                
                if (field.type === 'entry') {
                    // 处理条目类型字段
                    const oldEntries = oldData[field.name];
                    const oldSubfieldMap = oldSubfieldMaps.get(field.name);
                    const oldFieldData = oldField && oldField.type === 'entry' ? oldField : null;
                    const oldSubfields = oldFieldData ? oldFieldData.subfields : null;
                    
                    if (oldEntries !== undefined && Array.isArray(oldEntries)) {
                        // 字段存在且是数组，迁移每个条目的子字段
                        newData[field.name] = migrateEntryItems(oldEntries, field.subfields || [], oldSubfieldMap, oldSubfields);
                    } else {
                        // 字段不存在或格式不对，使用空数组
                        newData[field.name] = [];
                    }
                } else {
                    // 处理普通字段
                    if (oldData[field.name] !== undefined) {
                        // 字段存在
                        if (oldField && oldField.type === field.type) {
                            // 类型一致，保留原值
                            newData[field.name] = oldData[field.name];
                        } else if (!oldField) {
                            // 旧schema中不存在但数据中有，保留
                            newData[field.name] = oldData[field.name];
                        } else {
                            // 类型不一致，使用默认值
                            newData[field.name] = getTypedDefaultValue(field);
                        }
                    } else {
                        // 新增字段，使用默认值
                        newData[field.name] = getTypedDefaultValue(field);
                    }
                }
            });
            
            // 保留元数据
            if (row.name !== undefined && row.data !== undefined) {
                return {
                    name: row.name,
                    isRaw: row.isRaw || false,
                    data: newData
                };
            } else {
                return newData;
            }
        });
        
        // 保存迁移后的数据
        const saveResponse = await fetch(API.DATA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: schemaName,
                data: migratedData
            })
        });
        
        const saveResult = await saveResponse.json();
        if (saveResult.success) {
            console.log('配表数据已同步更新');
        } else {
            console.error('配表数据同步失败:', saveResult.error);
        }
    } catch (error) {
        console.error('迁移配表数据错误:', error);
    }
}

function cancelSchemaEdit() {
    document.getElementById('schema-editor').style.display = 'none';
    currentSchema = null;
    currentSchemaName = '';
    selectedFieldIndex = -1;
}

async function deleteSchema(schemaName) {
    showModal(`确定要删除Schema "${schemaName}" 吗？这将同时删除关联的配表数据。`, async () => {
        try {
            const response = await fetch(API.SCHEMA, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'delete',
                    name: schemaName
                })
            });

            const result = await response.json();
            
            if (result.success) {
                alert('Schema删除成功');
                loadSchemas();
            } else {
                alert('删除Schema失败: ' + result.error);
            }
        } catch (error) {
            console.error('删除Schema错误:', error);
            alert('删除Schema失败');
        }
    });
}

// ========== 字段管理 ==========
function addField() {
    const field = {
        name: '',
        label: '',
        type: 'text',
        required: false,
        defaultValue: '',
        options: [],
        subfields: []
    };

    if (!currentSchema.fields) {
        currentSchema.fields = [];
    }
    currentSchema.fields.push(field);
    selectedFieldIndex = currentSchema.fields.length - 1;
    renderFieldsList();
    renderFieldEditor(selectedFieldIndex);
}

function renderFieldsList() {
    const container = document.getElementById('fields-list');
    container.innerHTML = '';

    currentSchema.fields.forEach((field, index) => {
        const item = createFieldListItem(field, index);
        container.appendChild(item);
    });
}

function createFieldListItem(field, index) {
    const div = document.createElement('div');
    div.className = 'field-list-item';
    if (index === selectedFieldIndex) {
        div.classList.add('active');
    }
    
    const typeMap = {
        'text': '文本',
        'number': '数字',
        'entry': '条目',
        'option': '选项',
        'datalist': '数据列表'
    };
    
    div.innerHTML = `
        <div class="field-list-item-header">
            <span class="field-list-item-name">${escapeHtml(field.name || '未命名字段')}</span>
            <span class="field-list-item-type">${typeMap[field.type] || field.type}</span>
        </div>
        <div class="field-list-item-label">${escapeHtml(field.label || '无标签')}</div>
    `;
    
    div.addEventListener('click', () => {
        selectedFieldIndex = index;
        renderFieldsList();
        renderFieldEditor(index);
    });
    
    return div;
}

function renderFieldEditor(index) {
    const container = document.getElementById('field-editor-container');
    const field = currentSchema.fields[index];
    
    container.innerHTML = '';
    
    const editor = document.createElement('div');
    editor.className = 'field-editor';
    editor.innerHTML = createFieldEditorHTML(field, index);
    container.appendChild(editor);
    
    // 绑定事件
    bindFieldEditorEvents(index);
}

function createFieldEditorHTML(field, index) {
    const showRawOption = field.type === 'text' || field.type === 'option' || field.type === 'datalist';
    
    return `
        <div class="field-editor-header">
            <h4>编辑字段 ${index + 1}</h4>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeField(${index})">
                <i class="fas fa-trash"></i> 删除字段
            </button>
        </div>
        
        <div class="field-compact-row">
            <div class="form-group">
                <label>字段名称</label>
                <input type="text" id="field-name-${index}" class="form-control" value="${escapeHtml(field.name)}" placeholder="field_name">
            </div>
            <div class="form-group">
                <label>字段标签</label>
                <input type="text" id="field-label-${index}" class="form-control" value="${escapeHtml(field.label)}" placeholder="字段显示名称">
            </div>
            <div class="form-group">
                <label>字段类型</label>
                <select id="field-type-${index}" class="form-control">
                    <option value="text" ${field.type === 'text' ? 'selected' : ''}>文本</option>
                    <option value="number" ${field.type === 'number' ? 'selected' : ''}>数字</option>
                    <option value="color" ${field.type === 'color' ? 'selected' : ''}>颜色</option>
                    <option value="entry" ${field.type === 'entry' ? 'selected' : ''}>条目</option>
                    <option value="option" ${field.type === 'option' ? 'selected' : ''}>选项</option>
                    <option value="datalist" ${field.type === 'datalist' ? 'selected' : ''}>数据列表</option>
                </select>
            </div>
            <div class="form-group">
                <label>默认值</label>
                <input type="text" id="field-default-${index}" class="form-control" value="${escapeHtml(field.defaultValue || '')}" placeholder="默认值">
            </div>
        </div>
        
        <div class="field-compact-row">
            <div class="form-group">
                <label>Lua注解类型（可选）</label>
                <input type="text" id="field-luatype-${index}" class="form-control" value="${escapeHtml(field.luaType || '')}" placeholder="留空使用默认类型，如: ConfigType">
            </div>
        </div>
        
        <div class="field-options-row">
            <label>
                <input type="checkbox" id="field-required-${index}" ${field.required ? 'checked' : ''}> 必填
            </label>
            ${showRawOption ? `
            <label>
                <input type="checkbox" id="field-raw-${index}" ${field.isRaw ? 'checked' : ''}> 原始文本
            </label>
            ` : ''}
        </div>
        
        <div id="field-type-specific-${index}">
            ${renderFieldTypeSpecific(field, index)}
        </div>
    `;
}

function bindFieldEditorEvents(index) {
    // 绑定输入事件，实时更新字段数据和列表显示
    const nameInput = document.getElementById(`field-name-${index}`);
    const labelInput = document.getElementById(`field-label-${index}`);
    const typeSelect = document.getElementById(`field-type-${index}`);
    const defaultInput = document.getElementById(`field-default-${index}`);
    const luaTypeInput = document.getElementById(`field-luatype-${index}`);
    const requiredCheckbox = document.getElementById(`field-required-${index}`);
    const rawCheckbox = document.getElementById(`field-raw-${index}`);
    
    const updateField = () => {
        currentSchema.fields[index].name = nameInput.value;
        currentSchema.fields[index].label = labelInput.value;
        currentSchema.fields[index].type = typeSelect.value;
        currentSchema.fields[index].defaultValue = defaultInput.value;
        currentSchema.fields[index].luaType = luaTypeInput.value.trim();
        currentSchema.fields[index].required = requiredCheckbox.checked;
        if (rawCheckbox) {
            currentSchema.fields[index].isRaw = rawCheckbox.checked;
        }
        renderFieldsList();
    };
    
    nameInput.addEventListener('input', updateField);
    labelInput.addEventListener('input', updateField);
    defaultInput.addEventListener('input', updateField);
    luaTypeInput.addEventListener('input', updateField);
    requiredCheckbox.addEventListener('change', updateField);
    if (rawCheckbox) {
        rawCheckbox.addEventListener('change', updateField);
    }
    
    typeSelect.addEventListener('change', () => {
        currentSchema.fields[index].type = typeSelect.value;
        renderFieldsList();
        renderFieldEditor(index);
    });
}

function renderFieldTypeSpecific(field, index) {
    if (field.type === 'option') {
        const dataSourceType = field.dataSource?.type || 'manual';
        const linkedSchema = field.dataSource?.schema || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select id="field-datasource-type-${index}" class="form-control" onchange="updateDataSourceType(${index}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                </select>
            </div>
            <div id="field-datasource-config-${index}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>选项列表（每行一个）</label>
                        <textarea id="field-options-${index}" class="form-control" rows="4" placeholder="选项1&#10;选项2&#10;选项3">${(field.options || []).join('\n')}</textarea>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select id="field-linked-schema-${index}" class="form-control">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    } else if (field.type === 'datalist') {
        const dataSourceType = field.dataSource?.type || 'manual';
        const linkedSchema = field.dataSource?.schema || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select id="field-datasource-type-${index}" class="form-control" onchange="updateDataSourceType(${index}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                </select>
            </div>
            <div id="field-datasource-config-${index}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>数据列表配置（格式: value|label，每行一个）</label>
                        <textarea id="field-datalist-${index}" class="form-control" rows="4" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(field.options || [])}</textarea>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select id="field-linked-schema-${index}" class="form-control">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    } else if (field.type === 'entry') {
        return `
            <div class="entry-subfields">
                <div class="entry-subfields-header">
                    <h6>条目子字段定义</h6>
                    <button type="button" class="btn btn-sm btn-primary" onclick="addSubfield(${index})">
                        <i class="fas fa-plus"></i> 添加子字段
                    </button>
                </div>
                <div class="subfields-container" data-parent="${index}">
                    ${renderSubfields(field.subfields || [], index)}
                </div>
            </div>
        `;
    }
    return '';
}

function renderSubfields(subfields, parentIndex) {
    return subfields.map((subfield, subIndex) => `
        <div class="subfield-item" data-parent="${parentIndex}" data-subindex="${subIndex}">
            <div class="subfield-item-header">
                <h6>子字段 ${subIndex + 1}</h6>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeSubfield(${parentIndex}, ${subIndex})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="field-compact-row">
                <div class="form-group">
                    <label>字段名称</label>
                    <input type="text" class="form-control subfield-name" value="${escapeHtml(subfield.name)}" placeholder="field_name">
                </div>
                <div class="form-group">
                    <label>字段标签</label>
                    <input type="text" class="form-control subfield-label" value="${escapeHtml(subfield.label)}" placeholder="字段显示名称">
                </div>
                <div class="form-group">
                    <label>字段类型</label>
                    <select class="form-control subfield-type" onchange="updateSubfieldType(${parentIndex}, ${subIndex}, this.value)">
                        <option value="text" ${subfield.type === 'text' ? 'selected' : ''}>文本</option>
                        <option value="number" ${subfield.type === 'number' ? 'selected' : ''}>数字</option>
                        <option value="color" ${subfield.type === 'color' ? 'selected' : ''}>颜色</option>
                        <option value="option" ${subfield.type === 'option' ? 'selected' : ''}>选项</option>
                        <option value="datalist" ${subfield.type === 'datalist' ? 'selected' : ''}>数据列表</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>默认值</label>
                    <input type="text" class="form-control subfield-default" value="${escapeHtml(subfield.defaultValue || '')}" placeholder="默认值">
                </div>
            </div>
            <div class="field-compact-row">
                <div class="form-group">
                    <label>Lua注解类型（可选）</label>
                    <input type="text" class="form-control subfield-luatype" value="${escapeHtml(subfield.luaType || '')}" placeholder="留空使用默认类型">
                </div>
            </div>
            <div class="field-options-row">
                ${(subfield.type === 'text' || subfield.type === 'option' || subfield.type === 'datalist') ? `
                <label>
                    <input type="checkbox" class="subfield-raw" ${subfield.isRaw ? 'checked' : ''}>
                    原始文本
                </label>
                ` : ''}
            </div>
            <div class="subfield-type-specific-${parentIndex}-${subIndex}">
                ${renderSubfieldTypeSpecific(subfield, parentIndex, subIndex)}
            </div>
        </div>
    `).join('');
}

function renderSubfieldTypeSpecific(subfield, parentIndex, subIndex) {
    if (subfield.type === 'option') {
        const dataSourceType = subfield.dataSource?.type || 'manual';
        const linkedSchema = subfield.dataSource?.schema || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select class="form-control subfield-datasource-type" onchange="updateSubfieldDataSourceType(${parentIndex}, ${subIndex}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                </select>
            </div>
            <div class="subfield-datasource-config-${parentIndex}-${subIndex}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>选项列表（每行一个）</label>
                        <textarea class="form-control subfield-options" rows="3" placeholder="选项1&#10;选项2&#10;选项3">${(subfield.options || []).join('\n')}</textarea>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select class="form-control subfield-linked-schema">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    } else if (subfield.type === 'datalist') {
        const dataSourceType = subfield.dataSource?.type || 'manual';
        const linkedSchema = subfield.dataSource?.schema || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select class="form-control subfield-datasource-type" onchange="updateSubfieldDataSourceType(${parentIndex}, ${subIndex}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                </select>
            </div>
            <div class="subfield-datasource-config-${parentIndex}-${subIndex}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>数据列表配置（格式: value|label，每行一个）</label>
                        <textarea class="form-control subfield-datalist" rows="3" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(subfield.options || [])}</textarea>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select class="form-control subfield-linked-schema">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    }
    return '';
}

function formatDatalist(options) {
    return options.map(opt => {
        if (typeof opt === 'object' && opt.value && opt.label) {
            return `${opt.value}|${opt.label}`;
        }
        return opt;
    }).join('\n');
}

function updateDataSourceType(fieldIndex, type) {
    const field = currentSchema.fields[fieldIndex];
    if (!field.dataSource) {
        field.dataSource = {};
    }
    field.dataSource.type = type;
    
    // 重新渲染字段特定区域
    document.getElementById(`field-type-specific-${fieldIndex}`).innerHTML = 
        renderFieldTypeSpecific(field, fieldIndex);
}

function updateSubfieldType(parentIndex, subIndex, type) {
    const subfield = currentSchema.fields[parentIndex].subfields[subIndex];
    subfield.type = type;
    
    // 重新渲染子字段类型特定区域
    const container = document.querySelector(`.subfield-type-specific-${parentIndex}-${subIndex}`);
    if (container) {
        container.innerHTML = renderSubfieldTypeSpecific(subfield, parentIndex, subIndex);
    }
    
    // 更新原始文本复选框的显示
    const optionsRow = container.previousElementSibling;
    if (optionsRow && optionsRow.classList.contains('field-options-row')) {
        optionsRow.innerHTML = (type === 'text' || type === 'option' || type === 'datalist') ? `
            <label>
                <input type="checkbox" class="subfield-raw" ${subfield.isRaw ? 'checked' : ''}>
                原始文本
            </label>
        ` : '';
    }
}

function updateSubfieldDataSourceType(parentIndex, subIndex, type) {
    const subfield = currentSchema.fields[parentIndex].subfields[subIndex];
    if (!subfield.dataSource) {
        subfield.dataSource = {};
    }
    subfield.dataSource.type = type;
    
    // 重新渲染子字段特定区域
    document.querySelector(`.subfield-datasource-config-${parentIndex}-${subIndex}`).innerHTML = 
        type === 'manual' ? 
        (subfield.type === 'option' ? `
            <div class="form-group">
                <label>选项列表（每行一个）</label>
                <textarea class="form-control subfield-options" rows="3" placeholder="选项1&#10;选项2&#10;选项3">${(subfield.options || []).join('\n')}</textarea>
            </div>
        ` : `
            <div class="form-group">
                <label>数据列表配置（格式: value|label，每行一个）</label>
                <textarea class="form-control subfield-datalist" rows="3" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(subfield.options || [])}</textarea>
            </div>
        `) : `
            <div class="form-group">
                <label>关联的配表</label>
                <select class="form-control subfield-linked-schema">
                    <option value="">-- 请选择配表 --</option>
                    ${schemas.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                </select>
            </div>
        `;
}

function addSubfield(parentIndex) {
    const field = currentSchema.fields[parentIndex];
    if (!field.subfields) {
        field.subfields = [];
    }
    field.subfields.push({
        name: '',
        label: '',
        type: 'text',
        defaultValue: '',
        options: []
    });

    // 重新渲染字段特定区域
    document.getElementById(`field-type-specific-${parentIndex}`).innerHTML = 
        renderFieldTypeSpecific(field, parentIndex);
}

function removeSubfield(parentIndex, subIndex) {
    currentSchema.fields[parentIndex].subfields.splice(subIndex, 1);
    
    // 重新渲染字段特定区域
    document.getElementById(`field-type-specific-${parentIndex}`).innerHTML = 
        renderFieldTypeSpecific(currentSchema.fields[parentIndex], parentIndex);
}

function removeField(index) {
    currentSchema.fields.splice(index, 1);
    
    // 如果删除的是当前选中的字段，重置选择
    if (selectedFieldIndex === index) {
        selectedFieldIndex = -1;
        document.getElementById('field-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择字段</p></div>';
    } else if (selectedFieldIndex > index) {
        selectedFieldIndex--;
    }
    
    renderFieldsList();
    
    // 如果还有字段且之前有选中，重新渲染编辑器
    if (selectedFieldIndex >= 0 && selectedFieldIndex < currentSchema.fields.length) {
        renderFieldEditor(selectedFieldIndex);
    }
}

function collectFields() {
    // 现在字段数据已经在currentSchema中实时更新了
    // 但我们需要收集类型特定的配置（选项、数据列表等）
    currentSchema.fields.forEach((field, index) => {
        if (field.type === 'option' || field.type === 'datalist') {
            // 收集数据源配置
            const dataSourceTypeSelect = document.getElementById(`field-datasource-type-${index}`);
            if (dataSourceTypeSelect) {
                if (!field.dataSource) {
                    field.dataSource = {};
                }
                field.dataSource.type = dataSourceTypeSelect.value;
                
                if (field.dataSource.type === 'manual') {
                    // 手动输入
                    if (field.type === 'option') {
                        const optionsElement = document.getElementById(`field-options-${index}`);
                        if (optionsElement) {
                            const optionsText = optionsElement.value.trim();
                            field.options = optionsText ? optionsText.split('\n').filter(opt => opt.trim()) : [];
                        }
                    } else {
                        const datalistElement = document.getElementById(`field-datalist-${index}`);
                        if (datalistElement) {
                            const datalistText = datalistElement.value.trim();
                            field.options = datalistText ? datalistText.split('\n').map(line => {
                                const parts = line.trim().split('|');
                                return parts.length === 2 ? { value: parts[0].trim(), label: parts[1].trim() } : line.trim();
                            }).filter(opt => opt) : [];
                        }
                    }
                } else {
                    // 关联配表
                    const linkedSchemaSelect = document.getElementById(`field-linked-schema-${index}`);
                    if (linkedSchemaSelect) {
                        field.dataSource.schema = linkedSchemaSelect.value;
                    }
                }
            }
        } else if (field.type === 'entry') {
            field.subfields = collectSubfields(index);
        }
    });

    return currentSchema.fields;
}

function collectSubfields(parentIndex) {
    const subfields = [];
    const subfieldElements = document.querySelectorAll(`.subfield-item[data-parent="${parentIndex}"]`);

    subfieldElements.forEach(element => {
        const subfield = {
            name: element.querySelector('.subfield-name').value.trim(),
            label: element.querySelector('.subfield-label').value.trim(),
            type: element.querySelector('.subfield-type').value,
            defaultValue: element.querySelector('.subfield-default').value.trim()
        };

        // 收集 Lua 类型
        const luaTypeInput = element.querySelector('.subfield-luatype');
        if (luaTypeInput) {
            subfield.luaType = luaTypeInput.value.trim();
        }

        // 收集原始文本标记
        const rawCheckbox = element.querySelector('.subfield-raw');
        if (rawCheckbox) {
            subfield.isRaw = rawCheckbox.checked;
        }

        // 处理类型特定配置
        if (subfield.type === 'option' || subfield.type === 'datalist') {
            // 检查数据源类型
            const dataSourceTypeElement = element.querySelector('.subfield-datasource-type');
            if (dataSourceTypeElement) {
                const dataSourceType = dataSourceTypeElement.value;
                subfield.dataSource = { type: dataSourceType };

                if (dataSourceType === 'manual') {
                    if (subfield.type === 'option') {
                        const optionsElement = element.querySelector('.subfield-options');
                        if (optionsElement) {
                            const optionsText = optionsElement.value.trim();
                            subfield.options = optionsText ? optionsText.split('\n').filter(opt => opt.trim()) : [];
                        }
                    } else if (subfield.type === 'datalist') {
                        const datalistElement = element.querySelector('.subfield-datalist');
                        if (datalistElement) {
                            const datalistText = datalistElement.value.trim();
                            subfield.options = datalistText ? datalistText.split('\n').map(line => {
                                const parts = line.trim().split('|');
                                return parts.length === 2 ? { value: parts[0].trim(), label: parts[1].trim() } : line.trim();
                            }).filter(opt => opt) : [];
                        }
                    }
                } else if (dataSourceType === 'linked') {
                    const linkedSchemaElement = element.querySelector('.subfield-linked-schema');
                    if (linkedSchemaElement) {
                        subfield.dataSource.schema = linkedSchemaElement.value;
                    }
                }
            }
        }

        subfields.push(subfield);
    });

    return subfields;
}

// ========== 配表管理 ==========
async function loadSchemaSelectOptions() {
    const inputElement = document.getElementById('data-schema-select');
    const dropdownElement = document.getElementById('data-schema-select-dropdown');
    
    try {
        const response = await fetch(`${API.SCHEMA}?action=list`);
        const result = await response.json();
        
        if (result.success) {
            schemas = result.data || [];
            
            // 格式化为 datalist 选项格式
            const options = schemas.map(schema => ({
                value: schema.name,
                label: schema.description || ''
            }));
            
            // 初始化自定义 datalist
            initCustomDatalist(inputElement, dropdownElement, options);
            
            // 监听选择事件
            inputElement.removeEventListener('change', loadDataForSchema);
            inputElement.addEventListener('change', loadDataForSchema);
        }
    } catch (error) {
        console.error('加载Schema选项错误:', error);
    }
}

async function loadDataForSchema() {
    const schemaName = document.getElementById('data-schema-select').value;
    
    if (!schemaName) {
        document.getElementById('data-editor').style.display = 'none';
        return;
    }

    // 在切换 schema 前，保存当前编辑的数据（如果有的话）
    if (currentSchema && selectedDataRowIndex >= 0) {
        saveCurrentEditToMemory();
    }

    try {
        // 加载Schema定义
        const schemaResponse = await fetch(`${API.SCHEMA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const schemaResult = await schemaResponse.json();
        
        if (!schemaResult.success) {
            alert('加载Schema失败');
            return;
        }

        currentSchema = schemaResult.data;
        currentSchemaName = schemaName;

        // 加载数据
        const dataResponse = await fetch(`${API.DATA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const dataResult = await dataResponse.json();
        
        dataRows = [];
        if (dataResult.success) {
            const loadedData = dataResult.data || [];
            dataRows = loadedData.map((row, index) => {
                // 兼容新旧格式：新格式有 name 和 data 字段，旧格式直接是数据
                if (row.name !== undefined && row.data !== undefined) {
                    // 新格式
                    return {
                        name: row.name,
                        isRaw: row.isRaw || false,
                        data: row.data
                    };
                } else {
                    // 旧格式（向后兼容）
                    return {
                        name: `数据行 ${index + 1}`,
                        isRaw: false,
                        data: row
                    };
                }
            });
        }

        selectedDataRowIndex = -1;
        renderDataRowsList();
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择或添加数据行</p></div>';
        document.getElementById('data-editor').style.display = 'block';
        document.getElementById('data-table-title').textContent = `${schemaName} - 配表数据`;
        document.getElementById('preview-data-btn').style.display = 'inline-flex';
        document.getElementById('export-lua-btn').style.display = 'inline-flex';
    } catch (error) {
        console.error('加载数据错误:', error);
        alert('加载数据失败');
    }
}

function renderDataRowsList() {
    const container = document.getElementById('data-rows-list');
    container.innerHTML = '';

    dataRows.forEach((dataRow, index) => {
        const item = createDataRowListItem(dataRow, index);
        container.appendChild(item);
    });

    if (dataRows.length === 0) {
        container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 20px;">暂无数据</p>';
    }
}

function createDataRowListItem(dataRow, index) {
    const div = document.createElement('div');
    div.className = 'data-row-list-item';
    if (index === selectedDataRowIndex) {
        div.classList.add('active');
    }
    
    div.innerHTML = `
        <div class="data-row-list-item-name">${escapeHtml(dataRow.name)}</div>
        <div class="data-row-list-item-actions">
            <button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeDataRow(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    div.addEventListener('click', () => {
        // 在切换前保存当前编辑的数据到内存
        saveCurrentEditToMemory();
        
        selectedDataRowIndex = index;
        renderDataRowsList();
        renderDataRowEditor(index);
    });
    
    return div;
}

function updateDataRowName(index, newName) {
    dataRows[index].name = newName;
}

// 将当前编辑器中的数据保存到内存中的 dataRows
function saveCurrentEditToMemory() {
    if (selectedDataRowIndex < 0 || selectedDataRowIndex >= dataRows.length) {
        return; // 没有选中的数据行
    }
    
    const fields = currentSchema.fields || [];
    const currentData = {};
    
    fields.forEach(field => {
        if (field.type === 'entry') {
            const container = document.querySelector(`.entry-container[data-row="${selectedDataRowIndex}"][data-field="${field.name}"]`);
            if (container) {
                currentData[field.name] = collectEntryDataFromContainer(container, field);
            } else {
                // 如果容器不存在，保持原有数据
                currentData[field.name] = getFieldValue(dataRows[selectedDataRowIndex].data, field.name) || [];
            }
        } else {
            const input = document.querySelector(`#field-${selectedDataRowIndex}-${field.name}`);
            if (input) {
                currentData[field.name] = input.value;
            } else {
                // 如果输入框不存在，保持原有数据
                currentData[field.name] = getFieldValue(dataRows[selectedDataRowIndex].data, field.name) || '';
            }
        }
    });
    
    // 更新内存中的数据
    dataRows[selectedDataRowIndex].data = currentData;
}

async function renderDataRowEditor(index) {
    const container = document.getElementById('data-row-editor-container');
    const dataRow = dataRows[index];
    
    container.innerHTML = '';
    
    const editor = document.createElement('div');
    editor.className = 'data-row-editor';
    editor.innerHTML = createDataRowEditorHTML(dataRow, index);
    container.appendChild(editor);
    
    // 绑定名称输入框事件
    const nameInput = document.getElementById(`data-row-name-input-${index}`);
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            dataRows[index].name = nameInput.value;
            renderDataRowsList();
        });
    }
    
    // 绑定原始文本复选框事件
    const rawCheckbox = document.getElementById(`data-row-raw-${index}`);
    if (rawCheckbox) {
        rawCheckbox.addEventListener('change', () => {
            dataRows[index].isRaw = rawCheckbox.checked;
        });
    }
    
    // 异步加载关联字段的选项
    await loadLinkedFieldOptions(index);
}

function createDataRowEditorHTML(dataRow, rowIndex) {
    const fields = currentSchema.fields || [];
    const fieldsHtml = fields.map(field => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(dataRow.data, field.name) ?? field.defaultValue ?? '';
        return createFieldInput(field, value, rowIndex);
    }).join('');

    return `
        <div class="data-row-editor-header">
            <div class="data-row-name-section">
                <label>
                    <input type="checkbox" id="data-row-raw-${rowIndex}" ${dataRow.isRaw ? 'checked' : ''}>
                    原始
                </label>
                <input type="text" id="data-row-name-input-${rowIndex}" class="data-row-name-input" 
                       value="${escapeHtml(dataRow.name)}" 
                       placeholder="数据行名称">
            </div>
        </div>
        <div class="data-row-fields">
            ${fieldsHtml}
        </div>
    `;
}

// 获取字段的选项列表（支持关联配表）
async function getFieldOptions(field) {
    // 如果是关联配表模式
    if (field.dataSource && field.dataSource.type === 'linked' && field.dataSource.schema) {
        const linkedSchemaName = field.dataSource.schema;
        try {
            const response = await fetch(`${API_BASE}/data?action=load&name=${encodeURIComponent(linkedSchemaName)}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                // 将数据行名称作为选项返回
                return result.data.map(row => {
                    // 兼容新旧格式
                    if (typeof row === 'object' && row.name !== undefined) {
                        return row.name;
                    } else if (typeof row === 'object' && row.data) {
                        return Object.values(row.data)[0] || '';
                    }
                    return '';
                }).filter(opt => opt);
            }
        } catch (error) {
            console.error('加载关联配表数据失败:', error);
        }
    }
    
    // 手动输入模式，直接返回选项
    return field.options || [];
}

// 初始化自定义 datalist 事件
function initCustomDatalist(inputElement, dropdownElement, options) {
    const wrapper = inputElement.closest('.custom-datalist-wrapper');
    if (!wrapper) return;
    
    let currentOptions = options;
    let activeIndex = -1;
    
    // 渲染选项列表
    function renderOptions(filteredOptions) {
        if (!filteredOptions || filteredOptions.length === 0) {
            dropdownElement.innerHTML = '<div class="custom-datalist-empty">无匹配项</div>';
            return;
        }
        
        const optionsHtml = filteredOptions.map((opt, index) => {
            let valueText, labelText;
            if (typeof opt === 'object') {
                valueText = opt.value;
                labelText = opt.label;
            } else {
                valueText = opt;
                labelText = '';
            }
            
            const isSelected = inputElement.value === valueText;
            return `
                <div class="custom-datalist-option ${isSelected ? 'selected' : ''}" data-index="${index}" data-value="${escapeHtml(valueText)}">
                    <span class="custom-datalist-option-value">${escapeHtml(valueText)}</span>
                    ${labelText ? `<span class="custom-datalist-option-label">${escapeHtml(labelText)}</span>` : ''}
                </div>
            `;
        }).join('');
        
        dropdownElement.innerHTML = optionsHtml;
    }
    
    // 过滤选项
    function filterOptions(searchText) {
        if (!searchText) return currentOptions;
        
        const search = searchText.toLowerCase();
        return currentOptions.filter(opt => {
            if (typeof opt === 'object') {
                return opt.value.toLowerCase().includes(search) || 
                       (opt.label && opt.label.toLowerCase().includes(search));
            }
            return opt.toLowerCase().includes(search);
        });
    }
    
    // 显示下拉列表
    function showDropdown() {
        const filtered = filterOptions(inputElement.value);
        renderOptions(filtered);
        dropdownElement.classList.add('show');
        activeIndex = -1;
    }
    
    // 隐藏下拉列表
    function hideDropdown() {
        dropdownElement.classList.remove('show');
        activeIndex = -1;
    }
    
    // 选择选项
    function selectOption(value) {
        inputElement.value = value;
        hideDropdown();
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // 高亮活动选项
    function setActiveOption(index) {
        const options = dropdownElement.querySelectorAll('.custom-datalist-option');
        options.forEach(opt => opt.classList.remove('active'));
        
        if (index >= 0 && index < options.length) {
            options[index].classList.add('active');
            options[index].scrollIntoView({ block: 'nearest' });
            activeIndex = index;
        }
    }
    
    // 输入事件
    inputElement.addEventListener('focus', () => {
        showDropdown();
    });
    
    inputElement.addEventListener('input', () => {
        showDropdown();
    });
    
    // 键盘导航
    inputElement.addEventListener('keydown', (e) => {
        if (!dropdownElement.classList.contains('show')) return;
        
        const options = dropdownElement.querySelectorAll('.custom-datalist-option');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveOption(Math.min(activeIndex + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveOption(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < options.length) {
                const value = options[activeIndex].getAttribute('data-value');
                selectOption(value);
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });
    
    // 点击选项
    dropdownElement.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-datalist-option');
        if (option) {
            const value = option.getAttribute('data-value');
            selectOption(value);
        }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            hideDropdown();
        }
    });
    
    // 初始渲染
    renderOptions(currentOptions);
}

// 加载所有关联字段的选项
async function loadLinkedFieldOptions(rowIndex) {
    const fields = currentSchema.fields || [];
    
    for (const field of fields) {
        if (field.type === 'option' || field.type === 'datalist') {
            // 检查是否是关联配表模式
            if (field.dataSource && field.dataSource.type === 'linked') {
                const options = await getFieldOptions(field);
                const currentValue = dataRows[rowIndex].data[field.name] || '';
                
                // 更新选项
                if (field.type === 'option') {
                    const selectElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (field.type === 'datalist') {
                    const inputElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    const dropdownElement = document.getElementById(`datalist-field-${rowIndex}-${field.name}`);
                    if (inputElement && dropdownElement) {
                        // 将简单字符串转换为对象格式（关联模式只返回字符串）
                        const formattedOptions = options.map(opt => 
                            typeof opt === 'string' ? { value: opt, label: '' } : opt
                        );
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            } else {
                // 手动模式，直接使用 field.options
                const currentValue = dataRows[rowIndex].data[field.name] || '';
                const options = field.options || [];
                
                if (field.type === 'option') {
                    const selectElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (field.type === 'datalist') {
                    const inputElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    const dropdownElement = document.getElementById(`datalist-field-${rowIndex}-${field.name}`);
                    if (inputElement && dropdownElement) {
                        // 手动模式已经是正确的格式
                        const formattedOptions = options.map(opt => {
                            if (typeof opt === 'object') {
                                return opt;
                            }
                            return { value: opt, label: '' };
                        });
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            }
        }
        
        // 处理条目类型的子字段
        if (field.type === 'entry' && field.subfields) {
            await loadLinkedSubfieldOptions(rowIndex, field);
        }
    }
}

// 加载条目子字段的关联选项
async function loadLinkedSubfieldOptions(rowIndex, field) {
    const entries = dataRows[rowIndex].data[field.name] || [];
    
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        for (const subfield of field.subfields) {
            if (subfield.type === 'option' || subfield.type === 'datalist') {
                const subfieldId = `entry-${rowIndex}-${field.name}-${entryIndex}-${subfield.name}`;
                
                // 检查是否是关联配表模式
                if (subfield.dataSource && subfield.dataSource.type === 'linked') {
                    const options = await getFieldOptions(subfield);
                    const currentValue = entries[entryIndex][subfield.name] || '';
                    
                    // 更新选项
                    if (subfield.type === 'option') {
                        const selectElement = document.getElementById(subfieldId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (subfield.type === 'datalist') {
                        const inputElement = document.getElementById(subfieldId);
                        const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => 
                                typeof opt === 'string' ? { value: opt, label: '' } : opt
                            );
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                } else {
                    // 手动模式，直接使用 subfield.options
                    const currentValue = entries[entryIndex][subfield.name] || '';
                    const options = subfield.options || [];
                    
                    if (subfield.type === 'option') {
                        const selectElement = document.getElementById(subfieldId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (subfield.type === 'datalist') {
                        const inputElement = document.getElementById(subfieldId);
                        const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => {
                                if (typeof opt === 'object') {
                                    return opt;
                                }
                                return { value: opt, label: '' };
                            });
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                }
            }
        }
    }
}

function createFieldInput(field, value, rowIndex) {
    const fieldId = `field-${rowIndex}-${field.name}`;
    
    let inputHtml = '';

    switch (field.type) {
        case 'text':
            inputHtml = `<input type="text" id="${fieldId}" class="form-control" value="${escapeHtml(value)}" ${field.required ? 'required' : ''}>`;
            break;
        
        case 'number':
            inputHtml = `<input type="number" id="${fieldId}" class="form-control" value="${value}" ${field.required ? 'required' : ''}>`;
            break;
        
        case 'color':
            // 颜色选择器：包含色盘和文本输入框
            const hexValue = value ? String(value).replace(/^0x/i, '') : 'FFFFFF';
            const colorValue = '#' + hexValue;
            inputHtml = `
                <div class="color-input-wrapper">
                    <input type="color" id="${fieldId}-picker" class="color-picker" value="${colorValue}" 
                           onchange="updateColorFromPicker('${fieldId}', this.value)">
                    <input type="text" id="${fieldId}" class="form-control color-text-input" value="${value || '0xFFFFFF'}" 
                           ${field.required ? 'required' : ''}
                           oninput="updateColorFromText('${fieldId}', this.value)"
                           placeholder="0xFFFFFF">
                    <div class="color-preview" id="${fieldId}-preview" style="background-color: ${colorValue};"></div>
                </div>
            `;
            break;
        
        case 'option':
            // 使用占位符，稍后异步加载选项
            inputHtml = `<select id="${fieldId}" class="form-control linked-field" data-field-name="${field.name}" ${field.required ? 'required' : ''}>
                <option value="">-- 加载中... --</option>
            </select>`;
            break;
        
        case 'datalist':
            const datalistId = `datalist-${fieldId}`;
            // 使用自定义下拉列表
            inputHtml = `
                <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                    <input type="text" 
                           id="${fieldId}" 
                           class="custom-datalist-input" 
                           data-field-name="${field.name}" 
                           value="${escapeHtml(value)}" 
                           ${field.required ? 'required' : ''}
                           autocomplete="off"
                           placeholder="请输入或选择...">
                    <div class="custom-datalist-dropdown" id="${datalistId}">
                        <div class="custom-datalist-empty">加载中...</div>
                    </div>
                </div>
            `;
            break;
        
        case 'entry':
            inputHtml = createEntryInput(field, value, rowIndex);
            return `
                <div class="form-group" style="grid-column: 1 / -1;">
                    ${inputHtml}
                </div>
            `;
    }

    const rawBadge = field.isRaw ? '<span class="raw-badge" title="此字段Lua导出时不加引号">原始</span>' : '';
    
    return `
        <div class="form-group">
            <label>${escapeHtml(field.label || field.name)}${field.required ? ' *' : ''} ${rawBadge}</label>
            ${inputHtml}
        </div>
    `;
}

function createEntryInput(field, value, rowIndex) {
    const entries = Array.isArray(value) ? value : [];
    const entriesHtml = entries.map((entry, entryIndex) => 
        createEntryItem(field, entry, rowIndex, entryIndex)
    ).join('');

    return `
        <div class="entry-container" data-row="${rowIndex}" data-field="${field.name}">
            <div class="entry-header">
                <label>${escapeHtml(field.label || field.name)}</label>
                <button type="button" class="btn btn-sm btn-primary" onclick="addEntryItem(${rowIndex}, '${field.name}')">
                    <i class="fas fa-plus"></i> 添加条目
                </button>
            </div>
            <div class="entry-items">
                ${entriesHtml || '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无条目</p>'}
            </div>
        </div>
    `;
}

function createEntryItem(field, entry, rowIndex, entryIndex) {
    const subfields = field.subfields || [];
    const subfieldsHtml = subfields.map(subfield => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(entry, subfield.name) ?? subfield.defaultValue ?? '';
        const subfieldId = `entry-${rowIndex}-${field.name}-${entryIndex}-${subfield.name}`;

        let inputHtml = '';

        switch (subfield.type) {
            case 'text':
                inputHtml = `<input type="text" id="${subfieldId}" class="form-control" value="${escapeHtml(value)}">`;
                break;
            
            case 'number':
                inputHtml = `<input type="number" id="${subfieldId}" class="form-control" value="${value}">`;
                break;
            
            case 'color':
                // 颜色选择器：包含色盘和文本输入框
                const hexValue = value ? String(value).replace(/^0x/i, '') : 'FFFFFF';
                const colorValue = '#' + hexValue;
                inputHtml = `
                    <div class="color-input-wrapper">
                        <input type="color" id="${subfieldId}-picker" class="color-picker" value="${colorValue}" 
                               onchange="updateColorFromPicker('${subfieldId}', this.value)">
                        <input type="text" id="${subfieldId}" class="form-control color-text-input" value="${value || '0xFFFFFF'}" 
                               oninput="updateColorFromText('${subfieldId}', this.value)"
                               placeholder="0xFFFFFF">
                        <div class="color-preview" id="${subfieldId}-preview" style="background-color: ${colorValue};"></div>
                    </div>
                `;
                break;
            
            case 'option':
                // 使用占位符，稍后异步加载选项
                inputHtml = `<select id="${subfieldId}" class="form-control">
                    <option value="">-- 加载中... --</option>
                </select>`;
                break;
            
            case 'datalist':
                const datalistId = `datalist-${subfieldId}`;
                // 使用自定义下拉列表
                inputHtml = `
                    <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                        <input type="text" 
                               id="${subfieldId}" 
                               class="custom-datalist-input" 
                               value="${escapeHtml(value)}"
                               autocomplete="off"
                               placeholder="请输入或选择...">
                        <div class="custom-datalist-dropdown" id="${datalistId}">
                            <div class="custom-datalist-empty">加载中...</div>
                        </div>
                    </div>
                `;
                break;
        }

        return `
            <div class="entry-item-field">
                <label>${escapeHtml(subfield.label || subfield.name)}</label>
                ${inputHtml}
            </div>
        `;
    }).join('');

    return `
        <div class="entry-item" data-entry-index="${entryIndex}">
            ${subfieldsHtml}
            <div class="entry-item-actions">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeEntryItem(${rowIndex}, '${field.name}', ${entryIndex})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function addDataRow() {
    const newRowData = {};
    
    // 使用默认值初始化新行
    (currentSchema.fields || []).forEach(field => {
        if (field.type === 'entry') {
            newRowData[field.name] = [];
        } else {
            newRowData[field.name] = field.defaultValue || '';
        }
    });

    const newDataRow = {
        name: `数据行 ${dataRows.length + 1}`,
        data: newRowData
    };

    // 在添加新数据行前，先保存当前编辑的数据
    saveCurrentEditToMemory();

    dataRows.push(newDataRow);
    selectedDataRowIndex = dataRows.length - 1;
    
    renderDataRowsList();
    renderDataRowEditor(selectedDataRowIndex);
}

function removeDataRow(index) {
    // 在删除前，先保存当前编辑的数据（如果不是删除当前选中的）
    if (selectedDataRowIndex !== index) {
        saveCurrentEditToMemory();
    }
    
    dataRows.splice(index, 1);
    
    // 如果删除的是当前选中的数据行，重置选择
    if (selectedDataRowIndex === index) {
        selectedDataRowIndex = -1;
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择数据行</p></div>';
    } else if (selectedDataRowIndex > index) {
        selectedDataRowIndex--;
    }
    
    renderDataRowsList();
    
    // 如果还有数据行且之前有选中，重新渲染编辑器
    if (selectedDataRowIndex >= 0 && selectedDataRowIndex < dataRows.length) {
        renderDataRowEditor(selectedDataRowIndex);
    }
}

async function addEntryItem(rowIndex, fieldName) {
    const field = currentSchema.fields.find(f => f.name === fieldName);
    if (!field) return;

    const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${fieldName}"] .entry-items`);
    
    // 如果容器只有提示文字，先清空
    if (container.querySelector('p')) {
        container.innerHTML = '';
    }

    const currentItemCount = container.querySelectorAll('.entry-item').length;
    const newEntry = {};
    
    // 使用默认值初始化新条目，支持数字键
    (field.subfields || []).forEach(subfield => {
        setFieldValue(newEntry, subfield.name, subfield.defaultValue || '');
    });

    const itemHtml = createEntryItem(field, newEntry, rowIndex, currentItemCount);
    container.insertAdjacentHTML('beforeend', itemHtml);
    
    // 加载新添加条目的关联子字段选项
    for (const subfield of field.subfields || []) {
        if (subfield.type === 'option' || subfield.type === 'datalist') {
            const subfieldId = `entry-${rowIndex}-${fieldName}-${currentItemCount}-${subfield.name}`;
            
            if (subfield.dataSource && subfield.dataSource.type === 'linked') {
                const options = await getFieldOptions(subfield);
                
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const datalistElement = document.getElementById(`datalist-${subfieldId}`);
                    if (datalistElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}"></option>`
                        ).join('');
                        datalistElement.innerHTML = optionsHtml;
                    }
                }
            } else {
                // 手动模式，直接使用 subfield.options
                const options = subfield.options || [];
                
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const datalistElement = document.getElementById(`datalist-${subfieldId}`);
                    if (datalistElement) {
                        const datalistOptions = options.map(opt => {
                            if (typeof opt === 'object') {
                                return `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`;
                            }
                            return `<option value="${escapeHtml(opt)}"></option>`;
                        }).join('');
                        datalistElement.innerHTML = datalistOptions;
                    }
                }
            }
        }
    }
}

function removeEntryItem(rowIndex, fieldName, entryIndex) {
    const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${fieldName}"] .entry-items`);
    const item = container.querySelector(`.entry-item[data-entry-index="${entryIndex}"]`);
    
    if (item) {
        item.remove();
        
        // 重新编号
        container.querySelectorAll('.entry-item').forEach((item, newIndex) => {
            item.dataset.entryIndex = newIndex;
        });

        // 如果没有条目了，显示提示
        if (container.querySelectorAll('.entry-item').length === 0) {
            container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无条目</p>';
        }
    }
}

async function saveData() {
    // 在保存前，先将当前编辑器中的数据保存到内存
    saveCurrentEditToMemory();
    
    const data = collectData();
    
    // 保存完整的 dataRows 信息（包括 name 和 isRaw）
    const dataWithMeta = dataRows.map((dataRow, index) => ({
        name: dataRow.name,
        isRaw: dataRow.isRaw || false,
        data: data[index]
    }));

    try {
        const response = await fetch(API.DATA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: dataWithMeta
            })
        });

        const result = await response.json();
        
        if (result.success) {
            alert('配表数据保存成功');
            
            // 保存当前编辑的数据行索引
            const currentEditingIndex = selectedDataRowIndex;
            
            // 重新从服务器加载数据以确保数据同步
            await reloadCurrentData();
            
            // 如果之前有选中的数据行，重新选中并渲染
            if (currentEditingIndex >= 0 && currentEditingIndex < dataRows.length) {
                selectedDataRowIndex = currentEditingIndex;
                renderDataRowsList();
                await renderDataRowEditor(currentEditingIndex);
            }
        } else {
            alert('保存配表数据失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存配表数据错误:', error);
        alert('保存配表数据失败');
    }
}

// 重新加载当前配表数据（不改变UI状态）
async function reloadCurrentData() {
    try {
        const dataResponse = await fetch(`${API.DATA}?action=get&name=${encodeURIComponent(currentSchemaName)}`);
        const dataResult = await dataResponse.json();
        
        if (dataResult.success) {
            const loadedData = dataResult.data || [];
            dataRows = loadedData.map((row, index) => {
                // 兼容新旧格式
                if (row.name !== undefined && row.data !== undefined) {
                    return {
                        name: row.name,
                        isRaw: row.isRaw || false,
                        data: row.data
                    };
                } else {
                    return {
                        name: `数据行 ${index + 1}`,
                        isRaw: false,
                        data: row
                    };
                }
            });
        }
    } catch (error) {
        console.error('重新加载数据错误:', error);
    }
}

function previewData() {
    const modal = document.getElementById('preview-modal');
    modal.classList.add('show');
    
    const container = document.getElementById('preview-container');
    const data = collectData();
    
    let html = `<div class="preview-table-wrapper">
        <table class="preview-table">
            <thead>
                <tr>
                    <th>数据行名称</th>`;
    
    // 表头
    const fields = currentSchema.fields || [];
    fields.forEach(field => {
        html += `<th>${escapeHtml(field.label || field.name)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // 数据行
    dataRows.forEach((dataRow, index) => {
        const rowData = data[index];
        html += `<tr>
            <td class="preview-row-name">${escapeHtml(dataRow.name)}${dataRow.isRaw ? ' <span class="raw-badge">原始</span>' : ''}</td>`;
        
        fields.forEach(field => {
            // 使用工具函数获取字段值，支持数字键
            let value = getFieldValue(rowData, field.name);
            let isHtml = false;
            if (field.type === 'entry') {
                value = `${Array.isArray(value) ? value.length : 0} 项`;
            } else if (field.type === 'color' && value) {
                // 显示颜色方块和值
                const hex = String(value).replace(/^0x/i, '');
                const colorValue = '#' + hex;
                value = `<div class="preview-color-wrapper"><div class="preview-color-box" style="background-color: ${colorValue};"></div><span>${value}</span></div>`;
                isHtml = true;
            } else if (value === '' || value === null || value === undefined) {
                value = '<span class="empty-value">nil</span>';
                isHtml = true;
            }
            html += `<td>${isHtml ? value : escapeHtml(String(value))}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('show');
}

function collectData() {
    const data = [];

    dataRows.forEach((dataRow, rowIndex) => {
        const rowData = {};
        const fields = currentSchema.fields || [];

        fields.forEach(field => {
            if (field.type === 'entry') {
                const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${field.name}"]`);
                if (container) {
                    setFieldValue(rowData, field.name, collectEntryDataFromContainer(container, field));
                } else {
                    setFieldValue(rowData, field.name, getFieldValue(dataRow.data, field.name) || []);
                }
            } else {
                const input = document.querySelector(`#field-${rowIndex}-${field.name}`);
                if (input) {
                    setFieldValue(rowData, field.name, input.value);
                } else {
                    setFieldValue(rowData, field.name, getFieldValue(dataRow.data, field.name) || '');
                }
            }
        });

        data.push(rowData);
    });

    return data;
}

function collectEntryDataFromContainer(container, field) {
    const entries = [];
    const items = container.querySelectorAll('.entry-item');

    items.forEach(item => {
        const entry = {};
        const subfields = field.subfields || [];

        subfields.forEach(subfield => {
            const input = item.querySelector(`input[id*="${subfield.name}"], select[id*="${subfield.name}"]`);
            if (input) {
                // 使用工具函数设置字段值，如果字段名是纯数字则使用数字键
                setFieldValue(entry, subfield.name, input.value);
            }
        });

        entries.push(entry);
    });

    return entries;
}

// ========== Lua导出功能 ==========

// 存储require列表
let requireItems = [];

// 判断字符串是否为合法的Lua标识符
function isValidLuaIdentifier(str) {
    // Lua标识符规则: 字母或下划线开头,后面可以是字母、数字或下划线
    // 不能是Lua关键字
    const luaKeywords = [
        'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
        'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat',
        'return', 'then', 'true', 'until', 'while'
    ];
    
    if (!str || typeof str !== 'string') return false;
    if (luaKeywords.includes(str)) return false;
    
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
}

function exportToLua() {
    const modal = document.getElementById('export-lua-modal');
    modal.classList.add('show');
    
    // 从当前schema加载导出配置
    if (currentSchema && currentSchema.exportConfig) {
        document.getElementById('export-namespace').value = currentSchema.exportConfig.namespace || 'Tile';
        requireItems = currentSchema.exportConfig.requires ? [...currentSchema.exportConfig.requires] : [];
    } else {
        document.getElementById('export-namespace').value = 'Tile';
        requireItems = [];
    }
    
    renderRequireList();
    updateLuaExport();
}

function addRequireItem() {
    requireItems.push({ varName: '', path: '' });
    renderRequireList();
    updateLuaExport();
}

function removeRequireItem(index) {
    requireItems.splice(index, 1);
    renderRequireList();
    updateLuaExport();
}

function renderRequireList() {
    const container = document.getElementById('require-list');
    if (requireItems.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">暂无包导入</div>';
        return;
    }
    
    container.innerHTML = requireItems.map((item, index) => `
        <div class="require-item">
            <input type="text" class="form-control var-name-input" 
                   placeholder="变量名" 
                   value="${escapeHtml(item.varName)}"
                   onchange="updateRequireItem(${index}, 'varName', this.value)">
            <input type="text" class="form-control path-input" 
                   placeholder="包路径 (例如: x.y.z)" 
                   value="${escapeHtml(item.path)}"
                   onchange="updateRequireItem(${index}, 'path', this.value)">
            <button type="button" class="btn btn-sm btn-danger btn-remove" onclick="removeRequireItem(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function updateRequireItem(index, field, value) {
    requireItems[index][field] = value;
    updateLuaExport();
}

function closeLuaExportModal() {
    const modal = document.getElementById('export-lua-modal');
    modal.classList.remove('show');
    
    // 保存导出配置到当前schema
    if (currentSchema) {
        if (!currentSchema.exportConfig) {
            currentSchema.exportConfig = {};
        }
        currentSchema.exportConfig.namespace = document.getElementById('export-namespace').value.trim() || 'Tile';
        currentSchema.exportConfig.requires = [...requireItems];
        
        // 自动保存schema（静默保存，不弹提示）
        saveSchemaExportConfig();
    }
}

async function saveSchemaExportConfig() {
    if (!currentSchema || !currentSchemaName) return;
    
    try {
        await fetch(API.SCHEMA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: currentSchema
            })
        });
    } catch (error) {
        console.error('保存导出配置错误:', error);
    }
}

function updateLuaExport() {
    const format = document.getElementById('export-format-select').value;
    const namespace = document.getElementById('export-namespace').value.trim() || 'Tile';
    const data = collectData();
    const luaCode = generateLuaCode(data, format, namespace);
    document.getElementById('lua-code-output').textContent = luaCode;
}

function generateLuaCode(data, format, namespace) {
    const schema = currentSchema;
    const schemaName = currentSchemaName;
    
    let code = '';
    
    // 添加 namespace 注释头部
    code += `---@namespace ${namespace}\n\n`;
    
    // 添加包导入
    const validRequires = requireItems.filter(item => item.varName.trim() && item.path.trim());
    if (validRequires.length > 0) {
        validRequires.forEach(item => {
            code += `local ${item.varName} = require "${item.path}"\n`;
        });
        code += '\n';
    }
    
    // 如果schema有描述，添加描述注释
    if (schema.description) {
        code += `-- ${schema.description}\n\n`;
    }
    
    // 生成类型定义
    code += generateTypeDefinition(schema, schemaName);
    code += '\n';
    
    // 生成数据
    if (format === 'table') {
        code += generateLuaTable(data, schema, schemaName);
    } else {
        code += generateLuaArray(data, schema, schemaName);
    }
    
    code += `\nreturn result\n`;
    
    return code;
}

function generateTypeDefinition(schema, schemaName) {
    let code = '';
    const mainTypeName = toPascalCase(schemaName);
    
    // 先生成所有 entry 类型的子类定义
    const fields = schema.fields || [];
    fields.forEach(field => {
        if (field.type === 'entry' && field.subfields && field.subfields.length > 0) {
            const entryTypeName = toPascalCase(field.name);
            code += `---@class (exact) ${entryTypeName}\n`;
            field.subfields.forEach(subfield => {
                const subfieldType = getLuaType(subfield);
                const comment = subfield.label || subfield.name;
                // 如果字段名不是合法的 Lua 标识符（比如纯数字），使用 [fieldName] 格式
                const fieldName = isValidLuaIdentifier(subfield.name) ? subfield.name : `[${subfield.name}]`;
                code += `---@field ${fieldName} ${subfieldType} ${comment}\n`;
            });
            code += '\n';
        }
    });
    
    // 然后生成主类定义
    code += `---@class (exact) ${mainTypeName}\n`;
    fields.forEach(field => {
        const fieldType = getLuaType(field, schemaName);
        const comment = field.label || field.name;
        // 如果字段名不是合法的 Lua 标识符（比如纯数字），使用 [fieldName] 格式
        const fieldName = isValidLuaIdentifier(field.name) ? field.name : `[${field.name}]`;
        code += `---@field ${fieldName} ${fieldType} ${comment}\n`;
    });
    
    return code;
}

function toPascalCase(str) {
    return str
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

function getLuaType(field, parentName = '') {
    // 如果设置了自定义的 Lua 类型，优先使用
    if (field.luaType && field.luaType.trim()) {
        return field.luaType.trim();
    }
    
    switch (field.type) {
        case 'number':
            return 'integer';
        case 'text':
            return 'string';
        case 'color':
            return 'integer';
        case 'option':
            return 'string';
        case 'datalist':
            return 'string';
        case 'entry':
            // 对于条目类型，使用字段名生成类型名
            if (field.name) {
                const entryTypeName = toPascalCase(field.name);
                return `${entryTypeName}[]`;
            }
            return 'table[]';
        default:
            return 'any';
    }
}

function generateLuaTable(data, schema, schemaName) {
    const typeName = toPascalCase(schemaName);
    let code = `---@type table<string, ${typeName}>\nlocal result = {\n`;
    
    dataRows.forEach((dataRow, index) => {
        const row = data[index];
        // 使用数据行名称作为键
        const key = dataRow.name || `item_${index + 1}`;
        
        // 根据 isRaw 决定键的格式
        if (dataRow.isRaw) {
            code += `    [${key}] = {\n`;
        } else {
            code += `    ["${escapeHtml(key)}"] = {\n`;
        }
        
        code += generateLuaFields(row, schema, '        ');
        code += `    }`;
        
        if (index < data.length - 1) {
            code += ',';
        }
        code += '\n';
    });
    
    code += `}`;
    
    return code;
}

function generateLuaArray(data, schema, schemaName) {
    const typeName = toPascalCase(schemaName);
    let code = `---@type ${typeName}[]\nlocal result = {\n`;
    
    data.forEach((row, index) => {
        code += `    {\n`;
        code += generateLuaFields(row, schema, '        ');
        code += `    }`;
        
        if (index < data.length - 1) {
            code += ',';
        }
        code += '\n';
    });
    
    code += `}`;
    
    return code;
}

function generateLuaFields(row, schema, indent) {
    let code = '';
    const fields = schema.fields || [];
    
    fields.forEach((field, fieldIndex) => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(row, field.name);
        
        // 智能选择字段名格式
        if (isValidLuaIdentifier(field.name)) {
            // 合法的 Lua 标识符，直接使用
            code += `${indent}${field.name} = `;
        } else if (/^\d+$/.test(field.name)) {
            // 纯数字，使用 [number] 格式（不带引号）
            code += `${indent}[${field.name}] = `;
        } else {
            // 其他情况，使用 ["string"] 格式
            code += `${indent}["${field.name}"] = `;
        }
        
        if (field.type === 'entry' && Array.isArray(value)) {
            code += '{\n';
            value.forEach((entry, entryIndex) => {
                code += `${indent}    `;
                code += formatLuaEntry(entry, field);
                if (entryIndex < value.length - 1) {
                    code += ',';
                }
                code += '\n';
            });
            code += `${indent}}`;
        } else {
            // 传递 isRaw 参数
            code += formatLuaValue(value, field.type, field.isRaw);
        }
        
        if (fieldIndex < fields.length - 1) {
            code += ',';
        }
        
        // 在行尾添加注释
        if (field.label && field.label !== field.name) {
            code += ` -- ${field.label}`;
        }
        
        code += '\n';
    });
    
    return code;
}

function formatLuaEntry(entry, field) {
    const subfields = field.subfields || [];
    let parts = [];
    
    subfields.forEach(subfield => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(entry, subfield.name);
        const luaValue = formatLuaValue(value, subfield.type, subfield.isRaw);
        
        // 智能选择字段名格式
        if (isValidLuaIdentifier(subfield.name)) {
            // 合法的 Lua 标识符，直接使用
            parts.push(`${subfield.name} = ${luaValue}`);
        } else if (/^\d+$/.test(subfield.name)) {
            // 纯数字，使用 [number] 格式（不带引号）
            parts.push(`[${subfield.name}] = ${luaValue}`);
        } else {
            // 其他情况，使用 ["string"] 格式
            parts.push(`["${subfield.name}"] = ${luaValue}`);
        }
    });
    
    return `{ ${parts.join(', ')} }`;
}

function formatLuaValue(value, type, isRaw = false) {
    if (value === null || value === undefined || value === '') {
        return 'nil';
    }
    
    switch (type) {
        case 'number':
            return String(value);
        
        case 'color':
            // 颜色值直接输出 0xRRGGBB 格式
            return String(value);
        
        case 'text':
        case 'option':
        case 'datalist':
            // 如果标记为原始文本，直接输出不加引号
            if (isRaw) {
                return String(value);
            }
            return formatLuaString(String(value));
        
        default:
            // 检查是否是数字
            if (!isNaN(value) && value !== '') {
                return String(value);
            }
            return formatLuaString(String(value));
    }
}

function formatLuaString(str) {
    // 检查是否需要使用双引号
    if (str.includes('"')) {
        return `'${str.replace(/'/g, "\\'")}'`;
    }
    return `"${str}"`;
}

function formatLuaKey(key) {
    // 如果key看起来像一个枚举值或变量，直接使用
    // 例如: FishCode.Clownfish, AreaCode.Ocean
    if (/^[A-Z][a-zA-Z0-9]*\.[A-Z][a-zA-Z0-9]*$/.test(key)) {
        return key;
    }
    
    // 如果key是有效的Lua标识符，直接使用
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        return key;
    }
    
    // 否则使用字符串形式
    return formatLuaString(key);
}

async function copyLuaCode() {
    const codeElement = document.getElementById('lua-code-output');
    const code = codeElement.textContent;
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 显示复制成功提示
        const btn = document.getElementById('copy-lua-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('复制失败:', error);
        
        // 降级方案：使用传统方法
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            alert('代码已复制到剪贴板');
        } catch (err) {
            alert('复制失败，请手动复制代码');
        }
        
        document.body.removeChild(textArea);
    }
}

// ========== 工具函数 ==========
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
    
    if (e.target === confirmModal) {
        closeModal();
    }
    
    if (e.target === luaModal) {
        closeLuaExportModal();
    }
});
