// API接口配置
const API_BASE = 'http://localhost:5000/api';

const API = {
    SCHEMA: `${API_BASE}/schema`,
    DATA: `${API_BASE}/data`
};

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
            <div class="field-compact-actions">
                <label>
                    <input type="checkbox" id="field-required-${index}" ${field.required ? 'checked' : ''}> 必填字段
                </label>
                ${showRawOption ? `
                <label style="margin-left: 20px;">
                    <input type="checkbox" id="field-raw-${index}" ${field.isRaw ? 'checked' : ''}> 原始文本（Lua导出不加引号）
                </label>
                ` : ''}
            </div>
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
    const requiredCheckbox = document.getElementById(`field-required-${index}`);
    const rawCheckbox = document.getElementById(`field-raw-${index}`);
    
    const updateField = () => {
        currentSchema.fields[index].name = nameInput.value;
        currentSchema.fields[index].label = labelInput.value;
        currentSchema.fields[index].type = typeSelect.value;
        currentSchema.fields[index].defaultValue = defaultInput.value;
        currentSchema.fields[index].required = requiredCheckbox.checked;
        if (rawCheckbox) {
            currentSchema.fields[index].isRaw = rawCheckbox.checked;
        }
        renderFieldsList();
    };
    
    nameInput.addEventListener('input', updateField);
    labelInput.addEventListener('input', updateField);
    defaultInput.addEventListener('input', updateField);
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
        return `
            <div class="form-group">
                <label>选项列表（每行一个）</label>
                <textarea id="field-options-${index}" class="form-control" rows="4" placeholder="选项1&#10;选项2&#10;选项3">${(field.options || []).join('\n')}</textarea>
            </div>
        `;
    } else if (field.type === 'datalist') {
        return `
            <div class="form-group">
                <label>数据列表配置（格式: value|label，每行一个）</label>
                <textarea id="field-datalist-${index}" class="form-control" rows="4" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(field.options || [])}</textarea>
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
                    <select class="form-control subfield-type">
                        <option value="text" ${subfield.type === 'text' ? 'selected' : ''}>文本</option>
                        <option value="number" ${subfield.type === 'number' ? 'selected' : ''}>数字</option>
                        <option value="option" ${subfield.type === 'option' ? 'selected' : ''}>选项</option>
                        <option value="datalist" ${subfield.type === 'datalist' ? 'selected' : ''}>数据列表</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>默认值</label>
                    <input type="text" class="form-control subfield-default" value="${escapeHtml(subfield.defaultValue || '')}" placeholder="默认值">
                </div>
            </div>
            <div class="subfield-checkboxes">
                ${(subfield.type === 'text' || subfield.type === 'option' || subfield.type === 'datalist') ? `
                <label style="margin-right: 15px;">
                    <input type="checkbox" class="subfield-raw" ${subfield.isRaw ? 'checked' : ''}>
                    原始文本（Lua导出不加引号）
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
        return `
            <div class="form-group">
                <label>选项列表（每行一个）</label>
                <textarea class="form-control subfield-options" rows="3" placeholder="选项1&#10;选项2&#10;选项3">${(subfield.options || []).join('\n')}</textarea>
            </div>
        `;
    } else if (subfield.type === 'datalist') {
        return `
            <div class="form-group">
                <label>数据列表配置（格式: value|label，每行一个）</label>
                <textarea class="form-control subfield-datalist" rows="3" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(subfield.options || [])}</textarea>
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
        if (field.type === 'option') {
            const optionsElement = document.getElementById(`field-options-${index}`);
            if (optionsElement) {
                const optionsText = optionsElement.value.trim();
                field.options = optionsText ? optionsText.split('\n').filter(opt => opt.trim()) : [];
            }
        } else if (field.type === 'datalist') {
            const datalistElement = document.getElementById(`field-datalist-${index}`);
            if (datalistElement) {
                const datalistText = datalistElement.value.trim();
                field.options = datalistText ? datalistText.split('\n').map(line => {
                    const parts = line.trim().split('|');
                    return parts.length === 2 ? { value: parts[0].trim(), label: parts[1].trim() } : line.trim();
                }).filter(opt => opt) : [];
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

        // 收集原始文本标记
        const rawCheckbox = element.querySelector('.subfield-raw');
        if (rawCheckbox) {
            subfield.isRaw = rawCheckbox.checked;
        }

        // 处理类型特定配置
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

        subfields.push(subfield);
    });

    return subfields;
}

// ========== 配表管理 ==========
async function loadSchemaSelectOptions() {
    const select = document.getElementById('data-schema-select');
    
    try {
        const response = await fetch(`${API.SCHEMA}?action=list`);
        const result = await response.json();
        
        if (result.success) {
            schemas = result.data || [];
            select.innerHTML = '<option value="">-- 请选择Schema --</option>';
            
            schemas.forEach(schema => {
                const option = document.createElement('option');
                option.value = schema.name;
                option.textContent = schema.name;
                select.appendChild(option);
            });
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
            dataRows = (dataResult.data || []).map((row, index) => ({
                name: `数据行 ${index + 1}`,
                data: row
            }));
        }

        selectedDataRowIndex = -1;
        renderDataRowsList();
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择或添加数据行</p></div>';
        document.getElementById('data-editor').style.display = 'block';
        document.getElementById('data-table-title').textContent = `${schemaName} - 配表数据`;
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
        selectedDataRowIndex = index;
        renderDataRowsList();
        renderDataRowEditor(index);
    });
    
    return div;
}

function updateDataRowName(index, newName) {
    dataRows[index].name = newName;
}

function renderDataRowEditor(index) {
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
}

function createDataRowEditorHTML(dataRow, rowIndex) {
    const fields = currentSchema.fields || [];
    const fieldsHtml = fields.map(field => {
        const value = dataRow.data[field.name] || field.defaultValue || '';
        return createFieldInput(field, value, rowIndex);
    }).join('');

    return `
        <div class="data-row-editor-header">
            <input type="text" id="data-row-name-input-${rowIndex}" class="data-row-name-input" 
                   value="${escapeHtml(dataRow.name)}" 
                   placeholder="数据行名称">
        </div>
        <div class="data-row-fields">
            ${fieldsHtml}
        </div>
    `;
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
        
        case 'option':
            const options = (field.options || []).map(opt => 
                `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
            ).join('');
            inputHtml = `<select id="${fieldId}" class="form-control" ${field.required ? 'required' : ''}>
                <option value="">-- 请选择 --</option>
                ${options}
            </select>`;
            break;
        
        case 'datalist':
            const datalistId = `datalist-${fieldId}`;
            const datalistOptions = (field.options || []).map(opt => {
                if (typeof opt === 'object') {
                    return `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`;
                }
                return `<option value="${escapeHtml(opt)}"></option>`;
            }).join('');
            inputHtml = `
                <div class="datalist-wrapper">
                    <input type="text" id="${fieldId}" list="${datalistId}" class="form-control" value="${escapeHtml(value)}" ${field.required ? 'required' : ''}>
                    <datalist id="${datalistId}">
                        ${datalistOptions}
                    </datalist>
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

    return `
        <div class="form-group">
            <label>${escapeHtml(field.label || field.name)}${field.required ? ' *' : ''}</label>
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
        const value = entry[subfield.name] || subfield.defaultValue || '';
        const subfieldId = `entry-${rowIndex}-${field.name}-${entryIndex}-${subfield.name}`;

        let inputHtml = '';

        switch (subfield.type) {
            case 'text':
                inputHtml = `<input type="text" id="${subfieldId}" class="form-control" value="${escapeHtml(value)}">`;
                break;
            
            case 'number':
                inputHtml = `<input type="number" id="${subfieldId}" class="form-control" value="${value}">`;
                break;
            
            case 'option':
                const options = (subfield.options || []).map(opt => 
                    `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                ).join('');
                inputHtml = `<select id="${subfieldId}" class="form-control">
                    <option value="">-- 请选择 --</option>
                    ${options}
                </select>`;
                break;
            
            case 'datalist':
                const datalistId = `datalist-${subfieldId}`;
                const datalistOptions = (subfield.options || []).map(opt => {
                    if (typeof opt === 'object') {
                        return `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`;
                    }
                    return `<option value="${escapeHtml(opt)}"></option>`;
                }).join('');
                inputHtml = `
                    <input type="text" id="${subfieldId}" list="${datalistId}" class="form-control" value="${escapeHtml(value)}">
                    <datalist id="${datalistId}">
                        ${datalistOptions}
                    </datalist>
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

    dataRows.push(newDataRow);
    selectedDataRowIndex = dataRows.length - 1;
    
    renderDataRowsList();
    renderDataRowEditor(selectedDataRowIndex);
}

function removeDataRow(index) {
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

function addEntryItem(rowIndex, fieldName) {
    const field = currentSchema.fields.find(f => f.name === fieldName);
    if (!field) return;

    const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${fieldName}"] .entry-items`);
    
    // 如果容器只有提示文字，先清空
    if (container.querySelector('p')) {
        container.innerHTML = '';
    }

    const currentItemCount = container.querySelectorAll('.entry-item').length;
    const newEntry = {};
    
    // 使用默认值初始化新条目
    (field.subfields || []).forEach(subfield => {
        newEntry[subfield.name] = subfield.defaultValue || '';
    });

    const itemHtml = createEntryItem(field, newEntry, rowIndex, currentItemCount);
    container.insertAdjacentHTML('beforeend', itemHtml);
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
    const data = collectData();

    try {
        const response = await fetch(API.DATA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: data
            })
        });

        const result = await response.json();
        
        if (result.success) {
            alert('配表数据保存成功');
        } else {
            alert('保存配表数据失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存配表数据错误:', error);
        alert('保存配表数据失败');
    }
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
                    rowData[field.name] = collectEntryDataFromContainer(container, field);
                } else {
                    rowData[field.name] = dataRow.data[field.name] || [];
                }
            } else {
                const input = document.querySelector(`#field-${rowIndex}-${field.name}`);
                if (input) {
                    rowData[field.name] = input.value;
                } else {
                    rowData[field.name] = dataRow.data[field.name] || '';
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
                entry[subfield.name] = input.value;
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
                code += `---@field ${subfield.name} ${subfieldType} ${comment}\n`;
            });
            code += '\n';
        }
    });
    
    // 然后生成主类定义
    code += `---@class (exact) ${mainTypeName}\n`;
    fields.forEach(field => {
        const fieldType = getLuaType(field, schemaName);
        const comment = field.label || field.name;
        code += `---@field ${field.name} ${fieldType} ${comment}\n`;
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
    switch (field.type) {
        case 'number':
            return 'integer';
        case 'text':
            return 'string';
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
        
        code += `    ["${escapeHtml(key)}"] = {\n`;
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
        const value = row[field.name];
        
        // 智能选择字段名格式: 合法标识符用直接格式,否则用["xxx"]格式
        if (isValidLuaIdentifier(field.name)) {
            code += `${indent}${field.name} = `;
        } else {
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
        const value = entry[subfield.name];
        const luaValue = formatLuaValue(value, subfield.type, subfield.isRaw);
        
        // 智能选择字段名格式
        if (isValidLuaIdentifier(subfield.name)) {
            parts.push(`${subfield.name} = ${luaValue}`);
        } else {
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
