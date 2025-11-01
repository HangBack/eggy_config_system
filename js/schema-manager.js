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
        const linkedEnum = field.dataSource?.enum || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select id="field-datasource-type-${index}" class="form-control" onchange="updateDataSourceType(${index}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                    <option value="enum" ${dataSourceType === 'enum' ? 'selected' : ''}>枚举</option>
                </select>
            </div>
            <div id="field-datasource-config-${index}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>选项列表（每行一个）</label>
                        <textarea id="field-options-${index}" class="form-control" rows="4" placeholder="选项1&#10;选项2&#10;选项3">${(field.options || []).join('\n')}</textarea>
                    </div>
                ` : dataSourceType === 'linked' ? `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select id="field-linked-schema-${index}" class="form-control">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的枚举</label>
                        <select id="field-linked-enum-${index}" class="form-control">
                            <option value="">-- 请选择枚举 --</option>
                            ${enums.map(e => `<option value="${e.name}" ${linkedEnum === e.name ? 'selected' : ''}>${e.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    } else if (field.type === 'datalist') {
        const dataSourceType = field.dataSource?.type || 'manual';
        const linkedSchema = field.dataSource?.schema || '';
        const linkedEnum = field.dataSource?.enum || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select id="field-datasource-type-${index}" class="form-control" onchange="updateDataSourceType(${index}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                    <option value="enum" ${dataSourceType === 'enum' ? 'selected' : ''}>枚举</option>
                </select>
            </div>
            <div id="field-datasource-config-${index}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>数据列表配置（格式: value|label，每行一个）</label>
                        <textarea id="field-datalist-${index}" class="form-control" rows="4" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(field.options || [])}</textarea>
                    </div>
                ` : dataSourceType === 'linked' ? `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select id="field-linked-schema-${index}" class="form-control">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的枚举</label>
                        <select id="field-linked-enum-${index}" class="form-control">
                            <option value="">-- 请选择枚举 --</option>
                            ${enums.map(e => `<option value="${e.name}" ${linkedEnum === e.name ? 'selected' : ''}>${e.name}</option>`).join('')}
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
        const linkedEnum = subfield.dataSource?.enum || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select class="form-control subfield-datasource-type" onchange="updateSubfieldDataSourceType(${parentIndex}, ${subIndex}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                    <option value="enum" ${dataSourceType === 'enum' ? 'selected' : ''}>枚举</option>
                </select>
            </div>
            <div class="subfield-datasource-config-${parentIndex}-${subIndex}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>选项列表（每行一个）</label>
                        <textarea class="form-control subfield-options" rows="3" placeholder="选项1&#10;选项2&#10;选项3">${(subfield.options || []).join('\n')}</textarea>
                    </div>
                ` : dataSourceType === 'linked' ? `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select class="form-control subfield-linked-schema">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                ` : `
                    <div class="form-group">
                        <label>关联的枚举</label>
                        <select class="form-control subfield-linked-enum">
                            <option value="">-- 请选择枚举 --</option>
                            ${enums.map(e => `<option value="${e.name}" ${linkedEnum === e.name ? 'selected' : ''}>${e.name}</option>`).join('')}
                        </select>
                    </div>
                `}
            </div>
        `;
    } else if (subfield.type === 'datalist') {
        const dataSourceType = subfield.dataSource?.type || 'manual';
        const linkedSchema = subfield.dataSource?.schema || '';
        const linkedEnum = subfield.dataSource?.enum || '';
        return `
            <div class="form-group">
                <label>数据源</label>
                <select class="form-control subfield-datasource-type" onchange="updateSubfieldDataSourceType(${parentIndex}, ${subIndex}, this.value)">
                    <option value="manual" ${dataSourceType === 'manual' ? 'selected' : ''}>手动输入</option>
                    <option value="linked" ${dataSourceType === 'linked' ? 'selected' : ''}>关联配表</option>
                    <option value="enum" ${dataSourceType === 'enum' ? 'selected' : ''}>枚举</option>
                </select>
            </div>
            <div class="subfield-datasource-config-${parentIndex}-${subIndex}">
                ${dataSourceType === 'manual' ? `
                    <div class="form-group">
                        <label>数据列表配置（格式: value|label，每行一个）</label>
                        <textarea class="form-control subfield-datalist" rows="3" placeholder="value1|标签1&#10;value2|标签2">${formatDatalist(subfield.options || [])}</textarea>
                    </div>
                ` : dataSourceType === 'linked' ? `
                    <div class="form-group">
                        <label>关联的配表</label>
                        <select class="form-control subfield-linked-schema">
                            <option value="">-- 请选择配表 --</option>
                            ${schemas.map(s => `<option value="${s.name}" ${linkedSchema === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                ` : `
                    <div class="form-group">
                        <label>关联的枚举</label>
                        <select class="form-control subfield-linked-enum">
                            <option value="">-- 请选择枚举 --</option>
                            ${enums.map(e => `<option value="${e.name}" ${linkedEnum === e.name ? 'selected' : ''}>${e.name}</option>`).join('')}
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
                } else if (field.dataSource.type === 'linked') {
                    // 关联配表
                    const linkedSchemaSelect = document.getElementById(`field-linked-schema-${index}`);
                    if (linkedSchemaSelect) {
                        field.dataSource.schema = linkedSchemaSelect.value;
                    }
                } else if (field.dataSource.type === 'enum') {
                    // 关联枚举
                    const linkedEnumSelect = document.getElementById(`field-linked-enum-${index}`);
                    if (linkedEnumSelect) {
                        field.dataSource.enum = linkedEnumSelect.value;
                    }
                }
            }
        } else if (field.type === 'entry') {
            const collectedSubfields = collectSubfields(index);
            // 只有当DOM中确实存在子字段元素时才更新,否则保留原有的subfields
            if (collectedSubfields.length > 0 || 
                document.querySelectorAll(`.subfield-item[data-parent="${index}"]`).length > 0) {
                field.subfields = collectedSubfields;
            }
            // 如果DOM中没有子字段元素,保持field.subfields不变(使用currentSchema中已有的)
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
                } else if (dataSourceType === 'enum') {
                    const linkedEnumElement = element.querySelector('.subfield-linked-enum');
                    if (linkedEnumElement) {
                        subfield.dataSource.enum = linkedEnumElement.value;
                    }
                }
            }
        }

        subfields.push(subfield);
    });

    return subfields;
}

// ========== 配表管理 ==========
