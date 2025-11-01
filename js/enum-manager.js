// ========== 枚举管理 ==========

// 枚举管理状态
let currentEnum = null;
let currentEnumName = '';
let enums = [];
let isEditingEnum = false;

async function loadEnums() {
    try {
        const response = await fetch(`${API.ENUM}?action=list`);
        const result = await response.json();

        if (result.success) {
            enums = result.data;
            renderEnumList();
        } else {
            console.error('加载枚举失败:', result.error);
            alert('加载枚举失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举失败:', error);
        alert('加载枚举失败，请检查网络连接');
    }
}

function renderEnumList() {
    const container = document.getElementById('enum-items');
    container.innerHTML = '';

    enums.forEach(enumData => {
        const item = document.createElement('div');
        item.className = 'schema-item';
        if (currentEnumName === enumData.name) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="schema-item-header">
                <div class="schema-item-info">
                    <h4>${enumData.name}</h4>
                    <p>${enumData.description || '无描述'}</p>
                </div>
            </div>
            <div class="schema-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="editEnum('${enumData.name}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="confirmDeleteEnum('${enumData.name}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        container.appendChild(item);
    });
}

function addNewEnum() {
    currentEnum = {
        name: '',
        description: '',
        namespace: 'Enum',
        type: 'number',
        values: []
    };
    currentEnumName = '';
    isEditingEnum = true;

    // 显示编辑器
    document.getElementById('enum-editor').style.display = 'block';
    document.getElementById('enum-editor-title').textContent = '新建枚举';
    document.getElementById('export-enum-lua-btn').style.display = 'none';
    document.getElementById('preview-enum-btn').style.display = 'none';

    // 清空表单
    document.getElementById('enum-name-input').value = '';
    document.getElementById('enum-desc-input').value = '';
    document.getElementById('enum-namespace-input').value = 'Enum';
    document.getElementById('enum-type-select').value = 'number';
    document.getElementById('enum-values-list').innerHTML = '';

    // 名称输入框只读状态
    document.getElementById('enum-name-input').readOnly = false;
}

async function editEnum(name) {
    try {
        const response = await fetch(`${API.ENUM}?action=get&name=${name}`);
        const result = await response.json();

        if (result.success) {
            currentEnum = result.data;
            currentEnumName = name;
            isEditingEnum = true;

            // 显示编辑器
            document.getElementById('enum-editor').style.display = 'block';
            document.getElementById('enum-editor-title').textContent = '编辑枚举';
            document.getElementById('export-enum-lua-btn').style.display = 'inline-block';

            // 填充表单
            document.getElementById('enum-name-input').value = currentEnum.name;
            document.getElementById('enum-desc-input').value = currentEnum.description || '';
            document.getElementById('enum-namespace-input').value = currentEnum.namespace || 'Enum';
            document.getElementById('enum-type-select').value = currentEnum.type || 'number';

            // 根据类型显示/隐藏预览按钮
            updateEnumPreviewButtonVisibility();

            // 名称输入框只读
            document.getElementById('enum-name-input').readOnly = true;

            // 渲染枚举值列表
            renderEnumValuesList();

            // 更新列表中的选中状态
            renderEnumList();
        } else {
            alert('加载枚举失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举失败:', error);
        alert('加载枚举失败，请检查网络连接');
    }
}

function renderEnumValuesList() {
    const container = document.getElementById('enum-values-list');
    container.innerHTML = '';

    if (!currentEnum.values || currentEnum.values.length === 0) {
        return;
    }

    currentEnum.values.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'enum-value-item';
        item.innerHTML = `
            <div class="form-group">
                <label>键名</label>
                <input type="text" class="form-control" value="${value.key || ''}" 
                       onchange="updateEnumValue(${index}, 'key', this.value)">
            </div>
            <div class="form-group">
                <label>值</label>
                <input type="number" class="form-control" value="${value.value || 0}" 
                       onchange="updateEnumValue(${index}, 'value', parseInt(this.value))">
            </div>
            <div class="form-group">
                <label>注释</label>
                <input type="text" class="form-control" value="${value.label || ''}" 
                       onchange="updateEnumValue(${index}, 'label', this.value)">
            </div>
            <button class="btn btn-sm btn-danger btn-delete" onclick="removeEnumValue(${index})">
                <i class="fas fa-trash"></i>
            </button>
        `;
        container.appendChild(item);
    });
    
    // 更新预览按钮可见性
    updateEnumPreviewButtonVisibility();
}

function addEnumValue() {
    if (!currentEnum.values) {
        currentEnum.values = [];
    }

    currentEnum.values.push({
        key: '',
        value: 0,
        label: ''
    });

    renderEnumValuesList();
}

function updateEnumValue(index, field, value) {
    if (currentEnum.values && currentEnum.values[index]) {
        currentEnum.values[index][field] = value;
    }
}

function removeEnumValue(index) {
    if (currentEnum.values) {
        currentEnum.values.splice(index, 1);
        renderEnumValuesList();
        updateEnumPreviewButtonVisibility();
    }
}

async function saveEnum() {
    // 收集基本信息
    const name = document.getElementById('enum-name-input').value.trim();
    const description = document.getElementById('enum-desc-input').value.trim();
    const namespace = document.getElementById('enum-namespace-input').value.trim();
    const type = document.getElementById('enum-type-select').value;

    // 验证
    if (!name) {
        alert('请输入枚举名称');
        return;
    }

    if (!currentEnum.values || currentEnum.values.length === 0) {
        alert('请至少添加一个枚举值');
        return;
    }

    // 验证枚举值
    for (let i = 0; i < currentEnum.values.length; i++) {
        const value = currentEnum.values[i];
        if (!value.key) {
            alert(`第 ${i + 1} 个枚举值的键名不能为空`);
            return;
        }
    }

    // 构造枚举数据
    const enumData = {
        name,
        description,
        namespace,
        type,
        values: currentEnum.values
    };

    try {
        const action = currentEnumName ? 'update' : 'create';
        const response = await fetch(API.ENUM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action,
                name,
                data: enumData
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(action === 'create' ? '枚举创建成功' : '枚举保存成功');
            currentEnumName = name;
            await loadEnums();
            cancelEnumEdit();
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存枚举失败:', error);
        alert('保存枚举失败，请检查网络连接');
    }
}

function cancelEnumEdit() {
    currentEnum = null;
    currentEnumName = '';
    isEditingEnum = false;
    document.getElementById('enum-editor').style.display = 'none';
    renderEnumList();
}

function confirmDeleteEnum(name) {
    showModal(`确定要删除枚举 "${name}" 吗？`, () => deleteEnum(name));
}

async function deleteEnum(name) {
    try {
        const response = await fetch(API.ENUM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'delete',
                name
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('枚举删除成功');
            if (currentEnumName === name) {
                cancelEnumEdit();
            }
            await loadEnums();
        } else {
            alert('删除失败: ' + result.error);
        }
    } catch (error) {
        console.error('删除枚举失败:', error);
        alert('删除枚举失败，请检查网络连接');
    }
}

function exportEnumToLua() {
    if (!currentEnum) return;

    const namespace = currentEnum.namespace || 'Enum';
    const enumName = currentEnum.name;
    const enumType = currentEnum.type || 'number';
    
    let luaCode = `---@enum ${enumName}\n`;
    luaCode += `local ${enumName} = {\n`;
    
    currentEnum.values.forEach((value, index) => {
        const isLast = index === currentEnum.values.length - 1;
        const comma = isLast ? '' : ',';
        const comment = value.label ? ` --${value.label}` : '';
        
        let valueStr;
        if (enumType === 'string') {
            valueStr = `"${value.value}"`;
        } else if (enumType === 'flag') {
            valueStr = `1 << ${value.value}`;
        } else {
            valueStr = value.value;
        }
        
        luaCode += `    ${value.key} = ${valueStr}${comma}${comment}\n`;
    });
    
    luaCode += `}\n\n`;
    luaCode += `${namespace}.${enumName} = ${enumName}\n`;
    luaCode += `return ${enumName}\n`;

    // 创建临时 textarea 并复制
    const textarea = document.createElement('textarea');
    textarea.value = luaCode;
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        alert('Lua代码已复制到剪贴板');
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制:\n\n' + luaCode);
    }
    
    document.body.removeChild(textarea);
}

// 枚举类型改变时的处理
function onEnumTypeChange() {
    if (currentEnum) {
        currentEnum.type = document.getElementById('enum-type-select').value;
        updateEnumPreviewButtonVisibility();
    }
}

// 更新预览按钮的可见性
function updateEnumPreviewButtonVisibility() {
    const previewBtn = document.getElementById('preview-enum-btn');
    if (currentEnum && currentEnum.type === 'flag' && currentEnum.values && currentEnum.values.length > 0) {
        previewBtn.style.display = 'inline-block';
    } else {
        previewBtn.style.display = 'none';
    }
}

// 预览枚举值（标志类型显示二进制）
function previewEnumValues() {
    if (!currentEnum || !currentEnum.values) return;

    const content = document.getElementById('enum-preview-content');
    content.innerHTML = '';

    if (currentEnum.type === 'flag') {
        // 标志类型：显示二进制表示
        currentEnum.values.forEach(value => {
            const bitValue = 1 << parseInt(value.value);
            const binary = bitValue.toString(2).padStart(32, '0');
            
            const item = document.createElement('div');
            item.className = 'enum-preview-item';
            
            const keyDiv = document.createElement('div');
            keyDiv.className = 'enum-preview-key';
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'enum-preview-value';
            valueDiv.textContent = `1 << ${value.value}`;
            
            const binaryDiv = document.createElement('div');
            binaryDiv.className = 'enum-preview-binary';
            
            // 只显示最后16位
            const binaryStr = binary.slice(-16);
            for (let i = 0; i < binaryStr.length; i++) {
                const bit = document.createElement('span');
                bit.className = binaryStr[i] === '1' ? 'bit-1' : 'bit-0';
                bit.textContent = binaryStr[i];
                binaryDiv.appendChild(bit);
            }
            
            item.appendChild(keyDiv);
            item.appendChild(valueDiv);
            item.appendChild(binaryDiv);
            
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'enum-preview-label';
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            content.appendChild(item);
        });
    } else {
        // 其他类型：简单列表
        currentEnum.values.forEach(value => {
            const item = document.createElement('div');
            item.className = 'enum-preview-item';
            
            const keyDiv = document.createElement('div');
            keyDiv.className = 'enum-preview-key';
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'enum-preview-value';
            if (currentEnum.type === 'string') {
                valueDiv.textContent = `"${value.value}"`;
            } else {
                valueDiv.textContent = value.value;
            }
            
            item.appendChild(keyDiv);
            item.appendChild(valueDiv);
            
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'enum-preview-label';
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            content.appendChild(item);
        });
    }

    document.getElementById('enum-preview-modal').classList.add('show');
}

function closeEnumPreviewModal() {
    document.getElementById('enum-preview-modal').classList.remove('show');
}

// 显示填充枚举对话框
async function showFillFromEnumDialog() {
    if (!currentSchemaName) {
        alert('请先选择一个配表');
        return;
    }

    // 加载枚举列表
    try {
        const response = await fetch(`${API.ENUM}?action=list`);
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('fill-enum-select');
            select.innerHTML = '<option value="">请选择枚举</option>';
            
            result.data.forEach(enumData => {
                const option = document.createElement('option');
                option.value = enumData.name;
                option.textContent = `${enumData.name} (${enumData.description || '无描述'})`;
                select.appendChild(option);
            });

            document.getElementById('fill-enum-modal').classList.add('show');
        } else {
            alert('加载枚举列表失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举列表失败:', error);
        alert('加载枚举列表失败，请检查网络连接');
    }
}

function closeFillEnumModal() {
    document.getElementById('fill-enum-modal').classList.remove('show');
}

// 确认从枚举填充数据
async function confirmFillFromEnum() {
    const enumName = document.getElementById('fill-enum-select').value;
    if (!enumName) {
        alert('请选择一个枚举');
        return;
    }

    try {
        // 获取枚举数据
        const response = await fetch(`${API.ENUM}?action=get&name=${enumName}`);
        const result = await response.json();

        if (!result.success) {
            alert('获取枚举数据失败: ' + result.error);
            return;
        }

        const enumData = result.data;
        if (!enumData.values || enumData.values.length === 0) {
            alert('该枚举没有任何值');
            return;
        }

        // 获取填充选项
        const fillMode = document.getElementById('fill-enum-mode').value;
        const withPrefix = document.getElementById('fill-enum-with-prefix').checked;
        const asRaw = document.getElementById('fill-enum-as-raw').checked;
        
        // 获取已存在的数据行名称集合
        const existingNames = new Set(dataRows.map(row => row.name));
        
        // 只添加不存在的枚举项
        let addedCount = 0;
        enumData.values.forEach(enumValue => {
            // 根据填充模式和选项生成数据行名称
            let rowName;
            const enumValue_str = fillMode === 'key' ? enumValue.key : enumValue.value;
            
            if (withPrefix) {
                // 带前缀：EnumName.Value
                rowName = `${enumData.name}.${enumValue_str}`;
            } else {
                // 不带前缀：Value
                rowName = String(enumValue_str);
            }
            
            // 如果数据行已存在，跳过
            if (existingNames.has(rowName)) {
                return;
            }
            
            const newRowData = {};
            
            // 根据schema初始化字段
            if (currentSchema && currentSchema.fields) {
                currentSchema.fields.forEach(field => {
                    const key = normalizeFieldKey(field.name);
                    if (field.type === 'entry') {
                        newRowData[key] = [];
                    } else {
                        newRowData[key] = getTypedDefaultValue(field.type);
                    }
                });
            }
            
            const newRow = {
                name: rowName,
                data: newRowData
            };
            
            // 如果选择了原始文本，标记name字段
            if (asRaw) {
                newRow.isRaw = true;
            }
            
            dataRows.push(newRow);
            addedCount++;
        });

        // 刷新数据行列表
        renderDataRowsList();
        
        // 如果有新增的数据行，选中第一个新增的
        if (addedCount > 0) {
            const firstNewIndex = dataRows.length - addedCount;
            selectedDataRowIndex = firstNewIndex;
            renderDataRowEditor(firstNewIndex);
        }

        closeFillEnumModal();
        
        if (addedCount > 0) {
            alert(`成功从枚举 "${enumName}" 添加了 ${addedCount} 个新数据行`);
        } else {
            alert(`枚举 "${enumName}" 的所有项都已存在，无需添加`);
        }
    } catch (error) {
        console.error('填充枚举失败:', error);
        alert('填充枚举失败，请检查网络连接');
    }
}
