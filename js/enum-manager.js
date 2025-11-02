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

    const enumType = currentEnum.type || 'number';

    currentEnum.values.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'enum-value-item';
        
        // 根据枚举类型渲染不同的UI
        if (enumType === 'event') {
            // 事件枚举类型 - 多行布局
            item.innerHTML = `
                <div class="event-enum-item">
                    <div class="event-enum-row">
                        <div class="form-group">
                            <label>事件名</label>
                            <input type="text" class="form-control" value="${escapeHtml(value.key || '')}" 
                                   onchange="updateEnumValue(${index}, 'key', this.value)">
                        </div>
                        <div class="form-group">
                            <label>值</label>
                            <input type="text" class="form-control" value="${escapeHtml(value.value || '')}" 
                                   onchange="updateEnumValue(${index}, 'value', this.value)">
                        </div>
                    </div>
                    <div class="event-enum-row">
                        <div class="form-group">
                            <label>事件说明</label>
                            <textarea class="form-control" rows="2" 
                                      onchange="updateEnumValue(${index}, 'label', this.value)">${escapeHtml(value.label || '')}</textarea>
                        </div>
                    </div>
                    <div class="event-enum-row">
                        <div class="form-group event-params-group">
                            <label>注册参数</label>
                            <div class="event-params-list" id="register-params-${index}">
                                ${renderEventParams(value.registerParams || [], index, 'registerParams')}
                            </div>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="addEventParam(${index}, 'registerParams')">
                                <i class="fas fa-plus"></i> 添加注册参数
                            </button>
                        </div>
                        <div class="form-group event-params-group">
                            <label>回调参数</label>
                            <div class="event-params-list" id="callback-params-${index}">
                                ${renderEventParams(value.callbackParams || [], index, 'callbackParams')}
                            </div>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="addEventParam(${index}, 'callbackParams')">
                                <i class="fas fa-plus"></i> 添加回调参数
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-sm btn-danger btn-delete" onclick="removeEnumValue(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            // 普通枚举类型 - 单行布局
            const valueInputType = enumType === 'string' ? 'text' : 'number';
            const valueOnChange = enumType === 'string' 
                ? `updateEnumValue(${index}, 'value', this.value)` 
                : `updateEnumValue(${index}, 'value', parseInt(this.value))`;
            
            item.innerHTML = `
                <div class="form-group">
                    <label>键名</label>
                    <input type="text" class="form-control" value="${escapeHtml(value.key || '')}" 
                           onchange="updateEnumValue(${index}, 'key', this.value)">
                </div>
                <div class="form-group">
                    <label>值</label>
                    <input type="${valueInputType}" class="form-control" value="${escapeHtml(String(value.value || (enumType === 'string' ? '' : 0)))}" 
                           onchange="${valueOnChange}">
                </div>
                <div class="form-group">
                    <label>注释</label>
                    <input type="text" class="form-control" value="${escapeHtml(value.label || '')}" 
                           onchange="updateEnumValue(${index}, 'label', this.value)">
                </div>
                <button class="btn btn-sm btn-danger btn-delete" onclick="removeEnumValue(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }
        container.appendChild(item);
    });
    
    // 更新预览按钮可见性
    updateEnumPreviewButtonVisibility();
}

// 渲染事件参数列表
function renderEventParams(params, enumIndex, paramType) {
    if (!params || params.length === 0) {
        return '<div class="empty-params">暂无参数</div>';
    }
    
    return params.map((param, paramIndex) => `
        <div class="event-param-item">
            <input type="text" class="form-control param-key" placeholder="参数名" 
                   value="${escapeHtml(param.name || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'name', this.value)">
            <input type="text" class="form-control param-type" placeholder="类型" 
                   value="${escapeHtml(param.type || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'type', this.value)">
            <input type="text" class="form-control param-desc" placeholder="说明" 
                   value="${escapeHtml(param.description || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'description', this.value)">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeEventParam(${enumIndex}, '${paramType}', ${paramIndex})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// 添加事件参数
function addEventParam(enumIndex, paramType) {
    if (!currentEnum.values[enumIndex][paramType]) {
        currentEnum.values[enumIndex][paramType] = [];
    }
    currentEnum.values[enumIndex][paramType].push({
        name: '',
        type: '',
        description: ''
    });
    renderEnumValuesList();
}

// 更新事件参数
function updateEventParam(enumIndex, paramType, paramIndex, field, value) {
    if (currentEnum.values[enumIndex][paramType] && currentEnum.values[enumIndex][paramType][paramIndex]) {
        currentEnum.values[enumIndex][paramType][paramIndex][field] = value;
    }
}

// 删除事件参数
function removeEventParam(enumIndex, paramType, paramIndex) {
    if (currentEnum.values[enumIndex][paramType]) {
        currentEnum.values[enumIndex][paramType].splice(paramIndex, 1);
        renderEnumValuesList();
    }
}

function onEnumTypeChange() {
    const newType = document.getElementById('enum-type-select').value;
    if (currentEnum) {
        currentEnum.type = newType;
        // 重新渲染值列表以应用新的UI
        renderEnumValuesList();
    }
}

function addEnumValue() {
    if (!currentEnum.values) {
        currentEnum.values = [];
    }

    const enumType = currentEnum.type || 'number';
    
    if (enumType === 'event') {
        // 事件类型的枚举值
        currentEnum.values.push({
            key: '',
            value: '',
            label: '',
            registerParams: [],
            callbackParams: []
        });
    } else {
        // 普通枚举值
        currentEnum.values.push({
            key: '',
            value: enumType === 'string' ? '' : 0,
            label: ''
        });
    }

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
    
    let luaCode = `---@namespace ${namespace}\n`;
    luaCode += `---@enum ${enumType === 'event' ? 'Event' : enumName}\n`;
    luaCode += `local ${enumName} = {\n`;
    
    currentEnum.values.forEach((value, index) => {
        const isLast = index === currentEnum.values.length - 1;
        const comma = isLast ? '' : ',';
        
        let valueStr;
        if (enumType === 'string' || enumType === 'event') {
            valueStr = `"${value.value}"`;
        } else if (enumType === 'flag') {
            valueStr = `1 << ${value.value}`;
        } else {
            valueStr = value.value;
        }
        
        if (enumType === 'event') {
            // 事件类型的注释格式
            luaCode += `    ${value.key} = ${valueStr}${comma} --[[\n`;
            if (value.label) {
                luaCode += `    ${value.label}\n`;
            }
            
            // 注册参数
            if (value.registerParams && value.registerParams.length > 0) {
                luaCode += `    注册参数：\n`;
                value.registerParams.forEach(param => {
                    const desc = param.description ? ` ${param.description}` : '';
                    luaCode += `    - ${param.name}: ${param.type}${desc}\n`;
                });
            }
            
            // 回调参数（事件数据）
            if (value.callbackParams && value.callbackParams.length > 0) {
                luaCode += `    事件数据：\n`;
                value.callbackParams.forEach(param => {
                    const desc = param.description ? ` ${param.description}` : '';
                    luaCode += `    - ${param.name}: ${param.type}${desc}\n`;
                });
            }
            
            luaCode += `    ]]\n`;
        } else {
            // 普通枚举的注释格式
            const comment = value.label ? ` --${value.label}` : '';
            luaCode += `    ${value.key} = ${valueStr}${comma}${comment}\n`;
        }
    });
    
    luaCode += `}\n\n`;
    luaCode += `return ${enumName}\n`;

    // 显示模态框
    document.getElementById('enum-lua-code-output').textContent = luaCode;
    document.getElementById('enum-export-lua-modal').classList.add('show');
}

function closeEnumExportModal() {
    document.getElementById('enum-export-lua-modal').classList.remove('show');
}

async function copyEnumLuaCode() {
    const codeElement = document.getElementById('enum-lua-code-output');
    const code = codeElement.textContent;
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 显示复制成功提示
        const btn = document.getElementById('copy-enum-lua-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('复制失败:', error);
        
        // 降级方案
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

function downloadEnumLuaFile() {
    const codeElement = document.getElementById('enum-lua-code-output');
    const code = codeElement.textContent;
    const fileName = currentEnum ? currentEnum.name : 'enum';
    
    // 创建Blob并下载
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.lua`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    // 显示下载成功提示
    const btn = document.getElementById('download-enum-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> 已下载';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
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
    } else if (currentEnum.type === 'event') {
        // 事件类型：显示事件详细信息
        currentEnum.values.forEach(value => {
            const item = document.createElement('div');
            item.className = 'enum-preview-item';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'flex-start';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.gap = '15px';
            headerDiv.style.marginBottom = '10px';
            
            const keyDiv = document.createElement('div');
            keyDiv.className = 'enum-preview-key';
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'enum-preview-value';
            valueDiv.textContent = `"${value.value}"`;
            
            headerDiv.appendChild(keyDiv);
            headerDiv.appendChild(valueDiv);
            item.appendChild(headerDiv);
            
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.style.marginBottom = '8px';
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            if (value.registerParams && value.registerParams.length > 0) {
                const registerTitle = document.createElement('div');
                registerTitle.style.fontWeight = 'bold';
                registerTitle.style.marginTop = '8px';
                registerTitle.style.marginBottom = '4px';
                registerTitle.textContent = '注册参数：';
                item.appendChild(registerTitle);
                
                value.registerParams.forEach(param => {
                    const paramDiv = document.createElement('div');
                    paramDiv.style.marginLeft = '10px';
                    paramDiv.style.fontSize = '13px';
                    paramDiv.textContent = `- ${param.name}: ${param.type}${param.description ? ' ' + param.description : ''}`;
                    item.appendChild(paramDiv);
                });
            }
            
            if (value.callbackParams && value.callbackParams.length > 0) {
                const callbackTitle = document.createElement('div');
                callbackTitle.style.fontWeight = 'bold';
                callbackTitle.style.marginTop = '8px';
                callbackTitle.style.marginBottom = '4px';
                callbackTitle.textContent = '事件数据：';
                item.appendChild(callbackTitle);
                
                value.callbackParams.forEach(param => {
                    const paramDiv = document.createElement('div');
                    paramDiv.style.marginLeft = '10px';
                    paramDiv.style.fontSize = '13px';
                    paramDiv.textContent = `- ${param.name}: ${param.type}${param.description ? ' ' + param.description : ''}`;
                    item.appendChild(paramDiv);
                });
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
